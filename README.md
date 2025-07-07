# UCI Configuration Tool for OpenWRT

A production-ready UCI configuration management tool for OpenWRT 23.05+ with intelligent merging, service management, MCP integration, and comprehensive safety features.

## Features

- **Unified MCP Interface** - Single command for all UCI operations through Model Context Protocol
- **Safe Configuration Merging** - Merge UCI configs with network connectivity preservation
- **Configuration Snapshots** - Capture and compare device configurations over time
- **Interactive Dashboards** - HTML visualization of configuration changes with statistics
- **Deployment Automation** - Demo workflows for ubispot captive portal and other deployments
- **Comprehensive Testing** - Docker-based test suite with authentic OpenWRT 23.05 environment
- **Production Ready** - Battle-tested with real-world OpenWRT deployments

## Quick Start

```bash
# Clone the repository
git clone https://github.com/sineer/uci-config-tool.git
cd uci-config-tool

# Run all tests (default command)
./bin/uci-mcp

# View available commands
./bin/uci-mcp help
```

## Primary Command: `./bin/uci-mcp`

All UCI operations are unified through a single command interface:

### Testing
```bash
./bin/uci-mcp                                    # Run all Docker tests
./bin/uci-mcp test docker test_uci_config.lua    # Run specific test
./bin/uci-mcp test 192.168.11.2 --password ""    # Test on remote device
```

### Configuration Management
```bash
./bin/uci-mcp snapshot qemu baseline              # Capture device configuration
./bin/uci-mcp compare qemu baseline after        # Compare two snapshots
./bin/uci-mcp dashboard "QEMU OpenWRT VM"         # Generate HTML dashboard
./bin/uci-mcp history qemu --days 14              # View configuration timeline
```

### Deployment Demos
```bash
./bin/uci-mcp demo ubispot                        # Deploy ubispot captive portal
./bin/uci-mcp demo cowboy                         # Configuration snapshot demo
```

## Available Tools

The unified MCP server provides 6 powerful tools:
- **test** - Run UCI config tests on Docker or remote targets
- **snapshot** - Capture complete device configuration via SSH
- **compare** - Generate intelligent before/after configuration diffs
- **dashboard** - Create interactive HTML dashboards with change analytics
- **demo** - Run complete deployment demo workflows
- **history** - Show device configuration timeline and snapshots

## Project Structure

```
├── bin/uci-mcp             # Unified command interface
├── mcp/                    # MCP server and client
│   ├── server-unified.js   # Unified MCP server
│   └── client.js          # MCP client implementation
├── lib/                    # Core Lua modules
│   ├── uci_merge_engine.lua
│   ├── service_manager.lua
│   ├── config_manager.lua
│   └── list_deduplicator.lua
├── test/                   # Test suite
└── docs/                   # Documentation
```

## Testing

The project uses Docker to provide an authentic OpenWRT 23.05 environment:

```bash
# Build and run all tests
./bin/uci-mcp

# Build Docker image only
./bin/uci-mcp build

# Run specific test
./bin/uci-mcp test docker test_merge_engine.lua
```

**Important:** Never run tests directly on the host system. Always use the Docker environment through `./bin/uci-mcp`.

## Dashboard Tool

Generate comprehensive HTML dashboards to visualize configuration changes:

```bash
./bin/uci-mcp dashboard "QEMU OpenWRT VM"         # Last 7 days
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30   # Last 30 days
```

Features:
- Timeline visualization of all configuration snapshots
- Package/section/option level change statistics
- Color-coded change indicators (added/removed/modified)
- Interactive diff viewing between any two snapshots

## Requirements

- OpenWRT 23.05+ (for deployment)
- Node.js 16+ (for MCP server)
- Docker (for testing)
- Lua 5.1+ with UCI library (on target devices)

## Documentation

- [CLAUDE.md](CLAUDE.md) - Claude Code specific configuration
- [API Reference](docs/API.md) - Module documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment procedures

## License

GPL-2.0 - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Run tests: `./bin/uci-mcp`
5. Ensure all tests pass
6. Submit a pull request

---

Built with Test-Driven Development for production reliability on OpenWRT 23.05+