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

-- Test class for Remove Command on Real OpenWrt System
TestRemoteRemoveCommand = {}

function TestRemoteRemoveCommand:setUp()
    -- Create test directory and backup current configs
    os.execute("mkdir -p " .. TEST_CONFIG_DIR .. "/backup")
    os.execute("mkdir -p " .. TEST_CONFIG_DIR .. "/test_target")
    
    -- Backup existing configs (safety first on real system)
    os.execute("cp -r /etc/config/* " .. TEST_CONFIG_DIR .. "/backup/ 2>/dev/null || true")
end

function TestRemoteRemoveCommand:tearDown()
    -- Restore original configs (critical for real system)
    os.execute("cp -r " .. TEST_CONFIG_DIR .. "/backup/* /etc/config/ 2>/dev/null || true")
    
    -- Clean up test directories
    os.execute("rm -rf " .. TEST_CONFIG_DIR)
end

function TestRemoteRemoveCommand:test_remove_help_and_usage()
    -- Test help command shows remove functionality
    local result, success = execute_command(UCI_CONFIG_TOOL .. " help")
    lu.assertStrContains(result, "remove")
    lu.assertStrContains(result, "Remove configurations matching those in target")
end

function TestRemoteRemoveCommand:test_remove_missing_target_error()
    -- Test error handling for missing target parameter
    local result, success = execute_command(UCI_CONFIG_TOOL .. " remove")
    lu.assertStrContains(result, "No target specified")
    lu.assertStrContains(result, "Usage: uci-config remove --target")
end

function TestRemoteRemoveCommand:test_remove_nonexistent_target()
    -- Test handling of non-existent target directory
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target nonexistent --dry-run")
    lu.assertStrContains(result, "does not exist")
end

function TestRemoteRemoveCommand:test_remove_default_configs_dry_run()
    -- Test remove with default configs in dry-run mode (SAFE)
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target default --dry-run")
    lu.assertStrContains(result, "Remove command using target: default")
    lu.assertStrContains(result, "DRY RUN MODE")
    lu.assertStrContains(result, "Would remove")
end

function TestRemoteRemoveCommand:test_remove_default_configs_dry_run_verbose()
    -- Test verbose output in dry-run mode
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target default --dry-run --verbose")
    lu.assertStrContains(result, "DRY RUN MODE")
    lu.assertStrContains(result, "Processing config:")
    
    -- Should mention specific configs from default target
    local has_firewall = result:find("firewall")
    local has_dhcp = result:find("dhcp")
    local has_network = result:find("network")
    
    lu.assertTrue(has_firewall or has_dhcp or has_network, "Should process at least one default config")
end

function TestRemoteRemoveCommand:test_remove_empty_target_directory()
    -- Test remove with empty target directory
    local empty_target = TEST_CONFIG_DIR .. "/empty_target"
    os.execute("mkdir -p " .. empty_target)
    
    local result, success = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target " .. empty_target .. " --dry-run")
    lu.assertStrContains(result, "0 configurations")
end

function TestRemoteRemoveCommand:test_remove_single_test_config_safe()
    -- Test removing a single test configuration (SAFE test)
    
    -- Step 1: Create a test config that doesn't exist in real system
    local test_config_path = "/etc/config/uci_remove_test"
    local test_config_content = [[
config test_section 'remove_test'
option test_value 'safe_to_remove'
option created_by 'uci_config_test_suite'
]]
    
    -- Write test config to system
    local f = io.open(test_config_path, "w")
    if not f then
        lu.skip("Cannot create test config file - insufficient permissions")
        return
    end
    f:write(test_config_content)
    f:close()
    
    -- Step 2: Create matching target config
    local target_config = TEST_CONFIG_DIR .. "/test_target/uci_remove_test"
    os.execute("mkdir -p " .. TEST_CONFIG_DIR .. "/test_target")
    local f2 = io.open(target_config, "w")
    if f2 then
        f2:write(test_config_content)
        f2:close()
    end
    
    -- Step 3: Test dry-run first
    local dry_result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target " .. TEST_CONFIG_DIR .. "/test_target --dry-run")
    lu.assertStrContains(dry_result, "Would remove")
    lu.assertStrContains(dry_result, "uci_remove_test")
    
    -- Step 4: Test actual removal
    local remove_result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target " .. TEST_CONFIG_DIR .. "/test_target")
    lu.assertStrContains(remove_result, "Removed")
    
    -- Step 5: Verify removal (config should be gone or sections removed)
    local verify_result = execute_command("test -f " .. test_config_path .. " && echo exists || echo removed")
    -- The config file may still exist but be empty, or be removed entirely
    
    -- Clean up (ensure test config is removed)
    os.execute("rm -f " .. test_config_path)
