# Claude Code Configuration

## 🚨 CRITICAL: ALWAYS USE UCI-MCP UNIFIED COMMAND 🚨
**PRIMARY TOOL: `./bin/uci-mcp` - Simplified interface for ALL UCI operations!**

### Quick Start - New Unified Command
```bash
# Primary command (RECOMMENDED)
./bin/uci-mcp                                    # Run all tests
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30   # Generate dashboard  
./bin/uci-mcp demo ubispot                       # Run deployment demo
./bin/uci-mcp help                              # Show all commands

# Alternative (advanced users)
node mcp/client.js                              # Direct MCP client access
```

## 🚨 CRITICAL: ALWAYS USE MCP CLIENT FOR ALL OPERATIONS 🚨
**MANDATORY: Use MCP client for ALL UCI config operations, testing, and deployments!**
**NEVER run bash commands directly when MCP client is available!**

### Why MCP Client is REQUIRED:
- ✅ **Structured JSON-RPC API** - Clean programmatic interface for Claude Code
- ✅ **Type-safe parameters** - Better validation and error handling
- ✅ **Unified architecture** - Single tool for ALL operations
- ✅ **MCP ecosystem integration** - Works with Claude Code natively
- ✅ **Consistent output format** - Easier parsing and integration
- ✅ **Enhanced error handling** - Structured error codes and responses

### MCP Client Usage (ALWAYS USE THIS)
**🔧 UNIFIED MCP CLIENT - All UCI config operations through one interface!**

#### Primary Command: `./bin/uci-mcp` (Recommended)
**Simplified unified command interface for ALL UCI config operations:**
```bash
# Testing (default command)
./bin/uci-mcp                                         # All Docker tests
./bin/uci-mcp test docker test_uci_config.lua         # Specific Docker test
./bin/uci-mcp test 192.168.11.2 --password ""        # Remote device testing
./bin/uci-mcp test gl --dry-run --verbose             # Safe validation

# Configuration Management
./bin/uci-mcp snapshot qemu baseline                  # Take device snapshot
./bin/uci-mcp compare qemu baseline after-changes     # Compare configurations  
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 7    # Generate HTML dashboard (7 days)
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30   # Generate HTML dashboard (30 days)
./bin/uci-mcp history qemu --days 14                  # Show config timeline (14 days)

# Deployment Demos  
./bin/uci-mcp demo ubispot --host 192.168.11.2        # Full ubispot deployment demo
./bin/uci-mcp demo cowboy                             # Cowboy configuration demo
./bin/uci-mcp demo ubispot --target gl-mt3000         # GL-iNet specific config

# Legacy compatibility
./bin/uci-mcp build                                   # Build Docker image
./bin/uci-mcp build --force                           # Force rebuild
```

#### Alternative: Direct MCP Client (Advanced)
**Direct access to MCP client (when bin/uci-mcp is not suitable):**
```bash
# Testing (default tool)
node mcp/client.js                                         # All Docker tests
node mcp/client.js test docker test_uci_config.lua         # Specific Docker test
node mcp/client.js test 192.168.11.2 --password ""        # Remote device testing
node mcp/client.js test gl --dry-run --verbose             # Safe validation

# Configuration Management
node mcp/client.js snapshot qemu baseline                  # Take device snapshot
node mcp/client.js compare qemu baseline after-changes     # Compare configurations  
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 7    # Generate HTML dashboard (7 days)
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 30   # Generate HTML dashboard (30 days)
node mcp/client.js history qemu --days 14                  # Show config timeline (14 days)

# Deployment Demos  
node mcp/client.js demo ubispot --host 192.168.11.2        # Full ubispot deployment demo
node mcp/client.js demo cowboy --no-deploy                 # Cowboy analysis demo
node mcp/client.js demo ubispot --target gl-mt3000         # GL-iNet specific config
```

#### Available MCP Tools (Unified Server)
The unified MCP server provides **6 powerful tools**:
- `test` - Run UCI config tests on Docker or remote targets (default)
- `snapshot` - Capture complete device configuration via SSH
- `compare` - Generate intelligent before/after configuration diffs
- `dashboard` - Create interactive HTML dashboards with comprehensive change analytics
- `demo` - Run complete deployment demo workflows (ubispot, cowboy)
- `history` - Show device configuration timeline and snapshots

