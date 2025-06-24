#!/usr/bin/env lua

--[[
Command Base Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Provides a base class for all CLI commands with common functionality
  including option parsing, logging, error handling, and service management.

Features:
  - Standardized command interface
  - Common option parsing utilities
  - Unified logging and error handling
  - Service management integration
  - Configuration validation
  - Dry-run mode support

Usage:
  local CommandBase = require('command_base')
  
  local MyCommand = {}
  setmetatable(MyCommand, {__index = CommandBase})
  
  function MyCommand:execute(args, options)
      -- Command implementation
  end
]]

local ServiceManager = require("service_manager")
local ConfigManager = require("config_manager")

local CommandBase = {}
CommandBase.__index = CommandBase

-- Function: CommandBase.new
-- Purpose: Create a new command instance
-- Parameters:
--   command_name (string): Name of the command
--   options (table, optional): Command options
-- Returns: CommandBase instance
function CommandBase.new(command_name, options)
    local self = setmetatable({}, CommandBase)
    self.command_name = command_name or "unknown"
    self.options = options or {}
    
    -- Initialize managers
    self.service_manager = ServiceManager.new(self.options)
    self.config_manager = ConfigManager.new(self.options)
    
    return self
end

-- Function: log
-- Purpose: Unified logging with level-based filtering
-- Parameters:
--   level: "error", "info", or "verbose"
--   message: Message to log
function CommandBase:log(level, message)
    local prefix = self.command_name:upper()
    if level == "error" then
        io.stderr:write(prefix .. " ERROR: " .. message .. "\n")
    elseif level == "info" and not self.options.quiet then
        print(prefix .. " INFO: " .. message)
    elseif level == "verbose" and self.options.verbose then
        print(prefix .. " VERBOSE: " .. message)
    end
end

-- Function: parse_boolean_flags
-- Purpose: Define boolean command-line flags that don't take values
-- Returns: table - Set of boolean flag names
function CommandBase:parse_boolean_flags()
    return {
        ["dry-run"] = true,
        ["preserve-network"] = true,
        ["dedupe-lists"] = true,
        ["quiet"] = true,
        ["verbose"] = true,
        ["force"] = true,
        ["check-network"] = true,
        ["preserve-existing"] = true,
        ["no-restart"] = true,
        ["rollback-on-failure"] = true
    }
end

-- Function: parse_options
-- Purpose: Parse command-line arguments into options table
-- Parameters:
--   args (table): Command-line arguments
--   start_index (number, optional): Index to start parsing from (default: 2)
-- Returns: table, string - Parsed options and target argument
function CommandBase:parse_options(args, start_index)
    start_index = start_index or 2
    local options = {}
    local target = nil
    local boolean_flags = self:parse_boolean_flags()
    
    local i = start_index
    while i <= #args do
        local arg = args[i]
        if arg:match("^%-%-") then
            local key, value = arg:match("^%-%-([^=]+)=?(.*)")
            if value and value ~= "" then
                -- Handle --key=value format
                options[key] = value
            elseif boolean_flags[key] then
                -- Handle boolean flags
                options[key] = true
            elseif i + 1 <= #args and not args[i + 1]:match("^%-%-") then
                -- Handle --key value format for non-boolean options
                options[key] = args[i + 1]
                i = i + 1
            else
                -- Handle --key as boolean flag (fallback)
                options[key] = true
            end
        else
            -- First non-option argument becomes target
            if not target then
                target = arg
            end
        end
        i = i + 1
    end
    
    return options, target
end

-- Function: validate_required_options
-- Purpose: Validate that required options are present
-- Parameters:
--   options (table): Parsed options
--   required (table): List of required option names
-- Returns: boolean, string - validation result and error message
function CommandBase:validate_required_options(options, required)
    for _, option_name in ipairs(required) do
        if not options[option_name] then
            return false, "Required option missing: --" .. option_name
        end
    end
    return true, nil
end

-- Function: validate_target_directory
-- Purpose: Validate that a target directory exists and is accessible
-- Parameters:
--   target_dir (string): Directory path to validate
-- Returns: boolean, string - validation result and error message
function CommandBase:validate_target_directory(target_dir)
    if not target_dir then
        return false, "No target directory specified"
    end
    
    if not self.config_manager:directory_exists(target_dir) then
        return false, "Target directory does not exist: " .. target_dir
    end
    
    return true, nil
end

-- Function: validate_config_files
-- Purpose: Validate configuration files before processing
-- Parameters:
--   config_names (table): List of configuration names
--   source_dir (string, optional): Source directory for validation
-- Returns: boolean, table - validation result and detailed results
function CommandBase:validate_config_files(config_names, source_dir)
    return self.config_manager:validate_config_files(config_names, source_dir)
end

-- Function: show_dry_run_warning
-- Purpose: Display dry-run mode warning
function CommandBase:show_dry_run_warning()
    if self.options["dry-run"] then
        self:log("info", "DRY RUN MODE - No changes will be applied")
    end
