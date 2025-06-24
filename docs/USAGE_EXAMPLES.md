# UCI Config Usage Examples (v2.0.0)

This guide provides practical examples for common UCI configuration merge scenarios with the enhanced service restart functionality.

## Basic Usage

### 1. Simple Configuration Merge with Service Restart

Merge configurations from a directory into your system with automatic service restart:

```bash
uci-config merge /path/to/new/configs
```

This will:
- Load all configuration files from the specified directory
- Merge them with existing system configurations
- Automatically restart affected services (dnsmasq, firewall, network, etc.)
- Apply changes immediately

Output example:
```
INFO: Starting UCI configuration merge from: /path/to/new/configs
INFO: Applied 3 changes
SERVICE INFO: Restarting services in order: network, firewall, dnsmasq
SERVICE INFO: Service network restarted successfully
SERVICE INFO: Service firewall restarted successfully
SERVICE INFO: Service dnsmasq restarted successfully
INFO: Merge operation completed successfully
```

### 2. Preview Changes with Service Information (Dry Run)

Always test your merge before applying:

```bash
uci-config merge --dry-run --verbose /path/to/new/configs
```

Output example:
```
INFO: Starting UCI configuration merge from: /path/to/new/configs
INFO: DRY RUN MODE - No changes will be applied
INFO: Merge completed successfully
  firewall: merged successfully
    2 conflicts detected
  network: merged successfully
INFO: Total conflicts detected: 2
  Conflict in firewall.zone_guest.forward
    Existing: REJECT
    New: ACCEPT
INFO: Changes that would be made: 5
SERVICE INFO: Service restart disabled via --no-restart option
```

### 3. Create Backup Before Changes

Always backup before major changes:

```bash
# Create timestamped backup
uci-config backup

# Create named backup  
uci-config backup --name pre-uspot-deployment

# Create backup with cleanup of old backups
uci-config backup --cleanup
```

Output:
```
INFO: Creating backup: pre-uspot-deployment
INFO: Source directory size: 24K
INFO: Backup created successfully: /tmp/uci-config-backups/pre-uspot-deployment.tar.gz
INFO: Backup size: 0.02 MB
```

## Service Management Features

### 4. Merge Without Service Restart

When you want to apply config changes but restart services manually later:

```bash
uci-config merge --no-restart /path/to/configs
```

This is useful when:
- You're making multiple configuration changes
- You want to restart services at a specific time
- You're testing configurations in development

### 5. Service Restart with Rollback Protection

Enable automatic rollback if service restart fails:

```bash
uci-config merge --rollback-on-failure /path/to/configs
```

If any service fails to restart:
- All configuration changes are automatically rolled back
- Services are restored to their previous state
- Detailed error information is provided

Output on failure:
```
SERVICE ERROR: Service dnsmasq restart failed: configuration syntax error
SERVICE INFO: Rolling back 2 service operations
SERVICE INFO: Rollback start network
SERVICE INFO: Rollback start firewall
ERROR: Service restart failed
```

### 6. Configuration Validation with Service Checking

Validate configurations and check service availability:

```bash
uci-config validate --check-services --verbose
```

Output:
```
INFO: Validating 5 configuration file(s)
firewall: PASS
network: PASS
dhcp: PASS
uhttpd: PASS
uspot: PASS
INFO: Checking service availability...
firewall service (firewall): available (running)
network service (network): available (running)
dhcp service (dnsmasq): available (running)
uhttpd service (uhttpd): available (running)
uspot service (uspot): available (stopped)
INFO: All configurations passed validation
```

## Advanced Scenarios

### 7. Merge with List Deduplication and Service Restart

Remove duplicate entries while merging with automatic service restart:

```bash
uci-config merge --dedupe-lists /etc/uspot-configs
```

This is especially useful for:
- Firewall rules that may have been added multiple times
- Network interface lists  
- DHCP static leases

The system will automatically restart the appropriate services (firewall, dnsmasq, network) after deduplication.

