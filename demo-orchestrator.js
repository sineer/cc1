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
}

// Demo workflow
async function demoWorkflow() {
  const demo = new OrchestratorDemo();
  
  try {
    console.log('🔧 Connecting to UCI Device Orchestrator...');
    await demo.connect();
    console.log('✅ Connected successfully!\n');

    // Step 1: List devices
    await demo.listDevices();

    // Step 2: Take baseline snapshot
    await demo.takeSnapshot('qemu', 'baseline-pre-demo');

    // Step 3: Show configuration history
    await demo.listHistory('qemu');

    // Step 4: Generate dashboard
    await demo.generateDashboard();

    console.log('\n🎉 Demo workflow completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Make some configuration changes on your QEMU VM');
    console.log('2. Take another snapshot with: node demo-orchestrator.js snapshot qemu after-changes');
    console.log('3. Compare snapshots to see differences');
    console.log('4. Check the generated dashboard HTML file');

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    await demo.disconnect();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return demoWorkflow();
  }

  const demo = new OrchestratorDemo();
  
  try {
    await demo.connect();
    
    const [command, device, ...rest] = args;
    
    switch (command) {
      case 'snapshot':
        const label = rest.join('-') || 'manual';
        await demo.takeSnapshot(device, label);
        break;
        
      case 'history':
        await demo.listHistory(device);
        break;
        
      case 'compare':
        const [before, after] = rest;
        await demo.compareConfigs(device, before, after);
        break;
        
      case 'dashboard':
        await demo.generateDashboard(device);
        break;
        
      case 'devices':
        await demo.listDevices();
        break;
        
      default:
        console.log(`
🔧 UCI Device Orchestrator Demo

Usage:
  node demo-orchestrator.js                           # Run full demo workflow
  node demo-orchestrator.js snapshot <device> <label> # Take snapshot
  node demo-orchestrator.js history <device>          # Show history
  node demo-orchestrator.js compare <device> <id1> <id2> # Compare snapshots
  node demo-orchestrator.js dashboard [device]        # Generate dashboard
  node demo-orchestrator.js devices                   # List devices

Examples:
  node demo-orchestrator.js snapshot qemu baseline
  node demo-orchestrator.js history qemu
  node demo-orchestrator.js dashboard qemu
        `);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    await demo.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}