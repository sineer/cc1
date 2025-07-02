#!/usr/bin/env node

/**
 * Simplified MCP Client for Unified Test Server
 * Single client that communicates with the unified test server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SimpleMCPClient {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
  }

  /**
   * Connect to the unified MCP server using custom JSON-RPC client
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const serverPath = path.join(__dirname, 'server-unified.js');
        this.serverProcess = spawn('node', [serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: path.resolve(__dirname, '..'),
        });

        let buffer = '';
        
        this.serverProcess.stdout.on('data', (data) => {
          buffer += data.toString();
          
          // Process complete JSON-RPC messages
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                this.handleResponse(message);
              } catch (error) {
                // Ignore non-JSON lines (debug output)
              }
            }
          }
        });

        this.serverProcess.stderr.on('data', (data) => {
          const message = data.toString();
          // Forward all server messages to client stderr
          process.stderr.write(message);
          if (message.includes('🚀 Unified UCI Config Server with Orchestration running')) {
            resolve();
          }
        });

        this.serverProcess.on('error', (error) => {
          reject(new Error(`Server process error: ${error.message}`));
        });

        this.serverProcess.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Server process exited with code ${code}`));
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 30000);

      } catch (error) {
        reject(new Error(`Failed to start server: ${error.message}`));
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
      
      // Timeout after 120 seconds for remote testing and demos
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 120000);
    });
  }

  /**
   * Call MCP tool with arguments
   */
  async callTool(name, args) {
    return await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect() {
    try {
      if (this.serverProcess) {
        this.serverProcess.kill('SIGTERM');
        this.serverProcess = null;
      }
      this.pendingRequests.clear();
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Run tests using the unified test tool
   */
  async runTests(options = {}) {
    if (!this.serverProcess) {
      throw new Error('Client not connected. Call connect() first.');
    }

    try {
      const args = {
        target: options.target || 'docker',
        test: options.test || 'all',
        verbose: options.verbose || false,
        dryRun: options.dryRun || false,
        rebuild: options.rebuild || false,
      };

      // Add authentication options for remote targets
      if (options.password !== undefined) {
        args.password = options.password;
      }
      if (options.keyFile) {
        args.keyFile = options.keyFile;
      }

      const result = await this.sendRequest('tools/call', {
        name: 'test',
        arguments: args,
      });

      return this.formatResult(result);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: `❌ Test execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Format tool result for display
   */
  formatResult(result) {
    if (!result.content || result.content.length === 0) {
      return {
        success: false,
        error: 'Empty response from server',
        output: '❌ No response from test server',
      };
    }

    const content = result.content[0];
    const output = content.text || content.content || '';
    const success = !output.includes('❌') && !output.includes('Error:');

    return {
      success,
      output,
      error: success ? null : 'Test execution failed',
    };
  }

  /**
   * List available tools (for debugging)
   */
  async listTools() {
    if (!this.serverProcess) {
      throw new Error('Client not connected');
    }

    return await this.sendRequest('tools/list', {});
  }

  /**
   * Take device configuration snapshot
   */
  async runSnapshot(options) {
    const { device = 'qemu', label = 'manual', password, keyFile, verbose = false } = options;
    
    const response = await this.callTool('snapshot', {
      device,
      label,
      password,
      keyFile,
      verbose
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }

  /**
   * Compare device configuration snapshots
   */
  async runCompare(options) {
    const { device = 'qemu', before, after, format = 'text' } = options;
    
    const response = await this.callTool('compare', {
      device,
      before,
      after,
      format
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }

  /**
   * Generate device dashboard
   */
  async runDashboard(options) {
    const { device = 'all', days = 7 } = options;
    
    const response = await this.callTool('dashboard', {
      device,
      days
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }

  /**
   * Run deployment demo
   */
  async runDemo(options) {
    const { 
      type = 'ubispot',
      host = '192.168.11.2',
      deploy = true,
      configTarget = 'default',
      mode = 'safe-merge',
      password
    } = options;
    
    const response = await this.callTool('demo', {
      type,
      host,
      deploy,
      target: configTarget, // Send as 'target' to server (UCI config target)
      mode,
      password
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }

  /**
   * Show device configuration history
   */
  async runHistory(options) {
    const { device = 'qemu', days = 7 } = options;
    
    const response = await this.callTool('history', {
      device,
      days
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }

  /**
   * Generate interactive HTML dashboard
   */
  async runDashboard(options) {
    const { device = 'QEMU OpenWRT VM', days = 7 } = options;
    
    const response = await this.callTool('dashboard', {
      device,
      days
    });
    
    return {
      success: true,
      output: response.content[0].text
    };
  }
}

/**
 * Command-line interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Detect tool command
  const toolCommands = ['test', 'snapshot', 'compare', 'dashboard', 'demo', 'history'];
  let toolCommand = 'test'; // default
  
  if (args.length > 0 && toolCommands.includes(args[0])) {
    toolCommand = args.shift(); // Remove tool command from args
  }
  
  // Parse command line arguments
  const options = {
    target: 'docker',
    test: 'all',
    verbose: false,
    dryRun: false,
    rebuild: false,
    // New tool options
    device: 'qemu',
    label: 'manual',
    before: null,
    after: null,
    format: 'text',
    days: 7,
    type: 'ubispot',
    deploy: true,
    host: '192.168.11.2',
    // Note: target is overloaded (UCI config target vs test target)
    configTarget: 'default', 
    mode: 'safe-merge',
  };

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      // Existing options
      case '--target':
        options.target = args[++i];
        break;
      case '--test':
        options.test = args[++i];
        break;
      case '--password':
        options.password = args[++i];
        break;
      case '--key-file':
        options.keyFile = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--rebuild':
        options.rebuild = true;
        break;
      // New tool options
      case '--device':
        options.device = args[++i];
        break;
      case '--label':
        options.label = args[++i];
        break;
      case '--before':
        options.before = args[++i];
        break;
      case '--after':
        options.after = args[++i];
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--days':
        options.days = parseInt(args[++i]);
        break;
      case '--type':
        options.type = args[++i];
        break;
      case '--no-deploy':
        options.deploy = false;
        break;
      case '--host':
        options.host = args[++i];
        break;
      case '--target':
        // Handle overloaded --target parameter
        if (toolCommand === 'demo') {
          options.configTarget = args[++i];
        } else {
          options.target = args[++i];
        }
        break;
      case '--mode':
        options.mode = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
      default:
        // Handle positional arguments based on tool
        if (toolCommand === 'test') {
          // Existing test logic
          if (!options.target || options.target === 'docker') {
            options.target = args[i];
          } else if (options.test === 'all') {
            options.test = args[i];
          }
        } else if (toolCommand === 'snapshot') {
          if (!options.device || options.device === 'qemu') {
            options.device = args[i];
          } else if (options.label === 'manual') {
            options.label = args[i];
          }
        } else if (toolCommand === 'compare') {
          if (!options.device || options.device === 'qemu') {
            options.device = args[i];
          } else if (!options.before) {
            options.before = args[i];
          } else if (!options.after) {
            options.after = args[i];
          }
        } else if (toolCommand === 'dashboard') {
          if (!options.device || options.device === 'qemu') {
            options.device = args[i];
          }
        } else if (toolCommand === 'demo') {
          if (options.type === 'ubispot') {
            options.type = args[i];
          }
        } else if (toolCommand === 'history') {
          if (!options.device || options.device === 'qemu') {
            options.device = args[i];
          }
        }
        break;
    }
    i++;
  }

  const client = new SimpleMCPClient();
  
  try {
    console.error(`🔗 Connecting to UCI config server...`);
    await client.connect();
    
    let result;
    
    switch (toolCommand) {
      case 'test':
        console.error(`🎯 Running tests (target: ${options.target}, test: ${options.test})`);
        result = await client.runTests(options);
        break;
      case 'snapshot':
        console.error(`📸 Taking snapshot (device: ${options.device}, label: ${options.label})`);
        result = await client.runSnapshot(options);
        break;
      case 'compare':
        console.error(`🔍 Comparing configs (device: ${options.device}, ${options.before} → ${options.after})`);
        result = await client.runCompare(options);
        break;
      case 'dashboard':
        console.error(`📊 Generating dashboard (device: ${options.device})`);
        result = await client.runDashboard(options);
        break;
      case 'demo':
        console.error(`🚀 Running ${options.type} demo (deploy: ${options.deploy})`);
        result = await client.runDemo(options);
        break;
      case 'history':
        console.error(`📋 Showing history (device: ${options.device}, ${options.days} days)`);
        result = await client.runHistory(options);
        break;
      default:
        throw new Error(`Unknown tool command: ${toolCommand}`);
    }
    
    // Output results
    console.log(result.output);
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error(`❌ Client error: ${error.message}`);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

function showHelp() {
  console.log(`
🔧 UCI Config Management Client with Orchestration

Usage:
  node mcp/client.js [tool] [args] [options]

Tools:
  test               Run UCI config tests (default)
  snapshot           Take device configuration snapshot
  compare            Compare two configuration snapshots
  dashboard          Generate interactive HTML dashboard
  demo               Run deployment demo workflows  
  history            Show device configuration history

Test Tool (default):
  node mcp/client.js [target] [test] [options]
  node mcp/client.js test [target] [test] [options]

Snapshot Tool:
  node mcp/client.js snapshot [device] [label] [options]

Compare Tool:
  node mcp/client.js compare [device] [before] [after] [options]

Dashboard Tool:
  node mcp/client.js dashboard [device] [options]

Demo Tool:
  node mcp/client.js demo [type] [options]

History Tool:
  node mcp/client.js history [device] [options]

Common Options:
  --password <pass>  SSH password for remote targets (empty string for no password)
  --key-file <path>  SSH key file for remote targets
  --verbose          Enable verbose output
  --help             Show this help

Test Options:
  --target <name>    Target: docker (default), IP address, or profile name
  --test <file>      Test file or "all" (default)
  --dry-run          Perform dry run without changes
  --rebuild          Force rebuild Docker image

Snapshot Options:
  --device <name>    Device profile (qemu, gl, openwrt) or IP address
  --label <text>     Snapshot label for identification

Compare Options:  
  --device <name>    Device profile or IP address
  --before <id>      Before snapshot ID or label
  --after <id>       After snapshot ID or label
  --format <fmt>     Output format: text, html, json

Dashboard Options:
  --device <name>    Device name (default: all)
  --days <num>       Days to include in timeline (default: 7)

Demo Options:
  --type <demo>      Demo type: ubispot, cowboy (default: ubispot)
  --host <ip>        Target device IP (default: 192.168.11.2)
  --no-deploy        Analysis mode only (disable deployment)
  --target <name>    Target configuration (default, gl-mt3000, qemu-armv8)
  --mode <mode>      Deployment mode (safe-merge, merge, validate)

History Options:
  --device <name>    Device profile or IP address
  --days <num>       Number of days to show (default: 7)

Examples:

Testing:
  node mcp/client.js                                    # Run all Docker tests
  node mcp/client.js test docker test_uci_config.lua   # Specific Docker test
  node mcp/client.js test 192.168.11.2 --password ""   # Test on remote device
  node mcp/client.js test gl --dry-run --verbose        # Verbose dry run

Configuration Management:
  node mcp/client.js snapshot qemu baseline             # Take baseline snapshot
  node mcp/client.js compare qemu baseline after-changes # Compare snapshots
  node mcp/client.js dashboard "QEMU OpenWRT VM"        # Generate dashboard
  node mcp/client.js history qemu --days 14             # Show 14-day history

Demos:
  node mcp/client.js demo ubispot --host 192.168.11.2   # ubispot deployment demo
  node mcp/client.js demo cowboy --no-deploy            # Cowboy analysis demo
  node mcp/client.js demo ubispot --target gl-mt3000    # GL-iNet specific config

Remote Device Operations:
  node mcp/client.js snapshot 192.168.1.100 baseline --password ""     # Remote snapshot
  node mcp/client.js demo ubispot --host 192.168.1.100 --password ""   # Remote demo
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SimpleMCPClient };