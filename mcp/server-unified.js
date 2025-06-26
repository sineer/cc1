#!/usr/bin/env node

/**
 * Unified MCP Test Server
 * Intelligent test runner that handles both Docker and remote device testing
 * Drastically simplified from 2,468 lines to ~400 lines
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../');

class UnifiedTestServer {
  constructor() {
    this.server = new Server(
      {
        name: 'uci-config-unified-test-server',
        version: '2.0.0',
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
        tools: [{
          name: 'test',
          description: 'Run UCI config tests on Docker or remote targets',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                description: 'Target: docker (default), IP address, or profile name (gl, openwrt, etc)',
                default: 'docker',
              },
              test: {
                type: 'string',
                description: 'Test file name or "all" to run all tests',
                default: 'all',
              },
              password: {
                type: 'string',
                description: 'SSH password for remote targets (empty string for no password)',
              },
              keyFile: {
                type: 'string',
                description: 'SSH key file path for remote targets',
              },
              verbose: {
                type: 'boolean',
                description: 'Enable verbose output',
                default: false,
              },
              dryRun: {
                type: 'boolean',
                description: 'Perform dry run without making changes',
                default: false,
              },
              rebuild: {
                type: 'boolean',
                description: 'Force rebuild Docker image (Docker mode only)',
                default: false,
              },
            },
          },
        }],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name !== 'test') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await this.runTest(args || {});
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  /**
   * Main test execution function - routes to Docker or remote based on target
   */
  async runTest(args) {
    const target = args.target || 'docker';
    const test = args.test || 'all';
    
    // Determine execution mode
    if (target === 'docker' || target === '') {
      return await this.runDockerTest(test, args);
    } else {
      return await this.runRemoteTest(target, test, args);
    }
  }

  /**
   * Docker test execution - simple and direct
   */
  async runDockerTest(test, options) {
    try {
      // Check Docker availability
      try {
        await execAsync('docker --version');
      } catch {
        return this.formatError('Docker is required but not installed');
      }

      // Build image if needed or requested
      if (options.rebuild || !(await this.dockerImageExists())) {
        const buildResult = await this.buildDockerImage(options.rebuild);
        if (!buildResult.success) {
          return this.formatError(`Docker build failed: ${buildResult.error}`);
        }
      }

      // Run tests
      let cmd;
      if (test === 'all') {
        cmd = 'docker run --rm uci-config-test';
      } else {
        // Validate test file exists
        const testPath = path.join(REPO_ROOT, 'test', test);
        try {
          await fs.access(testPath);
        } catch {
          return this.formatError(`Test file not found: ${test}`);
        }
        cmd = `docker run --rm uci-config-test sh -c "lua test/${test}"`;
      }

      const result = await this.execute(cmd);
      
      const output = result.success
        ? `✅ Docker tests completed successfully\n\n${result.stdout}`
        : `❌ Docker tests failed\n\n${result.stdout}\n\nErrors:\n${result.stderr}`;

      return this.formatResult(output);
    } catch (error) {
      return this.formatError(`Docker test execution failed: ${error.message}`);
    }
  }

  /**
   * Remote test execution - simplified SSH approach
   */
  async runRemoteTest(target, test, options) {
    try {
      // Load target profile
      const profile = await this.loadProfile(target);
      
      // Setup SSH authentication
      const ssh = this.setupSSH(profile, options);
      
      // Validate connectivity
      const connectTest = await ssh.exec('echo "SSH_OK"');
      if (!connectTest.success || !connectTest.stdout.includes('SSH_OK')) {
        return this.formatError(`Cannot connect to ${target}: ${connectTest.stderr}`);
      }

      let output = `🎯 Testing on remote target: ${target}\n`;
      output += `Host: ${profile.connection.host}\n`;
      output += `User: ${profile.connection.username || 'root'}\n\n`;

      // Create backup if not dry run
      if (!options.dryRun) {
        output += '💾 Creating configuration backup...\n';
        const backupResult = await ssh.exec('uci export > /tmp/test-backup.uci');
        if (!backupResult.success) {
          return this.formatError(`Backup failed: ${backupResult.stderr}`);
        }
      }

      try {
        // Upload test framework
        output += '📤 Uploading test framework...\n';
        await ssh.exec('mkdir -p /tmp/uci-tests/lib /tmp/uci-tests/test');
        
        // Upload necessary files
        const filesToUpload = [
          { local: 'lib/uci_merge_engine.lua', remote: '/tmp/uci-tests/lib/' },
          { local: 'lib/test_utils.lua', remote: '/tmp/uci-tests/lib/' },
          { local: 'lib/list_deduplicator.lua', remote: '/tmp/uci-tests/lib/' },
          { local: 'lib/fs_utils.lua', remote: '/tmp/uci-tests/lib/' },
          { local: 'test/luaunit_fixed.lua', remote: '/tmp/uci-tests/test/' },
          { local: `test/${test}`, remote: '/tmp/uci-tests/test/' },
          { local: 'test/etc', remote: '/tmp/uci-tests/test/' },
        ];

        for (const file of filesToUpload) {
          const uploadResult = await ssh.upload(file.local, file.remote);
          if (!uploadResult.success) {
            throw new Error(`Failed to upload ${file.local}: ${uploadResult.stderr}`);
          }
        }

        // Run test
        output += `\n🧪 Running test: ${test}\n`;
        const testCmd = `cd /tmp/uci-tests && LUA_PATH='./lib/?.lua;./test/?.lua' lua test/${test}`;
        const testResult = await ssh.exec(testCmd);
        
        output += testResult.stdout;
        if (!testResult.success) {
          output += `\n❌ Test failed:\n${testResult.stderr}`;
        } else {
          output += '\n✅ Test completed successfully';
        }

        // Cleanup
        await ssh.exec('rm -rf /tmp/uci-tests');

      } catch (error) {
        // Restore on error if not dry run
        if (!options.dryRun) {
          output += '\n🔄 Restoring configuration...\n';
          await ssh.exec('uci import < /tmp/test-backup.uci && uci commit');
        }
        throw error;
      }

      return this.formatResult(output);
    } catch (error) {
      return this.formatError(`Remote test failed: ${error.message}`);
    }
  }

  /**
   * Load target profile - handles JSON files and direct IPs
   */
  async loadProfile(target) {
    // Check if it's an IP address
    if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
      return {
        name: `Direct IP (${target})`,
        connection: {
          host: target,
          username: 'root',
          port: 22,
        },
      };
    }

    // Try to load profile JSON
    try {
      const profilePath = path.join(REPO_ROOT, 'targets', `${target}.json`);
      const profileData = await fs.readFile(profilePath, 'utf8');
      return JSON.parse(profileData);
    } catch (error) {
      throw new Error(`Cannot load profile '${target}': ${error.message}`);
    }
  }

  /**
   * Setup SSH commands with authentication
   */
  setupSSH(profile, options) {
    const host = `${profile.connection.username || 'root'}@${profile.connection.host}`;
    const port = profile.connection.port || 22;
    const sshBaseArgs = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port}`;
    const scpBaseArgs = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${port}`;
    
    let sshCmd, scpCmd;
    
    if (options.password !== undefined) {
      // Password authentication (including empty password)
      sshCmd = `sshpass -p '${options.password}' ssh ${sshBaseArgs}`;
      scpCmd = `sshpass -p '${options.password}' scp -O ${scpBaseArgs}`;
    } else if (options.keyFile || profile.connection.key_file) {
      // Key file authentication
      const keyFile = options.keyFile || profile.connection.key_file;
      sshCmd = `ssh -i ${keyFile} ${sshBaseArgs}`;
      scpCmd = `scp -i ${keyFile} -O ${scpBaseArgs}`;
    } else {
      // Default key authentication
      sshCmd = `ssh ${sshBaseArgs}`;
      scpCmd = `scp -O ${scpBaseArgs}`;
    }

    return {
      exec: async (cmd) => this.execute(`${sshCmd} ${host} "${cmd}"`),
      upload: async (local, remote) => {
        const localPath = path.join(REPO_ROOT, local);
        return this.execute(`${scpCmd} -r "${localPath}" ${host}:"${remote}"`);
      },
    };
  }

  /**
   * Execute shell command
   */
  async execute(cmd) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      return { success: true, stdout, stderr };
    } catch (error) {
      return { 
        success: false, 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message,
        code: error.code || 1,
      };
    }
  }

  /**
   * Check if Docker image exists
   */
  async dockerImageExists() {
    const result = await this.execute('docker image inspect uci-config-test');
    return result.success;
  }

  /**
   * Build Docker image
   */
  async buildDockerImage(force = false) {
    const cmd = force 
      ? 'docker build --no-cache -t uci-config-test .'
      : 'docker build -t uci-config-test .';
    
    process.stderr.write('🔨 Building Docker image...\n');
    const result = await this.execute(cmd);
    
    if (result.success) {
      process.stderr.write('✅ Docker image built successfully\n');
    }
    
    return result;
  }

  /**
   * Format successful result
   */
  formatResult(text) {
    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  }

  /**
   * Format error result
   */
  formatError(message) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error: ${message}`,
      }],
    };
  }

  /**
   * Start the server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 Unified UCI Config Test Server running');
  }
}

// Start server
const server = new UnifiedTestServer();
server.run().catch(console.error);