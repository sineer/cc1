#!/usr/bin/env lua

--[[
Network Monitor for UCI Configuration Management
Version: 1.0.0

Purpose:
  Real-time network connectivity monitoring and protection system for
  production UCI configuration changes. Ensures network connectivity
  is preserved during operations and provides automatic recovery.

Features:
  - Real-time connectivity monitoring with multiple test methods
  - Baseline network state capture and drift detection
  - Automatic rollback triggers on connectivity loss
  - Interface health monitoring and alerting
  - Network performance tracking and SLA monitoring
  - Emergency network recovery procedures
  - DNS and routing validation
  - Bandwidth and latency monitoring

Usage:
  local NetworkMonitor = require('network_monitor')
  local monitor = NetworkMonitor.new({
    check_interval = 5,
    failure_threshold = 3,
    enable_auto_recovery = true,
    critical_interfaces = {"lan", "wan"}
  })
]]

local json = require("json") or require("cjson") or {
  encode = function(t) return "JSON_NOT_AVAILABLE" end,
  decode = function(s) return {} end
}

local NetworkMonitor = {}
NetworkMonitor.__index = NetworkMonitor

-- Network test types and priorities
local TEST_TYPES = {
  LOOPBACK = {priority = 1, timeout = 1, critical = true},
  GATEWAY = {priority = 2, timeout = 3, critical = true},
  DNS = {priority = 3, timeout = 5, critical = true},
  INTERNET = {priority = 4, timeout = 10, critical = false},
  INTERFACE_STATUS = {priority = 1, timeout = 1, critical = true},
  ROUTING_TABLE = {priority = 2, timeout = 2, critical = true}
}

-- Network states
local NETWORK_STATE = {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  CRITICAL = "critical",
  FAILED = "failed",
  UNKNOWN = "unknown"
}

-- Function: NetworkMonitor.new
-- Purpose: Create a new network monitor instance
-- Parameters:
--   config (table): Monitor configuration
-- Returns: NetworkMonitor instance
function NetworkMonitor.new(config)
  local self = setmetatable({}, NetworkMonitor)
  
  -- Configuration with defaults
  self.config = config or {}
  self.check_interval = self.config.check_interval or 5
  self.failure_threshold = self.config.failure_threshold or 3
  self.enable_auto_recovery = self.config.enable_auto_recovery ~= false
  self.critical_interfaces = self.config.critical_interfaces or {"lan", "wan", "br-lan"}
  self.test_hosts = self.config.test_hosts or {"8.8.8.8", "1.1.1.1", "openwrt.org"}
  
  -- Monitoring state
  self.baseline_state = nil
  self.current_state = NETWORK_STATE.UNKNOWN
  self.failure_count = 0
  self.last_check_time = 0
  self.monitoring_active = false
  
  -- Performance tracking
  self.performance_history = {}
  self.latency_samples = {}
  self.bandwidth_samples = {}
  
  -- Alert tracking
  self.alert_history = {}
  self.recovery_attempts = 0
  
  -- Test results cache
  self.test_cache = {}
  self.interface_cache = {}
  
  return self
end

-- Function: start_monitoring
-- Purpose: Start continuous network monitoring
-- Returns: boolean - success status
function NetworkMonitor:start_monitoring()
  if self.monitoring_active then
    return true
  end
  
  -- Capture baseline network state
  local baseline_success = self:capture_baseline_state()
  if not baseline_success then
    return false
  end
  
  self.monitoring_active = true
  self.last_check_time = os.time()
  
  return true
end

-- Function: stop_monitoring
-- Purpose: Stop network monitoring
function NetworkMonitor:stop_monitoring()
  self.monitoring_active = false
end

-- Function: capture_baseline_state
-- Purpose: Capture the current network state as baseline
-- Returns: boolean - success status
function NetworkMonitor:capture_baseline_state()
  local baseline = {
    timestamp = os.time(),
    interfaces = self:get_all_interface_states(),
    routing_table = self:get_routing_table(),
    dns_servers = self:get_dns_servers(),
    gateway = self:get_default_gateway(),
    connectivity_tests = self:run_all_connectivity_tests(),
    performance_baseline = self:measure_network_performance()
  }
  
  if not baseline.interfaces or not baseline.routing_table then
    return false
  end
  
  self.baseline_state = baseline
  self.current_state = NETWORK_STATE.HEALTHY
  
  return true
end

