#!/usr/bin/env lua

--[[
Remove Command Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Implements the remove command functionality for removing UCI
  configuration sections that match those in a target directory.

Features:
  - Safe configuration section removal
  - Service restart integration
  - Dry-run preview support
  - Detailed removal reporting
  - Rollback capability

Usage:
  local RemoveCommand = require('commands.remove_command')
  local cmd = RemoveCommand.new()
  local exit_code = cmd:execute(args, options)
]]

local CommandBase = require("command_base")
local lfs = require("lfs")
local uci = require("uci")

local RemoveCommand = {}
setmetatable(RemoveCommand, {__index = CommandBase})

-- Function: RemoveCommand.new
-- Purpose: Create a new remove command instance
-- Returns: RemoveCommand instance
function RemoveCommand.new()
    local self = CommandBase.new("remove")
    setmetatable(self, {__index = RemoveCommand})
    return self
end

-- Function: show_help
-- Purpose: Display help information for the remove command
function RemoveCommand:show_help()
    print([[
REMOVE COMMAND - Remove UCI configuration sections

USAGE:
  uci-config remove [options] --target <config-name>

DESCRIPTION:
  Removes configuration sections from the system that match those defined
  in the target configuration directory. This is useful for cleaning up
  configurations or undoing previous merges.

OPTIONS:
  --target=<name>        Target configuration name (required)
  --dry-run              Preview what would be removed without making changes
  --no-restart           Skip automatic service restarts
  --rollback-on-failure  Rollback changes if service restart fails (default)
  --verbose              Show detailed removal information
  --quiet                Suppress informational output
  --force                Force removal without confirmation

EXAMPLES:
  # Preview removal of default configurations
  uci-config remove --target default --dry-run --verbose

  # Remove configurations matching default target
  uci-config remove --target default

  # Remove without service restarts
  uci-config remove --target default --no-restart

  # Force removal with detailed output
  uci-config remove --target production_samples --force --verbose

PROCESS:
  1. Loads configurations from ./etc/config/<target>/
  2. Identifies matching sections in system configuration
  3. Creates backup of current system configuration
  4. Removes matching sections from system
  5. Restarts affected services (unless --no-restart)
  6. Rolls back on failure (if --rollback-on-failure)

SAFETY:
  - Always creates backup before removal
  - Supports dry-run mode for preview
  - Service restart with rollback capability
  - Detailed logging of all operations

EXIT CODES:
  0 - Success
  1 - Error occurred
]])
end

-- Function: validate_remove_options
-- Purpose: Validate remove-specific options
-- Parameters:
--   options (table): Parsed command options
-- Returns: boolean, string - validation result and error message
function RemoveCommand:validate_remove_options(options)
    if not options.target then
        return false, "No target specified for remove command"
    end
    
    -- For remove command, we allow non-existent targets (will just report 0 configs)
    -- This makes the command more user-friendly
    return true, nil
end

-- Function: get_configs_to_remove
-- Purpose: Get list of configuration files to process for removal
-- Parameters:
--   target_name (string): Target configuration name
-- Returns: table - List of configuration file names
function RemoveCommand:get_configs_to_remove(target_name)
    local source_dir = "./etc/config/" .. target_name
    local configs = {}
    
    -- Check if directory exists first
    if not self.config_manager:directory_exists(source_dir) then
        -- Directory doesn't exist - this is fine for remove command
        self:log("verbose", "Target directory does not exist: " .. source_dir)
        return {}
    end
    
    local success, err = pcall(function()
        for file in lfs.dir(source_dir) do
            if file ~= "." and file ~= ".." then
                local source_path = source_dir .. "/" .. file
                local attr = lfs.attributes(source_path)
                if attr and attr.mode == "file" then
                    table.insert(configs, file)
                end
            end
        end
    end)
    
    if not success then
        self:log("error", "Error reading target directory: " .. tostring(err))
        return {}
    end
    
    return configs
end

