#!/usr/bin/env lua

--[[
Service Manager Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Manages service restarts after UCI configuration changes to ensure
  that OpenWRT services are properly reloaded with new configurations.

Features:
  - Configuration-to-service mapping
  - Service dependency management  
  - Rollback capability on service failures
  - Service status validation
  - Safe restart ordering

Usage:
  local ServiceManager = require('service_manager')
  local manager = ServiceManager.new({
      dry_run = false,
      no_restart = false,
      rollback_on_failure = true
  })
  
  local success, results = manager:restart_services_for_configs({"firewall", "network"})
]]

local Logger = require("logger")

local ServiceManager = {}
ServiceManager.__index = ServiceManager

-- Function: ServiceManager.new
-- Purpose: Create a new service manager instance with specified options
-- Parameters:
--   options (table, optional): Configuration options
--     - dry_run (boolean): If true, preview service actions without executing
--     - no_restart (boolean): If true, skip all service restarts
--     - rollback_on_failure (boolean): If true, rollback on service failures
--     - quiet (boolean): If true, suppress informational output
--     - verbose (boolean): If true, show detailed service operation info
-- Returns: ServiceManager instance
function ServiceManager.new(options)
    local self = setmetatable({}, ServiceManager)
    self.options = options or {}
    self.dry_run = self.options.dry_run or false
    self.no_restart = self.options.no_restart or false
    self.rollback_on_failure = self.options.rollback_on_failure or true
    self.quiet = self.options.quiet or false
    self.verbose = self.options.verbose or false
    
    -- Track service operations for rollback
    self.service_operations = {}
    self.rollback_stack = {}
    
    -- Initialize logger
    self.logger = Logger.new({
        module_name = "SERVICE",
        quiet = self.quiet,
        verbose = self.verbose
    })
    
    return self
end


-- Function: get_config_service_mapping
-- Purpose: Get the mapping of UCI configuration files to init.d services
-- Returns: table - Configuration name to service mapping
-- Note: This mapping defines which services need to be restarted when
--       specific configuration files are modified
function ServiceManager:get_config_service_mapping()
    return {
        -- Core network services
        network = "network",
        dhcp = "dnsmasq",
        firewall = "firewall",
        
        -- Web services
        uhttpd = "uhttpd",
        
        -- Custom services
        uspot = "uspot",
        
        -- System services that may need restart
        system = "system",
        wireless = "network",  -- Wireless config affects network service
        
        -- Additional common services
        openvpn = "openvpn",
        dropbear = "dropbear"
    }
end

-- Function: get_service_dependencies
-- Purpose: Get service dependency order for proper restart sequencing
-- Returns: table - Service dependencies and restart order
-- Note: Services are restarted in dependency order to prevent conflicts
function ServiceManager:get_service_dependencies()
    return {
        -- Core dependencies: network must be restarted before dependent services
        network = {},  -- No dependencies, restart first
        firewall = {"network"},  -- Firewall depends on network
        dnsmasq = {"network"},   -- DHCP depends on network
        uhttpd = {"network"},    -- Web server depends on network
        uspot = {"network", "firewall", "dnsmasq"},  -- Captive portal depends on all
        
        -- System services
        system = {},
        dropbear = {"network"},
        openvpn = {"network", "firewall"}
    }
end

-- Function: execute_command
-- Purpose: Execute a system command with proper error handling
-- Parameters:
--   command (string): Command to execute
--   description (string): Description for logging
-- Returns: boolean, string - success status and output
function ServiceManager:execute_command(command, description)
    self.logger:verbose("Executing: " .. command)
    
    if self.dry_run then
        self.logger:info("DRY RUN: Would execute - " .. description)
        return true, "DRY RUN: " .. command
    end
    
    local handle = io.popen(command .. " 2>&1")
    if not handle then
        return false, "Failed to execute command: " .. command
    end
    
    local output = handle:read("*a") or ""
    local success = handle:close()
    
    if not success then
        self.logger:error(description .. " failed: " .. output)
        return false, output
    end
    
    self.logger:verbose(description .. " succeeded: " .. output)
    return true, output
end

-- Function: is_service_available
-- Purpose: Check if a service is available on the system
-- Parameters:
--   service_name (string): Name of the service to check
-- Returns: boolean - true if service exists
function ServiceManager:is_service_available(service_name)
    local init_script = "/etc/init.d/" .. service_name
    local f = io.open(init_script, "r")
    if f then
        f:close()
        return true
    end
    return false
end

-- Function: get_service_status
-- Purpose: Get the current status of a service
-- Parameters:
--   service_name (string): Name of the service
-- Returns: string - "running", "stopped", or "unknown"
function ServiceManager:get_service_status(service_name)
    if not self:is_service_available(service_name) then
        return "unavailable"
    end
    
    local command = "/etc/init.d/" .. service_name .. " status"
    local success, output = self:execute_command(command, "Check status of " .. service_name)
    
    if success then
        -- Different services may have different status output formats
        if output:match("running") or output:match("active") then
            return "running"
        elseif output:match("stopped") or output:match("inactive") then
            return "stopped"
        end
    end
    
    return "unknown"
end

