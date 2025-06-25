#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

class UCIConfigMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'uci-config-test-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'run_tests',
            description: 'Run all UCI config tool tests in dockerized OpenWRT environment',
            inputSchema: {
              type: 'object',
              properties: {
                verbose: {
                  type: 'boolean',
                  description: 'Enable verbose test output',
                  default: false,
                },
                rebuild: {
                  type: 'boolean', 
                  description: 'Force rebuild of Docker image',
                  default: false,
                },
                specific_test: {
                  type: 'string',
                  description: 'Run specific test file',
                },
              },
            },
          },
          {
            name: 'run_single_test',
            description: 'Run a single test file',
            inputSchema: {
              type: 'object',
              properties: {
                test_file: {
                  type: 'string',
                  description: 'Test file to run (e.g., test_uci_config.lua)',
                },
                verbose: {
                  type: 'boolean',
                  description: 'Enable verbose output',
                  default: false,
                },
              },
              required: ['test_file'],
            },
          },
          {
            name: 'build_test_image',
            description: 'Build or rebuild the Docker test image',
            inputSchema: {
              type: 'object',
              properties: {
                force: {
                  type: 'boolean',
                  description: 'Force rebuild without using cache',
                  default: false,
                },
              },
            },
          },
          {
            name: 'list_test_files',
            description: 'List available test files',
            inputSchema: {
              type: 'object',
            },
          },
          {
            name: 'check_docker_status',
            description: 'Check Docker and Docker Compose availability',
            inputSchema: {
              type: 'object',
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'run_tests':
            return await this.runTests(args);
          case 'run_single_test':
            return await this.runSingleTest(args);
          case 'build_test_image':
            return await this.buildTestImage(args);
          case 'list_test_files':
            return await this.listTestFiles(args);
          case 'check_docker_status':
            return await this.checkDockerStatus(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          returncode: code,
          stdout,
          stderr,
        });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  async checkDockerStatus(args) {
    try {
      const dockerResult = await this.runCommand('docker', ['--version']);
      
      if (dockerResult.returncode !== 0) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ Docker not available\n\nPlease install Docker to run tests.',
            },
          ],
        };
      }

      const composeResult = await this.runCommand('docker', ['compose', 'version']);
      
      const output = `✅ Docker Environment Ready

Docker: ${dockerResult.stdout.trim()}
Docker Compose: ${composeResult.stdout.trim()}

Repository: ${REPO_ROOT}
Test Directory: ${path.join(REPO_ROOT, 'test')}
Dockerfile: ${path.join(REPO_ROOT, 'Dockerfile')}`;

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Docker check failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async listTestFiles(args) {
    try {
      const testDir = path.join(REPO_ROOT, 'test');
      const files = await fs.readdir(testDir);
      const testFiles = files.filter(file => file.startsWith('test_') && file.endsWith('.lua'));

      if (testFiles.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No test files found in test/ directory',
            },
          ],
        };
      }

      const fileList = testFiles.map(file => `  - ${file}`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Available test files:\n${fileList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing test files: ${error.message}`,
          },
        ],
      };
    }
  }

  async buildTestImage(args) {
    try {
      const force = args?.force || false;
      const buildArgs = ['build', '-t', 'uci-config-test'];
      
      if (force) {
        buildArgs.push('--no-cache');
      }
      
      buildArgs.push('.');

      const result = await this.runCommand('docker', buildArgs);

      if (result.returncode === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ Docker image built successfully\n\n${result.stdout}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Docker build failed\n\n${result.stderr}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Build failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async runTests(args) {
    try {
      const verbose = args?.verbose || false;
      const rebuild = args?.rebuild || false;
      const specificTest = args?.specific_test;

      // Check Docker first
      const dockerCheck = await this.checkDockerStatus({});
      if (dockerCheck.content[0].text.includes('❌')) {
        return dockerCheck;
      }

      // Build image if needed
      if (rebuild) {
        const buildResult = await this.buildTestImage({ force: true });
        if (buildResult.content[0].text.includes('❌')) {
          return buildResult;
        }
      }

      // Run tests
      const runArgs = ['run', '--rm', 'uci-config-test'];
      
      const result = await this.runCommand('docker', runArgs);

      let output = '';
      if (result.returncode === 0) {
        output = `✅ Tests completed successfully\n\n${result.stdout}`;
      } else {
        output = `❌ Tests failed\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Test execution failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async runSingleTest(args) {
    try {
      const testFile = args?.test_file;
      const verbose = args?.verbose || false;

      if (!testFile) {
        throw new Error('test_file parameter is required');
      }

      // Check if test file exists
      const testPath = path.join(REPO_ROOT, 'test', testFile);
      try {
        await fs.access(testPath);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Test file not found: ${testFile}`,
            },
          ],
        };
      }

      // Run single test in Docker
      const runArgs = [
        'run', '--rm', 'uci-config-test',
        'sh', '-c', `lua test/${testFile}`
      ];

      const result = await this.runCommand('docker', runArgs);

      let output = '';
      if (result.returncode === 0) {
        output = `✅ Test '${testFile}' completed successfully\n\n${result.stdout}`;
      } else {
        output = `❌ Test '${testFile}' failed\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Single test execution failed: ${error.message}`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 UCI Config MCP Server running on stdio');
  }
}

const server = new UCIConfigMCPServer();
server.run().catch(console.error);