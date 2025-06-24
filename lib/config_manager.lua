#!/usr/bin/env lua

--[[
Configuration Manager Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Provides centralized configuration management, validation, and utilities
  for working with UCI configuration files and their associated services.

Features:
  - Configuration file validation
  - Service availability checking
  - Configuration metadata management
  - Path resolution and file operations
  - Configuration template management

Usage:
  local ConfigManager = require('config_manager')
  local manager = ConfigManager.new({
      config_dir = "/etc/config",
      template_dir = "./etc/config"
  })
  
  local valid, errors = manager:validate_config_files({"firewall", "network"})
]]

local lfs = require("lfs")
local uci = require("uci")

local ConfigManager = {}
ConfigManager.__index = ConfigManager

-- Function: ConfigManager.new
-- Purpose: Create a new configuration manager instance
-- Parameters:
--   options (table, optional): Configuration options
--     - config_dir (string): System UCI config directory (default: /etc/config)
--     - template_dir (string): Template config directory (default: ./etc/config)
--     - backup_dir (string): Backup directory (default: /tmp/uci-config-backups)
--     - quiet (boolean): Suppress informational output
--     - verbose (boolean): Show detailed operation info
-- Returns: ConfigManager instance
function ConfigManager.new(options)
    local self = setmetatable({}, ConfigManager)
    self.options = options or {}
    self.config_dir = self.options.config_dir or "/etc/config"
    self.template_dir = self.options.template_dir or "./etc/config"
    self.backup_dir = self.options.backup_dir or "/tmp/uci-config-backups"
    self.quiet = self.options.quiet or false
    self.verbose = self.options.verbose or false
    
    -- Initialize UCI cursor
    self.cursor = uci.cursor()
    
    return self
end

-- Function: log
-- Purpose: Unified logging with level-based filtering
-- Parameters:
--   level: "error", "info", or "verbose"
--   message: Message to log
local function log(self, level, message)
    if level == "error" then
        io.stderr:write("CONFIG ERROR: " .. message .. "\n")
    elseif level == "info" and not self.quiet then
        print("CONFIG INFO: " .. message)
    elseif level == "verbose" and self.verbose then
        print("CONFIG VERBOSE: " .. message)
    end
end

-- Function: file_exists
-- Purpose: Check if a file exists at the given path
-- Parameters:
--   path (string): File path to check
-- Returns: boolean - true if file exists
function ConfigManager:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

-- Function: directory_exists
-- Purpose: Check if a directory exists at the given path
-- Parameters:
--   path (string): Directory path to check
-- Returns: boolean - true if directory exists
function ConfigManager:directory_exists(path)
    local attr = lfs.attributes(path)
    return attr and attr.mode == "directory"
end

-- Function: get_config_file_path
-- Purpose: Get the full path to a configuration file
-- Parameters:
--   config_name (string): Name of the configuration
--   config_dir (string, optional): Configuration directory (defaults to system config dir)
-- Returns: string - Full path to configuration file
function ConfigManager:get_config_file_path(config_name, config_dir)
    config_dir = config_dir or self.config_dir
    return config_dir .. "/" .. config_name
end

-- Function: get_template_configs
-- Purpose: Get list of available template configurations
-- Parameters:
--   template_name (string, optional): Specific template directory (e.g., "default", "production_samples")
-- Returns: table - List of available template configuration names
function ConfigManager:get_template_configs(template_name)
    template_name = template_name or "default"
    local template_path = self.template_dir .. "/" .. template_name
    
    if not self:directory_exists(template_path) then
        log(self, "error", "Template directory does not exist: " .. template_path)
        return {}
    end
    
    local configs = {}
    local success, err = pcall(function()
        for file in lfs.dir(template_path) do
            if file ~= "." and file ~= ".." then
                local file_path = template_path .. "/" .. file
                local attr = lfs.attributes(file_path)
                if attr and attr.mode == "file" then
                    table.insert(configs, file)
                end
            end
        end
    end)
    
    if not success then
        log(self, "error", "Error reading template directory: " .. tostring(err))
        return {}
    end
    
    return configs
end

