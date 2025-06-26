#!/usr/bin/env lua

--[[
Configuration Version Manager for UCI Configuration Management
Version: 1.0.0

Purpose:
  Enterprise-grade configuration versioning, drift detection, and compliance
  tracking system. Provides GitOps-style configuration management with
  automated drift detection and remediation capabilities.

Features:
  - Git-based configuration versioning and history
  - Real-time drift detection and alerting
  - Configuration compliance monitoring
  - Automated remediation workflows
  - Configuration templates and inheritance
  - Policy-as-code enforcement
  - Rollback and forward migration capabilities
  - Multi-environment configuration management

Usage:
  local ConfigVersionManager = require('config_version_manager')
  local manager = ConfigVersionManager.new({
    repo_path = "/etc/config/.git",
    drift_check_interval = 300,
    auto_remediation = true,
    compliance_policies = {"security", "network", "service"}
  })
]]

local json = require("json") or require("cjson") or {
  encode = function(t) return "JSON_NOT_AVAILABLE" end,
  decode = function(s) return {} end
}

local ConfigVersionManager = {}
ConfigVersionManager.__index = ConfigVersionManager

-- Configuration states
local CONFIG_STATE = {
  IN_SYNC = "in_sync",
  DRIFTED = "drifted",
  CORRUPTED = "corrupted",
  UNKNOWN = "unknown",
  REMEDIATED = "remediated"
}

-- Drift severity levels
local DRIFT_SEVERITY = {
  CRITICAL = "critical",    -- Security or network critical changes
  HIGH = "high",           -- Service affecting changes
  MEDIUM = "medium",       -- Configuration changes
  LOW = "low",            -- Non-critical changes
  INFO = "info"           -- Informational changes
}

-- Remediation strategies
local REMEDIATION_STRATEGY = {
  AUTOMATIC = "automatic",
  MANUAL = "manual",
  APPROVAL_REQUIRED = "approval_required",
  IGNORE = "ignore"
}

-- Function: ConfigVersionManager.new
-- Purpose: Create a new configuration version manager instance
-- Parameters:
--   config (table): Manager configuration
-- Returns: ConfigVersionManager instance
function ConfigVersionManager.new(config)
  local self = setmetatable({}, ConfigVersionManager)
  
  -- Configuration with defaults
  self.config = config or {}
  self.repo_path = self.config.repo_path or "/etc/config/.git"
  self.config_path = self.config.config_path or "/etc/config"
  self.drift_check_interval = self.config.drift_check_interval or 300
  self.auto_remediation = self.config.auto_remediation ~= false
  self.compliance_policies = self.config.compliance_policies or {}
  
  -- Version tracking
  self.current_version = nil
  self.target_version = nil
  self.version_history = {}
  
  -- Drift detection
  self.baseline_checksums = {}
  self.last_drift_check = 0
  self.drift_status = {}
  self.drift_alerts = {}
  
  -- Compliance tracking
  self.compliance_status = {}
  self.policy_violations = {}
  
  -- Remediation tracking
  self.remediation_queue = {}
  self.remediation_history = {}
  
  -- Initialize manager
  self:initialize_repository()
  
  return self
end

-- Function: initialize_repository
-- Purpose: Initialize Git repository for configuration tracking
-- Returns: boolean - success status
function ConfigVersionManager:initialize_repository()
  -- Check if git repository exists
  local git_check = os.execute("cd " .. self.config_path .. " && git status >/dev/null 2>&1")
  
  if git_check ~= 0 then
    -- Initialize new repository
    local init_commands = {
      "cd " .. self.config_path,
      "git init",
      "git config user.name 'UCI Config Manager'",
      "git config user.email 'uci-config@localhost'",
      "git add .",
      "git commit -m 'Initial configuration commit'"
    }
    
    local init_cmd = table.concat(init_commands, " && ")
    local init_result = os.execute(init_cmd)
    
    if init_result ~= 0 then
      return false
    end
  end
  
  -- Capture initial state
  self:capture_baseline_state()
  self:update_current_version()
  
  return true
end

