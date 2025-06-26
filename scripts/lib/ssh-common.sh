#!/bin/bash

# SSH Common Library - Shared functionality for UCI Config Tool scripts
# Provides SSH operations, target detection, logging, and file transfer utilities

# Global variables for SSH operations
TARGET_TYPE=""
TARGET_HOST=""
TARGET_USER=""
TARGET_PORT=""
SSH_PASSWORD=""
SSH_PASSWORD_SET=false
SSH_KEY_FILE=""
VERBOSE=false
LOG_FILE=""

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

function log_info() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
    if [ -n "$LOG_FILE" ]; then
        echo "$message" | tee -a "$LOG_FILE" >&2
    else
        echo "🔧 $*" >&2
    fi
}

function log_error() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*"
    if [ -n "$LOG_FILE" ]; then
        echo "❌ $message" | tee -a "$LOG_FILE" >&2
    else
        echo "❌ $*" >&2
    fi
}

function log_verbose() {
    if [ "$VERBOSE" = "true" ]; then
        local message="[$(date '+%Y-%m-%d %H:%M:%S')] VERBOSE: $*"
        if [ -n "$LOG_FILE" ]; then
            echo "$message" | tee -a "$LOG_FILE" >&2
        else
            echo "$*" >&2
        fi
    fi
}

function log_command() {
    local command="$1"
    local result="$2"
    if [ -n "$LOG_FILE" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] CMD: $command" >> "$LOG_FILE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] RESULT: $result" >> "$LOG_FILE"
    fi
}

function error_exit() {
    log_error "$*"
    exit 1
}

# =============================================================================
# TARGET DETECTION AND PARSING
# =============================================================================