#### Dashboard Tool - Interactive Configuration Analytics
The `dashboard` tool generates comprehensive HTML dashboards with:
- **Timeline Window Control**: `--days N` sets how many days back to include (default: 7)
- **Comprehensive Statistics**: Package/section/option change counts across all snapshots
- **Visual Change Analytics**: Color-coded statistics (added/removed/modified)
- **Pre-generated Diffs**: Automatic diff file generation for all snapshot pairs
- **Interactive Navigation**: Click-to-compare functionality with working buttons
- **Real Change Detection**: Shows actual configuration changes, not "0 diff"

**Dashboard Examples:**
```bash
node mcp/client.js dashboard "QEMU OpenWRT VM"             # Last 7 days (default)
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 1    # Today only
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 30   # Last month
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 90   # Last quarter
```

**Dashboard Output:**
- HTML file: `config-snapshots/dashboard/device-{DeviceName}.html`
- Diff files: `config-snapshots/dashboard/diffs/*.html`
- Statistics: Package, section, and option-level change analytics
- Timeline: Interactive snapshot timeline with comparison tools

#### 🚨 ALWAYS USE MCP CLIENT FOR DEMOS AND DEPLOYMENTS 🚨
**NEVER run demo-orchestrator.js or bash scripts directly!**
**ALWAYS use: `node mcp/client.js demo ...`**

**ubispot Deployment Demo (ALWAYS via MCP):**
```bash
# Full ubispot captive portal deployment with orchestration tracking
node mcp/client.js demo ubispot                            # Default QEMU deployment
node mcp/client.js demo ubispot --no-deploy                # Analysis mode only  
node mcp/client.js demo ubispot --target gl-mt3000 --host 192.168.1.100    # GL-iNet config

# NEVER USE: ./qemu-ubispot-demo.sh or node demo-orchestrator.js
```

**Cowboy Demo (Configuration Snapshots - ALWAYS via MCP):**
```bash
# Configuration snapshot and analysis workflow
node mcp/client.js demo cowboy                             # Create baseline snapshot
# ... make config changes ...
node mcp/client.js snapshot qemu after-changes             # Capture changes  
node mcp/client.js compare qemu baseline-cowboy-demo after-changes  # View diff
node mcp/client.js dashboard "QEMU OpenWRT VM"             # HTML visualization

# NEVER USE: bash scripts or direct commands
```

#### Legacy Alternative (Fallback Only)
**🚨 Use ONLY when MCP client is unavailable:**
```bash
# Legacy bash scripts (fallback only)
./qemu-ubispot-demo.sh                                     # Bash ubispot demo
node demo-orchestrator.js                                  # Separate orchestrator client
./scripts/run-orchestrator.sh                              # Orchestrator server wrapper
```

**MCP Advantages:**
- ✅ **Structured JSON-RPC API** - Clean programmatic interface
- ✅ **Type-safe parameters** - Better validation and error handling  
- ✅ **Unified architecture** - Single tool for Docker and remote testing
- ✅ **MCP ecosystem integration** - Works with Claude Code natively
- ✅ **Consistent output format** - Easier parsing and integration
- ✅ **Enhanced error handling** - Structured error codes and responses

**Use bash scripts ONLY when:**
- MCP client is unavailable 
- Running from command line directly outside Claude Code
- Need specific bash script features not in MCP

#### Quick Reference
**Most Common Operations via UCI-MCP Command (Primary):**
```bash
# Testing (primary workflow)
./bin/uci-mcp                                         # Run all UCI tests
./bin/uci-mcp test docker test_uci_config.lua         # Specific test

# Device configuration management  
./bin/uci-mcp demo ubispot                            # ubispot deployment demo
./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30   # View config timeline (30 days)
./bin/uci-mcp snapshot qemu manual                    # Take snapshot
./bin/uci-mcp history qemu --days 14                  # Show config history (14 days)

# Deployment demos
./bin/uci-mcp demo ubispot --host 192.168.11.2        # Remote ubispot demo
./bin/uci-mcp demo cowboy                             # Cowboy snapshot demo

# Help and legacy
./bin/uci-mcp help                                    # Show all commands
./bin/uci-mcp build                                   # Build Docker image
```

