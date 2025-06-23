#!/usr/bin/env lua

--[[
List Deduplicator Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Provides intelligent deduplication of UCI list values with multiple strategies
  optimized for different types of configuration data.

Features:
  - PRESERVE_ORDER: Simple deduplication maintaining original order
  - NETWORK_AWARE: Smart normalization for network values (IPs, ports)
  - PRIORITY_BASED: Keep first occurrence (highest priority)

Usage:
  local ListDeduplicator = require('list_deduplicator')
  local dedup = ListDeduplicator.new()
  local result = dedup:dedupe_list({"eth0", "eth1", "eth0"}, "PRESERVE_ORDER")
]]

local ListDeduplicator = {}
ListDeduplicator.__index = ListDeduplicator

-- Deduplication strategies
local ListDedupeStrategy = {
    PRESERVE_ORDER = "preserve_order",
    NETWORK_AWARE = "network_aware", 
    PRIORITY_BASED = "priority_based"
}

-- Export strategies for external use
ListDeduplicator.Strategy = ListDedupeStrategy

-- Function: ListDeduplicator.new
-- Purpose: Create a new deduplicator instance
-- Returns: ListDeduplicator instance
function ListDeduplicator.new()
    local self = setmetatable({}, ListDeduplicator)
    return self
end

-- Function: normalize_network_value
-- Purpose: Normalize network-related values for accurate deduplication
-- Parameters:
--   value (string): Network value to normalize (IP, port, interface name)
-- Returns: string - Normalized value for comparison
-- Normalization rules:
--   - IP addresses: Remove leading zeros (e.g., "192.168.001.001" -> "192.168.1.1")
--   - Port ranges: Sort and standardize (e.g., "80,443,22" -> "22,80,443")
--   - General: Convert to lowercase, remove extra whitespace
-- Example:
--   normalize_network_value("192.168.001.100") -> "192.168.1.100"
--   normalize_network_value("80,22,443") -> "22,80,443"
function ListDeduplicator:normalize_network_value(value)
    if not value then return "" end
    
    -- Normalize IP addresses (remove leading zeros, etc.)
    local ip_pattern = "^(%d+)%.(%d+)%.(%d+)%.(%d+)$"
    local a, b, c, d = value:match(ip_pattern)
    if a and b and c and d then
        return string.format("%d.%d.%d.%d", tonumber(a), tonumber(b), tonumber(c), tonumber(d))
    end
    
    -- Normalize port ranges and lists
    if value:match("^%d+[%-%s,]") then
        local ports = {}
        for port in value:gmatch("%d+") do
            table.insert(ports, tonumber(port))
        end
        table.sort(ports)
        return table.concat(ports, ",")
    end
    
    -- Default normalization: lowercase and remove whitespace
    return value:lower():gsub("%s+", "")
end

-- Function: dedupe_list
-- Purpose: Remove duplicate entries from UCI lists using specified strategy
-- Parameters:
--   list_values (table|string): List values to deduplicate
--   strategy (string, optional): Deduplication strategy to use
-- Returns: table - Deduplicated list maintaining order based on strategy
-- Strategies:
--   PRESERVE_ORDER: Keep first occurrence, maintain original order
--   NETWORK_AWARE: Normalize network values before comparison (IPs, ports)
--   PRIORITY_BASED: Same as PRESERVE_ORDER (first = highest priority)
-- Example:
--   dedupe_list({"eth0", "eth1", "eth0"}) -> {"eth0", "eth1"}
--   dedupe_list({"192.168.1.1", "192.168.001.001"}, NETWORK_AWARE) -> {"192.168.1.1"}
function ListDeduplicator:dedupe_list(list_values, strategy)
    if not list_values then
        return {}
    end
    
    -- Normalize input to table
    if type(list_values) == "string" then
        list_values = {list_values}
    elseif type(list_values) ~= "table" then
        return {}
    end
    
    -- No deduplication needed for single or empty lists
    if #list_values <= 1 then
        return list_values
    end
    
    strategy = strategy or ListDedupeStrategy.PRESERVE_ORDER
    local seen = {}
    local result = {}
    
    if strategy == ListDedupeStrategy.PRESERVE_ORDER then
        -- Simple deduplication: keep first occurrence
        for _, value in ipairs(list_values) do
            if not seen[value] then
                seen[value] = true
                table.insert(result, value)
            end
        end
    elseif strategy == ListDedupeStrategy.NETWORK_AWARE then
        -- Smart deduplication for network-related entries (IPs, ports, etc.)
        for _, value in ipairs(list_values) do
            local normalized = self:normalize_network_value(value)
            if not seen[normalized] then
                seen[normalized] = true
                table.insert(result, value)  -- Keep original format
            end
        end
    elseif strategy == ListDedupeStrategy.PRIORITY_BASED then
        -- Keep first occurrence (higher priority)
        return self:dedupe_list(list_values, ListDedupeStrategy.PRESERVE_ORDER)
    end
    
    return result
end

-- Function: auto_select_strategy
-- Purpose: Automatically select the best deduplication strategy based on list name
-- Parameters:
--   list_name (string): Name of the UCI list option
-- Returns: string - Strategy constant
-- Strategy Selection Rules:
--   - Network-related lists (network, server, entry): Use NETWORK_AWARE
--   - Protocol lists (proto, match): Use PRIORITY_BASED
--   - Others: Use PRESERVE_ORDER
function ListDeduplicator:auto_select_strategy(list_name)
    if not list_name then
        return ListDedupeStrategy.PRESERVE_ORDER
    end
    
    -- Network-related lists benefit from normalization
    if list_name == "network" or list_name == "server" or list_name == "entry" then
        return ListDedupeStrategy.NETWORK_AWARE
    end
    
    -- Protocol lists where order matters (first = highest priority)
    if list_name == "proto" or list_name == "match" then
        return ListDedupeStrategy.PRIORITY_BASED
    end
    
    -- Default strategy
    return ListDedupeStrategy.PRESERVE_ORDER
end

-- Function: dedupe_list_auto
-- Purpose: Deduplicate a list using automatically selected strategy
-- Parameters:
--   list_values (table|string): List values to deduplicate
--   list_name (string): Name of the list for strategy selection
-- Returns: table - Deduplicated list
-- Example:
--   dedupe_list_auto({"192.168.1.1", "192.168.001.001"}, "network") 
--     -> Uses NETWORK_AWARE strategy automatically
function ListDeduplicator:dedupe_list_auto(list_values, list_name)
    local strategy = self:auto_select_strategy(list_name)
    return self:dedupe_list(list_values, strategy)
end

return ListDeduplicator