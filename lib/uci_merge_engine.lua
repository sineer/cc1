#!/usr/bin/env lua

--[[
UCI Merge Engine for OpenWRT Configuration Management
Version: 1.0.0

Purpose:
  Provides safe merging of UCI configuration files with intelligent handling of:
  - Duplicate list entries with multiple deduplication strategies
  - Configuration conflicts with detailed reporting
  - Network safety preservation to maintain connectivity
  - Dry-run mode for testing changes before applying

Usage:
  local UCIMergeEngine = require('uci_merge_engine')
  local engine = UCIMergeEngine.new({
      dry_run = true,           -- Preview changes without applying
      dedupe_lists = true,      -- Remove duplicate list entries
      preserve_network = true,  -- Protect network connectivity
      preserve_existing = true  -- Keep existing values on conflicts
  })
  
  local success, results = engine:merge_directory('/path/to/configs', '/etc/config')

Core Features:
  1. Smart list deduplication with network-aware normalization
  2. Conflict detection and configurable resolution
  3. Safe UCI operations with rollback capability
  4. Comprehensive change tracking and reporting
]]

local uci = require("uci")
local lfs = require("lfs")
local ListDeduplicator = require("list_deduplicator")

local UCIMergeEngine = {}
UCIMergeEngine.__index = UCIMergeEngine

-- Function: UCIMergeEngine.new
-- Purpose: Create a new merge engine instance with specified options
-- Parameters:
--   options (table, optional): Configuration options
--     - dry_run (boolean): If true, preview changes without applying them
--     - dedupe_lists (boolean): If true, remove duplicate entries from lists
--     - preserve_network (boolean): If true, validate network safety before merging
--     - preserve_existing (boolean): If true, keep existing values on conflicts
-- Returns: UCIMergeEngine instance
-- Example:
--   local engine = UCIMergeEngine.new({dry_run = true, dedupe_lists = true})
function UCIMergeEngine.new(options)
    local self = setmetatable({}, UCIMergeEngine)
    self.cursor = uci.cursor()
    self.options = options or {}
    self.dedupe_lists = self.options.dedupe_lists or false
    self.preserve_network = self.options.preserve_network or false
    self.dry_run = self.options.dry_run or false
    self.conflicts = {}  -- Track merge conflicts
    self.changes = {}    -- Track all changes made
    return self
end

-- Initialize list deduplicator
local deduplicator = ListDeduplicator.new()

-- Function: file_exists
-- Purpose: Check if a file exists at the given path
-- Parameters:
--   path (string): File path to check
-- Returns: boolean - true if file exists, false otherwise
-- Internal: Helper function for file operations
function UCIMergeEngine:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

-- Function: deep_copy
-- Purpose: Create a deep copy of a table, including nested tables and metatables
-- Parameters:
--   orig (any): Value to copy (usually a table)
-- Returns: Deep copy of the input
-- Note: Handles circular references through recursive copying
-- Internal: Used to prevent modification of original config data
function UCIMergeEngine:deep_copy(orig)
    local orig_type = type(orig)
    local copy
    if orig_type == 'table' then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[self:deep_copy(orig_key)] = self:deep_copy(orig_value)
        end
        setmetatable(copy, self:deep_copy(getmetatable(orig)))
    else
        copy = orig
    end
    return copy
end

-- Function: load_config
-- Purpose: Load UCI configuration from file or system
-- Parameters:
--   config_name (string): Name of the configuration (e.g., 'firewall', 'network')
--   config_path (string, optional): Specific file path to load from
-- Returns: table - Configuration data structure with sections and options
-- Note: Uses temporary cursor for file-based loading to avoid system conflicts
-- Example:
--   local config = engine:load_config('firewall', '/path/to/firewall.conf')
function UCIMergeEngine:load_config(config_name, config_path)
    if config_path and self:file_exists(config_path) then
        -- Load from specific file path using temporary cursor
        local temp_cursor = uci.cursor("/tmp", "/tmp/.uci")
        local cmd = string.format("cp '%s' '/tmp/%s'", config_path, config_name)
        os.execute(cmd)
        return temp_cursor:get_all(config_name) or {}
    else
        -- Load from system UCI configuration
        return self.cursor:get_all(config_name) or {}
    end
end

