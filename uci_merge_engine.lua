#!/usr/bin/env lua

--[[
UCI Merge Engine for uspot Configuration
Handles merging of UCI configuration files with duplicate list handling
and conflict resolution for OpenWRT 23.05+
]]

local uci = require("uci")
local lfs = require("lfs")

local UCIMergeEngine = {}
UCIMergeEngine.__index = UCIMergeEngine

-- Initialize merge engine
function UCIMergeEngine.new(options)
    local self = setmetatable({}, UCIMergeEngine)
    self.cursor = uci.cursor()
    self.options = options or {}
    self.dedupe_lists = self.options.dedupe_lists or false
    self.preserve_network = self.options.preserve_network or false
    self.dry_run = self.options.dry_run or false
    self.conflicts = {}
    self.changes = {}
    return self
end

-- List deduplication strategies
local ListDedupeStrategy = {
    PRESERVE_ORDER = "preserve_order",
    NETWORK_AWARE = "network_aware", 
    PRIORITY_BASED = "priority_based"
}

-- Helper function to check if file exists
function UCIMergeEngine:file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

-- Helper function to deep copy table
function UCIMergeEngine:deep_copy(orig)
    local orig_type = type(orig)
    local copy
    if orig_type == 'table' then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[self:deep_copy(orig_key)] = self:deep_copy(orig_value)
        end
        setmetatable(copy, self:deep_copy(getmetatable(orig)))
    else
        copy = orig
    end
    return copy
end

-- Load UCI configuration from file
function UCIMergeEngine:load_config(config_name, config_path)
    if config_path and self:file_exists(config_path) then
        -- Load from specific file path
        local temp_cursor = uci.cursor("/tmp", "/tmp/.uci")
        local cmd = string.format("cp '%s' '/tmp/%s'", config_path, config_name)
        os.execute(cmd)
        return temp_cursor:get_all(config_name) or {}
    else
        -- Load from system UCI
        return self.cursor:get_all(config_name) or {}
    end
end

-- Save UCI configuration
function UCIMergeEngine:save_config(config_name, config_data)
    if self.dry_run then
        table.insert(self.changes, {
            action = "save_config",
            config = config_name,
            data = config_data
        })
        return true
    end
    
    -- Clear existing config sections
    local existing = self.cursor:get_all(config_name) or {}
    for section_name, _ in pairs(existing) do
        self.cursor:delete(config_name, section_name)
    end
    
    -- Add new config sections
    for section_name, section_data in pairs(config_data) do
        local section_type = section_data[".type"]
        if section_type then
            self.cursor:set(config_name, section_name, section_type)
            for option_name, option_value in pairs(section_data) do
                if option_name ~= ".type" and option_name ~= ".name" then
                    if type(option_value) == "table" then
                        -- Handle UCI lists - convert to space-separated values
                        local list_values = {}
                        for _, list_value in ipairs(option_value) do
                            table.insert(list_values, tostring(list_value))
                        end
                        if #list_values > 0 then
                            -- Set as space-separated string for UCI list format
                            local list_string = table.concat(list_values, " ")
                            self.cursor:set(config_name, section_name, option_name, list_string)
                        end
                    else
                        -- Handle UCI options - ensure value is string
                        local string_value = tostring(option_value)
                        self.cursor:set(config_name, section_name, option_name, string_value)
                    end
                end
            end
        end
    end
    
    self.cursor:commit(config_name)
    return true
end

-- Deduplicate list entries
function UCIMergeEngine:dedupe_list(list_values, strategy)
    if not self.dedupe_lists or not list_values then
        return list_values or {}
    end
    
    -- Normalize input to table
    if type(list_values) == "string" then
        list_values = {list_values}
    elseif type(list_values) ~= "table" then
        return {}
    end
    
    if #list_values <= 1 then
        return list_values
    end
    
    strategy = strategy or ListDedupeStrategy.PRESERVE_ORDER
    local seen = {}
    local result = {}
    
    if strategy == ListDedupeStrategy.PRESERVE_ORDER then
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
                table.insert(result, value)
            end
        end
    elseif strategy == ListDedupeStrategy.PRIORITY_BASED then
        -- Keep first occurrence (higher priority)
        return self:dedupe_list(list_values, ListDedupeStrategy.PRESERVE_ORDER)
    end
    
    return result
end

-- Normalize network values for deduplication
function UCIMergeEngine:normalize_network_value(value)
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
    
    return value:lower():gsub("%s+", "")
end

