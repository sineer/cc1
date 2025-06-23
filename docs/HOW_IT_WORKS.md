# How UCI Config Merge Works

## Overview

The UCI Config Merge tool safely combines new UCI configurations with existing system configurations on OpenWRT routers. It's designed to handle the complexities of merging configuration files while preserving network connectivity and preventing conflicts.

## The Merge Process

### 1. Configuration Loading

The merge process begins by loading configurations from two sources:
- **Source**: New configuration files you want to merge (e.g., from `/path/to/new/configs`)
- **Target**: Existing system configuration (typically `/etc/config/`)

Each configuration file is parsed into a structured format that preserves:
- Sections (configuration blocks)
- Options (single-value settings)
- Lists (multi-value settings)

### 2. Section-by-Section Merging

For each configuration file, the tool processes sections individually:

```
Example: Merging firewall configuration

Existing:                    New:                         Result:
config zone                  config zone                  config zone
    option name 'lan'           option name 'lan'           option name 'lan'
    option input 'ACCEPT'       option input 'ACCEPT'       option input 'ACCEPT'
                                option forward 'ACCEPT'      option forward 'ACCEPT'  <- Added
```

**New sections** are added completely to the configuration.

**Existing sections** are updated by merging their options and lists.

### 3. Conflict Detection

When the same option exists with different values, a conflict is detected:

```
Conflict Example:
  File: network
  Section: lan
  Option: ipaddr
  Existing value: "192.168.1.1"
  New value: "192.168.2.1"
```

By default, existing values are preserved to maintain system stability. All conflicts are logged for review.

### 4. List Deduplication

UCI lists can accumulate duplicate entries over time. The merge tool provides three deduplication strategies:

#### PRESERVE_ORDER Strategy
Removes exact duplicates while maintaining the original order:
```
Input:  ["eth0", "eth1", "eth0", "eth2"]
Output: ["eth0", "eth1", "eth2"]
```

#### NETWORK_AWARE Strategy
Normalizes network values before comparison:
```
Input:  ["192.168.001.001", "192.168.1.1", "10.0.0.1"]
Output: ["192.168.1.1", "10.0.0.1"]  <- Recognized as duplicates
```

#### PRIORITY_BASED Strategy
Keeps the first occurrence (highest priority):
```
Input:  ["allow", "deny", "allow"]
Output: ["allow", "deny"]
```

The tool automatically selects the appropriate strategy based on the list type:
- Network-related lists use NETWORK_AWARE
- Protocol lists use PRIORITY_BASED
- Others use PRESERVE_ORDER

### 5. Saving Changes

After merging all sections, the tool either:
- **Dry-run mode**: Reports what would change without modifying files
- **Normal mode**: Writes the merged configuration back to the system

The save process:
1. Clears the existing configuration
2. Writes all sections with merged data
3. Commits changes atomically to UCI

## Safety Features

### Network Connectivity Preservation
When `--preserve-network` is enabled, the tool validates that critical network settings remain intact:
- LAN interface configurations
- Management IP addresses
- SSH access settings

### Dry-Run Mode
Test your merge without making changes:
```bash
uci-config merge --dry-run /path/to/configs
```

This shows:
- Which files would be modified
- What conflicts were detected
- How lists would be deduplicated

### Conflict Reporting
All conflicts are tracked and reported:
```
Total conflicts detected: 3
  Conflict in firewall.zone_lan.forward
    Existing: REJECT
    New: ACCEPT
```

## Example Merge Flow

1. **User runs merge command:**
   ```bash
   uci-config merge --dedupe-lists --preserve-network /etc/uspot-configs
   ```

2. **Tool loads configurations:**
   - Reads all files from `/etc/uspot-configs`
   - Loads corresponding system configs from `/etc/config`

3. **For each config file:**
   - Merges sections one by one
   - Applies list deduplication
   - Detects and logs conflicts

4. **Saves merged results:**
   - Writes updated configurations
   - Preserves existing values for conflicts
   - Commits all changes

5. **Reports summary:**
   ```
   Applied 12 changes
   Total conflicts detected: 2
   ```

## Technical Details

### UCI Format Handling
The tool preserves UCI's hierarchical structure:
- Package → Section → Option/List

### List Storage
UCI lists are stored as space-separated strings internally but presented as arrays for merging.

### Atomic Operations
All changes are committed atomically - either all succeed or none are applied.

### Error Handling
The tool validates each step and provides clear error messages if issues occur.