#!/bin/bash

# UCI Config Tool Remote Deployment Script
# Deploy UCI configuration operations to remote OpenWRT devices

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Source shared SSH library
source "$SCRIPT_DIR/lib/ssh-common.sh"

# Default configuration
DEFAULT_TARGET=""
DEFAULT_COMMAND=""
PREFIX="/usr/local"
VERBOSE=false
PASSWORD=""
PASSWORD_SET=false
KEY_FILE=""
CONFIRM=true
BACKUP=true
LOG_FILE=""

# Initialize logging
function init_logging() {
    local timestamp=$(date +"%Y%m%d-%H%M%S")
    local target_safe=$(echo "$TARGET" | sed 's/[^a-zA-Z0-9.-]/_/g')
    LOG_FILE="$SCRIPT_DIR/../logs/deploy-${timestamp}-${target_safe}.log"
    
    # Ensure logs directory exists
    mkdir -p "$SCRIPT_DIR/../logs"
    
    # Create log file
    touch "$LOG_FILE"
    
    log_info "=== UCI Config Deployment Started ==="
    log_info "Timestamp: $(date)"
    log_info "Target: $TARGET"
    log_info "Command: $COMMAND"
    log_info "Arguments: ${UCI_ARGS[*]}"
    log_info "Installation prefix: $PREFIX"
    log_info "Log file: $LOG_FILE"
    log_info "======================================="
}

# Using shared logging and SSH functions from ssh-common.sh

function show_help() {
    echo "🚀 UCI Config Remote Deployment Tool"
    echo ""
    echo "Usage:"
    echo "  ./run-deploy.sh <target> <command> [command-args...] [options]"
    echo ""
    echo "Targets:"
    echo "  <IP>                Deploy to device at IP address"
    echo "  <profile>           Deploy using device profile (gl, openwrt, etc)"
    echo ""
    echo "Commands:"
    echo "  safe-merge          Safe merge with default safety options"
    echo "  merge               Merge UCI configurations"
    echo "  backup              Create configuration backup"
    echo "  validate            Validate configurations"
    echo "  remove              Remove configurations"
    echo "  help                Show UCI config tool help"
    echo ""
    echo "Options:"
    echo "  --password <pass>   SSH password (use \"\" for empty)"
    echo "  --key-file <path>   SSH key file"
    echo "  --prefix <path>     Installation prefix (default: /usr/local)"
    echo "  --verbose           Enable verbose output"
    echo "  --force             Skip confirmation prompts"
    echo "  --no-backup         Skip automatic backup"
    echo "  --restart-services  Allow service restarts (default: disabled to prevent SSH hangs)"
    echo "  --help              Show this help"
    echo ""
    echo "Examples:"
    echo "  # Safe merge with dry-run first"
    echo "  ./run-deploy.sh 192.168.11.2 safe-merge --target default --dry-run --password \"\""
    echo "  ./run-deploy.sh 192.168.11.2 safe-merge --target default --password \"\""
    echo ""
    echo "  # Create backup before deployment"
    echo "  ./run-deploy.sh gl backup --name pre-upgrade --password \"\""
    echo ""
    echo "  # Validate configurations"
    echo "  ./run-deploy.sh openwrt validate --check-services --verbose --key-file ~/.ssh/id_rsa"
    echo ""
    echo "  # Remove old configurations"
    echo "  ./run-deploy.sh 10.0.0.1 remove --target old-config --dry-run --password \"\""
    echo ""
    echo "  # Custom installation prefix"
    echo "  ./run-deploy.sh 192.168.11.2 safe-merge --target default --prefix /opt/uci-config --password \"\""
    echo ""
    echo "  # Enable service restarts (may cause SSH hangs)"
    echo "  ./run-deploy.sh 192.168.11.2 safe-merge --target default --restart-services --password \"\""
    echo ""
    echo "Installation Structure:"
    echo "  \$PREFIX/bin/uci-config              # Executable binary"
    echo "  \$PREFIX/lib/uci-config/             # Lua library files"
    echo "  \$PREFIX/share/uci-config/etc/       # Configuration templates"
    echo ""
    echo "Notes:"
    echo "  - Service restarts are disabled by default to prevent SSH connection hangs"
    echo "  - Use --restart-services to enable service restarts if needed"
    echo "  - Consider manually restarting services after deployment via console"
    echo ""
    echo "Logs are saved to: logs/deploy-TIMESTAMP-TARGET.log"
}

