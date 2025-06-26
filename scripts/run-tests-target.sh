#!/bin/bash

# Target Device MCP Test Runner
# Safely executes UCI configuration tests on real target devices
# Usage: ./run-tests-target.sh <target> [test-file] [options]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$SCRIPT_DIR/mcp"

# Default configuration
DEFAULT_TEST_FILE="test_production_deployment.lua"
TARGET_PROFILE=""
TEST_FILE=""
DRY_RUN=false
VERBOSE=false
FORCE=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}🎯 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to show usage
show_usage() {
    cat << EOF
🎯 UCI Config Target Device Test Runner
======================================

USAGE:
    ./run-tests-target.sh <target> [test-file] [options]

ARGUMENTS:
    <target>        Target device identifier (e.g., 'gl', '192.168.1.1', 'openwrt')
    [test-file]     Test file to run (default: test_production_deployment.lua)

OPTIONS:
    --dry-run       Show what would be executed without running tests
    --verbose       Enable verbose output
    --force         Skip safety confirmations (DANGEROUS)
    --list          List available target profiles
    --validate      Validate target profile and test connectivity
    --help          Show this help message

EXAMPLES:
    # Run production tests on GL-iNet router
    ./run-tests-target.sh gl

    # Run specific test on IP address with verbose output  
    ./run-tests-target.sh 192.168.1.1 test_production_deployment.lua --verbose

    # Dry run to see what would be executed
    ./run-tests-target.sh openwrt --dry-run

SAFETY:
    ⚠️  WARNING: This runner executes tests on REAL devices!
    ⚠️  Only use on non-production devices you can afford to reset
    ⚠️  Ensure you have physical access for recovery if needed
    ⚠️  All operations include automatic backup and rollback

TARGET PROFILES:
    - gl          GL-iNet routers (common settings)
    - openwrt     Generic OpenWRT devices
    - mikrotik    MikroTik RouterOS devices  
    - <ip>        Direct IP address connection
    - custom      Load from test/targets/custom.json

For more information, see: https://docs.anthropic.com/claude-code/testing
EOF
}

