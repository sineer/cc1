# Target Device Profiles

This directory contains JSON configuration profiles for different types of target devices that can be used with the UCI Configuration Test Runner.

## Available Profiles

- **`gl.json`** - GL-iNet routers with OpenWRT firmware
- **`openwrt.json`** - Generic OpenWRT devices
- **`default.json`** - Conservative defaults for unknown devices
- **`mikrotik.json`** - MikroTik RouterOS devices (limited support)

## Usage

```bash
# Use a predefined profile
./run-tests-target.sh gl

# Use direct IP (creates temporary profile)
./run-tests-target.sh 192.168.1.1

# Use custom profile
./run-tests-target.sh custom  # loads test/targets/custom.json
```

## Profile Structure

Each profile contains the following sections:

### Connection Settings
```json
{
  "connection": {
    "method": "ssh",
    "host": "192.168.1.1",
    "port": 22,
    "username": "root",
    "key_file": "~/.ssh/id_rsa",
    "timeout": 30
  }
}
```

### Safety Configuration
```json
{
  "safety": {
    "backup_location": "/tmp/uci-backup",
    "max_test_duration": 300,
    "connectivity_check_interval": 30,
    "auto_rollback_enabled": true,
    "preserve_network": true,
    "require_confirmation": true
  }
}
```

### Test Configuration
```json
{
  "test_config": {
    "allowed_tests": ["test_production_deployment.lua"],
    "skip_tests": [],
    "test_timeout": 600,
    "dry_run_first": true
  }
}
```

## Creating Custom Profiles

1. Copy an existing profile as a starting point:
   ```bash
   cp test/targets/openwrt.json test/targets/mydevice.json
   ```

2. Edit the connection settings for your device:
   - Update `host`, `username`, and authentication
   - Adjust timeouts if needed

3. Configure safety settings:
   - Set appropriate test duration limits
   - Configure network preservation settings
   - Set connectivity check intervals

4. Customize test configuration:
   - Specify which tests are allowed
   - Set test-specific timeouts
   - Configure dry-run behavior

5. Use your custom profile:
   ```bash
   ./run-tests-target.sh mydevice
   ```

## Security Considerations

### SSH Key Authentication
- Always use SSH key authentication (never passwords)
- Ensure private keys are properly secured
- Consider using dedicated test keys

### Network Safety
- Always test `preserve_network: true` setting
- Verify management interface preservation
- Test connectivity monitoring and rollback

### Device Access
- Ensure physical access for recovery
- Know your device's recovery procedures
- Have backup firmware/configuration ready

## Profile Validation

The test runner validates profiles before execution:
- Connection settings are tested
- Safety limits are enforced
- Required fields are checked
- Device compatibility is verified

## Examples

### Minimal Profile
```json
{
  "name": "Test Device",
  "connection": {
    "host": "192.168.1.1",
    "username": "root"
  },
  "safety": {
    "preserve_network": true,
    "require_confirmation": true
  }
}
```

### Advanced Profile
```json
{
  "name": "Production Test Device",
  "connection": {
    "host": "test.example.com",
    "port": 2222,
    "username": "admin",
    "key_file": "/path/to/test-key"
  },
  "safety": {
    "max_test_duration": 1800,
    "connectivity_check_interval": 15,
    "preserve_network": true
  },
  "test_config": {
    "allowed_tests": ["test_production_deployment.lua"],
    "test_timeout": 900
  }
}
```

## Troubleshooting

### Connection Issues
- Verify SSH connectivity manually
- Check key permissions and authentication
- Ensure target device is accessible

### Test Failures  
- Review device logs for errors
- Check network connectivity during tests
- Verify UCI tools are available on target

### Recovery
- Use device-specific recovery procedures
- Restore from backup if available
- Reset to factory defaults if necessary

## Contributing

When adding new device profiles:

1. Test thoroughly on non-production devices
2. Document device-specific quirks
3. Include recovery procedures
4. Validate safety settings
5. Submit with example usage

For more information, see the main project documentation.