#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CustomMCPClient {
  constructor() {
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
  }

  async connectToServer() {
    return new Promise((resolve, reject) => {
      const serverPath = path.resolve(__dirname, '../server/index.js');
      console.error('[Custom Client] Starting server process:', serverPath);

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
              console.error('[Custom Client] JSON parse error:', error);
              console.error('[Custom Client] Raw line:', line);
            }
          }
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('🚀 UCI Config MCP Server running')) {
          console.error('[Custom Client] Server ready');
          resolve();
        } else {
          console.error('[Custom Client] Server stderr:', message);
        }
      });

      this.serverProcess.on('error', (error) => {
        console.error('[Custom Client] Server process error:', error);
        reject(error);
      });

      this.serverProcess.on('exit', (code) => {
        console.error('[Custom Client] Server process exited with code:', code);
      });
    });
  }

  handleResponse(message) {
    console.error('[Custom Client] Received response:', JSON.stringify(message, null, 2));
    
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
      console.error('[Custom Client] Sending request:', messageStr.trim());
      
      this.serverProcess.stdin.write(messageStr);
    });
  }

  async listTools() {
    return await this.request('tools/list');
  }

  async callTool(name, args = {}) {
    return await this.request('tools/call', {
      name,
      arguments: args
    });
  }

  close() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
  }
}

// Test the custom client
async function testCustomClient() {
  const client = new CustomMCPClient();
  
  try {
    console.log('🚀 Testing Custom MCP Client');
    console.log('=' .repeat(50));
    
    await client.connectToServer();
    
    // Test listing tools
    console.log('📋 Listing tools...');
    const tools = await client.listTools();
    console.log('✅ Tools listed successfully');
    console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
    console.log();
    
    // Test calling a tool
    console.log('🐳 Checking Docker status...');
    const dockerResult = await client.callTool('check_docker_status');
    console.log('✅ Docker check completed');
    console.log(dockerResult.content[0].text);
    console.log();
    
    // Test running tests
    console.log('🧪 Running tests...');
    const testResult = await client.callTool('run_tests');
    console.log('✅ Tests completed');
    console.log(testResult.content[0].text);
    
  } catch (error) {
    console.error('❌ Custom client test failed:', error);
    process.exit(1);
  } finally {
    client.close();
  }
}

export { CustomMCPClient };

if (import.meta.url === `file://${process.argv[1]}`) {
  testCustomClient();
}