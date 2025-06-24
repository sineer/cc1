#!/usr/bin/env lua

-- Test suite for uci-config tool on remote OpenWrt VM
-- Modified paths for remote testing environment

-- Add lib and test directories to Lua path for library modules
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
package.path = script_dir .. "../lib/?.lua;" .. script_dir .. "?.lua;" .. package.path

-- Import luaunit
local lu = require('luaunit_fixed')

-- Test configuration for remote OpenWrt VM
local TEST_CONFIG_DIR = "/tmp/test-config-remote"
local UCI_CONFIG_TOOL = "/tmp/uci-test-remote/bin/uci-config"
local REMOTE_CONFIG_DIR = "/tmp/uci-test-remote/etc/config/default"

-- Helper function to execute shell commands
local function execute_command(cmd)
    local handle = io.popen(cmd .. " 2>&1")
    local result = handle:read("*a")
    local success = handle:close()
    return result, success
end

-- Test class for CLI functionality on remote OpenWrt
TestRemoteOpenWrtUCI = {}

function TestRemoteOpenWrtUCI:setUp()
    -- Create test directory
    os.execute("mkdir -p " .. TEST_CONFIG_DIR)
end

function TestRemoteOpenWrtUCI:tearDown()
    -- Clean up test directory
    os.execute("rm -rf " .. TEST_CONFIG_DIR)
end

function TestRemoteOpenWrtUCI:test_help_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " help")
    lu.assertStrContains(result, "uci-config - UCI Configuration Merge Tool")
    lu.assertStrContains(result, "Usage:")
    lu.assertStrContains(result, "CORE COMMANDS")
end

function TestRemoteOpenWrtUCI:test_backup_dry_run()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " backup --dry-run --name test-backup-remote")
    lu.assertStrContains(result, "DRY RUN")
    lu.assertStrContains(result, "test-backup-remote")
end

function TestRemoteOpenWrtUCI:test_validate_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " validate")
    lu.assertStrContains(result, "Validating UCI configuration")
end

function TestRemoteOpenWrtUCI:test_config_command_dry_run()
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " config --target default --dry-run")
    lu.assertStrContains(result, "Config command using target: default")
    lu.assertStrContains(result, "Source directory: ./etc/config/default")
    lu.assertStrContains(result, "default safety options")
    lu.assertStrContains(result, "preserve-network")
    lu.assertStrContains(result, "dedupe-lists")
    lu.assertStrContains(result, "preserve-existing")
end

function TestRemoteOpenWrtUCI:test_config_command_missing_target()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " config")
    lu.assertStrContains(result, "No target specified")
    lu.assertStrContains(result, "Usage: uci-config config --target")
end

function TestRemoteOpenWrtUCI:test_merge_dry_run()
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " merge --dry-run ./etc/config/default")
    lu.assertStrContains(result, "DRY RUN MODE")
    lu.assertStrContains(result, "No changes will be applied")
end

function TestRemoteOpenWrtUCI:test_invalid_command()
    local result, success = execute_command(UCI_CONFIG_TOOL .. " invalid-command")
    lu.assertStrContains(result, "Unknown command")
    lu.assertStrContains(result, "Use 'uci-config help'")
end

-- Test class for UCI config file validation on remote system
TestRemoteOpenWrtConfigFiles = {}

function TestRemoteOpenWrtConfigFiles:test_firewall_config_exists()
    lu.assertTrue(self:file_exists(REMOTE_CONFIG_DIR .. "/firewall"))
end

function TestRemoteOpenWrtConfigFiles:test_dhcp_config_exists()
    lu.assertTrue(self:file_exists(REMOTE_CONFIG_DIR .. "/dhcp"))
end

function TestRemoteOpenWrtConfigFiles:test_uhttpd_config_exists()
    lu.assertTrue(self:file_exists(REMOTE_CONFIG_DIR .. "/uhttpd"))
end

function TestRemoteOpenWrtConfigFiles:test_uspot_config_exists()
    lu.assertTrue(self:file_exists(REMOTE_CONFIG_DIR .. "/uspot"))
end

function TestRemoteOpenWrtConfigFiles:test_network_config_exists()
    lu.assertTrue(self:file_exists(REMOTE_CONFIG_DIR .. "/network"))
end

function TestRemoteOpenWrtConfigFiles:test_firewall_config_content()
    local content = self:read_file(REMOTE_CONFIG_DIR .. "/firewall")
    lu.assertStrContains(content, "config zone")
    lu.assertStrContains(content, "option name 'captive'")
    lu.assertStrContains(content, "config ipset")
    lu.assertStrContains(content, "option name 'uspot'")
end

function TestRemoteOpenWrtConfigFiles:test_uspot_config_content()
    local content = self:read_file(REMOTE_CONFIG_DIR .. "/uspot")
    lu.assertStrContains(content, "config uspot 'captive'")
    lu.assertStrContains(content, "option interface 'captive'")
    lu.assertStrContains(content, "option setname 'uspot'")
end

-- Test OpenWrt system integration
TestOpenWrtSystemIntegration = {}

function TestOpenWrtSystemIntegration:test_uci_system_available()
    local result, success = execute_command("which uci")
    lu.assertStrContains(result, "/sbin/uci")
end

function TestOpenWrtSystemIntegration:test_system_hostname()
    local result, success = execute_command("uci get system.@system[0].hostname")
    lu.assertNotNil(result)
    lu.assertTrue(string.len(result) > 0)
end

function TestOpenWrtSystemIntegration:test_real_firewall_config()
    local result, success = execute_command("uci show firewall | head -5")
    lu.assertStrContains(result, "firewall")
end

function TestOpenWrtSystemIntegration:test_real_network_config()
    local result, success = execute_command("uci show network | head -5")
    lu.assertStrContains(result, "network")
end

function TestOpenWrtSystemIntegration:test_actual_merge_dry_run()
    -- Test actual merge with real OpenWrt configs
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " config --target default --dry-run --verbose")
    lu.assertStrContains(result, "Changes that would be made:")
    lu.assertStrContains(result, "DRY RUN MODE")
end

-- Helper methods for config file tests
function TestRemoteOpenWrtConfigFiles:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

function TestRemoteOpenWrtConfigFiles:read_file(path)
    local f = io.open(path, "r")
    if f then
        local content = f:read("*a")
        f:close()
        return content
    end
    return nil
end

-- Run tests
print("=== TESTING UCI CONFIG MERGE TOOL ON REAL OPENWRT VM ===")
print("Target: 192.168.11.2 (OpenWrt aarch64)")
print("Testing CLI functionality, config files, and system integration...")
print("=" .. string.rep("=", 60))

-- Execute tests
os.exit(lu.LuaUnit.run())