**Alternative - Direct MCP Client (Advanced):**
```bash
# Testing (primary workflow)
node mcp/client.js                                         # Run all UCI tests
node mcp/client.js test docker test_uci_config.lua         # Specific test

# Device configuration management  
node mcp/client.js demo ubispot                            # ubispot deployment demo
node mcp/client.js dashboard "QEMU OpenWRT VM" --days 30   # View config timeline (30 days)
node mcp/client.js snapshot qemu manual                    # Take snapshot
node mcp/client.js history qemu --days 14                  # Show config history (14 days)

# Deployment demos
node mcp/client.js demo ubispot --host 192.168.11.2        # Remote ubispot demo
node mcp/client.js demo cowboy                             # Cowboy snapshot demo
```

## 🚨 ALWAYS USE MCP CLIENT FOR TESTING 🚨
**Primary Method (ALWAYS USE THIS):**
```bash
node mcp/client.js                                    # Run all Docker tests
node mcp/client.js test docker test_uci_config.lua    # Specific test
node mcp/client.js test 192.168.11.2 --password ""    # Remote device testing
```

## Legacy Test Commands (ONLY if MCP unavailable)
- `./scripts/run-tests.sh`: **Unified test runner** - Docker and remote testing with intelligent routing
- `./scripts/run-tests.sh <target> <test>`: Run specific test on target (docker, IP, or profile)
- `./scripts/run-tests.sh --password ""`: Remote device testing with empty password
- `./scripts/run-tests.sh --key-file <path>`: Remote device testing with SSH key
- `./scripts/run-tests.sh --dry-run --verbose`: Verbose dry run testing
- `./scripts/run-tests.sh build`: Build Docker test image
- `./scripts/run-tests.sh build --force`: Force rebuild Docker image
- `./scripts/run-tests-direct.sh`: **Direct Docker runner** - Fast Docker execution (no MCP)

## Testing Options

### Unified Test Runner (Primary)
`./scripts/run-tests.sh` - Universal test runner with intelligent routing:
- ✅ **UNIFIED ARCHITECTURE** - Single interface for Docker and remote testing
- ✅ **84% CODE REDUCTION** - Simplified from 2,468 to 400 lines  
- ✅ Smart target detection (docker, IP address, or profile name)
- ✅ Custom JSON-RPC client (bypasses MCP SDK parsing bug)
- ✅ Docker testing in authentic OpenWRT 23.05 environment
- ✅ Remote device testing with SSH (password/key auth)
- ✅ Comprehensive safety measures (backup/restore)
- ✅ Detailed test results and error handling
- ✅ Current status: 15/17 tests passing

### Direct Test Runner (Alternative)
`./scripts/run-tests-direct.sh` - Direct Docker-based testing:
- ✅ Direct Docker execution (no MCP overhead)
- ✅ Runs tests in authentic OpenWRT 23.05 Docker environment  
- ✅ Handles service restart testing safely
- ✅ Provides detailed test results
- ✅ Supports running individual test files
- ✅ Current status: 15/17 tests passing

### Unified MCP Structure
```
mcp/
├── server-unified.js    # Unified MCP server (400 lines)
├── client.js           # Simplified MCP client (custom JSON-RPC)
├── server/             # Legacy MCP server (for fallback)
├── client/             # Legacy MCP client (for fallback)
└── package.json        # Node.js dependencies
```

### Legacy Target Device Test Runner
`./scripts/run-tests-target.sh` - Standalone target device testing (now integrated):
- ⚠️ **SUPERSEDED** - Functionality now integrated into unified runner
- ✅ Available as fallback when using `--legacy` flag
- ✅ SSH-based remote test execution with comprehensive safety measures
- ✅ Automatic configuration backup before testing
- ✅ Device profile system for different router types
- ✅ Dry-run mode for safe validation
- ✅ Supports test_production_deployment.lua and custom tests
- 📌 **Use unified runner instead**: `./scripts/run-tests.sh <target> --password ""`

### Target Device Structure
```
scripts/run-tests-target.sh  # Shell script entry point
mcp/
├── server/
│   ├── target-runner.js     # Target device test orchestration
│   └── safety/              # Safety utilities
│       ├── ssh-connection.js    # SSH connection management
│       ├── network-monitor.js   # Network monitoring
│       └── backup-manager.js    # Configuration backup/restore
├── client/
│   └── run-tests-target.js  # MCP client for target testing
test/targets/
├── gl.json                 # GL-iNet router profile
├── openwrt.json            # Generic OpenWRT device profile
├── default.json            # Conservative defaults
└── README.md               # Target profile documentation
```

