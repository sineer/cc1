#!/usr/bin/env lua

-- Add lib and test directories to Lua path for library modules
package.path = "/app/test/?.lua;/app/lib/?.lua;./test/?.lua;./lib/?.lua;" .. package.path

local lu = require('luaunit_fixed')
local Logger = require('logger')

-- Test class for Logger
TestLogger = {}

function TestLogger:test_logger_creation()
    local logger = Logger.new({
        module_name = "TestModule",
        quiet = false,
        verbose = true
    })
    
    lu.assertEquals(logger.module_name, "TestModule")
    lu.assertEquals(logger.quiet, false)
    lu.assertEquals(logger.verbose_enabled, true)
end

function TestLogger:test_logger_defaults()
    local logger = Logger.new({})
    
    lu.assertEquals(logger.module_name, "UCI")
    lu.assertEquals(logger.quiet, false)
    lu.assertEquals(logger.verbose_enabled, false)
end

function TestLogger:test_update_config()
    local logger = Logger.new({
        module_name = "Test",
        quiet = false,
        verbose = false
    })
    
    -- Update quiet mode
    logger:update_config({quiet = true})
    lu.assertEquals(logger.quiet, true)
    
    -- Update verbose mode
    logger:update_config({verbose = true})
    lu.assertEquals(logger.verbose_enabled, true)
    
    -- Partial update
    logger:update_config({quiet = false})
    lu.assertEquals(logger.quiet, false)
    lu.assertEquals(logger.verbose_enabled, true)
end

function TestLogger:test_verbose_enabled_fix()
    local logger = Logger.new({verbose = true})
    
    -- Should have verbose method
    lu.assertEquals(type(logger.verbose), "function")
    
    -- Should store state in verbose_enabled
    lu.assertEquals(logger.verbose_enabled, true)
end

function TestLogger:test_logger_methods_exist()
    local logger = Logger.new({module_name = "Test"})
    
    -- Test that all expected methods exist
    lu.assertEquals(type(logger.info), "function")
    lu.assertEquals(type(logger.error), "function")
    lu.assertEquals(type(logger.verbose), "function")
    lu.assertEquals(type(logger.update_config), "function")
end

function TestLogger:test_nil_parameter_handling()
    local logger = Logger.new({module_name = "Test"})
    
    -- Test empty message - should not crash
    local ok = pcall(function() logger:info("") end)
    lu.assertTrue(ok)
    
    -- Test normal message - should work
    ok = pcall(function() logger:info("test message") end)
    lu.assertTrue(ok)
end

function TestLogger:test_quiet_mode_settings()
    -- Test quiet mode creation
    local quiet_logger = Logger.new({module_name = "Test", quiet = true})
    lu.assertEquals(quiet_logger.quiet, true)
    
    -- Test non-quiet mode
    local normal_logger = Logger.new({module_name = "Test", quiet = false})
    lu.assertEquals(normal_logger.quiet, false)
end

function TestLogger:test_verbose_mode_settings()
    -- Test verbose mode creation
    local verbose_logger = Logger.new({module_name = "Test", verbose = true})
    lu.assertEquals(verbose_logger.verbose_enabled, true)
    
    -- Test non-verbose mode
    local normal_logger = Logger.new({module_name = "Test", verbose = false})
    lu.assertEquals(normal_logger.verbose_enabled, false)
end

function TestLogger:test_multiple_logger_instances()
    -- Test creating multiple independent loggers
    local logger1 = Logger.new({module_name = "Module1"})
    local logger2 = Logger.new({module_name = "Module2", verbose = true})
    local logger3 = Logger.new({module_name = "Module3", quiet = true})
    
    lu.assertEquals(logger1.module_name, "Module1")
    lu.assertEquals(logger2.module_name, "Module2")
    lu.assertEquals(logger3.module_name, "Module3")
    
    lu.assertEquals(logger1.verbose_enabled, false)
    lu.assertEquals(logger2.verbose_enabled, true)
    lu.assertEquals(logger3.quiet, true)
end

function TestLogger:test_config_update_edge_cases()
    local logger = Logger.new({module_name = "Test"})
    
    -- Test empty config update
    local ok = pcall(function() logger:update_config({}) end)
    lu.assertTrue(ok)
    
    -- Test normal config update
    ok = pcall(function() logger:update_config({verbose = true}) end)
    lu.assertTrue(ok)
end

-- Run the tests
os.exit(lu.LuaUnit.run())