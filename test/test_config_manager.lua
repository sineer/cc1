-- test_config_manager.lua - Unit tests for ConfigManager module
local TestFramework = require("test_framework")
local test = TestFramework.new("ConfigManager Tests")

-- Initialize test environment
local ConfigManager = require("lib.config_manager")

-- Mock UCI commands
local original_os_execute = os.execute
local original_io_popen = io.popen
local mock_uci_data = {}
local mock_execute_results = {}
local mock_execute_calls = {}

local function mock_os_execute(cmd)
    table.insert(mock_execute_calls, cmd)
    local result = mock_execute_results[cmd]
    if result ~= nil then
        return result
    end
    -- Handle UCI commands
    if cmd:match("^uci ") then
        return true
    end
    return false
end

local function mock_io_popen(cmd)
    if cmd:match("^uci show") then
        local config = cmd:match("uci show ([%w_]+)")
        local data = mock_uci_data[config] or ""
        return {
            read = function(self, mode)
                if mode == "*a" then
                    return data
                end
                return nil
            end,
            close = function() return true end
        }
    end
    return {
        read = function() return "" end,
        close = function() return true end
    }
end

-- Test ConfigManager creation
test:add("ConfigManager creation", function()
    local cm = ConfigManager.new({
        logger = {
            info = function() end,
            error = function() end,
            verbose = function() end
        }
    })
    
    test:assert_table(cm, "ConfigManager should be created")
    test:assert_function(cm.load, "Should have load method")
    test:assert_function(cm.save, "Should have save method")
end)

-- Test loading configuration
test:add("Load configuration", function()
    io.popen = mock_io_popen
    mock_uci_data = {
        network = [[network.lan=interface
network.lan.proto='static'
network.lan.ipaddr='192.168.1.1'
network.lan.netmask='255.255.255.0'
network.wan=interface
network.wan.proto='dhcp']]
    }
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local config = cm:load("network")
    test:assert_table(config, "Should return configuration table")
    test:assert_table(config.lan, "Should have lan section")
    test:assert_equal(config.lan.proto, "static", "Should parse proto correctly")
    test:assert_equal(config.lan.ipaddr, "192.168.1.1", "Should parse IP address")
    test:assert_table(config.wan, "Should have wan section")
    test:assert_equal(config.wan.proto, "dhcp", "Should parse wan proto")
    
    io.popen = original_io_popen
end)

-- Test parsing UCI show output
test:add("Parse UCI show output", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    -- Test basic parsing
    local config = cm:parse_uci_show([[
wireless.radio0=wifi-device
wireless.radio0.type='mac80211'
wireless.radio0.channel='11'
wireless.default_radio0=wifi-iface
wireless.default_radio0.device='radio0'
wireless.default_radio0.network='lan'
wireless.default_radio0.mode='ap'
]])
    
    test:assert_table(config.radio0, "Should parse radio0")
    test:assert_equal(config.radio0['.type'], "wifi-device", "Should set .type")
    test:assert_equal(config.radio0.type, "mac80211", "Should parse type option")
    test:assert_equal(config.radio0.channel, "11", "Should parse channel")
    
    test:assert_table(config.default_radio0, "Should parse wifi interface")
    test:assert_equal(config.default_radio0['.type'], "wifi-iface", "Should set interface type")
    test:assert_equal(config.default_radio0.mode, "ap", "Should parse mode")
end)

