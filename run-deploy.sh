#!/bin/bash

# UCI Config Tool Remote Deployment Script
# Deploy UCI configuration operations to remote OpenWRT devices

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default configuration
DEFAULT_TARGET=""
DEFAULT_COMMAND=""
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
    LOG_FILE="$SCRIPT_DIR/logs/deploy-${timestamp}-${target_safe}.log"
    
    # Ensure logs directory exists
    mkdir -p "$SCRIPT_DIR/logs"
    
    # Create log file
    touch "$LOG_FILE"
    
    log_info "=== UCI Config Deployment Started ==="
    log_info "Timestamp: $(date)"
    log_info "Target: $TARGET"
    log_info "Command: $COMMAND"
    log_info "Arguments: ${UCI_ARGS[*]}"
    log_info "Log file: $LOG_FILE"
    log_info "======================================="
}

# Logging functions
function log_info() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
    echo "$message" | tee -a "$LOG_FILE" >&2
}

function log_error() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*"
    echo "❌ $message" | tee -a "$LOG_FILE" >&2
}

function log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        local message="[$(date '+%Y-%m-%d %H:%M:%S')] VERBOSE: $*"
        echo "$message" | tee -a "$LOG_FILE" >&2
    fi
}

function log_command() {
    local command="$1"
    local result="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] CMD: $command" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] RESULT: $result" >> "$LOG_FILE"
}

function error() {
    log_error "$*"
    log_info "=== Deployment Failed ==="
    exit 1
}

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
    echo "  --verbose           Enable verbose output"
    echo "  --no-confirm        Skip confirmation prompts"
    echo "  --no-backup         Skip automatic backup"
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
    echo "Logs are saved to: logs/deploy-TIMESTAMP-TARGET.log"
}

function check_requirements() {
    log_verbose "Checking deployment requirements..."
    
    # Check if UCI config tool exists
    if [ ! -f "$SCRIPT_DIR/bin/uci-config" ]; then
        error "UCI config tool not found at $SCRIPT_DIR/bin/uci-config"
    fi
    
    # Check sshpass for password authentication
    if [ "$PASSWORD_SET" = "true" ] && ! command -v sshpass &> /dev/null; then
        error "sshpass is required for password authentication. Please install sshpass."
    fi
    
    # Check if key file exists when specified
    if [ -n "$KEY_FILE" ] && [ ! -f "$KEY_FILE" ]; then
        error "SSH key file not found: $KEY_FILE"
    fi
    
    log_verbose "Requirements check passed"
}

