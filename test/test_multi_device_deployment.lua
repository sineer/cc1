-- test_multi_device_deployment.lua - Integration tests for fleet deployment scenarios
local TestFramework = require("test_framework")
local test = TestFramework.new("Multi-Device Deployment Tests")

-- Mock environment
local original_os_execute = os.execute
local original_io_popen = io.popen
local mock_execute_calls = {}
local mock_device_states = {}
local mock_ssh_results = {}

local function mock_os_execute(cmd)
    table.insert(mock_execute_calls, cmd)
    
    -- Parse SSH commands to track device interactions
    local device_ip = cmd:match("ssh [^@]+@([%d%.]+)")
    if device_ip then
        if not mock_device_states[device_ip] then
            mock_device_states[device_ip] = {
                connected = true,
                configs = {},
                commands = {}
            }
        end
        table.insert(mock_device_states[device_ip].commands, cmd)
        
        -- Return mock results
        local mock_result = mock_ssh_results[cmd]
        if mock_result ~= nil then
            return mock_result
        end
    end
    
    return true
end

-- Test parallel deployment to multiple devices
test:add("Parallel fleet deployment", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    mock_device_states = {}
    
    -- Simulate deploying to multiple devices
    local devices = {
        "192.168.1.10",
        "192.168.1.11", 
        "192.168.1.12"
    }
    
    -- Deploy to each device
    for _, ip in ipairs(devices) do
        os.execute("ssh root@" .. ip .. " 'uci-config validate'")
        os.execute("ssh root@" .. ip .. " 'uci-config safe-merge --target default'")
    end
    
    -- Verify all devices were contacted
    for _, ip in ipairs(devices) do
        test:assert_table(mock_device_states[ip], "Device " .. ip .. " should be contacted")
        test:assert_equal(#mock_device_states[ip].commands, 2, "Should run 2 commands per device")
    end
    
    os.execute = original_os_execute
end)

-- Test sequential deployment with rollback
test:add("Sequential deployment with rollback", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    mock_device_states = {}
    
    -- Set up mock results - third device fails
    mock_ssh_results = {
        ["ssh root@192.168.1.10 'uci-config safe-merge --target default'"] = true,
        ["ssh root@192.168.1.11 'uci-config safe-merge --target default'"] = true,
        ["ssh root@192.168.1.12 'uci-config safe-merge --target default'"] = false
    }
    
    local devices = {"192.168.1.10", "192.168.1.11", "192.168.1.12"}
    local deployed = {}
    local failed_device = nil
    
    -- Deploy with failure handling
    for _, ip in ipairs(devices) do
        local result = os.execute("ssh root@" .. ip .. " 'uci-config safe-merge --target default'")
        if result then
            table.insert(deployed, ip)
        else
            failed_device = ip
            break
        end
    end
    
    test:assert_equal(#deployed, 2, "Should deploy to 2 devices before failure")
    test:assert_equal(failed_device, "192.168.1.12", "Third device should fail")
    
    -- Simulate rollback on deployed devices
    if failed_device then
        for _, ip in ipairs(deployed) do
            os.execute("ssh root@" .. ip .. " 'uci-config restore --backup auto'")
        end
    end
    
    -- Verify rollback commands
    local rollback_count = 0
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("restore %-%-backup auto") then
            rollback_count = rollback_count + 1
        end
    end
    test:assert_equal(rollback_count, 2, "Should rollback 2 devices")
    
    mock_ssh_results = {}
    os.execute = original_os_execute
end)

-- Test device grouping and profiles
test:add("Device group deployment", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    
    -- Define device groups
    local device_groups = {
        routers = {
            devices = {"192.168.1.1", "192.168.1.2"},
            profile = "gl",
            config_target = "router-default"
        },
        access_points = {
            devices = {"192.168.1.10", "192.168.1.11", "192.168.1.12"},
            profile = "openwrt",
            config_target = "ap-default"
        }
    }
    
    -- Deploy to each group with appropriate settings
    for group_name, group in pairs(device_groups) do
        for _, device in ipairs(group.devices) do
            local cmd = string.format(
                "ssh root@%s 'uci-config safe-merge --target %s --profile %s'",
                device, group.config_target, group.profile
            )
            os.execute(cmd)
        end
    end
    
    -- Verify correct profiles used
    local router_cmds = 0
    local ap_cmds = 0
    
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("%-%-target router%-default") then
            router_cmds = router_cmds + 1
        elseif cmd:match("%-%-target ap%-default") then
            ap_cmds = ap_cmds + 1
        end
    end
    
    test:assert_equal(router_cmds, 2, "Should deploy router config to 2 devices")
    test:assert_equal(ap_cmds, 3, "Should deploy AP config to 3 devices")
    
    os.execute = original_os_execute
end)

-- Test deployment status tracking
test:add("Deployment status tracking", function()
    os.execute = mock_os_execute
    io.popen = function(cmd)
        -- Mock status check responses
        if cmd:match("ssh.*uci%-config status") then
            local ip = cmd:match("ssh [^@]+@([%d%.]+)")
            if ip == "192.168.1.10" then
                return {
                    read = function() return "Status: OK\nVersion: 1.2.0\n" end,
                    close = function() return true end
                }
            else
                return {
                    read = function() return "Status: ERROR\n" end,
                    close = function() return true end
                }
            end
        end
        return {read = function() return "" end, close = function() return true end}
    end
    
    -- Check status of multiple devices
    local devices = {"192.168.1.10", "192.168.1.11"}
    local device_status = {}
    
    for _, ip in ipairs(devices) do
        local handle = io.popen("ssh root@" .. ip .. " 'uci-config status'")
        local output = handle:read("*a")
        handle:close()
        
        device_status[ip] = {
            ok = output:match("Status: OK") ~= nil,
            version = output:match("Version: ([%d%.]+)")
        }
    end
    
    test:assert_true(device_status["192.168.1.10"].ok, "First device should be OK")
    test:assert_equal(device_status["192.168.1.10"].version, "1.2.0", "Should have version")
    test:assert_false(device_status["192.168.1.11"].ok, "Second device should have error")
    
    io.popen = original_io_popen
    os.execute = original_os_execute
end)

-- Test batch configuration generation
test:add("Batch configuration generation", function()
    -- Test generating configurations for multiple device types
    local device_configs = {
        ["router-type-a"] = {
            base_ip = "192.168.1.",
            start_index = 1,
            count = 5,
            config = {
                network = {
                    lan = {proto = "static", netmask = "255.255.255.0"}
                }
            }
        },
        ["ap-type-b"] = {
            base_ip = "192.168.2.",
            start_index = 10,
            count = 10,
            config = {
                wireless = {
                    radio0 = {channel = "auto", mode = "ap"}
                }
            }
        }
    }
    
    -- Generate device-specific configs
    local generated_configs = {}
    
    for device_type, spec in pairs(device_configs) do
        for i = 0, spec.count - 1 do
            local device_ip = spec.base_ip .. (spec.start_index + i)
            local config = {}
            
            -- Deep copy base config
            for k, v in pairs(spec.config) do
                config[k] = {}
                for k2, v2 in pairs(v) do
                    config[k][k2] = v2
                end
            end
            
            -- Add device-specific settings
            if config.network and config.network.lan then
                config.network.lan.ipaddr = device_ip
            end
            
            generated_configs[device_ip] = {
                type = device_type,
                config = config
            }
        end
    end
    
    test:assert_equal(15, #(function()
        local count = 0
        for _ in pairs(generated_configs) do count = count + 1 end
        return count
    end)(), "Should generate 15 device configs")
    
    test:assert_equal(generated_configs["192.168.1.3"].config.network.lan.ipaddr, 
                     "192.168.1.3", "Should have correct IP")
    test:assert_equal(generated_configs["192.168.2.15"].type, 
                     "ap-type-b", "Should have correct type")
end)

-- Test deployment verification
test:add("Post-deployment verification", function()
    os.execute = mock_os_execute
    io.popen = function(cmd)
        -- Mock verification commands
        if cmd:match("uci show network%.lan%.ipaddr") then
            return {
                read = function() return "network.lan.ipaddr='192.168.1.100'\n" end,
                close = function() return true end
            }
        elseif cmd:match("ping %-c 1") then
            return {
                read = function() return "1 packets transmitted, 1 received" end,
                close = function() return true end
            }
        end
        return {read = function() return "" end, close = function() return true end}
    end
    
    -- Verification steps
    local verification_steps = {
        -- Check configuration was applied
        config_check = function(device_ip)
            local handle = io.popen("ssh root@" .. device_ip .. " 'uci show network.lan.ipaddr'")
            local result = handle:read("*a")
            handle:close()
            return result:match("192%.168%.1%.100") ~= nil
        end,
        
        -- Check connectivity
        connectivity_check = function(device_ip)
            local handle = io.popen("ping -c 1 " .. device_ip)
            local result = handle:read("*a")
            handle:close()
            return result:match("1 received") ~= nil
        end
    }
    
    -- Run verification
    local device_ip = "192.168.1.100"
    local verification_results = {}
    
    for check_name, check_func in pairs(verification_steps) do
        verification_results[check_name] = check_func(device_ip)
    end
    
    test:assert_true(verification_results.config_check, "Config should be applied")
    test:assert_true(verification_results.connectivity_check, "Device should be reachable")
    
    io.popen = original_io_popen
    os.execute = original_os_execute
end)

-- Test deployment scheduling
test:add("Deployment scheduling and windows", function()
    -- Test deployment windows for minimal disruption
    local deployment_schedule = {
        maintenance_window = {
            start_hour = 2,  -- 2 AM
            end_hour = 5,    -- 5 AM
            timezone = "UTC"
        },
        device_groups = {
            {name = "critical", delay_minutes = 0},
            {name = "production", delay_minutes = 30},
            {name = "staging", delay_minutes = 60}
        }
    }
    
    -- Calculate deployment times
    local function calculate_deployment_time(group_delay, window_start)
        local deploy_hour = window_start + math.floor(group_delay / 60)
        local deploy_minute = group_delay % 60
        return string.format("%02d:%02d", deploy_hour, deploy_minute)
    end
    
    local deployment_times = {}
    for _, group in ipairs(deployment_schedule.device_groups) do
        deployment_times[group.name] = calculate_deployment_time(
            group.delay_minutes,
            deployment_schedule.maintenance_window.start_hour
        )
    end
    
    test:assert_equal(deployment_times.critical, "02:00", "Critical should deploy immediately")
    test:assert_equal(deployment_times.production, "02:30", "Production should delay 30 min")
    test:assert_equal(deployment_times.staging, "03:00", "Staging should delay 60 min")
end)

-- Test failure recovery strategies
test:add("Deployment failure recovery", function()
    os.execute = mock_os_execute
    mock_execute_calls = {}
    
    -- Define recovery strategies
    local recovery_strategies = {
        retry_with_backoff = function(device_ip, max_retries)
            local retry_count = 0
            local backoff = 1
            
            while retry_count < max_retries do
                local result = os.execute("ssh root@" .. device_ip .. " 'uci-config safe-merge'")
                if result then
                    return true, retry_count + 1
                end
                
                -- Exponential backoff
                os.execute("sleep " .. backoff)
                backoff = backoff * 2
                retry_count = retry_count + 1
            end
            
            return false, retry_count
        end,
        
        failover_to_backup = function(primary_ip, backup_ip)
            local result = os.execute("ssh root@" .. primary_ip .. " 'uci-config safe-merge'")
            if not result then
                -- Try backup device
                result = os.execute("ssh root@" .. backup_ip .. " 'uci-config safe-merge'")
                return result, backup_ip
            end
            return result, primary_ip
        end
    }
    
    -- Test retry strategy
    mock_ssh_results["ssh root@192.168.1.50 'uci-config safe-merge'"] = false
    local success, attempts = recovery_strategies.retry_with_backoff("192.168.1.50", 3)
    test:assert_false(success, "Should fail after retries")
    test:assert_equal(attempts, 3, "Should attempt 3 times")
    
    -- Check for sleep commands (backoff)
    local sleep_count = 0
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("^sleep") then
            sleep_count = sleep_count + 1
        end
    end
    test:assert_equal(sleep_count, 3, "Should have backoff delays")
    
    mock_ssh_results = {}
    os.execute = original_os_execute
end)

-- Test deployment metrics collection
test:add("Deployment metrics and reporting", function()
    -- Track deployment metrics
    local deployment_metrics = {
        start_time = os.time(),
        devices = {},
        summary = {
            total = 0,
            successful = 0,
            failed = 0,
            skipped = 0
        }
    }
    
    -- Simulate deployment with metrics
    local test_devices = {
        {ip = "192.168.1.10", status = "success", duration = 45},
        {ip = "192.168.1.11", status = "success", duration = 52},
        {ip = "192.168.1.12", status = "failed", duration = 120, error = "timeout"},
        {ip = "192.168.1.13", status = "skipped", reason = "unreachable"}
    }
    
    for _, device in ipairs(test_devices) do
        deployment_metrics.devices[device.ip] = {
            status = device.status,
            duration = device.duration,
            error = device.error,
            reason = device.reason
        }
        
        deployment_metrics.summary.total = deployment_metrics.summary.total + 1
        if device.status == "success" then
            deployment_metrics.summary.successful = deployment_metrics.summary.successful + 1
        elseif device.status == "failed" then
            deployment_metrics.summary.failed = deployment_metrics.summary.failed + 1
        elseif device.status == "skipped" then
            deployment_metrics.summary.skipped = deployment_metrics.summary.skipped + 1
        end
    end
    
    deployment_metrics.end_time = os.time() + 180  -- 3 minutes later
    deployment_metrics.total_duration = deployment_metrics.end_time - deployment_metrics.start_time
    
    -- Calculate average deployment time
    local total_deploy_time = 0
    local deploy_count = 0
    for _, device in pairs(deployment_metrics.devices) do
        if device.status == "success" and device.duration then
            total_deploy_time = total_deploy_time + device.duration
            deploy_count = deploy_count + 1
        end
    end
    deployment_metrics.average_deploy_time = deploy_count > 0 and 
        (total_deploy_time / deploy_count) or 0
    
    test:assert_equal(deployment_metrics.summary.total, 4, "Should track 4 devices")
    test:assert_equal(deployment_metrics.summary.successful, 2, "Should have 2 successes")
    test:assert_equal(deployment_metrics.summary.failed, 1, "Should have 1 failure")
    test:assert_equal(deployment_metrics.average_deploy_time, 48.5, "Should calculate average time")
end)

-- Run all tests
test:run()