-- Function: load_target_config
-- Purpose: Load configuration from target file
-- Parameters:
--   config_name (string): Name of the configuration
--   source_dir (string): Source directory path
-- Returns: table, boolean - Configuration data and success status
function RemoveCommand:load_target_config(config_name, source_dir)
    local source_path = source_dir .. "/" .. config_name
    
    -- Check if file exists
    if not self.config_manager:file_exists(source_path) then
        return {}, false
    end
    
    -- Load configuration using temporary cursor
    local target_config = {}
    local success, err = pcall(function()
        local temp_cursor = uci.cursor(source_dir)
        target_config = temp_cursor:get_all(config_name) or {}
    end)
    
    if not success then
        self:log("error", "Failed to load target config " .. config_name .. ": " .. tostring(err))
        return {}, false
    end
    
    return target_config, true
end

-- Function: remove_matching_sections
-- Purpose: Remove sections from system config that match target config
-- Parameters:
--   config_name (string): Name of the configuration
--   target_config (table): Target configuration data
--   options (table): Command options
-- Returns: number, table - Number of sections removed and detailed results
function RemoveCommand:remove_matching_sections(config_name, target_config, options)
    local cursor = uci.cursor()
    local removed_sections = 0
    local results = {
        removed = {},
        not_found = {},
        errors = {}
    }
    
    for section_name, section_data in pairs(target_config) do
        -- Check if section exists in system config
        local exists = cursor:get(config_name, section_name)
        if exists then
            if not options["dry-run"] then
                local success, err = pcall(function()
                    cursor:delete(config_name, section_name)
                end)
                
                if success then
                    table.insert(results.removed, section_name)
                    removed_sections = removed_sections + 1
                    self:log("verbose", "  Removed section: " .. section_name)
                else
                    table.insert(results.errors, {
                        section = section_name,
                        error = tostring(err)
                    })
                    self:log("error", "  Failed to remove section " .. section_name .. ": " .. tostring(err))
                end
            else
                table.insert(results.removed, section_name)
                removed_sections = removed_sections + 1
                self:log("verbose", "  Would remove section: " .. section_name)
            end
        else
            table.insert(results.not_found, section_name)
            self:log("verbose", "  Section not found: " .. section_name)
        end
    end
    
    -- Commit changes if not dry-run and no errors
    if not options["dry-run"] and removed_sections > 0 and #results.errors == 0 then
        local success, err = pcall(function()
            cursor:commit(config_name)
        end)
        
        if not success then
            self:log("error", "Failed to commit changes for " .. config_name .. ": " .. tostring(err))
            return 0, results
        end
    end
    
    return removed_sections, results
end

