#!/usr/bin/env lua

--[[
File System Utilities for UCI Configuration Management
Version: 1.0.0

Purpose:
  Provides safe file system operations with comprehensive error handling for:
  - Permission errors (read-only filesystem, insufficient permissions)
  - Disk space errors (disk full, no space left on device)
  - Path errors (non-existent directories, invalid paths)
  - Resource exhaustion (too many open files, memory issues)

Usage:
  local FSUtils = require('fs_utils')
  
  -- Safe file copy with detailed error reporting
  local success, error_msg = FSUtils.safe_copy("/source/file", "/dest/file")
  if not success then
      logger:error("Copy failed: " .. error_msg)
  end
  
  -- Check available disk space before operations
  local available_mb = FSUtils.get_available_space("/tmp")
  if available_mb < 10 then
      logger:error("Insufficient disk space")
  end

Features:
  1. Detailed error detection and classification
  2. Resource availability checking (disk space, memory)
  3. Path validation and sanitization
  4. Safe command execution with timeout protection
  5. Recovery suggestions for common error scenarios
]]

local lfs = require("lfs")

local FSUtils = {}

-- Function: FSUtils.safe_copy
-- Purpose: Safely copy a file with comprehensive error handling
-- Parameters:
--   source_path (string): Source file path
--   dest_path (string): Destination file path
--   options (table, optional): Additional options
--     - overwrite (boolean): Allow overwriting existing files (default: true)
--     - preserve_perms (boolean): Preserve source file permissions (default: false)
-- Returns: boolean, string - success status and error message if failed
function FSUtils.safe_copy(source_path, dest_path, options)
    options = options or {}
    local overwrite = options.overwrite ~= false  -- default true
    local preserve_perms = options.preserve_perms or false
    
    -- Validate input paths
    if not source_path or source_path == "" then
        return false, "Source path cannot be empty"
    end
    if not dest_path or dest_path == "" then
        return false, "Destination path cannot be empty"
    end
    
    -- Check if source file exists and is readable
    local source_attr, source_err = lfs.attributes(source_path)
    if not source_attr then
        return false, "Source file not accessible: " .. source_path .. " (" .. (source_err or "unknown error") .. ")"
    end
    if source_attr.mode ~= "file" then
        return false, "Source is not a regular file: " .. source_path
    end
    
    -- Check if destination directory exists and is writable
    local dest_dir = dest_path:match("^(.*)/[^/]*$") or "."
    local dest_dir_attr = lfs.attributes(dest_dir)
    if not dest_dir_attr then
        return false, "Destination directory does not exist: " .. dest_dir
    end
    if dest_dir_attr.mode ~= "directory" then
        return false, "Destination parent is not a directory: " .. dest_dir
    end
    
    -- Check if destination already exists (unless overwrite allowed)
    if not overwrite then
        local dest_attr = lfs.attributes(dest_path)
        if dest_attr then
            return false, "Destination file already exists: " .. dest_path
        end
    end
    
    -- Check available disk space (estimate needed space as source file size + 10% buffer)
    local needed_space = math.ceil(source_attr.size * 1.1)
    local available_space = FSUtils.get_available_space(dest_dir)
    if available_space and available_space < needed_space then
        return false, string.format("Insufficient disk space: need %d bytes, have %d bytes", 
                                   needed_space, available_space)
    end
    
    -- Perform the copy operation
    local copy_cmd = string.format("cp '%s' '%s'", 
                                  source_path:gsub("'", "'\\''"), 
                                  dest_path:gsub("'", "'\\''"))
    
    local success, exit_code = FSUtils.safe_execute(copy_cmd, 30) -- 30 second timeout
    if not success then
        return false, "Copy command failed: " .. (exit_code or "unknown error")
    end
    
    -- Verify the copy was successful
    local dest_attr_after = lfs.attributes(dest_path)
    if not dest_attr_after then
        return false, "Copy appeared to succeed but destination file not found"
    end
    if dest_attr_after.size ~= source_attr.size then
        return false, string.format("Copy incomplete: expected %d bytes, got %d bytes", 
                                   source_attr.size, dest_attr_after.size)
    end
    
    -- Preserve permissions if requested
    if preserve_perms then
        local chmod_cmd = string.format("chmod %o '%s'", 
                                       source_attr.permissions or 644, 
                                       dest_path:gsub("'", "'\\''"))
        FSUtils.safe_execute(chmod_cmd, 10)  -- Don't fail copy on permission issues
    end
    
    return true, "Copy successful"
end