# Function to validate target argument
validate_target() {
    local target="$1"
    
    if [[ -z "$target" ]]; then
        print_error "Target device must be specified"
        show_usage
        exit 1
    fi
    
    # Check if target is an IP address
    if [[ "$target" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        print_status "Using direct IP target: $target"
        TARGET_PROFILE="ip:$target"
        return 0
    fi
    
    # Check if target profile exists
    local profile_file="$SCRIPT_DIR/test/targets/${target}.json"
    if [[ -f "$profile_file" ]]; then
        print_status "Using target profile: $target"
        TARGET_PROFILE="$target"
        return 0
    fi
    
    print_error "Unknown target: $target"
    print_warning "Available targets:"
    if [[ -d "$SCRIPT_DIR/targets" ]]; then
        ls "$SCRIPT_DIR/targets"/*.json 2>/dev/null | sed 's/.*\//  - /' | sed 's/\.json$//' || echo "  (no profiles found)"
    else
        echo "  (targets directory not found)"
    fi
    exit 1
}

# Function to check dependencies
check_dependencies() {
    local missing_deps=()
    
    # Check for required commands
    for cmd in ssh scp node npm jq; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        print_error "Missing required dependencies:"
        printf '  - %s\n' "${missing_deps[@]}"
        print_warning "Please install missing dependencies and try again"
        exit 1
    fi
    
    # Check MCP server availability
    if [[ ! -d "$MCP_DIR" ]]; then
        print_error "MCP directory not found: $MCP_DIR"
        exit 1
    fi
    
    if [[ ! -f "$MCP_DIR/package.json" ]]; then
        print_error "MCP package.json not found"
        exit 1
    fi
}

# Function to show safety warning
show_safety_warning() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    
    cat << EOF

${RED}⚠️  SAFETY WARNING ⚠️${NC}
====================

You are about to run tests on a REAL DEVICE: ${YELLOW}$TARGET_PROFILE${NC}

This will:
  • Connect to the target device via SSH
  • Create a full backup of current configuration
  • Execute UCI configuration tests
  • Potentially modify network settings (with safeguards)
  • Automatically restore on failure

${YELLOW}RISKS:${NC}
  • Temporary network connectivity loss
  • Device configuration changes
  • Potential need for physical recovery

${GREEN}SAFEGUARDS:${NC}
  • Full configuration backup before execution
  • Network preservation enabled by default
  • Automatic rollback on connectivity loss
  • Connection monitoring throughout execution

EOF

    read -p "Do you want to continue? (type 'yes' to proceed): " -r
    if [[ ! "$REPLY" =~ ^[Yy][Ee][Ss]$ ]]; then
        print_warning "Operation cancelled by user"
        exit 1
    fi
    
    print_success "Safety warning acknowledged"
}

# Function to check MCP setup
check_mcp_setup() {
    print_status "Checking MCP setup..."
    
    cd "$MCP_DIR"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        print_status "Installing MCP dependencies..."
        npm install
    fi
    
    # Check if MCP client exists
    if [[ ! -f "client/run-tests-target.js" ]]; then
        print_error "MCP target client not found"
        exit 1
    fi
    
    print_success "MCP setup verified"
}

# Function to run target tests
run_target_tests() {
    print_status "Executing target device tests..."
    
    cd "$MCP_DIR/client"
    
    local client_args=("run" "$TARGET_PROFILE")
    
    if [[ -n "$TEST_FILE" && "$TEST_FILE" != "$DEFAULT_TEST_FILE" ]]; then
        client_args+=("$TEST_FILE")
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        client_args+=("--dry-run")
    fi
    
    if [[ "$VERBOSE" == "true" ]]; then
        client_args+=("--verbose")
    fi
    
    # Execute the target test client
    if node run-tests-target.js "${client_args[@]}"; then
        print_success "Target tests completed successfully"
        return 0
    else
        print_error "Target tests failed"
        return 1
    fi
}

# Function to list available profiles
list_profiles() {
    print_status "Available target profiles:"
    
    cd "$MCP_DIR/client"
    node run-tests-target.js list
}

# Function to validate target profile
validate_profile() {
    local target="$1"
    print_status "Validating target profile: $target"
    
    cd "$MCP_DIR/client"
    node run-tests-target.js validate "$target"
}

# Function to cleanup
cleanup() {
    # No cleanup needed for MCP client approach
    true
}

# Trap cleanup on exit
trap cleanup EXIT

# Main function
main() {
    local target="${1:-}"
    
    # Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_usage
                exit 0
                ;;
            --list)
                list_profiles
                exit 0
                ;;
            --validate)
                if [[ -n "$target" ]]; then
                    validate_profile "$target"
                    exit 0
                else
                    print_error "--validate requires a target argument"
                    exit 1
                fi
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$TEST_FILE" ]]; then
                    TEST_FILE="$1"
                else
                    print_error "Unexpected argument: $1"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Set default test file if not specified
    if [[ -z "$TEST_FILE" ]]; then
        TEST_FILE="$DEFAULT_TEST_FILE"
    fi
    
    # Validate inputs
    validate_target "$target"
    
    # Show header
    print_status "UCI Config Target Device Test Runner"
    echo "======================================"
    echo "Target: $TARGET_PROFILE"
    echo "Test File: $TEST_FILE"
    echo "Dry Run: $DRY_RUN"
    echo "Verbose: $VERBOSE"
    echo ""
    
    # Check dependencies and MCP setup
    print_status "Checking dependencies..."
    check_dependencies
    check_mcp_setup
    print_success "Dependencies and MCP setup verified"
    
    # Show safety warning
    show_safety_warning
    
    # For dry run, show what would be executed
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN MODE - No actual operations will be performed"
        echo ""
        echo "Would execute:"
        echo "  1. Connect to target: $TARGET_PROFILE"
        echo "  2. Create configuration backup"
        echo "  3. Upload test framework"
        echo "  4. Execute: $TEST_FILE"
        echo "  5. Monitor network connectivity"
        echo "  6. Restore configuration"
        echo ""
        print_success "Dry run completed"
        exit 0
    fi
    
    # MCP client will handle server communication automatically
    
    # Run the tests
    if run_target_tests; then
        print_success "Target device testing completed successfully"
        exit 0
    else
        print_error "Target device testing failed"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"