-- Merge UCI lists
function UCIMergeEngine:merge_lists(existing_list, new_list, list_name, section_name)
    -- Normalize inputs to tables
    if type(new_list) == "string" then
        new_list = {new_list}
    elseif not new_list then
        new_list = {}
    end
    
    if type(existing_list) == "string" then
        existing_list = {existing_list}
    elseif not existing_list then
        existing_list = {}
    end
    
    if #new_list == 0 then
        return existing_list
    end
    
    if #existing_list == 0 then
        return self:dedupe_list(new_list)
    end
    
    -- Combine lists
    local combined = self:deep_copy(existing_list)
    for _, value in ipairs(new_list) do
        table.insert(combined, value)
    end
    
    -- Apply deduplication strategy based on list type
    local strategy = ListDedupeStrategy.PRESERVE_ORDER
    if list_name == "network" or list_name == "server" or list_name == "entry" then
        strategy = ListDedupeStrategy.NETWORK_AWARE
    elseif list_name == "proto" or list_name == "match" then
        strategy = ListDedupeStrategy.PRIORITY_BASED
    end
    
    return self:dedupe_list(combined, strategy)
end

-- Merge UCI sections
function UCIMergeEngine:merge_sections(existing_config, new_config, config_name)
    local result = self:deep_copy(existing_config)
    
    for section_name, section_data in pairs(new_config) do
        if result[section_name] then
            -- Section exists, merge options and lists
            for option_name, option_value in pairs(section_data) do
                if option_name ~= ".type" and option_name ~= ".name" then
                    if type(option_value) == "table" then
                        -- Merge lists
                        result[section_name][option_name] = self:merge_lists(
                            result[section_name][option_name],
                            option_value,
                            option_name,
                            section_name
                        )
                    else
                        -- Handle option conflicts
                        if result[section_name][option_name] and 
                           result[section_name][option_name] ~= option_value then
                            table.insert(self.conflicts, {
                                config = config_name,
                                section = section_name,
                                option = option_name,
                                existing = result[section_name][option_name],
                                new = option_value
                            })
                            
                            -- Default: preserve existing, but log conflict
                            if not self.options.preserve_existing then
                                result[section_name][option_name] = option_value
                            end
                        else
                            result[section_name][option_name] = option_value
                        end
                    end
                end
            end
        else
            -- New section, add it
            result[section_name] = self:deep_copy(section_data)
            
            -- Apply list deduplication to new sections
            for option_name, option_value in pairs(result[section_name]) do
                if type(option_value) == "table" then
                    result[section_name][option_name] = self:dedupe_list(option_value)
                end
            end
        end
    end
    
    return result
end

-- Main merge function
function UCIMergeEngine:merge_config(config_name, source_path, target_path)
    -- Load configurations
    local existing_config = self:load_config(config_name, target_path)
    local new_config = self:load_config(config_name, source_path)
    
    if not new_config or next(new_config) == nil then
        return false, "Source configuration is empty or invalid"
    end
    
    -- Perform merge
    local merged_config = self:merge_sections(existing_config, new_config, config_name)
    
    -- Save merged configuration
    local success = self:save_config(config_name, merged_config)
    
    if success then
        table.insert(self.changes, {
            action = "merge_config",
            config = config_name,
            source = source_path,
            target = target_path,
            conflicts = #self.conflicts
        })
    end
    
    return success, merged_config
end

-- Merge multiple configuration files
function UCIMergeEngine:merge_directory(source_dir, target_dir)
    if not source_dir then
        return false, "Source directory not specified"
    end
    
    target_dir = target_dir or "/etc/config"
    local results = {}
    
    -- Get list of config files to merge
    local config_files = {}
    for file in lfs.dir(source_dir) do
        if file ~= "." and file ~= ".." then
            local source_path = source_dir .. "/" .. file
            local target_path = target_dir .. "/" .. file
            table.insert(config_files, {
                name = file,
                source = source_path,
                target = target_path
            })
        end
    end
    
    -- Merge each configuration file
    for _, config in ipairs(config_files) do
        local success, result = self:merge_config(config.name, config.source, config.target)
        results[config.name] = {
            success = success,
            result = result,
            conflicts = #self.conflicts
        }
        
        -- Reset conflicts for next config
        self.conflicts = {}
    end
    
    return true, results
end

-- Get merge summary
function UCIMergeEngine:get_merge_summary()
    return {
        changes = self.changes,
        conflicts = self.conflicts,
        dry_run = self.dry_run
    }
end

return UCIMergeEngine