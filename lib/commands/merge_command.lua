#!/usr/bin/env lua

--[[
Merge Command Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Implements the merge command functionality for safely merging UCI 
  configuration files with service restart support.

Features:
  - Safe configuration merging with conflict detection
  - Service restart integration  
  - Network safety validation
  - List deduplication
  - Comprehensive error handling and rollback

Usage:
  local MergeCommand = require('commands.merge_command')
  local cmd = MergeCommand.new()
  local exit_code = cmd:execute(args, options)
]]

local CommandBase = require("command_base")
local UCIMergeEngine = require("uci_merge_engine")

local MergeCommand = {}
setmetatable(MergeCommand, {__index = CommandBase})

-- Function: MergeCommand.new
-- Purpose: Create a new merge command instance
-- Returns: MergeCommand instance
function MergeCommand.new()
    local self = CommandBase.new("merge")
    setmetatable(self, {__index = MergeCommand})
    return self
end

-- Function: show_help
-- Purpose: Display help information for the merge command
function MergeCommand:show_help()
    print([[
MERGE COMMAND - Merge UCI configurations with existing system config

USAGE:
  uci-config merge [options] <source-directory>

DESCRIPTION:
  Safely merges UCI configuration files from a source directory into the
  system configuration (/etc/config), with intelligent conflict resolution,
  list deduplication, and automatic service restart.

OPTIONS:
  --dry-run               Preview changes without applying them
  --preserve-network      Ensure network connectivity is preserved  
  --dedupe-lists          Remove duplicate entries from UCI lists
  --preserve-existing     Keep existing values when conflicts occur (default)
  --no-restart            Skip automatic service restarts
  --rollback-on-failure   Rollback changes if service restart fails (default)
  --verbose               Show detailed operation information
  --quiet                 Suppress informational output
  --force                 Force operation without confirmation

EXAMPLES:
  # Preview merge with detailed output
  uci-config merge --dry-run --verbose /path/to/configs

  # Safe merge with all safety features
  uci-config merge --preserve-network --dedupe-lists /path/to/configs
  
  # Merge without service restarts
  uci-config merge --no-restart /path/to/configs

  # Force merge with rollback protection
  uci-config merge --force --rollback-on-failure /path/to/configs

PROCESS:
  1. Validates source directory and configuration files
  2. Creates backup of current system configuration
  3. Merges configurations with conflict detection
  4. Restarts affected services (unless --no-restart)
  5. Rolls back on failure (if --rollback-on-failure)

EXIT CODES:
  0 - Success
  1 - Error occurred
]])
end

-- Function: validate_merge_options
-- Purpose: Validate merge-specific options
-- Parameters:
--   options (table): Parsed command options
--   target (string): Target directory argument
-- Returns: boolean, string - validation result and error message
function MergeCommand:validate_merge_options(options, target)
    if not target then
        return false, "No source directory specified for merge"
    end
    
    local valid, error_msg = self:validate_target_directory(target)
    if not valid then
        return false, error_msg
    end
    
    return true, nil
end

-- Function: get_configs_to_merge
-- Purpose: Get list of configuration files to merge from source directory
-- Parameters:
--   source_dir (string): Source directory path
-- Returns: table - List of configuration file names
function MergeCommand:get_configs_to_merge(source_dir)
    local configs = {}
    local lfs = require("lfs")
    
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
        self:log("error", "Error reading source directory: " .. tostring(err))
        return {}
    end
    
    return configs
end

