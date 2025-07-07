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
    echo "  dashboard           Run JavaScript dashboard and infrastructure tests"
    echo "  javascript          Run all JavaScript tests (vitest)"
    echo "  <IP>                Run tests on remote device at IP address"
    echo "  <profile>           Run tests using device profile (gl, openwrt, etc)"
    echo ""
    echo "Tests:"
    echo "  all                 Run all tests (UCI + JavaScript)"
    echo "  uci                 Run only UCI configuration tests"
    echo "  js                  Run only JavaScript tests"
    echo "  <file.lua>          Run specific UCI test file"
    echo "  <file.test.js>      Run specific JavaScript test file"
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
    echo "  ./run-tests.sh                                   # All tests (UCI + JS)"
    echo "  ./run-tests.sh docker uci                        # Only UCI Docker tests" 
    echo "  ./run-tests.sh dashboard                         # Dashboard & infrastructure tests"
    echo "  ./run-tests.sh javascript                        # All JavaScript tests"
    echo "  ./run-tests.sh docker test_uci_config.lua        # Specific UCI Docker test"
    echo "  ./run-tests.sh javascript statistics-engine.test.js # Specific JS test"
    echo "  ./run-tests.sh 192.168.11.2 --password \"\"      # Remote device test"
    echo "  ./run-tests.sh gl test_production_deployment.lua # GL router test"
    echo "  ./run-tests.sh --dry-run --verbose               # Verbose dry run"
    echo "  ./run-tests.sh build                             # Build Docker image"
}

# Using shared logging functions from ssh-common.sh

function check_requirements() {
    # Use shared Node.js checking
    check_node_requirements
    
    # Check JavaScript test requirements for JavaScript targets
    if [ "$TARGET" = "javascript" ] || [ "$TARGET" = "dashboard" ] || [ "$TEST" = "js" ] || [ "$TEST" = "all" ]; then
        check_javascript_requirements
    fi
    
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
    if [ "$TARGET" != "docker" ] && [ "$TARGET" != "javascript" ] && [ "$TARGET" != "dashboard" ]; then
        # Initialize SSH common with current parameters
        ssh_common_init "$TARGET" "$PASSWORD" "$PASSWORD_SET" "$KEY_FILE" "$VERBOSE" ""
    fi
}