-- Function: check_network_health
-- Purpose: Perform comprehensive network health check
-- Returns: table - detailed health status
function NetworkMonitor:check_network_health()
  local start_time = os.time()
  
  local health_status = {
    timestamp = start_time,
    overall_state = NETWORK_STATE.UNKNOWN,
    tests_passed = 0,
    tests_failed = 0,
    critical_failures = 0,
    test_results = {},
    performance_metrics = {},
    alerts = {},
    recovery_needed = false
  }
  
  -- Run all network tests
  for test_name, test_config in pairs(TEST_TYPES) do
    local test_result = self:run_network_test(test_name, test_config)
    health_status.test_results[test_name] = test_result
    
    if test_result.success then
      health_status.tests_passed = health_status.tests_passed + 1
    else
      health_status.tests_failed = health_status.tests_failed + 1
      if test_config.critical then
        health_status.critical_failures = health_status.critical_failures + 1
      end
    end
  end
  
  -- Determine overall network state
  health_status.overall_state = self:calculate_network_state(health_status)
  
  -- Check for performance degradation
  health_status.performance_metrics = self:measure_network_performance()
  
  -- Generate alerts if needed
  health_status.alerts = self:generate_health_alerts(health_status)
  
  -- Determine if recovery is needed
  health_status.recovery_needed = self:should_trigger_recovery(health_status)
  
  -- Update monitoring state
  self.current_state = health_status.overall_state
  self.last_check_time = start_time
  
  -- Cache results
  self.test_cache[start_time] = health_status
  
  return health_status
end

-- Function: run_network_test
-- Purpose: Run a specific network test
-- Parameters:
--   test_name (string): Name of the test
--   test_config (table): Test configuration
-- Returns: table - test result
function NetworkMonitor:run_network_test(test_name, test_config)
  local start_time = self:get_microseconds()
  
  local result = {
    test_name = test_name,
    success = false,
    duration_ms = 0,
    error_message = nil,
    details = {}
  }
  
  if test_name == "LOOPBACK" then
    result = self:test_loopback_connectivity()
  elseif test_name == "GATEWAY" then
    result = self:test_gateway_connectivity()
  elseif test_name == "DNS" then
    result = self:test_dns_resolution()
  elseif test_name == "INTERNET" then
    result = self:test_internet_connectivity()
  elseif test_name == "INTERFACE_STATUS" then
    result = self:test_interface_status()
  elseif test_name == "ROUTING_TABLE" then
    result = self:test_routing_table()
  end
  
  result.duration_ms = (self:get_microseconds() - start_time) / 1000
  result.timestamp = os.time()
  
  return result
end

-- Function: test_loopback_connectivity
-- Purpose: Test loopback interface connectivity
-- Returns: table - test result
function NetworkMonitor:test_loopback_connectivity()
  local result = {success = false, details = {}}
  
  -- Test IPv4 loopback
  local ipv4_cmd = "ping -c 1 -W 1 127.0.0.1 >/dev/null 2>&1"
  local ipv4_result = os.execute(ipv4_cmd)
  result.details.ipv4_loopback = (ipv4_result == 0)
  
  -- Test IPv6 loopback if available
  local ipv6_cmd = "ping6 -c 1 -W 1 ::1 >/dev/null 2>&1"
  local ipv6_result = os.execute(ipv6_cmd)
  result.details.ipv6_loopback = (ipv6_result == 0)
  
  result.success = result.details.ipv4_loopback
  if not result.success then
    result.error_message = "Loopback connectivity failed"
  end
  
  return result
end

-- Function: test_gateway_connectivity
-- Purpose: Test default gateway connectivity
-- Returns: table - test result
function NetworkMonitor:test_gateway_connectivity()
  local result = {success = false, details = {}}
  
  local gateway = self:get_default_gateway()
  if not gateway then
    result.error_message = "No default gateway found"
    return result
  end
  
  result.details.gateway_ip = gateway
  
  -- Test gateway ping
  local ping_cmd = "ping -c 1 -W 3 " .. gateway .. " >/dev/null 2>&1"
  local ping_result = os.execute(ping_cmd)
  result.details.ping_success = (ping_result == 0)
  
  -- Measure RTT
  if result.details.ping_success then
    result.details.rtt_ms = self:measure_ping_rtt(gateway)
  end
  
  result.success = result.details.ping_success
  if not result.success then
    result.error_message = "Gateway " .. gateway .. " unreachable"
  end
  
  return result
end

