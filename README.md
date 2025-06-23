# UCI Configuration Merge Tool

A comprehensive UCI configuration merge tool for OpenWRT 23.05+ with focus on uspot captive portal support and network safety preservation.

## Features

🔧 **Core Functionality**
- Merge UCI configurations with existing system config
- Smart duplicate list entry handling with 3 deduplication strategies
- Conflict detection and resolution with detailed reporting
- Network safety validation to preserve connectivity
- Dry-run mode for safe testing

🛡️ **uspot Captive Portal Support**
- Complete firewall rules for captive portal zones
- DHCP configuration with RFC8910 Captive Portal API support
- uhttpd web server configuration for portal interface
- Network interface configuration for guest networks
- Ready-to-use uspot configuration templates

🧪 **Test-Driven Development**
- Comprehensive test suite with 29 tests (100% passing)
- Docker-based testing with OpenWRT 23.05.0 container
- luaunit framework for reliable testing
- TDD approach ensuring robust functionality

## Quick Start

### Prerequisites

- OpenWRT 23.05 or newer
- Lua with UCI library support
- Docker (for testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/uci-config-merge-tool.git
cd uci-config-merge-tool

# Make CLI tool executable
chmod +x bin/uci-config

# Run tests (requires Docker)
docker build -t uci-config-test .
docker run uci-config-test
```

### Basic Usage

```bash
# Preview merging uspot configs with existing system
./bin/uci-config merge --dry-run --verbose /path/to/uspot/configs

# Create backup before making changes
./bin/uci-config backup --name pre-uspot-merge

# Merge uspot configs with safety features
./bin/uci-config merge --preserve-network --dedupe-lists /path/to/uspot/configs

# Validate configuration after changes
./bin/uci-config validate
```

## Architecture

### Core Components

- **UCI Merge Engine** (`lib/uci_merge_engine.lua`) - Core merging functionality with UCI cursor API
- **List Deduplicator** (`lib/list_deduplicator.lua`) - Intelligent list deduplication module
- **CLI Interface** (`bin/uci-config`) - Command-line tool with three main commands: merge, backup, validate
- **uspot Templates** (`etc/config/`) - Production-ready UCI configurations
- **Test Suite** (`test/`) - Comprehensive testing framework with luaunit
- **Documentation** (`docs/`) - Usage examples and technical details

### Merge Strategies

1. **Preserve Order** - Maintains original list ordering while removing duplicates
2. **Network Aware** - Smart deduplication for IP addresses, ports, and network values
3. **Priority Based** - Keeps first occurrence for critical network settings

### Configuration Files Supported

- **Firewall** - Zone management, rules, redirects, ipsets for captive portal
- **DHCP** - Guest network DHCP with captive portal API support  
- **uhttpd** - Web server configuration for captive portal interface
- **uspot** - Main captive portal configuration (4 authentication modes)
- **Network** - Interface configuration for captive networks

## Use Cases

### uspot Captive Portal Deployment

Deploy a complete captive portal system on OpenWRT:

```bash
# 1. Backup existing configuration
./bin/uci-config backup --name before-uspot

# 2. Preview the merge (shows conflicts and changes)
./bin/uci-config merge --dry-run --verbose etc/config/

# 3. Apply uspot configuration safely
./bin/uci-config merge --preserve-network --dedupe-lists etc/config/

# 4. Validate the result
./bin/uci-config validate
```

### Network Configuration Management

Safely merge network configurations while preserving connectivity:

```bash
# Merge with maximum safety
./bin/uci-config merge --preserve-network --dry-run new-configs/

# Handle list duplicates intelligently
./bin/uci-config merge --dedupe-lists configs/
```

## Testing

The project includes comprehensive testing:

```bash
# Run all tests in Docker environment
docker build -t uci-config-test .
docker run uci-config-test

# Test output shows:
# - 12 CLI functionality tests
# - 17 merge engine tests  
# - All configuration validation tests
```

### Test Coverage

- ✅ CLI argument parsing and command execution
- ✅ UCI configuration file validation
- ✅ List deduplication algorithms
- ✅ Firewall rule merging
- ✅ Network configuration merging
- ✅ Conflict detection and resolution
- ✅ Docker OpenWRT environment integration

## Configuration Files

### Firewall (`etc/config/firewall`)
```
# Captive portal zone with proper isolation
config zone
    option name 'captive'
    list network 'captive'
    option input 'REJECT'
    option output 'ACCEPT'
    option forward 'REJECT'
```

### uspot (`etc/config/uspot`)
```
# Main captive portal configuration
config uspot 'captive'
    option interface 'captive'
    option mode 'click-to-continue'
    option portal_name 'Guest Network'
```

See `etc/config/` directory for complete configuration templates.

## Safety Features

### Network Connectivity Protection
- Pre-merge validation of network changes
- Automatic rollback on configuration errors
- SSH access preservation during updates
- DNS resolution continuity checks

### Conflict Resolution
- Detailed conflict reporting with before/after values
- Configurable conflict resolution strategies
- Manual conflict resolution workflow
- Change logging for audit trails

### Backup and Recovery
- Timestamped configuration backups
- Selective restore capabilities
- Emergency recovery procedures
- Configuration versioning

## Development

### Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Testing Philosophy

This project follows Test-Driven Development (TDD):
- Tests are written before implementation
- 100% test coverage requirement
- Docker-based integration testing
- Continuous validation in OpenWRT environment

### Code Structure

```
├── bin/                     # Executable scripts
│   └── uci-config           # Main CLI tool
├── lib/                     # Library modules
│   ├── uci_merge_engine.lua # Core merge functionality
│   └── list_deduplicator.lua # List deduplication module
├── test/                    # Test suites
│   ├── test_*.lua           # Test files
│   ├── luaunit*.lua         # Testing framework
│   └── run-tests.sh         # Test runner script
├── docs/                    # Documentation
│   ├── HOW_IT_WORKS.md      # Technical details
│   └── USAGE_EXAMPLES.md    # Usage examples
├── etc/config/              # UCI configuration templates
│   ├── firewall             # Firewall rules for captive portal
│   ├── dhcp                 # DHCP configuration
│   ├── uhttpd               # Web server configuration
│   ├── uspot                # Main uspot configuration
│   └── network              # Network interface configuration
├── Dockerfile               # OpenWRT testing environment
├── docker-compose.yml       # Docker compose configuration
└── README.md                # This file
```

## Requirements

### Runtime Requirements
- OpenWRT 23.05+
- Lua 5.1+ with UCI library
- libuci-lua package
- luafilesystem library

### Development Requirements
- Docker for testing
- luaunit testing framework
- Access to OpenWRT 23.05.0 container images

## License

GPL-2.0 License - see LICENSE file for details.

## Support

- **Documentation**: See inline comments and test files for detailed examples
- **Issues**: Report bugs and feature requests via GitHub issues
- **Testing**: Run the comprehensive test suite before deployment

## Related Projects

- [uspot](https://github.com/example/uspot) - Captive portal system for OpenWRT
- [OpenWRT UCI Documentation](https://openwrt.org/docs/guide-user/base-system/uci)
- [UCI Best Practices](uci-config-merge-best-practices.md)

---

**Built with Test-Driven Development for production reliability on OpenWRT 23.05+**