**Testing options in order of preference:**
1. `node mcp/client.js` - **MCP client (PREFERRED)** - Structured API interface
2. `./scripts/run-tests.sh` - Bash unified runner (fallback)
3. `./scripts/run-tests-direct.sh` - Direct Docker execution (alternative)

## MCP Client Examples (PREFERRED)

### Docker Testing with MCP Client
```bash
node mcp/client.js --target docker --test all              # All Docker tests (PREFERRED)
node mcp/client.js --target docker --test test_uci_config.lua  # Specific test
node mcp/client.js --dry-run --verbose                     # Safe validation
node mcp/client.js --rebuild                               # Force rebuild Docker image
```

### Bash Fallback Examples (when MCP unavailable)
```bash
./scripts/run-tests.sh                                   # All Docker tests
./scripts/run-tests.sh docker test_uci_config.lua        # Specific Docker test
./scripts/run-tests.sh --rebuild                         # Force rebuild Docker image
./scripts/run-tests.sh --dry-run --verbose               # Verbose dry run
```

### Remote Device Testing with MCP Client (PREFERRED)
```bash
node mcp/client.js --target 192.168.11.2 --password ""          # Empty password auth
node mcp/client.js --target gl --test test_production_deployment.lua  # GL router profile
node mcp/client.js --target openwrt --key-file ~/.ssh/id_rsa     # SSH key auth
node mcp/client.js --target 10.0.0.1 --dry-run                  # Safe validation
```

### Remote Device Testing - Bash Fallback
```bash
./scripts/run-tests.sh 192.168.11.2 --password ""        # Empty password auth
./scripts/run-tests.sh gl test_production_deployment.lua # GL router profile
./scripts/run-tests.sh openwrt --key-file ~/.ssh/id_rsa  # SSH key auth
./scripts/run-tests.sh 10.0.0.1 --dry-run                # Safe validation
```

### Legacy Commands
```bash
./scripts/run-tests.sh build                             # Build Docker image
./scripts/run-tests.sh build --force                     # Force rebuild
./scripts/run-tests.sh --legacy                          # Use legacy implementation
```

## 🚨 CRITICAL TESTING RULE 🚨
**NEVER EVER TEST ON THE HOST SYSTEM!**
```
🐳 Docker = ✅ Safe, isolated, authentic OpenWRT environment
🖥️  Host   = ❌ Dangerous, pollutes system, breaks things

ALWAYS use: ./scripts/run-tests.sh or ./scripts/run-tests-direct.sh
NEVER use: lua, cd test && lua, manual execution on host
```
**Remember: "When in doubt, Docker it out!" 🐳**

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

## Test Runner Decision Matrix

### 🚨 ALWAYS USE MCP CLIENT FIRST 🚨
**MANDATORY CHOICE**: `node mcp/client.js` for ALL testing operations

### When to Use Docker Testing (via MCP Client)
**PRIMARY CHOICE** for development, testing, and validation:

✅ **ALWAYS use Docker when:**
- Developing or debugging UCI merge engine functionality
- Running unit tests for UCI config logic
- Testing new features or bug fixes
- Validating test framework changes
- Code review and CI/CD pipeline testing
- Performance testing and benchmarking
- Testing with sample/mock configurations
- Learning how UCI configs work
- User asks to "run tests" without specifying target device

✅ **Examples:**
- "Run the tests to make sure everything works"
- "Test the new merge functionality"
- "Check if the UCI config changes are working"
- "Run tests after making code changes"
- "Validate the test refactoring"

### When to Use Target Device Testing (`./scripts/run-tests-target.sh`)
**PRODUCTION CHOICE** for real-world validation:

🎯 **ONLY use Target Device when:**
- Explicitly requested to test on actual hardware
- User mentions specific device (GL router, OpenWRT device, IP address)
- Testing production deployment scenarios
- Validating real device compatibility
- User asks for "production testing" or "real device testing"
- Final validation before production deployment
- Testing with actual device constraints (memory, storage, etc.)

