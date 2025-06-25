#!/bin/bash
set -e

echo "🚀 Setting up MCP Test Environment for UCI Config Tool"
echo "=" * 60

# Check if we're in the right directory
if [[ ! -f "bin/uci-config" ]]; then
    echo "❌ Error: Please run this script from the UCI config tool root directory"
    exit 1
fi

# Install Python MCP dependencies
echo "📦 Installing MCP dependencies..."
if command -v pip3 &> /dev/null; then
    pip3 install -r requirements.txt
elif command -v pip &> /dev/null; then
    pip install -r requirements.txt
else
    echo "❌ Error: pip/pip3 not found. Please install Python pip first."
    exit 1
fi

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x mcp-test-server.py
chmod +x run-mcp-tests.py
chmod +x setup-mcp-tests.sh

# Check Docker availability
echo "🐳 Checking Docker environment..."
if ! command -v docker &> /dev/null; then
    echo "⚠️  Warning: Docker not found. Please install Docker to run tests."
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "⚠️  Warning: Docker Compose not found. Please install Docker Compose to run tests."
fi

echo ""
echo "✅ MCP Test Environment Setup Complete!"
echo ""
echo "Usage:"
echo "  python3 run-mcp-tests.py                     # Run all tests"
echo "  python3 run-mcp-tests.py test <file.lua>     # Run specific test"
echo "  python3 run-mcp-tests.py build               # Build test image"
echo "  python3 run-mcp-tests.py help                # Show help"
echo ""
echo "The MCP server provides safe dockerized testing with:"
echo "  ✅ OpenWRT 23.05 environment"
echo "  ✅ Service restart testing"
echo "  ✅ Isolated test execution"
echo "  ✅ Comprehensive test reporting"