end

-- Function: show_options_summary
-- Purpose: Display summary of active options
function CommandBase:show_options_summary()
    local active_options = {}
    
    if self.options["dry-run"] then
        table.insert(active_options, "dry-run (preview mode)")
    end
    
    if self.options["preserve-network"] then
        table.insert(active_options, "preserve-network (network safety)")
    end
    
    if self.options["dedupe-lists"] then
        table.insert(active_options, "dedupe-lists (duplicate removal)")
    end
    
    if self.options["preserve-existing"] then
        table.insert(active_options, "preserve-existing (keep existing values)")
    end
    
    if self.options["no-restart"] then
        table.insert(active_options, "no-restart (skip service restarts)")
    end
    
    if self.options["rollback-on-failure"] then
        table.insert(active_options, "rollback-on-failure (rollback on errors)")
    end
    
    if #active_options > 0 then
        self:log("info", "Active options: " .. table.concat(active_options, ", "))
    end
end

-- Function: handle_service_restart
-- Purpose: Handle service restart after configuration changes
-- Parameters:
--   config_names (table): List of configuration names that were modified
-- Returns: boolean, table - success status and results
function CommandBase:handle_service_restart(config_names)
    if not config_names or #config_names == 0 then
        return true, {}
    end
    
    -- Update service manager options from command options
    self.service_manager.options = self.options
    self.service_manager.dry_run = self.options["dry-run"] or false
    self.service_manager.no_restart = self.options["no-restart"] or false
    self.service_manager.rollback_on_failure = self.options["rollback-on-failure"] or true
    self.service_manager.quiet = self.options.quiet or false
    self.service_manager.verbose = self.options.verbose or false
    
    return self.service_manager:restart_services_for_configs(config_names)
end

-- Function: create_backup
-- Purpose: Create a backup before making changes
-- Parameters:
--   backup_name (string, optional): Custom backup name
-- Returns: boolean, string - success status and backup path or error message
function CommandBase:create_backup(backup_name)
    backup_name = backup_name or (self.command_name .. "-" .. os.date("%Y%m%d-%H%M%S"))
    
    self:log("verbose", "Creating backup: " .. backup_name)
    self.config_manager:create_backup_directory()
    
    local backup_path = self.config_manager.backup_dir .. "/" .. backup_name .. ".tar.gz"
    local cmd = string.format("tar -czf '%s' -C / etc/config", backup_path)
    
    if self.options["dry-run"] then
        self:log("info", "DRY RUN: Would create backup: " .. backup_path)
        return true, backup_path
    end
    
    local result = os.execute(cmd)
    if result == 0 then
        self:log("info", "Backup created: " .. backup_path)
        return true, backup_path
    else
        self:log("error", "Backup creation failed")
        return false, "Backup creation failed"
    end
end

-- Function: get_execution_summary
-- Purpose: Get summary of command execution
-- Returns: table - Execution summary with timing and results
function CommandBase:get_execution_summary()
    local service_summary = self.service_manager:get_operation_summary()
    
    return {
        command = self.command_name,
        options = self.options,
        dry_run = self.options["dry-run"] or false,
        service_operations = service_summary,
        timestamp = os.time()
    }
end

-- Function: execute
-- Purpose: Main execution method - to be overridden by subclasses
-- Parameters:
--   args (table): Command-line arguments
--   options (table): Parsed options
-- Returns: number - Exit code (0 for success, non-zero for error)
function CommandBase:execute(args, options)
    error("execute() method must be implemented by subclass")
end

-- Function: show_help
-- Purpose: Show help information for the command - to be overridden by subclasses
function CommandBase:show_help()
    print("Help not implemented for command: " .. self.command_name)
end

-- Function: validate_environment
-- Purpose: Validate that the environment is ready for command execution
-- Returns: boolean, string - validation result and error message
function CommandBase:validate_environment()
    -- Check if UCI is available
    local uci = require("uci")
    if not uci then
        return false, "UCI library not available"
    end
    
    -- Check if system config directory exists
    if not self.config_manager:directory_exists(self.config_manager.config_dir) then
        return false, "System config directory not found: " .. self.config_manager.config_dir
    end
    
    -- Check if running as root for system modifications
    if not self.options["dry-run"] then
        local user = os.getenv("USER") or os.getenv("LOGNAME") or "unknown"
        if user ~= "root" then
            self:log("verbose", "Running as non-root user: " .. user)
            self:log("verbose", "Some operations may require root privileges")
        end
    end
    
    return true, nil
end

-- Function: cleanup
-- Purpose: Cleanup resources and temporary files
function CommandBase:cleanup()
    -- Clean up temporary UCI files
    os.execute("rm -f /tmp/*.uci-* 2>/dev/null")
    
    -- Cleanup old backups
    self.config_manager:cleanup_old_backups()
end

return CommandBase