function check_javascript_requirements() {
    log_info "Checking JavaScript test requirements..."
    
    # Check if we're in the correct directory structure
    if [ ! -f "../mcp/package.json" ]; then
        error_exit "MCP directory not found. JavaScript tests require mcp/package.json"
    fi
    
    # Check if node_modules exists
    if [ ! -d "../mcp/node_modules" ]; then
        log_info "Installing JavaScript test dependencies..."
        cd ../mcp
        npm install
        cd "$SCRIPT_DIR"
    fi
    
    # Check if vitest is available
    if ! cd ../mcp && npm list vitest >/dev/null 2>&1; then
        error_exit "Vitest not installed. Run: cd mcp && npm install"
    fi
    
    cd "$SCRIPT_DIR"
    log_info "✅ JavaScript test requirements satisfied"
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

function run_javascript_tests() {
    log_info "Running JavaScript tests with vitest"
    
    cd ../mcp
    
    local npm_args=()
    
    # Determine what tests to run
    case "$TARGET" in
        "dashboard")
            log_info "🎯 Running dashboard and infrastructure tests"
            npm_args+=(test)
            npm_args+=(lib/__tests__/statistics-engine.test.js)
            npm_args+=(lib/__tests__/dashboard-generator.test.js)
            npm_args+=(lib/dashboard-assets/__tests__/script-generator.test.js)
            npm_args+=(test/integration/dashboard-workflow.test.js)
            npm_args+=(test/examples/fixture-usage-example.test.js)
            ;;
        "javascript")
            if [ "$TEST" = "all" ] || [ "$TEST" = "js" ]; then
                log_info "🎯 Running all JavaScript tests"
                npm_args+=(test)
            elif [[ "$TEST" == *.test.js ]]; then
                log_info "🎯 Running specific JavaScript test: $TEST"
                npm_args+=(test)
                npm_args+=("$TEST")
            else
                log_info "🎯 Running JavaScript tests matching: $TEST"
                npm_args+=(test)
                npm_args+=(--run)
                npm_args+=(--reporter=verbose)
                npm_args+=("$TEST")
            fi
            ;;
        *)
            # This is called as part of "all" tests
            log_info "🎯 Running key JavaScript tests as part of full test suite"
            npm_args+=(test)
            npm_args+=(lib/__tests__/statistics-engine.test.js)
            npm_args+=(test/examples/fixture-usage-example.test.js)
            ;;
    esac
    
    # Add verbose flag if requested
    if [ "$VERBOSE" = "true" ]; then
        npm_args+=(--reporter=verbose)
    fi
    
    # Run the tests
    if [ ${#npm_args[@]} -gt 1 ]; then
        npm "${npm_args[@]}"
        local js_exit_code=$?
    else
        npm test
        local js_exit_code=$?
    fi
    
    cd "$SCRIPT_DIR"
    
    if [ $js_exit_code -eq 0 ]; then
        log_info "✅ JavaScript tests completed successfully"
    else
        error_exit "❌ JavaScript tests failed with exit code $js_exit_code"
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
case "$TARGET" in
    "javascript"|"dashboard")
        # Run JavaScript tests only
        run_javascript_tests
        ;;
    "docker")
        if [ "$TEST" = "all" ]; then
            # Run both UCI and JavaScript tests for comprehensive testing
            log_info "🚀 Running comprehensive test suite (UCI + JavaScript)"
            
            # First run UCI tests
            if [ "$USE_LEGACY" = "true" ]; then
                run_legacy_tests
            elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
                run_unified_tests
            else
                run_direct_docker
            fi
            
            # Then run key JavaScript tests
            log_info "🔄 Continuing with JavaScript infrastructure tests..."
            run_javascript_tests
            
        elif [ "$TEST" = "uci" ]; then
            # Run only UCI tests
            if [ "$USE_LEGACY" = "true" ]; then
                run_legacy_tests
            elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
                run_unified_tests
            else
                run_direct_docker
            fi
            
        elif [ "$TEST" = "js" ]; then
            # Run only JavaScript tests
            run_javascript_tests
            
        else
            # Run specific UCI test
            if [ "$USE_LEGACY" = "true" ]; then
                run_legacy_tests
            elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
                run_unified_tests
            else
                run_direct_docker
            fi
        fi
        ;;
    *)
        # IP address or device profile - run UCI tests on remote device
        if [ "$TEST" = "all" ]; then
            # For remote devices, "all" means UCI tests + key JavaScript tests
            log_info "🚀 Running remote device tests + JavaScript infrastructure tests"
            
            # First run remote UCI tests
            if [ "$USE_LEGACY" = "true" ]; then
                run_legacy_tests
            elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
                run_unified_tests
            else
                error_exit "Unified test runner not available for remote target: $TARGET"
            fi
            
            # Then run key JavaScript tests locally
            log_info "🔄 Continuing with local JavaScript infrastructure tests..."
            run_javascript_tests
            
        elif [ "$TEST" = "js" ]; then
            # Run only JavaScript tests (locally)
            run_javascript_tests
            
        else
            # Run specific UCI test on remote device
            if [ "$USE_LEGACY" = "true" ]; then
                run_legacy_tests
            elif [ -f "../mcp/server-unified.js" ] && [ -f "../mcp/client.js" ]; then
                run_unified_tests
            else
                error_exit "Unified test runner not available for remote target: $TARGET"
            fi
        fi
        ;;
esac

log_info "🎉 All requested tests completed successfully!"
