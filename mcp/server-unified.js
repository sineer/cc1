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
import { appendFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../');

// Debug logging
const DEBUG_LOG = '/tmp/unified-mcp-debug.log';
function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  appendFileSync(DEBUG_LOG, logMessage);
  console.error(`[DEBUG] ${message}`);
}

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
      debugLog(`Starting remote test execution: target=${target}, test=${test}`);
      debugLog(`Options: ${JSON.stringify(options)}`);
      
      // Clear previous debug log
      writeFileSync(DEBUG_LOG, `=== UNIFIED MCP RUNNER DEBUG LOG ===\nStarted: ${new Date().toISOString()}\n\n`);
      
      // Load target profile
      debugLog('Loading target profile...');
      const profile = await this.loadProfile(target);
      debugLog(`Profile loaded: ${JSON.stringify(profile, null, 2)}`);
      
      // Setup SSH authentication
      debugLog('Setting up SSH authentication...');
      const ssh = this.setupSSH(profile, options);
      debugLog('SSH setup complete');
      
      // Validate connectivity
      debugLog('Testing SSH connectivity...');
      const connectTest = await ssh.exec('echo "SSH_OK"');
      debugLog(`SSH test result: ${JSON.stringify(connectTest)}`);
      if (!connectTest.success || !connectTest.stdout.includes('SSH_OK')) {
        return this.formatError(`Cannot connect to ${target}: ${connectTest.stderr}`);
      }

      let output = `🎯 Testing on remote target: ${target}\n`;
      output += `Host: ${profile.connection.host}\n`;
      output += `User: ${profile.connection.username || 'root'}\n\n`;

      // Create backup if not dry run
      if (!options.dryRun) {
        debugLog('Creating configuration backup...');
        output += '💾 Creating configuration backup...\n';
        const backupResult = await ssh.exec('uci export > /tmp/test-backup.uci');
        debugLog(`Backup result: ${JSON.stringify(backupResult)}`);
        if (!backupResult.success) {
          return this.formatError(`Backup failed: ${backupResult.stderr}`);
        }
      } else {
        debugLog('Skipping backup (dry run mode)');
      }

      try {
        // Upload test framework using optimized tar approach
        output += '📤 Uploading test framework...\n';
        debugLog('Starting framework upload...');
        
        // Create tar archive locally with proper directory structure
        const archiveName = 'uci-test-framework.tar.gz';
        const tarCmd = `cd ${REPO_ROOT} && tar -czf /tmp/${archiveName} bin/ lib/ test/`;
        
        // Create archive locally
        debugLog('Creating archive...');
        debugLog(`Tar command: ${tarCmd}`);
        const createArchive = await this.execute(tarCmd);
        debugLog(`Archive creation result: ${JSON.stringify(createArchive)}`);
        if (!createArchive.success) {
          throw new Error(`Failed to create archive: ${createArchive.stderr}`);
        }
        debugLog('Archive created successfully');
        
        // Upload single archive  
        debugLog('Uploading archive...');
        const localArchivePath = `/tmp/${archiveName}`;
        debugLog(`Local archive path: ${localArchivePath}`);
        const uploadResult = await ssh.upload(localArchivePath, `/tmp/${archiveName}`);
        debugLog(`Upload result: ${JSON.stringify(uploadResult)}`);
        if (!uploadResult.success) {
          throw new Error(`Failed to upload archive: ${uploadResult.stderr}`);
        }
        debugLog('Archive uploaded successfully');
        
        // Extract archive on remote
        debugLog('Extracting archive on remote...');
        const extractResult = await ssh.exec(`cd /tmp && tar -xzf ${archiveName} && rm ${archiveName}`);
        debugLog(`Extract result: ${JSON.stringify(extractResult)}`);
        if (!extractResult.success) {
          throw new Error(`Failed to extract archive: ${extractResult.stderr}`);
        }
        debugLog('Archive extracted successfully');
        
        // Clean up local archive
        const cleanupResult = await this.execute(`rm -f /tmp/${archiveName}`);
        debugLog(`Local cleanup result: ${JSON.stringify(cleanupResult)}`);

        // Make uci-config executable and set up environment
        debugLog('Setting up executables and symlinks...');
        const chmodResult = await ssh.exec('chmod +x /tmp/bin/uci-config');
        debugLog(`Chmod result: ${JSON.stringify(chmodResult)}`);
        
        // Create symlinks to fix hardcoded /app paths
        const symlinkResult1 = await ssh.exec('mkdir -p /app/bin && ln -sf /tmp/bin/uci-config /app/bin/uci-config');
        debugLog(`Symlink 1 result: ${JSON.stringify(symlinkResult1)}`);
        const symlinkResult2 = await ssh.exec('mkdir -p /app && ln -sf /tmp/lib /app/lib');
        debugLog(`Symlink 2 result: ${JSON.stringify(symlinkResult2)}`);
        
        // Create missing /app/etc/config/default directory and copy real test configs
        debugLog('Creating missing directories and copying test configs...');
        const createConfigDirs = await ssh.exec('mkdir -p /app/etc/config/default');
        debugLog(`Config dirs result: ${JSON.stringify(createConfigDirs)}`);
        
        // Copy actual test config files from archive to /app/etc/config/default
        const copyTestConfigs = await ssh.exec('cp /tmp/test/etc/existing/* /app/etc/config/default/ 2>/dev/null && cp /tmp/test/etc/uspot/* /app/etc/config/default/ 2>/dev/null && echo "config uspot" > /app/etc/config/default/uspot 2>/dev/null || echo "Copied available configs"');
        debugLog(`Copy test configs result: ${JSON.stringify(copyTestConfigs)}`);
        
        debugLog('Setup complete, starting test execution...');

        // Run test
        output += `\n🧪 Running test: ${test}\n`;
        debugLog('Preparing test command...');
        let testCmd;
        if (test === 'all') {
          // Run all tests sequentially with proper environment
          testCmd = `cd /tmp && export PATH="/tmp/bin:/usr/sbin:/usr/bin:/sbin:/bin" && export LUA_PATH='./lib/?.lua;./test/?.lua' && echo '=== UCI CONFIG TESTS ===' && lua test/test_uci_config.lua && echo '=== MERGE ENGINE TESTS ===' && lua test/test_merge_engine.lua && echo '=== ADVANCED INTEGRATION TESTS ===' && lua test/test_advanced_integration.lua && echo '=== PRODUCTION DEPLOYMENT TESTS ===' && lua test/test_production_deployment.lua`;
        } else {
          testCmd = `cd /tmp && export PATH="/tmp/bin:/usr/sbin:/usr/bin:/sbin:/bin" && export LUA_PATH='./lib/?.lua;./test/?.lua' && lua test/${test}`;
        }
        
        debugLog(`Test command: ${testCmd}`);
        debugLog('Executing test command...');
        const testResult = await ssh.exec(testCmd);
        debugLog(`Test execution result: ${JSON.stringify({
          success: testResult.success,
          stdoutLength: testResult.stdout?.length || 0,
          stderrLength: testResult.stderr?.length || 0,
          code: testResult.code
        })}`);
        debugLog('Test execution completed');
        
        // Log complete test output for debugging (no truncation)
        if (testResult.stdout) {
          debugLog(`Test stdout (full): ${testResult.stdout}`);
        }
        if (testResult.stderr) {
          debugLog(`Test stderr (full): ${testResult.stderr}`);
        }
        
        output += testResult.stdout;
        if (!testResult.success) {
          output += `\n❌ Test failed:\n${testResult.stderr}`;
        } else {
          output += '\n✅ Test completed successfully';
        }

        // Cleanup
        debugLog('Cleaning up...');
        const cleanupFinalResult = await ssh.exec('rm -rf /tmp/bin /tmp/lib /tmp/test');
        debugLog(`Final cleanup result: ${JSON.stringify(cleanupFinalResult)}`);
        debugLog('Cleanup completed');

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
        // Handle absolute paths vs relative paths
        const localPath = path.isAbsolute(local) ? local : path.join(REPO_ROOT, local);
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