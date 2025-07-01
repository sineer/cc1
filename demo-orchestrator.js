#!/usr/bin/env node

/**
 * Demo client for UCI Device Orchestrator
 * Quick and dirty client to demonstrate the orchestration workflow
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OrchestratorDemo {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const serverPath = path.join(__dirname, 'mcp', 'server-orchestrator.js');
        this.serverProcess = spawn('node', [serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: __dirname,
        });

        let buffer = '';
        
        this.serverProcess.stdout.on('data', (data) => {
          buffer += data.toString();
          
          const lines = buffer.split('\n');
          buffer = lines.pop();
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                this.handleResponse(message);
              } catch (error) {
                // Ignore non-JSON lines
              }
            }
          }
        });

        this.serverProcess.stderr.on('data', (data) => {
          const message = data.toString();
          console.error(message);
          if (message.includes('Device Orchestrator MCP Server running')) {
            resolve();
          }
        });

        this.serverProcess.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  handleResponse(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'Unknown error'));
      } else {
        resolve(message.result);
      }
    }
  }

  async sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async callTool(name, args) {
    return await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  async disconnect() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
  }

  // Demo workflow methods
  async takeSnapshot(device, label) {
    console.log(`\n📸 Taking snapshot of ${device} with label: ${label}`);
    const result = await this.callTool('snapshot-device-config', { device, label });
    console.log(result.content[0].text);
    return result;
  }

  async deployConfiguration(host, mode = 'safe-merge', target = 'default') {
    console.log(`\n🚀 Deploying configuration using UCI deployment framework`);
    console.log(`Mode: ${mode}, Target: ${target}, Host: ${host}`);
    
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const deployScript = spawn('./scripts/run-deploy.sh', [
        host, mode, '--target', target, '--no-confirm', '--password', ''
      ], {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      deployScript.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Deployment completed successfully');
          resolve({ success: true, exitCode: code });
        } else {
          console.log(`\n⚠️ Deployment completed with warnings (exit code: ${code})`);
          resolve({ success: false, exitCode: code });
        }
      });

      deployScript.on('error', (error) => {
        console.error(`\n❌ Deployment error: ${error.message}`);
        reject(error);
      });
    });
  }

  async listDevices() {
    console.log('\n📱 Listing available devices...');
    const result = await this.callTool('list-devices', { status: true });
    console.log(result.content[0].text);
    return result;
  }

  async listHistory(device) {
    console.log(`\n📋 Configuration history for ${device}...`);
    const result = await this.callTool('list-config-history', { device, days: 7 });
    console.log(result.content[0].text);
    return result;
  }

  async compareConfigs(device, before, after) {
    console.log(`\n🔍 Comparing configurations: ${before} → ${after}`);
    const result = await this.callTool('compare-device-configs', { 
      device, before, after, format: 'text' 
    });
    console.log(result.content[0].text);
    return result;
  }

  async generateDashboard(device = 'all') {
    console.log(`\n📊 Generating dashboard for ${device}...`);
    const result = await this.callTool('generate-dashboard', { device });
    console.log(result.content[0].text);
    return result;
  }

  // Comprehensive deployment demo workflow
  async runDeploymentDemo(options = {}) {
    const {
      device = 'qemu',
      deviceName = 'QEMU OpenWRT VM',
      host = '192.168.11.2',
      target = 'default',
      mode = 'safe-merge',
      deployEnabled = true
    } = options;

    console.log('\n🔧 UCI Configuration Deployment Demo');
    console.log('====================================');
    
    if (deployEnabled) {
      console.log(`\nDeployment Mode: ENABLED`);
      console.log(`Target: ${target}, Mode: ${mode}, Host: ${host}`);
      console.log('\nWorkflow:');
      console.log('1. Take pre-deployment snapshot');
      console.log('2. Deploy configuration using scripts/run-deploy.sh');
      console.log('3. Capture post-deployment snapshot');
      console.log('4. Generate intelligent diff analysis');
      console.log('5. Update interactive dashboard');
    } else {
      console.log(`\nAnalysis Mode: DEPLOYMENT DISABLED`);
      console.log('\nWorkflow:');
      console.log('1. Take current configuration snapshot');
      console.log('2. Analyze existing configuration state');
      console.log('3. Generate dashboard with current timeline');
    }

    try {
      // Step 1: Take pre-deployment snapshot
      const preLabel = deployEnabled ? `pre-deployment-${target}` : `analysis-${Date.now()}`;
      await this.takeSnapshot(device, preLabel);

      if (deployEnabled) {
        // Step 2: Deploy configuration
        await this.deployConfiguration(host, mode, target);

        // Step 3: Take post-UCI-config snapshot (immediately after UCI command)
        await this.takeSnapshot(device, `post-uci-config-${target}`);

        // Step 4: Compare configurations
        await this.compareConfigs(deviceName, preLabel, `post-uci-config-${target}`);
      }

      // Step 5: Generate dashboard
      await this.generateDashboard(deviceName);

      console.log('\n🎉 Demo completed successfully!');
      
      if (deployEnabled) {
        console.log('\n🔍 Deployment Analysis:');
        console.log('  1. Open the dashboard URL shown above');
        console.log('  2. Click "Compare with Previous" on the latest snapshot');
        console.log('  3. Explore detailed UCI configuration changes');
        console.log(`  4. See how ${target} configuration was deployed`);
      } else {
        console.log('\n🔍 Configuration Analysis:');
        console.log('  1. Open the dashboard URL shown above');
        console.log('  2. Review current configuration state');
        console.log('  3. Run again without --no-deploy to see deployment workflow');
      }

    } catch (error) {
      console.error(`\n❌ Demo failed: ${error.message}`);
      throw error;
    }
  }
}

// Demo workflow
async function demoWorkflow(deployEnabled = true, options = {}) {
  const demo = new OrchestratorDemo();
  
  try {
    console.log('🔧 Connecting to UCI Device Orchestrator...');
    await demo.connect();
    console.log('✅ Connected successfully!');

    if (deployEnabled) {
      // Run comprehensive deployment demo
      await demo.runDeploymentDemo({
        deployEnabled: true,
        ...options
      });
    } else {
      // Run analysis-only demo
      await demo.runDeploymentDemo({
        deployEnabled: false,
        ...options
      });
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    await demo.disconnect();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  // Parse deployment options
  let deployEnabled = true;
  let target = 'default';
  let mode = 'safe-merge';
  let host = '192.168.11.2';
  let device = 'qemu';
  let deviceName = 'QEMU OpenWRT VM';
  
  // Filter out deployment options from args
  const filteredArgs = [];
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-deploy':
        deployEnabled = false;
        break;
      case '--target':
        target = args[++i];
        break;
      case '--mode':
        mode = args[++i];
        break;
      case '--host':
        host = args[++i];
        break;
      case '--device':
        device = args[++i];
        break;
      case '--device-name':
        deviceName = args[++i];
        break;
      case '--help':
      case '-h':
        showHelp();
        return;
      default:
        filteredArgs.push(args[i]);
    }
  }
  
  if (filteredArgs.length === 0) {
    return demoWorkflow(deployEnabled, { target, mode, host, device, deviceName });
  }

  const demo = new OrchestratorDemo();
  
  try {
    await demo.connect();
    
    const [command, commandDevice, ...rest] = filteredArgs;
    
    switch (command) {
      case 'deploy':
        await demo.runDeploymentDemo({ 
          deployEnabled: true, 
          target, 
          mode, 
          host, 
          device: commandDevice || device,
          deviceName 
        });
        break;
        
      case 'snapshot':
        const label = rest.join('-') || 'manual';
        await demo.takeSnapshot(commandDevice, label);
        break;
        
      case 'history':
        await demo.listHistory(commandDevice);
        break;
        
      case 'compare':
        const [before, after] = rest;
        await demo.compareConfigs(commandDevice, before, after);
        break;
        
      case 'dashboard':
        await demo.generateDashboard(commandDevice);
        break;
        
      case 'devices':
        await demo.listDevices();
        break;
        
      default:
        showHelp();
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    await demo.disconnect();
  }
}

function showHelp() {
  console.log(`
🔧 UCI Device Orchestrator Demo

Usage:
  node demo-orchestrator.js [options]                 # Run full deployment demo
  node demo-orchestrator.js <command> [args] [options] # Run specific command

Deployment Options:
  --no-deploy              Skip deployment, analysis mode only
  --target <config>        Deployment target (default: default)
  --mode <mode>           Deployment mode (default: safe-merge)
  --host <ip>             Target host IP (default: 192.168.11.2)
  --device <name>         Device profile name (default: qemu)
  --device-name <name>    Device display name (default: QEMU OpenWRT VM)
  --help, -h              Show this help

Commands:
  deploy                   Run full deployment workflow with specified options
  snapshot <device> <label> # Take device snapshot
  history <device>         # Show configuration history
  compare <device> <id1> <id2> # Compare snapshots
  dashboard [device]       # Generate dashboard
  devices                  # List available devices

Deployment Modes:
  safe-merge              Safe merge with default safety options (recommended)
  merge                   Standard merge operation
  validate                Validate configurations only

Target Configurations:
  default                 Default ubispot configuration
  gl-mt3000               GL-iNet MT3000 specific configuration
  qemu-armv8              QEMU ARM64 specific configuration

Examples:
  # Full deployment demo (default)
  node demo-orchestrator.js

  # Analysis mode only (no deployment)
  node demo-orchestrator.js --no-deploy

  # Deploy specific configuration
  node demo-orchestrator.js --target gl-mt3000 --mode safe-merge

  # Deploy to different host
  node demo-orchestrator.js --host 192.168.1.100 --target default

  # Manual commands
  node demo-orchestrator.js snapshot qemu baseline
  node demo-orchestrator.js compare qemu snap1 snap2
  node demo-orchestrator.js dashboard
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}