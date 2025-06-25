#!/bin/bash

# UCI Config Tool Test Runner
# Wrapper script for the Node.js MCP test client

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_CLIENT="$SCRIPT_DIR/mcp/client/run-tests.js"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is required but not installed."
    echo "Please install Node.js to run the MCP test client."
    exit 1
fi

# Check if MCP dependencies are installed
if [ ! -d "$SCRIPT_DIR/mcp/node_modules" ]; then
    echo "📦 Installing MCP dependencies..."
    cd "$SCRIPT_DIR/mcp"
    npm install
    cd - > /dev/null
fi

# Run the MCP test client with all arguments passed through
exec node "$MCP_CLIENT" "$@"