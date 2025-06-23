local rectangle = {}

-- Private validation functions
local function validate_not_nil(width, height)
    if width == nil then
        error("Width must not be nil", 2)
    end
    if height == nil then
        error("Height must not be nil", 2)
    end
end

local function validate_numeric(width, height)
    if type(width) ~= "number" then
        error("Width must be a number, got " .. type(width), 2)
    end
    if type(height) ~= "number" then
        error("Height must be a number, got " .. type(height), 2)
    end
end

local function validate_non_negative(width, height)
    if width < 0 then
        error("Width must be non-negative, got " .. width, 2)
    end
    if height < 0 then
        error("Height must be non-negative, got " .. height, 2)
    end
end

-- Public API
function rectangle.calculate_area(width, height)
    validate_not_nil(width, height)
    validate_numeric(width, height)
    validate_non_negative(width, height)
    
    return width * height
end

-- Additional utility functions
function rectangle.calculate_perimeter(width, height)
    validate_not_nil(width, height)
    validate_numeric(width, height)
    validate_non_negative(width, height)
    
    return 2 * (width + height)
end

function rectangle.is_square(width, height)
    validate_not_nil(width, height)
    validate_numeric(width, height)
    validate_non_negative(width, height)
    
    return width == height
end

return rectangle