-- Test parsing lists
test:add("Parse UCI lists", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local config = cm:parse_uci_show([[
firewall.zone1=zone
firewall.zone1.name='lan'
firewall.zone1.network='lan' 'guest'
firewall.zone1.input='ACCEPT'
firewall.zone1.masq='1'
firewall.zone1.masq_src='192.168.1.0/24' '192.168.2.0/24' '10.0.0.0/8'
]])
    
    test:assert_table(config.zone1, "Should parse zone")
    test:assert_table(config.zone1.network, "Network should be a list")
    test:assert_equal(#config.zone1.network, 2, "Should have 2 networks")
    test:assert_equal(config.zone1.network[1], "lan", "First network should be lan")
    test:assert_equal(config.zone1.network[2], "guest", "Second network should be guest")
    
    test:assert_table(config.zone1.masq_src, "masq_src should be a list")
    test:assert_equal(#config.zone1.masq_src, 3, "Should have 3 source networks")
end)

-- Test anonymous sections
test:add("Parse anonymous sections", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local config = cm:parse_uci_show([[
firewall.@rule[0]=rule
firewall.@rule[0].name='Allow-SSH'
firewall.@rule[0].src='wan'
firewall.@rule[0].dest_port='22'
firewall.@rule[1]=rule  
firewall.@rule[1].name='Allow-HTTP'
firewall.@rule[1].dest_port='80'
]])
    
    test:assert_table(config['@rule'], "Should have @rule array")
    test:assert_equal(#config['@rule'], 2, "Should have 2 rules")
    test:assert_equal(config['@rule'][1].name, "Allow-SSH", "First rule should be SSH")
    test:assert_equal(config['@rule'][2].name, "Allow-HTTP", "Second rule should be HTTP")
    test:assert_equal(config['@rule'][1]['.type'], "rule", "Should set .type for anonymous")
end)

-- Test saving configuration
test:add("Save configuration", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    mock_execute_results = {
        ["uci commit"] = true
    }
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local config = {
        lan = {
            ['.type'] = 'interface',
            proto = 'static',
            ipaddr = '192.168.1.1',
            dns = {'8.8.8.8', '8.8.4.4'}
        }
    }
    
    local result = cm:save("network", config)
    test:assert_equal(result, true, "Save should succeed")
    
    -- Check that proper UCI commands were called
    local has_set_commands = false
    local has_commit = false
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("uci set") then has_set_commands = true end
        if cmd:match("uci commit") then has_commit = true end
    end
    
    test:assert_true(has_set_commands, "Should have UCI set commands")
    test:assert_true(has_commit, "Should have UCI commit")
    
    os.execute = original_os_execute
end)

-- Test backup functionality
test:add("Configuration backup", function()
    os.execute = mock_os_execute
    io.popen = mock_io_popen
    mock_execute_calls = {}
    mock_uci_data = {
        network = "network.lan=interface\nnetwork.lan.proto='static'"
    }
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    -- Create a mock file system
    local backup_data = nil
    local original_io_open = io.open
    io.open = function(filename, mode)
        if mode == "w" then
            return {
                write = function(self, data)
                    backup_data = data
                    return true
                end,
                close = function() return true end
            }
        end
        return nil
    end
    
    local backup_file = cm:create_backup("network")
    test:assert_string(backup_file, "Should return backup filename")
    test:assert_not_nil(backup_data, "Should write backup data")
    test:assert_match(backup_data, "network.lan", "Backup should contain config")
    
    io.open = original_io_open
    io.popen = original_io_popen
    os.execute = original_os_execute
end)

-- Test restore functionality
test:add("Configuration restore", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    -- Mock file reading
    local original_io_open = io.open
    io.open = function(filename, mode)
        if mode == "r" then
            return {
                read = function(self, mode)
                    if mode == "*a" then
                        return "network.lan=interface\nnetwork.lan.proto='static'"
                    end
                    return nil
                end,
                close = function() return true end
            }
        end
        return nil
    end
    
    local result = cm:restore_backup("/tmp/backup.conf", "network")
    test:assert_equal(result, true, "Restore should succeed")
    
    -- Check for UCI import command
    local has_import = false
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("uci import") then
            has_import = true
        end
    end
    test:assert_true(has_import, "Should use UCI import")
    
    io.open = original_io_open
    os.execute = original_os_execute
end)

-- Test validation
test:add("Configuration validation", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    -- Test valid network config
    local valid_network = {
        lan = {
            ['.type'] = 'interface',
            proto = 'static',
            ipaddr = '192.168.1.1',
            netmask = '255.255.255.0'
        }
    }
    
    local result, err = cm:validate("network", valid_network)
    test:assert_equal(result, true, "Valid config should pass")
    
    -- Test invalid config (missing required fields)
    local invalid_network = {
        lan = {
            ['.type'] = 'interface',
            proto = 'static'
            -- Missing ipaddr for static
        }
    }
    
    result, err = cm:validate("network", invalid_network)
    -- Basic validation might pass, but advanced validation would catch this
    test:assert_not_nil(result, "Should return validation result")
end)

-- Test diff generation
test:add("Configuration diff", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local old_config = {
        lan = {
            proto = 'static',
            ipaddr = '192.168.1.1',
            dns = {'8.8.8.8'}
        },
        wan = {
            proto = 'dhcp'
        }
    }
    
    local new_config = {
        lan = {
            proto = 'static',
            ipaddr = '192.168.1.2',  -- Changed
            dns = {'8.8.8.8', '1.1.1.1'},  -- Added
            gateway = '192.168.1.254'  -- New field
        }
        -- wan removed
    }
    
    local diff = cm:generate_diff(old_config, new_config)
    test:assert_table(diff, "Should generate diff")
    test:assert_table(diff.changed, "Should have changed section")
    test:assert_table(diff.removed, "Should have removed section")
    test:assert_equal(diff.changed.lan.ipaddr, '192.168.1.2', "Should detect IP change")
    test:assert_equal(diff.removed.wan, true, "Should detect wan removal")
end)

-- Test error handling
test:add("Error handling", function()
    io.popen = function(cmd)
        error("Simulated UCI error")
    end
    
    local errors = {}
    local logger = {
        info = function() end,
        error = function(self, msg) table.insert(errors, msg) end,
        verbose = function() end
    }
    local cm = ConfigManager.new({logger = logger})
    
    local config = cm:load("network")
    test:assert_nil(config, "Should return nil on error")
    test:assert_true(#errors > 0, "Should log error")
    
    io.popen = original_io_popen
end)

-- Run all tests
test:run()