#!/usr/bin/env node

/**
 * SSH Connection Manager for Target Device Testing
 * Provides secure SSH connectivity with proper error handling and cleanup
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class SSHConnection {
  constructor(connectionConfig) {
    this.config = {
      host: connectionConfig.host,
      port: connectionConfig.port || 22,
      username: connectionConfig.username || 'root',
      keyFile: connectionConfig.key_file || '~/.ssh/id_rsa',
      timeout: connectionConfig.timeout || 30,
      keepalive: connectionConfig.keepalive || true,
      ...connectionConfig
    };
    
    this.isConnected = false;
    this.connectionId = `ssh-${Date.now()}`;
  }

  /**
   * Expand tilde in file paths
   */
  expandPath(filePath) {
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    return filePath;
  }

  /**
   * Test SSH connectivity without establishing persistent connection
   */
  async testConnection() {
    try {
      const result = await this.execute('echo "SSH_CONNECTION_TEST_OK"', { timeout: 10000 });
      return result.stdout.includes('SSH_CONNECTION_TEST_OK');
    } catch (error) {
      throw new Error(`SSH connection test failed: ${error.message}`);
    }
  }

  /**
   * Connect to the target device
   */
  async connect() {
    try {
      // Skip key file check if using password auth
      if (this.config.keyFile && this.config.keyFile !== 'none') {
        // Expand key file path
        const keyPath = this.expandPath(this.config.keyFile);
        
        // Verify key file exists
        try {
          await fs.access(keyPath);
        } catch (error) {
          console.warn(`SSH key file not found: ${keyPath}, will try password auth`);
          // Continue anyway - might use password auth
        }
      }

      // Test connection
      await this.testConnection();
      
      this.isConnected = true;
      return true;
    } catch (error) {
      throw new Error(`SSH connection failed: ${error.message}`);
    }
  }

  /**
   * Execute command on remote device
   */
  async execute(command, options = {}) {
    if (!command) {
      throw new Error('Command is required');
    }

    const timeout = options.timeout || (this.config.timeout * 1000);
    const keyPath = this.expandPath(this.config.keyFile);

    let sshCommand = 'ssh';
    const sshArgs = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', `ConnectTimeout=${this.config.timeout}`,
      '-p', this.config.port.toString()
    ];

    // Handle authentication
    if (this.config.password !== undefined || this.config.keyFile === 'none') {
      // Use sshpass for password authentication (including empty password)
      sshCommand = 'sshpass';
      sshArgs.unshift('-p', this.config.password || '', 'ssh');
      sshArgs.push('-o', 'PreferredAuthentications=password,keyboard-interactive');
    } else if (this.config.keyFile) {
      // Use key file
      sshArgs.push('-i', keyPath);
    }

    if (this.config.keepalive) {
      sshArgs.push('-o', 'ServerAliveInterval=30');
    }

    sshArgs.push(`${this.config.username}@${this.config.host}`, command);

    // Debug output
    if (this.config.verbose || process.env.DEBUG_SSH) {
      console.error(`[SSH] Command: ${sshCommand} ${sshArgs.join(' ')}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(sshCommand, sshArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
        }, timeout);
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        resolve({
          returncode: code,
          stdout: stdout,
          stderr: stderr,
          success: code === 0
        });
      });

      child.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`SSH execution error: ${error.message}`));
      });
    });
  }

  /**
   * Upload file to remote device
   */
  async upload(localPath, remotePath) {
    try {
      // Verify local file exists
      await fs.access(localPath);

      const keyPath = this.expandPath(this.config.keyFile);
      let scpCommand = 'scp';
      const scpArgs = [
        '-O', // Use legacy SCP protocol (not SFTP) - OpenWRT doesn't have sftp-server
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-P', this.config.port.toString(),
        '-r' // Recursive for directories
      ];

      // Handle authentication
      if (this.config.password !== undefined || this.config.keyFile === 'none') {
        // Use sshpass for password authentication
        scpCommand = 'sshpass';
        scpArgs.unshift('-p', this.config.password || '', 'scp');
        scpArgs.push('-o', 'PreferredAuthentications=password,keyboard-interactive');
      } else if (this.config.keyFile) {
        // Use key file
        scpArgs.push('-i', keyPath);
      }

      scpArgs.push(localPath, `${this.config.username}@${this.config.host}:${remotePath}`);

      return new Promise((resolve, reject) => {
        const child = spawn(scpCommand, scpArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            reject(new Error(`SCP upload failed: ${stderr}`));
          }
        });

        child.on('error', (error) => {
          reject(new Error(`SCP error: ${error.message}`));
        });
      });
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from remote device
   */
  async download(remotePath, localPath) {
    try {
      const keyPath = this.expandPath(this.config.keyFile);
      let scpCommand = 'scp';
      const scpArgs = [
        '-O', // Use legacy SCP protocol (not SFTP) - OpenWRT doesn't have sftp-server
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-P', this.config.port.toString(),
        '-r' // Recursive for directories
      ];

      // Handle authentication
      if (this.config.password !== undefined || this.config.keyFile === 'none') {
        // Use sshpass for password authentication
        scpCommand = 'sshpass';
        scpArgs.unshift('-p', this.config.password || '', 'scp');
        scpArgs.push('-o', 'PreferredAuthentications=password,keyboard-interactive');
      } else if (this.config.keyFile) {
        // Use key file
        scpArgs.push('-i', keyPath);
      }

      scpArgs.push(`${this.config.username}@${this.config.host}:${remotePath}`, localPath);

      return new Promise((resolve, reject) => {
        const child = spawn(scpCommand, scpArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            reject(new Error(`SCP download failed: ${stderr}`));
          }
        });

        child.on('error', (error) => {
          reject(new Error(`SCP error: ${error.message}`));
        });
      });
    } catch (error) {
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * Write content to remote file
   */
  async writeFile(remotePath, content) {
    try {
      // Use a here-document to write the file content
      const command = `cat > '${remotePath}' << 'UCI_TEST_EOF'
${content}
UCI_TEST_EOF`;
      
      const result = await this.execute(command);
      
      if (!result.success) {
        throw new Error(`Write failed: ${result.stderr}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Remote file write failed: ${error.message}`);
    }
  }

  /**
   * Read content from remote file
   */
  async readFile(remotePath) {
    try {
      const result = await this.execute(`cat '${remotePath}'`);
      
      if (!result.success) {
        throw new Error(`Read failed: ${result.stderr}`);
      }
      
      return result.stdout;
    } catch (error) {
      throw new Error(`Remote file read failed: ${error.message}`);
    }
  }

  /**
   * Check if remote file exists
   */
  async fileExists(remotePath) {
    try {
      const result = await this.execute(`test -f '${remotePath}' && echo "EXISTS"`);
      return result.stdout.includes('EXISTS');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo() {
    try {
      const commands = {
        hostname: 'hostname',
        uptime: 'uptime',
        uname: 'uname -a',
        meminfo: 'cat /proc/meminfo | head -5',
        openwrt_release: 'cat /etc/openwrt_release 2>/dev/null || echo "Not OpenWRT"',
        uci_version: 'uci -V 2>/dev/null || echo "UCI not available"'
      };

      const info = {};
      
      for (const [key, command] of Object.entries(commands)) {
        try {
          const result = await this.execute(command);
          info[key] = result.stdout.trim();
        } catch (error) {
          info[key] = `Error: ${error.message}`;
        }
      }

      return info;
    } catch (error) {
      throw new Error(`Device info collection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from device (cleanup method)
   */
  async disconnect() {
    // SSH connections are stateless, so just mark as disconnected
    this.isConnected = false;
    return true;
  }
}

export { SSHConnection };