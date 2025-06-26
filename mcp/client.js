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
          if (message.includes('🚀 Unified UCI Config Test Server running')) {
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

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 10000);

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
      
      // Timeout after 30 seconds for remote testing
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
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
}

/**
 * Command-line interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {
    target: 'docker',
    test: 'all',
    verbose: false,
    dryRun: false,
    rebuild: false,
  };

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
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
      case '--help':
        showHelp();
        process.exit(0);
      default:
        // Assume it's a target or test name
        if (!options.target || options.target === 'docker') {
          options.target = args[i];
        } else if (options.test === 'all') {
          options.test = args[i];
        }
        break;
    }
    i++;
  }

  const client = new SimpleMCPClient();
  
  try {
    console.error('🔗 Connecting to test server...');
    await client.connect();
    
    console.error(`🎯 Running tests (target: ${options.target}, test: ${options.test})`);
    const result = await client.runTests(options);
    
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
🧪 UCI Config Test Client

Usage:
  node mcp/client.js [target] [test] [options]

Arguments:
  target              Target: docker (default), IP address, or profile name
  test               Test file or "all" (default)

Options:
  --target <name>     Specify target explicitly
  --test <file>      Specify test file explicitly
  --password <pass>  SSH password for remote targets
  --key-file <path>  SSH key file for remote targets
  --verbose          Enable verbose output
  --dry-run          Perform dry run without changes
  --rebuild          Force rebuild Docker image
  --help             Show this help

Examples:
  node mcp/client.js                                    # Run all Docker tests
  node mcp/client.js docker test_uci_config.lua       # Run specific Docker test
  node mcp/client.js 192.168.11.2 --password ""       # Test on remote device
  node mcp/client.js gl test_production_deployment.lua # Test on GL profile
  node mcp/client.js --dry-run --verbose               # Verbose dry run
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SimpleMCPClient };