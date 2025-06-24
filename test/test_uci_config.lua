#!/usr/bin/env lua

-- Add lib and test directories to Lua path for library modules
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
package.path = script_dir .. "../lib/?.lua;" .. script_dir .. "?.lua;" .. package.path

--[[
Test suite for uci-config tool
Uses luaunit for testing in Docker OpenWRT environment
]]

-- Import luaunit (we'll need to install it in Docker)
local lu = require('luaunit_fixed')

-- Test configuration
local TEST_CONFIG_DIR = "/tmp/test-config"
local UCI_CONFIG_TOOL = "/app/bin/uci-config"

-- Helper function to execute shell commands
local function execute_command(cmd)
    local handle = io.popen(cmd .. " 2>&1")
    local result = handle:read("*a")
    local success = handle:close()
    return result, success
end

-- Test class for CLI functionality
TestUCIConfig = {}

function TestUCIConfig:setUp()
    -- Create test directory
    os.execute("mkdir -p " .. TEST_CONFIG_DIR)
end

function TestUCIConfig:tearDown()
    -- Clean up test directory
    os.execute("rm -rf " .. TEST_CONFIG_DIR)
end

function TestUCIConfig:test_help_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " help")
    lu.assertStrContains(result, "uci-config - UCI Configuration Merge Tool")
    lu.assertStrContains(result, "Usage:")
    lu.assertStrContains(result, "CORE COMMANDS")
end

function TestUCIConfig:test_backup_dry_run()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " backup --dry-run --name test-backup")
    lu.assertStrContains(result, "DRY RUN")
    lu.assertStrContains(result, "test-backup")
end

function TestUCIConfig:test_validate_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " validate")
    lu.assertStrContains(result, "Validating")
end

function TestUCIConfig:test_merge_dry_run()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " merge --dry-run /app/etc/config/default")
    lu.assertStrContains(result, "DRY RUN MODE")
    lu.assertStrContains(result, "No changes will be applied")
end

function TestUCIConfig:test_config_command_dry_run()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " config --target default --dry-run")
    lu.assertStrContains(result, "Config command using target: default")
    lu.assertStrContains(result, "Source directory: ./etc/config/default")
    lu.assertStrContains(result, "default safety options")
    lu.assertStrContains(result, "preserve-network")
    lu.assertStrContains(result, "dedupe-lists")
    lu.assertStrContains(result, "preserve-existing")
end

function TestUCIConfig:test_config_command_missing_target()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " config")
    lu.assertStrContains(result, "No target specified")
    lu.assertStrContains(result, "Usage: uci-config config --target")
end

function TestUCIConfig:test_remove_command_dry_run()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " remove --target default --dry-run")
    lu.assertStrContains(result, "Remove command using target: default")
    lu.assertStrContains(result, "DRY RUN MODE")
    lu.assertStrContains(result, "Would remove")
end

function TestUCIConfig:test_remove_command_missing_target()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " remove")
    lu.assertStrContains(result, "No target specified")
    lu.assertStrContains(result, "Usage: uci-config remove --target")
end

function TestUCIConfig:test_remove_nonexistent_target()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " remove --target nonexistent --dry-run")
    lu.assertStrContains(result, "No configuration files found in target directory")
end

function TestUCIConfig:test_invalid_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " invalid-command")
    lu.assertStrContains(result, "Unknown command")
    lu.assertStrContains(result, "Use 'uci-config help'")
end

-- Test class for UCI config file validation
TestUCIConfigFiles = {}

function TestUCIConfigFiles:test_firewall_config_exists()
    lu.assertTrue(self:file_exists("/app/etc/config/default/firewall"))
end

function TestUCIConfigFiles:test_dhcp_config_exists()
    lu.assertTrue(self:file_exists("/app/etc/config/default/dhcp"))
end

function TestUCIConfigFiles:test_uhttpd_config_exists()
    lu.assertTrue(self:file_exists("/app/etc/config/default/uhttpd"))
end

function TestUCIConfigFiles:test_uspot_config_exists()
    lu.assertTrue(self:file_exists("/app/etc/config/default/ubispot"))
end

function TestUCIConfigFiles:test_network_config_exists()
    lu.assertTrue(self:file_exists("/app/etc/config/default/network"))
end

function TestUCIConfigFiles:test_firewall_config_content()
    local content = self:read_file("/app/etc/config/default/firewall")
    lu.assertStrContains(content, "config zone")
    lu.assertStrContains(content, "option name 'captive'")
    lu.assertStrContains(content, "config ipset")
    lu.assertStrContains(content, "option name 'uspot'")
end

function TestUCIConfigFiles:test_uspot_config_content()
    local content = self:read_file("/app/etc/config/default/ubispot")
    lu.assertStrContains(content, "config ubispot 'captive'")
    lu.assertStrContains(content, "option interface 'captive'")
    lu.assertStrContains(content, "option setname 'uspot'")
end

-- Helper methods
function TestUCIConfigFiles:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

function TestUCIConfigFiles:read_file(path)
    local f = io.open(path, "r")
    if f then
        local content = f:read("*a")
        f:close()
        return content
    end
    return nil
end

-- Run tests
print("Running uci-config test suite...")
print("Testing CLI functionality and UCI config files...")

-- Execute tests
os.exit(lu.LuaUnit.run())