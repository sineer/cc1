#!/usr/bin/env lua

--[[
Advanced Integration Test Suite for UCI Config Merging
Tests real-world scenarios of merging uspot configs with existing OpenWrt configs
in Docker environment with comprehensive validation and rollback testing
]]

local lu = require('luaunit_compat')
local UCIMergeEngine = require('uci_merge_engine')
local lfs = require('lfs')

-- Test environment configuration
local TEST_ENV = {
    UCI_CONFIG_DIR = "/etc/config",
    BACKUP_DIR = "/tmp/uci-backup",
    TEST_TEMP_DIR = "/tmp/test-integration",
    USPOT_CONFIG_DIR = "/app/etc/config",
    DOCKER_CONTAINER = "openwrt-test"
}

-- Docker OpenWrt Integration Test Class
TestDockerOpenWrtIntegration = {}

function TestDockerOpenWrtIntegration:setUp()
    -- Create test directories
    os.execute("mkdir -p " .. TEST_ENV.BACKUP_DIR)
    os.execute("mkdir -p " .. TEST_ENV.TEST_TEMP_DIR)
    
    -- Initialize merge engine with Docker-aware settings
    self.engine = UCIMergeEngine.new({
        dry_run = false,
        dedupe_lists = true,
        preserve_network = true,
        create_backup = true
    })
    
    -- Setup test logging
    self.test_log = {}
    
    -- Verify Docker environment
    self:verify_docker_environment()
end

function TestDockerOpenWrtIntegration:tearDown()
    -- Clean up test directories
    os.execute("rm -rf " .. TEST_ENV.TEST_TEMP_DIR)
    
    -- Restore original configs if needed
    self:restore_original_configs()
end

function TestDockerOpenWrtIntegration:verify_docker_environment()
    -- Check if we're running in Docker container
    local in_docker = self:file_exists("/.dockerenv")
    lu.assertTrue(in_docker, "Tests must run in Docker OpenWrt environment")
    
    -- Check if UCI system is available
    local uci_available = self:command_exists("uci")
    lu.assertTrue(uci_available, "UCI system must be available")
    
    -- Check if essential config files exist
    lu.assertTrue(self:file_exists(TEST_ENV.UCI_CONFIG_DIR .. "/firewall"))
    lu.assertTrue(self:file_exists(TEST_ENV.UCI_CONFIG_DIR .. "/dhcp"))
    
    -- Create minimal network config if it doesn't exist (for testing)
    if not self:file_exists(TEST_ENV.UCI_CONFIG_DIR .. "/network") then
        self:create_minimal_network_config()
    end
    
    -- Check uspot config source files
    lu.assertTrue(self:file_exists(TEST_ENV.USPOT_CONFIG_DIR .. "/uspot"))
    lu.assertTrue(self:file_exists(TEST_ENV.USPOT_CONFIG_DIR .. "/firewall"))
    
    self:log("Docker OpenWrt environment verified successfully")
end

-- Test merging uspot config with existing UCI configs
function TestDockerOpenWrtIntegration:test_merge_uspot_with_existing_configs()
    self:log("Starting uspot config merge with existing UCI configs")
    
    -- Create backup of existing configs
    local backup_success = self:backup_existing_configs()
    lu.assertTrue(backup_success, "Failed to backup existing configs")
    
    -- Read existing configs to establish baseline
    local existing_firewall = self:read_uci_config("firewall")
    local existing_dhcp = self:read_uci_config("dhcp")
    local existing_network = self:read_uci_config("network")
    
    -- Merge uspot configs
    local merge_success, results = self.engine:merge_directory(
        TEST_ENV.USPOT_CONFIG_DIR,
        TEST_ENV.UCI_CONFIG_DIR
    )
    
    lu.assertTrue(merge_success, "Failed to merge uspot configs")
    lu.assertNotNil(results, "Merge results should not be nil")
    
    -- Verify merged configs
    self:verify_merged_firewall_config(existing_firewall)
    self:verify_merged_dhcp_config(existing_dhcp)
    self:verify_merged_network_config(existing_network)
    self:verify_new_uspot_config()
    
    -- Verify UCI system integrity
    local uci_valid = self:validate_uci_integrity()
    lu.assertTrue(uci_valid, "UCI system integrity check failed")
    
    self:log("uspot config merge completed successfully")
end

