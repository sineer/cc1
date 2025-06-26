#!/usr/bin/env lua

--[[
Fleet Manager for UCI Configuration Management
Version: 1.0.0

Purpose:
  Enterprise fleet management system for coordinating UCI configuration
  operations across multiple OpenWRT devices. Provides orchestrated
  deployments, health monitoring, and centralized management capabilities.

Features:
  - Multi-device orchestrated deployments
  - Canary and blue-green deployment strategies
  - Real-time fleet health monitoring
  - Centralized configuration management
  - Device grouping and targeting
  - Rollback coordination across fleet
  - Performance and compliance reporting
  - Scalable parallel execution

Usage:
  local FleetManager = require('fleet_manager')
  local fleet = FleetManager.new({
    device_registry = "/etc/fleet/devices.json",
    max_parallel = 10,
    deployment_strategy = "rolling",
    health_check_interval = 60
  })
]]

local json = require("json") or require("cjson") or {
  encode = function(t) return "JSON_NOT_AVAILABLE" end,
  decode = function(s) return {} end
}

local FleetManager = {}
FleetManager.__index = FleetManager

-- Deployment strategies
local DEPLOYMENT_STRATEGY = {
  ROLLING = "rolling",           -- Deploy to devices one by one
  CANARY = "canary",            -- Deploy to subset first, then all
  BLUE_GREEN = "blue_green",    -- Deploy to inactive set, then switch
  PARALLEL = "parallel",        -- Deploy to all devices simultaneously
  MANUAL = "manual"             -- Manual approval for each device
}

-- Device states
local DEVICE_STATE = {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  FAILED = "failed",
  UNREACHABLE = "unreachable",
  UPDATING = "updating",
  UNKNOWN = "unknown"
}

-- Deployment phases
local DEPLOYMENT_PHASE = {
  PLANNING = "planning",
  PRE_FLIGHT = "pre_flight",
  DEPLOYMENT = "deployment",
  VERIFICATION = "verification",
  ROLLBACK = "rollback",
  COMPLETED = "completed",
  FAILED = "failed"
}

-- Function: FleetManager.new
-- Purpose: Create a new fleet manager instance
-- Parameters:
--   config (table): Fleet manager configuration
-- Returns: FleetManager instance
function FleetManager.new(config)
  local self = setmetatable({}, FleetManager)
  
  -- Configuration with defaults
  self.config = config or {}
  self.device_registry = self.config.device_registry or "/etc/fleet/devices.json"
  self.max_parallel = self.config.max_parallel or 10
  self.deployment_strategy = self.config.deployment_strategy or DEPLOYMENT_STRATEGY.ROLLING
  self.health_check_interval = self.config.health_check_interval or 60
  self.canary_percentage = self.config.canary_percentage or 10
  
  -- Fleet state
  self.devices = {}
  self.device_groups = {}
  self.active_deployments = {}
  self.deployment_history = {}
  
  -- Health monitoring
  self.health_status = {}
  self.last_health_check = 0
  self.health_alerts = {}
  
  -- Load device registry
  self:load_device_registry()
  
  return self
end

-- Function: load_device_registry
-- Purpose: Load device registry from configuration file
-- Returns: boolean - success status
function FleetManager:load_device_registry()
  local file = io.open(self.device_registry, "r")
  if not file then
    -- Create empty registry
    self.devices = {}
    self:save_device_registry()
    return true
  end
  
  local content = file:read("*a")
  file:close()
  
  if content and content ~= "" then
    local success, registry = pcall(json.decode, content)
    if success and registry then
      self.devices = registry.devices or {}
      self.device_groups = registry.device_groups or {}
      return true
    end
  end
  
  return false
end

-- Function: save_device_registry
-- Purpose: Save device registry to configuration file
-- Returns: boolean - success status
function FleetManager:save_device_registry()
  -- Ensure directory exists
  os.execute("mkdir -p $(dirname '" .. self.device_registry .. "')")
  
  local registry = {
    version = "1.0",
    timestamp = os.time(),
    devices = self.devices,
    device_groups = self.device_groups
  }
  
  local file = io.open(self.device_registry, "w")
  if file then
    file:write(json.encode(registry))
    file:close()
    return true
  end
  
  return false
end

