# UCI Config Remote Deployment Guide

## Overview

The `run-deploy.sh` script enables safe deployment of UCI configuration operations to remote OpenWRT devices. It provides a production-ready deployment system with comprehensive logging, safety features, and support for all UCI config commands.

## Features

🚀 **Production Ready**
- Automatic configuration backup before deployment
- SSH connection validation and error handling
- Comprehensive logging with timestamped files
- Safe cleanup on success or failure

🔒 **Safety First**
- Mandatory backup creation before any changes
- Confirmation prompts for non-dry-run operations
- Network connectivity preservation
- Rollback capability with detailed error reporting

📊 **Comprehensive Logging**
- Timestamped log files in `logs/` directory
- Complete command execution traces
- SSH operation logging
- Error capture and analysis

🎯 **Flexible Targeting**
- IP address targeting: `192.168.1.1`
- Device profile targeting: `gl`, `openwrt`, etc.
- Support for custom SSH keys and passwords

## Quick Start

### Basic Usage Pattern
```bash
./run-deploy.sh <target> <uci-command> [uci-args...] [--password ""] [--key-file path] [--verbose]
```

### Essential Examples

**Safe Merge with Dry-Run (Recommended Workflow)**
```bash
# 1. Test deployment first with dry-run
./run-deploy.sh 192.168.11.2 safe-merge --target default --dry-run --password ""

# 2. If dry-run looks good, execute actual deployment
./run-deploy.sh 192.168.11.2 safe-merge --target default --password ""
```

**Create Backup Before Major Changes**
```bash
./run-deploy.sh gl backup --name pre-upgrade --password ""
```

**Validate Remote Configuration**
```bash
./run-deploy.sh openwrt validate --check-services --verbose --key-file ~/.ssh/id_rsa
```

## Command Reference

### Supported UCI Commands

All `uci-config` commands are supported with full argument pass-through:

| Command | Description | Example |
|---------|-------------|---------|
| `safe-merge` | Safe merge with default safety options | `--target default --dry-run` |
| `merge` | Merge UCI configurations | `./etc/config/custom --preserve-network` |
| `backup` | Create configuration backup | `--name backup-name` |
| `validate` | Validate configurations | `--check-services` |
| `remove` | Remove configurations | `--target old-config --dry-run` |

### Deployment Options

| Option | Description | Example |
|--------|-------------|---------|
| `--password <pass>` | SSH password authentication | `--password ""` (empty password) |
| `--key-file <path>` | SSH key file authentication | `--key-file ~/.ssh/id_rsa` |
| `--verbose` | Enable detailed output | Shows all operations |
| `--force` | Skip confirmation prompts | For automated deployments |
| `--no-backup` | Skip automatic backup | **Not recommended for production** |

### Target Types

**IP Address Targeting**
```bash
./run-deploy.sh 192.168.1.1 <command> [args...] --password ""
./run-deploy.sh 10.0.0.1 <command> [args...] --key-file ~/.ssh/id_rsa
```

**Device Profile Targeting**
```bash
./run-deploy.sh gl <command> [args...] --password ""
./run-deploy.sh openwrt <command> [args...] --key-file ~/.ssh/id_rsa
```

Available profiles: `gl`, `openwrt`, `default`, `mikrotik` (see `test/targets/`)

## Production Deployment Workflows

### Workflow 1: Safe Merge Deployment
```bash
# Step 1: Create backup
./run-deploy.sh 192.168.1.1 backup --name pre-merge-$(date +%Y%m%d) --password ""

# Step 2: Test with dry-run
./run-deploy.sh 192.168.1.1 safe-merge --target production --dry-run --password ""

# Step 3: Review logs and output
cat logs/deploy-*.log

# Step 4: Deploy if dry-run successful
./run-deploy.sh 192.168.1.1 safe-merge --target production --password ""

# Step 5: Validate deployment
./run-deploy.sh 192.168.1.1 validate --check-services --password ""
```

### Workflow 2: Bulk Device Deployment
```bash
# Deploy to multiple devices
for device in 192.168.1.1 192.168.1.2 192.168.1.3; do
    echo "Deploying to $device..."
    ./run-deploy.sh $device safe-merge --target production --dry-run --password ""
    if [ $? -eq 0 ]; then
        ./run-deploy.sh $device safe-merge --target production --password ""
    fi
done
```

### Workflow 3: Configuration Validation
```bash
# Validate configurations across multiple devices
./run-deploy.sh gl validate --check-services --verbose --password ""
./run-deploy.sh openwrt validate --source-dir ./etc/config/staging --password ""
```

## Logging and Monitoring

### Log File Structure
```
logs/
├── deploy-20241226-143022-192.168.1.1.log    # IP address deployment
├── deploy-20241226-143156-gl.log             # Device profile deployment
└── deploy-20241226-144521-openwrt.log        # Another deployment
```

### Log File Contents
Each log file contains:
- **Deployment metadata**: timestamp, target, command, arguments
- **SSH operations**: connection tests, command execution, results
- **Framework upload**: archive creation, upload, extraction
- **UCI command output**: complete command output and error messages
- **Cleanup operations**: temporary file cleanup

