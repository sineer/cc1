local luaunit = require('luaunit_compat')
local rectangle = require('rectangle')

TestRectangle = {}

function TestRectangle:test_area_positive_values()
    local result = rectangle.calculate_area(5, 10)
    luaunit.assertEquals(result, 50)
end

function TestRectangle:test_area_zero_width()
    local result = rectangle.calculate_area(0, 10)
    luaunit.assertEquals(result, 0)
end

function TestRectangle:test_area_zero_height()
    local result = rectangle.calculate_area(5, 0)
    luaunit.assertEquals(result, 0)
end

function TestRectangle:test_area_negative_width()
    luaunit.assertError(rectangle.calculate_area, -5, 10)
end

function TestRectangle:test_area_negative_height()
    luaunit.assertError(rectangle.calculate_area, 5, -10)
end

function TestRectangle:test_area_both_negative()
    luaunit.assertError(rectangle.calculate_area, -5, -10)
end

function TestRectangle:test_area_decimal_values()
    local result = rectangle.calculate_area(2.5, 4.2)
    luaunit.assertAlmostEquals(result, 10.5, 0.001)
end

function TestRectangle:test_area_nil_width()
    luaunit.assertError(rectangle.calculate_area, nil, 10)
end

function TestRectangle:test_area_nil_height()
    luaunit.assertError(rectangle.calculate_area, 5, nil)
end

function TestRectangle:test_area_string_input()
    luaunit.assertError(rectangle.calculate_area, "five", 10)
end

function TestRectangle:test_area_very_small_values()
    local result = rectangle.calculate_area(0.0001, 0.0001)
    luaunit.assertAlmostEquals(result, 0.00000001, 0.000000001)
end

function TestRectangle:test_area_very_large_values()
    local result = rectangle.calculate_area(1e6, 1e6)
    luaunit.assertEquals(result, 1e12)
end

function TestRectangle:test_area_mixed_integer_float()
    local result = rectangle.calculate_area(5, 2.5)
    luaunit.assertEquals(result, 12.5)
end

-- Tests for calculate_perimeter
function TestRectangle:test_perimeter_positive_values()
    local result = rectangle.calculate_perimeter(5, 10)
    luaunit.assertEquals(result, 30)
end

function TestRectangle:test_perimeter_square()
    local result = rectangle.calculate_perimeter(5, 5)
    luaunit.assertEquals(result, 20)
end

function TestRectangle:test_perimeter_zero_width()
    local result = rectangle.calculate_perimeter(0, 10)
    luaunit.assertEquals(result, 20)
end

function TestRectangle:test_perimeter_negative_values()
    luaunit.assertError(rectangle.calculate_perimeter, -5, 10)
end

function TestRectangle:test_perimeter_decimal_values()
    local result = rectangle.calculate_perimeter(2.5, 3.7)
    luaunit.assertAlmostEquals(result, 12.4, 0.001)
end

-- Tests for is_square
function TestRectangle:test_is_square_true()
    local result = rectangle.is_square(5, 5)
    luaunit.assertTrue(result)
end

function TestRectangle:test_is_square_false()
    local result = rectangle.is_square(5, 10)
    luaunit.assertFalse(result)
end

function TestRectangle:test_is_square_zero()
    local result = rectangle.is_square(0, 0)
    luaunit.assertTrue(result)
end

function TestRectangle:test_is_square_decimal_true()
    local result = rectangle.is_square(2.5, 2.5)
    luaunit.assertTrue(result)
end

function TestRectangle:test_is_square_decimal_false()
    local result = rectangle.is_square(2.5, 2.6)
    luaunit.assertFalse(result)
end

function TestRectangle:test_is_square_negative_values()
    luaunit.assertError(rectangle.is_square, -5, -5)
end

os.exit(luaunit.LuaUnit.run())