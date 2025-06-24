#!/usr/bin/env lua

--[[
Backup Command Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Implements the backup command functionality for creating compressed
  backups of UCI configuration files.

Features:
  - Compressed backup creation
  - Custom backup naming
  - Backup validation
  - Automatic cleanup of old backups
  - Dry-run support

Usage:
  local BackupCommand = require('commands.backup_command')
  local cmd = BackupCommand.new()
  local exit_code = cmd:execute(args, options)
]]

local CommandBase = require("command_base")

local BackupCommand = {}
setmetatable(BackupCommand, {__index = CommandBase})

-- Function: BackupCommand.new
-- Purpose: Create a new backup command instance
-- Returns: BackupCommand instance
function BackupCommand.new()
    local self = CommandBase.new("backup")
    setmetatable(self, {__index = BackupCommand})
    return self
end

-- Function: show_help
-- Purpose: Display help information for the backup command
function BackupCommand:show_help()
    print([[
BACKUP COMMAND - Create compressed backup of UCI configurations

USAGE:
  uci-config backup [options]

DESCRIPTION:
  Creates a timestamped, compressed backup of all UCI configuration files
  from /etc/config directory. Backups are stored in /tmp/uci-config-backups.

OPTIONS:
  --name=<name>          Custom backup name (default: backup-YYYYMMDD-HHMMSS)
  --dry-run              Preview backup operation without creating files
  --verbose              Show detailed backup information including file size
  --quiet                Suppress informational output
  --cleanup              Remove old backups (keep last 10)

EXAMPLES:
  # Create timestamped backup
  uci-config backup

  # Create named backup
  uci-config backup --name pre-upgrade

  # Preview backup operation
  uci-config backup --dry-run --verbose

  # Create backup and cleanup old ones
  uci-config backup --cleanup

BACKUP LOCATION:
  /tmp/uci-config-backups/

BACKUP FORMAT:
  - Compressed tar.gz archives
  - Contains complete /etc/config directory structure
  - Includes all UCI configuration files

EXIT CODES:
  0 - Success
  1 - Error occurred
]])
end

-- Function: generate_backup_name
-- Purpose: Generate backup filename based on options
-- Parameters:
--   options (table): Command options
-- Returns: string - Backup name without extension
function BackupCommand:generate_backup_name(options)
    if options.name then
        return options.name
    else
        return "backup-" .. os.date("%Y%m%d-%H%M%S")
    end
end

-- Function: validate_backup_name
-- Purpose: Validate backup name for filesystem safety
-- Parameters:
--   name (string): Backup name to validate
-- Returns: boolean, string - validation result and error message
function BackupCommand:validate_backup_name(name)
    if not name or name == "" then
        return false, "Backup name cannot be empty"
    end
    
    -- Check for invalid characters
    if name:match("[/\\:*?\"<>|]") then
        return false, "Backup name contains invalid characters"
    end
    
    -- Check length
    if #name > 100 then
        return false, "Backup name too long (max 100 characters)"
    end
    
    return true, nil
end

-- Function: check_backup_exists
-- Purpose: Check if a backup with the same name already exists
-- Parameters:
--   backup_name (string): Name of the backup to check
-- Returns: boolean - true if backup exists
function BackupCommand:check_backup_exists(backup_name)
    local backup_path = self.config_manager.backup_dir .. "/" .. backup_name .. ".tar.gz"
    return self.config_manager:file_exists(backup_path)
end

-- Function: get_backup_size_info
-- Purpose: Get size information about the source directory
-- Returns: string - Human readable size information
function BackupCommand:get_backup_size_info()
    local cmd = "du -sh " .. self.config_manager.config_dir .. " 2>/dev/null | cut -f1"
    local handle = io.popen(cmd)
    if handle then
        local size = handle:read("*a"):gsub("%s+", "")
        handle:close()
        return size ~= "" and size or "unknown"
    end
    return "unknown"
end

