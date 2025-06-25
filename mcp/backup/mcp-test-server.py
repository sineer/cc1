#!/usr/bin/env python3
"""
MCP Server for UCI Config Tool Testing
Provides tools to run dockerized tests in OpenWRT environment
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequest,
    CallToolResult,
    ListToolsRequest,
    ListToolsResult,
    Resource,
    TextContent,
    Tool,
)

# MCP Server instance
server = Server("uci-config-test-server")

# Repository root directory
REPO_ROOT = Path(__file__).parent
TEST_SCRIPT = REPO_ROOT / "test" / "run-tests.sh"
DOCKER_COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"

@server.list_tools()
async def list_tools() -> List[Tool]:
    """List available testing tools."""
    return [
        Tool(
            name="run_tests",
            description="Run all UCI config tool tests in dockerized OpenWRT environment",
            inputSchema={
                "type": "object",
                "properties": {
                    "verbose": {
                        "type": "boolean",
                        "description": "Enable verbose test output",
                        "default": False
                    },
                    "specific_test": {
                        "type": "string",
                        "description": "Run a specific test file (e.g., 'test_uci_config.lua')",
                        "default": None
                    },
                    "rebuild": {
                        "type": "boolean", 
                        "description": "Force rebuild of Docker image",
                        "default": False
                    }
                }
            }
        ),
        Tool(
            name="run_single_test",
            description="Run a single test file in the dockerized environment",
            inputSchema={
                "type": "object",
                "properties": {
                    "test_file": {
                        "type": "string",
                        "description": "Test file to run (e.g., 'test_uci_config.lua')",
                    },
                    "verbose": {
                        "type": "boolean",
                        "description": "Enable verbose output",
                        "default": False
                    }
                },
                "required": ["test_file"]
            }
        ),
        Tool(
            name="build_test_image",
            description="Build or rebuild the Docker test image",
            inputSchema={
                "type": "object", 
                "properties": {
                    "force": {
                        "type": "boolean",
                        "description": "Force rebuild without using cache",
                        "default": False
                    }
                }
            }
        ),
        Tool(
            name="list_test_files",
            description="List available test files",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="check_docker_status",
            description="Check Docker and Docker Compose availability",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> CallToolResult:
    """Handle tool calls."""
    
    if name == "run_tests":
        return await run_tests(arguments)
    elif name == "run_single_test":
        return await run_single_test(arguments)
    elif name == "build_test_image":
        return await build_test_image(arguments)
    elif name == "list_test_files":
        return await list_test_files(arguments)
    elif name == "check_docker_status":
        return await check_docker_status(arguments)
    else:
        raise ValueError(f"Unknown tool: {name}")

async def run_tests(arguments: Dict[str, Any]) -> CallToolResult:
    """Run all tests or a specific test."""
    try:
        verbose = arguments.get("verbose", False)
        specific_test = arguments.get("specific_test")
        rebuild = arguments.get("rebuild", False)
        
        # Change to repository root
        os.chdir(REPO_ROOT)
        
        # Check if Docker is available
        docker_check = await check_docker_availability()
        if not docker_check["available"]:
            return CallToolResult(
                content=[TextContent(
                    type="text",
                    text=f"Docker not available: {docker_check['error']}"
                )]
            )
        
        # Build image if needed or requested
        if rebuild:
            build_result = await build_image(force=rebuild)
            if not build_result["success"]:
                return CallToolResult(
                    content=[TextContent(
                        type="text", 
                        text=f"Failed to build Docker image: {build_result['error']}"
                    )]
                )
        
        # Prepare command
        if specific_test:
            # Run specific test
            cmd = [
                "docker", "compose", "run", "--rm", "lua-test",
                "sh", "-c", f"echo '=== Running {specific_test} ===' && lua test/{specific_test}"
            ]
        else:
            # Run all tests using the test script
            cmd = ["./test/run-tests.sh"]
        
        # Execute tests
        result = await run_command(cmd, verbose=verbose)
        
        # Parse results
        output = result["stdout"] + result["stderr"]
        success = result["returncode"] == 0
        
        # Format output
        status = "✅ PASSED" if success else "❌ FAILED"
        formatted_output = f"""
{status} - UCI Config Tool Tests

Return Code: {result['returncode']}

=== TEST OUTPUT ===
{output}

