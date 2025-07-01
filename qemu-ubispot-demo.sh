#!/bin/bash

# QEMU ubispot Configuration Demo
# Demonstrates full UCI config deployment workflow with orchestration tracking

set -e

QEMU_HOST="192.168.11.2"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
    log_step "Deploying ubispot configuration using uci-config tool"
    
    # Use the uci-config tool to deploy default ubispot configuration
    log_info "Running: bin/uci-config --target default --no-confirm ${QEMU_HOST}"
    
    # Run the uci-config deployment
    if [ -f "bin/uci-config" ]; then
        ./bin/uci-config --target default --no-confirm ${QEMU_HOST}
        deployment_result=$?
    else
        echo "❌ Error: bin/uci-config tool not found"
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
    echo "This demo will:"
    echo "1. Take a baseline snapshot of your QEMU VM"
    echo "2. Deploy ubispot configuration using bin/uci-config --target default --no-confirm"
    echo "3. Capture post-deployment snapshot"
    echo "4. Show intelligent diff view in the orchestration dashboard"
    echo ""
    
    log_info "Starting demo in 3 seconds..."
    sleep 3
    
    # Step 1: Check QEMU connection
    check_qemu_connection
    
    # Step 2: Show current config
    show_current_ubispot_config
    
    # Step 3: Take pre-deployment snapshot
    take_snapshot "pre-ubispot-deployment"
    
    # Step 4: Deploy ubispot configuration
    deploy_ubispot_config
    
    # Step 5: Show updated config
    log_info "Updated ubispot configuration:"
    show_current_ubispot_config
    
    # Step 6: Take post-deployment snapshot
    take_snapshot "post-ubispot-deployment"
    
    # Step 7: Compare snapshots
    compare_snapshots
    
    # Step 8: Show dashboard
    show_diff_dashboard
    
    echo ""
    log_success "Demo completed successfully! 🎉"
    echo ""
    echo "🔍 Next steps:"
    echo "   1. Open the dashboard URL above"
    echo "   2. Click on the latest snapshot's 'Compare with Previous' button"
    echo "   3. Explore the detailed UCI configuration changes"
    echo "   4. See how ubispot captive portal was configured"
    echo ""
    echo "🤠 Happy orchestrating!"
}

# Run the demo
main "$@"