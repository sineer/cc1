#!/usr/bin/env lua

--[[
Validate Command Module for UCI Configuration Management
Version: 1.0.0

Purpose:
  Implements the validate command functionality for checking UCI
  configuration file syntax and structure.

Features:
  - UCI syntax validation
  - Configuration structure analysis
  - Service availability checking
  - Detailed error reporting
  - Batch validation support

Usage:
  local ValidateCommand = require('commands.validate_command')
  local cmd = ValidateCommand.new()
  local exit_code = cmd:execute(args, options)
]]

local CommandBase = require("command_base")
local lfs = require("lfs")

local ValidateCommand = {}
setmetatable(ValidateCommand, {__index = CommandBase})

-- Function: ValidateCommand.new
-- Purpose: Create a new validate command instance
-- Returns: ValidateCommand instance
function ValidateCommand.new()
    local self = CommandBase.new("validate")
    setmetatable(self, {__index = ValidateCommand})
    return self
end

-- Function: show_help
-- Purpose: Display help information for the validate command
function ValidateCommand:show_help()
    print([[
VALIDATE COMMAND - Validate UCI configuration files

USAGE:
  uci-config validate [options] [config-names...]

DESCRIPTION:
  Validates UCI configuration files for syntax errors, structural issues,
  and service availability. Can validate system configs or files from
  a specific directory.

OPTIONS:
  --source-dir=<path>    Validate configs from specific directory
  --check-services       Check if associated services are available
  --show-structure       Display configuration structure information
  --verbose              Show detailed validation information
  --quiet                Only show errors and summary

EXAMPLES:
  # Validate all system configurations
  uci-config validate

  # Validate specific configs
  uci-config validate firewall network dhcp

  # Validate configs from directory
  uci-config validate --source-dir ./etc/config/default

  # Validate with service checking
  uci-config validate --check-services --verbose

  # Show configuration structure
  uci-config validate --show-structure network

VALIDATION CHECKS:
  - UCI syntax correctness
  - Section and option structure
  - Required fields presence
  - Value format validation
  - Service availability (with --check-services)

EXIT CODES:
  0 - All validations passed
  1 - Validation errors found
]])
end

-- Function: get_configs_to_validate
-- Purpose: Determine which configuration files to validate
-- Parameters:
--   options (table): Command options
--   config_args (table): Configuration names from command line
-- Returns: table, string - List of config names and source directory
function ValidateCommand:get_configs_to_validate(options, config_args)
    local source_dir = options["source-dir"] or self.config_manager.config_dir
    local configs = {}
    
    if #config_args > 0 then
        -- Use specified config names
        configs = config_args
    else
        -- Get all configs from source directory
        if options["source-dir"] then
            configs = self.config_manager:get_template_configs()
        else
            configs = self.config_manager:get_system_configs()
        end
    end
    
    return configs, source_dir
end

-- Function: validate_config_structure
-- Purpose: Validate configuration structure and content
-- Parameters:
--   config_name (string): Name of the configuration
--   config_path (string): Path to configuration file
-- Returns: boolean, table - validation result and detailed analysis
function ValidateCommand:validate_config_structure(config_name, config_path)
    local analysis = {
        sections = {},
        warnings = {},
        errors = {},
        statistics = {
            total_sections = 0,
            total_options = 0,
            total_lists = 0
        }
    }
    
    -- Get configuration metadata
    local metadata = self.config_manager:get_config_metadata(config_name, config_path)
    
    if not metadata.exists then
        table.insert(analysis.errors, "Configuration file does not exist")
        return false, analysis
    end
    
    -- Analyze each section
    for section_name, section_info in pairs(metadata.sections) do
        analysis.statistics.total_sections = analysis.statistics.total_sections + 1
        
        local section_analysis = {
            name = section_name,
            type = section_info.type,
            options = {},
            warnings = {},
            errors = {}
        }
        
        -- Check section type
        if not section_info.type or section_info.type == "" then
            table.insert(section_analysis.errors, "Missing section type")
        end
        
        -- Analyze section options
        for option_name, option_info in pairs(section_info.options) do
            if option_info.is_list then
                analysis.statistics.total_lists = analysis.statistics.total_lists + 1
            else
                analysis.statistics.total_options = analysis.statistics.total_options + 1
            end
            
            -- Basic option validation
            if option_info.value == nil or option_info.value == "" then
                table.insert(section_analysis.warnings, 
                           "Empty value for option: " .. option_name)
            end
        end
        
        analysis.sections[section_name] = section_analysis
    end
    
    -- Configuration-specific validation
    local config_valid = self:validate_config_specific(config_name, metadata, analysis)
    
    local has_errors = #analysis.errors > 0
    for _, section in pairs(analysis.sections) do
        if #section.errors > 0 then
            has_errors = true
            break
        end
    end
    
    return not has_errors, analysis
