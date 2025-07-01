#!/bin/bash

# Start the UCI Device Orchestrator MCP Server
# This server provides advanced configuration management and deployment orchestration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORCHESTRATOR_SERVER="$PROJECT_ROOT/mcp/server-orchestrator.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function show_help() {
    echo "🔧 UCI Device Orchestrator MCP Server"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --help, -h           Show this help message"
    echo "  --check-deps         Check dependencies without starting"
    echo "  --debug              Enable debug logging"
    echo ""
    echo "Features:"
    echo "  📸 Device configuration snapshots via SSH"
    echo "  🔍 Intelligent before/after configuration diffs"
    echo "  📊 Interactive HTML dashboards"
    echo "  🚀 Environment-based deployment orchestration"
    echo "  📈 Configuration drift detection"
    echo "  ⚡ Canary deployments and rollback automation"
    echo ""
    echo "Available Tools:"
    echo "  • snapshot-device-config     - Capture device configuration"
    echo "  • compare-device-configs     - Generate configuration diffs"
    echo "  • list-config-history        - Show configuration timeline"
    echo "  • generate-dashboard         - Create HTML dashboards"
    echo "  • deploy-to-environment      - Environment-based deployment"
    echo "  • detect-config-drift        - Find configuration drift"
    echo "  • list-devices               - Show device inventory"
    echo "  • restore-device-config      - Restore from snapshot"
    echo ""
    echo "Examples:"
    echo "  # Start the orchestrator server"
    echo "  $0"
    echo ""
    echo "  # Check dependencies"
    echo "  $0 --check-deps"
    echo ""
    echo "Environment Variables:"
    echo "  ORCHESTRATOR_DEBUG=1         Enable debug mode"
    echo "  ORCHESTRATOR_PORT=3001       Change MCP port (if applicable)"
}

function check_dependencies() {
    log_info "Checking dependencies..."
    
    local all_good=true
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not found"
        all_good=false
    else
        local node_version=$(node --version)
        log_success "Node.js found: $node_version"
    fi
    
    # Check if orchestrator server exists
    if [ ! -f "$ORCHESTRATOR_SERVER" ]; then
        log_error "Orchestrator server not found at: $ORCHESTRATOR_SERVER"
        all_good=false
    else
        log_success "Orchestrator server found"
    fi
    
    # Check MCP dependencies
    if [ ! -d "$PROJECT_ROOT/mcp/node_modules" ]; then
        log_warning "MCP dependencies not installed, installing..."
        cd "$PROJECT_ROOT/mcp"
        npm install
        cd - > /dev/null
        log_success "MCP dependencies installed"
    else
        log_success "MCP dependencies found"
    fi
    
    # Check SSH availability
    if ! command -v ssh &> /dev/null; then
        log_error "SSH client is required but not found"
        all_good=false
    else
        log_success "SSH client available"
    fi
    
    # Create required directories
    log_info "Creating required directories..."
    mkdir -p "$PROJECT_ROOT/config-snapshots"
    mkdir -p "$PROJECT_ROOT/config-snapshots/dashboard"
    mkdir -p "$PROJECT_ROOT/etc/config/environments/dev"
    mkdir -p "$PROJECT_ROOT/etc/config/environments/test"
    mkdir -p "$PROJECT_ROOT/etc/config/environments/prod"
    log_success "Directories created"
    
    if [ "$all_good" = false ]; then
        log_error "Some dependencies are missing. Please install them and try again."
        exit 1
    fi
    
    log_success "All dependencies satisfied!"
    return 0
}

function start_orchestrator() {
    log_info "Starting UCI Device Orchestrator MCP Server..."
    
    # Set environment variables
    export DEBUG=1
    export NODE_ENV=development
    
    if [ "$DEBUG_MODE" = "true" ]; then
        export ORCHESTRATOR_DEBUG=1
        log_info "Debug mode enabled"
    fi
    
    # Change to MCP directory
    cd "$PROJECT_ROOT/mcp"
    
    log_success "🔧 UCI Device Orchestrator MCP Server starting..."
    log_info "Server file: $ORCHESTRATOR_SERVER"
    log_info "Working directory: $(pwd)"
    log_info ""
    log_info "Available features:"
    log_info "  📸 Configuration snapshots"
    log_info "  🔍 Intelligent diffs"
    log_info "  📊 HTML dashboards"
    log_info "  🚀 Environment deployments"
    log_info ""
    log_info "Press Ctrl+C to stop the server"
    log_info ""
    
    # Start the server
    exec node "$ORCHESTRATOR_SERVER"
}

# Parse command line arguments
CHECK_DEPS_ONLY=false
DEBUG_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --check-deps)
            CHECK_DEPS_ONLY=true
            shift
            ;;
        --debug)
            DEBUG_MODE=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check dependencies
check_dependencies

if [ "$CHECK_DEPS_ONLY" = "true" ]; then
    log_success "Dependency check completed successfully!"
    exit 0
fi

# Start the orchestrator server
start_orchestrator