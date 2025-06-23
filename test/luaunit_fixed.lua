-- Simple luaunit wrapper to fix Lua 5.1 compatibility
local script_dir = debug.getinfo(1, "S").source:match("@?(.*/)") or "./"
local original_luaunit = loadfile(script_dir .. "luaunit.lua")

-- Patch the randomseed function call for Lua 5.1 compatibility
local original_randomseed = math.randomseed
math.randomseed = function(seed)
    if seed == nil then
        seed = os.time()
    elseif type(seed) == "number" then
        seed = math.floor(seed)
    end
    -- Ensure seed is within valid range for Lua 5.1
    if seed > 2147483647 then
        seed = seed % 2147483647
    end
    return original_randomseed(seed)
end

-- Load the original luaunit
local result = original_luaunit()

-- Restore original randomseed
math.randomseed = original_randomseed

return result or require("luaunit")