-- Function: add_device
-- Purpose: Add a device to the fleet
-- Parameters:
--   device_info (table): Device information
-- Returns: boolean - success status
function FleetManager:add_device(device_info)
  if not device_info.id or not device_info.host then
    return false
  end
  
  local device = {
    id = device_info.id,
    host = device_info.host,
    port = device_info.port or 22,
    username = device_info.username or "root",
    password = device_info.password,
    key_file = device_info.key_file,
    
    -- Device metadata
    name = device_info.name or device_info.id,
    location = device_info.location,
    environment = device_info.environment or "production",
    device_type = device_info.device_type,
    firmware_version = device_info.firmware_version,
    
    -- Fleet management
    groups = device_info.groups or {},
    deployment_order = device_info.deployment_order or 100,
    max_parallel_deployments = device_info.max_parallel_deployments or 1,
    
    -- Health settings
    health_check_enabled = device_info.health_check_enabled ~= false,
    health_check_interval = device_info.health_check_interval or self.health_check_interval,
    
    -- State tracking
    state = DEVICE_STATE.UNKNOWN,
    last_seen = 0,
    last_deployment = nil,
    deployment_history = {},
    
    -- Statistics
    stats = {
      deployments_successful = 0,
      deployments_failed = 0,
      uptime_percentage = 0,
      last_health_check = 0
    }
  }
  
  self.devices[device_info.id] = device
  
  -- Add to groups
  for _, group in ipairs(device.groups) do
    if not self.device_groups[group] then
      self.device_groups[group] = {}
    end
    table.insert(self.device_groups[group], device_info.id)
  end
  
  self:save_device_registry()
  
  return true
end

-- Function: create_deployment
-- Purpose: Create a new fleet deployment
-- Parameters:
--   deployment_config (table): Deployment configuration
-- Returns: string - deployment ID
function FleetManager:create_deployment(deployment_config)
  local deployment_id = self:generate_deployment_id()
  
  local deployment = {
    id = deployment_id,
    timestamp = os.time(),
    status = DEPLOYMENT_PHASE.PLANNING,
    
    -- Configuration
    name = deployment_config.name or "Unnamed Deployment",
    description = deployment_config.description,
    strategy = deployment_config.strategy or self.deployment_strategy,
    
    -- Targeting
    target_devices = deployment_config.target_devices or {},
    target_groups = deployment_config.target_groups or {},
    exclude_devices = deployment_config.exclude_devices or {},
    
    -- Deployment settings
    config_source = deployment_config.config_source,
    config_target = deployment_config.config_target or "default",
    parallel_limit = deployment_config.parallel_limit or self.max_parallel,
    
    -- Strategy-specific settings
    canary_percentage = deployment_config.canary_percentage or self.canary_percentage,
    rollback_on_failure = deployment_config.rollback_on_failure ~= false,
    health_check_required = deployment_config.health_check_required ~= false,
    
    -- Timing
    deployment_timeout = deployment_config.deployment_timeout or 300,
    pre_flight_checks = deployment_config.pre_flight_checks ~= false,
    
    -- State tracking
    phase_history = {},
    device_results = {},
    error_log = {},
    
    -- Progress tracking
    total_devices = 0,
    devices_completed = 0,
    devices_failed = 0,
    devices_pending = 0,
    
    -- Performance metrics
    start_time = 0,
    end_time = 0,
    total_duration = 0,
    average_device_time = 0
  }
  
  -- Resolve target devices
  deployment.resolved_devices = self:resolve_deployment_targets(deployment)
  deployment.total_devices = #deployment.resolved_devices
  deployment.devices_pending = deployment.total_devices
  
  self.active_deployments[deployment_id] = deployment
  
  return deployment_id
end

-- Function: execute_deployment
-- Purpose: Execute a fleet deployment
-- Parameters:
--   deployment_id (string): Deployment ID
-- Returns: table - execution results
function FleetManager:execute_deployment(deployment_id)
  local deployment = self.active_deployments[deployment_id]
  if not deployment then
    return {success = false, error = "Deployment not found: " .. deployment_id}
  end
  
  deployment.start_time = os.time()
  deployment.status = DEPLOYMENT_PHASE.PRE_FLIGHT
  
  -- Phase 1: Pre-flight checks
  local pre_flight_result = self:execute_pre_flight_checks(deployment)
  self:add_phase_to_history(deployment, DEPLOYMENT_PHASE.PRE_FLIGHT, pre_flight_result)
  
  if not pre_flight_result.success then
    deployment.status = DEPLOYMENT_PHASE.FAILED
    return pre_flight_result
  end
  
  -- Phase 2: Execute deployment strategy
  deployment.status = DEPLOYMENT_PHASE.DEPLOYMENT
  local deployment_result = self:execute_deployment_strategy(deployment)
  self:add_phase_to_history(deployment, DEPLOYMENT_PHASE.DEPLOYMENT, deployment_result)
  
  -- Phase 3: Verification
  deployment.status = DEPLOYMENT_PHASE.VERIFICATION
  local verification_result = self:execute_post_deployment_verification(deployment)
  self:add_phase_to_history(deployment, DEPLOYMENT_PHASE.VERIFICATION, verification_result)
  
  -- Determine final status
  if deployment_result.success and verification_result.success then
    deployment.status = DEPLOYMENT_PHASE.COMPLETED
  else
    deployment.status = DEPLOYMENT_PHASE.FAILED
    
    -- Execute rollback if configured
    if deployment.rollback_on_failure then
      deployment.status = DEPLOYMENT_PHASE.ROLLBACK
      local rollback_result = self:execute_deployment_rollback(deployment)
      self:add_phase_to_history(deployment, DEPLOYMENT_PHASE.ROLLBACK, rollback_result)
    end
  end
  
  deployment.end_time = os.time()
  deployment.total_duration = deployment.end_time - deployment.start_time
  
  -- Move to history
  self.deployment_history[deployment_id] = deployment
  self.active_deployments[deployment_id] = nil
  
  return {
    success = (deployment.status == DEPLOYMENT_PHASE.COMPLETED),
    deployment_id = deployment_id,
    status = deployment.status,
    duration = deployment.total_duration,
    devices_completed = deployment.devices_completed,
    devices_failed = deployment.devices_failed,
    results = deployment.device_results
  }