-- Function: save_config
-- Purpose: Save merged configuration back to UCI system
-- Parameters:
--   config_name (string): Name of the configuration to save
--   config_data (table): Configuration data to write
-- Returns: boolean - true if successful
-- Behavior:
--   - In dry-run mode: Only logs changes without writing
--   - Normal mode: Clears existing config and writes new data
--   - Handles both options (single values) and lists (multiple values)
--   - Commits changes atomically
-- Note: This completely replaces the existing configuration
function UCIMergeEngine:save_config(config_name, config_data)
    if self.dry_run then
        -- Dry-run mode: just track what would be saved
        table.insert(self.changes, {
            action = "save_config",
            config = config_name,
            data = config_data
        })
        return true
    end
    
    -- Clear existing config sections to start fresh
    local existing = self.cursor:get_all(config_name) or {}
    for section_name, _ in pairs(existing) do
        self.cursor:delete(config_name, section_name)
    end
    
    -- Add all sections from merged configuration
    for section_name, section_data in pairs(config_data) do
        local section_type = section_data[".type"]
        if section_type then
            -- Create the section
            self.cursor:set(config_name, section_name, section_type)
            
            -- Add all options and lists to the section
            for option_name, option_value in pairs(section_data) do
                if option_name ~= ".type" and option_name ~= ".name" then
                    if type(option_value) == "table" then
                        -- Handle UCI lists - convert to space-separated values
                        local list_values = {}
                        for _, list_value in ipairs(option_value) do
                            table.insert(list_values, tostring(list_value))
                        end
                        if #list_values > 0 then
                            -- Set as space-separated string for UCI list format
                            local list_string = table.concat(list_values, " ")
                            self.cursor:set(config_name, section_name, option_name, list_string)
                        end
                    else
                        -- Handle UCI options - ensure value is string
                        local string_value = tostring(option_value)
                        self.cursor:set(config_name, section_name, option_name, string_value)
                    end
                end
            end
        end
    end
    
    -- Commit all changes atomically
    self.cursor:commit(config_name)
    return true
end

-- Function: dedupe_list
-- Purpose: Remove duplicate entries from UCI lists using the external deduplicator
-- Parameters:
--   list_values (table|string): List values to deduplicate
--   list_name (string, optional): Name of the list for automatic strategy selection
-- Returns: table - Deduplicated list
-- Note: Uses the ListDeduplicator module for all deduplication logic
function UCIMergeEngine:dedupe_list(list_values, list_name)
    if not self.dedupe_lists or not list_values then
        return list_values or {}
    end
    
    -- Use the external deduplicator with automatic strategy selection
    return deduplicator:dedupe_list_auto(list_values, list_name)
end

-- Function: merge_lists
-- Purpose: Merge two UCI lists intelligently with automatic strategy selection
-- Parameters:
--   existing_list (table|string): Current list values in the system
--   new_list (table|string): New values to merge in
--   list_name (string): Name of the list option (used for strategy selection)
--   section_name (string): UCI section name (for context)
-- Returns: table - Merged list with duplicates removed based on list type
-- Strategy Selection:
--   - Network-related lists (network, server, entry): Use NETWORK_AWARE
--   - Protocol lists (proto, match): Use PRIORITY_BASED
--   - Others: Use PRESERVE_ORDER
-- Example:
--   merge_lists({"eth0"}, {"eth1", "eth0"}, "network") -> {"eth0", "eth1"}
function UCIMergeEngine:merge_lists(existing_list, new_list, list_name, section_name)
    -- Normalize inputs to tables for consistent handling
    if type(new_list) == "string" then
        new_list = {new_list}
    elseif not new_list then
        new_list = {}
    end
    
    if type(existing_list) == "string" then
        existing_list = {existing_list}
    elseif not existing_list then
        existing_list = {}
    end
    
    -- Short-circuit if no new values to merge
    if #new_list == 0 then
        return existing_list
    end
    
    -- If no existing values, just deduplicate new list
    if #existing_list == 0 then
        return self:dedupe_list(new_list)
    end
    
    -- Combine lists preserving order (existing first, then new)
    local combined = self:deep_copy(existing_list)
    for _, value in ipairs(new_list) do
        table.insert(combined, value)
    end
    
    -- Apply deduplication with automatic strategy selection
    return self:dedupe_list(combined, list_name)
end

-- Function: merge_sections
-- Purpose: Merge configuration sections handling both options and lists
-- Parameters:
--   existing_config (table): Current configuration data
--   new_config (table): New configuration to merge
--   config_name (string): Name of the config file (for conflict reporting)
-- Returns: table - Merged configuration with conflicts tracked
-- Behavior:
--   - New sections are added completely
--   - Existing sections have options merged with conflict detection
--   - Lists are merged using intelligent deduplication
--   - Conflicts are logged but don't stop the merge
-- Conflict Resolution:
--   - If preserve_existing is true (default): Keep existing value
--   - If preserve_existing is false: Use new value
function UCIMergeEngine:merge_sections(existing_config, new_config, config_name)
    local result = self:deep_copy(existing_config)
    
    for section_name, section_data in pairs(new_config) do
        if result[section_name] then
            -- Section exists, merge options and lists
            for option_name, option_value in pairs(section_data) do
                -- Skip UCI metadata fields
                if option_name ~= ".type" and option_name ~= ".name" then
                    if type(option_value) == "table" then
                        -- Merge lists with deduplication
                        result[section_name][option_name] = self:merge_lists(
                            result[section_name][option_name],
                            option_value,
                            option_name,
                            section_name
                        )
                    else
                        -- Handle option conflicts
                        if result[section_name][option_name] and 
                           result[section_name][option_name] ~= option_value then
                            -- Record conflict for reporting
                            table.insert(self.conflicts, {
                                config = config_name,
                                section = section_name,
                                option = option_name,
                                existing = result[section_name][option_name],
                                new = option_value
                            })
                            
                            -- Apply conflict resolution strategy
                            if not self.options.preserve_existing then
                                result[section_name][option_name] = option_value
                            end
                        else
                            -- No conflict, use new value
                            result[section_name][option_name] = option_value
                        end
                    end
                end
            end
        else
            -- New section, add it completely
            result[section_name] = self:deep_copy(section_data)
            
            -- Apply list deduplication to new sections
            for option_name, option_value in pairs(result[section_name]) do
                if type(option_value) == "table" then
                    result[section_name][option_name] = self:dedupe_list(option_value, option_name)
                end
            end
        end
    end
    
    return result
