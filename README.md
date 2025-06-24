# UCI Configuration Tool for OpenWRT

A production-ready UCI configuration management tool for OpenWRT 23.05+ with intelligent merging, service management, and safety features.

*Test modification for ediff emacs extension window testing*

> **Developer Joke**: Why do programmers prefer dark mode? Because light attracts bugs! 🐛💡

## Features

- **Safe Configuration Merging** - Merge UCI configs with network connectivity preservation
- **Intelligent List Deduplication** - Network-aware duplicate removal from configuration lists
- **Service Management** - Automatic service restart with dependency resolution and rollback
- **Comprehensive Testing** - Docker-based test suite with OpenWRT environment
- **Production Ready** - Battle-tested with uspot captive portal deployments

## Quick Start

```bash
# Install dependencies on OpenWRT
opkg update && opkg install lua luafilesystem libuci-lua

# Clone and setup
git clone https://github.com/your-org/uci-config-tool.git
cd uci-config-tool
chmod +x bin/uci-config

# Run tests
docker build -t uci-config-test . && docker run uci-config-test

# Deploy configurations
./bin/uci-config backup --name pre-deploy
./bin/uci-config merge --dry-run ./etc/config/default
./bin/uci-config merge --preserve-network --dedupe-lists ./etc/config/default
```

## Core Commands

### merge
Merge UCI configurations with service restart:
```bash
./bin/uci-config merge [options] <source-directory>
```

### config
Quick merge with default safety options:
```bash
./bin/uci-config config --target default
```

### backup
Create timestamped configuration backup:
```bash
./bin/uci-config backup --name <backup-name>
```

### validate
Validate UCI configuration syntax:
```bash
./bin/uci-config validate --check-services
```

### remove
Remove configurations matching target:
```bash
./bin/uci-config remove --target default --dry-run
```

## Options

- `--dry-run` - Preview changes without applying
- `--preserve-network` - Ensure network connectivity preservation
- `--dedupe-lists` - Remove duplicate list entries
- `--no-restart` - Skip automatic service restarts
- `--rollback-on-failure` - Rollback on service failures (default)
- `--verbose` - Show detailed operation logs

## Project Structure

```
├── bin/uci-config          # Main CLI tool
├── lib/                    # Core modules
│   ├── uci_merge_engine.lua
│   ├── service_manager.lua
│   ├── config_manager.lua
│   └── list_deduplicator.lua
├── test/                   # Test suite
├── examples/               # Example configurations
└── docs/                   # Documentation
    ├── API.md             # Technical reference
    └── DEPLOYMENT.md      # Production guide
```

## Testing

Run the complete test suite:
```bash
docker-compose build && docker-compose run --rm lua-test
```

Or use the MCP test runner:
```bash
python3 run-mcp-tests.py
```

## Documentation

- [API Reference](docs/API.md) - Module documentation and usage
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment procedures
- [Usage Examples](docs/USAGE_EXAMPLES.md) - Common use cases

## Requirements

- OpenWRT 23.05+
- Lua 5.1+ with UCI library
- Docker (for testing)

## License

GPL-2.0 - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

---

Built with Test-Driven Development for production reliability on OpenWRT 23.05+