function check_requirements() {
    log_verbose "Checking deployment requirements..."
    
    # Check if UCI config tool exists
    if [ ! -f "$SCRIPT_DIR/../bin/uci-config" ]; then
        error_exit "UCI config tool not found at $SCRIPT_DIR/../bin/uci-config"
    fi
    
    # Use shared SSH requirements checking
    # SSH requirements will be checked by ssh_common_init
    
    log_verbose "Requirements check passed"
}

# SSH and target detection functions now provided by shared library

function deploy_create_remote_backup() {
    if [ "$BACKUP" = "false" ]; then
        log_verbose "Skipping backup (--no-backup specified)"
        return 0
    fi
    
    # Use shared backup function
    local backup_name="deploy-backup-$(date +%Y%m%d-%H%M%S)"
    create_remote_backup "$backup_name"
}

function upload_framework() {
    log_info "Uploading UCI config framework..."
    log_info "Installing to prefix: $PREFIX"
    
    # Use shared archive creation and upload
    local archive_name="uci-deploy-framework.tar.gz"
    if ! create_and_upload_archive "bin/ lib/ etc/" "$archive_name" "/tmp" "$SCRIPT_DIR/.."; then
        error_exit "Failed to upload framework archive"
    fi
    
    # Extract and setup on remote with Unix-compliant structure
    log_verbose "Setting up framework on remote device..."
    local setup_commands=(
        # Extract to temporary location
        "cd /tmp && tar -xzf $archive_name"
        
        # Create prefix directory structure
        "mkdir -p $PREFIX/bin"
        "mkdir -p $PREFIX/lib/uci-config"
        "mkdir -p $PREFIX/share/uci-config"
        
        # Install binary
        "cp /tmp/bin/uci-config $PREFIX/bin/"
        "chmod +x $PREFIX/bin/uci-config"
        
        # Install Lua library files
        "cp -r /tmp/lib/* $PREFIX/lib/uci-config/"
        
        # Install configuration templates
        "cp -r /tmp/etc $PREFIX/share/uci-config/"
        
        # Clean up temporary files
        "rm -rf /tmp/bin /tmp/lib /tmp/etc /tmp/$archive_name"
    )
    
    for cmd in "${setup_commands[@]}"; do
        if ! execute_ssh_command "$cmd" >/dev/null; then
            error_exit "Failed to setup framework: $cmd"
        fi
    done
    
    log_info "✅ Framework installed to $PREFIX"
    log_verbose "Binary: $PREFIX/bin/uci-config"
    log_verbose "Libraries: $PREFIX/lib/uci-config/"
    log_verbose "Templates: $PREFIX/share/uci-config/etc/"
}

function confirm_deployment() {
    if [ "$CONFIRM" = "false" ]; then
        log_verbose "Skipping confirmation (--force specified)"
        return 0
    fi
    
    # Check if this is a dry-run
    local is_dry_run=false
    for arg in "${UCI_ARGS[@]}"; do
        if [ "$arg" = "--dry-run" ]; then
            is_dry_run=true
            break
        fi
    done
    
    if [ "$is_dry_run" = "true" ]; then
        log_verbose "Dry-run detected, skipping confirmation"
        return 0
    fi
    
    echo ""
    log_info "⚠️  DEPLOYMENT CONFIRMATION REQUIRED"
    log_info "Target: $TARGET_HOST ($TARGET)"
    log_info "Command: $COMMAND ${UCI_ARGS[*]}"
    log_info "This will modify the remote device configuration."
    echo ""
    
    read -p "Continue with deployment? [y/N]: " -r response
    echo ""
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled by user"
        exit 0
    fi
    
    log_info "Deployment confirmed by user"
}

