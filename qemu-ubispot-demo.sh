#!/bin/bash

# QEMU ubispot Configuration Demo
# Demonstrates full UCI config deployment workflow with orchestration tracking

set -e

QEMU_HOST="192.168.11.2"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ENABLED=true
TARGET_CONFIG="default"
DEPLOYMENT_MODE="safe-merge"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_step() {
    echo -e "${YELLOW}[STEP]${NC} $1"
}

function show_help() {
    echo "🔧 QEMU ubispot Configuration Demo"
    echo "=================================="
    echo ""
    echo "Demonstrates full UCI config deployment workflow with orchestration tracking"
    echo ""
    echo "Usage:"
    echo "  $0 [options]"
    echo ""
    echo "Options:"
    echo "  --no-deploy              Skip deployment, only take snapshots and show existing diffs"
    echo "  --target <config>        Deployment target configuration (default: default)"
    echo "  --mode <mode>           Deployment mode (default: safe-merge)"
    echo "  --host <ip>             QEMU host IP address (default: 192.168.11.2)"
    echo "  --help, -h              Show this help message"
    echo ""
    echo "Deployment Modes:"
    echo "  safe-merge              Safe merge with default safety options (recommended)"
    echo "  merge                   Standard merge operation"
    echo "  validate                Validate configurations only"
    echo ""
    echo "Target Configurations:"
    echo "  default                 Default ubispot configuration"
    echo "  gl-mt3000               GL-iNet MT3000 specific configuration"
    echo "  qemu-armv8              QEMU ARM64 specific configuration"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Full demo with deployment"
    echo "  $0 --no-deploy                       # Snapshot and diff analysis only"
    echo "  $0 --target gl-mt3000                # Deploy GL-iNet specific config"
    echo "  $0 --mode validate --no-deploy       # Validation workflow only"
    echo "  $0 --host 192.168.1.100             # Different QEMU host"
    echo ""
    echo "Workflow (with deployment enabled):"
    echo "  1. Take pre-deployment snapshot"
    echo "  2. Deploy ubispot configuration using scripts/run-deploy.sh"
    echo "  3. Capture post-deployment snapshot"
    echo "  4. Generate intelligent configuration diff"
    echo "  5. Update interactive dashboard with timeline"
    echo ""
    echo "Workflow (with --no-deploy):"
    echo "  1. Take current configuration snapshot"
    echo "  2. Analyze existing configuration changes"
    echo "  3. Generate dashboard with current state"
    echo ""
}

function check_qemu_connection() {
    log_info "Checking QEMU VM connection..."
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${QEMU_HOST} "echo 'QEMU VM accessible'" > /dev/null 2>&1; then
        log_success "QEMU VM is accessible at ${QEMU_HOST}"
    else
        echo "❌ Error: Cannot connect to QEMU VM at ${QEMU_HOST}"
        exit 1
    fi
}

function take_snapshot() {
    local label="$1"
    log_step "Taking snapshot: $label"
    
    node demo-orchestrator.js snapshot qemu "$label"
    
    if [ $? -eq 0 ]; then
        log_success "Snapshot '$label' captured successfully"
    else
        echo "❌ Error: Failed to capture snapshot"
        exit 1
    fi
}

function show_current_ubispot_config() {
    log_info "Current ubispot configuration on QEMU VM:"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@${QEMU_HOST} "uci show ubispot 2>/dev/null || echo 'No ubispot config found'"
}

function deploy_ubispot_config() {
    if [ "$DEPLOY_ENABLED" = "false" ]; then
        log_info "Deployment skipped (--no-deploy specified)"
        return 0
    fi
    
    log_step "Deploying ubispot configuration using UCI deployment framework"
    
    # Use the production deployment script
    log_info "Running: ./scripts/run-deploy.sh ${QEMU_HOST} ${DEPLOYMENT_MODE} --target ${TARGET_CONFIG} --no-confirm --password \"\""
    
    # Run the deployment using the production script
    if [ -f "scripts/run-deploy.sh" ]; then
        ./scripts/run-deploy.sh ${QEMU_HOST} ${DEPLOYMENT_MODE} --target ${TARGET_CONFIG} --no-confirm --password ""
        deployment_result=$?
    else
        echo "❌ Error: scripts/run-deploy.sh not found"
        exit 1
    fi
    
    if [ $deployment_result -eq 0 ]; then
        log_success "ubispot configuration deployed successfully"
    else
        echo "❌ Warning: Deployment completed with warnings (exit code: $deployment_result)"
        log_info "Continuing with demo..."
    fi
}