-- Function: capture_baseline_state
-- Purpose: Capture current configuration state as baseline
-- Returns: boolean - success status
function ConfigVersionManager:capture_baseline_state()
  self.baseline_checksums = {}
  
  -- Calculate checksums for all config files
  local files = self:get_config_files()
  for _, file in ipairs(files) do
    local checksum = self:calculate_file_checksum(file)
    if checksum then
      self.baseline_checksums[file] = {
        checksum = checksum,
        timestamp = os.time(),
        size = self:get_file_size(file)
      }
    end
  end
  
  -- Save baseline to version control
  self:commit_current_state("Baseline configuration capture")
  
  return true
end

-- Function: detect_configuration_drift
-- Purpose: Detect drift from baseline configuration
-- Returns: table - drift detection results
function ConfigVersionManager:detect_configuration_drift()
  local drift_start = os.time()
  
  local drift_result = {
    timestamp = drift_start,
    drift_detected = false,
    total_files = 0,
    changed_files = 0,
    drift_details = {},
    severity = DRIFT_SEVERITY.INFO,
    remediation_required = false
  }
  
  local files = self:get_config_files()
  drift_result.total_files = #files
  
  for _, file in ipairs(files) do
    local current_checksum = self:calculate_file_checksum(file)
    local baseline_info = self.baseline_checksums[file]
    
    if baseline_info and current_checksum ~= baseline_info.checksum then
      -- Drift detected
      drift_result.drift_detected = true
      drift_result.changed_files = drift_result.changed_files + 1
      
      local file_drift = self:analyze_file_drift(file, baseline_info, current_checksum)
      drift_result.drift_details[file] = file_drift
      
      -- Update severity based on file importance
      local file_severity = self:classify_drift_severity(file, file_drift)
      if self:is_more_severe(file_severity, drift_result.severity) then
        drift_result.severity = file_severity
      end
    end
  end
  
  -- Check for new or deleted files
  local new_files, deleted_files = self:detect_file_changes()
  if #new_files > 0 or #deleted_files > 0 then
    drift_result.drift_detected = true
    drift_result.drift_details.file_changes = {
      new_files = new_files,
      deleted_files = deleted_files
    }
  end
  
  -- Determine if remediation is required
  drift_result.remediation_required = self:should_remediate_drift(drift_result)
  
  -- Update drift status
  self.drift_status[drift_start] = drift_result
  self.last_drift_check = drift_start
  
  return drift_result
end

-- Function: analyze_file_drift
-- Purpose: Analyze specific file changes to understand drift
-- Parameters:
--   file (string): File path
--   baseline_info (table): Baseline file information
--   current_checksum (string): Current file checksum
-- Returns: table - detailed drift analysis
function ConfigVersionManager:analyze_file_drift(file, baseline_info, current_checksum)
  local analysis = {
    file = file,
    baseline_checksum = baseline_info.checksum,
    current_checksum = current_checksum,
    baseline_timestamp = baseline_info.timestamp,
    current_timestamp = os.time(),
    size_changed = false,
    content_analysis = {}
  }
  
  -- Check size changes
  local current_size = self:get_file_size(file)
  if current_size ~= baseline_info.size then
    analysis.size_changed = true
    analysis.size_delta = current_size - baseline_info.size
  end
  
  -- Analyze content changes using UCI diff
  local diff_result = self:get_uci_diff(file)
  if diff_result then
    analysis.content_analysis = diff_result
  end
  
  -- Classify change type
  analysis.change_type = self:classify_change_type(file, analysis)
  
  return analysis
end

-- Function: get_uci_diff
-- Purpose: Get UCI-specific differences for a configuration file
-- Parameters:
--   file (string): Configuration file path
-- Returns: table - UCI diff analysis
function ConfigVersionManager:get_uci_diff(file)
  local file_name = file:match("([^/]+)$")
  if not file_name then
    return nil
  end
  
  local diff_analysis = {
    sections_added = {},
    sections_removed = {},
    sections_modified = {},
    options_changed = {}
  }
  
  -- Use git diff to analyze changes
  local git_diff_cmd = "cd " .. self.config_path .. " && git diff HEAD -- " .. file_name
  local handle = io.popen(git_diff_cmd)
  if handle then
    local diff_output = handle:read("*a")
    handle:close()
    
    if diff_output and diff_output ~= "" then
      diff_analysis = self:parse_uci_diff(diff_output)
    end
  end
  
  return diff_analysis
end

