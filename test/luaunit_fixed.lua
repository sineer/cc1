-- Simple luaunit wrapper to fix Lua 5.1 compatibility
local original_luaunit = loadfile("luaunit.lua")

-- Patch the randomseed function call
local original_randomseed = math.randomseed
math.randomseed = function(seed)
    if type(seed) == "number" then
        seed = math.floor(seed)
    end
    return original_randomseed(seed)
end

-- Load the original luaunit
local result = original_luaunit()

-- Restore original randomseed
math.randomseed = original_randomseed

return result or require("luaunit")