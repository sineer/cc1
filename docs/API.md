# UCI Config Tool API Reference

## Core Modules

### UCIMergeEngine

The main engine for merging UCI configurations.

```lua
local UCIMergeEngine = require('uci_merge_engine')
local engine = UCIMergeEngine.new(options)
```

#### Options
- `dry_run` (boolean): Preview changes without applying
- `dedupe_lists` (boolean): Remove duplicate list entries  
- `preserve_network` (boolean): Protect network connectivity
- `preserve_existing` (boolean): Keep existing values on conflicts

#### Methods

**merge_directory(source_dir, target_dir)**
- Merges all UCI configs from source directory
- Returns: success (boolean), results (table)

**merge_file(source_file, target_config)**
- Merges single UCI configuration file
- Returns: success (boolean), changes (table)

### ServiceManager

Handles service restarts after configuration changes.

```lua
local ServiceManager = require('service_manager')
local manager = ServiceManager.new(options)
```

#### Options
- `dry_run` (boolean): Preview service actions
- `no_restart` (boolean): Skip service restarts
- `rollback_on_failure` (boolean): Rollback on failures

#### Methods

**restart_services_for_configs(config_names)**
- Restarts services affected by config changes
- Returns: success (boolean), results (table)

### ConfigManager

Configuration validation and management utilities.

```lua
local ConfigManager = require('config_manager')
local manager = ConfigManager.new(options)
```

#### Methods

**validate_config_files(config_names)**
- Validates UCI configuration syntax
- Returns: valid (boolean), errors (table)

**check_service_availability(service_name)**
- Checks if service exists on system
- Returns: available (boolean)

### ListDeduplicator

Intelligent list deduplication with network awareness.

```lua
local ListDeduplicator = require('list_deduplicator')
local dedup = ListDeduplicator.new()
```

#### Methods

**deduplicate(list, strategy)**
- Removes duplicates using specified strategy
- Strategies: "preserve_order", "network_aware", "priority_based"
- Returns: deduplicated list

## Command Pattern

All CLI commands extend CommandBase:

```lua
local CommandBase = require('command_base')
local MyCommand = setmetatable({}, {__index = CommandBase})
```

### Available Commands

- **MergeCommand**: Merge configurations with service restart
- **BackupCommand**: Create configuration backups
- **ValidateCommand**: Validate UCI configurations
- **RemoveCommand**: Remove matching configurations

## Error Handling

All modules return consistent error structures:

```lua
local success, result = module:operation()
if not success then
    -- result contains error details
    print("Error: " .. result.error)
    for _, detail in ipairs(result.details) do
        print("  - " .. detail)
    end
end
```

## Events and Callbacks

The merge engine supports progress callbacks:

```lua
engine:set_progress_callback(function(current, total, file)
    print(string.format("Processing %d/%d: %s", current, total, file))
end)
```