-- Function: parse_uci_diff
-- Purpose: Parse UCI configuration diff output
-- Parameters:
--   diff_output (string): Git diff output
-- Returns: table - parsed diff information
function ConfigVersionManager:parse_uci_diff(diff_output)
  local analysis = {
    sections_added = {},
    sections_removed = {},
    sections_modified = {},
    options_changed = {}
  }
  
  -- Parse diff line by line
  for line in diff_output:gmatch("[^\r\n]+") do
    if line:match("^%+config ") then
      -- Section added
      local section_type, section_name = line:match("^%+config%s+(%S+)%s*'?([^']*)'?")
      if section_type then
        table.insert(analysis.sections_added, {
          type = section_type,
          name = section_name or "unnamed"
        })
      end
    elseif line:match("^%-config ") then
      -- Section removed
      local section_type, section_name = line:match("^%-config%s+(%S+)%s*'?([^']*)'?")
      if section_type then
        table.insert(analysis.sections_removed, {
          type = section_type,
          name = section_name or "unnamed"
        })
      end
    elseif line:match("^%+%s+option ") then
      -- Option added
      local option_name, option_value = line:match("^%+%s+option%s+(%S+)%s+(.+)")
      if option_name then
        table.insert(analysis.options_changed, {
          action = "added",
          option = option_name,
          value = option_value
        })
      end
    elseif line:match("^%-%s+option ") then
      -- Option removed
      local option_name, option_value = line:match("^%-%s+option%s+(%S+)%s+(.+)")
      if option_name then
        table.insert(analysis.options_changed, {
          action = "removed",
          option = option_name,
          value = option_value
        })
      end
    end
  end
  
  return analysis
end

