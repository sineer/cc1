/**
 * SSH Manager - Centralized SSH operations for UCI config management
 * Handles authentication, connections, command execution, and file transfers
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CommandRunner } from './command-runner.js';

export class SSHManager {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.timeout = options.timeout || 30000;
    this.repoRoot = options.repoRoot;
    
    this.commandRunner = new CommandRunner({
      debug: this.debug,
      timeout: this.timeout,
      repoRoot: this.repoRoot
    });
  }

  /**
   * Load device profile from file or create dynamic IP profile
   */
  async loadProfile(target) {
    // Check if it's an IP address
    if (this.isIPAddress(target)) {
      return this.createDynamicProfile(target);
    }

    // Try to load profile JSON
    try {
      const profilePath = path.join(this.repoRoot, 'test/targets', `${target}.json`);
      const profileData = await fs.readFile(profilePath, 'utf8');
      return JSON.parse(profileData);
    } catch (error) {
      throw new Error(`Cannot load profile '${target}': ${error.message}`);
    }
  }

  /**
   * Load device profile for configuration operations
   */
  async loadDeviceProfile(device, password, keyFile) {
    if (this.isIPAddress(device)) {
      const profile = this.createDynamicProfile(device);
      
      // Override authentication if provided
      if (password !== undefined) {
        profile.auth_password = password;
      }
      if (keyFile) {
        profile.connection.key_file = keyFile;
      }
      
      return profile;
    }

    // Load named profile
    try {
      const profilePath = path.join(this.repoRoot, 'test/targets', `${device}.json`);
      const profileData = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(profileData);

      // Override authentication if provided
      if (password !== undefined) {
        profile.auth_password = password;
      }
      if (keyFile) {
        profile.connection.key_file = keyFile;
      }

      return profile;
    } catch (error) {
      throw new Error(`Cannot load device profile '${device}': ${error.message}`);
    }
  }

  /**
   * Create dynamic profile for IP address
   */
  createDynamicProfile(ipAddress, options = {}) {
    return {
      name: `Direct IP (${ipAddress})`,
      connection: {
        host: ipAddress,
        username: options.username || 'root',
        port: options.port || 22,
      },
    };
  }

  /**
   * Check if target is an IP address
   */
  isIPAddress(target) {
    return /^\d+\.\d+\.\d+\.\d+$/.test(target);
  }

  /**
   * Setup SSH connection with authentication
   */
  setupSSH(profile, options = {}) {
    const host = `${profile.connection.username || 'root'}@${profile.connection.host}`;
    const port = profile.connection.port || 22;
    const sshBaseArgs = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -p ${port}`;
    const scpBaseArgs = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -P ${port}`;
    
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
      profile,
      host,
      exec: async (cmd) => this.executeCommand(sshCmd, host, cmd),
      upload: async (local, remote) => this.uploadFile(scpCmd, host, local, remote),
    };
  }

  /**
   * Execute SSH command - delegates to CommandRunner
   */
  async executeCommand(sshCmd, host, command) {
    return this.commandRunner.executeSSH(sshCmd, host, command);
  }

  /**
   * Upload file via SCP - delegates to CommandRunner
   */
  async uploadFile(scpCmd, host, localPath, remotePath) {
    return this.commandRunner.uploadFile(scpCmd, host, localPath, remotePath);
  }

  /**
   * Test SSH connectivity
   */
  async testConnection(connection) {
    try {
      const result = await connection.exec('echo "SSH_OK"');
      if (!result.stdout.includes('SSH_OK')) {
        throw new Error('SSH connectivity test failed');
      }
      return true;
    } catch (error) {
      throw new Error(`SSH connection test failed: ${error.message}`);
    }
  }

  /**
   * Create configuration backup on remote device
   */
  async createBackup(connection, backupPath = '/tmp/test-backup.uci') {
    try {
      await connection.exec(`uci export > ${backupPath}`);
      if (this.debug) {
        console.error(`[SSH] Configuration backup created at ${backupPath}`);
      }
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create configuration backup: ${error.message}`);
    }
  }

  /**
   * Restore configuration backup on remote device
   */
  async restoreBackup(connection, backupPath = '/tmp/test-backup.uci') {
    try {
      await connection.exec(`uci import < ${backupPath} && uci commit`);
      if (this.debug) {
        console.error(`[SSH] Configuration restored from ${backupPath}`);
      }
      return true;
    } catch (error) {
      throw new Error(`Failed to restore configuration backup: ${error.message}`);
    }
  }

  /**
   * Upload test framework to remote device
   */
  async uploadTestFramework(connection, archivePath) {
    const remotePath = '/tmp';
    
    try {
      // Upload the test archive
      await connection.upload(archivePath, remotePath);
      
      // Extract on remote device
      const archiveName = path.basename(archivePath);
      await connection.exec(`cd ${remotePath} && tar -xzf ${archiveName}`);
      
      if (this.debug) {
        console.error(`[SSH] Test framework uploaded and extracted to ${remotePath}`);
      }
      
      return remotePath;
    } catch (error) {
      throw new Error(`Failed to upload test framework: ${error.message}`);
    }
  }

  /**
   * Cleanup remote test files
   */
  async cleanupRemoteFiles(connection, paths = ['/tmp/bin', '/tmp/lib', '/tmp/test']) {
    try {
      const cleanupCmd = `rm -rf ${paths.join(' ')}`;
      await connection.exec(cleanupCmd);
      
      if (this.debug) {
        console.error(`[SSH] Cleaned up remote files: ${paths.join(', ')}`);
      }
      
      return true;
    } catch (error) {
      if (this.debug) {
        console.error(`[SSH] Warning: Failed to cleanup remote files: ${error.message}`);
      }
      // Don't fail the whole operation for cleanup issues
      return false;
    }
  }

  /**
   * Validate SSH authentication options
   */
  validateCredentials(profile, options) {
    if (options.password !== undefined) {
      // Password auth is always valid (including empty passwords)
      return true;
    }
    
    if (options.keyFile || profile.connection.key_file) {
      // Key file authentication
      return true;
    }
    
    // Default SSH key authentication
    return true;
  }

  /**
   * Build SSH command string for debugging
   */
  buildSSHCommand(profile, options = {}) {
    const { sshCmd } = this.setupSSH(profile, options);
    return sshCmd;
  }

  /**
   * Build SCP command string for debugging
   */
  buildSCPCommand(profile, options = {}) {
    const { scpCmd } = this.setupSSH(profile, options);
    return scpCmd;
  }
}