function detect_target_type() {
    log_verbose "Detecting target type for: $TARGET"
    
    # Check if target is an IP address
    if [[ $TARGET =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_verbose "Target is IP address"
        TARGET_TYPE="ip"
        TARGET_HOST="$TARGET"
        TARGET_USER="root"
        TARGET_PORT="22"
        return 0
    fi
    
    # Check if target is a device profile
    local profile_file="$SCRIPT_DIR/test/targets/${TARGET}.json"
    if [ -f "$profile_file" ]; then
        log_verbose "Target is device profile: $profile_file"
        TARGET_TYPE="profile"
        
        # Parse profile for connection details
        TARGET_HOST=$(grep -o '"host"[[:space:]]*:[[:space:]]*"[^"]*"' "$profile_file" | cut -d'"' -f4)
        TARGET_USER=$(grep -o '"username"[[:space:]]*:[[:space:]]*"[^"]*"' "$profile_file" | cut -d'"' -f4 || echo "root")
        TARGET_PORT=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' "$profile_file" | grep -o '[0-9]*' || echo "22")
        
        if [ -z "$TARGET_HOST" ]; then
            error "Could not parse host from profile: $profile_file"
        fi
        
        log_verbose "Profile parsed - Host: $TARGET_HOST, User: $TARGET_USER, Port: $TARGET_PORT"
        return 0
    fi
    
    error "Unknown target type: $TARGET (not an IP address or valid profile)"
}

function build_ssh_command() {
    local ssh_cmd="ssh"
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
    
    # Add port if not default
    if [ "$TARGET_PORT" != "22" ]; then
        ssh_opts="$ssh_opts -p $TARGET_PORT"
    fi
    
    # Add key file if specified
    if [ -n "$KEY_FILE" ]; then
        ssh_opts="$ssh_opts -i $KEY_FILE"
    fi
    
    echo "$ssh_cmd $ssh_opts $TARGET_USER@$TARGET_HOST"
}

function build_scp_command() {
    local scp_cmd="scp"
    local scp_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
    
    # Add port if not default  
    if [ "$TARGET_PORT" != "22" ]; then
        scp_opts="$scp_opts -P $TARGET_PORT"
    fi
    
    # Add key file if specified
    if [ -n "$KEY_FILE" ]; then
        scp_opts="$scp_opts -i $KEY_FILE"
    fi
    
    echo "$scp_cmd $scp_opts"
}

function execute_ssh_command() {
    local command="$1"
    local ssh_base=$(build_ssh_command)
    local full_command
    
    if [ "$PASSWORD_SET" = "true" ]; then
        full_command="sshpass -p '$PASSWORD' $ssh_base '$command'"
        log_verbose "Executing SSH command with password: $command"
    else
        full_command="$ssh_base '$command'"
        log_verbose "Executing SSH command with key: $command"
    fi
    
    # Execute and capture result
    local output
    local exit_code
    
    if [ "$PASSWORD_SET" = "true" ]; then
        output=$(sshpass -p "$PASSWORD" $ssh_base "$command" 2>&1)
        exit_code=$?
    else
        output=$($ssh_base "$command" 2>&1)
        exit_code=$?
    fi
    
    log_command "$command" "$output"
    
    if [ $exit_code -eq 0 ]; then
        log_verbose "SSH command succeeded"
        echo "$output"
        return 0
    else
        log_error "SSH command failed (exit code: $exit_code): $command"
        log_error "Output: $output"
        return $exit_code
    fi
}

function test_ssh_connection() {
    log_info "Testing SSH connection to $TARGET_HOST..."
    
    local test_result
    if test_result=$(execute_ssh_command "echo 'SSH_CONNECTION_OK'"); then
        if [[ "$test_result" == *"SSH_CONNECTION_OK"* ]]; then
            log_info "✅ SSH connection successful"
            return 0
        else
            error "SSH connection test failed - unexpected response: $test_result"
        fi
    else
        error "SSH connection test failed"
    fi
}

function create_remote_backup() {
    if [ "$BACKUP" = "false" ]; then
        log_verbose "Skipping backup (--no-backup specified)"
        return 0
    fi
    
    log_info "Creating remote configuration backup..."
    
    local backup_name="deploy-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_result
    
    if backup_result=$(execute_ssh_command "uci export > /tmp/${backup_name}.uci && echo 'BACKUP_SUCCESS'"); then
        if [[ "$backup_result" == *"BACKUP_SUCCESS"* ]]; then
            log_info "✅ Configuration backup created: /tmp/${backup_name}.uci"
            echo "$backup_name"
            return 0
        else
            error "Backup creation failed: $backup_result"
        fi
    else
        error "Failed to create configuration backup"
    fi
}

function upload_framework() {
    log_info "Uploading UCI config framework..."
    
    # Create temporary archive
    local archive_name="uci-deploy-framework.tar.gz"
    local local_archive="/tmp/$archive_name"
    
    log_verbose "Creating framework archive..."
    if ! tar -czf "$local_archive" -C "$SCRIPT_DIR" bin/ lib/ etc/ 2>/dev/null; then
        error "Failed to create framework archive"
    fi
    
    # Upload archive using tar over SSH (OpenWRT compatible)
    log_verbose "Uploading framework via tar over SSH..."
    local ssh_base=$(build_ssh_command)
    
    if [ "$PASSWORD_SET" = "true" ]; then
        if ! cat "$local_archive" | sshpass -p "$PASSWORD" $ssh_base "cat > /tmp/$archive_name"; then
            rm -f "$local_archive"
            error "Failed to upload framework archive via SSH"
        fi
    else
        if ! cat "$local_archive" | $ssh_base "cat > /tmp/$archive_name"; then
            rm -f "$local_archive"
            error "Failed to upload framework archive via SSH"
        fi
    fi
    
    # Extract and setup on remote
    log_verbose "Setting up framework on remote device..."
    local setup_commands=(
        "cd /tmp && tar -xzf $archive_name"
        "chmod +x /tmp/bin/uci-config"
        "mkdir -p /app/bin /app/etc/config"
        "ln -sf /tmp/bin/uci-config /app/bin/uci-config"
        "ln -sf /tmp/lib /app/lib"
        "ln -sf /tmp/etc /app/etc"
        "rm -f /tmp/$archive_name"
    )
    
    for cmd in "${setup_commands[@]}"; do
        if ! execute_ssh_command "$cmd" >/dev/null; then
            rm -f "$local_archive"
            error "Failed to setup framework: $cmd"
        fi
    done
    
    # Cleanup local archive
    rm -f "$local_archive"
    
    log_info "✅ Framework uploaded and configured"
}

function confirm_deployment() {
    if [ "$CONFIRM" = "false" ]; then
        log_verbose "Skipping confirmation (--no-confirm specified)"
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
    
    # Build the remote command
    local remote_cmd="cd /tmp && export PATH=\"/tmp/bin:/usr/sbin:/usr/bin:/sbin:/bin\" && export LUA_PATH='./lib/?.lua' && uci-config $COMMAND"
    
    # Add UCI arguments
    for arg in "${UCI_ARGS[@]}"; do
        # Escape arguments properly
        local escaped_arg=$(printf '%q' "$arg")
        remote_cmd="$remote_cmd $escaped_arg"
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
    log_verbose "Cleaning up remote temporary files..."
    
    execute_ssh_command "rm -rf /tmp/bin /tmp/lib /tmp/etc /app/bin/uci-config /app/lib /app/etc" >/dev/null 2>&1 || true
    
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
        --verbose)
            VERBOSE=true
            shift
            ;;
        --no-confirm)
            CONFIRM=false
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
    
    # Detect target type and connection details
    detect_target_type
    
    # Check requirements
    check_requirements
    
    # Test SSH connection
    test_ssh_connection
    
    # Create backup
    local backup_name
    backup_name=$(create_remote_backup)
    
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