end

-- Function: validate_config_specific
-- Purpose: Perform configuration-specific validation
-- Parameters:
--   config_name (string): Name of the configuration
--   metadata (table): Configuration metadata
--   analysis (table): Analysis results to update
-- Returns: boolean - validation result
function ValidateCommand:validate_config_specific(config_name, metadata, analysis)
    -- Network configuration validation
    if config_name == "network" then
        return self:validate_network_config(metadata, analysis)
    end
    
    -- Firewall configuration validation
    if config_name == "firewall" then
        return self:validate_firewall_config(metadata, analysis)
    end
    
    -- DHCP configuration validation
    if config_name == "dhcp" then
        return self:validate_dhcp_config(metadata, analysis)
    end
    
    -- Default validation passed
    return true
end

-- Function: validate_network_config
-- Purpose: Validate network-specific configuration
-- Parameters:
--   metadata (table): Configuration metadata
--   analysis (table): Analysis results to update
-- Returns: boolean - validation result
function ValidateCommand:validate_network_config(metadata, analysis)
    local has_interface = false
    
    for section_name, section in pairs(metadata.sections) do
        if section.type == "interface" then
            has_interface = true
            
            -- Check for required options
            if not section.options.proto then
                table.insert(analysis.sections[section_name].errors,
                           "Missing required 'proto' option for interface")
            end
        end
    end
    
    if not has_interface then
        table.insert(analysis.warnings, "No network interfaces defined")
    end
    
    return true
end

-- Function: validate_firewall_config
-- Purpose: Validate firewall-specific configuration
-- Parameters:
--   metadata (table): Configuration metadata
--   analysis (table): Analysis results to update
-- Returns: boolean - validation result
function ValidateCommand:validate_firewall_config(metadata, analysis)
    local has_zones = false
    local has_rules = false
    
    for section_name, section in pairs(metadata.sections) do
        if section.type == "zone" then
            has_zones = true
        elseif section.type == "rule" then
            has_rules = true
        end
    end
    
    if not has_zones then
        table.insert(analysis.warnings, "No firewall zones defined")
    end
    
    return true
end

-- Function: validate_dhcp_config
-- Purpose: Validate DHCP-specific configuration
-- Parameters:
--   metadata (table): Configuration metadata
--   analysis (table): Analysis results to update
-- Returns: boolean - validation result
function ValidateCommand:validate_dhcp_config(metadata, analysis)
    local has_dnsmasq = false
    
    for section_name, section in pairs(metadata.sections) do
        if section.type == "dnsmasq" then
            has_dnsmasq = true
            break
        end
    end
    
    if not has_dnsmasq then
        table.insert(analysis.warnings, "No dnsmasq configuration found")
    end
    
    return true
end

-- Function: check_service_availability
-- Purpose: Check if services for configurations are available
-- Parameters:
--   config_names (table): List of configuration names
-- Returns: table - Service availability results
function ValidateCommand:check_service_availability(config_names)
    local results = {}
    local mapping = self.service_manager:get_config_service_mapping()
    
    for _, config_name in ipairs(config_names) do
        local service_name = mapping[config_name]
        if service_name then
            local available = self.service_manager:is_service_available(service_name)
            local status = available and self.service_manager:get_service_status(service_name) or "unavailable"
            
            results[config_name] = {
                service = service_name,
                available = available,
                status = status
            }
        else
            results[config_name] = {
                service = "none",
                available = true,
                status = "n/a"
            }
        end
    end
    
    return results
end