-- Function: get_system_configs
-- Purpose: Get list of configuration files in the system config directory
-- Returns: table - List of system configuration file names
function ConfigManager:get_system_configs()
    if not self:directory_exists(self.config_dir) then
        log(self, "error", "System config directory does not exist: " .. self.config_dir)
        return {}
    end
    
    local configs = {}
    local success, err = pcall(function()
        for file in lfs.dir(self.config_dir) do
            if file ~= "." and file ~= ".." then
                local file_path = self.config_dir .. "/" .. file
                local attr = lfs.attributes(file_path)
                if attr and attr.mode == "file" then
                    table.insert(configs, file)
                end
            end
        end
    end)
    
    if not success then
        log(self, "error", "Error reading system config directory: " .. tostring(err))
        return {}
    end
    
    return configs
end

-- Function: validate_config_syntax
-- Purpose: Validate UCI configuration file syntax
-- Parameters:
--   config_name (string): Name of the configuration to validate
--   config_path (string, optional): Specific path to config file
-- Returns: boolean, string - validation result and error message if any
function ConfigManager:validate_config_syntax(config_name, config_path)
    local path = config_path or self:get_config_file_path(config_name)
    
    if not self:file_exists(path) then
        return false, "Configuration file does not exist: " .. path
    end
    
    -- Try to parse the configuration file
    local success, err = pcall(function()
        if config_path then
            -- For non-system configs, use temporary cursor
            local temp_cursor = uci.cursor("/tmp", "/tmp/.uci")
            local cmd = string.format("cp '%s' '/tmp/%s'", config_path, config_name)
            os.execute(cmd)
            temp_cursor:get_all(config_name)
        else
            -- For system configs, use main cursor
            self.cursor:get_all(config_name)
        end
    end)
    
    if not success then
        return false, "Invalid UCI syntax: " .. tostring(err)
    end
    
    return true, "Configuration syntax is valid"
end

-- Function: validate_config_files
-- Purpose: Validate multiple configuration files
-- Parameters:
--   config_names (table): List of configuration names to validate
--   source_dir (string, optional): Source directory for configurations
-- Returns: boolean, table - overall success and detailed results per file
function ConfigManager:validate_config_files(config_names, source_dir)
    if not config_names or #config_names == 0 then
        return true, {}
    end
    
    local overall_success = true
    local results = {}
    
    for _, config_name in ipairs(config_names) do
        local config_path = nil
        if source_dir then
            config_path = source_dir .. "/" .. config_name
        end
        
        local success, message = self:validate_config_syntax(config_name, config_path)
        results[config_name] = {
            success = success,
            message = message,
            path = config_path or self:get_config_file_path(config_name)
        }
        
        if not success then
            overall_success = false
            log(self, "error", "Validation failed for " .. config_name .. ": " .. message)
        else
            log(self, "verbose", "Validation passed for " .. config_name)
        end
    end
    
    return overall_success, results
end

-- Function: get_config_metadata
-- Purpose: Extract metadata information from configuration files
-- Parameters:
--   config_name (string): Name of the configuration
--   config_path (string, optional): Specific path to config file
-- Returns: table - Configuration metadata
function ConfigManager:get_config_metadata(config_name, config_path)
    local path = config_path or self:get_config_file_path(config_name)
    local metadata = {
        name = config_name,
        path = path,
        exists = self:file_exists(path),
        size = 0,
        sections = {},
        section_count = 0
    }
    
    if not metadata.exists then
        return metadata
    end
    
    -- Get file size
    local attr = lfs.attributes(path)
    if attr then
        metadata.size = attr.size
        metadata.modified = attr.modification
    end
    
    -- Extract UCI sections information
    local success, config_data = pcall(function()
        if config_path then
            -- For non-system configs, use temporary cursor
            local temp_cursor = uci.cursor("/tmp", "/tmp/.uci")
            local cmd = string.format("cp '%s' '/tmp/%s'", config_path, config_name)
            os.execute(cmd)
            return temp_cursor:get_all(config_name) or {}
        else
            return self.cursor:get_all(config_name) or {}
        end
    end)
    
    if success and config_data then
        for section_name, section_data in pairs(config_data) do
            local section_info = {
                name = section_name,
                type = section_data[".type"],
                options = {}
            }
            
            for key, value in pairs(section_data) do
                if key ~= ".type" and key ~= ".name" then
                    section_info.options[key] = {
                        value = value,
                        is_list = type(value) == "table"
                    }
                end
            end
            
            metadata.sections[section_name] = section_info
            metadata.section_count = metadata.section_count + 1
        end
    end
    
    return metadata