=== SUMMARY ===
Tests {'completed successfully' if success else 'failed'}
        """.strip()
        
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=formatted_output
            )]
        )
        
    except Exception as e:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error running tests: {str(e)}"
            )]
        )

async def run_single_test(arguments: Dict[str, Any]) -> CallToolResult:
    """Run a single test file."""
    try:
        test_file = arguments["test_file"]
        verbose = arguments.get("verbose", False)
        
        # Validate test file exists
        test_path = REPO_ROOT / "test" / test_file
        if not test_path.exists():
            return CallToolResult(
                content=[TextContent(
                    type="text",
                    text=f"Test file not found: {test_file}"
                )]
            )
        
        # Run the specific test
        return await run_tests({
            "verbose": verbose,
            "specific_test": test_file,
            "rebuild": False
        })
        
    except Exception as e:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error running single test: {str(e)}"
            )]
        )

async def build_test_image(arguments: Dict[str, Any]) -> CallToolResult:
    """Build the Docker test image."""
    try:
        force = arguments.get("force", False)
        
        os.chdir(REPO_ROOT)
        
        # Check Docker availability
        docker_check = await check_docker_availability()
        if not docker_check["available"]:
            return CallToolResult(
                content=[TextContent(
                    type="text",
                    text=f"Docker not available: {docker_check['error']}"
                )]
            )
        
        # Build command
        cmd = ["docker", "compose", "build"]
        if force:
            cmd.append("--no-cache")
        
        result = await run_command(cmd, verbose=True)
        
        if result["returncode"] == 0:
            status = "✅ Build successful"
        else:
            status = "❌ Build failed"
        
        output = f"""
{status}

=== BUILD OUTPUT ===
{result['stdout']}
{result['stderr']}
        """.strip()
        
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=output
            )]
        )
        
    except Exception as e:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error building image: {str(e)}"
            )]
        )

async def list_test_files(arguments: Dict[str, Any]) -> CallToolResult:
    """List available test files."""
    try:
        test_dir = REPO_ROOT / "test"
        test_files = []
        
        if test_dir.exists():
            for file in test_dir.glob("test_*.lua"):
                test_files.append(file.name)
        
        if test_files:
            file_list = "\n".join(f"  - {file}" for file in sorted(test_files))
            output = f"Available test files:\n{file_list}"
        else:
            output = "No test files found in test/ directory"
        
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=output
            )]
        )
        
    except Exception as e:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error listing test files: {str(e)}"
            )]
        )

async def check_docker_status(arguments: Dict[str, Any]) -> CallToolResult:
    """Check Docker and Docker Compose status."""
    try:
        docker_check = await check_docker_availability()
        
        if docker_check["available"]:
            # Get Docker info
            docker_result = await run_command(["docker", "--version"])
            compose_result = await run_command(["docker", "compose", "version"])
            
            output = f"""
✅ Docker Environment Ready

Docker: {docker_result['stdout'].strip()}
Docker Compose: {compose_result['stdout'].strip()}

Repository: {REPO_ROOT}
Test Script: {TEST_SCRIPT}
Docker Compose File: {DOCKER_COMPOSE_FILE}
            """.strip()
        else:
            output = f"""
❌ Docker Environment Not Available

Error: {docker_check['error']}

Please ensure Docker and Docker Compose are installed and running.
            """.strip()
        
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=output
            )]
        )
        
    except Exception as e:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=f"Error checking Docker status: {str(e)}"
            )]
        )

# Helper functions

async def check_docker_availability() -> Dict[str, Any]:
    """Check if Docker and Docker Compose are available."""
    try:
        # Check Docker
        docker_result = await run_command(["docker", "--version"])
        if docker_result["returncode"] != 0:
            return {"available": False, "error": "Docker not found"}
        
        # Check Docker Compose
        compose_result = await run_command(["docker", "compose", "version"])
        if compose_result["returncode"] != 0:
            return {"available": False, "error": "Docker Compose not found"}
        
        return {"available": True}
        
    except Exception as e:
        return {"available": False, "error": str(e)}

async def build_image(force: bool = False) -> Dict[str, Any]:
    """Build the Docker image."""
    try:
        cmd = ["docker", "compose", "build"]
        if force:
            cmd.append("--no-cache")
        
        result = await run_command(cmd)
        return {
            "success": result["returncode"] == 0,
            "output": result["stdout"] + result["stderr"],
            "error": None if result["returncode"] == 0 else "Build failed"
        }
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}

async def run_command(cmd: List[str], verbose: bool = False) -> Dict[str, Any]:
    """Run a command and return the result."""
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=REPO_ROOT
        )
        
        stdout, stderr = await process.communicate()
        
        return {
            "returncode": process.returncode,
            "stdout": stdout.decode("utf-8"),
            "stderr": stderr.decode("utf-8")
        }
    except Exception as e:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": f"Command execution failed: {str(e)}"
        }

async def main():
    """Main entry point for the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        init_options = server.create_initialization_options()
        await server.run(
            read_stream,
            write_stream,
            init_options
        )

if __name__ == "__main__":
    asyncio.run(main())