-- Function: create_backup
-- Purpose: Create the actual backup file
-- Parameters:
--   backup_name (string): Name for the backup
--   options (table): Command options
-- Returns: boolean, string - success status and message
function BackupCommand:create_backup(backup_name, options)
    -- Ensure backup directory exists
    self.config_manager:create_backup_directory()
    
    local backup_path = self.config_manager.backup_dir .. "/" .. backup_name .. ".tar.gz"
    
    -- Show what will be backed up
    local source_size = self:get_backup_size_info()
    self:log("info", "Source directory size: " .. source_size)
    
    -- Create tar command
    local cmd = string.format("tar -czf '%s' -C / etc/config 2>/dev/null", backup_path)
    
    if options["dry-run"] then
        self:log("info", "DRY RUN: Would execute: " .. cmd)
        self:log("info", "DRY RUN: Backup would be saved to: " .. backup_path)
        return true, backup_path
    end
    
    -- Execute backup command
    self:log("verbose", "Executing: " .. cmd)
    local result = os.execute(cmd)
    
    if result == 0 then
        -- Verify backup was created and get its size
        if self.config_manager:file_exists(backup_path) then
            local lfs = require("lfs")
            local attr = lfs.attributes(backup_path)
            if attr then
                local size_mb = math.floor(attr.size / 1024 / 1024 * 100) / 100
                self:log("info", "Backup created successfully: " .. backup_path)
                self:log("verbose", "Backup size: " .. size_mb .. " MB")
                return true, backup_path
            end
        end
        
        return false, "Backup file not found after creation"
    else
        return false, "Backup command failed (exit code: " .. tostring(result) .. ")"
    end
end

-- Function: cleanup_old_backups
-- Purpose: Remove old backup files based on retention policy
-- Parameters:
--   options (table): Command options
function BackupCommand:cleanup_old_backups(options)
    if not options.cleanup then
        return
    end
    
    self:log("info", "Cleaning up old backups...")
    self.config_manager:cleanup_old_backups(10)  -- Keep last 10 backups
end

-- Function: execute
-- Purpose: Main execution method for backup command
-- Parameters:
--   args (table): Command-line arguments
--   parsed_options (table): Pre-parsed options (optional)
-- Returns: number - Exit code
function BackupCommand:execute(args, parsed_options)
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
    
    -- Generate and validate backup name
    local backup_name = self:generate_backup_name(options)
    local name_valid, name_error = self:validate_backup_name(backup_name)
    if not name_valid then
        self:log("error", name_error)
        return 1
    end
    
    -- Check if backup already exists (unless dry-run)
    if not options["dry-run"] and self:check_backup_exists(backup_name) then
        if not options.force then
            self:log("error", "Backup already exists: " .. backup_name .. ".tar.gz")
            self:log("info", "Use --force to overwrite existing backup")
            return 1
        else
            self:log("info", "Overwriting existing backup: " .. backup_name .. ".tar.gz")
        end
    end
    
    -- Show options
    self:show_dry_run_warning()
    if options.verbose then
        self:log("info", "Backup name: " .. backup_name)
        self:log("info", "Source directory: " .. self.config_manager.config_dir)
        self:log("info", "Backup directory: " .. self.config_manager.backup_dir)
    end
    
    -- Create backup
    local success, result_path = self:create_backup(backup_name, options)
    if not success then
        self:log("error", "Backup failed: " .. result_path)
        return 1
    end
    
    -- Cleanup old backups if requested
    self:cleanup_old_backups(options)
    
    -- Show completion message
    if not options["dry-run"] then
        self:log("info", "Backup completed successfully")
        if options.verbose then
            -- Show backup list
            local backups = self.config_manager:get_backup_list()
            if #backups > 0 then
                self:log("info", "Available backups:")
                for i, backup in ipairs(backups) do
                    if i <= 5 then  -- Show only first 5
                        local size_mb = math.floor(backup.size / 1024 / 1024 * 100) / 100
                        local date = os.date("%Y-%m-%d %H:%M:%S", backup.created)
                        self:log("info", "  " .. backup.name .. " (" .. size_mb .. " MB, " .. date .. ")")
                    elseif i == 6 then
                        self:log("info", "  ... and " .. (#backups - 5) .. " more")
                        break
                    end
                end
            end
        end
    else
        self:log("info", "Backup preview completed")
    end
    
    return 0
end

return BackupCommand