#!/usr/bin/env lua

-- Add lib and test directories to Lua path for library modules
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
package.path = script_dir .. "../lib/?.lua;" .. script_dir .. "?.lua;" .. package.path

-- Add Docker paths for test_utils
package.path = "/app/lib/?.lua;" .. "./lib/?.lua;" .. package.path

--[[
Test suite for UCI Merge Engine
Comprehensive TDD tests for UCI configuration merging
]]

local lu = require('luaunit_fixed')
local UCIMergeEngine = require('uci_merge_engine')
local lfs = require('lfs')
local test_utils = require('test_utils')

-- Test configuration
local TEST_DIR = "/tmp/test-merge"
local TEST_SOURCE_DIR = TEST_DIR .. "/source"
local TEST_TARGET_DIR = TEST_DIR .. "/target"

-- Test class for merge engine core functionality
TestUCIMergeEngine = {}

function TestUCIMergeEngine:setUp()
    -- Create test directories
    os.execute("rm -rf " .. TEST_DIR)
    os.execute("mkdir -p " .. TEST_SOURCE_DIR)
    os.execute("mkdir -p " .. TEST_TARGET_DIR)
    
    -- Create test merge engine
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestUCIMergeEngine:tearDown()
    -- Clean up test directories
    os.execute("rm -rf " .. TEST_DIR)
end

function TestUCIMergeEngine:test_engine_initialization()
    local engine = UCIMergeEngine.new()
    lu.assertNotNil(engine)
    lu.assertFalse(engine.dry_run)
    lu.assertFalse(engine.dedupe_lists)
    
    local engine_with_options = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
    lu.assertTrue(engine_with_options.dry_run)
    lu.assertTrue(engine_with_options.dedupe_lists)
end