end

-- Function: execute_deployment_strategy
-- Purpose: Execute deployment based on strategy
-- Parameters:
--   deployment (table): Deployment configuration
-- Returns: table - execution results
function FleetManager:execute_deployment_strategy(deployment)
  if deployment.strategy == DEPLOYMENT_STRATEGY.ROLLING then
    return self:execute_rolling_deployment(deployment)
  elseif deployment.strategy == DEPLOYMENT_STRATEGY.CANARY then
    return self:execute_canary_deployment(deployment)
  elseif deployment.strategy == DEPLOYMENT_STRATEGY.PARALLEL then
    return self:execute_parallel_deployment(deployment)
  elseif deployment.strategy == DEPLOYMENT_STRATEGY.BLUE_GREEN then
    return self:execute_blue_green_deployment(deployment)
  else
    return {success = false, error = "Unknown deployment strategy: " .. deployment.strategy}
  end
end

-- Function: execute_rolling_deployment
-- Purpose: Execute rolling deployment (one device at a time)
-- Parameters:
--   deployment (table): Deployment configuration
-- Returns: table - execution results
function FleetManager:execute_rolling_deployment(deployment)
  local results = {
    success = true,
    devices_processed = 0,
    device_results = {}
  }
  
  -- Sort devices by deployment order
  local sorted_devices = self:sort_devices_by_deployment_order(deployment.resolved_devices)
  
  for _, device_id in ipairs(sorted_devices) do
    local device_result = self:deploy_to_device(device_id, deployment)
    results.device_results[device_id] = device_result
    results.devices_processed = results.devices_processed + 1
    
    if device_result.success then
      deployment.devices_completed = deployment.devices_completed + 1
    else
      deployment.devices_failed = deployment.devices_failed + 1
      results.success = false
      
      -- Stop on failure for rolling deployment
      break
    end
    
    deployment.devices_pending = deployment.devices_pending - 1
    
    -- Health check after each device
    if deployment.health_check_required then
      local health_ok = self:verify_device_health(device_id)
      if not health_ok then
        results.success = false
        break
      end
    end
  end
  
  return results
end

-- Function: execute_canary_deployment
-- Purpose: Execute canary deployment (subset first, then all)
-- Parameters:
--   deployment (table): Deployment configuration
-- Returns: table - execution results
function FleetManager:execute_canary_deployment(deployment)
  local results = {
    success = true,
    canary_phase = {},
    full_phase = {}
  }
  
  -- Phase 1: Canary deployment
  local canary_devices = self:select_canary_devices(deployment)
  local canary_deployment = self:create_subset_deployment(deployment, canary_devices)
  
  results.canary_phase = self:execute_parallel_deployment(canary_deployment)
  
  if not results.canary_phase.success then
    results.success = false
    return results
  end
  
  -- Canary verification period
  os.execute("sleep " .. (deployment.canary_verification_time or 60))
  
  local canary_health = self:verify_canary_health(canary_devices)
  if not canary_health.success then
    results.success = false
    results.canary_health = canary_health
    return results
  end
  
  -- Phase 2: Full deployment (excluding canary devices)
  local remaining_devices = self:exclude_devices(deployment.resolved_devices, canary_devices)
  local full_deployment = self:create_subset_deployment(deployment, remaining_devices)
  
  results.full_phase = self:execute_rolling_deployment(full_deployment)
  results.success = results.full_phase.success
  
  return results
end