function detect_target_type() {
    local target="$1"
    log_verbose "Detecting target type for: $target"
    
    # Check if target is an IP address
    if [[ $target =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_verbose "Target is IP address"
        TARGET_TYPE="ip"
        TARGET_HOST="$target"
        TARGET_USER="root"
        TARGET_PORT="22"
        return 0
    fi
    
    # Check if target is a device profile
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    local profile_file="$script_dir/../test/targets/${target}.json"
    if [ -f "$profile_file" ]; then
        log_verbose "Target is device profile: $profile_file"
        TARGET_TYPE="profile"
        
        # Parse profile for connection details
        TARGET_HOST=$(grep -o '"host"[[:space:]]*:[[:space:]]*"[^"]*"' "$profile_file" | cut -d'"' -f4)
        TARGET_USER=$(grep -o '"username"[[:space:]]*:[[:space:]]*"[^"]*"' "$profile_file" | cut -d'"' -f4 || echo "root")
        TARGET_PORT=$(grep -o '"port"[[:space:]]*:[[:space:]]*[0-9]*' "$profile_file" | grep -o '[0-9]*' || echo "22")
        
        if [ -z "$TARGET_HOST" ]; then
            error_exit "Could not parse host from profile: $profile_file"
        fi
        
        log_verbose "Profile parsed - Host: $TARGET_HOST, User: $TARGET_USER, Port: $TARGET_PORT"
        return 0
    fi
    
    error_exit "Unknown target type: $target (not an IP address or valid profile)"
}

# =============================================================================
# SSH COMMAND BUILDING
# =============================================================================

function build_ssh_command() {
    local ssh_cmd="ssh"
    local ssh_opts="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
    
    # Add port if not default
    if [ "$TARGET_PORT" != "22" ]; then
        ssh_opts="$ssh_opts -p $TARGET_PORT"
    fi
    
    # Add key file if specified
    if [ -n "$SSH_KEY_FILE" ]; then
        ssh_opts="$ssh_opts -i $SSH_KEY_FILE"
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
    if [ -n "$SSH_KEY_FILE" ]; then
        scp_opts="$scp_opts -i $SSH_KEY_FILE"
    fi
    
    echo "$scp_cmd $scp_opts"
}

# =============================================================================
# SSH OPERATIONS
# =============================================================================

function execute_ssh_command() {
    local command="$1"
    local ssh_base=$(build_ssh_command)
    local full_command
    
    if [ "$SSH_PASSWORD_SET" = "true" ]; then
        full_command="sshpass -p '$SSH_PASSWORD' $ssh_base '$command'"
        log_verbose "Executing SSH command with password: $command"
    else
        full_command="$ssh_base '$command'"
        log_verbose "Executing SSH command with key: $command"
    fi
    
    # Execute and capture result
    local output
    local exit_code
    
    if [ "$SSH_PASSWORD_SET" = "true" ]; then
        output=$(sshpass -p "$SSH_PASSWORD" $ssh_base "$command" 2>&1)
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
            error_exit "SSH connection test failed - unexpected response: $test_result"
        fi
    else
        error_exit "SSH connection test failed"
    fi
}

# =============================================================================
# FILE TRANSFER OPERATIONS
# =============================================================================

function upload_via_tar_ssh() {
    local local_archive="$1"
    local remote_path="$2"
    local archive_name=$(basename "$local_archive")
    
    log_verbose "Uploading $archive_name via tar over SSH..."
    local ssh_base=$(build_ssh_command)
    
    if [ "$SSH_PASSWORD_SET" = "true" ]; then
        if ! cat "$local_archive" | sshpass -p "$SSH_PASSWORD" $ssh_base "cat > $remote_path/$archive_name"; then
            return 1
        fi
    else
        if ! cat "$local_archive" | $ssh_base "cat > $remote_path/$archive_name"; then
            return 1
        fi
    fi
    
    return 0
}

function create_and_upload_archive() {
    local source_dirs="$1"
    local archive_name="$2"
    local remote_path="$3"
    local script_dir="$4"
    
    local local_archive="/tmp/$archive_name"
    
    log_verbose "Creating archive: $archive_name"
    if ! tar -czf "$local_archive" -C "$script_dir" $source_dirs 2>/dev/null; then
        rm -f "$local_archive"
        return 1
    fi
    
    if ! upload_via_tar_ssh "$local_archive" "$remote_path"; then
        rm -f "$local_archive"
        return 1
    fi
    
    rm -f "$local_archive"
    return 0
}

# =============================================================================
# REQUIREMENTS CHECKING
# =============================================================================

function check_ssh_requirements() {
    log_verbose "Checking SSH requirements..."
    
    # Check sshpass for password authentication
    if [ "$SSH_PASSWORD_SET" = "true" ] && ! command -v sshpass &> /dev/null; then
        error_exit "sshpass is required for password authentication. Please install sshpass."
    fi
    
    # Check if key file exists when specified
    if [ -n "$SSH_KEY_FILE" ] && [ ! -f "$SSH_KEY_FILE" ]; then
        error_exit "SSH key file not found: $SSH_KEY_FILE"
    fi
    
    log_verbose "SSH requirements check passed"
}

function check_node_requirements() {
    # Check Node.js for MCP
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is required for test runner. Please install Node.js."
    fi
    
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    
    # Check if MCP dependencies are installed
    if [ ! -d "$script_dir/../mcp/node_modules" ]; then
        log_info "Installing MCP dependencies..."
        cd "$script_dir/../mcp"
        npm install
        cd - > /dev/null
    fi
}

function check_docker_requirements() {
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is required for Docker tests. Please install Docker."
    fi
}

# =============================================================================
# INITIALIZATION FUNCTIONS
# =============================================================================

function ssh_common_init() {
    local target="$1"
    local password="$2"
    local password_set="$3"
    local key_file="$4"
    local verbose="$5"
    local log_file="$6"
    
    # Set global variables
    SSH_PASSWORD="$password"
    SSH_PASSWORD_SET="$password_set"
    SSH_KEY_FILE="$key_file"
    VERBOSE="$verbose"
    LOG_FILE="$log_file"
    
    # Detect target type and set connection details
    detect_target_type "$target"
    
    # Check SSH requirements
    check_ssh_requirements
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

function cleanup_remote_files() {
    local cleanup_paths="$1"
    log_verbose "Cleaning up remote temporary files..."
    
    execute_ssh_command "rm -rf $cleanup_paths" >/dev/null 2>&1 || true
    
    log_verbose "Remote cleanup completed"
}

function create_remote_backup() {
    local backup_name="$1"
    log_info "Creating remote configuration backup..."
    
    local backup_result
    if backup_result=$(execute_ssh_command "uci export > /tmp/${backup_name}.uci && echo 'BACKUP_SUCCESS'"); then
        if [[ "$backup_result" == *"BACKUP_SUCCESS"* ]]; then
            log_info "✅ Configuration backup created: /tmp/${backup_name}.uci"
            echo "$backup_name"
            return 0
        else
            error_exit "Backup creation failed: $backup_result"
        fi
    else
        error_exit "Failed to create configuration backup"
    fi
}

# =============================================================================
# EXPORT FUNCTIONS FOR SOURCING SCRIPTS
# =============================================================================

# This function can be called by scripts to verify the library is loaded
function ssh_common_loaded() {
    return 0
}