-- Function: perform_merge
-- Purpose: Execute the configuration merge operation
-- Parameters:
--   source_dir (string): Source directory for configurations
--   options (table): Merge options
-- Returns: boolean, table, table - success, results, and config list
function MergeCommand:perform_merge(source_dir, options)
    self:log("info", "Starting UCI configuration merge from: " .. source_dir)
    
    -- Get list of configs to merge
    local configs_to_merge = self:get_configs_to_merge(source_dir)
    if #configs_to_merge == 0 then
        return false, {}, {}, "No configuration files found in source directory"
    end
    
    -- Validate configuration files
    local valid, validation_results = self:validate_config_files(configs_to_merge, source_dir)
    if not valid then
        self:log("error", "Configuration validation failed")
        for config, result in pairs(validation_results) do
            if not result.success then
                self:log("error", "  " .. config .. ": " .. result.message)
            end
        end
        return false, {}, configs_to_merge, "Configuration validation failed"
    end
    
    -- Initialize merge engine with options
    local merge_engine = UCIMergeEngine.new({
        dry_run = options["dry-run"] or false,
        dedupe_lists = options["dedupe-lists"] or false,
        preserve_network = options["preserve-network"] or false,
        preserve_existing = options["preserve-existing"] ~= false  -- Default to true
    })
    
    -- Perform merge
    local merge_success, results = merge_engine:merge_directory(source_dir, "/etc/config")
    
    if not merge_success then
        return false, {}, configs_to_merge, "Merge failed: " .. tostring(results)
    end
    
    -- Get merge summary
    local summary = merge_engine:get_merge_summary()
    
    -- Display results
    if options.verbose then
        self:log("info", "Merge completed successfully")
        for config_name, result in pairs(results) do
            if result.success then
                self:log("info", "  " .. config_name .. ": merged successfully")
                if result.conflicts > 0 then
                    self:log("info", "    " .. result.conflicts .. " conflicts detected")
                end
            else
                self:log("error", "  " .. config_name .. ": merge failed")
            end
        end
    end
    
    -- Report conflicts
    if #summary.conflicts > 0 then
        self:log("info", "Total conflicts detected: " .. #summary.conflicts)
        for _, conflict in ipairs(summary.conflicts) do
            self:log("verbose", "  Conflict in " .. conflict.config .. "." .. 
                     conflict.section .. "." .. conflict.option)
            self:log("verbose", "    Existing: " .. tostring(conflict.existing))
            self:log("verbose", "    New: " .. tostring(conflict.new))
        end
    end
    
    -- Report changes
    if options["dry-run"] then
        self:log("info", "Changes that would be made: " .. #summary.changes)
        for _, change in ipairs(summary.changes) do
            self:log("verbose", "  " .. change.action .. ": " .. (change.config or "unknown"))
        end
    else
        self:log("info", "Applied " .. #summary.changes .. " changes")
    end
    
    return true, results, configs_to_merge, nil
end

-- Function: execute
-- Purpose: Main execution method for merge command
-- Parameters:
--   args (table): Command-line arguments
--   parsed_options (table): Pre-parsed options (optional)
-- Returns: number - Exit code
function MergeCommand:execute(args, parsed_options)
    -- Parse options if not provided
    local options, target
    if parsed_options then
        options = parsed_options
        target = options.target
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
    
    -- Validate merge options
    local valid, error_msg = self:validate_merge_options(options, target)
    if not valid then
        self:log("error", error_msg)
        self:log("error", "Usage: uci-config merge [options] <source-directory>")
        return 1
    end
    
    -- Show active options
    self:show_dry_run_warning()
    self:show_options_summary()
    
    -- Create backup before making changes
    if not options["dry-run"] then
        local backup_success, backup_info = self:create_backup("pre-merge")
        if not backup_success then
            self:log("error", "Failed to create backup: " .. backup_info)
            return 1
        end
    end
    
    -- Perform the merge
    local merge_success, results, configs_merged, merge_error = self:perform_merge(target, options)
    if not merge_success then
        self:log("error", merge_error or "Merge operation failed")
        return 1
    end
    
    -- Handle service restart
    if not options["dry-run"] and #configs_merged > 0 then
        local restart_success, restart_results = self:handle_service_restart(configs_merged)
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
    
    self:log("info", "Merge operation completed successfully")
    return 0
end

return MergeCommand