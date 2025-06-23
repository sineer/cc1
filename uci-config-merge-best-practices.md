# UCI Configuration Merge Best Practices for OpenWRT 23.05+

## Executive Summary

This document provides comprehensive best practices for merging UCI (Unified Configuration Interface) configurations in OpenWRT 23.05+. UCI is OpenWRT's centralized configuration management system that unifies all device configuration through a single interface.

## UCI Fundamentals and Architecture

### Core Architecture
UCI is OpenWRT's centralized configuration management system written in C, designed to unify all device configuration through a single interface.

**Core Components:**
- `uci`: Main command-line utility
- `libuci`: C library for programmatic access
- `libuci-lua`: Lua plugin for UCI
- Configuration files stored in `/etc/config/`

**Change Management:**
- Changes are staged in `/tmp/.uci`
- Configurations are written to flash only after `uci commit`
- Supports rollback capabilities

### Hierarchical Structure
UCI follows a three-tier hierarchy:
1. **Packages** - Configuration files (e.g., `network`, `wireless`, `firewall`)
2. **Sections** - Configuration blocks within packages
3. **Options/Lists** - Key-value pairs or multiple values

## UCI File Structure and Format

### Basic Syntax Structure
```
config '<type>' '<name>'
    option '<key>' '<value>'
    list '<key>' '<value1>'
    list '<key>' '<value2>'
```

### Configuration Examples
```
config system
    option hostname 'OpenWrt'
    option timezone 'UTC'
    option log_size '64'

config timeserver 'ntp'
    option enabled '1'
    list server '0.openwrt.pool.ntp.org'
    list server '1.openwrt.pool.ntp.org'
```

### Section Types
- **Named sections**: `config interface 'lan'`
- **Unnamed sections**: Referenced as `@type[index]` (e.g., `@rule[0]`)

## OpenWRT 23.05+ Enhancements

While specific UCI changes weren't prominently highlighted in the 23.05 release, the version includes:

- **Over 4300 commits** since the previous 22.03 release
- **Enhanced device support** for over 1790 devices
- **Improved configuration preservation** during sysupgrade
- **Ongoing UCI enhancements** including proposals for system.description and system.notes fields

## Best Practices for Merging UCI Configurations

### 1. Configuration Backup and Validation

**Always backup before making changes:**
```bash
# Backup current configuration
tar -czf config_backup.tar.gz /etc/config/

# Validate configuration
uci validate
```

### 2. Using UCI Batch Mode

For multiple changes, use batch mode to ensure atomicity:
```bash
uci -q batch << EOI
set network.lan.ipaddr='192.168.178.1'
set wireless.@wifi-device[0].disabled='0'
commit
EOI
```

### 3. Configuration Comparison

Compare configurations before merging:
```bash
# Compare configurations
uci diff dhcp
uci show > current_config.txt
```

## Tools and Methods for Handling UCI Config Merges

### UCI Extras
Install and use UCI extras for enhanced functionality:
```bash
opkg install diffutils
# Add UCI extras script to /etc/profile.d/uci.sh
uci validate [<confs>]
uci diff <oldconf> [<newconf>]
```

### Configuration Merge Tools
- **Manual comparison**: Use diff tools for detailed analysis
- **Scripted approach**: Loop through config files and compare defaults vs. current
- **Version control integration**: Use tools like `tkdiff` (2-way) or `meld` (3-way merge)

## Conflict Resolution Strategies

### 1. Handling -opkg Files
When package updates create conflicts:
- Review differences between current config and `-opkg` versions
- Manually decide whether to preserve customizations or accept updates
- Remove `-opkg` files after resolution

### 2. Managing List Duplications
The `uci -m import` option has a known limitation with list entries:
- Check for existing list values before adding new ones
- Clear lists before re-importing when appropriate
- Use scripts to prevent duplicate entries

### 3. Sysupgrade Conflict Resolution
```bash
# Preserve configurations during upgrade
sysupgrade -c /tmp/backup.tar.gz firmware.bin

# Handle uci-defaults conflicts
# Scripts in /etc/uci-defaults/ run after config restoration
```

## Common Pitfalls and How to Avoid Them

### 1. Configuration Order Issues
- **Problem**: UCI settings appear in random order, making file comparisons difficult
- **Solution**: Use `uci show` for consistent format instead of direct file comparison

### 2. Uncommitted Changes
- **Problem**: Changes remain in cache without being saved
- **Solution**: Always use `uci commit <package>` after making changes

### 3. Device-Specific Configurations
- **Problem**: Configuration backups may not work across different router models
- **Solution**: Separate device-specific from general settings; use conditional configurations

### 4. Section Index Changes
- **Problem**: Unnamed section indexes can change during upgrades
- **Solution**: Use named sections whenever possible; reference by name rather than index

## Advanced Configuration Management

### 1. Scripted Configuration
```bash
#!/bin/sh
# Configuration deployment script
uci set network.lan.proto='static'
uci set network.lan.ipaddr='192.168.1.1'
uci set network.lan.netmask='255.255.255.0'
uci commit network
/etc/init.d/network restart
```

### 2. Configuration Templates
Use configuration templates for consistent deployments:
```bash
# Template-based configuration
uci import network < network_template.conf
uci commit network
```

### 3. Programmatic Access
```lua
-- Lua API example
local uci = require("uci")
local cursor = uci.cursor()
cursor:set("network", "lan", "proto", "dhcp")
cursor:commit("network")
```

## Recommended Workflow for UCI Config Merging

### Pre-Merge Preparation
1. **Backup current configuration**
   ```bash
   tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz /etc/config/
   ```

2. **Validate existing configuration**
   ```bash
   uci validate
   ```

3. **Document current settings**
   ```bash
   uci show > current-config-$(date +%Y%m%d).txt
   ```

### Merge Process
1. **Compare configurations**
   - Use diff tools to identify differences
   - Prioritize critical vs. optional settings
   - Plan merge strategy

2. **Stage changes incrementally**
   ```bash
   uci set package.section.option='value'
   # Test each change before committing
   ```

3. **Validate and commit**
   ```bash
   uci validate package
   uci commit package
   ```

### Post-Merge Verification
1. **Test functionality**
   - Verify network connectivity
   - Check service functionality
   - Monitor system logs

2. **Create merge documentation**
   - Document changes made
   - Note any conflicts resolved
   - Update configuration templates

## Emergency Recovery Procedures

### Configuration Rollback
```bash
# Restore from backup
tar -xzf config_backup.tar.gz -C /

# Reset to defaults if needed
firstboot && reboot
```

### Selective Recovery
```bash
# Restore specific configuration file
cp /backup/config/network /etc/config/network
uci commit network
/etc/init.d/network restart
```

## Final Recommendations for OpenWRT 23.05+

1. **Always backup configurations** before making changes
2. **Use UCI validation tools** to check configuration integrity
3. **Prefer named sections** over unnamed ones for stability
4. **Test configuration changes** in non-production environments first
5. **Document custom configurations** for future reference
6. **Use version control** for configuration management in larger deployments
7. **Implement automated backup scripts** for critical configurations
8. **Monitor for `-opkg` files** after package updates and resolve conflicts promptly
9. **Use batch mode** for multiple related changes
10. **Validate configurations** before and after merging

## Conclusion

Effective UCI configuration merging in OpenWRT 23.05+ requires careful planning, proper tooling, and systematic approaches to conflict resolution. By following these best practices, administrators can ensure reliable configuration management while minimizing downtime and configuration conflicts.

---
*Document generated by SPARC research mode for OpenWRT 23.05+ UCI configuration management*