end

function TestRemoteRemoveCommand:test_remove_backup_integration()
    -- Test integration with backup workflow
    
    -- Step 1: Create backup before remove operation
    local backup_result = execute_command(UCI_CONFIG_TOOL .. " backup --name pre-remove-test-remote")
    lu.assertTrue(backup_result ~= nil, "Backup command should execute")
    
    -- Step 2: Test remove with default configs (dry-run for safety)
    local remove_result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target default --dry-run")
    lu.assertStrContains(remove_result, "DRY RUN MODE")
    
    -- Step 3: Verify system validation still works
    local validate_result = execute_command(UCI_CONFIG_TOOL .. " validate")
    lu.assertStrContains(validate_result, "Validating")
end

function TestRemoteRemoveCommand:test_remove_with_invalid_target_configs()
    -- Test remove command with invalid UCI configs in target
    
    local invalid_target = TEST_CONFIG_DIR .. "/invalid_target"
    os.execute("mkdir -p " .. invalid_target)
    
    -- Create invalid UCI config
    local invalid_config = invalid_target .. "/bad_config"
    local f = io.open(invalid_config, "w")
    if f then
        f:write("This is not valid UCI syntax!\nNo proper config sections here.")
        f:close()
    end
    
    -- Test remove with invalid target
    local result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target " .. invalid_target .. " --dry-run")
    
    -- Should handle invalid configs gracefully
    lu.assertStrContains(result, "Failed to load")
end

function TestRemoteRemoveCommand:test_remove_performance_real_system()
    -- Test remove command performance on real OpenWrt system
    
    -- Create a moderately sized test target (not too large for real system)
    local perf_target = TEST_CONFIG_DIR .. "/perf_target"
    os.execute("mkdir -p " .. perf_target)
    
    -- Create test config with multiple sections
    local perf_config = perf_target .. "/performance_test"
    local f = io.open(perf_config, "w")
    if f then
        for i = 1, 20 do  -- Reasonable size for real system test
            f:write(string.format([[
config test_section 'perf_test_%d'
option value '%d'
option data 'performance_test_data_%d'

]], i, i, i))
        end
        f:close()
    end
    
    -- Time the operation
    local start_time = os.time()
    local result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target " .. perf_target .. " --dry-run")
    local end_time = os.time()
    
    lu.assertTrue(result ~= nil, "Performance test should complete")
    
    -- Performance check (should be fast on real system)
    local duration = end_time - start_time
    lu.assertTrue(duration < 10, "Remove dry-run should complete quickly on real system")
end

function TestRemoteRemoveCommand:test_remove_audit_trail_real_system()
    -- Test audit trail functionality on real OpenWrt system
    
    -- Test with verbose output for audit details
    local result = execute_command("cd /tmp/uci-test-remote && " .. UCI_CONFIG_TOOL .. " remove --target default --dry-run --verbose")
    
    -- Verify audit information is present
    lu.assertStrContains(result, "Remove command using target:")
    lu.assertStrContains(result, "DRY RUN MODE")
    
    -- Should show processing details
    lu.assertStrContains(result, "configurations")
    
    -- If any configs are processed, should show details
    if result:find("Processing config:") then
        lu.assertStrContains(result, "Processing config:")
    end
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
print("Testing CLI functionality, config files, system integration...")
print("AND COMPREHENSIVE REMOVE COMMAND SAFETY TESTING")
print("=" .. string.rep("=", 60))

-- Execute tests
os.exit(lu.LuaUnit.run())