### Log Analysis Examples
```bash
# Show recent deployments
ls -la logs/

# Check deployment status
grep "=== Deployment" logs/deploy-*.log

# Find deployment errors
grep "ERROR" logs/deploy-*.log

# Extract UCI command output
grep -A 50 "UCI_OUTPUT_START" logs/deploy-20241226-143022-192.168.1.1.log
```

## Safety and Security

### Automatic Safety Features

**Configuration Backup**
- Automatic UCI export before any changes
- Timestamped backup files on remote device
- Backup verification before proceeding

**SSH Security**
- Proper SSH option handling for OpenWRT
- Support for both password and key authentication
- Connection validation before deployment

**Error Handling**
- Comprehensive error detection and reporting
- Automatic cleanup on failure
- Detailed logging for troubleshooting

### Manual Safety Practices

**Always Use Dry-Run First**
```bash
# Test before deploying
./run-deploy.sh <target> <command> --dry-run [args...]
```

**Confirm Critical Deployments**
```bash
# Manual confirmation for important changes
./run-deploy.sh <target> <command> [args...]  # Prompts for confirmation
```

**Monitor Deployments**
```bash
# Use verbose logging for critical deployments
./run-deploy.sh <target> <command> --verbose [args...]
```

## Troubleshooting

### Common Issues

**SSH Connection Failures**
```bash
# Issue: Connection refused
# Solution: Check device IP, SSH service, firewall

# Issue: Authentication failed
# Solution: Verify password or key file path

# Issue: Permission denied
# Solution: Check SSH key permissions (600) or try password auth
```

**Upload Failures**
```bash
# Issue: Framework upload fails
# Solution: Check available space on device (/tmp)

# Issue: OpenWRT SCP not supported
# Solution: Script automatically uses tar over SSH (handled automatically)
```

**UCI Command Failures**
```bash
# Issue: Invalid UCI syntax
# Solution: Validate configuration files locally first

# Issue: Missing dependencies
# Solution: Ensure target configs match device capabilities
```

### Debug Mode
```bash
# Enable maximum verbosity
./run-deploy.sh <target> <command> --verbose [args...]

# Check detailed logs
tail -f logs/deploy-*.log
```

## Device Profile Configuration

### Creating Custom Device Profiles

Create JSON files in `test/targets/` directory:

```json
{
  "name": "My Router",
  "description": "Custom router configuration",
  "connection": {
    "host": "192.168.1.1",
    "port": 22,
    "username": "root"
  },
  "safety": {
    "require_confirmation": true,
    "preserve_network": true
  }
}
```

### Available Profiles

- **`gl`**: GL-iNet routers (192.168.8.1)
- **`openwrt`**: Generic OpenWRT devices
- **`default`**: Conservative defaults
- **`mikrotik`**: MikroTik RouterOS devices

## Advanced Usage

### Automated Deployments
```bash
# Disable confirmations for automation
./run-deploy.sh <target> <command> --force [args...]

# Skip backup for speed (not recommended)
./run-deploy.sh <target> <command> --no-backup [args...]
```

### Integration with CI/CD
```bash
#!/bin/bash
# Example deployment script for CI/CD

set -e

# Deploy to staging
./run-deploy.sh staging-router safe-merge --target staging --force --password "$STAGING_PASSWORD"

# Validate deployment
./run-deploy.sh staging-router validate --check-services --force --password "$STAGING_PASSWORD"

# Deploy to production if staging successful
./run-deploy.sh production-router safe-merge --target production --password "$PRODUCTION_PASSWORD"
```

## Comparison with Test Runner

| Feature | `run-tests.sh` | `run-deploy.sh` |
|---------|---------------|-----------------|
| **Purpose** | Testing UCI functionality | Production deployment |
| **Target Support** | Docker + Remote | Remote only |
| **Safety Features** | Test isolation | Production safety |
| **Logging** | Test results | Deployment audit trail |
| **Commands** | Test execution | UCI config operations |
| **Confirmation** | Not required | Required (unless --force) |

## Best Practices

### Development Phase
1. Use Docker testing with `run-tests.sh` for development
2. Test on staging devices with `run-deploy.sh --dry-run`
3. Validate configurations before deployment

### Production Deployment
1. Always create backups before changes
2. Use dry-run mode to preview changes
3. Deploy during maintenance windows
4. Monitor logs for issues
5. Validate deployments after completion

### Security
1. Use SSH keys instead of passwords when possible
2. Restrict SSH access to deployment hosts
3. Audit deployment logs regularly
4. Rotate SSH credentials periodically

---

## Summary

The `run-deploy.sh` script provides a robust, production-ready solution for deploying UCI configuration changes to remote OpenWRT devices. With comprehensive logging, safety features, and flexible targeting options, it enables safe and reliable configuration management at scale.

**Quick Reference:**
- **Help**: `./run-deploy.sh --help`
- **Test deployment**: `./run-deploy.sh <target> <command> --dry-run --password ""`
- **Production deployment**: `./run-deploy.sh <target> <command> --password ""`
- **Logs location**: `logs/deploy-TIMESTAMP-TARGET.log`