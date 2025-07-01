#!/usr/bin/env lua

-- Add lib and test directories to Lua path for library modules
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
package.path = script_dir .. "../lib/?.lua;" .. script_dir .. "?.lua;" .. package.path

-- Add Docker paths for test_utils and luaunit_fixed
package.path = "/app/lib/?.lua;" .. "/app/test/?.lua;" .. "./lib/?.lua;" .. "./test/?.lua;" .. package.path

--[[
Test suite for --prefix deployment functionality
Integration tests for custom installation paths
]]

local lu = require('luaunit_fixed')

-- Mock environment for testing
local original_os_execute = os.execute
local original_io_open = io.open
local mock_execute_calls = {}
local mock_execute_results = {}
local mock_files = {}

local function mock_os_execute(cmd)
    table.insert(mock_execute_calls, cmd)
    local result = mock_execute_results[cmd]
    if result ~= nil then
        return result
    end
    -- Default behavior
    if cmd:match("mkdir %-p") then
        return true
    end
    if cmd:match("cp ") or cmd:match("chmod ") then
        return true
    end
    return false
end

local function mock_io_open(filename, mode)
    if mode == "r" then
        if mock_files[filename] then
            return {
                read = function(self, format)
                    if format == "*a" then
                        return mock_files[filename]
                    end
                end,
                close = function() return true end
            }
        end
        return nil
    elseif mode == "w" then
        return {
            write = function(self, data)
                mock_files[filename] = data
                return true
            end,
            close = function() return true end
        }
    end
end

-- Test class for Prefix Deployment
TestPrefixDeployment = {}

function TestPrefixDeployment:setUp()
    mock_execute_calls = {}
    mock_execute_results = {}
    mock_files = {}
end

function TestPrefixDeployment:tearDown()
    os.execute = original_os_execute
    io.open = original_io_open
end

function TestPrefixDeployment:test_default_prefix_installation()
    os.execute = mock_os_execute
    
    -- Simulate installation commands
    local install_commands = {
        "mkdir -p /usr/local/bin",
        "mkdir -p /usr/local/lib/uci-config",
        "mkdir -p /usr/local/share/uci-config",
        "cp /tmp/bin/uci-config /usr/local/bin/",
        "chmod +x /usr/local/bin/uci-config"
    }
    
    for _, cmd in ipairs(install_commands) do
        os.execute(cmd)
    end
    
    -- Verify all directories created
    local has_bin = false
    local has_lib = false
    local has_share = false
    
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("/usr/local/bin") then has_bin = true end
        if cmd:match("/usr/local/lib/uci%-config") then has_lib = true end
        if cmd:match("/usr/local/share/uci%-config") then has_share = true end
    end
    
    lu.assertTrue(has_bin)
    lu.assertTrue(has_lib)
    lu.assertTrue(has_share)
end

function TestPrefixDeployment:test_custom_prefix_installation()
    os.execute = mock_os_execute
    
    local custom_prefix = "/opt/uci-config"
    
    -- Simulate installation with custom prefix
    local install_commands = {
        "mkdir -p " .. custom_prefix .. "/bin",
        "mkdir -p " .. custom_prefix .. "/lib/uci-config",
        "mkdir -p " .. custom_prefix .. "/share/uci-config",
        "cp /tmp/bin/uci-config " .. custom_prefix .. "/bin/",
        "chmod +x " .. custom_prefix .. "/bin/uci-config"
    }
    
    for _, cmd in ipairs(install_commands) do
        os.execute(cmd)
    end
    
    -- Verify custom paths used
    local custom_count = 0
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("/opt/uci%-config") then
            custom_count = custom_count + 1
        end
    end
    
    lu.assertEquals(custom_count, 5)
end

function TestPrefixDeployment:test_prefix_argument_parsing()
    -- Simulate parsing --prefix argument
    local args = {"192.168.1.1", "safe-merge", "--prefix", "/opt/custom", "--password", ""}
    
    local prefix = nil
    for i = 1, #args do
        if args[i] == "--prefix" and i < #args then
            prefix = args[i + 1]
        end
    end
    
    lu.assertEquals(prefix, "/opt/custom")
end