-- Function: display_validation_results
-- Purpose: Display validation results in a formatted way
-- Parameters:
--   config_name (string): Name of the configuration
--   syntax_valid (boolean): Syntax validation result
--   structure_valid (boolean): Structure validation result
--   analysis (table): Detailed analysis results
--   options (table): Display options
function ValidateCommand:display_validation_results(config_name, syntax_valid, structure_valid, analysis, options)
    local overall_valid = syntax_valid and structure_valid
    local status = overall_valid and "PASS" or "FAIL"
    
    if not options.quiet then
        self:log("info", config_name .. ": " .. status)
    end
    
    -- Show errors
    if #analysis.errors > 0 then
        for _, error in ipairs(analysis.errors) do
            self:log("error", "  ERROR: " .. error)
        end
    end
    
    -- Show section errors
    for section_name, section in pairs(analysis.sections) do
        if #section.errors > 0 then
            for _, error in ipairs(section.errors) do
                self:log("error", "  ERROR in " .. section_name .. ": " .. error)
            end
        end
    end
    
    -- Show warnings if verbose
    if options.verbose then
        if #analysis.warnings > 0 then
            for _, warning in ipairs(analysis.warnings) do
                self:log("info", "  WARNING: " .. warning)
            end
        end
        
        for section_name, section in pairs(analysis.sections) do
            if #section.warnings > 0 then
                for _, warning in ipairs(section.warnings) do
                    self:log("info", "  WARNING in " .. section_name .. ": " .. warning)
                end
            end
        end
    end
    
    -- Show structure information
    if options["show-structure"] then
        self:log("info", "  Structure: " .. analysis.statistics.total_sections .. " sections, " ..
                 analysis.statistics.total_options .. " options, " ..
                 analysis.statistics.total_lists .. " lists")
    end
end

-- Function: execute
-- Purpose: Main execution method for validate command
-- Parameters:
--   args (table): Command-line arguments
--   parsed_options (table): Pre-parsed options (optional)
-- Returns: number - Exit code
function ValidateCommand:execute(args, parsed_options)
    -- Parse options if not provided
    local options, target
    if parsed_options then
        options = parsed_options
    else
        options, target = self:parse_options(args, 2)
    end
    
    -- Store options for use by other methods
    self.options = options
    
    -- Get configuration arguments (everything after options)
    local config_args = {}
    if not parsed_options then
        for i = 2, #args do
            if not args[i]:match("^%-%-") then
                table.insert(config_args, args[i])
            end
        end
    end
    
    -- Validate environment
    local env_valid, env_error = self:validate_environment()
    if not env_valid then
        self:log("error", env_error)
        return 1
    end
    
    -- Determine configs to validate
    local configs, source_dir = self:get_configs_to_validate(options, config_args)
    
    if #configs == 0 then
        self:log("error", "No configuration files found to validate")
        return 1
    end
    
    self:log("info", "Validating " .. #configs .. " configuration file(s)")
    if options.verbose then
        self:log("info", "Source directory: " .. source_dir)
    end
    
    -- Validate each configuration
    local total_configs = #configs
    local passed_configs = 0
    local failed_configs = 0
    
    for _, config_name in ipairs(configs) do
        local config_path = source_dir ~= self.config_manager.config_dir and 
                           source_dir .. "/" .. config_name or nil
        
        -- Syntax validation
        local syntax_valid, syntax_message = self.config_manager:validate_config_syntax(config_name, config_path)
        
        -- Structure validation
        local structure_valid, analysis = true, {errors = {}, warnings = {}, sections = {}, statistics = {}}
        if syntax_valid then
            structure_valid, analysis = self:validate_config_structure(config_name, config_path)
        else
            table.insert(analysis.errors, syntax_message)
        end
        
        -- Display results
        self:display_validation_results(config_name, syntax_valid, structure_valid, analysis, options)
        
        if syntax_valid and structure_valid then
            passed_configs = passed_configs + 1
        else
            failed_configs = failed_configs + 1
        end
    end
    
    -- Check service availability if requested
    if options["check-services"] then
        self:log("info", "Checking service availability...")
        local service_results = self:check_service_availability(configs)
        
        for config_name, result in pairs(service_results) do
            if result.service ~= "none" then
                local status_msg = result.available and 
                                 ("available (" .. result.status .. ")") or "not available"
                self:log("info", config_name .. " service (" .. result.service .. "): " .. status_msg)
            end
        end
    end
    
    -- Summary
    local success_rate = math.floor((passed_configs / total_configs) * 100)
    self:log("info", "Validation summary: " .. passed_configs .. "/" .. total_configs .. 
             " passed (" .. success_rate .. "%)")
    
    if failed_configs > 0 then
        self:log("error", failed_configs .. " configuration(s) failed validation")
        return 1
    end
    
    self:log("info", "All configurations passed validation")
    return 0
end

return ValidateCommand