function TestDockerOpenWrtIntegration:verify_merged_firewall_config(original_config)
    local merged_config = self:read_uci_config("firewall")
    
    -- Verify original firewall zones are preserved
    local original_zones = self:extract_zones(original_config)
    for zone_name, zone_config in pairs(original_zones) do
        lu.assertNotNil(merged_config[zone_name], "Original zone " .. zone_name .. " should be preserved")
    end
    
    -- Verify uspot firewall components are added
    local captive_zone_found = false
    local uspot_ipset_found = false
    local captive_rules_found = 0
    
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "zone" and section_data.name == "captive" then
            captive_zone_found = true
            lu.assertEquals(section_data.input, "REJECT")
            lu.assertEquals(section_data.output, "ACCEPT")
            lu.assertEquals(section_data.forward, "REJECT")
        elseif section_data[".type"] == "ipset" and section_data.name == "uspot" then
            uspot_ipset_found = true
            lu.assertNotNil(section_data.match)
            lu.assertTrue(self:list_contains(section_data.match, "src_mac"))
        elseif section_data[".type"] == "rule" and section_data.src == "captive" then
            captive_rules_found = captive_rules_found + 1
        end
    end
    
    lu.assertTrue(captive_zone_found, "Captive zone should be created")
    lu.assertTrue(uspot_ipset_found, "uspot ipset should be created")
    lu.assertTrue(captive_rules_found >= 5, "At least 5 captive rules should be created")
    
    self:log("Firewall config verification completed")
end

function TestDockerOpenWrtIntegration:verify_merged_dhcp_config(original_config)
    local merged_config = self:read_uci_config("dhcp")
    
    -- Verify original DHCP sections are preserved
    for section_name, section_data in pairs(original_config) do
        if section_data[".type"] == "dhcp" then
            lu.assertNotNil(merged_config[section_name], "Original DHCP section " .. section_name .. " should be preserved")
        end
    end
    
    -- Check if captive DHCP section is added (if present in source)
    local captive_dhcp_found = false
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "dhcp" and section_data.interface == "captive" then
            captive_dhcp_found = true
            lu.assertNotNil(section_data.start)
            lu.assertNotNil(section_data.limit)
            break
        end
    end
    
    self:log("DHCP config verification completed")
end

function TestDockerOpenWrtIntegration:verify_merged_network_config(original_config)
    local merged_config = self:read_uci_config("network")
    
    -- Verify original network interfaces are preserved
    for section_name, section_data in pairs(original_config) do
        if section_data[".type"] == "interface" then
            lu.assertNotNil(merged_config[section_name], "Original interface " .. section_name .. " should be preserved")
        end
    end
    
    -- Check if captive interface is added (if present in source)
    local captive_interface_found = false
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "interface" and section_name == "captive" then
            captive_interface_found = true
            lu.assertNotNil(section_data.proto)
            break
        end
    end
    
    self:log("Network config verification completed")
end

function TestDockerOpenWrtIntegration:verify_new_uspot_config()
    local uspot_config = self:read_uci_config("uspot")
    lu.assertNotNil(uspot_config, "uspot config should exist after merge")
    
    -- Verify main uspot sections
    local captive_section_found = false
    local auth_modes_found = 0
    
    for section_name, section_data in pairs(uspot_config) do
        if section_data[".type"] == "uspot" then
            auth_modes_found = auth_modes_found + 1
            
            if section_name == "captive" then
                captive_section_found = true
                lu.assertEquals(section_data.interface, "captive")
                lu.assertEquals(section_data.setname, "uspot")
                lu.assertNotNil(section_data.mode)
                lu.assertNotNil(section_data.gateway)
                lu.assertNotNil(section_data.network)
            end
        end
    end
    
    lu.assertTrue(captive_section_found, "Main captive section should exist")
    lu.assertTrue(auth_modes_found >= 3, "At least 3 authentication modes should be configured")
    
    self:log("uspot config verification completed")
end

