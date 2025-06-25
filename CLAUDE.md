# Claude Code Configuration

## Build Commands
- `npm run build`: Build the project
- `./run-tests.sh`: **MCP test runner** - Node.js MCP server/client architecture
- `./run-tests-direct.sh`: **Direct test runner** - Fast Docker execution
- `./run-tests.sh test <file.lua>`: Run specific test file via MCP
- `./run-tests.sh build`: Build Docker test image via MCP
- `./run-tests.sh build --force`: Force rebuild Docker image via MCP
- `npm run lint`: Run ESLint and format checks
- `npm run typecheck`: Run TypeScript type checking
- `./claude-flow --help`: Show all available commands

## Testing Options

### MCP Test Runner (Primary)
`./run-tests.sh` - Node.js MCP (Model Context Protocol) test runner:
- ✅ **WORKING** - Fixed MCP communication protocol
- ✅ Uses custom JSON-RPC client (bypasses MCP SDK parsing bug)
- ✅ MCP server/client architecture for extensibility
- ✅ Runs tests in authentic OpenWRT 23.05 Docker environment
- ✅ Handles service restart testing safely
- ✅ Provides detailed test results
- ✅ Supports running individual test files
- ✅ Current status: 15/17 tests passing

### Direct Test Runner (Alternative)
`./run-tests-direct.sh` - Direct Docker-based testing:
- ✅ Direct Docker execution (no MCP overhead)
- ✅ Runs tests in authentic OpenWRT 23.05 Docker environment  
- ✅ Handles service restart testing safely
- ✅ Provides detailed test results
- ✅ Supports running individual test files
- ✅ Current status: 15/17 tests passing

### MCP Structure
```
mcp/
├── server/          # MCP server implementation
│   └── index.js     # Main server (Node.js)
├── client/          # MCP client implementation  
│   ├── run-tests.js # Fixed test runner client (custom JSON-RPC)
│   └── custom-client.js # Custom MCP client (working)
├── config/          # MCP configuration files
├── backup/          # Backup of old Python implementation
└── package.json     # Node.js dependencies
```

**Both test runners work perfectly!** Use `./run-tests.sh` for MCP architecture or `./run-tests-direct.sh` for direct execution.

## GitHub Configuration

### Git Push vs MCP Tools - Best Practices

**For Local Commits (Primary Use Case):**
When you have local commits to push to GitHub (most common scenario):
```bash
# Ensure GitHub token has 'repo' scope for push permissions
# Check CLAUDE.local.md for GitHub token configuration
gh auth status || source CLAUDE.local.md

# Push existing local commits to remote origin
git push origin master
git push origin <branch-name>  # for feature branches
```

**For Direct GitHub Commits (Special Cases):**
MCP GitHub tools create commits directly on GitHub (bypassing local git):
```bash
# Use MCP tools only for:
# - Creating new files directly on GitHub
# - Making commits without local git workflow
# - Automated remote operations
```

**Key Distinctions:**
- **`git push`**: Pushes existing local commits to remote origin (normal workflow)
- **`mcp__github__push_files`**: Creates new commits directly on GitHub (special cases)
- **"Push" typically means**: Moving local commits to remote origin via `git push`

**Required Token Scopes:**
- **`repo`**: Required for `git push` operations
- **`contents:write`**: Required for MCP GitHub tools

**Authentication Setup:**
```bash
# Configure git to use gh CLI for secure authentication
git config --global credential.helper '!gh auth git-credential'
```

**Troubleshooting:**
- **403 Permission Denied**: Token missing `repo` scope
- **MCP tools work but git push fails**: Token scope issue
- **Both failing**: Authentication or token validity issue

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

## Code Style Preferences
- Use ES modules (import/export) syntax
- Destructure imports when possible
- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Use async/await instead of Promise chains
- Prefer const/let over var

## Workflow Guidelines
- Always run typecheck after making code changes
- Run tests before committing changes using MCP: `./run-tests.sh`
- Use meaningful commit messages
- Create feature branches for new functionality
- Ensure all tests pass before merging

## Important Notes
- **Use TodoWrite extensively** for all complex task coordination
- **Leverage Task tool** for parallel agent execution on independent work
- **Store all important information in Memory** for cross-agent coordination
- **Use batch file operations** whenever reading/writing multiple files
- **Check .claude/commands/** for detailed command documentation
- **All swarm operations include automatic batch tool coordination**
- **Monitor progress** with TodoRead during long-running operations
- **Enable parallel execution** with --parallel flags for maximum efficiency
- **Always use MCP test runner** (`./run-tests.sh`) for running tests in this project
- **Node.js MCP implementation** provides better stability than Python version

This configuration ensures optimal use of Claude Code's batch tools for swarm orchestration and parallel task execution with full Claude-Flow capabilities.
