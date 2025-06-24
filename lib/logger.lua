#!/usr/bin/env lua

--[[
Logger Utility for UCI Configuration Management
Version: 1.0.0

Purpose:
  Provides consistent logging functionality across all modules with:
  - Standardized log levels (error, info, verbose)
  - Module-specific prefixes for easy identification
  - Configurable quiet and verbose modes
  - Proper stderr/stdout routing for different log levels

Usage:
  local Logger = require('logger')
  local log = Logger.new({
      module_name = "CONFIG",
      quiet = false,
      verbose = false
  })
  
  log:error("Something went wrong")
  log:info("Operation completed")
  log:verbose("Detailed debug information")

Features:
  1. Module-specific prefixes (CONFIG ERROR, SERVICE INFO, etc.)
  2. Respect quiet mode for info messages
  3. Respect verbose mode for debug messages
  4. Proper stderr routing for errors
  5. Consistent formatting across all modules
]]

local Logger = {}
Logger.__index = Logger

-- Function: Logger.new
-- Purpose: Create a new logger instance with specified configuration
-- Parameters:
--   config (table): Configuration options
--     - module_name (string): Name prefix for log messages (e.g., "CONFIG", "SERVICE")
--     - quiet (boolean): If true, suppress info messages
--     - verbose (boolean): If true, show verbose messages
-- Returns: Logger instance
function Logger.new(config)
    local instance = {
        module_name = config.module_name or "UCI",
        quiet = config.quiet or false,
        verbose = config.verbose or false
    }
    setmetatable(instance, Logger)
    return instance
end

-- Function: Logger:error
-- Purpose: Log error message to stderr
-- Parameters:
--   message (string): Error message to log
-- Note: Error messages are always shown regardless of quiet mode
function Logger:error(message)
    io.stderr:write(self.module_name .. " ERROR: " .. message .. "\n")
end

-- Function: Logger:info
-- Purpose: Log informational message to stdout
-- Parameters:
--   message (string): Info message to log
-- Note: Info messages are suppressed in quiet mode
function Logger:info(message)
    if not self.quiet then
        print(self.module_name .. " INFO: " .. message)
    end
end

-- Function: Logger:verbose
-- Purpose: Log verbose/debug message to stdout
-- Parameters:
--   message (string): Verbose message to log
-- Note: Verbose messages only shown when verbose mode is enabled
function Logger:verbose(message)
    if self.verbose then
        print(self.module_name .. " VERBOSE: " .. message)
    end
end

-- Function: Logger:update_config
-- Purpose: Update logger configuration dynamically
-- Parameters:
--   config (table): New configuration options
function Logger:update_config(config)
    if config.module_name then
        self.module_name = config.module_name
    end
    if config.quiet ~= nil then
        self.quiet = config.quiet
    end
    if config.verbose ~= nil then
        self.verbose = config.verbose
    end
end

return Logger