function show_diff_dashboard() {
    log_step "Opening dashboard to view configuration differences"
    
    # Generate updated dashboard
    log_info "Generating updated dashboard..."
    node demo-orchestrator.js dashboard "QEMU OpenWRT VM"
    
    log_success "Dashboard updated! Open the following URL to see the diff:"
    echo ""
    echo "🌐 Dashboard URL:"
    echo "   file://${PROJECT_ROOT}/config-snapshots/dashboard/device-QEMU OpenWRT VM.html"
    echo ""
    echo "📊 What you'll see:"
    echo "   - Timeline with 3 snapshots (baseline, pre-ubispot, post-ubispot)"
    echo "   - Click 'Compare with Previous' to see exact UCI changes"
    echo "   - ubispot package configuration differences"
    echo "   - Network and firewall rule changes"
    echo "   - DHCP and DNS configuration updates"
    echo ""
}

function compare_snapshots() {
    log_step "Generating snapshot comparison"
    
    # Use the orchestrator to compare the before and after snapshots
    log_info "Comparing pre-ubispot-deployment vs post-ubispot-deployment snapshots..."
    
    node demo-orchestrator.js compare "QEMU OpenWRT VM" "pre-ubispot-deployment" "post-ubispot-deployment"
}

# Main demo workflow
function main() {
    echo "🔧 QEMU ubispot Configuration Demo"
    echo "=================================="
    echo ""
    if [ "$DEPLOY_ENABLED" = "true" ]; then
        echo "Deployment Mode: ENABLED"
        echo "This demo will:"
        echo "1. Take a pre-deployment snapshot of your QEMU VM"
        echo "2. Deploy ubispot configuration using scripts/run-deploy.sh"
        echo "3. Capture post-deployment snapshot"
        echo "4. Show intelligent diff view in the orchestration dashboard"
        echo ""
        echo "Configuration:"
        echo "  Target: ${TARGET_CONFIG}"
        echo "  Mode: ${DEPLOYMENT_MODE}"
        echo "  Host: ${QEMU_HOST}"
    else
        echo "Analysis Mode: DEPLOYMENT DISABLED"
        echo "This demo will:"
        echo "1. Take a current configuration snapshot"
        echo "2. Analyze existing configuration state"
        echo "3. Generate dashboard with current timeline"
        echo ""
        echo "Note: Use without --no-deploy to include deployment workflow"
    fi
    echo ""
    
    log_info "Starting demo in 3 seconds..."
    sleep 3
    
    # Step 1: Check QEMU connection
    check_qemu_connection
    
    # Step 2: Show current config
    show_current_ubispot_config
    
    # Step 3: Take snapshot (different label based on mode)
    if [ "$DEPLOY_ENABLED" = "true" ]; then
        take_snapshot "pre-deployment-${TARGET_CONFIG}"
    else
        take_snapshot "analysis-$(date +%H%M%S)"
    fi
    
    # Step 4: Deploy configuration (if enabled)
    deploy_ubispot_config
    
    if [ "$DEPLOY_ENABLED" = "true" ]; then
        # Step 5: Show updated config
        log_info "Updated ubispot configuration:"
        show_current_ubispot_config
        
        # Step 6: Take post-deployment snapshot
        take_snapshot "post-deployment-${TARGET_CONFIG}"
        
        # Step 7: Compare snapshots
        compare_snapshots
    fi
    
    # Step 8: Show dashboard
    show_diff_dashboard
    
    echo ""
    log_success "Demo completed successfully! 🎉"
    echo ""
    if [ "$DEPLOY_ENABLED" = "true" ]; then
        echo "🔍 Deployment Analysis:"
        echo "   1. Open the dashboard URL above"
        echo "   2. Click on the latest snapshot's 'Compare with Previous' button"
        echo "   3. Explore the detailed UCI configuration changes"
        echo "   4. See how ${TARGET_CONFIG} configuration was deployed"
    else
        echo "🔍 Configuration Analysis:"
        echo "   1. Open the dashboard URL above"
        echo "   2. Review the current configuration state"
        echo "   3. Run again without --no-deploy to see deployment workflow"
    fi
    echo ""
    echo "🤠 Happy orchestrating!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-deploy)
            DEPLOY_ENABLED=false
            shift
            ;;
        --target)
            TARGET_CONFIG="$2"
            shift 2
            ;;
        --mode)
            DEPLOYMENT_MODE="$2"
            shift 2
            ;;
        --host)
            QEMU_HOST="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "❌ Error: Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate arguments
if [ "$DEPLOYMENT_MODE" != "safe-merge" ] && [ "$DEPLOYMENT_MODE" != "merge" ] && [ "$DEPLOYMENT_MODE" != "validate" ]; then
    echo "❌ Error: Invalid deployment mode: $DEPLOYMENT_MODE"
    echo "Valid modes: safe-merge, merge, validate"
    exit 1
fi

# Run the demo
main