### 8. Network-Safe Merging with Service Management

Ensure network connectivity isn't broken and services restart properly:

```bash
uci-config merge --preserve-network --rollback-on-failure --dry-run /path/to/configs
```

This validates:
- Critical network interfaces remain configured
- Management access is preserved
- No conflicting IP addresses
- Services can be restarted safely

### 9. Full Safety Merge with Service Restart

Combine all safety features:

```bash
# First, create a backup
uci-config backup --name before-merge

# Preview the merge with all safety features
uci-config merge --dry-run --verbose --preserve-network --dedupe-lists /path/to/configs

# If everything looks good, apply the merge with rollback protection
uci-config merge --preserve-network --dedupe-lists --rollback-on-failure /path/to/configs
```

### 10. Quick Merge with Default Safety Options

Use the config command for safe merging with default options:

```bash
# Equivalent to: merge --preserve-network --dedupe-lists --preserve-existing --rollback-on-failure
uci-config config --target default

# Preview mode
uci-config config --target default --dry-run --verbose
```

This automatically enables:
- Network safety preservation
- List deduplication  
- Existing value preservation on conflicts
- Service restart with rollback on failure

## Real-World Examples

### 11. Deploying uspot Captive Portal with Service Management

Complete workflow for deploying uspot configurations:

```bash
# 1. Validate current configuration and services
uci-config validate --check-services

# 2. Create safety backup
uci-config backup --name pre-uspot

# 3. Preview uspot configuration merge with service info
uci-config merge --dry-run --verbose --dedupe-lists /etc/uspot-configs

# 4. Apply the configuration with rollback protection
uci-config merge --dedupe-lists --rollback-on-failure /etc/uspot-configs

# 5. Validate the result including services
uci-config validate --check-services
```

Expected service restarts: network → firewall → dnsmasq → uhttpd → uspot

### 12. Merging Firewall Rules with Safe Service Restart

When adding new firewall zones and rules:

```bash
# Check what will change and which services will restart
uci-config merge --dry-run --verbose /tmp/new-firewall-rules

# Review output for conflicts and service restart order
# Expected: firewall service restart

# Apply with rollback protection
uci-config merge --rollback-on-failure --dedupe-lists /tmp/new-firewall-rules
```

### 13. Network Configuration Updates with Service Dependencies

Updating network interfaces safely with proper service restart ordering:

```bash
# Always use network preservation for network changes
uci-config merge --preserve-network --rollback-on-failure --dry-run /tmp/network-updates

# Check for IP conflicts and service restart order in the output
# Expected restart order: network → firewall → dnsmasq

# Apply with network safety and rollback
uci-config merge --preserve-network --rollback-on-failure /tmp/network-updates
```

### 14. Configuration Removal with Service Management

Remove configurations safely with service restart:

```bash
# Preview what will be removed and which services affected
uci-config remove --target old-config --dry-run --verbose

# Remove with rollback protection
uci-config remove --target old-config --rollback-on-failure

# Remove without service restarts (manual restart later)
uci-config remove --target old-config --no-restart
```

## Enhanced Validation Examples

### 15. Comprehensive Configuration Validation

Validate configurations with structure analysis:

```bash
# Basic syntax validation
uci-config validate

# Validate with service checking and structure info
uci-config validate --check-services --show-structure --verbose

# Validate specific configurations from directory
uci-config validate --source-dir ./etc/config/staging firewall network
```

Output with structure info:
```
firewall: PASS
  Structure: 8 sections, 24 options, 6 lists
network: PASS  
  Structure: 4 sections, 16 options, 2 lists
firewall service (firewall): available (running)
network service (network): available (running)
```

### 16. Configuration Analysis and Comparison

Analyze configuration structure before merging:

```bash
# Show structure information for source configs
uci-config validate --source-dir /path/to/new/configs --show-structure --verbose

# This helps understand what you're about to merge
```

## Troubleshooting Examples

### 17. Service Restart Failures

When service restart fails:

