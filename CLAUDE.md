# Claude Code Configuration

## Primary Command: `./bin/uci-mcp`
**Unified interface for ALL UCI config operations!**

### Quick Start
```bash
# Testing (default command)
./bin/uci-mcp                                          # Run all tests
./bin/uci-mcp test docker test_uci_config.lua          # Specific test
./bin/uci-mcp test 192.168.11.2 --password ""          # Remote device testing

# Configuration Management
./bin/uci-mcp snapshot qemu baseline                   # Take device snapshot
./bin/uci-mcp compare qemu baseline after-changes      # Compare configurations  
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30    # Generate dashboard
./bin/uci-mcp history qemu --days 14                   # Show config timeline

# Deployment Demos  
./bin/uci-mcp demo ubispot --host 192.168.11.2         # Full ubispot deployment
./bin/uci-mcp demo cowboy                              # Cowboy configuration demo
```

### Alternative: Direct MCP Client (Advanced Users)
```bash
node mcp/client.js                                      # Direct MCP client access
```

## Available Tools
The unified MCP server provides **6 powerful tools**:
- `test` - Run UCI config tests on Docker or remote targets (default)
- `snapshot` - Capture complete device configuration via SSH
- `compare` - Generate intelligent before/after configuration diffs
- `dashboard` - Create interactive HTML dashboards with comprehensive change analytics
- `demo` - Run complete deployment demo workflows (ubispot, cowboy)
- `history` - Show device configuration timeline and snapshots

## Testing

### Docker Testing (Default)
```bash
./bin/uci-mcp                                           # All Docker tests
./bin/uci-mcp test docker test_uci_config.lua          # Specific test
./bin/uci-mcp build                                     # Build Docker image
./bin/uci-mcp build --force                             # Force rebuild
```

### Remote Device Testing
```bash
./bin/uci-mcp test 192.168.11.2 --password ""          # Empty password auth
./bin/uci-mcp test gl --dry-run --verbose              # Device profile testing
./bin/uci-mcp test openwrt --key-file ~/.ssh/id_rsa    # SSH key auth
```

## Dashboard Tool
The `dashboard` tool generates comprehensive HTML dashboards with:
- **Timeline Window Control**: `--days N` sets how many days back to include (default: 7)
- **Comprehensive Statistics**: Package/section/option change counts
- **Visual Change Analytics**: Color-coded statistics (added/removed/modified)
- **Interactive Navigation**: Click-to-compare functionality

```bash
./bin/uci-mcp dashboard "QEMU OpenWRT VM"              # Last 7 days (default)
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30    # Last month
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 90    # Last quarter
```

**Dashboard Output:**
- HTML file: `config-snapshots/dashboard/device-{DeviceName}.html`
- Diff files: `config-snapshots/dashboard/diffs/*.html`

## Demo Workflows

### ubispot Deployment Demo
```bash
./bin/uci-mcp demo ubispot                             # Default QEMU deployment
./bin/uci-mcp demo ubispot --no-deploy                 # Analysis mode only  
./bin/uci-mcp demo ubispot --target gl-mt3000 --host 192.168.1.100    # GL-iNet config
```

### Cowboy Demo (Configuration Snapshots)
```bash
./bin/uci-mcp demo cowboy                              # Create baseline snapshot
# ... make config changes ...
./bin/uci-mcp snapshot qemu after-changes              # Capture changes  
./bin/uci-mcp compare qemu baseline-cowboy-demo after-changes  # View diff
./bin/uci-mcp dashboard "QEMU OpenWRT VM"              # HTML visualization
```

## MCP Architecture
```
mcp/
├── server-unified.js    # Unified MCP server (400 lines)
├── client.js           # Simplified MCP client (custom JSON-RPC)
└── package.json        # Node.js dependencies
```

## 🚨 CRITICAL TESTING RULE 🚨
**NEVER EVER TEST ON THE HOST SYSTEM!**
```
🐳 Docker = ✅ Safe, isolated, authentic OpenWRT environment
🖥️  Host   = ❌ Dangerous, pollutes system, breaks things

ALWAYS use: ./bin/uci-mcp
NEVER use: lua, cd test && lua, manual execution on host
```

This project tests OpenWRT UCI config merging - running these tests on the host system could:
- Pollute your system configuration files
- Create conflicts with existing UCI configurations  
- Break your networking setup
- Cause unpredictable side effects

The Docker environment provides an authentic OpenWRT 23.05 sandbox that's:
- ✅ Isolated from your host system
- ✅ Pre-configured with proper UCI tools
- ✅ Designed for safe UCI config testing
- ✅ Easily reset between test runs

## Workflow Guidelines
- **Single unified interface** - All operations through `./bin/uci-mcp`
- Run tests before committing: `./bin/uci-mcp`
- Use meaningful commit messages
- Create feature branches for new functionality  
- Ensure all tests pass before merging

## Important Notes
- **Single command interface**: `./bin/uci-mcp` for everything
- **6 powerful tools in one**: test, snapshot, compare, dashboard, demo, history
- **Unified structured API**: JSON-RPC with type-safe parameters
- **Enhanced error handling**: Structured error codes and responses
- **Docker-first testing**: Safe, isolated environment for development
- **Node.js MCP implementation**: Better stability and performance