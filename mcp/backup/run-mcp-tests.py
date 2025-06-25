#!/usr/bin/env python3
"""
MCP Test Client
Simple client to run UCI config tool tests through MCP server
"""

import asyncio
import json
import sys
from pathlib import Path

from mcp.client.session import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters

async def run_tests():
    """Run tests through MCP server."""
    
    # Path to the MCP server script
    server_script = Path(__file__).parent / "mcp-test-server.py"
    
    try:
        # Start the MCP server
        server_params = StdioServerParameters(
            command="python3",
            args=[str(server_script)]
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                
                # Initialize the session
                await session.initialize()
                
                print("🚀 MCP Test Server Connected")
                print("=" * 50)
                
                # Check Docker status first
                print("📋 Checking Docker environment...")
                docker_result = await session.call_tool("check_docker_status", {})
                print(docker_result.content[0].text)
                print()
                
                # List available tests
                print("📂 Available test files...")
                list_result = await session.call_tool("list_test_files", {})
                print(list_result.content[0].text)
                print()
                
                # Run all tests
                print("🧪 Running all tests...")
                print("=" * 50)
                test_result = await session.call_tool("run_tests", {
                    "verbose": True,
                    "rebuild": False
                })
                print(test_result.content[0].text)
                
    except Exception as e:
        print(f"❌ Error running MCP tests: {e}")
        sys.exit(1)

async def run_single_test(test_file: str):
    """Run a single test through MCP server."""
    
    server_script = Path(__file__).parent / "mcp-test-server.py"
    
    try:
        server_params = StdioServerParameters(
            command="python3",
            args=[str(server_script)]
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                
                await session.initialize()
                
                print(f"🚀 Running single test: {test_file}")
                print("=" * 50)
                
                test_result = await session.call_tool("run_single_test", {
                    "test_file": test_file,
                    "verbose": True
                })
                print(test_result.content[0].text)
                
    except Exception as e:
        print(f"❌ Error running single test: {e}")
        sys.exit(1)

async def build_image():
    """Build Docker image through MCP server."""
    
    server_script = Path(__file__).parent / "mcp-test-server.py"
    
    try:
        server_params = StdioServerParameters(
            command="python3",
            args=[str(server_script)]
        )
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                
                await session.initialize()
                
                print("🔨 Building Docker test image...")
                print("=" * 50)
                
                build_result = await session.call_tool("build_test_image", {
                    "force": "--force" in sys.argv
                })
                print(build_result.content[0].text)
                
    except Exception as e:
        print(f"❌ Error building image: {e}")
        sys.exit(1)

def show_help():
    """Show usage help."""
    print("""
🧪 UCI Config Tool MCP Test Runner

Usage:
  python3 run-mcp-tests.py [command] [options]

Commands:
  test                    Run all tests (default)
  test <file.lua>        Run specific test file
  build                  Build Docker test image
  build --force          Force rebuild Docker image
  help                   Show this help

Examples:
  python3 run-mcp-tests.py                           # Run all tests
  python3 run-mcp-tests.py test test_uci_config.lua  # Run specific test
  python3 run-mcp-tests.py build                     # Build image
  python3 run-mcp-tests.py build --force             # Force rebuild

The MCP server will:
  ✅ Check Docker environment availability
  ✅ Build OpenWRT test containers
  ✅ Run tests in isolated environment
  ✅ Provide detailed test results
  ✅ Handle service restart testing safely
""")

async def main():
    """Main entry point."""
    args = sys.argv[1:]
    
    if not args or args[0] == "test":
        if len(args) > 1:
            # Run specific test
            await run_single_test(args[1])
        else:
            # Run all tests
            await run_tests()
    elif args[0] == "build":
        await build_image()
    elif args[0] == "help" or args[0] == "--help" or args[0] == "-h":
        show_help()
    else:
        print(f"❌ Unknown command: {args[0]}")
        print("Run 'python3 run-mcp-tests.py help' for usage information")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())