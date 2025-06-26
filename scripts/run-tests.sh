#!/bin/bash

# UCI Config Tool Universal Test Runner
# Unified wrapper that handles both Docker and remote testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Source shared SSH library
source "$SCRIPT_DIR/lib/ssh-common.sh"

# Default configuration
DEFAULT_TARGET="docker"
DEFAULT_TEST="all"
VERBOSE=false
DRY_RUN=false
REBUILD=false
PASSWORD=""
PASSWORD_SET=false
KEY_FILE=""
USE_LEGACY=false

function show_help() {
    echo "🧪 UCI Config Tool Universal Test Runner"
    echo ""
    echo "Usage:"
    echo "  ./run-tests.sh [target] [test] [options]"
    echo ""
    echo "Targets:"
    echo "  docker              Run tests in Docker container (default)"
    echo "  <IP>                Run tests on remote device at IP address"
    echo "  <profile>           Run tests using device profile (gl, openwrt, etc)"
    echo ""
    echo "Tests:"
    echo "  all                 Run all tests (default)"
    echo "  <file.lua>          Run specific test file"
    echo ""
    echo "Options:"
    echo "  --password <pass>   SSH password for remote targets (use \"\" for empty)"
    echo "  --key-file <path>   SSH key file for remote targets"
    echo "  --verbose           Enable verbose output"
    echo "  --dry-run           Perform dry run without making changes"
    echo "  --rebuild           Force rebuild Docker image"
    echo "  --legacy            Use legacy MCP implementation"
    echo "  --help              Show this help"
    echo ""
    echo "Legacy Commands (for compatibility):"
    echo "  build               Build Docker test image"
    echo "  build --force       Force rebuild Docker image"
    echo ""
    echo "Examples:"
    echo "  ./run-tests.sh                                   # All Docker tests"
    echo "  ./run-tests.sh docker test_uci_config.lua        # Specific Docker test"
    echo "  ./run-tests.sh 192.168.11.2 --password \"\"      # Remote device test"
    echo "  ./run-tests.sh gl test_production_deployment.lua # GL router test"
    echo "  ./run-tests.sh --dry-run --verbose               # Verbose dry run"
    echo "  ./run-tests.sh build                             # Build Docker image"
}

# Using shared logging functions from ssh-common.sh

function check_requirements() {
    # Use shared Node.js checking
    check_node_requirements
    
    # Check if unified server exists
    if [ ! -f "../mcp/server-unified.js" ]; then
        log_info "Unified server not found, using legacy approach"
        USE_LEGACY=true
    fi
    
    # Check if legacy server exists
    if [ "$USE_LEGACY" = "true" ] && [ ! -f "../mcp/server/index.js" ]; then
        error_exit "No MCP server implementation found"
    fi
    
    # Check Docker for Docker targets
    if [ "$TARGET" = "docker" ]; then
        check_docker_requirements
    fi
    
    # Check SSH requirements for remote targets
    if [ "$TARGET" != "docker" ]; then
        # Initialize SSH common with current parameters
        ssh_common_init "$TARGET" "$PASSWORD" "$PASSWORD_SET" "$KEY_FILE" "$VERBOSE" ""
    fi
}

function build_docker_image() {
    local force=${1:-false}
    log_info "Building Docker test image..."
    
    # Need to go to parent directory for Docker build
    cd ..
    
    if [ "$force" = "true" ]; then
        docker build --no-cache -t uci-config-test .
    else
        docker build -t uci-config-test .
    fi
    
    if [ $? -eq 0 ]; then
        log_info "✅ Docker image built successfully"
    else
        error_exit "Docker build failed"
    fi
    
    # Return to script directory
    cd "$SCRIPT_DIR"
}

function run_unified_tests() {
    log_info "Using unified MCP test runner"
    
    # Build arguments for the unified client
    local args=()
    
    if [ "$TARGET" != "$DEFAULT_TARGET" ]; then
        args+=(--target "$TARGET")
    fi
    
    if [ "$TEST" != "$DEFAULT_TEST" ]; then
        args+=(--test "$TEST")
    fi
    
    if [ "$VERBOSE" = "true" ]; then
        args+=(--verbose)
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        args+=(--dry-run)
    fi
    
    if [ "$REBUILD" = "true" ]; then
        args+=(--rebuild)
    fi
    
    if [ "$PASSWORD_SET" = "true" ]; then
        args+=(--password "$PASSWORD")
    fi
    
    if [ -n "$KEY_FILE" ]; then
        args+=(--key-file "$KEY_FILE")
    fi
    
    # Run unified client
    node ../mcp/client.js "${args[@]}"
}

function run_legacy_tests() {
    log_info "Using legacy MCP test runner"
    
    if [ "$TARGET" = "docker" ]; then
        # Use legacy Docker MCP runner
        if [ "$TEST" = "all" ]; then
            node ../mcp/client/run-tests.js
        else
            node ../mcp/client/run-tests.js --test "$TEST"
        fi
    else
        # Use target device runner
        local args=("$TARGET" "$TEST")
        
        if [ "$VERBOSE" = "true" ]; then
            args+=(--verbose)
        fi
        
        if [ "$DRY_RUN" = "true" ]; then
            args+=(--dry-run)
        fi
        
        if [ "$PASSWORD_SET" = "true" ]; then
            args+=(--password "$PASSWORD")
        fi
        
        ./run-tests-target.sh "${args[@]}"
    fi
}

function run_direct_docker() {
    log_info "Using direct Docker execution"
    
    if [ "$TEST" = "all" ]; then
        ./run-tests-direct.sh
    else
        ./run-tests-direct.sh test "$TEST"
    fi
}

# Parse command line arguments
TARGET="$DEFAULT_TARGET"
TEST="$DEFAULT_TEST"

while [[ $# -gt 0 ]]; do
    case $1 in
        --password)
            PASSWORD="$2"
            PASSWORD_SET=true
            shift 2
            ;;
        --key-file)
            KEY_FILE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rebuild)
            REBUILD=true
            shift
            ;;
        --legacy)
            USE_LEGACY=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        build)
            # Legacy build command
            force=false
            if [ "$2" = "--force" ]; then
                force=true
                shift
            fi
            build_docker_image "$force"
            exit 0
            ;;
        --*)
            error_exit "Unknown option: $1"
            ;;
        *)
            # Positional arguments
            if [ "$TARGET" = "$DEFAULT_TARGET" ]; then
                TARGET="$1"
            elif [ "$TEST" = "$DEFAULT_TEST" ]; then
                TEST="$1"
            else
                error_exit "Too many positional arguments: $1"
            fi
            shift
            ;;
    esac
done

# Check requirements
check_requirements

# Execute tests based on configuration
if [ "$USE_LEGACY" = "true" ]; then
    run_legacy_tests
elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
    run_unified_tests
else
    # Fallback to direct Docker execution for docker targets
    if [ "$TARGET" = "docker" ]; then
        run_direct_docker
    else
        error_exit "Unified test runner not available and target is not docker"
    fi
fi