end

-- Function: compare_config_files
-- Purpose: Compare two configuration files and identify differences
-- Parameters:
--   config_name (string): Name of the configuration
--   source_path (string): Path to source configuration
--   target_path (string, optional): Path to target configuration (defaults to system)
-- Returns: table - Comparison results with differences
function ConfigManager:compare_config_files(config_name, source_path, target_path)
    target_path = target_path or self:get_config_file_path(config_name)
    
    local source_meta = self:get_config_metadata(config_name .. "_source", source_path)
    local target_meta = self:get_config_metadata(config_name, target_path)
    
    local comparison = {
        source = source_meta,
        target = target_meta,
        differences = {
            new_sections = {},
            modified_sections = {},
            missing_sections = {}
        }
    }
    
    -- Find new and modified sections
    for section_name, source_section in pairs(source_meta.sections) do
        if not target_meta.sections[section_name] then
            -- New section
            table.insert(comparison.differences.new_sections, section_name)
        else
            -- Check for modifications
            local target_section = target_meta.sections[section_name]
            local modified = false
            
            for option, option_data in pairs(source_section.options) do
                if not target_section.options[option] or
                   target_section.options[option].value ~= option_data.value then
                    modified = true
                    break
                end
            end
            
            if modified then
                table.insert(comparison.differences.modified_sections, section_name)
            end
        end
    end
    
    -- Find missing sections (in target but not in source)
    for section_name, _ in pairs(target_meta.sections) do
        if not source_meta.sections[section_name] then
            table.insert(comparison.differences.missing_sections, section_name)
        end
    end
    
    return comparison
end

-- Function: create_backup_directory
-- Purpose: Ensure backup directory exists
function ConfigManager:create_backup_directory()
    if not self:directory_exists(self.backup_dir) then
        lfs.mkdir(self.backup_dir)
        log(self, "verbose", "Created backup directory: " .. self.backup_dir)
    end
end

-- Function: get_backup_list
-- Purpose: Get list of available backups
-- Returns: table - List of backup files with metadata
function ConfigManager:get_backup_list()
    if not self:directory_exists(self.backup_dir) then
        return {}
    end
    
    local backups = {}
    local success, err = pcall(function()
        for file in lfs.dir(self.backup_dir) do
            if file ~= "." and file ~= ".." and file:match("%.tar%.gz$") then
                local backup_path = self.backup_dir .. "/" .. file
                local attr = lfs.attributes(backup_path)
                if attr then
                    table.insert(backups, {
                        name = file:gsub("%.tar%.gz$", ""),
                        filename = file,
                        path = backup_path,
                        size = attr.size,
                        created = attr.modification
                    })
                end
            end
        end
    end)
    
    if not success then
        log(self, "error", "Error reading backup directory: " .. tostring(err))
        return {}
    end
    
    -- Sort by creation time (newest first)
    table.sort(backups, function(a, b)
        return a.created > b.created
    end)
    
    return backups
end

-- Function: cleanup_old_backups
-- Purpose: Remove old backup files based on retention policy
-- Parameters:
--   max_backups (number, optional): Maximum number of backups to keep (default: 10)
function ConfigManager:cleanup_old_backups(max_backups)
    max_backups = max_backups or 10
    local backups = self:get_backup_list()
    
    if #backups <= max_backups then
        log(self, "verbose", "No backup cleanup needed (" .. #backups .. " backups)")
        return
    end
    
    local removed_count = 0
    for i = max_backups + 1, #backups do
        local backup = backups[i]
        local success = os.remove(backup.path)
        if success then
            removed_count = removed_count + 1
        else
            log(self, "error", "Failed to remove old backup: " .. backup.filename)
        end
    end
    
    if removed_count > 0 then
        log(self, "info", "Cleaned up " .. removed_count .. " old backup(s)")
    end
end

return ConfigManager