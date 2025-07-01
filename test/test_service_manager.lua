-- test_service_manager.lua - Unit tests for ServiceManager module
local TestFramework = require("test_framework")
local test = TestFramework.new("ServiceManager Tests")

-- Initialize test environment
local ServiceManager = require("lib.service_manager")

-- Mock os.execute for testing
local original_os_execute = os.execute
local mock_execute_results = {}
local mock_execute_calls = {}

local function mock_os_execute(cmd)
    table.insert(mock_execute_calls, cmd)
    local result = mock_execute_results[cmd]
    if result ~= nil then
        return result
    end
    return true
end

-- Test ServiceManager creation
test:add("ServiceManager creation", function()
    local sm = ServiceManager.new({
        logger = { 
            info = function() end,
            error = function() end,
            verbose = function() end
        }
    })
    
    test:assert_table(sm, "ServiceManager should be created")
    test:assert_equal(sm.restart_delay, 2, "Default restart delay should be 2")
    test:assert_equal(sm.max_restart_attempts, 3, "Default max attempts should be 3")
end)

-- Test service detection
test:add("Service detection", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    -- Test network service detection
    local services = sm:detect_affected_services({
        network = {
            lan = { proto = "static" }
        }
    })
    test:assert_table(services.network, "Network service should be detected")
    
    -- Test firewall service detection
    services = sm:detect_affected_services({
        firewall = {
            zone = { name = "lan" }
        }
    })
    test:assert_table(services.firewall, "Firewall service should be detected")
    
    -- Test DHCP service detection
    services = sm:detect_affected_services({
        dhcp = {
            lan = { interface = "lan" }
        }
    })
    test:assert_table(services.dnsmasq, "DHCP should map to dnsmasq service")
    
    -- Test multiple services
    services = sm:detect_affected_services({
        network = { lan = {} },
        firewall = { zone = {} },
        wireless = { radio0 = {} }
    })
    test:assert_equal(#sm:get_service_list(services), 3, "Should detect all three services")
end)

-- Test restart with no-restart flag
test:add("Service restart - no-restart flag", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger, no_restart = true})
    
    local result = sm:restart_services({network = true})
    test:assert_equal(result, true, "Should return true with no-restart")
    test:assert_equal(#mock_execute_calls, 0, "Should not execute any commands")
    
    os.execute = original_os_execute
end)

-- Test successful service restart
test:add("Service restart - success", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    mock_execute_results = {
        ["/etc/init.d/network restart"] = true
    }
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    local result = sm:restart_services({network = true})
    test:assert_equal(result, true, "Should return true on success")
    test:assert_equal(#mock_execute_calls, 1, "Should execute one command")
    test:assert_match(mock_execute_calls[1], "network restart", "Should restart network")
    
    os.execute = original_os_execute
end)

-- Test service restart with retry
test:add("Service restart - with retry", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        -- Fail first attempt, succeed on second
        if #mock_execute_calls == 1 then
            return false
        end
        return true
    end
    
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    local result = sm:restart_services({firewall = true})
    test:assert_equal(result, true, "Should succeed after retry")
    test:assert_equal(#mock_execute_calls, 2, "Should execute twice")
    
    os.execute = original_os_execute
end)

-- Test service restart failure
test:add("Service restart - failure", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        return false
    end
    
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    local result = sm:restart_services({network = true})
    test:assert_equal(result, false, "Should return false on failure")
    test:assert_equal(#mock_execute_calls, 3, "Should attempt max retries")
    
    os.execute = original_os_execute
end)

-- Test rollback functionality
test:add("Service rollback", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    mock_execute_results = {
        ["uci revert"] = true,
        ["/etc/init.d/network restart"] = true
    }
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    local result = sm:rollback_on_failure({network = true})
    test:assert_equal(result, true, "Rollback should succeed")
    test:assert_equal(#mock_execute_calls, 2, "Should revert and restart")
    test:assert_match(mock_execute_calls[1], "uci revert", "Should revert UCI changes")
    test:assert_match(mock_execute_calls[2], "network restart", "Should restart service")
    
    os.execute = original_os_execute
end)

-- Test service ordering
test:add("Service restart ordering", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        return true
    end
    
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    -- Network should restart before firewall
    local result = sm:restart_services({
        firewall = true,
        network = true,
        dnsmasq = true
    })
    
    test:assert_equal(result, true, "Should succeed")
    test:assert_equal(#mock_execute_calls, 3, "Should restart all services")
    
    -- Check order
    local network_index, firewall_index
    for i, cmd in ipairs(mock_execute_calls) do
        if cmd:match("network") then network_index = i end
        if cmd:match("firewall") then firewall_index = i end
    end
    
    test:assert_true(network_index < firewall_index, "Network should restart before firewall")
    
    os.execute = original_os_execute
end)

-- Test critical service handling
test:add("Critical service protection", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end,
        warnings = {}
    }
    logger.warn = function(_, msg) table.insert(logger.warnings, msg) end
    
    local sm = ServiceManager.new({logger = logger})
    
    -- Test SSH/dropbear protection
    local services = sm:detect_affected_services({
        dropbear = {
            ['@dropbear[0]'] = { Port = 22 }
        }
    })
    
    test:assert_nil(services.dropbear, "Should not restart dropbear (SSH)")
    test:assert_true(#logger.warnings > 0, "Should log warning about SSH")
end)

-- Test dry-run mode
test:add("Service restart - dry-run", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger, dry_run = true})
    
    local result = sm:restart_services({network = true, firewall = true})
    test:assert_equal(result, true, "Dry-run should return true")
    test:assert_equal(#mock_execute_calls, 0, "Should not execute commands in dry-run")
    
    os.execute = original_os_execute
end)

-- Test service dependency resolution
test:add("Service dependency resolution", function()
    local logger = {
        info = function() end,
        error = function() end,
        verbose = function() end
    }
    local sm = ServiceManager.new({logger = logger})
    
    -- Test that changing network config affects dependent services
    local services = sm:detect_affected_services({
        network = {
            lan = { proto = "static", ipaddr = "192.168.1.1" }
        }
    })
    
    -- Network change should suggest firewall restart
    test:assert_not_nil(services.network, "Network service should be detected")
    
    -- In a full implementation, this might also detect firewall needs restart
    -- based on network dependencies
end)

-- Run all tests
test:run()