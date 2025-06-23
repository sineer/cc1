# UCI Config Usage Examples

This guide provides practical examples for common UCI configuration merge scenarios.

## Basic Usage

### 1. Simple Configuration Merge

Merge configurations from a directory into your system:

```bash
uci-config merge /path/to/new/configs
```

This will:
- Load all configuration files from the specified directory
- Merge them with existing system configurations
- Apply changes immediately

### 2. Preview Changes (Dry Run)

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
```

### 3. Create Backup Before Changes

Always backup before major changes:

```bash
# Create timestamped backup
uci-config backup

# Create named backup
uci-config backup --name pre-uspot-deployment
```

Output:
```
INFO: Creating backup: pre-uspot-deployment
INFO: Backup created successfully: /tmp/uci-config-backups/pre-uspot-deployment.tar.gz
```

## Advanced Scenarios

### 4. Merge with List Deduplication

Remove duplicate entries while merging:

```bash
uci-config merge --dedupe-lists /etc/uspot-configs
```

This is especially useful for:
- Firewall rules that may have been added multiple times
- Network interface lists
- DHCP static leases

### 5. Network-Safe Merging

Ensure network connectivity isn't broken:

```bash
uci-config merge --preserve-network --dry-run /path/to/configs
```

This validates:
- Critical network interfaces remain configured
- Management access is preserved
- No conflicting IP addresses

### 6. Full Safety Merge

Combine all safety features:

```bash
# First, create a backup
uci-config backup --name before-merge

# Preview the merge with all safety features
uci-config merge --dry-run --verbose --preserve-network --dedupe-lists /path/to/configs

# If everything looks good, apply the merge
uci-config merge --preserve-network --dedupe-lists /path/to/configs
```

## Real-World Examples

### 7. Deploying uspot Captive Portal

Complete workflow for deploying uspot configurations:

```bash
# 1. Validate current configuration
uci-config validate

# 2. Create safety backup
uci-config backup --name pre-uspot

# 3. Preview uspot configuration merge
uci-config merge --dry-run --verbose --dedupe-lists /etc/uspot-configs

# 4. Apply the configuration
uci-config merge --dedupe-lists /etc/uspot-configs

# 5. Validate the result
uci-config validate
```

### 8. Merging Firewall Rules

When adding new firewall zones and rules:

```bash
# Check what will change
uci-config merge --dry-run --verbose /tmp/new-firewall-rules

# Review output for conflicts, especially:
# - Zone forwards (ACCEPT vs REJECT)
# - Input/Output policies
# - Rule ordering

# Apply if satisfied
uci-config merge --dedupe-lists /tmp/new-firewall-rules
```

### 9. Network Configuration Updates

Updating network interfaces safely:

```bash
# Always use network preservation for network changes
uci-config merge --preserve-network --dry-run /tmp/network-updates

# Check for IP conflicts in the output
# Verify management interface isn't changed

# Apply with network safety
uci-config merge --preserve-network /tmp/network-updates
```

## Troubleshooting Examples

### 10. Investigating Conflicts

When conflicts are detected:

```bash
# Run with verbose to see all conflicts
uci-config merge --dry-run --verbose /path/to/configs
```

Review each conflict:
```
Conflict in network.lan.ipaddr
  Existing: 192.168.1.1
  New: 192.168.2.1
```

Decide whether to:
- Keep existing (default behavior)
- Manually edit the source config
- Apply and manually fix afterward

### 11. Validation After Merge

Always validate after making changes:

```bash
uci-config validate
```

If validation fails:
```
ERROR: Invalid UCI syntax in wireless: ...
```

You may need to:
- Restore from backup
- Manually fix the syntax error
- Re-run the merge

### 12. Quick Backup and Merge

One-liner for backup and merge:

```bash
uci-config backup --name "$(date +%Y%m%d-%H%M%S)" && \
uci-config merge --dedupe-lists /path/to/configs && \
uci-config validate
```

## Tips and Best Practices

1. **Always backup first** - UCI changes can break router access
2. **Use dry-run** - Preview changes before applying
3. **Enable verbose mode** - Understand what's changing
4. **Validate after merge** - Ensure configurations are valid
5. **Review conflicts** - Don't ignore conflict warnings
6. **Test connectivity** - Verify network access after changes

## Common Patterns

### Incremental Updates
```bash
# For regular config updates
uci-config merge --dedupe-lists --dry-run /etc/monthly-updates
# Review, then apply
uci-config merge --dedupe-lists /etc/monthly-updates
```

### Emergency Rollback
```bash
# If something goes wrong
cd /tmp/uci-config-backups
tar -xzf backup-20240115-143022.tar.gz -C /
```

### Automated Deployments
```bash
#!/bin/bash
# Script for automated deployment
set -e  # Exit on error

# Backup
uci-config backup --name "auto-$(date +%s)"

# Merge with all safety
uci-config merge --preserve-network --dedupe-lists /deploy/configs

# Validate
uci-config validate || {
    echo "Validation failed, check configuration"
    exit 1
}

echo "Deployment complete"
```