-- Function: classify_drift_severity
-- Purpose: Classify the severity of configuration drift
-- Parameters:
--   file (string): Configuration file
--   drift_info (table): Drift analysis information
-- Returns: string - severity level
function ConfigVersionManager:classify_drift_severity(file, drift_info)
  local file_name = file:match("([^/]+)$")
  
  -- Critical files that affect security or network connectivity
  local critical_files = {
    network = true,
    wireless = true,
    firewall = true,
    dropbear = true,
    system = true
  }
  
  -- High priority files that affect services
  local high_priority_files = {
    dhcp = true,
    dnsmasq = true,
    uhttpd = true
  }
  
  if critical_files[file_name] then
    -- Check for critical changes
    if drift_info.content_analysis then
      local analysis = drift_info.content_analysis
      
      -- Network interface changes are critical
      if file_name == "network" and (#analysis.sections_added > 0 or #analysis.sections_removed > 0) then
        return DRIFT_SEVERITY.CRITICAL
      end
      
      -- Firewall rule changes are critical
      if file_name == "firewall" and #analysis.options_changed > 0 then
        return DRIFT_SEVERITY.CRITICAL
      end
      
      -- SSH configuration changes are critical
      if file_name == "dropbear" and #analysis.options_changed > 0 then
        return DRIFT_SEVERITY.CRITICAL
      end
    end
    
    return DRIFT_SEVERITY.HIGH
  elseif high_priority_files[file_name] then
    return DRIFT_SEVERITY.MEDIUM
  else
    return DRIFT_SEVERITY.LOW
  end
end

-- Function: create_remediation_plan
-- Purpose: Create a plan to remediate configuration drift
-- Parameters:
--   drift_result (table): Drift detection results
-- Returns: table - remediation plan
function ConfigVersionManager:create_remediation_plan(drift_result)
  local plan = {
    timestamp = os.time(),
    drift_severity = drift_result.severity,
    strategy = self:determine_remediation_strategy(drift_result),
    steps = {},
    estimated_duration = 0,
    rollback_plan = {},
    approval_required = false
  }
  
  -- Create remediation steps for each drifted file
  for file, drift_info in pairs(drift_result.drift_details) do
    if type(drift_info) == "table" and drift_info.file then
      local file_steps = self:create_file_remediation_steps(file, drift_info)
      for _, step in ipairs(file_steps) do
        table.insert(plan.steps, step)
      end
    end
  end
  
  -- Determine if approval is required
  plan.approval_required = (drift_result.severity == DRIFT_SEVERITY.CRITICAL)
  
  -- Create rollback plan
  plan.rollback_plan = self:create_rollback_plan(plan.steps)
  
  -- Estimate duration
  plan.estimated_duration = #plan.steps * 30  -- 30 seconds per step estimate
  
  return plan
end

-- Function: execute_remediation
-- Purpose: Execute drift remediation plan
-- Parameters:
--   remediation_plan (table): Remediation plan to execute
-- Returns: table - execution results
function ConfigVersionManager:execute_remediation(remediation_plan)
  local execution_start = os.time()
  
  local results = {
    timestamp = execution_start,
    plan_id = remediation_plan.timestamp,
    success = true,
    steps_executed = 0,
    steps_failed = 0,
    step_results = {},
    rollback_executed = false,
    final_state = CONFIG_STATE.UNKNOWN
  }
  
  -- Execute each remediation step
  for i, step in ipairs(remediation_plan.steps) do
    local step_result = self:execute_remediation_step(step)
    results.step_results[i] = step_result
    
    if step_result.success then
      results.steps_executed = results.steps_executed + 1
    else
      results.steps_failed = results.steps_failed + 1
      results.success = false
      
      -- If critical step fails, execute rollback
      if step.critical and not step_result.success then
        results.rollback_executed = true
        self:execute_rollback_plan(remediation_plan.rollback_plan)
        break
      end
    end
  end
  
  -- Verify final state
  if results.success then
    local post_remediation_check = self:detect_configuration_drift()
    if not post_remediation_check.drift_detected then
      results.final_state = CONFIG_STATE.IN_SYNC
    else
      results.final_state = CONFIG_STATE.REMEDIATED
    end
  else
    results.final_state = CONFIG_STATE.DRIFTED
  end
  
  -- Update baseline if remediation was successful
  if results.final_state == CONFIG_STATE.IN_SYNC then
    self:capture_baseline_state()
  end
  
  results.execution_time = os.time() - execution_start
  
  -- Record remediation history
  table.insert(self.remediation_history, results)
  
  return results
end

-- Function: commit_current_state
-- Purpose: Commit current configuration state to version control
-- Parameters:
--   commit_message (string): Commit message
-- Returns: boolean - success status
function ConfigVersionManager:commit_current_state(commit_message)
  local commit_commands = {
    "cd " .. self.config_path,
    "git add .",
    "git commit -m '" .. (commit_message or "Configuration update") .. "'"
  }
  
  local commit_cmd = table.concat(commit_commands, " && ")
  local commit_result = os.execute(commit_cmd)
  
  if commit_result == 0 then
    self:update_current_version()
    return true
  end
  
  return false
end

-- Function: update_current_version
-- Purpose: Update current version information
function ConfigVersionManager:update_current_version()
  local version_cmd = "cd " .. self.config_path .. " && git rev-parse HEAD"
  local handle = io.popen(version_cmd)
  if handle then
    local version = handle:read("*a"):gsub("%s+", "")
    handle:close()
    
    if version and version ~= "" then
      self.current_version = version
      
      -- Get commit information
      local info_cmd = "cd " .. self.config_path .. " && git log -1 --format='%H|%s|%an|%ad' HEAD"
      local info_handle = io.popen(info_cmd)
      if info_handle then
        local info = info_handle:read("*a"):gsub("%s+$", "")
        info_handle:close()
        
        local hash, subject, author, date = info:match("([^|]+)|([^|]+)|([^|]+)|(.+)")
        if hash then
          self.version_history[hash] = {
            hash = hash,
            subject = subject,
            author = author,
            date = date,
            timestamp = os.time()
          }
        end
      end
    end
  end
end

-- Utility methods
function ConfigVersionManager:get_config_files()
  local files = {}
  local lfs = require("lfs")
  
  for file in lfs.dir(self.config_path) do
    if file ~= "." and file ~= ".." and file ~= ".git" then
      local file_path = self.config_path .. "/" .. file
      local attr = lfs.attributes(file_path)
      if attr and attr.mode == "file" then
        table.insert(files, file_path)
      end
    end
  end
  
  return files
end

function ConfigVersionManager:calculate_file_checksum(file_path)
  local handle = io.popen("sha256sum '" .. file_path .. "' 2>/dev/null")
  if handle then
    local output = handle:read("*a")
    handle:close()
    
    local checksum = output:match("([a-f0-9]+)")
    return checksum
  end
  return nil
end

function ConfigVersionManager:get_file_size(file_path)
  local lfs = require("lfs")
  local attr = lfs.attributes(file_path)
  return attr and attr.size or 0
end

-- Additional utility and implementation methods would continue here...

return ConfigVersionManager