```bash
# If rollback is enabled, services are automatically restored
uci-config merge --rollback-on-failure /path/to/configs
```

Manual recovery if needed:
```bash
# Check service status
/etc/init.d/network status
/etc/init.d/firewall status

# Restart individual services
/etc/init.d/network restart
/etc/init.d/firewall restart

# Or restore from backup
cd /tmp/uci-config-backups
tar -xzf backup-20240115-143022.tar.gz -C /
```

### 18. Investigating Service Dependencies

Understanding which services will be affected:

```bash
# Use dry-run to see service restart plan
uci-config merge --dry-run --verbose /path/to/configs

# Look for service restart information in output:
# SERVICE INFO: Restarting services in order: network, firewall, dnsmasq
```

### 19. Validation After Service Changes

Always validate after making changes:

```bash
uci-config validate --check-services --verbose
```

If services are not running properly:
```bash
# Check specific service status
uci-config validate --check-services | grep "not available\|stopped"

# Investigate service logs
logread | grep -E "(firewall|network|dnsmasq)"
```

## Advanced Service Management

### 20. Staging Configuration Changes

For production environments, stage changes carefully:

```bash
# 1. Test configuration syntax
uci-config validate --source-dir /staging/configs

# 2. Preview merge with service impact
uci-config merge --dry-run --verbose /staging/configs

# 3. Apply during maintenance window with full protection
uci-config backup --name maintenance-$(date +%s)
uci-config merge --rollback-on-failure /staging/configs

# 4. Verify all services are healthy
uci-config validate --check-services
```

### 21. Batch Configuration Updates

For multiple configuration updates:

```bash
# Option 1: Individual merges without restart, then restart all at once
uci-config merge --no-restart /path/to/config1
uci-config merge --no-restart /path/to/config2
uci-config merge --no-restart /path/to/config3
# Then restart services manually or with final merge

# Option 2: Use config command for each with default safety
uci-config config --target config1
uci-config config --target config2  
uci-config config --target config3
```

## Tips and Best Practices

1. **Always backup first** - UCI changes can break router access
2. **Use dry-run** - Preview changes and service restart plan before applying
3. **Enable rollback protection** - Use --rollback-on-failure for production
4. **Monitor service health** - Use --check-services validation after changes
5. **Understand service dependencies** - Network → Firewall → DHCP → Application services
6. **Stage changes** - Test in development before production deployment
7. **Use config command** - Provides safe defaults for most scenarios
8. **Review service restart order** - Ensure critical services restart first

## Common Patterns

### Incremental Updates with Service Management
```bash
# For regular config updates with safe service restart
uci-config config --target monthly-updates --dry-run
# Review service restart plan, then apply
uci-config config --target monthly-updates
```

### Emergency Rollback with Service Recovery
```bash
# If something goes wrong and services fail
cd /tmp/uci-config-backups
tar -xzf backup-20240115-143022.tar.gz -C /

# Restart critical services
/etc/init.d/network restart
/etc/init.d/firewall restart
/etc/init.d/dnsmasq restart
```

### Automated Deployments with Service Management
```bash
#!/bin/bash
# Script for automated deployment with service management
set -e  # Exit on error

# Backup
uci-config backup --name "auto-$(date +%s)"

# Validate source configurations
uci-config validate --source-dir ./etc/config/default

# Apply with full safety and service management
uci-config config --target default

# Verify services are healthy
uci-config validate --check-services || {
    echo "Service validation failed, check system status"
    exit 1
}

echo "Deployment complete with services restarted successfully"
```

### Service-Aware Configuration Management
```bash
#!/bin/bash
# Monitor and manage services during configuration changes

echo "Pre-change service status:"
uci-config validate --check-services

echo "Applying configuration changes..."
uci-config merge --rollback-on-failure /path/to/configs

echo "Post-change service status:"  
uci-config validate --check-services

echo "Configuration deployment completed successfully"
```

The enhanced UCI config tool now provides comprehensive service management alongside configuration merging, making it safe and reliable for production OpenWRT deployments.