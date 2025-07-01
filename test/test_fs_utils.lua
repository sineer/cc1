-- test_fs_utils.lua - Unit tests for filesystem utilities module
local TestFramework = require("test_framework")
local test = TestFramework.new("FSUtils Tests")

-- Initialize test environment
local FSUtils = require("lib.fs_utils")

-- Mock filesystem operations
local mock_files = {}
local mock_dirs = {}
local original_io_open = io.open
local original_os_execute = os.execute
local original_lfs = lfs

-- Create mock lfs if it doesn't exist
if not lfs then
    lfs = {}
end

local mock_lfs = {
    attributes = function(path)
        if mock_files[path] then
            return {mode = "file", size = #mock_files[path]}
        elseif mock_dirs[path] then
            return {mode = "directory"}
        end
        return nil
    end,
    mkdir = function(path)
        mock_dirs[path] = true
        return true
    end,
    rmdir = function(path)
        mock_dirs[path] = nil
        return true
    end,
    dir = function(path)
        local items = {}
        -- Add mock directory contents
        if path == "/tmp/test" then
            items = {".", "..", "file1.txt", "file2.conf", "subdir"}
        end
        local i = 0
        return function()
            i = i + 1
            return items[i]
        end
    end
}

local function mock_io_open(filename, mode)
    if mode == "r" then
        if mock_files[filename] then
            local content = mock_files[filename]
            local pos = 0
            return {
                read = function(self, format)
                    if format == "*a" then
                        return content
                    elseif format == "*l" then
                        if pos >= #content then return nil end
                        local line_end = content:find("\n", pos + 1) or #content + 1
                        local line = content:sub(pos + 1, line_end - 1)
                        pos = line_end
                        return line
                    end
                end,
                close = function() return true end
            }
        end
        return nil, "File not found"
    elseif mode == "w" then
        return {
            write = function(self, data)
                mock_files[filename] = data
                return true
            end,
            close = function() return true end
        }
    end
end

-- Test file existence check
test:add("File exists", function()
    io.open = mock_io_open
    mock_files["/tmp/exists.txt"] = "content"
    
    local fs = FSUtils.new()
    test:assert_true(fs:exists("/tmp/exists.txt"), "Should detect existing file")
    test:assert_false(fs:exists("/tmp/nonexistent.txt"), "Should detect missing file")
    
    io.open = original_io_open
end)

-- Test directory existence with lfs
test:add("Directory exists", function()
    lfs = mock_lfs
    mock_dirs["/tmp/testdir"] = true
    
    local fs = FSUtils.new()
    test:assert_true(fs:is_directory("/tmp/testdir"), "Should detect directory")
    test:assert_false(fs:is_directory("/tmp/notadir"), "Should detect missing directory")
    
    -- Test file vs directory
    mock_files["/tmp/file.txt"] = "content"
    test:assert_false(fs:is_directory("/tmp/file.txt"), "File should not be directory")
    
    lfs = original_lfs
end)

-- Test file reading
test:add("Read file", function()
    io.open = mock_io_open
    mock_files["/tmp/test.conf"] = "line1\nline2\nline3"
    
    local fs = FSUtils.new()
    local content = fs:read_file("/tmp/test.conf")
    test:assert_equal(content, "line1\nline2\nline3", "Should read full content")
    
    -- Test missing file
    local content2, err = fs:read_file("/tmp/missing.conf")
    test:assert_nil(content2, "Should return nil for missing file")
    test:assert_string(err, "Should return error message")
    
    io.open = original_io_open
end)

-- Test file writing
test:add("Write file", function()
    io.open = mock_io_open
    mock_files = {}
    
    local fs = FSUtils.new()
    local success = fs:write_file("/tmp/output.txt", "Hello World")
    test:assert_true(success, "Write should succeed")
    test:assert_equal(mock_files["/tmp/output.txt"], "Hello World", "Content should be written")
    
    -- Test overwrite
    success = fs:write_file("/tmp/output.txt", "New content")
    test:assert_equal(mock_files["/tmp/output.txt"], "New content", "Should overwrite")
    
    io.open = original_io_open
end)

-- Test file copying
test:add("Copy file", function()
    io.open = mock_io_open
    mock_files["/tmp/source.txt"] = "Source content"
    
    local fs = FSUtils.new()
    local success = fs:copy_file("/tmp/source.txt", "/tmp/dest.txt")
    test:assert_true(success, "Copy should succeed")
    test:assert_equal(mock_files["/tmp/dest.txt"], "Source content", "Content should be copied")
    test:assert_equal(mock_files["/tmp/source.txt"], "Source content", "Source should remain")
    
    -- Test missing source
    success = fs:copy_file("/tmp/missing.txt", "/tmp/dest2.txt")
    test:assert_false(success, "Copy of missing file should fail")
    
    io.open = original_io_open
end)

-- Test file moving
test:add("Move file", function()
    io.open = mock_io_open
    os.execute = function(cmd)
        if cmd:match("^mv ") then
            local src, dst = cmd:match("mv ([^ ]+) ([^ ]+)")
            if mock_files[src] then
                mock_files[dst] = mock_files[src]
                mock_files[src] = nil
                return true
            end
        end
        return false
    end
    
    mock_files["/tmp/moveme.txt"] = "Move this"
    
    local fs = FSUtils.new()
    local success = fs:move_file("/tmp/moveme.txt", "/tmp/moved.txt")
    test:assert_true(success, "Move should succeed")
    test:assert_nil(mock_files["/tmp/moveme.txt"], "Source should be removed")
    test:assert_equal(mock_files["/tmp/moved.txt"], "Move this", "Content should be at destination")
    
    os.execute = original_os_execute
    io.open = original_io_open
end)

-- Test file deletion
test:add("Delete file", function()
    os.execute = function(cmd)
        if cmd:match("^rm %-f ") then
            local file = cmd:match("rm %-f ([^ ]+)")
            mock_files[file] = nil
            return true
        end
        return false
    end
    
    mock_files["/tmp/delete.txt"] = "Delete me"
    
    local fs = FSUtils.new()
    local success = fs:delete_file("/tmp/delete.txt")
    test:assert_true(success, "Delete should succeed")
    test:assert_nil(mock_files["/tmp/delete.txt"], "File should be removed")
    
    os.execute = original_os_execute
end)

-- Test directory creation
test:add("Create directory", function()
    os.execute = function(cmd)
        if cmd:match("^mkdir %-p ") then
            local dir = cmd:match("mkdir %-p ([^ ]+)")
            mock_dirs[dir] = true
            return true
        end
        return false
    end
    
    local fs = FSUtils.new()
    local success = fs:mkdir("/tmp/newdir/subdir")
    test:assert_true(success, "mkdir should succeed")
    test:assert_true(mock_dirs["/tmp/newdir/subdir"], "Directory should be created")
    
    os.execute = original_os_execute
end)

-- Test path joining
test:add("Path join", function()
    local fs = FSUtils.new()
    
    test:assert_equal(fs:join_path("/tmp", "file.txt"), "/tmp/file.txt", "Basic join")
    test:assert_equal(fs:join_path("/tmp/", "file.txt"), "/tmp/file.txt", "Handle trailing slash")
    test:assert_equal(fs:join_path("/tmp", "/file.txt"), "/tmp/file.txt", "Handle leading slash")
    test:assert_equal(fs:join_path("/tmp/", "/file.txt"), "/tmp/file.txt", "Handle both slashes")
    test:assert_equal(fs:join_path("", "file.txt"), "file.txt", "Empty base")
    test:assert_equal(fs:join_path("/tmp", ""), "/tmp/", "Empty file")
end)

-- Test basename extraction
test:add("Get basename", function()
    local fs = FSUtils.new()
    
    test:assert_equal(fs:basename("/tmp/dir/file.txt"), "file.txt", "Extract filename")
    test:assert_equal(fs:basename("/tmp/dir/"), "dir", "Handle directory")
    test:assert_equal(fs:basename("file.txt"), "file.txt", "No path")
    test:assert_equal(fs:basename("/"), "", "Root directory")
    test:assert_equal(fs:basename(""), "", "Empty string")
end)

-- Test dirname extraction
test:add("Get dirname", function()
    local fs = FSUtils.new()
    
    test:assert_equal(fs:dirname("/tmp/dir/file.txt"), "/tmp/dir", "Extract directory")
    test:assert_equal(fs:dirname("/tmp/file.txt"), "/tmp", "Single level")
    test:assert_equal(fs:dirname("file.txt"), ".", "No path")
    test:assert_equal(fs:dirname("/file.txt"), "/", "Root file")
    test:assert_equal(fs:dirname("/"), "/", "Root directory")
end)

-- Test file extension
test:add("Get file extension", function()
    local fs = FSUtils.new()
    
    test:assert_equal(fs:get_extension("file.txt"), "txt", "Simple extension")
    test:assert_equal(fs:get_extension("file.tar.gz"), "gz", "Multiple dots")
    test:assert_equal(fs:get_extension("file"), "", "No extension")
    test:assert_equal(fs:get_extension(".hidden"), "", "Hidden file")
    test:assert_equal(fs:get_extension("dir.ext/file"), "", "Directory with dot")
end)

-- Test temporary file creation
test:add("Create temp file", function()
    io.open = mock_io_open
    os.execute = function(cmd)
        if cmd:match("^mktemp") then
            return true
        end
        return false
    end
    
    -- Mock mktemp output
    local original_io_popen = io.popen
    io.popen = function(cmd)
        if cmd:match("mktemp") then
            return {
                read = function() return "/tmp/tmp.XXXXXX" end,
                close = function() return true end
            }
        end
    end
    
    local fs = FSUtils.new()
    local tmpfile = fs:create_temp_file("test")
    test:assert_string(tmpfile, "Should return temp filename")
    test:assert_match(tmpfile, "/tmp/", "Should be in tmp directory")
    
    io.popen = original_io_popen
    os.execute = original_os_execute
    io.open = original_io_open
end)

-- Test file size
test:add("Get file size", function()
    lfs = mock_lfs
    mock_files["/tmp/small.txt"] = "Hello"
    mock_files["/tmp/large.txt"] = string.rep("A", 1024)
    
    local fs = FSUtils.new()
    test:assert_equal(fs:get_size("/tmp/small.txt"), 5, "Should return correct size")
    test:assert_equal(fs:get_size("/tmp/large.txt"), 1024, "Should handle large file")
    test:assert_nil(fs:get_size("/tmp/missing.txt"), "Should return nil for missing")
    
    lfs = original_lfs
end)

-- Test directory listing
test:add("List directory", function()
    lfs = mock_lfs
    
    local fs = FSUtils.new()
    local files = fs:list_directory("/tmp/test")
    test:assert_table(files, "Should return file list")
    test:assert_equal(#files, 3, "Should have 3 entries (excluding . and ..)")
    
    -- Test with filter
    files = fs:list_directory("/tmp/test", "%.txt$")
    test:assert_equal(#files, 1, "Should filter to .txt files only")
    
    lfs = original_lfs
end)

-- Test safe path handling
test:add("Safe path handling", function()
    local fs = FSUtils.new()
    
    -- Test path traversal prevention
    test:assert_false(fs:is_safe_path("/tmp/../etc/passwd"), "Should reject path traversal")
    test:assert_false(fs:is_safe_path("/tmp/./../../etc"), "Should reject complex traversal")
    test:assert_true(fs:is_safe_path("/tmp/safe/file.txt"), "Should allow safe path")
    test:assert_true(fs:is_safe_path("/tmp/dir.with.dots/file"), "Should allow dots in names")
end)

-- Test atomic write
test:add("Atomic write", function()
    io.open = mock_io_open
    os.execute = function(cmd)
        if cmd:match("^mv ") then
            local src, dst = cmd:match("mv ([^ ]+) ([^ ]+)")
            if mock_files[src] then
                mock_files[dst] = mock_files[src]
                mock_files[src] = nil
            end
            return true
        end
        return false
    end
    
    local fs = FSUtils.new()
    local success = fs:write_file_atomic("/tmp/atomic.txt", "Atomic content")
    test:assert_true(success, "Atomic write should succeed")
    test:assert_equal(mock_files["/tmp/atomic.txt"], "Atomic content", "Content should be written")
    
    os.execute = original_os_execute
    io.open = original_io_open
end)

-- Test error handling
test:add("Error handling", function()
    local fs = FSUtils.new()
    
    -- Test nil parameters
    test:assert_false(fs:exists(nil), "Should handle nil path")
    test:assert_nil(fs:read_file(nil), "Should handle nil read")
    test:assert_false(fs:write_file(nil, "data"), "Should handle nil write path")
    test:assert_false(fs:write_file("/tmp/file", nil), "Should handle nil data")
    
    -- Test empty strings
    test:assert_false(fs:exists(""), "Should handle empty path")
    test:assert_equal(fs:basename(""), "", "Should handle empty basename")
    test:assert_equal(fs:dirname(""), ".", "Should handle empty dirname")
end)

-- Run all tests
test:run()