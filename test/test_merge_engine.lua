#!/usr/bin/env lua

-- Add lib and test directories to Lua path for library modules
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
package.path = script_dir .. "../lib/?.lua;" .. script_dir .. "?.lua;" .. package.path

--[[
Test suite for UCI Merge Engine
Comprehensive TDD tests for UCI configuration merging
]]

local lu = require('luaunit_fixed')
local UCIMergeEngine = require('uci_merge_engine')
local lfs = require('lfs')

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

function TestUCIMergeEngine:test_file_exists()
    -- Create test file
    local test_file = TEST_DIR .. "/test_file"
    local f = io.open(test_file, "w")
    f:write("test content")
    f:close()
    
    lu.assertTrue(self.engine:file_exists(test_file))
    lu.assertFalse(self.engine:file_exists(TEST_DIR .. "/nonexistent"))
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

function TestUCIMergeEngine:test_normalize_network_value()
    -- IP address normalization
    lu.assertEquals(self.engine:normalize_network_value("192.168.001.001"), "192.168.1.1")
    lu.assertEquals(self.engine:normalize_network_value("10.0.0.1"), "10.0.0.1")
    
    -- Port normalization
    lu.assertEquals(self.engine:normalize_network_value("80,443,8080"), "80,443,8080")
    
    -- String normalization
    lu.assertEquals(self.engine:normalize_network_value("TCP"), "tcp")
    lu.assertEquals(self.engine:normalize_network_value("  HTTP  "), "http")
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
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestConfigMerging:test_merge_new_section()
    local existing = {
        section1 = {
            [".type"] = "interface",
            option1 = "value1"
        }
    }
    
    local new_config = {
        section2 = {
            [".type"] = "interface",
            option2 = "value2"
        }
    }
    
    local result = self.engine:merge_sections(existing, new_config, "network")
    
    lu.assertNotNil(result.section1)
    lu.assertNotNil(result.section2)
    lu.assertEquals(result.section1.option1, "value1")
    lu.assertEquals(result.section2.option2, "value2")
end

function TestConfigMerging:test_merge_existing_section()
    local existing = {
        section1 = {
            [".type"] = "interface",
            option1 = "value1",
            list_option = {"item1", "item2"}
        }
    }
    
    local new_config = {
        section1 = {
            [".type"] = "interface",
            option2 = "value2",
            list_option = {"item2", "item3"}
        }
    }
    
    local result = self.engine:merge_sections(existing, new_config, "network")
    
    lu.assertEquals(result.section1.option1, "value1")
    lu.assertEquals(result.section1.option2, "value2")
    lu.assertEquals(result.section1.list_option, {"item1", "item2", "item3"})
end

