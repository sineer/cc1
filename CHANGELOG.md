# Changelog

All notable changes to UCI Config Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-06-24

### Added
- Service management with automatic restart and rollback capabilities
- Configuration manager for centralized config operations
- Remove command to delete matching configurations
- Comprehensive MCP test runner support
- Production deployment documentation
- API reference documentation

### Changed
- Refactored code structure with proper module separation
- Improved error handling and logging throughout
- Enhanced test coverage with Docker-based testing
- Consolidated documentation structure
- Moved example configurations to dedicated directory

### Fixed
- Test suite compatibility with Lua 5.1
- Network preservation during configuration merges
- Service dependency resolution for proper restart ordering

### Removed
- Claude-Flow integration (not needed for core functionality)
- Memory management features (moved to separate project)
- Redundant documentation files

## [1.0.0] - 2025-06-23

### Initial Release
- UCI configuration merge functionality
- List deduplication with network awareness
- Dry-run mode for safe testing
- Basic backup and restore capabilities
- Docker-based test environment
- Support for uspot captive portal configurations