-- Test conflict resolution during merge
function TestDockerOpenWrtIntegration:test_conflict_resolution()
    self:log("Testing conflict resolution during merge")
    
    -- Create conflicting configuration
    local conflict_config = TEST_ENV.TEST_TEMP_DIR .. "/conflict_firewall"
    self:create_conflicting_firewall_config(conflict_config)
    
    -- Perform merge with conflict
    local engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true,
        preserve_existing = true
    })
    
    local success, result = engine:merge_config("firewall", conflict_config, TEST_ENV.UCI_CONFIG_DIR .. "/firewall")
    
    lu.assertTrue(success, "Merge should succeed even with conflicts")
    lu.assertTrue(#engine.conflicts > 0, "Conflicts should be detected")
    
    -- Verify conflict details
    local conflict_found = false
    for _, conflict in ipairs(engine.conflicts) do
        if conflict.config == "firewall" then
            conflict_found = true
            lu.assertNotNil(conflict.section)
            lu.assertNotNil(conflict.option)
            lu.assertNotNil(conflict.existing)
            lu.assertNotNil(conflict.new)
        end
    end
    
    lu.assertTrue(conflict_found, "Firewall conflict should be detected")
    
    self:log("Conflict resolution testing completed")
end

-- Test backup and rollback functionality
function TestDockerOpenWrtIntegration:test_backup_and_rollback()
    self:log("Testing backup and rollback functionality")
    
    -- Create initial backup
    local backup_path = TEST_ENV.BACKUP_DIR .. "/pre-merge-" .. os.time()
    local backup_success = self:create_config_backup(backup_path)
    lu.assertTrue(backup_success, "Initial backup should succeed")
    
    -- Perform merge operation
    local merge_success, results = self.engine:merge_directory(
        TEST_ENV.USPOT_CONFIG_DIR,
        TEST_ENV.UCI_CONFIG_DIR
    )
    lu.assertTrue(merge_success, "Merge operation should succeed")
    
    -- Verify configs were changed
    local post_merge_firewall = self:read_uci_config("firewall")
    local captive_zone_exists = self:zone_exists(post_merge_firewall, "captive")
    lu.assertTrue(captive_zone_exists, "Captive zone should exist after merge")
    
    -- Perform rollback
    local rollback_success = self:rollback_from_backup(backup_path)
    lu.assertTrue(rollback_success, "Rollback should succeed")
    
    -- Verify rollback restored original state
    local post_rollback_firewall = self:read_uci_config("firewall")
    local captive_zone_after_rollback = self:zone_exists(post_rollback_firewall, "captive")
    lu.assertFalse(captive_zone_after_rollback, "Captive zone should not exist after rollback")
    
    self:log("Backup and rollback testing completed")
end

-- Test error handling scenarios
function TestDockerOpenWrtIntegration:test_error_handling()
    self:log("Testing error handling scenarios")
    
    -- Test merging with non-existent source directory
    local engine = UCIMergeEngine.new({dry_run = true})
    local success, error_msg = engine:merge_directory("/nonexistent/path", TEST_ENV.UCI_CONFIG_DIR)
    lu.assertFalse(success, "Should fail with non-existent source")
    lu.assertNotNil(error_msg, "Error message should be provided")
    
    -- Test merging with invalid UCI config
    local invalid_config = TEST_ENV.TEST_TEMP_DIR .. "/invalid_config"
    self:create_invalid_uci_config(invalid_config)
    
    local success2, result2 = engine:merge_config("test", invalid_config, TEST_ENV.UCI_CONFIG_DIR .. "/firewall")
    -- Should handle gracefully without crashing
    lu.assertIsBoolean(success2, "Should return boolean result")
    
    self:log("Error handling testing completed")
end

-- Test network-aware list deduplication
function TestDockerOpenWrtIntegration:test_network_aware_deduplication()
    self:log("Testing network-aware list deduplication")
    
    -- Create test config with duplicate network entries
    local test_config = {
        zone_test = {
            [".type"] = "zone",
            name = "test",
            network = {"192.168.1.0/24", "192.168.001.000/24", "10.0.0.0/8", "192.168.1.0/24"}
        },
        ipset_test = {
            [".type"] = "ipset",
            name = "test",
            entry = {"192.168.1.1", "192.168.001.001", "10.0.0.1", "192.168.1.1"}
        }
    }
    
    local engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
    
    local result = engine:merge_sections({}, test_config, "firewall")
    
    -- Verify deduplication occurred
    lu.assertTrue(#result.zone_test.network < 4, "Network list should be deduplicated")
    lu.assertTrue(#result.ipset_test.entry < 4, "Entry list should be deduplicated")
    
    -- Verify normalized IPs are preserved
    local has_normalized_ip = false
    for _, ip in ipairs(result.ipset_test.entry) do
        if ip == "192.168.1.1" then
            has_normalized_ip = true
            break
        end
    end
    lu.assertTrue(has_normalized_ip, "Normalized IP should be preserved")
    
    self:log("Network-aware deduplication testing completed")
end

-- Test performance with large configurations
function TestDockerOpenWrtIntegration:test_large_config_performance()
    self:log("Testing performance with large configurations")
    
    local start_time = os.clock()
    
    -- Create large test configuration
    local large_config = self:create_large_test_config(1000) -- 1000 sections
    
    local engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
    
    -- Perform merge with large config
    local success, result = engine:merge_sections({}, large_config, "test")
    
    local end_time = os.clock()
    local duration = end_time - start_time
    
    lu.assertTrue(success, "Large config merge should succeed")
    lu.assertNotNil(result, "Result should not be nil")
    lu.assertTrue(duration < 5.0, "Merge should complete within 5 seconds")
    
    self:log(string.format("Large config performance test completed in %.2f seconds", duration))
end

-- Helper functions
function TestDockerOpenWrtIntegration:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

function TestDockerOpenWrtIntegration:command_exists(command)
    local result = os.execute("which " .. command .. " > /dev/null 2>&1")
    return result == 0
end

function TestDockerOpenWrtIntegration:read_uci_config(config_name)
    local handle = io.popen("uci export " .. config_name .. " 2>/dev/null")
    if not handle then
        return {}
    end
    
    local config_data = {}
    local current_section = nil
    
    for line in handle:lines() do
        line = line:match("^%s*(.-)%s*$") -- trim whitespace
        if line:match("^config%s+") then
            local type_name, section_name = line:match("^config%s+(%S+)%s*'?([^']*)'?")
            if type_name and section_name ~= "" then
                current_section = section_name
                config_data[current_section] = {[".type"] = type_name}
            end
        elseif line:match("^option%s+") and current_section then
            local option_name, option_value = line:match("^option%s+(%S+)%s+'([^']*)'")
            if option_name and option_value then
                config_data[current_section][option_name] = option_value
            end
        elseif line:match("^list%s+") and current_section then
            local list_name, list_value = line:match("^list%s+(%S+)%s+'([^']*)'")
            if list_name and list_value then
                if not config_data[current_section][list_name] then
                    config_data[current_section][list_name] = {}
                end
                table.insert(config_data[current_section][list_name], list_value)
            end
        end
    end
    
    handle:close()
    return config_data
end

function TestDockerOpenWrtIntegration:backup_existing_configs()
    local timestamp = os.date("%Y%m%d_%H%M%S")
    local backup_path = TEST_ENV.BACKUP_DIR .. "/backup_" .. timestamp
    
    local success = os.execute("mkdir -p " .. backup_path) == 0
    if not success then return false end
    
    local configs = {"firewall", "dhcp", "network", "uhttpd"}
    for _, config in ipairs(configs) do
        local src = TEST_ENV.UCI_CONFIG_DIR .. "/" .. config
        local dst = backup_path .. "/" .. config
        if self:file_exists(src) then
            local copy_success = os.execute("cp " .. src .. " " .. dst) == 0
            if not copy_success then return false end
        end
    end
    
    return true
end

function TestDockerOpenWrtIntegration:create_config_backup(backup_path)
    local success = os.execute("mkdir -p " .. backup_path) == 0
    if not success then return false end
    
    local configs = {"firewall", "dhcp", "network", "uhttpd"}
    for _, config in ipairs(configs) do
        local src = TEST_ENV.UCI_CONFIG_DIR .. "/" .. config
        local dst = backup_path .. "/" .. config
        if self:file_exists(src) then
            local copy_success = os.execute("cp " .. src .. " " .. dst) == 0
            if not copy_success then return false end
        end
    end
    
    return true
end

function TestDockerOpenWrtIntegration:rollback_from_backup(backup_path)
    local configs = {"firewall", "dhcp", "network", "uhttpd"}
    for _, config in ipairs(configs) do
        local src = backup_path .. "/" .. config
        local dst = TEST_ENV.UCI_CONFIG_DIR .. "/" .. config
        if self:file_exists(src) then
            local copy_success = os.execute("cp " .. src .. " " .. dst) == 0
            if not copy_success then return false end
            
            -- Reload UCI config
            os.execute("uci revert " .. config)
            os.execute("uci commit " .. config)
        end
    end
    
    return true
end

function TestDockerOpenWrtIntegration:restore_original_configs()
    -- Implementation for restoring original configs if needed
    self:log("Restoring original configurations")
end

function TestDockerOpenWrtIntegration:validate_uci_integrity()
    local result = os.execute("uci show > /dev/null 2>&1")
    return result == 0
end

function TestDockerOpenWrtIntegration:extract_zones(config)
    local zones = {}
    for section_name, section_data in pairs(config) do
        if section_data[".type"] == "zone" then
            zones[section_name] = section_data
        end
    end
    return zones
end

function TestDockerOpenWrtIntegration:zone_exists(config, zone_name)
    for section_name, section_data in pairs(config) do
        if section_data[".type"] == "zone" and section_data.name == zone_name then
            return true
        end
    end
    return false
end

function TestDockerOpenWrtIntegration:list_contains(list, item)
    if type(list) ~= "table" then return false end
    for _, value in ipairs(list) do
        if value == item then
            return true
        end
    end
    return false
end

function TestDockerOpenWrtIntegration:create_conflicting_firewall_config(filepath)
    local content = [[
config zone
    option name 'lan'
    option input 'DROP'
    option output 'DROP'
    option forward 'DROP'
    list network 'lan'
]]
    
    local f = io.open(filepath, "w")
    if f then
        f:write(content)
        f:close()
        return true
    end
    return false
end

function TestDockerOpenWrtIntegration:create_invalid_uci_config(filepath)
    local content = [[
invalid config syntax
this is not valid UCI format
]]
    
    local f = io.open(filepath, "w")
    if f then
        f:write(content)
        f:close()
        return true
    end
    return false
end

function TestDockerOpenWrtIntegration:create_large_test_config(section_count)
    local config = {}
    
    for i = 1, section_count do
        local section_name = "section_" .. i
        config[section_name] = {
            [".type"] = "rule",
            name = "test_rule_" .. i,
            proto = "tcp",
            target = "ACCEPT",
            dest_port = tostring(8000 + i)
        }
        
        -- Add some with lists
        if i % 10 == 0 then
            config[section_name].list_option = {"item1", "item2", "item3"}
        end
    end
    
    return config
end

function TestDockerOpenWrtIntegration:create_minimal_network_config()
    local network_config = [[
config interface 'loopback'
    option ifname 'lo'
    option proto 'static'
    option ipaddr '127.0.0.1'
    option netmask '255.0.0.0'

config interface 'lan'
    option type 'bridge'
    option ifname 'eth0'
    option proto 'static'
    option ipaddr '192.168.1.1'
    option netmask '255.255.255.0'
    option ip6assign '60'
]]
    
    local f = io.open(TEST_ENV.UCI_CONFIG_DIR .. "/network", "w")
    if f then
        f:write(network_config)
        f:close()
        -- Reload UCI to recognize the new config
        os.execute("uci revert network 2>/dev/null")
        os.execute("uci commit network 2>/dev/null")
        return true
    end
    return false
end

function TestDockerOpenWrtIntegration:log(message)
    local timestamp = os.date("%Y-%m-%d %H:%M:%S")
    local log_entry = string.format("[%s] %s", timestamp, message)
    table.insert(self.test_log, log_entry)
    print(log_entry)
end

-- Test class for dry-run mode validation
TestDryRunMode = {}

function TestDryRunMode:setUp()
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestDryRunMode:test_dry_run_no_changes()
    -- Read original configs
    local original_firewall = self:read_file_content(TEST_ENV.UCI_CONFIG_DIR .. "/firewall")
    
    -- Perform dry run merge
    local success, results = self.engine:merge_directory(
        TEST_ENV.USPOT_CONFIG_DIR,
        TEST_ENV.UCI_CONFIG_DIR
    )
    
    lu.assertTrue(success, "Dry run should succeed")
    
    -- Verify no actual changes were made
    local current_firewall = self:read_file_content(TEST_ENV.UCI_CONFIG_DIR .. "/firewall")
    lu.assertEquals(original_firewall, current_firewall, "Firewall config should be unchanged in dry run")
    
    -- Verify changes were tracked
    lu.assertTrue(#self.engine.changes > 0, "Changes should be tracked in dry run")
end

function TestDryRunMode:read_file_content(filepath)
    local f = io.open(filepath, "r")
    if f then
        local content = f:read("*a")
        f:close()
        return content
    end
    return nil
end

-- Run all tests
print("Running Advanced UCI Configuration Integration Tests...")
print("Testing Docker OpenWrt environment with real uspot config merging...")
print("========================================")

-- Execute tests
os.exit(lu.LuaUnit.run())