function TestConfigMerging:test_conflict_detection()
    local existing = {
        section1 = {
            [".type"] = "interface",
            option1 = "original_value"
        }
    }
    
    local new_config = {
        section1 = {
            [".type"] = "interface",
            option1 = "new_value"
        }
    }
    
    local result = self.engine:merge_sections(existing, new_config, "network")
    
    -- Should detect conflict
    lu.assertEquals(#self.engine.conflicts, 1)
    lu.assertEquals(self.engine.conflicts[1].existing, "original_value")
    lu.assertEquals(self.engine.conflicts[1].new, "new_value")
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
    -- Existing firewall config
    self.existing_firewall = {
        zone_lan = {
            [".type"] = "zone",
            name = "lan",
            input = "ACCEPT",
            output = "ACCEPT",
            forward = "ACCEPT",
            network = {"lan"}
        },
        rule_ssh = {
            [".type"] = "rule",
            name = "Allow-SSH",
            src = "wan",
            dest_port = "22",
            proto = "tcp",
            target = "ACCEPT"
        }
    }
    
    -- uspot firewall config (from our etc/config/firewall)
    self.uspot_firewall = {
        zone_captive = {
            [".type"] = "zone",
            name = "captive",
            network = {"captive"},
            input = "REJECT",
            output = "ACCEPT",
            forward = "REJECT"
        },
        redirect_cpd = {
            [".type"] = "redirect",
            name = "Redirect-unauth-captive-CPD",
            src = "captive",
            src_dport = "80",
            proto = "tcp",
            target = "DNAT",
            reflection = "0",
            ipset = "!uspot"
        },
        ipset_uspot = {
            [".type"] = "ipset",
            name = "uspot",
            match = {"src_mac"}
        }
    }
end

function TestFirewallMerging:test_merge_firewall_zones()
    local result = self.engine:merge_sections(self.existing_firewall, self.uspot_firewall, "firewall")
    
    -- Should have both zones
    lu.assertNotNil(result.zone_lan)
    lu.assertNotNil(result.zone_captive)
    
    -- Existing zone should be preserved
    lu.assertEquals(result.zone_lan.name, "lan")
    lu.assertEquals(result.zone_lan.input, "ACCEPT")
    
    -- New zone should be added
    lu.assertEquals(result.zone_captive.name, "captive")
    lu.assertEquals(result.zone_captive.input, "REJECT")
end

function TestFirewallMerging:test_merge_firewall_rules()
    local result = self.engine:merge_sections(self.existing_firewall, self.uspot_firewall, "firewall")
    
    -- Should have both existing and new rules
    lu.assertNotNil(result.rule_ssh)
    lu.assertNotNil(result.redirect_cpd)
    lu.assertNotNil(result.ipset_uspot)
end

function TestFirewallMerging:test_network_list_merging()
    -- Test merging network lists in zones
    local existing_with_networks = {
        zone_lan = {
            [".type"] = "zone",
            name = "lan",
            network = {"lan", "guest"}
        }
    }
    
    local uspot_with_networks = {
        zone_lan = {
            [".type"] = "zone",
            network = {"captive"}
        }
    }
    
    local result = self.engine:merge_sections(existing_with_networks, uspot_with_networks, "firewall")
    
    -- Network lists should be merged
    lu.assertNotNil(result.zone_lan.network)
    lu.assertEquals(#result.zone_lan.network, 3)
    lu.assertTrue(self:list_contains(result.zone_lan.network, "lan"))
    lu.assertTrue(self:list_contains(result.zone_lan.network, "guest"))
    lu.assertTrue(self:list_contains(result.zone_lan.network, "captive"))
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
    self.engine = UCIMergeEngine.new({
        dry_run = true,
        dedupe_lists = true
    })
end

function TestDuplicatePrevention:test_no_duplicates_in_merged_network_config()
    -- Test network configuration with duplicate interfaces and DNS servers
    local existing_config = {
        interface_lan = {
            [".type"] = "interface",
            dns = {"8.8.8.8", "1.1.1.1", "8.8.8.8"},  -- duplicates
            network = {"eth0", "eth1"}
        }
    }
    
    local new_config = {
        interface_lan = {
            [".type"] = "interface",
            dns = {"1.1.1.1", "9.9.9.9", "8.8.8.8"},  -- more duplicates
            network = {"eth1", "eth2"}  -- duplicate eth1
        }
    }
    
    local result = self.engine:merge_sections(existing_config, new_config, "network")
    
    -- Verify no duplicates in DNS list
    local dns_list = result.interface_lan.dns
    lu.assertNotNil(dns_list, "DNS list should exist")
    lu.assertTrue(#dns_list >= 3, "Should have at least 3 unique DNS servers")
    
    -- Verify each DNS server appears only once
    local dns_seen = {}
    for _, dns in ipairs(dns_list) do
        lu.assertNil(dns_seen[dns], "DNS server " .. dns .. " should not be duplicated")
        dns_seen[dns] = true
    end
    
    -- Verify no duplicates in network list
    local network_list = result.interface_lan.network
    lu.assertNotNil(network_list, "Network list should exist")
    
    local network_seen = {}
    for _, net in ipairs(network_list) do
        lu.assertNil(network_seen[net], "Network interface " .. net .. " should not be duplicated")
        network_seen[net] = true
    end
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
    
    -- Verify we have the expected unique normalized values
    local normalized_set = {}
    for _, ip in ipairs(ip_list) do
        local normalized = self.engine:normalize_network_value(ip)
        normalized_set[normalized] = true
    end
    
    -- Should have exactly 3 unique normalized IPs
    lu.assertTrue(normalized_set["192.168.1.1"], "Should contain 192.168.1.1")
    lu.assertTrue(normalized_set["10.0.0.1"], "Should contain 10.0.0.1")
    lu.assertTrue(normalized_set["172.16.0.1"], "Should contain 172.16.0.1")
    
    -- Count unique normalized IPs
    local unique_count = 0
    for _ in pairs(normalized_set) do
        unique_count = unique_count + 1
    end
    lu.assertEquals(unique_count, 3, "Should have exactly 3 unique normalized IPs")
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