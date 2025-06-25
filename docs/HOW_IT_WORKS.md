# How UCI Config Tool Works (v2.0.0)

## Overview

The UCI Config Tool (v2.0.0) safely combines new UCI configurations with existing system configurations on OpenWRT routers while managing service restarts and providing comprehensive rollback protection. It features a modular architecture designed for reliability, safety, and extensibility.

## Architecture Overview

### Modular Design (v2.0.0)

The tool is built with a layered, modular architecture:

```
bin/uci-config (CLI Entry Point)
├── lib/commands/           # Command implementations
│   ├── merge_command.lua   # Configuration merging with service restart
│   ├── backup_command.lua  # Backup creation and management
│   ├── validate_command.lua # Configuration validation
│   └── remove_command.lua  # Configuration removal with service restart
├── lib/
│   ├── command_base.lua    # Common command functionality
│   ├── service_manager.lua # Service restart management
│   ├── config_manager.lua  # Configuration file management
│   ├── uci_merge_engine.lua # Core merge functionality
│   └── list_deduplicator.lua # List deduplication logic
```

### Key Components

1. **Command Layer**: Individual command modules (merge, backup, validate, remove)
2. **Service Management Layer**: Handles service restart with dependency resolution
3. **Configuration Management Layer**: File operations, validation, and metadata
4. **Core Engine Layer**: UCI merge logic and conflict resolution
5. **Utility Layer**: List deduplication and helper functions

## The Complete Process Flow

### 1. Command Initialization

When you run a command like:
```bash
uci-config merge --preserve-network --dedupe-lists /path/to/configs
```

The process begins:

1. **CLI Parsing**: Main CLI parses the command and loads the appropriate command module
2. **Command Setup**: Command module initializes with parsed options
3. **Environment Validation**: Checks UCI availability, permissions, and system state
4. **Service Manager Setup**: Initializes service restart management
5. **Configuration Manager Setup**: Prepares file operations and validation

### 2. Configuration Processing

#### Configuration Loading
The merge process begins by loading configurations from two sources:
- **Source**: New configuration files you want to merge (e.g., from `/path/to/new/configs`)
- **Target**: Existing system configuration (typically `/etc/config/`)

Each configuration file is parsed into a structured format that preserves:
- Sections (configuration blocks)
- Options (single-value settings)
- Lists (multi-value settings)

#### Configuration Validation
Before merging, the tool validates:
- **Syntax validation**: UCI format correctness
- **Structure validation**: Section types and required fields
- **Service availability**: Associated init.d services exist
- **Network safety**: Critical interfaces and settings preserved

### 3. Section-by-Section Merging

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

### 4. Conflict Detection and Resolution

When the same option exists with different values, a conflict is detected:

```
Conflict Example:
  File: network
  Section: lan
  Option: ipaddr
  Existing value: "192.168.1.1"
  New value: "192.168.2.1"
```

**Conflict Resolution Strategy**:
- By default, existing values are preserved to maintain system stability
- All conflicts are logged with detailed information
- Users can review conflicts in dry-run mode before applying

### 5. List Deduplication

UCI lists can accumulate duplicate entries over time. The merge tool provides three intelligent deduplication strategies:

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

**Automatic Strategy Selection**:
- Network-related lists use NETWORK_AWARE
- Protocol lists use PRIORITY_BASED
- Others use PRESERVE_ORDER

### 6. Configuration Saving

After merging all sections, the tool either:
- **Dry-run mode**: Reports what would change without modifying files
- **Normal mode**: Writes the merged configuration back to the system

The save process:
1. Creates backup of current configuration (unless dry-run)
2. Clears the existing configuration
3. Writes all sections with merged data
4. Commits changes atomically to UCI

## Service Management System (New in v2.0.0)

### Service-to-Configuration Mapping

The tool maintains a mapping of UCI configurations to their associated services:

```
Configuration → Service
network       → network
dhcp          → dnsmasq
firewall      → firewall
uhttpd        → uhttpd
uspot         → uspot
wireless      → network (wireless affects network service)
```

### Service Dependency Resolution

Services are restarted in dependency order to prevent conflicts:

```
Dependency Chain:
network (base) → firewall → dnsmasq → uhttpd → uspot

Example restart order for mixed config changes:
1. network   (base networking)
2. firewall  (depends on network)
3. dnsmasq   (depends on network)
4. uspot     (depends on network, firewall, dnsmasq)
```

### Service Restart Process

1. **Dependency Analysis**: Determine which services need restart based on changed configs
2. **Order Resolution**: Sort services by dependency chain
3. **Status Recording**: Record original service state for rollback
4. **Sequential Restart**: Restart each service in order
5. **Validation**: Verify each service started successfully
6. **Rollback**: If any service fails and rollback is enabled, restore all services

### Rollback Protection

When `--rollback-on-failure` is enabled (default):