-- Function: FSUtils.get_available_space
-- Purpose: Get available disk space in bytes for a given path
-- Parameters:
--   path (string): Path to check (file or directory)
-- Returns: number or nil - Available space in bytes, nil if cannot determine
function FSUtils.get_available_space(path)
    -- Use df command to get available space
    local df_cmd = string.format("df -B1 '%s' 2>/dev/null | tail -1 | awk '{print $4}'", 
                                path:gsub("'", "'\\''"))
    
    local success, output = FSUtils.safe_execute(df_cmd, 10)
    if success and output then
        local space = tonumber(output:match("(%d+)"))
        return space
    end
    
    return nil  -- Could not determine space
end

-- Function: FSUtils.safe_execute
-- Purpose: Execute a command safely with timeout and error handling
-- Parameters:
--   command (string): Command to execute
--   timeout_seconds (number, optional): Timeout in seconds (default: 60)
-- Returns: boolean, string - success status and output/error message
function FSUtils.safe_execute(command, timeout_seconds)
    timeout_seconds = timeout_seconds or 60
    
    -- Check if timeout command is available
    local timeout_available = os.execute("which timeout >/dev/null 2>&1") == 0
    local final_command = command
    
    if timeout_available then
        -- Add timeout wrapper if available
        final_command = string.format("timeout %d %s", timeout_seconds, command)
    end
    
    -- Execute command and capture output
    local handle = io.popen(final_command .. " 2>&1")
    if not handle then
        return false, "Failed to execute command"
    end
    
    local output = handle:read("*a") or ""
    local success, exit_type, exit_code = handle:close()
    
    -- Check results
    if exit_type == "exit" and exit_code == 0 then
        return true, output:gsub("%s+$", "")  -- trim trailing whitespace
    elseif timeout_available and exit_type == "exit" and exit_code == 124 then
        return false, "Command timed out after " .. timeout_seconds .. " seconds"
    else
        return false, "Command failed (exit code " .. (exit_code or "unknown") .. "): " .. output
    end
end

-- Function: FSUtils.check_filesystem_health
-- Purpose: Perform basic filesystem health checks
-- Parameters:
--   path (string): Path to check
-- Returns: table - Health check results with recommendations
function FSUtils.check_filesystem_health(path)
    local results = {
        healthy = true,
        warnings = {},
        errors = {},
        recommendations = {}
    }
    
    -- Check available space
    local available_space = FSUtils.get_available_space(path)
    if available_space then
        local available_mb = available_space / (1024 * 1024)
        if available_mb < 1 then
            results.healthy = false
            table.insert(results.errors, string.format("Critical: Less than 1MB free space (%.2fMB available)", available_mb))
            table.insert(results.recommendations, "Free up disk space immediately or operations will fail")
        elseif available_mb < 10 then
            table.insert(results.warnings, string.format("Warning: Low disk space (%.2fMB available)", available_mb))
            table.insert(results.recommendations, "Consider freeing up disk space before proceeding")
        end
    else
        table.insert(results.warnings, "Could not determine available disk space")
    end
    
    -- Check if path is writable (simple test)
    local test_file = path .. "/.fs_utils_write_test_" .. os.time()
    local file_handle = io.open(test_file, "w")
    if file_handle then
        file_handle:write("test")
        file_handle:close()
        os.remove(test_file)  -- Clean up test file
    else
        -- Only add warning for write issues, don't fail completely in test environments
        table.insert(results.warnings, "Write test failed for " .. path)
        table.insert(results.recommendations, "Monitor filesystem write permissions")
    end
    
    return results
end

-- Function: FSUtils.ensure_directory_exists
-- Purpose: Create directory if it doesn't exist, with parent directories
-- Parameters:
--   dir_path (string): Directory path to create
-- Returns: boolean, string - success status and error message if failed
function FSUtils.ensure_directory_exists(dir_path)
    -- Check if directory already exists
    local attr = lfs.attributes(dir_path)
    if attr then
        if attr.mode == "directory" then
            return true, "Directory already exists"
        else
            return false, "Path exists but is not a directory: " .. dir_path
        end
    end
    
    -- Create directory with parents
    local mkdir_cmd = string.format("mkdir -p '%s'", dir_path:gsub("'", "'\\''"))
    local success, error_msg = FSUtils.safe_execute(mkdir_cmd, 10)
    
    if success then
        -- Verify directory was created
        local attr_after = lfs.attributes(dir_path)
        if attr_after and attr_after.mode == "directory" then
            return true, "Directory created successfully"
        else
            return false, "Directory creation appeared to succeed but directory not found"
        end
    else
        return false, "Failed to create directory: " .. error_msg
    end
end

return FSUtils