-- Function: test_dns_resolution
-- Purpose: Test DNS resolution functionality
-- Returns: table - test result
function NetworkMonitor:test_dns_resolution()
  local result = {success = false, details = {}}
  
  local dns_servers = self:get_dns_servers()
  result.details.dns_servers = dns_servers
  
  -- Test resolution of known hosts
  local test_hosts = {"openwrt.org", "google.com", "cloudflare.com"}
  local resolved_count = 0
  
  for _, host in ipairs(test_hosts) do
    local resolve_cmd = "nslookup " .. host .. " >/dev/null 2>&1"
    local resolve_result = os.execute(resolve_cmd)
    if resolve_result == 0 then
      resolved_count = resolved_count + 1
    end
  end
  
  result.details.hosts_tested = #test_hosts
  result.details.hosts_resolved = resolved_count
  result.details.resolution_rate = resolved_count / #test_hosts
  
  result.success = (resolved_count >= 2)  -- At least 2 out of 3 should work
  if not result.success then
    result.error_message = "DNS resolution failing (" .. resolved_count .. "/" .. #test_hosts .. ")"
  end
  
  return result
end

-- Function: test_internet_connectivity
-- Purpose: Test external internet connectivity
-- Returns: table - test result
function NetworkMonitor:test_internet_connectivity()
  local result = {success = false, details = {}}
  
  local reachable_count = 0
  result.details.test_results = {}
  
  for _, host in ipairs(self.test_hosts) do
    local ping_cmd = "ping -c 1 -W 5 " .. host .. " >/dev/null 2>&1"
    local ping_result = os.execute(ping_cmd)
    local host_reachable = (ping_result == 0)
    
    result.details.test_results[host] = {
      reachable = host_reachable,
      rtt_ms = host_reachable and self:measure_ping_rtt(host) or nil
    }
    
    if host_reachable then
      reachable_count = reachable_count + 1
    end
  end
  
  result.details.hosts_reachable = reachable_count
  result.details.total_hosts = #self.test_hosts
  
  result.success = (reachable_count >= 1)  -- At least one external host should be reachable
  if not result.success then
    result.error_message = "No external connectivity (" .. reachable_count .. "/" .. #self.test_hosts .. ")"
  end
  
  return result
end

-- Function: test_interface_status
-- Purpose: Test critical network interface status
-- Returns: table - test result
function NetworkMonitor:test_interface_status()
  local result = {success = true, details = {}}
  
  for _, interface in ipairs(self.critical_interfaces) do
    local interface_info = self:get_interface_info(interface)
    result.details[interface] = interface_info
    
    if not interface_info.exists then
      result.success = false
      result.error_message = "Critical interface " .. interface .. " not found"
    elseif not interface_info.up then
      result.success = false
      result.error_message = "Critical interface " .. interface .. " is down"
    end
  end
  
  return result
end

-- Function: get_interface_info
-- Purpose: Get detailed information about a network interface
-- Parameters:
--   interface_name (string): Name of the interface
-- Returns: table - interface information
function NetworkMonitor:get_interface_info(interface_name)
  local info = {
    name = interface_name,
    exists = false,
    up = false,
    ip_addresses = {},
    mac_address = nil,
    mtu = nil,
    rx_bytes = 0,
    tx_bytes = 0,
    errors = {}
  }
  
  -- Check if interface exists and get basic info
  local ip_cmd = "ip addr show " .. interface_name .. " 2>/dev/null"
  local handle = io.popen(ip_cmd)
  if handle then
    local output = handle:read("*a")
    handle:close()
    
    if output and output ~= "" then
      info.exists = true
      
      -- Check if interface is up
      info.up = output:match("state UP") ~= nil
      
      -- Extract IP addresses
      for ip in output:gmatch("inet ([%d%.]+)") do
        table.insert(info.ip_addresses, ip)
      end
      
      -- Extract MAC address
      info.mac_address = output:match("link/ether ([%x:]+)")
      
      -- Extract MTU
      info.mtu = tonumber(output:match("mtu (%d+)"))
    end
  end
  
  -- Get traffic statistics
  if info.exists then
    local stats_cmd = "cat /sys/class/net/" .. interface_name .. "/statistics/rx_bytes 2>/dev/null"
    local stats_handle = io.popen(stats_cmd)
    if stats_handle then
      local rx_bytes = stats_handle:read("*a")
      stats_handle:close()
      info.rx_bytes = tonumber(rx_bytes:gsub("%s+", "")) or 0
    end
    
    stats_cmd = "cat /sys/class/net/" .. interface_name .. "/statistics/tx_bytes 2>/dev/null"
    stats_handle = io.popen(stats_cmd)
    if stats_handle then
      local tx_bytes = stats_handle:read("*a")
      stats_handle:close()
      info.tx_bytes = tonumber(tx_bytes:gsub("%s+", "")) or 0
    end
  end
  
  return info
end