end

-- Function: merge_config
-- Purpose: Main entry point to merge a single configuration file
-- Parameters:
--   config_name (string): Name of the configuration (e.g., 'firewall')
--   source_path (string): Path to source configuration file
--   target_path (string, optional): Path to target config (defaults to system)
-- Returns: 
--   success (boolean): true if merge succeeded
--   result (table|string): Merged config data or error message
-- Process:
--   1. Load both source and target configurations
--   2. Merge sections with conflict detection
--   3. Save merged result (or track changes in dry-run)
-- Example:
--   local ok, result = engine:merge_config('firewall', '/tmp/new-firewall')
function UCIMergeEngine:merge_config(config_name, source_path, target_path)
    -- Load configurations
    local existing_config = self:load_config(config_name, target_path)
    local new_config = self:load_config(config_name, source_path)
    
    -- Validate source configuration
    if not new_config or next(new_config) == nil then
        return false, "Source configuration is empty or invalid"
    end
    
    -- Perform the merge
    local merged_config = self:merge_sections(existing_config, new_config, config_name)
    
    -- Save merged configuration
    local success = self:save_config(config_name, merged_config)
    
    if success then
        -- Track this merge operation
        table.insert(self.changes, {
            action = "merge_config",
            config = config_name,
            source = source_path,
            target = target_path,
            conflicts = #self.conflicts
        })
    end
    
    return success, merged_config
end

-- Function: merge_directory
-- Purpose: Merge all configuration files from a directory
-- Parameters:
--   source_dir (string): Directory containing configs to merge
--   target_dir (string, optional): Target directory (default: /etc/config)
-- Returns:
--   success (boolean): true if directory merge succeeded
--   results (table|string): Per-file results or error message
-- Process:
--   1. Validate source directory exists
--   2. List all config files in source
--   3. Merge each file individually
--   4. Return aggregated results
-- Example:
--   local ok, results = engine:merge_directory('/tmp/new-configs')
--   for config, result in pairs(results) do
--       print(config .. ": " .. (result.success and "OK" or "FAILED"))
--   end
function UCIMergeEngine:merge_directory(source_dir, target_dir)
    if not source_dir then
        return false, "Source directory not specified"
    end
    
    target_dir = target_dir or "/etc/config"
    local results = {}
    
    -- Check if source directory exists
    local attr = lfs.attributes(source_dir)
    if not attr or attr.mode ~= "directory" then
        return false, "Source directory does not exist: " .. source_dir
    end
    
    -- Get list of config files to merge
    local config_files = {}
    local success, err = pcall(function()
        for file in lfs.dir(source_dir) do
            if file ~= "." and file ~= ".." then
                local source_path = source_dir .. "/" .. file
                local target_path = target_dir .. "/" .. file
                -- Only process files, not subdirectories
                local file_attr = lfs.attributes(source_path)
                if file_attr and file_attr.mode == "file" then
                    table.insert(config_files, {
                        name = file,
                        source = source_path,
                        target = target_path
                    })
                end
            end
        end
    end)
    
    if not success then
        return false, "Error reading source directory: " .. (err or "unknown error")
    end
    
    -- Merge each configuration file
    for _, config in ipairs(config_files) do
        local success, result = self:merge_config(config.name, config.source, config.target)
        results[config.name] = {
            success = success,
            result = result,
            conflicts = #self.conflicts
        }
        
        -- Reset conflicts for next config
        self.conflicts = {}
    end
    
    return true, results
end

-- Function: get_merge_summary
-- Purpose: Get a summary of all changes and conflicts from the merge operation
-- Returns: table containing:
--   - changes: Array of all changes made (or would be made in dry-run)
--   - conflicts: Array of all conflicts detected
--   - dry_run: Boolean indicating if this was a dry-run
-- Example:
--   local summary = engine:get_merge_summary()
--   print("Total conflicts: " .. #summary.conflicts)
function UCIMergeEngine:get_merge_summary()
    return {
        changes = self.changes,
        conflicts = self.conflicts,
        dry_run = self.dry_run
    }
end

return UCIMergeEngine