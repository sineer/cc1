#!/usr/bin/env lua

--[[
Common Test Utilities for UCI Configuration Testing

Shared functions and helpers for test files to avoid duplication.
Handles config file copying, path resolution, and other common test operations.
]]

local M = {}

-- Test configuration constants
M.TEST_CONFIG_DIR = "test/etc"

-- Helper function to copy test config files
-- @param target: The target directory name (e.g., "existing", "new", "uspot")
-- @param config_name: The config file name (e.g., "network", "firewall")
-- @param dest_file: The destination file path where config should be copied
-- @return boolean: true if copy succeeded, false otherwise
function M.copy_test_config(target, config_name, dest_file)
    local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
    local source_file
    
    -- Try multiple path resolutions
    local possible_paths = {
        -- Docker environment (working directory is /app)
        "/app/" .. M.TEST_CONFIG_DIR .. "/" .. target .. "/" .. config_name,
        -- Relative from test directory
        script_dir .. M.TEST_CONFIG_DIR .. "/" .. target .. "/" .. config_name,
        -- Relative from project root
        script_dir .. "../" .. M.TEST_CONFIG_DIR .. "/" .. target .. "/" .. config_name,
        -- Current directory
        M.TEST_CONFIG_DIR .. "/" .. target .. "/" .. config_name
    }
    
    for _, path in ipairs(possible_paths) do
        if io.open(path, "r") then
            source_file = path
            break
        end
    end
    
    if not source_file then
        print("ERROR: Could not find test config file for target=" .. target .. " config=" .. config_name)
        print("Tried paths:")
        for _, path in ipairs(possible_paths) do
            print("  " .. path)
        end
        return false
    end
    
    local copy_cmd = "cp " .. source_file .. " " .. dest_file
    local result = os.execute(copy_cmd)
    return result == 0
end

-- Helper function to check if a file exists
-- @param file_path: Path to the file to check
-- @return boolean: true if file exists, false otherwise
function M.file_exists(file_path)
    local f = io.open(file_path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

-- Helper function to read file content
-- @param file_path: Path to the file to read
-- @return string|nil: File content or nil if file doesn't exist
function M.read_file_content(file_path)
    local f = io.open(file_path, "r")
    if f then
        local content = f:read("*a")
        f:close()
        return content
    end
    return nil
end

-- Helper function to write file content
-- @param file_path: Path to the file to write
-- @param content: Content to write to the file
-- @return boolean: true if write succeeded, false otherwise
function M.write_file_content(file_path, content)
    local f = io.open(file_path, "w")
    if f then
        f:write(content)
        f:close()
        return true
    end
    return false
end

-- Helper function to create a temporary directory
-- @param prefix: Optional prefix for the temporary directory name
-- @return string: Path to the created temporary directory
function M.create_temp_dir(prefix)
    prefix = prefix or "test_"
    local temp_dir = "/tmp/" .. prefix .. os.time() .. "_" .. math.random(1000, 9999)
    local success = os.execute("mkdir -p " .. temp_dir) == 0
    if success then
        return temp_dir
    end
    error("Failed to create temporary directory: " .. temp_dir)
end

-- Helper function to clean up a directory
-- @param dir_path: Path to the directory to clean up
-- @return boolean: true if cleanup succeeded, false otherwise
function M.cleanup_dir(dir_path)
    if dir_path and dir_path ~= "/" and dir_path ~= "" then
        local result = os.execute("rm -rf " .. dir_path)
        return result == 0
    end
    return false
end

-- Helper function to execute a shell command and capture output
-- @param cmd: The command to execute
-- @return string, boolean: Output string and success boolean
function M.execute_command(cmd)
    local handle = io.popen(cmd .. " 2>&1")
    if not handle then
        return "", false
    end
    local result = handle:read("*a")
    local success = handle:close()
    return result, success
end

-- Helper function to check if we're running in Docker
-- @return boolean: true if running in Docker container, false otherwise
function M.is_docker_environment()
    return M.file_exists("/.dockerenv")
end

-- Helper function to get the appropriate test config directory based on environment
-- @return string: The test config directory path
function M.get_test_config_dir()
    if M.is_docker_environment() then
        return "/app/" .. M.TEST_CONFIG_DIR
    else
        local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
        return script_dir .. "../" .. M.TEST_CONFIG_DIR
    end
end

-- Helper function to list available test configs
-- @param target: The target directory name (e.g., "existing", "new")
-- @return table: Array of available config file names
function M.list_test_configs(target)
    local config_dir = M.get_test_config_dir() .. "/" .. target
    local configs = {}
    
    local handle = io.popen("ls " .. config_dir .. " 2>/dev/null")
    if handle then
        for filename in handle:lines() do
            table.insert(configs, filename)
        end
        handle:close()
    end
    
    return configs
end

-- Helper function to validate that required test configs exist
-- @param required_configs: Table of {target = {config1, config2, ...}}
-- @return boolean, string: Success boolean and error message if failed
function M.validate_test_configs(required_configs)
    for target, configs in pairs(required_configs) do
        for _, config in ipairs(configs) do
            local source_file = M.get_test_config_dir() .. "/" .. target .. "/" .. config
            if not M.file_exists(source_file) then
                return false, "Missing test config: " .. source_file
            end
        end
    end
    return true, nil
end

return M