1. **Pre-change State**: Record current service status
2. **Configuration Backup**: Create backup before changes
3. **Service Monitoring**: Monitor each service restart
4. **Failure Detection**: If any service fails to restart:
   - Stop further service restarts
   - Restore configuration from backup
   - Restore services to original state
   - Report detailed error information

Example rollback scenario:
```
SERVICE INFO: Restarting services in order: network, firewall, dnsmasq
SERVICE INFO: Service network restarted successfully
SERVICE INFO: Service firewall restarted successfully
SERVICE ERROR: Service dnsmasq restart failed: configuration syntax error
SERVICE INFO: Rolling back 2 service operations
SERVICE INFO: Rollback start network
SERVICE INFO: Rollback start firewall
ERROR: Service restart failed
```

## Safety Features

### Network Connectivity Preservation
When `--preserve-network` is enabled, the tool validates that critical network settings remain intact:
- LAN interface configurations
- Management IP addresses
- SSH access settings
- Gateway and DNS configurations

### Dry-Run Mode with Service Information
Test your merge without making changes:
```bash
uci-config merge --dry-run --verbose /path/to/configs
```

This shows:
- Which files would be modified
- What conflicts were detected
- How lists would be deduplicated
- Which services would be restarted
- Service restart order

### Enhanced Validation
The validation system now includes:

#### Syntax Validation
- UCI format correctness
- Section and option structure
- Required field presence

#### Semantic Validation
- Configuration-specific rules (network interfaces, firewall zones)
- Cross-reference validation
- Service dependency validation

#### Service Validation
- Service script availability (`/etc/init.d/<service>`)
- Service status checking
- Dependency requirement validation

### Backup Management
- Automatic backup creation before changes
- Named backup support
- Backup cleanup (keeps last 10 by default)
- Timestamped backup naming

## Command Examples and Flow

### Merge Command Flow

```bash
uci-config merge --preserve-network --dedupe-lists --rollback-on-failure /path/to/configs
```

**Complete Process**:
1. Parse command line options
2. Validate environment and permissions
3. Create pre-change backup
4. Load and validate source configurations
5. Load existing system configurations
6. Perform section-by-section merge with conflict detection
7. Apply list deduplication strategies
8. Save merged configurations to system
9. Determine affected services (network, firewall, dnsmasq)
10. Restart services in dependency order
11. Validate service restart success
12. Report completion or initiate rollback

### Config Command Flow (Simplified)

```bash
uci-config safe-merge --target default
```

**Equivalent to**:
```bash
uci-config merge --preserve-network --dedupe-lists --preserve-existing --rollback-on-failure ./etc/config/default
```

This provides safe defaults for most deployment scenarios.

### Validation Command Flow

```bash
uci-config validate --check-services --show-structure --verbose
```

**Process**:
1. Discover all configuration files
2. Validate UCI syntax for each file
3. Perform structure analysis (sections, options, lists)
4. Check configuration-specific rules
5. Verify associated service availability
6. Check service status
7. Report comprehensive results

### Remove Command Flow

```bash
uci-config remove --target old-config --rollback-on-failure
```

**Process**:
1. Load target configuration files
2. Create backup of system configuration
3. Identify matching sections in system configuration
4. Remove matching sections
5. Determine affected services
6. Restart services with rollback protection
7. Validate removal success

## Technical Implementation Details

### UCI Format Handling
The tool preserves UCI's hierarchical structure:
- Package → Section → Option/List
- Maintains UCI metadata (.type, .name)
- Handles both anonymous and named sections

### List Storage and Processing
- UCI lists are stored as space-separated strings internally
- Presented as arrays for processing and deduplication
- Converted back to UCI format on save

### Atomic Operations
- All configuration changes are committed atomically
- Service operations are tracked for rollback
- Either all changes succeed or none are applied

### Error Handling and Recovery
- Comprehensive error detection at each step
- Detailed error messages with context
- Automatic rollback on service failures
- Manual recovery guidance on failures

### Memory and Performance
- Efficient configuration loading and processing
- Minimal memory footprint
- Fast dependency resolution algorithms
- Optimized file operations

## Configuration-to-Service Examples

### Network Configuration Changes
When `network` config is modified:
1. Service affected: `network`
2. Dependent services: `firewall`, `dnsmasq` (may need restart)
3. Restart order: `network` → `firewall` → `dnsmasq`

### Firewall Configuration Changes
When `firewall` config is modified:
1. Service affected: `firewall`
2. Dependencies: Requires `network` to be running
3. Restart order: `firewall` only (network already running)

### DHCP Configuration Changes
When `dhcp` config is modified:
1. Service affected: `dnsmasq`
2. Dependencies: Requires `network` to be running
3. Restart order: `dnsmasq` only

### Multiple Configuration Changes
When `network`, `firewall`, and `dhcp` are all modified:
1. Services affected: `network`, `firewall`, `dnsmasq`
2. Optimal restart order: `network` → `firewall` → `dnsmasq`
3. Rollback: All three services if any fails

This ensures OpenWRT services are properly coordinated during configuration changes, maintaining system stability and network connectivity throughout the process.