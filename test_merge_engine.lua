#!/usr/bin/env lua

--[[
Test suite for UCI Merge Engine
Comprehensive TDD tests for UCI configuration merging
]]

local lu = require('luaunit')
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

-- Run all tests
print("Running UCI Merge Engine test suite...")
print("Testing core functionality, list deduplication, and configuration merging...")

-- Execute tests
os.exit(lu.LuaUnit.run())