🎯 **Examples:**
- "Test this on my GL router"
- "Run production tests on the actual device"
- "Test on the OpenWRT router at 192.168.1.1"
- "Validate this works on real hardware"
- "Run test_production_deployment.lua on the target"

### ⚠️ SAFETY REQUIREMENTS for Target Device Testing
Target device testing requires additional safety measures:

🔐 **Prerequisites:**
- SSH access to target device
- Physical access for recovery if needed
- Device not in production use
- Network backup/alternative access available
- User understands risks and provides explicit consent

🛡️ **Built-in Safety Features:**
- Automatic configuration backup before testing
- Network connectivity monitoring
- Automatic rollback on failure
- Dry-run mode for validation
- Device profile validation
- Connection testing before execution

### Command Examples

**Docker Testing (Default Choice):**
```bash
# Standard development testing
./scripts/run-tests.sh

# Test specific file
./scripts/run-tests.sh test test_merge_engine.lua

# Rebuild and test
./scripts/run-tests.sh build --force
```

**Target Device Testing (When Explicitly Requested):**
```bash
# Test on GL router
./scripts/run-tests-target.sh gl

# Test specific device with verbose output
./scripts/run-tests-target.sh 192.168.1.1 test_production_deployment.lua --verbose

# Validate device without running tests
./scripts/run-tests-target.sh openwrt --validate

# List available device profiles
./scripts/run-tests-target.sh --list

# Dry run to see what would be executed
./scripts/run-tests-target.sh gl --dry-run
```

### Decision Flow for Claude

1. **Default**: Use `./scripts/run-tests.sh` (Docker) unless specifically asked otherwise
2. **Check for keywords**: Look for device names, IP addresses, "production", "real device", "hardware"
3. **Confirm safety**: For target testing, ensure user understands risks and has recovery options
4. **Start conservative**: When in doubt, use Docker testing first

**Remember: Docker is safe and always appropriate, Target devices require explicit intent and safety measures!**


## Claude-Flow Complete Command Reference

### Core System Commands
- `./claude-flow start [--ui] [--port 3000] [--host localhost]`: Start orchestration system with optional web UI
- `./claude-flow status`: Show comprehensive system status
- `./claude-flow monitor`: Real-time system monitoring dashboard
- `./claude-flow config <subcommand>`: Configuration management (show, get, set, init, validate)

### Agent Management
- `./claude-flow agent spawn <type> [--name <name>]`: Create AI agents (researcher, coder, analyst, etc.)
- `./claude-flow agent list`: List all active agents
- `./claude-flow spawn <type>`: Quick agent spawning (alias for agent spawn)

### Task Orchestration
- `./claude-flow task create <type> [description]`: Create and manage tasks
- `./claude-flow task list`: View active task queue
- `./claude-flow workflow <file>`: Execute workflow automation files

### Memory Management
- `./claude-flow memory store <key> <data>`: Store persistent data across sessions
- `./claude-flow memory get <key>`: Retrieve stored information
- `./claude-flow memory list`: List all memory keys
- `./claude-flow memory export <file>`: Export memory to file
- `./claude-flow memory import <file>`: Import memory from file
- `./claude-flow memory stats`: Memory usage statistics
- `./claude-flow memory cleanup`: Clean unused memory entries

### SPARC Development Modes
- `./claude-flow sparc "<task>"`: Run orchestrator mode (default)
- `./claude-flow sparc run <mode> "<task>"`: Run specific SPARC mode
- `./claude-flow sparc tdd "<feature>"`: Test-driven development mode
- `./claude-flow sparc modes`: List all 17 available SPARC modes

Available SPARC modes: orchestrator, coder, researcher, tdd, architect, reviewer, debugger, tester, analyzer, optimizer, documenter, designer, innovator, swarm-coordinator, memory-manager, batch-executor, workflow-manager

### Swarm Coordination
- `./claude-flow swarm "<objective>" [options]`: Multi-agent swarm coordination
- `--strategy`: research, development, analysis, testing, optimization, maintenance
- `--mode`: centralized, distributed, hierarchical, mesh, hybrid
- `--max-agents <n>`: Maximum number of agents (default: 5)
- `--parallel`: Enable parallel execution
- `--monitor`: Real-time monitoring
- `--output <format>`: json, sqlite, csv, html