-- Function: deploy_to_device
-- Purpose: Deploy configuration to a single device
-- Parameters:
--   device_id (string): Device ID
--   deployment (table): Deployment configuration
-- Returns: table - deployment result
function FleetManager:deploy_to_device(device_id, deployment)
  local device = self.devices[device_id]
  if not device then
    return {success = false, error = "Device not found: " .. device_id}
  end
  
  local start_time = os.time()
  device.state = DEVICE_STATE.UPDATING
  
  local result = {
    device_id = device_id,
    success = false,
    start_time = start_time,
    end_time = 0,
    duration = 0,
    error = nil,
    steps = {}
  }
  
  -- Step 1: Test connectivity
  local connectivity_test = self:test_device_connectivity(device_id)
  table.insert(result.steps, {step = "connectivity_test", result = connectivity_test})
  
  if not connectivity_test.success then
    result.error = "Device unreachable: " .. connectivity_test.error
    device.state = DEVICE_STATE.UNREACHABLE
    return result
  end
  
  -- Step 2: Create backup
  local backup_result = self:create_device_backup(device_id)
  table.insert(result.steps, {step = "backup", result = backup_result})
  
  if not backup_result.success then
    result.error = "Backup failed: " .. backup_result.error
    device.state = DEVICE_STATE.FAILED
    return result
  end
  
  -- Step 3: Deploy configuration
  local deploy_result = self:deploy_configuration_to_device(device_id, deployment)
  table.insert(result.steps, {step = "deploy", result = deploy_result})
  
  if not deploy_result.success then
    result.error = "Deployment failed: " .. deploy_result.error
    device.state = DEVICE_STATE.FAILED
    
    -- Attempt rollback
    local rollback_result = self:rollback_device_configuration(device_id, backup_result.backup_path)
    table.insert(result.steps, {step = "rollback", result = rollback_result})
    
    return result
  end
  
  -- Step 4: Verify deployment
  local verify_result = self:verify_device_deployment(device_id, deployment)
  table.insert(result.steps, {step = "verify", result = verify_result})
  
  result.success = verify_result.success
  result.end_time = os.time()
  result.duration = result.end_time - result.start_time
  
  -- Update device state
  device.state = result.success and DEVICE_STATE.HEALTHY or DEVICE_STATE.FAILED
  device.last_deployment = deployment.id
  device.stats.last_health_check = os.time()
  
  if result.success then
    device.stats.deployments_successful = device.stats.deployments_successful + 1
  else
    device.stats.deployments_failed = device.stats.deployments_failed + 1
  end
  
  return result
end

-- Function: check_fleet_health
-- Purpose: Check health status of entire fleet
-- Returns: table - fleet health status
function FleetManager:check_fleet_health()
  local health_status = {
    timestamp = os.time(),
    total_devices = 0,
    healthy_devices = 0,
    degraded_devices = 0,
    failed_devices = 0,
    unreachable_devices = 0,
    device_details = {},
    overall_health = "unknown"
  }
  
  for device_id, device in pairs(self.devices) do
    health_status.total_devices = health_status.total_devices + 1
    
    local device_health = self:check_device_health(device_id)
    health_status.device_details[device_id] = device_health
    
    if device_health.state == DEVICE_STATE.HEALTHY then
      health_status.healthy_devices = health_status.healthy_devices + 1
    elseif device_health.state == DEVICE_STATE.DEGRADED then
      health_status.degraded_devices = health_status.degraded_devices + 1
    elseif device_health.state == DEVICE_STATE.FAILED then
      health_status.failed_devices = health_status.failed_devices + 1
    elseif device_health.state == DEVICE_STATE.UNREACHABLE then
      health_status.unreachable_devices = health_status.unreachable_devices + 1
    end
  end
  
  -- Determine overall health
  local health_percentage = health_status.total_devices > 0 and 
    (health_status.healthy_devices / health_status.total_devices) * 100 or 0
  
  if health_percentage >= 95 then
    health_status.overall_health = "excellent"
  elseif health_percentage >= 85 then
    health_status.overall_health = "good"
  elseif health_percentage >= 70 then
    health_status.overall_health = "degraded"
  else
    health_status.overall_health = "critical"
  end
  
  self.health_status = health_status
  self.last_health_check = os.time()
  
  return health_status
end

-- Utility methods
function FleetManager:generate_deployment_id()
  return "deploy-" .. os.date("%Y%m%d") .. "-" .. math.random(10000, 99999)
end

function FleetManager:test_device_connectivity(device_id)
  local device = self.devices[device_id]
  if not device then
    return {success = false, error = "Device not found"}
  end
  
  local ssh_cmd = "ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no " .. 
                  device.username .. "@" .. device.host .. " 'echo OK'"
  
  local result = os.execute(ssh_cmd .. " >/dev/null 2>&1")
  
  return {
    success = (result == 0),
    error = (result ~= 0) and "SSH connection failed" or nil
  }
end

-- Additional utility and implementation methods would continue here...

return FleetManager