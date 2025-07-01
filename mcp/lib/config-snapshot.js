/**
 * Device Configuration Snapshot Engine
 * Captures complete device configurations via SSH using UCI export and direct file access
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ConfigSnapshotEngine {
  constructor(options = {}) {
    this.snapshotDir = options.snapshotDir || './config-snapshots';
    this.sshTimeout = options.sshTimeout || 30;
    this.debug = options.debug || false;
  }

  /**
   * Capture complete device configuration snapshot
   */
  async captureSnapshot(deviceProfile, label = 'manual') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotId = `${timestamp}-${label}`;
    const deviceName = this.getDeviceName(deviceProfile);
    const snapshotPath = path.join(this.snapshotDir, deviceName, snapshotId);
    
    this.log(`Creating snapshot for ${deviceName}: ${snapshotId}`);
    
    // Create snapshot directory
    await fs.mkdir(snapshotPath, { recursive: true });

    const metadata = {
      device_name: deviceName,
      snapshot_id: snapshotId,
      label,
      timestamp: new Date().toISOString(),
      device_profile: deviceProfile,
      capture_method: 'ssh-uci-export',
      files_captured: [],
      errors: []
    };

    try {
      // 1. Capture UCI export (complete configuration in machine-readable format)
      this.log('Capturing UCI export...');
      const uciExport = await this.captureUCIExport(deviceProfile);
      await fs.writeFile(path.join(snapshotPath, 'uci-export.txt'), uciExport);
      metadata.files_captured.push('uci-export.txt');

      // 2. Capture individual config files (human-readable format)
      this.log('Capturing individual config files...');
      const configFiles = await this.getConfigFileList(deviceProfile);
      
      for (const configFile of configFiles) {
        try {
          const content = await this.captureConfigFile(deviceProfile, configFile);
          await fs.writeFile(path.join(snapshotPath, `${configFile}.conf`), content);
          metadata.files_captured.push(`${configFile}.conf`);
        } catch (error) {
          this.log(`Warning: Could not capture ${configFile}: ${error.message}`);
          metadata.errors.push({
            file: configFile,
            error: error.message
          });
        }
      }

      // 3. Capture system information
      this.log('Capturing system information...');
      const systemInfo = await this.captureSystemInfo(deviceProfile);
      await fs.writeFile(
        path.join(snapshotPath, 'system-info.json'), 
        JSON.stringify(systemInfo, null, 2)
      );
      metadata.files_captured.push('system-info.json');
      metadata.system_info = systemInfo;

      // 4. Capture network status
      this.log('Capturing network status...');
      const networkStatus = await this.captureNetworkStatus(deviceProfile);
      await fs.writeFile(
        path.join(snapshotPath, 'network-status.json'),
        JSON.stringify(networkStatus, null, 2)
      );
      metadata.files_captured.push('network-status.json');

      // 5. Capture service status
      this.log('Capturing service status...');
      const serviceStatus = await this.captureServiceStatus(deviceProfile);
      await fs.writeFile(
        path.join(snapshotPath, 'service-status.json'),
        JSON.stringify(serviceStatus, null, 2)
      );
      metadata.files_captured.push('service-status.json');

      // 6. Save metadata
      metadata.capture_completed = new Date().toISOString();
      metadata.capture_duration_ms = Date.now() - new Date(metadata.timestamp).getTime();
      
      await fs.writeFile(
        path.join(snapshotPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      this.log(`Snapshot completed: ${snapshotId} (${metadata.files_captured.length} files)`);
      
      return {
        success: true,
        snapshotId,
        snapshotPath,
        metadata,
        message: `Configuration snapshot captured successfully for ${deviceName}`
      };

    } catch (error) {
      this.log(`Snapshot failed: ${error.message}`);
      
      // Save error metadata
      metadata.capture_failed = true;
      metadata.capture_error = error.message;
      metadata.capture_completed = new Date().toISOString();
      
      try {
        await fs.writeFile(
          path.join(snapshotPath, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );
      } catch (metaError) {
        this.log(`Could not save error metadata: ${metaError.message}`);
      }

      throw new Error(`Failed to capture configuration snapshot: ${error.message}`);
    }
  }

  /**
   * Capture UCI export (complete configuration dump)
   */
  async captureUCIExport(deviceProfile) {
    const command = 'uci export 2>/dev/null';
    const result = await this.executeSSHCommand(deviceProfile, command);
    return result.stdout || '';
  }

  /**
   * Get list of available configuration files
   */
  async getConfigFileList(deviceProfile) {
    try {
      const command = 'ls /etc/config/ 2>/dev/null';
      const result = await this.executeSSHCommand(deviceProfile, command);
      const files = result.stdout.trim().split('\n').filter(f => f.length > 0);
      
      // Filter out common non-config files
      const excludeFiles = ['config', '.', '..', 'backup', 'temp'];
      return files.filter(f => !excludeFiles.includes(f));
      
    } catch (error) {
      this.log(`Could not get config file list, using defaults: ${error.message}`);
      // Return common OpenWRT config files as fallback
      return ['network', 'firewall', 'dhcp', 'system', 'wireless', 'uhttpd'];
    }
  }

  /**
   * Capture individual configuration file
   */
  async captureConfigFile(deviceProfile, configFile) {
    const command = `cat /etc/config/${configFile} 2>/dev/null`;
    const result = await this.executeSSHCommand(deviceProfile, command);
    return result.stdout || '';
  }

  /**
   * Capture comprehensive system information
   */
  async captureSystemInfo(deviceProfile) {
    const commands = {
      // Basic system info
      hostname: 'hostname',
      uptime: 'uptime',
      date: 'date',
      
      // OpenWRT version and build info
      openwrt_release: 'cat /etc/openwrt_release 2>/dev/null',
      openwrt_version: 'cat /etc/openwrt_version 2>/dev/null',
      banner: 'cat /etc/banner 2>/dev/null',
      
      // Hardware info
      kernel: 'uname -a',
      cpu_info: 'cat /proc/cpuinfo 2>/dev/null | head -20',
      memory_info: 'cat /proc/meminfo 2>/dev/null',
      
      // Storage info
      disk_usage: 'df -h',
      mount_points: 'mount',
      
      // Memory usage
      memory_usage: 'free -m',
      
      // Process info
      load_average: 'cat /proc/loadavg',
      running_processes: 'ps aux | head -20',
      
      // Network interfaces
      interfaces: 'ip addr show',
      routes: 'ip route show',
      
      // Package info
      installed_packages: 'opkg list-installed | wc -l',
      available_packages: 'opkg list | wc -l'
    };

    const systemInfo = {};
    
    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.executeSSHCommand(deviceProfile, command);
        systemInfo[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        systemInfo[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return systemInfo;
  }

  /**
   * Capture network status and connectivity
   */
  async captureNetworkStatus(deviceProfile) {
    const commands = {
      // Network configuration
      ip_addresses: 'ip addr show',
      routing_table: 'ip route show',
      arp_table: 'arp -a',
      
      // Interface status
      interface_stats: 'cat /proc/net/dev',
      wireless_info: 'iwconfig 2>/dev/null',
      
      // Connectivity tests
      dns_test: 'nslookup google.com 2>/dev/null',
      ping_gateway: 'ping -c 1 $(ip route | grep default | awk \'{print $3}\' | head -1) 2>/dev/null',
      
      // Firewall status
      iptables_rules: 'iptables -L -n',
      
      // DHCP info
      dhcp_leases: 'cat /var/dhcp.leases 2>/dev/null',
      
      // Bridge info
      bridge_info: 'brctl show 2>/dev/null'
    };

    const networkStatus = {};
    
    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.executeSSHCommand(deviceProfile, command);
        networkStatus[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        networkStatus[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return networkStatus;
  }

  /**
   * Capture service status
   */
  async captureServiceStatus(deviceProfile) {
    const commands = {
      // Service status
      running_services: '/etc/init.d/* enabled 2>/dev/null | grep -v "not found"',
      active_processes: 'ps aux',
      
      // UCI services
      uci_services: 'uci show | grep -E "\\.(enabled|disabled)=" | head -20',
      
      // Log info
      system_log: 'logread | tail -50',
      kernel_log: 'dmesg | tail -20',
      
      // Resource usage
      memory_usage: 'free -m',
      disk_usage: 'df -h',
      load_average: 'uptime'
    };

    const serviceStatus = {};
    
    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.executeSSHCommand(deviceProfile, command);
        serviceStatus[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        serviceStatus[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return serviceStatus;
  }

  /**
   * Execute SSH command with proper error handling
   */
  async executeSSHCommand(deviceProfile, command) {
    const { connection } = deviceProfile;
    
    let sshCommand = `ssh -o ConnectTimeout=${this.sshTimeout} -o StrictHostKeyChecking=no`;
    
    // Add key file if specified
    if (connection.key_file) {
      sshCommand += ` -i ${connection.key_file}`;
    }
    
    // Add port if specified
    if (connection.port && connection.port !== 22) {
      sshCommand += ` -p ${connection.port}`;
    }
    
    sshCommand += ` ${connection.username}@${connection.host} "${command}"`;
    
    this.log(`Executing: ${sshCommand}`);
    
    try {
      const result = await execAsync(sshCommand);
      return result;
    } catch (error) {
      // Some commands are expected to fail, don't throw unless it's a connection issue
      if (error.code === 255 || error.message.includes('Connection')) {
        throw error;
      }
      
      // Return partial result for commands that fail but produce output
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        code: error.code
      };
    }
  }

  /**
   * Get device name from profile
   */
  getDeviceName(deviceProfile) {
    return deviceProfile.name || 
           deviceProfile.device_name || 
           deviceProfile.connection?.host || 
           'unknown-device';
  }

  /**
   * List all snapshots for a device
   */
  async listSnapshots(deviceName, options = {}) {
    const deviceSnapshotDir = path.join(this.snapshotDir, deviceName);
    
    try {
      const snapshots = await fs.readdir(deviceSnapshotDir);
      const snapshotList = [];
      
      for (const snapshotDir of snapshots) {
        const metadataPath = path.join(deviceSnapshotDir, snapshotDir, 'metadata.json');
        
        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          
          // Apply date filter if specified
          if (options.since) {
            const snapshotDate = new Date(metadata.timestamp);
            const sinceDate = new Date(options.since);
            if (snapshotDate < sinceDate) continue;
          }
          
          snapshotList.push({
            id: metadata.snapshot_id,
            label: metadata.label,
            timestamp: metadata.timestamp,
            path: path.join(deviceSnapshotDir, snapshotDir),
            files_count: metadata.files_captured?.length || 0,
            has_errors: metadata.errors?.length > 0,
            metadata
          });
          
        } catch (error) {
          this.log(`Warning: Could not read metadata for ${snapshotDir}: ${error.message}`);
        }
      }
      
      // Sort by timestamp descending (newest first)
      snapshotList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return snapshotList;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // No snapshots directory exists yet
      }
      throw error;
    }
  }

  /**
   * Find snapshot by ID or label
   */
  async findSnapshot(deviceName, identifier) {
    const snapshots = await this.listSnapshots(deviceName);
    
    return snapshots.find(snapshot => 
      snapshot.id === identifier ||
      snapshot.label === identifier ||
      snapshot.id.includes(identifier)
    );
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(deviceName, snapshotId) {
    const snapshot = await this.findSnapshot(deviceName, snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    await fs.rm(snapshot.path, { recursive: true });
    this.log(`Deleted snapshot: ${snapshotId}`);
    
    return true;
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.debug) {
      console.error(`[ConfigSnapshot] ${message}`);
    }
  }
}