-- Function: perform_removal
-- Purpose: Execute the configuration removal operation
-- Parameters:
--   target_name (string): Target configuration name
--   options (table): Command options
-- Returns: boolean, table, table - success, results, and config list
function RemoveCommand:perform_removal(target_name, options)
    local source_dir = "./etc/config/" .. target_name
    
    self:log("info", "Remove command using target: " .. target_name)
    self:log("info", "Source directory: " .. source_dir)
    
    -- Get list of configs to process
    local configs_to_process = self:get_configs_to_remove(target_name)
    if #configs_to_process == 0 then
        return false, {}, {}, "No configuration files found in target directory"
    end
    
    local total_removed = 0
    local processed_configs = {}
    local results = {}
    
    -- Process each configuration file
    for _, config_name in ipairs(configs_to_process) do
        self:log("verbose", "Processing config: " .. config_name)
        
        -- Load target configuration
        local target_config, load_success = self:load_target_config(config_name, source_dir)
        if not load_success then
            results[config_name] = {
                success = false,
                error = "Failed to load target configuration",
                removed = 0
            }
        else
        
        -- Remove matching sections
        local removed_count, removal_results = self:remove_matching_sections(config_name, target_config, options)
        
        results[config_name] = {
            success = #removal_results.errors == 0,
            removed = removed_count,
            details = removal_results
        }
        
        total_removed = total_removed + removed_count
        
        if removed_count > 0 then
            table.insert(processed_configs, config_name)
            self:log("info", "  " .. config_name .. ": removed " .. removed_count .. " sections")
        else
            self:log("verbose", "  " .. config_name .. ": no matching sections found")
        end
        end  -- Close the else block
    end
    
    -- Summary
    if options["dry-run"] then
        self:log("info", "Would remove " .. total_removed .. " sections from " .. #configs_to_process .. " configurations")
    else
        self:log("info", "Removed " .. total_removed .. " sections from " .. #configs_to_process .. " configurations")
    end
    
    return true, results, processed_configs, nil
end

-- Function: confirm_removal
-- Purpose: Ask for user confirmation before removal
-- Parameters:
--   target_name (string): Target configuration name
--   options (table): Command options
-- Returns: boolean - true if confirmed or forced
function RemoveCommand:confirm_removal(target_name, options)
    if options.force or options["dry-run"] then
        return true
    end
    
    self:log("info", "This will remove configuration sections matching target: " .. target_name)
    self:log("info", "A backup will be created before removal.")
    
    io.write("Continue? [y/N]: ")
    local response = io.read()
    
    return response and (response:lower() == "y" or response:lower() == "yes")
end

-- Function: execute
-- Purpose: Main execution method for remove command
-- Parameters:
--   args (table): Command-line arguments
--   parsed_options (table): Pre-parsed options (optional)
-- Returns: number - Exit code
function RemoveCommand:execute(args, parsed_options)
    -- Parse options if not provided
    local options, target
    if parsed_options then
        options = parsed_options
    else
        options, target = self:parse_options(args, 2)
    end
    
    -- Store options for use by other methods
    self.options = options
    
    -- Validate environment
    local env_valid, env_error = self:validate_environment()
    if not env_valid then
        self:log("error", env_error)
        return 1
    end
    
    -- Validate remove options
    local valid, error_msg = self:validate_remove_options(options)
    if not valid then
        self:log("error", error_msg)
        self:log("error", "Usage: uci-config remove --target <config-name>")
        return 1
    end
    
    -- Show active options
    self:show_dry_run_warning()
    self:show_options_summary()
    
    -- Confirm removal unless dry-run or forced
    if not self:confirm_removal(options.target, options) then
        self:log("info", "Removal cancelled by user")
        return 0
    end
    
    -- Create backup before making changes
    if not options["dry-run"] then
        local backup_success, backup_info = self:create_backup("pre-remove")
        if not backup_success then
            self:log("error", "Failed to create backup: " .. backup_info)
            return 1
        end
    end
    
    -- Perform removal
    local removal_success, results, processed_configs, removal_error = self:perform_removal(options.target, options)
    if not removal_success then
        self:log("error", removal_error or "Removal operation failed")
        return 1
    end
    
    -- Check for any errors in individual configs
    local has_errors = false
    for config_name, result in pairs(results) do
        if not result.success then
            self:log("error", "Removal failed for " .. config_name .. ": " .. (result.error or "unknown error"))
            has_errors = true
        end
    end
    
    if has_errors then
        self:log("error", "Some configurations failed to process")
        return 1
    end
    
    -- Handle service restart
    if not options["dry-run"] and #processed_configs > 0 then
        local restart_success, restart_results = self:handle_service_restart(processed_configs)
        if not restart_success then
            self:log("error", "Service restart failed")
            -- Service manager handles rollback if enabled
            return 1
        end
        
        -- Report service restart results
        if options.verbose then
            for service, result in pairs(restart_results) do
                if result.success then
                    self:log("info", "Service " .. service .. " restarted successfully")
                else
                    self:log("error", "Service " .. service .. " restart failed: " .. 
                             (result.output or "unknown error"))
                end
            end
        end
    end
    
    -- Cleanup
    self:cleanup()
    
    self:log("info", "Removal operation completed successfully")
    return 0
end

return RemoveCommand