### MCP Server Integration
- `./claude-flow mcp start [--port 3000] [--host localhost]`: Start MCP server
- `./claude-flow mcp status`: Show MCP server status
- `./claude-flow mcp tools`: List available MCP tools

### Claude Integration
- `./claude-flow claude auth`: Authenticate with Claude API
- `./claude-flow claude models`: List available Claude models
- `./claude-flow claude chat`: Interactive chat mode

### Session Management
- `./claude-flow session`: Manage terminal sessions
- `./claude-flow repl`: Start interactive REPL mode

### Enterprise Features
- `./claude-flow project <subcommand>`: Project management (Enterprise)
- `./claude-flow deploy <subcommand>`: Deployment operations (Enterprise)
- `./claude-flow cloud <subcommand>`: Cloud infrastructure management (Enterprise)
- `./claude-flow security <subcommand>`: Security and compliance tools (Enterprise)
- `./claude-flow analytics <subcommand>`: Analytics and insights (Enterprise)

### Project Initialization
- `./claude-flow init`: Initialize Claude-Flow project
- `./claude-flow init --sparc`: Initialize with full SPARC development environment

## Quick Start Workflows

### Research Workflow
```bash
# Start a research swarm with distributed coordination
./claude-flow swarm "Research modern web frameworks" --strategy research --mode distributed --parallel --monitor

# Or use SPARC researcher mode for focused research
./claude-flow sparc run researcher "Analyze React vs Vue vs Angular performance characteristics"

# Store findings in memory for later use
./claude-flow memory store "research_findings" "Key insights from framework analysis"
```

### Development Workflow
```bash
# Start orchestration system with web UI
./claude-flow start --ui --port 3000

# Run TDD workflow for new feature
./claude-flow sparc tdd "User authentication system with JWT tokens"

# Development swarm for complex projects
./claude-flow swarm "Build e-commerce API with payment integration" --strategy development --mode hierarchical --max-agents 8 --monitor

# Check system status
./claude-flow status
```

### Analysis Workflow
```bash
# Analyze codebase performance
./claude-flow sparc run analyzer "Identify performance bottlenecks in current codebase"

# Data analysis swarm
./claude-flow swarm "Analyze user behavior patterns from logs" --strategy analysis --mode mesh --parallel --output sqlite

# Store analysis results
./claude-flow memory store "performance_analysis" "Bottlenecks identified in database queries"
```

### Maintenance Workflow
```bash
# System maintenance with safety controls
./claude-flow swarm "Update dependencies and security patches" --strategy maintenance --mode centralized --monitor

# Security review
./claude-flow sparc run reviewer "Security audit of authentication system"

# Export maintenance logs
./claude-flow memory export maintenance_log.json
```

## Integration Patterns

### Memory-Driven Coordination
Use Memory to coordinate information across multiple SPARC modes and swarm operations:

```bash
# Store architecture decisions
./claude-flow memory store "system_architecture" "Microservices with API Gateway pattern"

# All subsequent operations can reference this decision
./claude-flow sparc run coder "Implement user service based on system_architecture in memory"
./claude-flow sparc run tester "Create integration tests for microservices architecture"
```

### Multi-Stage Development
Coordinate complex development through staged execution:

```bash
# Stage 1: Research and planning
./claude-flow sparc run researcher "Research authentication best practices"
./claude-flow sparc run architect "Design authentication system architecture"

# Stage 2: Implementation
./claude-flow sparc tdd "User registration and login functionality"
./claude-flow sparc run coder "Implement JWT token management"

# Stage 3: Testing and deployment
./claude-flow sparc run tester "Comprehensive security testing"
./claude-flow swarm "Deploy authentication system" --strategy maintenance --mode centralized
```

### Enterprise Integration
For enterprise environments with additional tooling:

```bash
# Project management integration
./claude-flow project create "authentication-system"
./claude-flow project switch "authentication-system"

# Security compliance
./claude-flow security scan
./claude-flow security audit

# Analytics and monitoring
./claude-flow analytics dashboard
./claude-flow deploy production --monitor
```

## Advanced Batch Tool Patterns

### TodoWrite Coordination
Always use TodoWrite for complex task coordination:

```javascript
TodoWrite([
  {
    id: "architecture_design",
    content: "Design system architecture and component interfaces",
    status: "pending",
    priority: "high",
    dependencies: [],
    estimatedTime: "60min",
    assignedAgent: "architect"
  },
  {
    id: "frontend_development", 
    content: "Develop React components and user interface",
    status: "pending",
    priority: "medium",
    dependencies: ["architecture_design"],
    estimatedTime: "120min",
    assignedAgent: "frontend_team"
  }
]);
```

### Task and Memory Integration
Launch coordinated agents with shared memory:

```javascript
// Store architecture in memory
Task("System Architect", "Design architecture and store specs in Memory");

// Other agents use memory for coordination
Task("Frontend Team", "Develop UI using Memory architecture specs");
Task("Backend Team", "Implement APIs according to Memory specifications");
```

## Workflow Guidelines

### 🚨 CRITICAL WORKFLOW RULE 🚨
**ALWAYS use MCP client for EVERYTHING - NO EXCEPTIONS!**

### Mandatory UCI-MCP Usage:
- **🚨 Testing**: ALWAYS `./bin/uci-mcp` or `./bin/uci-mcp test docker test_uci_config.lua`
- **🚨 Snapshots**: ALWAYS `./bin/uci-mcp snapshot qemu baseline`
- **🚨 Comparisons**: ALWAYS `./bin/uci-mcp compare qemu before after`
- **🚨 Dashboards**: ALWAYS `./bin/uci-mcp dashboard "QEMU OpenWRT VM" --days 30`
- **🚨 Demos**: ALWAYS `./bin/uci-mcp demo ubispot` or `./bin/uci-mcp demo cowboy`
- **🚨 History**: ALWAYS `./bin/uci-mcp history qemu --days 14`
- **🚨 Deployments**: ALWAYS `./bin/uci-mcp demo ubispot --host 192.168.11.2`

### Alternative: Direct MCP Client (Advanced):
- **Testing**: `node mcp/client.js` or `node mcp/client.js test docker test_uci_config.lua`
- **Snapshots**: `node mcp/client.js snapshot qemu baseline`
- **Comparisons**: `node mcp/client.js compare qemu before after`
- **Dashboards**: `node mcp/client.js dashboard "QEMU OpenWRT VM" --days 30`
- **Demos**: `node mcp/client.js demo ubispot` or `node mcp/client.js demo cowboy`
- **History**: `node mcp/client.js history qemu --days 14`
- **Deployments**: `node mcp/client.js demo ubispot --host 192.168.11.2`

### Never Use These Directly:
- ❌ `./scripts/run-tests.sh` (use MCP client instead)
- ❌ `./qemu-ubispot-demo.sh` (use MCP client demo instead)
- ❌ `node demo-orchestrator.js` (use MCP client demo instead)
- ❌ Any bash scripts for testing/deployment (use MCP client)

### Other Guidelines:
- **Single unified interface replaces all separate tools** - everything through MCP client
- Run tests before committing: `node mcp/client.js` (NEVER bash scripts)
- Use meaningful commit messages
- Create feature branches for new functionality  
- Ensure all tests pass before merging

## Important Notes
- **🚨 CRITICAL: Use UNIFIED MCP client for ALL UCI config operations**
- **Single client interface**: `node mcp/client.js [tool]` - testing, snapshots, demos, everything!
- **6 powerful tools in one**: test, snapshot, compare, dashboard, demo, history
- **Unified structured API**: JSON-RPC with type-safe parameters and enhanced error handling
- **Replaces all separate tools**: No more `demo-orchestrator.js`, `run-orchestrator.sh`, etc.
- **Use bash scripts only as fallback**: when MCP unavailable or special requirements
- **Use TodoWrite extensively** for all complex task coordination
- **Leverage Task tool** for parallel agent execution on independent work
- **Store all important information in Memory** for cross-agent coordination
- **Use batch file operations** whenever reading/writing multiple files
- **Check .claude/commands/** for detailed command documentation
- **All swarm operations include automatic batch tool coordination**
- **Monitor progress** with TodoRead during long-running operations
- **Enable parallel execution** with --parallel flags for maximum efficiency
- **Node.js MCP implementation** provides better stability than Python version

This configuration ensures optimal use of Claude Code's batch tools for swarm orchestration and parallel task execution with full Claude-Flow capabilities.