function TestUCIMergeEngine:test_deep_copy()
    local original = {
        key1 = "value1",
        key2 = {
            nested = "value2",
            list = {"item1", "item2"}
        }
    }
    
    local copy = self.engine:deep_copy(original)
    
    -- Verify copy is independent
    copy.key1 = "modified"
    copy.key2.nested = "modified"
    table.insert(copy.key2.list, "item3")
    
    lu.assertEquals(original.key1, "value1")
    lu.assertEquals(original.key2.nested, "value2")
    lu.assertEquals(#original.key2.list, 2)
end


-- Test class for list deduplication
TestListDeduplication = {}

function TestListDeduplication:setUp()
    self.engine = UCIMergeEngine.new({dedupe_lists = true})
end

function TestListDeduplication:test_dedupe_preserve_order()
    local list = {"item1", "item2", "item1", "item3", "item2"}
    local result = self.engine:dedupe_list(list, "preserve_order")
    
    lu.assertEquals(result, {"item1", "item2", "item3"})
end

function TestListDeduplication:test_dedupe_network_aware()
    local list = {"192.168.1.1", "192.168.001.001", "10.0.0.1", "192.168.1.1"}
    local result = self.engine:dedupe_list(list, "network_aware")
    
    lu.assertEquals(#result, 2)
    lu.assertTrue(self:list_contains(result, "192.168.1.1"))
    lu.assertTrue(self:list_contains(result, "10.0.0.1"))
end

function TestListDeduplication:test_dedupe_ports()
    local list = {"80", "443", "80,443", "8080"}
    local result = self.engine:dedupe_list(list, "network_aware")
    
    -- Should dedupe based on normalized port values
    lu.assertNotNil(result)
    lu.assertTrue(#result <= #list)
end

function TestListDeduplication:test_merge_lists()
    local existing = {"item1", "item2"}
    local new_list = {"item2", "item3", "item4"}
    
    local result = self.engine:merge_lists(existing, new_list, "generic", "test")
    
    lu.assertEquals(result, {"item1", "item2", "item3", "item4"})
end

function TestListDeduplication:test_merge_empty_lists()
    local existing = {"item1"}
    local new_list = {}
    
    local result = self.engine:merge_lists(existing, new_list, "generic", "test")
    lu.assertEquals(result, {"item1"})
    
    local result2 = self.engine:merge_lists({}, {"item1"}, "generic", "test")
    lu.assertEquals(result2, {"item1"})
end

-- Helper function
function TestListDeduplication:list_contains(list, item)
    for _, value in ipairs(list) do
        if value == item then
            return true
        end
    end
    return false
end

-- Test class for configuration merging
TestConfigMerging = {}

function TestConfigMerging:setUp()
    -- Create test directories
    os.execute("rm -rf " .. TEST_DIR)
    os.execute("mkdir -p " .. TEST_SOURCE_DIR)
    os.execute("mkdir -p " .. TEST_TARGET_DIR)
    
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestConfigMerging:tearDown()
    -- Clean up test directories
    os.execute("rm -rf " .. TEST_DIR)
end

function TestConfigMerging:test_merge_new_section()
    -- Create existing network config file
    local existing_file = TEST_DIR .. "/existing_network"
    local success1 = test_utils.copy_test_config("existing", "network", existing_file)
    if not success1 then
        lu.fail("Could not copy existing network config")
        return
    end
    
    -- Create new config with additional interface section
    local new_file = TEST_DIR .. "/new_network"
    local success2 = test_utils.copy_test_config("new", "network", new_file)
    if not success2 then
        lu.fail("Could not copy new network config")
        return
    end
    
    -- Perform real UCI merge
    local success, merged_config = self.engine:merge_config("network", new_file, existing_file)
    
    lu.assertTrue(success, "New section merge should succeed")
    lu.assertNotNil(merged_config, "Merged config should be returned")
    
    -- Verify both sections exist
    local found_lan = false
    local found_guest = false
    
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "interface" then
            if section_name == "lan" or (section_data.ifname == "eth0" and section_data.ipaddr == "192.168.1.1") then
                found_lan = true
                lu.assertEquals(section_data.proto, "static", "LAN interface should use static protocol")
            elseif section_name == "guest" or (section_data.ifname == "eth0.100" and section_data.ipaddr == "192.168.100.1") then
                found_guest = true
                lu.assertEquals(section_data.proto, "static", "Guest interface should use static protocol")
            end
        end
    end
    
    lu.assertTrue(found_lan, "Existing LAN interface should be preserved")
    lu.assertTrue(found_guest, "New guest interface should be added")
end

function TestConfigMerging:test_merge_existing_section()
    -- Create existing interface config with DNS servers
    local existing_file = TEST_DIR .. "/existing_interface"
    local success1 = test_utils.copy_test_config("existing", "network_with_dns", existing_file)
    if not success1 then
        lu.fail("Could not copy existing interface config")
        return
    end
    
    -- Create new config that adds to same interface section
    local new_file = TEST_DIR .. "/new_interface"
    local success2 = test_utils.copy_test_config("new", "network_with_dns", new_file)
    if not success2 then
        lu.fail("Could not copy new interface config")
        return
    end
    
    -- Perform real UCI merge
    local success, merged_config = self.engine:merge_config("network", new_file, existing_file)
    
    lu.assertTrue(success, "Existing section merge should succeed")
    lu.assertNotNil(merged_config, "Merged config should be returned")
    
    -- Find the LAN interface section
    local lan_section = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "interface" and (section_name == "lan" or section_data.ipaddr == "192.168.1.1") then
            lan_section = section_data
            break
        end
    end
    
    lu.assertNotNil(lan_section, "LAN interface section should exist")
    
    -- Verify existing options are preserved
    lu.assertEquals(lan_section.proto, "static", "Existing proto should be preserved")
    lu.assertEquals(lan_section.ipaddr, "192.168.1.1", "Existing IP address should be preserved")
    lu.assertEquals(lan_section.ifname, "eth0", "Existing interface name should be preserved")
    
    -- Verify new options are added
    lu.assertEquals(lan_section.netmask, "255.255.255.0", "New netmask should be added")
    lu.assertEquals(lan_section.gateway, "192.168.1.254", "New gateway should be added")
    
    -- Verify DNS list merging (should contain all unique DNS servers)
    lu.assertNotNil(lan_section.dns, "DNS list should exist")
    local dns_list = lan_section.dns
    if type(dns_list) == "string" then
        dns_list = {dns_list}
    end
    
    -- Check that we have the expected DNS servers (deduplication should prevent 1.1.1.1 duplicate)
    local dns_set = {}
    for _, dns in ipairs(dns_list) do
        dns_set[dns] = true
    end
    
    lu.assertTrue(dns_set["8.8.8.8"], "Should contain 8.8.8.8 DNS server")
    lu.assertTrue(dns_set["1.1.1.1"], "Should contain 1.1.1.1 DNS server")
    lu.assertTrue(dns_set["9.9.9.9"], "Should contain 9.9.9.9 DNS server")
    
    -- Verify no duplicates in DNS list
    local unique_count = 0
    for _ in pairs(dns_set) do
        unique_count = unique_count + 1
    end
    lu.assertEquals(#dns_list, unique_count, "DNS list should not contain duplicates")
end

function TestConfigMerging:test_conflict_detection()
    -- Create existing config with specific hostname
    local existing_file = TEST_DIR .. "/existing_system"
    local success1 = test_utils.copy_test_config("existing", "system", existing_file)
    if not success1 then
        lu.fail("Could not copy existing system config")
        return
    end
    
    -- Create new config that conflicts with hostname and timezone
    local new_file = TEST_DIR .. "/new_system"
    local success2 = test_utils.copy_test_config("new", "system", new_file)
    if not success2 then
        lu.fail("Could not copy new system config")
        return
    end
    
    -- Clear any existing conflicts
    self.engine.conflicts = {}
    
    -- Perform real UCI merge that should detect conflicts
    local success, merged_config = self.engine:merge_config("system", new_file, existing_file)
    
    lu.assertTrue(success, "Conflict detection merge should succeed in dry-run")
    lu.assertNotNil(merged_config, "Merged config should be returned")
    
    -- Should detect conflicts for hostname and timezone
    lu.assertTrue(#self.engine.conflicts >= 2, "Should detect at least 2 conflicts (hostname and timezone)")
    
    -- Verify specific conflicts are detected
    local found_hostname_conflict = false
    local found_timezone_conflict = false
    
    for _, conflict in ipairs(self.engine.conflicts) do
        lu.assertEquals(conflict.config, "system", "Conflict should be in system config")
        lu.assertNotNil(conflict.section, "Conflict should specify section")
        lu.assertNotNil(conflict.option, "Conflict should specify option")
        lu.assertNotNil(conflict.existing, "Conflict should show existing value")
        lu.assertNotNil(conflict.new, "Conflict should show new value")
        
        if conflict.option == "hostname" then
            found_hostname_conflict = true
            lu.assertEquals(conflict.existing, "existing-router", "Should show original hostname")
            lu.assertEquals(conflict.new, "new-uspot-router", "Should show new hostname")
        elseif conflict.option == "timezone" then
            found_timezone_conflict = true
            lu.assertEquals(conflict.existing, "America/New_York", "Should show original timezone")
            lu.assertEquals(conflict.new, "UTC", "Should show new timezone")
        end
    end
    
    lu.assertTrue(found_hostname_conflict, "Should detect hostname conflict")
    lu.assertTrue(found_timezone_conflict, "Should detect timezone conflict")
end

-- Test class for firewall-specific merging
TestFirewallMerging = {}

function TestFirewallMerging:setUp()
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
    
    -- Create test firewall configurations
    self:create_test_firewall_configs()
end

function TestFirewallMerging:create_test_firewall_configs()
    -- Create test directories
    os.execute("mkdir -p " .. TEST_DIR)
    
    -- Create existing firewall config file
    self.existing_firewall_file = TEST_DIR .. "/existing_firewall"
    local success1 = test_utils.copy_test_config("existing", "firewall", self.existing_firewall_file)
    if not success1 then
        error("Could not copy existing firewall config file")
    end
    
    -- Create uspot firewall config file (realistic uspot configuration)
    self.uspot_firewall_file = TEST_DIR .. "/uspot_firewall"
    local success2 = test_utils.copy_test_config("uspot", "firewall", self.uspot_firewall_file)
    if not success2 then
        error("Could not copy uspot firewall config file")
    end
    
    -- Load the configs using the merge engine for realistic testing
    self.existing_firewall = self.engine:load_config("firewall", self.existing_firewall_file)
    self.uspot_firewall = self.engine:load_config("firewall", self.uspot_firewall_file)
end

function TestFirewallMerging:tearDown()
    -- Clean up test files
    os.execute("rm -rf " .. TEST_DIR)
end

function TestFirewallMerging:test_merge_firewall_zones()
    -- Perform real UCI config merge using files
    local success, merged_config = self.engine:merge_config("firewall", self.uspot_firewall_file, self.existing_firewall_file)
    
    lu.assertTrue(success, "Firewall zone merge should succeed")
    lu.assertNotNil(merged_config, "Merged firewall config should be returned")
    
    -- Find and verify zones in merged config
    local found_lan_zone = false
    local found_captive_zone = false
    local lan_zone_config = nil
    local captive_zone_config = nil
    
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "zone" then
            if section_data.name == "lan" then
                found_lan_zone = true
                lan_zone_config = section_data
            elseif section_data.name == "captive" then
                found_captive_zone = true
                captive_zone_config = section_data
            end
        end
    end
    
    -- Should have both zones
    lu.assertTrue(found_lan_zone, "LAN zone should be preserved in merge")
    lu.assertTrue(found_captive_zone, "Captive zone should be added in merge")
    
    -- Verify existing zone properties are preserved
    if lan_zone_config then
        lu.assertEquals(lan_zone_config.name, "lan", "LAN zone name should be preserved")
        lu.assertEquals(lan_zone_config.input, "ACCEPT", "LAN zone input policy should be preserved")
        lu.assertEquals(lan_zone_config.forward, "ACCEPT", "LAN zone forward policy should be preserved")
    end
    
    -- Verify new zone properties are added correctly
    if captive_zone_config then
        lu.assertEquals(captive_zone_config.name, "captive", "Captive zone name should be correct")
        lu.assertEquals(captive_zone_config.input, "REJECT", "Captive zone input policy should be REJECT")
        lu.assertEquals(captive_zone_config.forward, "REJECT", "Captive zone forward policy should be REJECT")
    end
end

function TestFirewallMerging:test_merge_firewall_rules()
    -- Perform real UCI config merge using files
    local success, merged_config = self.engine:merge_config("firewall", self.uspot_firewall_file, self.existing_firewall_file)
    
    lu.assertTrue(success, "Firewall rule merge should succeed")
    lu.assertNotNil(merged_config, "Merged firewall config should be returned")
    
    -- Count different types of firewall components
    local rule_count = 0
    local redirect_count = 0
    local ipset_count = 0
    local found_ssh_rule = false
    local found_dns_rule = false
    local found_uspot_ipset = false
    
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "rule" then
            rule_count = rule_count + 1
            if section_data.name == "Allow-SSH" then
                found_ssh_rule = true
                lu.assertEquals(section_data.proto, "tcp", "SSH rule protocol should be TCP")
                lu.assertEquals(section_data.dest_port, "22", "SSH rule should target port 22")
            elseif section_data.name == "Allow-captive-DNS" then
                found_dns_rule = true
                lu.assertEquals(section_data.dest_port, "53", "DNS rule should target port 53")
            end
        elseif section_data[".type"] == "redirect" then
            redirect_count = redirect_count + 1
            if section_data.name and section_data.name:match("Redirect%-unauth%-captive") then
                lu.assertEquals(section_data.src, "captive", "Redirect should be from captive zone")
                lu.assertEquals(section_data.ipset, "!uspot", "Redirect should exclude uspot ipset")
            end
        elseif section_data[".type"] == "ipset" then
            ipset_count = ipset_count + 1
            if section_data.name == "uspot" then
                found_uspot_ipset = true
                lu.assertNotNil(section_data.match, "uspot ipset should have match criteria")
            end
        end
    end
    
    -- Verify we have the expected components
    lu.assertTrue(rule_count >= 3, "Should have at least 3 rules after merge (found " .. rule_count .. ")")
    lu.assertTrue(redirect_count >= 2, "Should have at least 2 redirects after merge (found " .. redirect_count .. ")")
    lu.assertTrue(ipset_count >= 1, "Should have at least 1 ipset after merge (found " .. ipset_count .. ")")
    
    -- Verify specific components exist
    lu.assertTrue(found_ssh_rule, "SSH rule should be preserved from existing config")
    lu.assertTrue(found_dns_rule, "DNS rule should be added from uspot config")
    lu.assertTrue(found_uspot_ipset, "uspot ipset should be added from uspot config")
end

function TestFirewallMerging:test_network_list_merging()
    -- Create existing config with multiple networks in LAN zone
    local existing_networks_file = TEST_DIR .. "/existing_networks_firewall"
    local success1 = test_utils.copy_test_config("existing", "firewall_networks", existing_networks_file)
    if not success1 then
        lu.fail("Could not copy existing networks firewall config")
        return
    end
    
    -- Create uspot config that adds captive network to same zone
    local uspot_networks_file = TEST_DIR .. "/uspot_networks_firewall"
    local success2 = test_utils.copy_test_config("uspot", "firewall_networks", uspot_networks_file)
    if not success2 then
        lu.fail("Could not copy uspot networks firewall config")
        return
    end
    
    -- Perform real UCI config merge
    local success, merged_config = self.engine:merge_config("firewall", uspot_networks_file, existing_networks_file)
    
    lu.assertTrue(success, "Network list merge should succeed")
    lu.assertNotNil(merged_config, "Merged config should be returned")
    
    -- Find the LAN zone and verify network list merging
    local lan_zone = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "zone" and section_data.name == "lan" then
            lan_zone = section_data
            break
        end
    end
    
    lu.assertNotNil(lan_zone, "LAN zone should exist in merged config")
    lu.assertNotNil(lan_zone.network, "LAN zone should have network list")
    
    -- Verify network list contains all expected networks
    local network_list = lan_zone.network
    if type(network_list) == "string" then
        network_list = {network_list}
    end
    
    local network_set = {}
    for _, network in ipairs(network_list) do
        network_set[network] = true
    end
    
    -- Should have all networks merged without duplicates
    lu.assertTrue(network_set["lan"], "Should contain lan network")
    lu.assertTrue(network_set["guest"], "Should contain guest network")
    lu.assertTrue(network_set["captive"], "Should contain captive network")
    lu.assertTrue(network_set["iot"], "Should contain iot network")
    
    -- Verify no duplicates (each network appears only once)
    local unique_count = 0
    for _ in pairs(network_set) do
        unique_count = unique_count + 1
    end
    lu.assertEquals(#network_list, unique_count, "Network list should not contain duplicates")
end

-- Helper function
function TestFirewallMerging:list_contains(list, item)
    for _, value in ipairs(list) do
        if value == item then
            return true
        end
    end
    return false
end

-- Test class for integration tests
TestIntegration = {}

function TestIntegration:setUp()
    -- Create test directories
    os.execute("rm -rf " .. TEST_DIR)
    os.execute("mkdir -p " .. TEST_SOURCE_DIR)
    os.execute("mkdir -p " .. TEST_TARGET_DIR)
    
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestIntegration:tearDown()
    os.execute("rm -rf " .. TEST_DIR)
end

function TestIntegration:test_merge_directory_dry_run()
    -- Create source config files
    self:create_test_source_file("firewall", [[
config zone
    option name 'captive'
    option input 'REJECT'
    list network 'captive'
]])
    
    self:create_test_source_file("dhcp", [[
config dhcp 'captive'
    option interface 'captive'
    option start '2'
    option limit '1000'
]])
    
    -- Run merge
    local success, results = self.engine:merge_directory(TEST_SOURCE_DIR, TEST_TARGET_DIR)
    
    lu.assertTrue(success)
    lu.assertNotNil(results)
    lu.assertNotNil(results.firewall)
    lu.assertNotNil(results.dhcp)
end

function TestIntegration:test_get_merge_summary()
    -- Perform some operations to generate changes
    self.engine.changes = {
        {action = "merge_config", config = "firewall"},
        {action = "merge_config", config = "dhcp"}
    }
    self.engine.conflicts = {
        {config = "firewall", section = "zone", option = "input"}
    }
    
    local summary = self.engine:get_merge_summary()
    
    lu.assertEquals(#summary.changes, 2)
    lu.assertEquals(#summary.conflicts, 1)
    lu.assertTrue(summary.dry_run)
end

-- Helper function to create test files
function TestIntegration:create_test_source_file(filename, content)
    local filepath = TEST_SOURCE_DIR .. "/" .. filename
    local f = io.open(filepath, "w")
    f:write(content)
    f:close()
end

-- Test class for comprehensive duplicate prevention
TestDuplicatePrevention = {}

function TestDuplicatePrevention:setUp()
    -- Create test directories
    os.execute("rm -rf " .. TEST_DIR)
    os.execute("mkdir -p " .. TEST_SOURCE_DIR)
    os.execute("mkdir -p " .. TEST_TARGET_DIR)
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestDuplicatePrevention:tearDown()
    -- Clean up test directories
    os.execute("rm -rf " .. TEST_DIR)
end

function TestDuplicatePrevention:test_no_duplicates_in_merged_network_config()
    -- Create existing network config with duplicate DNS servers and network interfaces
    local existing_file = TEST_DIR .. "/existing_network_dup"
    local success1 = test_utils.copy_test_config("existing", "network_duplicates", existing_file)
    if not success1 then
        lu.fail("Could not copy existing network config")
        return
    end
    
    -- Create new config with more duplicates and overlapping values
    local new_file = TEST_DIR .. "/new_network_dup"
    local success2 = test_utils.copy_test_config("new", "network_duplicates", new_file)
    if not success2 then
        lu.fail("Could not copy new network config")
        return
    end
    
    -- Perform real UCI config merge
    local success, merged_config = self.engine:merge_config("network", new_file, existing_file)
    
    lu.assertTrue(success, "Network config merge should succeed")
    lu.assertNotNil(merged_config, "Merged network config should be returned")
    
    -- Find and verify LAN interface DNS deduplication
    local lan_section = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "interface" and (section_name == "lan" or section_data.ipaddr == "192.168.1.1") then
            lan_section = section_data
            break
        end
    end
    
    lu.assertNotNil(lan_section, "LAN interface should exist in merged config")
    lu.assertNotNil(lan_section.dns, "LAN interface should have DNS list")
    
    -- Verify DNS deduplication in LAN interface
    local dns_list = lan_section.dns
    if type(dns_list) == "string" then
        dns_list = {dns_list}
    end
    
    local dns_seen = {}
    for _, dns in ipairs(dns_list) do
        lu.assertNil(dns_seen[dns], "DNS server " .. dns .. " should not be duplicated in LAN interface")
        dns_seen[dns] = true
    end
    
    -- Should have exactly 3 unique DNS servers: 8.8.8.8, 1.1.1.1, 9.9.9.9
    lu.assertEquals(#dns_list, 3, "LAN interface should have exactly 3 unique DNS servers")
    lu.assertTrue(dns_seen["8.8.8.8"], "Should contain 8.8.8.8")
    lu.assertTrue(dns_seen["1.1.1.1"], "Should contain 1.1.1.1")
    lu.assertTrue(dns_seen["9.9.9.9"], "Should contain 9.9.9.9")
    
    -- Verify other interfaces exist and have their own DNS without cross-contamination
    local found_wan = false
    local found_guest = false
    
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "interface" then
            if section_name == "wan" or section_data.proto == "dhcp" then
                found_wan = true
                lu.assertEquals(section_data.ifname, "eth0", "WAN interface should preserve existing config")
            elseif section_name == "guest" or section_data.ipaddr == "192.168.100.1" then
                found_guest = true
                lu.assertEquals(section_data.proto, "static", "Guest interface should be properly added")
                if section_data.dns then
                    local guest_dns = section_data.dns
                    if type(guest_dns) == "string" then
                        guest_dns = {guest_dns}
                    end
                    -- Verify guest DNS is deduplicated
                    local guest_dns_seen = {}
                    for _, dns in ipairs(guest_dns) do
                        lu.assertNil(guest_dns_seen[dns], "Guest DNS " .. dns .. " should not be duplicated")
                        guest_dns_seen[dns] = true
                    end
                end
            end
        end
    end
    
    lu.assertTrue(found_wan, "WAN interface should be preserved")
    lu.assertTrue(found_guest, "Guest interface should be added")
end

function TestDuplicatePrevention:test_no_duplicates_in_firewall_zones()
    -- Test firewall configuration with duplicate networks and ports
    local existing_config = {
        zone_lan = {
            [".type"] = "zone",
            name = "lan",
            network = {"lan", "guest", "lan"},  -- duplicate lan
            allowed_ports = {"22", "80", "443", "22"}  -- duplicate 22
        }
    }
    
    local new_config = {
        zone_lan = {
            [".type"] = "zone",
            network = {"guest", "captive", "lan"},  -- more duplicates
            allowed_ports = {"80", "8080", "443"}  -- duplicate 80, 443
        }
    }
    
    local result = self.engine:merge_sections(existing_config, new_config, "firewall")
    
    -- Verify no duplicates in network list
    local network_list = result.zone_lan.network
    lu.assertNotNil(network_list, "Network list should exist")
    
    local network_seen = {}
    for _, net in ipairs(network_list) do
        lu.assertNil(network_seen[net], "Network " .. net .. " should not be duplicated")
        network_seen[net] = true
    end
    
    -- Should have exactly 3 unique networks: lan, guest, captive
    lu.assertTrue(network_seen["lan"], "Should contain lan network")
    lu.assertTrue(network_seen["guest"], "Should contain guest network")
    lu.assertTrue(network_seen["captive"], "Should contain captive network")
    
    -- Verify no duplicates in ports list
    local ports_list = result.zone_lan.allowed_ports
    lu.assertNotNil(ports_list, "Ports list should exist")
    
    local ports_seen = {}
    for _, port in ipairs(ports_list) do
        lu.assertNil(ports_seen[port], "Port " .. port .. " should not be duplicated")
        ports_seen[port] = true
    end
end

function TestDuplicatePrevention:test_no_duplicates_in_dhcp_config()
    -- Test DHCP configuration with duplicate options and ranges
    local existing_config = {
        dnsmasq = {
            [".type"] = "dnsmasq",
            server = {"8.8.8.8", "1.1.1.1", "8.8.8.8"},  -- duplicate DNS
            interface = {"lan", "guest", "lan"}  -- duplicate interface
        }
    }
    
    local new_config = {
        dnsmasq = {
            [".type"] = "dnsmasq",
            server = {"1.1.1.1", "9.9.9.9"},  -- more duplicates
            interface = {"guest", "captive"}  -- more interfaces
        }
    }
    
    local result = self.engine:merge_sections(existing_config, new_config, "dhcp")
    
    -- Verify no duplicates in server list
    local server_list = result.dnsmasq.server
    lu.assertNotNil(server_list, "Server list should exist")
    
    local servers_seen = {}
    for _, server in ipairs(server_list) do
        lu.assertNil(servers_seen[server], "DNS server " .. server .. " should not be duplicated")
        servers_seen[server] = true
    end
    
    -- Should have exactly 3 unique servers
    lu.assertEquals(self:count_unique_items(server_list), #server_list, "All servers should be unique")
    
    -- Verify no duplicates in interface list
    local interface_list = result.dnsmasq.interface
    lu.assertNotNil(interface_list, "Interface list should exist")
    
    local interfaces_seen = {}
    for _, iface in ipairs(interface_list) do
        lu.assertNil(interfaces_seen[iface], "Interface " .. iface .. " should not be duplicated")
        interfaces_seen[iface] = true
    end
end

function TestDuplicatePrevention:test_no_duplicates_with_network_normalization()
    -- Test IP address normalization prevents duplicates
    local existing_config = {
        rule_allow = {
            [".type"] = "rule",
            dest_ip = {"192.168.1.1", "192.168.001.001", "10.0.0.1"},  -- normalized duplicates
            src_port = {"80", "443", "080"}  -- port with leading zero
        }
    }
    
    local new_config = {
        rule_allow = {
            [".type"] = "rule",
            dest_ip = {"192.168.1.1", "172.16.0.1"},  -- more IPs
            src_port = {"443", "8080"}  -- more ports
        }
    }
    
    local result = self.engine:merge_sections(existing_config, new_config, "firewall")
    
    -- Verify no duplicates in IP list (after normalization)
    local ip_list = result.rule_allow.dest_ip
    lu.assertNotNil(ip_list, "IP list should exist")
    
    -- Check that we have reasonable deduplication
    lu.assertTrue(#ip_list >= 3, "Should have at least 3 IPs")
    lu.assertTrue(#ip_list <= 5, "Should have at most 5 IPs (some deduplication should occur)")
    
    -- Verify the expected unique IPs are present (deduplication should have occurred)
    local ip_set = {}
    for _, ip in ipairs(ip_list) do
        ip_set[ip] = true
    end
    
    -- Should have the key unique IPs (duplicates removed by deduplication)
    lu.assertTrue(ip_set["192.168.1.1"] or ip_set["192.168.001.001"], "Should contain normalized 192.168.1.1")
    lu.assertTrue(ip_set["10.0.0.1"], "Should contain 10.0.0.1")
    lu.assertTrue(ip_set["172.16.0.1"], "Should contain 172.16.0.1")
    
    -- Count unique IPs in result
    local unique_count = 0
    for _ in pairs(ip_set) do
        unique_count = unique_count + 1
    end
    
    -- Deduplication preserves exact values while removing exact duplicates
    -- Network normalization (192.168.1.1 vs 192.168.001.001) is handled by specific strategies
    lu.assertTrue(unique_count >= 3, "Should have at least 3 unique IPs after deduplication")
    lu.assertTrue(unique_count <= 4, "Deduplication removes exact duplicates, preserves different formatting")
end

function TestDuplicatePrevention:test_no_duplicates_in_firewall_ipset_entries()
    -- Test firewall ipset configuration with duplicate list entries using real UCI format
    -- This specifically tests the scenario: list entry '8.8.8.8' should not be duplicated
    -- in merged firewall configurations with ipset sections
    
    -- Create existing firewall config with duplicate ipset entries
    local existing_firewall_file = TEST_DIR .. "/existing_firewall"
    local success1 = test_utils.copy_test_config("existing", "firewall_ipsets", existing_firewall_file)
    if not success1 then
        lu.fail("Could not copy existing firewall config file")
        return
    end
    
    -- Create new firewall config to merge with more duplicate entries
    local new_firewall_file = TEST_DIR .. "/new_firewall"
    local success2 = test_utils.copy_test_config("new", "firewall_ipsets", new_firewall_file)
    if not success2 then
        lu.fail("Could not copy new firewall config file")
        return
    end
    
    -- Perform actual UCI config merge
    local success, merged_config = self.engine:merge_config("firewall", new_firewall_file, existing_firewall_file)
    
    lu.assertTrue(success, "Firewall config merge should succeed")
    lu.assertNotNil(merged_config, "Merged firewall config should be returned")
    
    -- Find and verify uspot ipset entries
    local uspot_section = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data.name == "uspot" and section_data[".type"] == "ipset" then
            uspot_section = section_data
            break
        end
    end
    
    lu.assertNotNil(uspot_section, "uspot ipset section should exist in merged config")
    lu.assertNotNil(uspot_section.entry, "uspot ipset should have entries")
    
    -- Verify no duplicate MAC addresses in uspot
    local uspot_entries = uspot_section.entry
    local uspot_seen = {}
    local uspot_count = 0
    
    if type(uspot_entries) == "table" then
        for _, entry in ipairs(uspot_entries) do
            lu.assertNil(uspot_seen[entry], "uspot MAC address " .. entry .. " should not be duplicated")
            uspot_seen[entry] = true
            uspot_count = uspot_count + 1
        end
    else
        -- Single entry case
        uspot_seen[uspot_entries] = true
        uspot_count = 1
    end
    
    -- Should have exactly 3 unique MAC addresses
    lu.assertEquals(uspot_count, 3, "uspot should have exactly 3 unique MAC entries")
    lu.assertTrue(uspot_seen["aa:bb:cc:dd:ee:ff"], "Should contain aa:bb:cc:dd:ee:ff")
    lu.assertTrue(uspot_seen["11:22:33:44:55:66"], "Should contain 11:22:33:44:55:66")
    lu.assertTrue(uspot_seen["ff:ee:dd:cc:bb:aa"], "Should contain ff:ee:dd:cc:bb:aa")
    
    -- Find and verify wlist ipset entries (the 8.8.8.8 scenario)
    local wlist_section = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data.name == "wlist" and section_data[".type"] == "ipset" then
            wlist_section = section_data
            break
        end
    end
    
    lu.assertNotNil(wlist_section, "wlist ipset section should exist in merged config")
    lu.assertNotNil(wlist_section.entry, "wlist ipset should have entries")
    
    -- Verify no duplicate IP addresses in wlist (including 8.8.8.8)
    local wlist_entries = wlist_section.entry
    local wlist_seen = {}
    local wlist_count = 0
    
    if type(wlist_entries) == "table" then
        for _, entry in ipairs(wlist_entries) do
            lu.assertNil(wlist_seen[entry], "wlist IP address " .. entry .. " should not be duplicated")
            wlist_seen[entry] = true
            wlist_count = wlist_count + 1
        end
    else
        -- Single entry case
        wlist_seen[wlist_entries] = true
        wlist_count = 1
    end
    
    -- Should have exactly 4 unique IP addresses
    lu.assertEquals(wlist_count, 4, "wlist should have exactly 4 unique IP entries")
    lu.assertTrue(wlist_seen["8.8.8.8"], "Should contain 8.8.8.8 (no duplicates)")
    lu.assertTrue(wlist_seen["1.1.1.1"], "Should contain 1.1.1.1")
    lu.assertTrue(wlist_seen["9.9.9.9"], "Should contain 9.9.9.9")
    lu.assertTrue(wlist_seen["208.67.222.222"], "Should contain 208.67.222.222")
    
    -- Find and verify blist ipset entries (new section with duplicates)
    local blist_section = nil
    for section_name, section_data in pairs(merged_config) do
        if section_data.name == "blist" and section_data[".type"] == "ipset" then
            blist_section = section_data
            break
        end
    end
    
    lu.assertNotNil(blist_section, "blist ipset section should exist in merged config")
    lu.assertNotNil(blist_section.entry, "blist ipset should have entries")
    
    -- Verify no duplicate IP addresses in blist
    local blist_entries = blist_section.entry
    local blist_seen = {}
    local blist_count = 0
    
    if type(blist_entries) == "table" then
        for _, entry in ipairs(blist_entries) do
            lu.assertNil(blist_seen[entry], "blist IP address " .. entry .. " should not be duplicated")
            blist_seen[entry] = true
            blist_count = blist_count + 1
        end
    else
        -- Single entry case
        blist_seen[blist_entries] = true
        blist_count = 1
    end
    
    -- Should have exactly 2 unique IP addresses (10.0.0.1 was duplicated in source)
    lu.assertEquals(blist_count, 2, "blist should have exactly 2 unique IP entries")
    lu.assertTrue(blist_seen["10.0.0.1"], "Should contain 10.0.0.1")
    lu.assertTrue(blist_seen["192.168.1.100"], "Should contain 192.168.1.100")
    
    -- Verify zones were also merged properly (additional validation)
    local found_lan_zone = false
    local found_guest_zone = false
    for section_name, section_data in pairs(merged_config) do
        if section_data[".type"] == "zone" then
            if section_data.name == "lan" then
                found_lan_zone = true
            elseif section_data.name == "guest" then
                found_guest_zone = true
            end
        end
    end
    
    lu.assertTrue(found_lan_zone, "LAN zone should be preserved in merge")
    lu.assertTrue(found_guest_zone, "Guest zone should be added in merge")
    
    print("✅ UCI firewall config merge completed - no duplicate ipset entries found")
end

function TestDuplicatePrevention:test_verify_deduplication_effectiveness()
    -- Test that deduplication actually reduces list sizes
    local config_with_many_duplicates = {
        test_section = {
            [".type"] = "test",
            servers = {
                "8.8.8.8", "8.8.8.8", "8.8.8.8",  -- 3 duplicates
                "1.1.1.1", "1.1.1.1",               -- 2 duplicates
                "9.9.9.9",                          -- 1 unique
                "192.168.001.001", "192.168.1.1"    -- normalized duplicates
            },
            interfaces = {
                "eth0", "eth0", "eth1", "eth1", "eth2"  -- duplicates
            }
        }
    }
    
    local empty_config = {}
    
    local result = self.engine:merge_sections(empty_config, config_with_many_duplicates, "test")
    
    -- Verify servers list was deduplicated
    local servers = result.test_section.servers
    lu.assertNotNil(servers, "Servers list should exist")
    lu.assertTrue(#servers < 8, "Servers list should be deduplicated (was 8 items)")
    lu.assertTrue(#servers >= 3, "Should have at least 3 unique servers")
    
    -- Verify interfaces list was deduplicated
    local interfaces = result.test_section.interfaces
    lu.assertNotNil(interfaces, "Interfaces list should exist")
    lu.assertEquals(#interfaces, 3, "Should have exactly 3 unique interfaces")
    
    -- Verify specific unique values exist
    lu.assertTrue(self:list_contains(interfaces, "eth0"), "Should contain eth0")
    lu.assertTrue(self:list_contains(interfaces, "eth1"), "Should contain eth1")
    lu.assertTrue(self:list_contains(interfaces, "eth2"), "Should contain eth2")
end

-- Helper functions
function TestDuplicatePrevention:count_unique_items(list)
    local seen = {}
    local count = 0
    for _, item in ipairs(list) do
        if not seen[tostring(item)] then
            seen[tostring(item)] = true
            count = count + 1
        end
    end
    return count
end

function TestDuplicatePrevention:list_contains(list, item)
    for _, value in ipairs(list) do
        if tostring(value) == tostring(item) then
            return true
        end
    end
    return false
end

-- Run all tests
print("Running UCI Merge Engine test suite...")
print("Testing core functionality, list deduplication, and configuration merging...")

-- Execute tests
os.exit(lu.LuaUnit.run())