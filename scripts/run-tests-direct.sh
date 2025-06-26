#!/bin/bash

# UCI Config Tool Direct Test Runner
# Bypasses MCP and runs tests directly with Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is required but not installed."
    echo "Please install Docker to run tests."
    exit 1
fi

function show_help() {
    echo "🧪 UCI Config Tool Direct Test Runner"
    echo ""
    echo "Usage:"
    echo "  ./run-tests-direct.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  test                    Run all tests (default)"
    echo "  test <file.lua>        Run specific test file"
    echo "  build                  Build Docker test image"
    echo "  build --force          Force rebuild Docker image"
    echo "  help                   Show this help"
    echo ""
    echo "Examples:"
    echo "  ./run-tests-direct.sh                           # Run all tests"
    echo "  ./run-tests-direct.sh test test_uci_config.lua  # Run specific test"
    echo "  ./run-tests-direct.sh build                     # Build image"
    echo "  ./run-tests-direct.sh build --force             # Force rebuild"
}

function build_image() {
    local force=${1:-false}
    echo "🔨 Building Docker test image..."
    echo "=" "repeat" "50"
    
    if [ "$force" = "true" ]; then
        docker build --no-cache -t uci-config-test .
    else
        docker build -t uci-config-test .
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ Docker image built successfully"
    else
        echo "❌ Docker build failed"
        exit 1
    fi
}

function run_all_tests() {
    echo "🧪 Running all tests..."
    echo "=" "repeat" "50"
    
    # Check if image exists
    if ! docker image inspect uci-config-test >/dev/null 2>&1; then
        echo "📦 Docker image not found, building..."
        build_image
    fi
    
    docker run --rm uci-config-test
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ All tests completed successfully"
    else
        echo "❌ Some tests failed (exit code: $exit_code)"
    fi
    
    return $exit_code
}

function run_single_test() {
    local test_file="$1"
    echo "🧪 Running single test: $test_file"
    echo "=" "repeat" "50"
    
    # Check if test file exists
    if [ ! -f "test/$test_file" ]; then
        echo "❌ Test file not found: $test_file"
        exit 1
    fi
    
    # Check if image exists
    if ! docker image inspect uci-config-test >/dev/null 2>&1; then
        echo "📦 Docker image not found, building..."
        build_image
    fi
    
    docker run --rm uci-config-test sh -c "lua test/$test_file"
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ Test '$test_file' completed successfully"
    else
        echo "❌ Test '$test_file' failed"
    fi
    
    return $exit_code
}

# Parse command line arguments
command=${1:-test}
shift || true

case "$command" in
    "test")
        if [ $# -gt 0 ] && [[ ! "$1" =~ ^-- ]]; then
            # Run specific test
            run_single_test "$1"
        else
            # Run all tests
            run_all_tests
        fi
        ;;
    "build")
        force=false
        if [ "$1" = "--force" ]; then
            force=true
        fi
        build_image "$force"
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $command"
        echo "Run './run-tests-direct.sh help' for usage information"
        exit 1
        ;;
esac