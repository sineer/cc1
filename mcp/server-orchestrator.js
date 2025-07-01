#!/usr/bin/env node

/**
 * Device Orchestration MCP Server
 * Smart configuration management and deployment orchestration for OpenWRT devices
 * Features: Config snapshots, before/after diffs, environment staging, canary deployments
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

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../');

// Debug logging
const DEBUG_LOG = '/tmp/orchestrator-mcp-debug.log';
function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  appendFileSync(DEBUG_LOG, logMessage);
  console.error(`[ORCHESTRATOR] ${message}`);
}

class DeviceOrchestratorServer {
  constructor() {
    this.server = new Server(
      {
        name: 'uci-config-device-orchestrator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.snapshotDir = path.join(REPO_ROOT, 'config-snapshots');
    this.environmentsDir = path.join(REPO_ROOT, 'etc', 'config', 'environments');
    this.targetsDir = path.join(REPO_ROOT, 'test', 'targets');
    this.dashboardDir = path.join(this.snapshotDir, 'dashboard');

    // Initialize engines
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
      debug: true
    });

    this.setupHandlers();
    this.initializeDirectories();
  }

  async initializeDirectories() {
    // Create necessary directories
    const dirs = [
      this.snapshotDir,
      this.environmentsDir,
      this.dashboardDir,
      path.join(this.environmentsDir, 'dev'),
      path.join(this.environmentsDir, 'test'),
      path.join(this.environmentsDir, 'prod'),
      path.join(this.dashboardDir, 'diffs'),
      path.join(this.dashboardDir, 'assets')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        debugLog(`Warning: Could not create directory ${dir}: ${error.message}`);
      }
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'snapshot-device-config',
            description: 'Capture complete device configuration via SSH',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name or IP address'
                },
                label: {
                  type: 'string',
                  description: 'Snapshot label (e.g., pre-deploy, post-deploy)'
                }
              },
              required: ['device']
            }
          },
          {
            name: 'compare-device-configs',
            description: 'Compare two device configuration snapshots',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name'
                },
                before: {
                  type: 'string',
                  description: 'Before snapshot timestamp or label'
                },
                after: {
                  type: 'string',
                  description: 'After snapshot timestamp or label'
                },
                format: {
                  type: 'string',
                  enum: ['text', 'html', 'json'],
                  description: 'Output format for diff'
                }
              },
              required: ['device', 'before', 'after']
            }
          },
          {
            name: 'list-config-history',
            description: 'Show configuration change timeline for a device',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name'
                },
                days: {
                  type: 'number',
                  description: 'Number of days to look back'
                }
              },
              required: ['device']
            }
          },
          {
            name: 'deploy-to-environment',
            description: 'Deploy configuration to specific environment with automatic snapshots',
            inputSchema: {
              type: 'object',
              properties: {
                environment: {
                  type: 'string',
                  enum: ['dev', 'test', 'prod'],
                  description: 'Target environment'
                },
                workflow: {
                  type: 'string',
                  description: 'Deployment workflow (e.g., uspot-setup)'
                },
                devices: {
                  type: 'string',
                  description: 'Comma-separated list of devices or "all"'
                },
                canary: {
                  type: 'boolean',
                  description: 'Use canary deployment (deploy to primary device first)'
                },
                dry_run: {
                  type: 'boolean',
                  description: 'Show what would be deployed without executing'
                }
              },
              required: ['environment', 'workflow']
            }
          },
          {
            name: 'restore-device-config',
            description: 'Restore device to a previous configuration snapshot',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name'
                },
                snapshot: {
                  type: 'string',
                  description: 'Snapshot timestamp or label to restore'
                },
                confirm: {
                  type: 'boolean',
                  description: 'Confirm the restoration'
                }
              },
              required: ['device', 'snapshot']
            }
          },
          {
            name: 'list-devices',
            description: 'Show device inventory and status',
            inputSchema: {
              type: 'object',
              properties: {
                environment: {
                  type: 'string',
                  description: 'Filter by environment'
                },
                status: {
                  type: 'boolean',
                  description: 'Include real-time status check'
                }
              }
            }
          },
          {
            name: 'generate-dashboard',
            description: 'Generate HTML dashboard for configuration management',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name or "all"'
                },
                timeframe: {
                  type: 'string',
                  description: 'Time frame (e.g., 7d, 30d, 3m)'
                }
              }
            }
          },
          {
            name: 'detect-config-drift',
            description: 'Detect configuration drift from baseline',
            inputSchema: {
              type: 'object',
              properties: {
                device: {
                  type: 'string',
                  description: 'Device name or "all"'
                },
                environment: {
                  type: 'string',
                  description: 'Compare against environment baseline'
                }
              }
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      debugLog(`Tool called: ${request.params.name} with args: ${JSON.stringify(request.params.arguments)}`);
      
      try {
        switch (request.params.name) {
          case 'snapshot-device-config':
            return await this.snapshotDeviceConfig(request.params.arguments);
          case 'compare-device-configs':
            return await this.compareDeviceConfigs(request.params.arguments);
          case 'list-config-history':
            return await this.listConfigHistory(request.params.arguments);
          case 'deploy-to-environment':
            return await this.deployToEnvironment(request.params.arguments);
          case 'restore-device-config':
            return await this.restoreDeviceConfig(request.params.arguments);
          case 'list-devices':
            return await this.listDevices(request.params.arguments);
          case 'generate-dashboard':
            return await this.generateDashboard(request.params.arguments);
          case 'detect-config-drift':
            return await this.detectConfigDrift(request.params.arguments);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        debugLog(`Error in ${request.params.name}: ${error.message}`);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  async snapshotDeviceConfig(args) {
    const { device, label = 'manual' } = args;
    
    debugLog(`Taking snapshot of device: ${device} with label: ${label}`);
    
    // Load device profile to get connection info
    const deviceProfile = await this.loadDeviceProfile(device);
    if (!deviceProfile) {
      throw new Error(`Device profile not found for: ${device}`);
    }

    try {
      const result = await this.snapshotEngine.captureSnapshot(deviceProfile, label);
      
      return {
        content: [{
          type: 'text',
          text: `✅ Configuration snapshot captured successfully

Device: ${device}
Snapshot ID: ${result.snapshotId}
Label: ${label}
Timestamp: ${result.metadata.timestamp}
Location: ${result.snapshotPath}

Captured files: ${result.metadata.files_captured.length} files
${result.metadata.errors.length > 0 ? `⚠️  ${result.metadata.errors.length} warnings/errors occurred` : ''}

Use 'compare-device-configs' to see differences between snapshots.
Use 'list-config-history' to see all snapshots for this device.`
        }]
      };

    } catch (error) {
      debugLog(`Snapshot failed: ${error.message}`);
      throw new Error(`Failed to capture device configuration: ${error.message}`);
    }
  }

  async compareDeviceConfigs(args) {
    const { device, before, after, format = 'text' } = args;
    
    debugLog(`Comparing configs for ${device}: ${before} vs ${after}`);
    
    const beforeSnapshot = await this.snapshotEngine.findSnapshot(device, before);
    const afterSnapshot = await this.snapshotEngine.findSnapshot(device, after);
    
    if (!beforeSnapshot || !afterSnapshot) {
      throw new Error('One or both snapshots not found');
    }

    try {
      const diff = await this.diffEngine.generateSnapshotDiff(
        beforeSnapshot.path, 
        afterSnapshot.path, 
        format
      );
      
      return {
        content: [{
          type: 'text',
          text: `🔍 Configuration Diff: ${device}

Before: ${before} (${beforeSnapshot.id})
After:  ${after} (${afterSnapshot.id})

${diff}`
        }]
      };
      
    } catch (error) {
      debugLog(`Diff generation failed: ${error.message}`);
      throw new Error(`Failed to generate configuration diff: ${error.message}`);
    }
  }

  async listConfigHistory(args) {
    const { device, days = 30 } = args;
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const snapshots = await this.snapshotEngine.listSnapshots(device, {
        since: cutoffDate.toISOString()
      });
      
      const historyText = snapshots.map(snapshot => {
        const timestamp = new Date(snapshot.timestamp).toLocaleString();
        const errorIndicator = snapshot.has_errors ? ' ⚠️' : '';
        return `${timestamp} | ${snapshot.label.padEnd(15)} | ${snapshot.id}${errorIndicator}`;
      }).join('\n');
      
      return {
        content: [{
          type: 'text',
          text: `📋 Configuration History: ${device} (last ${days} days)

${snapshots.length} snapshots found:

Timestamp           | Label           | Snapshot ID
${'-'.repeat(70)}
${historyText || 'No snapshots found'}

${snapshots.filter(s => s.has_errors).length > 0 ? '\n⚠️  = Snapshots with warnings/errors' : ''}

Use 'compare-device-configs' to see differences between any two snapshots.
Use 'snapshot-device-config' to capture a new snapshot.`
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to list config history: ${error.message}`);
    }
  }

  async deployToEnvironment(args) {
    const { environment, workflow, devices = 'all', canary = false, dry_run = false } = args;
    
    // Placeholder implementation - will expand this
    debugLog(`Deploying ${workflow} to ${environment} environment`);
    
    return {
      content: [{
        type: 'text',
        text: `🚀 Deployment to ${environment} environment

Workflow: ${workflow}
Devices: ${devices}
Canary mode: ${canary ? 'enabled' : 'disabled'}
Dry run: ${dry_run ? 'enabled' : 'disabled'}

This feature is under development. Use the existing run-deploy.sh for now.`
      }]
    };
  }

  async restoreDeviceConfig(args) {
    const { device, snapshot, confirm = false } = args;
    
    // Placeholder - implement restoration logic
    return {
      content: [{
        type: 'text',
        text: `⚠️  Configuration Restore: ${device}

Target snapshot: ${snapshot}
Confirmed: ${confirm}

This feature is under development. Use manual UCI restore for now.`
      }]
    };
  }

  async listDevices(args) {
    const { environment, status = false } = args;
    
    try {
      const devices = await this.discoverDevices();
      
      let deviceList = 'Available devices:\n\n';
      
      for (const device of devices) {
        deviceList += `📱 ${device.name}\n`;
        deviceList += `   Type: ${device.type}\n`;
        deviceList += `   Host: ${device.host}\n`;
        if (environment) {
          deviceList += `   Environment: ${device.environment || 'not assigned'}\n`;
        }
        if (status) {
          const deviceStatus = await this.checkDeviceStatus(device);
          deviceList += `   Status: ${deviceStatus}\n`;
        }
        deviceList += '\n';
      }
      
      return {
        content: [{
          type: 'text',
          text: deviceList
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to list devices: ${error.message}`);
    }
  }

  async generateDashboard(args) {
    const { device = 'all', timeframe = '7d' } = args;
    
    debugLog(`Generating dashboard for device: ${device}, timeframe: ${timeframe}`);
    
    try {
      let result;
      
      if (device === 'all') {
        // Generate main dashboard with all devices
        const devices = await this.discoverDevices();
        result = await this.dashboardGenerator.generateMainDashboard(devices, timeframe);
        
        return {
          content: [{
            type: 'text',
            text: `📊 Dashboard generated successfully!

Main dashboard created with ${devices.length} devices.

Dashboard location: ${result.path}
View in browser: ${result.url}

The dashboard includes:
- Device overview and status
- Recent activity timeline
- Quick action buttons
- Configuration change history

Open the dashboard in your browser to see:
- Interactive device cards
- Snapshot timelines
- Before/after diff visualizations
- Real-time device status`
          }]
        };
        
      } else {
        // Generate device-specific dashboard
        const snapshots = await this.snapshotEngine.listSnapshots(device);
        result = await this.dashboardGenerator.generateDeviceDashboard(device, snapshots);
        
        return {
          content: [{
            type: 'text',
            text: `📊 Device dashboard generated for ${device}!

Dashboard location: ${result.path}
View in browser: ${result.url}

Device dashboard includes:
- ${snapshots.length} configuration snapshots
- Timeline view of all changes
- Snapshot comparison tools
- Device-specific metrics

Open the dashboard to explore your device's configuration history.`
          }]
        };
      }
      
    } catch (error) {
      debugLog(`Dashboard generation failed: ${error.message}`);
      throw new Error(`Failed to generate dashboard: ${error.message}`);
    }
  }

  async detectConfigDrift(args) {
    // Placeholder - will implement drift detection
    return {
      content: [{
        type: 'text',
        text: `🔍 Configuration drift detection feature coming soon!

Will detect:
- Unauthorized configuration changes
- Drift from environment baselines
- Compliance violations`
      }]
    };
  }

  // Helper methods

  async loadDeviceProfile(deviceName) {
    try {
      const profilePath = path.join(this.targetsDir, `${deviceName}.json`);
      const profileData = await fs.readFile(profilePath, 'utf8');
      return JSON.parse(profileData);
    } catch (error) {
      debugLog(`Could not load device profile for ${deviceName}: ${error.message}`);
      return null;
    }
  }

  async executeSSHCommand(deviceProfile, command) {
    const { connection } = deviceProfile;
    const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${connection.username}@${connection.host} "${command}"`;
    
    debugLog(`Executing SSH command: ${sshCommand}`);
    
    try {
      const result = await execAsync(sshCommand);
      return result;
    } catch (error) {
      debugLog(`SSH command failed: ${error.message}`);
      throw error;
    }
  }

  async getConfigFileList(deviceProfile) {
    try {
      const result = await this.executeSSHCommand(deviceProfile, 'ls /etc/config/');
      return result.stdout.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      debugLog(`Could not get config file list: ${error.message}`);
      return ['network', 'firewall', 'dhcp', 'system']; // fallback to common files
    }
  }

  async captureSystemInfo(deviceProfile) {
    try {
      const commands = {
        uptime: 'uptime',
        memory: 'free',
        disk: 'df -h',
        kernel: 'uname -a',
        openwrt_version: 'cat /etc/openwrt_release'
      };

      const systemInfo = {};
      
      for (const [key, command] of Object.entries(commands)) {
        try {
          const result = await this.executeSSHCommand(deviceProfile, command);
          systemInfo[key] = result.stdout;
        } catch (error) {
          systemInfo[key] = `Error: ${error.message}`;
        }
      }
      
      return systemInfo;
    } catch (error) {
      debugLog(`Could not capture system info: ${error.message}`);
      return {};
    }
  }

  async findSnapshot(device, identifier) {
    const deviceSnapshotDir = path.join(this.snapshotDir, device);
    
    try {
      const snapshots = await fs.readdir(deviceSnapshotDir);
      
      for (const snapshotDir of snapshots) {
        const metadataPath = path.join(deviceSnapshotDir, snapshotDir, 'metadata.json');
        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          
          if (snapshotDir.includes(identifier) || 
              metadata.label === identifier || 
              metadata.snapshot_id === identifier) {
            return {
              path: path.join(deviceSnapshotDir, snapshotDir),
              snapshotId: metadata.snapshot_id,
              metadata
            };
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      debugLog(`Could not find snapshot: ${error.message}`);
      return null;
    }
  }

  async generateConfigDiff(beforeSnapshot, afterSnapshot, format) {
    // Placeholder for diff generation - will implement sophisticated diff engine
    return `Configuration diff between snapshots:

Before: ${beforeSnapshot.snapshotId}
After:  ${afterSnapshot.snapshotId}

[Diff engine implementation coming next...]`;
  }

  async discoverDevices() {
    try {
      const targetFiles = await fs.readdir(this.targetsDir);
      const devices = [];
      
      for (const file of targetFiles) {
        if (file.endsWith('.json') && file !== 'environments.json') {
          try {
            const deviceProfile = JSON.parse(
              await fs.readFile(path.join(this.targetsDir, file), 'utf8')
            );
            
            devices.push({
              name: file.replace('.json', ''),
              type: deviceProfile.device_type || 'unknown',
              host: deviceProfile.connection?.host || 'unknown',
              profile: deviceProfile
            });
          } catch (error) {
            debugLog(`Could not load device profile ${file}: ${error.message}`);
          }
        }
      }
      
      return devices;
    } catch (error) {
      debugLog(`Could not discover devices: ${error.message}`);
      return [];
    }
  }

  async checkDeviceStatus(device) {
    try {
      const result = await this.executeSSHCommand(device.profile, 'echo "ping"');
      return result.stdout.includes('ping') ? '🟢 online' : '🔴 offline';
    } catch (error) {
      return '🔴 offline';
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    debugLog('Device Orchestrator MCP Server started');
    console.error('Device Orchestrator MCP Server running on stdio');
  }
}

const server = new DeviceOrchestratorServer();
server.run().catch(console.error);