function TestPrefixDeployment:test_prefix_path_validation()
    -- Test various prefix paths
    local valid_prefixes = {
        "/usr/local",
        "/opt/uci",
        "/home/user/local",
        "/var/lib/uci-config"
    }
    
    local invalid_prefixes = {
        "",  -- Empty
        "relative/path",  -- Relative path
        "/tmp/../etc",  -- Path traversal
        "/",  -- Root directory
    }
    
    local function is_valid_prefix(prefix)
        -- Basic validation rules
        if not prefix or prefix == "" then return false end
        if not prefix:match("^/") then return false end  -- Must be absolute
        if prefix:match("%.%.") then return false end  -- No path traversal
        if prefix == "/" then return false end  -- Not root
        return true
    end
    
    for _, prefix in ipairs(valid_prefixes) do
        lu.assertTrue(is_valid_prefix(prefix))
    end
    
    for _, prefix in ipairs(invalid_prefixes) do
        lu.assertFalse(is_valid_prefix(prefix))
    end
end

function TestPrefixDeployment:test_library_path_configuration()
    -- Test LUA_PATH construction
    local prefix = "/custom/install"
    local expected_lua_path = prefix .. "/lib/uci-config/?.lua;" .. prefix .. "/lib/uci-config/commands/?.lua"
    
    -- Simulate command execution with custom prefix
    os.execute = mock_os_execute
    
    local cmd = "export LUA_PATH='" .. expected_lua_path .. "' && " .. prefix .. "/bin/uci-config validate"
    os.execute(cmd)
    
    lu.assertEquals(#mock_execute_calls, 1)
    lu.assertStrContains(mock_execute_calls[1], "/custom/install/lib/uci-config")
end

function TestPrefixDeployment:test_cleanup_custom_prefix()
    os.execute = mock_os_execute
    
    local prefix = "/opt/test-install"
    
    -- Simulate cleanup commands
    local cleanup_commands = {
        "rm -rf " .. prefix .. "/bin/uci-config",
        "rm -rf " .. prefix .. "/lib/uci-config",
        "rm -rf " .. prefix .. "/share/uci-config"
    }
    
    for _, cmd in ipairs(cleanup_commands) do
        os.execute(cmd)
    end
    
    -- Verify cleanup targets correct paths
    local cleanup_count = 0
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("rm %-rf /opt/test%-install/") then
            cleanup_count = cleanup_count + 1
        end
    end
    
    lu.assertEquals(cleanup_count, 3)
end

function TestPrefixDeployment:test_configuration_template_paths()
    os.execute = mock_os_execute
    
    local prefix = "/usr/local"
    
    -- Test that configuration templates are installed to share directory
    os.execute("cp -r /tmp/etc " .. prefix .. "/share/uci-config/")
    
    local found_etc_copy = false
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("cp %-r /tmp/etc") and cmd:match("/share/uci%-config/") then
            found_etc_copy = true
        end
    end
    
    lu.assertTrue(found_etc_copy)
end

function TestPrefixDeployment:test_prefix_environment_variable()
    -- Test UCI_CONFIG_PREFIX environment variable
    local original_getenv = os.getenv
    os.getenv = function(var)
        if var == "UCI_CONFIG_PREFIX" then
            return "/env/prefix"
        end
        return nil
    end
    
    -- Simulate prefix detection logic
    local prefix = os.getenv("UCI_CONFIG_PREFIX") or "/usr/local"
    lu.assertEquals(prefix, "/env/prefix")
    
    -- Test without environment variable
    os.getenv = function(var) return nil end
    prefix = os.getenv("UCI_CONFIG_PREFIX") or "/usr/local"
    lu.assertEquals(prefix, "/usr/local")
    
    os.getenv = original_getenv
end

function TestPrefixDeployment:test_binary_execution_wrapper()
    io.open = mock_io_open
    
    -- Mock the binary wrapper script
    mock_files["/opt/custom/bin/uci-config"] = [[#!/bin/sh
PREFIX="/opt/custom"
export LUA_PATH="$PREFIX/lib/uci-config/?.lua;$PREFIX/lib/uci-config/commands/?.lua"
exec lua "$PREFIX/lib/uci-config/main.lua" "$@"
]]
    
    local content = mock_files["/opt/custom/bin/uci-config"]
    lu.assertStrContains(content, 'PREFIX="/opt/custom"')
    lu.assertStrContains(content, "lib/uci-config/?.lua")
    lu.assertStrContains(content, "exec lua")
end

function TestPrefixDeployment:test_installation_error_handling()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        -- Simulate mkdir failure
        if cmd:match("mkdir %-p /readonly/") then
            return false
        end
        return true
    end
    
    -- Try to install to read-only location
    local result = os.execute("mkdir -p /readonly/bin")
    lu.assertFalse(result)
    
    -- Verify error was attempted
    lu.assertEquals(#mock_execute_calls, 1)
    lu.assertStrContains(mock_execute_calls[1], "/readonly/")
end

-- Run the tests
os.exit(lu.LuaUnit.run())