-- Function: measure_network_performance
-- Purpose: Measure current network performance metrics
-- Returns: table - performance metrics
function NetworkMonitor:measure_network_performance()
  local metrics = {
    timestamp = os.time(),
    gateway_rtt_ms = nil,
    dns_resolution_time_ms = nil,
    bandwidth_estimate_mbps = nil,
    packet_loss_percent = 0,
    interface_utilization = {}
  }
  
  -- Measure gateway RTT
  local gateway = self:get_default_gateway()
  if gateway then
    metrics.gateway_rtt_ms = self:measure_ping_rtt(gateway)
  end
  
  -- Measure DNS resolution time
  local dns_start = self:get_microseconds()
  local dns_result = os.execute("nslookup google.com >/dev/null 2>&1")
  if dns_result == 0 then
    metrics.dns_resolution_time_ms = (self:get_microseconds() - dns_start) / 1000
  end
  
  -- Estimate packet loss
  if gateway then
    metrics.packet_loss_percent = self:measure_packet_loss(gateway)
  end
  
  -- Measure interface utilization
  for _, interface in ipairs(self.critical_interfaces) do
    local utilization = self:calculate_interface_utilization(interface)
    if utilization then
      metrics.interface_utilization[interface] = utilization
    end
  end
  
  return metrics
end

-- Function: should_trigger_recovery
-- Purpose: Determine if automatic recovery should be triggered
-- Parameters:
--   health_status (table): Current health status
-- Returns: boolean - whether to trigger recovery
function NetworkMonitor:should_trigger_recovery(health_status)
  if not self.enable_auto_recovery then
    return false
  end
  
  -- Trigger recovery on critical failures
  if health_status.critical_failures > 0 then
    return true
  end
  
  -- Trigger recovery if network state is critical or failed
  if health_status.overall_state == NETWORK_STATE.CRITICAL or
     health_status.overall_state == NETWORK_STATE.FAILED then
    return true
  end
  
  -- Check failure count threshold
  if health_status.tests_failed >= self.failure_threshold then
    return true
  end
  
  return false
end

-- Function: trigger_emergency_recovery
-- Purpose: Execute emergency network recovery procedures
-- Returns: table - recovery results
function NetworkMonitor:trigger_emergency_recovery()
  local recovery_start = os.time()
  self.recovery_attempts = self.recovery_attempts + 1
  
  local recovery_results = {
    timestamp = recovery_start,
    attempt_number = self.recovery_attempts,
    steps_executed = {},
    success = false,
    recovery_time_seconds = 0
  }
  
  -- Step 1: Reset network interfaces
  for _, interface in ipairs(self.critical_interfaces) do
    local reset_result = self:reset_interface(interface)
    table.insert(recovery_results.steps_executed, {
      step = "reset_interface",
      interface = interface,
      success = reset_result
    })
  end
  
  -- Step 2: Restart network services
  local services = {"network", "dnsmasq", "odhcpd"}
  for _, service in ipairs(services) do
    local restart_result = os.execute("/etc/init.d/" .. service .. " restart")
    table.insert(recovery_results.steps_executed, {
      step = "restart_service",
      service = service,
      success = (restart_result == 0)
    })
  end
  
  -- Step 3: Verify recovery
  os.execute("sleep 5")  -- Wait for services to stabilize
  local health_check = self:check_network_health()
  recovery_results.post_recovery_health = health_check
  
  recovery_results.success = (health_check.overall_state == NETWORK_STATE.HEALTHY or
                             health_check.overall_state == NETWORK_STATE.DEGRADED)
  
  recovery_results.recovery_time_seconds = os.time() - recovery_start
  
  return recovery_results
end

-- Utility methods
function NetworkMonitor:get_microseconds()
  local handle = io.popen("date +%s%6N")
  if handle then
    local result = handle:read("*a"):gsub("%s+", "")
    handle:close()
    return tonumber(result) or (os.time() * 1000000)
  end
  return os.time() * 1000000
end

function NetworkMonitor:get_default_gateway()
  local handle = io.popen("ip route | grep default | awk '{print $3}' | head -1")
  if handle then
    local gateway = handle:read("*a"):gsub("%s+", "")
    handle:close()
    return gateway ~= "" and gateway or nil
  end
  return nil
end

function NetworkMonitor:measure_ping_rtt(host)
  local handle = io.popen("ping -c 1 -W 3 " .. host .. " 2>/dev/null | grep 'time=' | sed 's/.*time=\\([0-9.]*\\).*/\\1/'")
  if handle then
    local rtt = handle:read("*a"):gsub("%s+", "")
    handle:close()
    return tonumber(rtt)
  end
  return nil
end

-- Additional utility methods would be implemented here...

return NetworkMonitor