-- Function: restart_service
-- Purpose: Restart a specific service with error handling
-- Parameters:
--   service_name (string): Name of the service to restart
-- Returns: boolean, string - success status and output
function ServiceManager:restart_service(service_name)
    if not self:is_service_available(service_name) then
        self.logger:verbose("Service " .. service_name .. " not available, skipping")
        return true, "Service not available"
    end
    
    -- Record the original service status for rollback
    local original_status = self:get_service_status(service_name)
    
    local command = "/etc/init.d/" .. service_name .. " restart"
    local success, output = self:execute_command(command, "Restart " .. service_name)
    
    if success then
        -- Record successful operation for potential rollback
        table.insert(self.service_operations, {
            service = service_name,
            action = "restart",
            original_status = original_status,
            timestamp = os.time()
        })
        
        self.logger:info("Successfully restarted " .. service_name)
        return true, output
    else
        self.logger:error("Failed to restart " .. service_name .. ": " .. output)
        return false, output
    end
end

-- Function: resolve_restart_order
-- Purpose: Determine the correct order to restart services based on dependencies
-- Parameters:
--   services (table): List of service names to restart
-- Returns: table - Ordered list of services for restart
function ServiceManager:resolve_restart_order(services)
    local dependencies = self:get_service_dependencies()
    local ordered = {}
    local visited = {}
    local visiting = {}
    
    -- Depth-first search to resolve dependencies
    local function visit(service)
        if visiting[service] then
            self.logger:error("Circular dependency detected involving " .. service)
            return false
        end
        
        if visited[service] then
            return true
        end
        
        visiting[service] = true
        
        -- Visit dependencies first
        local deps = dependencies[service] or {}
        for _, dep in ipairs(deps) do
            -- Only process dependencies that are in our services list
            local dep_in_list = false
            for _, s in ipairs(services) do
                if s == dep then
                    dep_in_list = true
                    break
                end
            end
            
            if dep_in_list and not visit(dep) then
                return false
            end
        end
        
        visiting[service] = false
        visited[service] = true
        table.insert(ordered, service)
        return true
    end
    
    -- Visit all services
    for _, service in ipairs(services) do
        if not visited[service] then
            if not visit(service) then
                -- Fallback to original order on circular dependency
                self.logger:error("Using fallback restart order due to dependency issues")
                return services
            end
        end
    end
    
    return ordered
end

-- Function: restart_services_for_configs
-- Purpose: Restart all services associated with modified configuration files
-- Parameters:
--   config_names (table): List of configuration file names that were modified
-- Returns: boolean, table - overall success and detailed results per service
function ServiceManager:restart_services_for_configs(config_names)
    if self.no_restart then
        self.logger:info("Service restart disabled via --no-restart option")
        return true, {}
    end
    
    if not config_names or #config_names == 0 then
        self.logger:verbose("No configuration files specified, no services to restart")
        return true, {}
    end
    
    local mapping = self:get_config_service_mapping()
    local services_to_restart = {}
    local services_set = {}  -- Use set to avoid duplicates
    
    -- Determine which services need to be restarted
    for _, config_name in ipairs(config_names) do
        local service = mapping[config_name]
        if service and not services_set[service] then
            table.insert(services_to_restart, service)
            services_set[service] = true
            self.logger:verbose("Config " .. config_name .. " requires restart of " .. service)
        else
        self.logger:verbose("No service restart required for config: " .. config_name)
        end
    end
    
    if #services_to_restart == 0 then
        self.logger:info("No services require restart")
        return true, {}
    end
    
    -- Resolve restart order based on dependencies
    local ordered_services = self:resolve_restart_order(services_to_restart)
    
    self.logger:info("Restarting services in order: " .. table.concat(ordered_services, ", "))
    
    -- Restart services in dependency order
    local results = {}
    local overall_success = true
    
    for _, service in ipairs(ordered_services) do
        local success, output = self:restart_service(service)
        results[service] = {
            success = success,
            output = output
        }
        
        if not success then
            overall_success = false
            
            if self.rollback_on_failure then
                self.logger:error("Service restart failed, initiating rollback")
                self:rollback_service_operations()
                break
            end
        end
    end
    
    return overall_success, results
end

-- Function: rollback_service_operations
-- Purpose: Rollback service operations in case of failure
-- Note: This attempts to restore services to their previous state
function ServiceManager:rollback_service_operations()
    if #self.service_operations == 0 then
        self.logger:verbose("No service operations to rollback")
        return
    end
    
    self.logger:info("Rolling back " .. #self.service_operations .. " service operations")
    
    -- Rollback in reverse order
    for i = #self.service_operations, 1, -1 do
        local op = self.service_operations[i]
        self.logger:verbose("Rolling back " .. op.action .. " on " .. op.service)
        
        if op.original_status == "running" then
            -- Service was running, ensure it's started
            self:execute_command("/etc/init.d/" .. op.service .. " start", 
                               "Rollback start " .. op.service)
        elseif op.original_status == "stopped" then
            -- Service was stopped, ensure it's stopped
            self:execute_command("/etc/init.d/" .. op.service .. " stop", 
                               "Rollback stop " .. op.service)
        end
    end
    
    -- Clear operations after rollback
    self.service_operations = {}
end

-- Function: get_operation_summary
-- Purpose: Get a summary of all service operations performed
-- Returns: table - Summary of operations and their results
function ServiceManager:get_operation_summary()
    return {
        operations = self.service_operations,
        total_operations = #self.service_operations,
        dry_run = self.dry_run,
        no_restart = self.no_restart
    }
end

return ServiceManager