-- test_command_base.lua - Unit tests for CommandBase module
local TestFramework = require("test_framework")
local test = TestFramework.new("CommandBase Tests")

-- Initialize test environment
local CommandBase = require("commands.command_base")

-- Test CommandBase creation and initialization
test:add("CommandBase creation", function()
    local cmd = CommandBase:new({
        name = "test",
        description = "Test command",
        help = "Test help message"
    })
    
    test:assert_equal(cmd.name, "test", "Command name should be set")
    test:assert_equal(cmd.description, "Test command", "Description should be set")
    test:assert_equal(cmd.help, "Test help message", "Help should be set")
end)

-- Test option parsing
test:add("Option parsing - basic flags", function()
    local cmd = CommandBase:new({name = "test"})
    
    local args = {"--verbose", "--dry-run", "target"}
    local options, remaining = cmd:parse_args(args)
    
    test:assert_equal(options.verbose, true, "Verbose flag should be parsed")
    test:assert_equal(options.dry_run, true, "Dry-run flag should be parsed")
    test:assert_equal(#remaining, 1, "Should have one remaining argument")
    test:assert_equal(remaining[1], "target", "Target should be in remaining args")
end)

-- Test option parsing with values
test:add("Option parsing - with values", function()
    local cmd = CommandBase:new({name = "test"})
    
    local args = {"--password", "secret123", "--output", "json", "file.txt"}
    local options, remaining = cmd:parse_args(args)
    
    test:assert_equal(options.password, "secret123", "Password should be parsed")
    test:assert_equal(options.output, "json", "Output format should be parsed")
    test:assert_equal(remaining[1], "file.txt", "File should be in remaining args")
end)

-- Test empty password handling
test:add("Option parsing - empty password", function()
    local cmd = CommandBase:new({name = "test"})
    
    local args = {"--password", "", "--verbose"}
    local options, remaining = cmd:parse_args(args)
    
    test:assert_equal(options.password, "", "Empty password should be preserved")
    test:assert_equal(options.verbose, true, "Following flag should be parsed")
end)

-- Test malformed arguments
test:add("Option parsing - malformed arguments", function()
    local cmd = CommandBase:new({name = "test"})
    
    -- Test missing value for option
    local args = {"--password"}
    local options, remaining = cmd:parse_args(args)
    test:assert_equal(options.password, nil, "Missing value should result in nil")
    
    -- Test double dash
    args = {"--", "--not-a-flag"}
    options, remaining = cmd:parse_args(args)
    test:assert_equal(remaining[1], "--not-a-flag", "Arguments after -- should not be parsed")
end)

-- Test validate_environment method
test:add("Environment validation", function()
    local cmd = CommandBase:new({name = "test"})
    
    -- Mock required tools
    local original_io_popen = io.popen
    io.popen = function(command)
        if command:match("which uci") then
            return {
                read = function() return "/bin/uci" end,
                close = function() return true, 0 end
            }
        end
        return {
            read = function() return nil end,
            close = function() return true, 1 end
        }
    end
    
    local success, err = cmd:validate_environment()
    test:assert_equal(success, true, "Environment validation should pass with UCI available")
    
    -- Test missing UCI
    io.popen = function(command)
        return {
            read = function() return nil end,
            close = function() return true, 1 end
        }
    end
    
    success, err = cmd:validate_environment()
    test:assert_equal(success, false, "Environment validation should fail without UCI")
    test:assert_match(err, "UCI", "Error should mention UCI")
    
    -- Restore original
    io.popen = original_io_popen
end)

-- Test argument validation
test:add("Argument validation", function()
    local cmd = CommandBase:new({
        name = "test",
        min_args = 2,
        max_args = 3
    })
    
    -- Test too few arguments
    local success, err = cmd:validate_args({"one"})
    test:assert_equal(success, false, "Should fail with too few arguments")
    test:assert_match(err, "at least 2", "Error should mention minimum")
    
    -- Test correct number
    success, err = cmd:validate_args({"one", "two"})
    test:assert_equal(success, true, "Should succeed with correct number")
    
    -- Test too many arguments
    success, err = cmd:validate_args({"one", "two", "three", "four"})
    test:assert_equal(success, false, "Should fail with too many arguments")
    test:assert_match(err, "at most 3", "Error should mention maximum")
end)

-- Test help formatting
test:add("Help formatting", function()
    local cmd = CommandBase:new({
        name = "test",
        description = "Test command",
        help = "Usage: test [options] <file>",
        options = {
            {"-v, --verbose", "Enable verbose output"},
            {"-d, --dry-run", "Show what would be done"},
            {"--password <pass>", "SSH password"}
        }
    })
    
    local help = cmd:format_help()
    test:assert_match(help, "Test command", "Help should include description")
    test:assert_match(help, "Usage: test", "Help should include usage")
    test:assert_match(help, "--verbose", "Help should include options")
    test:assert_match(help, "SSH password", "Help should include option descriptions")
end)

-- Test error handling
test:add("Error handling", function()
    local cmd = CommandBase:new({name = "test"})
    
    -- Test nil arguments
    local options, remaining = cmd:parse_args(nil)
    test:assert_table(options, "Should return empty options for nil")
    test:assert_table(remaining, "Should return empty remaining for nil")
    
    -- Test empty arguments
    options, remaining = cmd:parse_args({})
    test:assert_table(options, "Should return empty options for empty array")
    test:assert_equal(#remaining, 0, "Should have no remaining arguments")
end)

-- Test custom option handlers
test:add("Custom option handlers", function()
    local cmd = CommandBase:new({
        name = "test",
        option_handlers = {
            ["--custom"] = function(value, options)
                options.custom_processed = "processed_" .. (value or "default")
            end
        }
    })
    
    local args = {"--custom", "value", "--other"}
    local options = cmd:parse_args(args)
    
    test:assert_equal(options.custom_processed, "processed_value", "Custom handler should process option")
    test:assert_equal(options.other, true, "Other options should still work")
end)

-- Run all tests
test:run()