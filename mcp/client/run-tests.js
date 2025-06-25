#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UCIConfigTestClient {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
  }

  async connectToServer() {
    return new Promise((resolve, reject) => {
      const serverPath = path.resolve(__dirname, '../server/index.js');

      this.serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
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
        if (message.includes('🚀 UCI Config MCP Server running')) {
          resolve();
        }
        // Suppress debug output in normal operation
      });

      this.serverProcess.on('error', (error) => {
        reject(error);
      });

      // Handle cleanup
      process.on('SIGINT', () => {
        this.close();
        process.exit(0);
      });
    });
  }

  handleResponse(message) {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'MCP Error'));
      } else {
        resolve(message.result);
      }
    }
  }

  async request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      const messageStr = JSON.stringify(message) + '\n';
      this.serverProcess.stdin.write(messageStr);
    });
  }

  close() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }

  async runTests(options = {}) {
    try {
      console.log('🚀 UCI Config MCP Test Client');
      console.log('=' .repeat(50));

      await this.connectToServer();

      // Check Docker status
      console.log('📋 Checking Docker environment...');
      const dockerResult = await this.request('tools/call', {
        name: 'check_docker_status',
        arguments: {},
      });
      console.log(dockerResult.content[0].text);
      console.log();

      // List test files
      console.log('📂 Available test files...');
      const listResult = await this.request('tools/call', {
        name: 'list_test_files',
        arguments: {},
      });
      console.log(listResult.content[0].text);
      console.log();

      // Run tests
      console.log('🧪 Running tests...');
      console.log('=' .repeat(50));

      const testResult = await this.request('tools/call', {
        name: 'run_tests',
        arguments: {
          verbose: options.verbose || false,
          rebuild: options.rebuild || false,
          specific_test: options.specificTest,
        },
      });

      console.log(testResult.content[0].text);

      return testResult.content[0].text.includes('✅') ? 0 : 1;

    } catch (error) {
      console.error('❌ Error running tests:', error.message);
      return 1;
    } finally {
      this.close();
    }
  }

  async runSingleTest(testFile, options = {}) {
    try {
      console.log(`🚀 Running single test: ${testFile}`);
      console.log('=' .repeat(50));

      await this.connectToServer();

      const result = await this.request('tools/call', {
        name: 'run_single_test',
        arguments: {
          test_file: testFile,
          verbose: options.verbose || false,
        },
      });

      console.log(result.content[0].text);

      return result.content[0].text.includes('✅') ? 0 : 1;

    } catch (error) {
      console.error('❌ Error running single test:', error.message);
      return 1;
    } finally {
      this.close();
    }
  }

  async buildImage(options = {}) {
    try {
      console.log('🔨 Building Docker test image...');
      console.log('=' .repeat(50));

      await this.connectToServer();

      const result = await this.request('tools/call', {
        name: 'build_test_image',
        arguments: {
          force: options.force || false,
        },
      });

      console.log(result.content[0].text);

      return result.content[0].text.includes('✅') ? 0 : 1;

    } catch (error) {
      console.error('❌ Error building image:', error.message);
      return 1;
    } finally {
      this.close();
    }
  }
}

function showHelp() {
  console.log(`
🧪 UCI Config Tool MCP Test Runner (Node.js)

Usage:
  node mcp/client/run-tests.js [command] [options]

Commands:
  test                    Run all tests (default)
  test <file.lua>        Run specific test file
  build                  Build Docker test image
  build --force          Force rebuild Docker image
  help                   Show this help

Options:
  --verbose              Enable verbose output
  --rebuild              Force rebuild Docker image before running tests

Examples:
  node mcp/client/run-tests.js                           # Run all tests
  node mcp/client/run-tests.js test test_uci_config.lua  # Run specific test
  node mcp/client/run-tests.js build                     # Build image
  node mcp/client/run-tests.js build --force             # Force rebuild
  node mcp/client/run-tests.js test --verbose --rebuild  # Verbose tests with rebuild

The MCP server will:
  ✅ Check Docker environment availability
  ✅ Build OpenWRT test containers
  ✅ Run tests in isolated environment
  ✅ Provide detailed test results
  ✅ Handle service restart testing safely
`);
}

async function main() {
  const args = process.argv.slice(2);
  const client = new UCIConfigTestClient();

  // Parse command line arguments
  const command = args[0] || 'test';
  const options = {
    verbose: args.includes('--verbose'),
    rebuild: args.includes('--rebuild'),
    force: args.includes('--force'),
  };

  let exitCode = 0;

  try {
    switch (command) {
      case 'test':
        if (args.length > 1 && !args[1].startsWith('--')) {
          // Run specific test
          exitCode = await client.runSingleTest(args[1], options);
        } else {
          // Run all tests
          exitCode = await client.runTests(options);
        }
        break;

      case 'build':
        exitCode = await client.buildImage(options);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error("Run 'node mcp/client/run-tests.js help' for usage information");
        exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    exitCode = 1;
  }

  process.exit(exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}