function execute_uci_command() {
    log_info "Executing UCI command: $COMMAND ${UCI_ARGS[*]}"
    
    # Build the remote command with prefix paths
    local remote_cmd="cd $PREFIX/share/uci-config && export PATH=\"$PREFIX/bin:/usr/sbin:/usr/bin:/sbin:/bin\" && export LUA_PATH='$PREFIX/lib/uci-config/?.lua;$PREFIX/lib/uci-config/commands/?.lua' && uci-config $COMMAND"
    
    # Add --no-restart by default to prevent SSH hangs from network service restarts
    # (unless user explicitly adds --restart-services to override)
    local has_restart_option=false
    for arg in "${UCI_ARGS[@]}"; do
        if [[ "$arg" == "--restart-services" || "$arg" == "--no-restart" ]]; then
            has_restart_option=true
            break
        fi
    done
    
    if [ "$has_restart_option" = "false" ]; then
        remote_cmd="$remote_cmd --no-restart"
        log_verbose "Added --no-restart to prevent SSH connection hangs"
    fi
    
    # Add UCI arguments
    for arg in "${UCI_ARGS[@]}"; do
        # Skip --restart-services as it's just used to disable our --no-restart default
        if [ "$arg" != "--restart-services" ]; then
            # Escape arguments properly
            local escaped_arg=$(printf '%q' "$arg")
            remote_cmd="$remote_cmd $escaped_arg"
        fi
    done
    
    log_verbose "Remote command: $remote_cmd"
    
    # Execute command and capture output (no auto-logging to avoid duplication)
    local command_output
    local exit_code
    local ssh_base=$(build_ssh_command)
    
    log_info "Executing command on remote device..."
    
    # Execute without using execute_ssh_command to avoid duplicate logging
    if [ "$PASSWORD_SET" = "true" ]; then
        if command_output=$(sshpass -p "$PASSWORD" $ssh_base "$remote_cmd" 2>&1); then
            exit_code=0
        else
            exit_code=$?
        fi
    else
        if command_output=$($ssh_base "$remote_cmd" 2>&1); then
            exit_code=0
        else
            exit_code=$?
        fi
    fi
    
    # Log the command execution once, cleanly
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] UCI_COMMAND: $COMMAND ${UCI_ARGS[*]}" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] UCI_OUTPUT_START" >> "$LOG_FILE"
    echo "$command_output" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] UCI_OUTPUT_END" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] UCI_EXIT_CODE: $exit_code" >> "$LOG_FILE"
    
    # Display results
    if [ $exit_code -eq 0 ]; then
        log_info "✅ UCI command completed successfully"
    else
        log_error "UCI command failed (exit code: $exit_code)"
    fi
    
    # Display command output to user
    if [ -n "$command_output" ]; then
        echo ""
        echo "=== UCI Command Output ==="
        echo "$command_output"
        echo "=========================="
        echo ""
    fi
    
    return $exit_code
}

function cleanup_remote() {
    log_verbose "Cleaning up remote installation..."
    
    # Clean up prefix installation
    execute_ssh_command "rm -rf $PREFIX/bin/uci-config $PREFIX/lib/uci-config $PREFIX/share/uci-config" >/dev/null 2>&1 || true
    
    # Clean up any remaining temporary files
    execute_ssh_command "rm -rf /tmp/bin /tmp/lib /tmp/etc /tmp/uci-deploy-framework.tar.gz" >/dev/null 2>&1 || true
    
    log_verbose "Remote cleanup completed"
}

# Parse command line arguments
TARGET=""
COMMAND=""
UCI_ARGS=()

# Check for help first
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

# First, extract target and command
TARGET="$1"
shift

if [ $# -eq 0 ]; then
    echo "Error: No command specified"
    echo ""
    show_help
    exit 1
fi

COMMAND="$1"
shift

# Parse remaining arguments - separate UCI args from script options
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
        --prefix)
            PREFIX="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --force)
            CONFIRM=false
            UCI_ARGS+=("$1")  # Pass through to uci-config command
            shift
            ;;
        --no-backup)
            BACKUP=false
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            # All other arguments go to UCI command
            UCI_ARGS+=("$1")
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$TARGET" ]; then
    echo "Error: No target specified"
    show_help
    exit 1
fi

if [ -z "$COMMAND" ]; then
    echo "Error: No command specified"
    show_help
    exit 1
fi

# Main execution
main() {
    # Initialize logging first
    init_logging
    
    # Initialize SSH common with deployment parameters
    ssh_common_init "$TARGET" "$PASSWORD" "$PASSWORD_SET" "$KEY_FILE" "$VERBOSE" "$LOG_FILE"
    
    # Check requirements
    check_requirements
    
    # Test SSH connection
    test_ssh_connection
    
    # Create backup
    local backup_name
    backup_name=$(deploy_create_remote_backup)
    
    # Upload framework
    upload_framework
    
    # Confirm deployment
    confirm_deployment
    
    # Execute UCI command
    local uci_exit_code=0
    if ! execute_uci_command; then
        uci_exit_code=$?
        log_error "UCI command execution failed"
        
        # Cleanup and exit
        cleanup_remote
        log_info "=== Deployment Failed ==="
        exit $uci_exit_code
    fi
    
    # Success cleanup
    cleanup_remote
    
    log_info "=== Deployment Completed Successfully ==="
    log_info "Target: $TARGET_HOST"
    log_info "Command: $COMMAND ${UCI_ARGS[*]}"
    log_info "Log file: $LOG_FILE"
    
    if [ -n "$backup_name" ]; then
        log_info "Backup created: /tmp/${backup_name}.uci"
    fi
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo "📋 Full log available at: $LOG_FILE"
}

# Execute main function
main "$@"