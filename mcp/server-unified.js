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
import { ConfigSnapshotEngine } from './lib/config-snapshot.js';
import { ConfigDiffEngine } from './lib/config-differ.js';
import { DashboardGenerator } from './lib/dashboard-generator.js';
import { SSHManager } from './lib/ssh-manager.js';
import { CommandRunner } from './lib/command-runner.js';
import { DemoOrchestrator } from './lib/demo-orchestrator.js';
import { ResponseFormatter } from './lib/response-formatter.js';
import { ProfileManager } from './lib/profile-manager.js';

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
        name: 'uci-config-unified-server',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize orchestration engines
    this.snapshotDir = path.join(REPO_ROOT, 'config-snapshots');
    this.dashboardDir = path.join(this.snapshotDir, 'dashboard');
    
    this.snapshotEngine = new ConfigSnapshotEngine({
      snapshotDir: this.snapshotDir,
      debug: true
    });
    
    this.diffEngine = new ConfigDiffEngine({
      debug: true,
      colorOutput: true
    });

    this.dashboardGenerator = new DashboardGenerator({
      dashboardDir: this.dashboardDir,
      debug: true,
      snapshotEngine: this.snapshotEngine,
      diffEngine: this.diffEngine
    });

    this.sshManager = new SSHManager({
      debug: true,
      repoRoot: REPO_ROOT,
      timeout: 30000
    });

    this.commandRunner = new CommandRunner({
      debug: true,
      repoRoot: REPO_ROOT,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    this.demoOrchestrator = new DemoOrchestrator({
      snapshotEngine: this.snapshotEngine,
      diffEngine: this.diffEngine,
      dashboardGenerator: this.dashboardGenerator,
      sshManager: this.sshManager,
      commandRunner: this.commandRunner,
      debug: true
    });

    this.responseFormatter = new ResponseFormatter({
      includeTimestamp: false,
      debug: true
    });

    this.profileManager = new ProfileManager({
      debug: true,
      repoRoot: REPO_ROOT,
      sshManager: this.sshManager
    });

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
          },
          {
            name: 'snapshot',
            description: 'Capture device configuration snapshot via SSH',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device profile name (qemu, gl, openwrt) or IP address',
                  default: 'qemu',
                },
                label: {
                  type: 'string',
                  description: 'Snapshot label for identification',
                  default: 'manual',
                },
                password: {
                  type: 'string',
                  description: 'SSH password (empty string for no password)',
                },
                keyFile: {
                  type: 'string',
                  description: 'SSH key file path',
                },
              },
              required: ['device'],
            },
          },
          {
            name: 'compare',
            description: 'Compare two device configuration snapshots',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name or profile',
                  default: 'qemu',
                },
                before: {
                  type: 'string',
                  description: 'Before snapshot ID or label',
                },
                after: {
                  type: 'string',
                  description: 'After snapshot ID or label',
                },
                format: {
                  type: 'string',
                  description: 'Output format: text, html, json',
                  default: 'text',
                },
              },
              required: ['device', 'before', 'after'],
            },
          },
          {
            name: 'dashboard',
            description: 'Generate interactive HTML dashboard for device configuration timeline',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name (default: all devices)',
                  default: 'all',
                },
                days: {
                  type: 'number',
                  description: 'Number of days to include in timeline',
                  default: 7,
                },
              },
            },
          },
          {
            name: 'demo',
            description: 'Run complete deployment demo workflows',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Demo type: ubispot, cowboy',
                  default: 'ubispot',
                },
                host: {
                  type: 'string',
                  description: 'Target device IP or profile',
                  default: '192.168.11.2',
                },
                deploy: {
                  type: 'boolean',
                  description: 'Enable actual deployment (false for analysis only)',
                  default: true,
                },
                target: {
                  type: 'string',
                  description: 'Target configuration (default, gl-mt3000, qemu-armv8)',
                  default: 'default',
                },
                mode: {
                  type: 'string',
                  description: 'Deployment mode (safe-merge, merge, validate)',
                  default: 'safe-merge',
                },
                password: {
                  type: 'string',
                  description: 'SSH password (empty string for no password)',
                },
              },
              required: ['type'],
            },
          },
          {
            name: 'history',
            description: 'Show device configuration history and snapshots',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name or profile',
                  default: 'qemu',
                },
                days: {
                  type: 'number',
                  description: 'Number of days to show',
                  default: 7,
                },
              },
              required: ['device'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'test':
            return await this.runTest(args || {});
          case 'snapshot':
            return await this.runSnapshot(args || {});
          case 'compare':
            return await this.runCompare(args || {});
          case 'dashboard':
            return await this.runDashboard(args || {});
          case 'demo':
            return await this.runDemo(args || {});
          case 'history':
            return await this.runHistory(args || {});
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
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
        const tarCmd = `cd ${REPO_ROOT} && tar -czf /tmp/${archiveName} bin/ lib/ test/ etc/`;
        
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
   * Load target profile - delegates to SSHManager
   */
  async loadProfile(target) {
    return this.sshManager.loadProfile(target);
  }

  /**
   * Setup SSH commands with authentication - delegates to SSHManager
   */
  setupSSH(profile, options) {
    return this.sshManager.setupSSH(profile, options);
  }

  /**
   * Execute shell command - delegates to CommandRunner
   */
  async execute(cmd) {
    return this.commandRunner.execute(cmd);
  }

  /**
   * Check if Docker image exists - delegates to CommandRunner
   */
  async dockerImageExists() {
    return this.commandRunner.dockerImageExists('uci-config-test');
  }

  /**
   * Build Docker image - delegates to CommandRunner
   */
  async buildDockerImage(force = false) {
    process.stderr.write('🔨 Building Docker image...\n');
    
    const result = await this.commandRunner.buildDockerImage('uci-config-test', '.', {
      timeout: 300000, // 5 minutes
      extraArgs: force ? '--no-cache' : ''
    });
    
    if (result.success) {
      process.stderr.write('✅ Docker image built successfully\n');
    }
    
    return result;
  }

  /**
   * Format successful result
   */
  formatResult(text) {
    return this.responseFormatter.formatResult(text);
  }

  /**
   * Format error result
   */
  formatError(message) {
    return this.responseFormatter.formatError(message);
  }

  /**
   * Take device configuration snapshot
   */
  async runSnapshot(args) {
    const { device = 'qemu', label = 'manual', password, keyFile } = args;
    
    try {
      // Load device profile
      const deviceProfile = await this.loadDeviceProfile(device, password, keyFile);
      
      // Capture snapshot
      const result = await this.snapshotEngine.captureSnapshot(deviceProfile, label);
      
      return this.formatResult(`✅ Configuration snapshot captured successfully

Device: ${device}
Snapshot ID: ${result.snapshotId}
Label: ${label}
Timestamp: ${result.metadata.timestamp}
Location: ${result.snapshotPath}

Captured files: ${result.metadata.files_captured.length} files

${result.metadata.errors.length > 0 ? 
  `⚠️ Warnings: ${result.metadata.errors.length} files had issues` : ''}

Use 'compare' tool to see differences between snapshots.
Use 'history' tool to see all snapshots for this device.`);
      
    } catch (error) {
      return this.formatError(`Snapshot failed: ${error.message}`);
    }
  }

  /**
   * Compare device configuration snapshots
   */
  async runCompare(args) {
    const { device = 'qemu', before, after, format = 'text' } = args;
    
    if (!before || !after) {
      return this.formatError('Both before and after snapshot IDs are required');
    }
    
    try {
      // Find snapshots
      const deviceName = this.getDeviceName(device);
      const beforeSnapshot = await this.snapshotEngine.findSnapshot(deviceName, before);
      const afterSnapshot = await this.snapshotEngine.findSnapshot(deviceName, after);
      
      if (!beforeSnapshot) {
        return this.formatError(`Before snapshot not found: ${before}`);
      }
      if (!afterSnapshot) {
        return this.formatError(`After snapshot not found: ${after}`);
      }
      
      // Generate diff
      const diff = await this.diffEngine.generateSnapshotDiff(
        beforeSnapshot.path,
        afterSnapshot.path,
        format
      );
      
      return this.formatResult(`🔍 Configuration Diff: ${deviceName}

Before: ${before} (${beforeSnapshot.id})
After:  ${after} (${afterSnapshot.id})

${diff}`);
      
    } catch (error) {
      return this.formatError(`Comparison failed: ${error.message}`);
    }
  }

  /**
   * Generate interactive HTML dashboard
   */
  async runDashboard(args) {
    const { device = 'all', days = 7 } = args;
    
    try {
      let dashboardUrl;
      
      if (device === 'all') {
        // Generate overview dashboard
        dashboardUrl = await this.dashboardGenerator.generateOverviewDashboard(days);
      } else {
        // Generate device-specific dashboard
        const deviceName = this.getDeviceName(device);
        dashboardUrl = await this.dashboardGenerator.generateDeviceDashboard(deviceName, days);
      }
      
      return this.formatResult(`📊 Dashboard generated for ${device}!

Dashboard location: ${dashboardUrl}
View in browser: file://${dashboardUrl}

${device === 'all' ? 'Overview dashboard' : 'Device dashboard'} includes:
- ${device === 'all' ? 'All devices' : 'Device-specific'} configuration snapshots
- Timeline view of all changes
- Snapshot comparison tools
- ${device === 'all' ? 'Multi-device' : 'Device-specific'} metrics

Open the dashboard to explore your ${device === 'all' ? 'infrastructure' : 'device'}'s configuration history.`);
      
    } catch (error) {
      return this.formatError(`Dashboard generation failed: ${error.message}`);
    }
  }

  /**
   * Run complete deployment demo workflows - delegates to DemoOrchestrator
   */
  async runDemo(args) {
    return this.demoOrchestrator.runDemo(args);
  }

  /**
   * Show device configuration history
   */
  async runHistory(args) {
    const { device = 'qemu', days = 7 } = args;
    
    try {
      const deviceName = this.getDeviceName(device);
      const snapshots = await this.snapshotEngine.listSnapshots(deviceName, {
        since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      });
      
      if (snapshots.length === 0) {
        return this.formatResult(`📋 No snapshots found for ${deviceName} in the last ${days} days.

Use 'snapshot' tool to create your first snapshot.`);
      }
      
      let output = `📋 Configuration history for ${deviceName} (last ${days} days):

Total snapshots: ${snapshots.length}

Timeline:`;
      
      for (const snapshot of snapshots.slice(0, 10)) { // Show latest 10
        const date = new Date(snapshot.timestamp).toLocaleString();
        const status = snapshot.has_errors ? '⚠️' : '✅';
        output += `\n  ${status} ${snapshot.label} - ${date} (${snapshot.files_count} files)`;
      }
      
      if (snapshots.length > 10) {
        output += `\n  ... and ${snapshots.length - 10} more snapshots`;
      }
      
      output += `\n\nUse 'compare' tool to see differences between snapshots.
Use 'dashboard' tool to explore the interactive timeline.`;
      
      return this.formatResult(output);
      
    } catch (error) {
      return this.formatError(`History lookup failed: ${error.message}`);
    }
  }

  /**
   * Load device profile with authentication - delegates to ProfileManager
   */
  async loadDeviceProfile(device, password, keyFile) {
    return this.profileManager.loadDeviceProfile(device, password, keyFile);
  }

  /**
   * Get device name from profile or device identifier - delegates to ProfileManager
   */
  getDeviceName(device) {
    return this.profileManager.getDeviceName(device);
  }

  /**
   * Start the server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🚀 Unified UCI Config Server with Orchestration running');
  }
}

// Start server
const server = new UnifiedTestServer();
server.run().catch(console.error);