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
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotId = `${timestamp}-${label}`;
    const deviceName = this.getDeviceName(deviceProfile);
    const snapshotPath = path.join(this.snapshotDir, deviceName, snapshotId);
    
    this.log(`\n🚀 Starting snapshot capture for ${deviceName}: ${snapshotId}`);
    this.log(`📋 Device profile: ${JSON.stringify(deviceProfile.connection, null, 2)}`);
    this.log(`📁 Snapshot path: ${snapshotPath}`);
    this.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    // Create snapshot directory
    const dirStart = Date.now();
    this.log('\n📂 Creating snapshot directory...');
    await fs.mkdir(snapshotPath, { recursive: true });
    this.log(`✓ Directory created in ${Date.now() - dirStart}ms`);
    
    // Test SSH connection first (for verbose logging)
    if (this.debug) {
      await this.testSSHConnection(deviceProfile);
    }

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
      this.log('\n=== Phase 1: Capturing UCI Export ===');
      const uciExportStart = Date.now();
      this.log('📥 Executing UCI export command...');
      const uciExport = await this.captureUCIExport(deviceProfile);
      const uciExportSize = Buffer.byteLength(uciExport, 'utf8');
      const uciExportDuration = Date.now() - uciExportStart;
      
      this.log(`📝 Writing UCI export to file...`);
      const writeStart = Date.now();
      await fs.writeFile(path.join(snapshotPath, 'uci-export.txt'), uciExport);
      const writeDuration = Date.now() - writeStart;
      
      metadata.files_captured.push('uci-export.txt');
      this.log(`✓ UCI export captured: ${uciExportSize} bytes in ${uciExportDuration}ms`);
      this.log(`  Transfer rate: ${((uciExportSize / 1024) / (uciExportDuration / 1000)).toFixed(2)} KB/s`);
      this.log(`  File write: ${writeDuration}ms`);

      // 2. Capture individual config files (human-readable format)
      this.log('\n=== Phase 2: Capturing Individual Config Files ===');
      const configFilesStart = Date.now();
      this.log('📋 Getting config file list...');
      const configFiles = await this.getConfigFileList(deviceProfile);
      this.log(`📁 Found ${configFiles.length} config files to capture: ${configFiles.join(', ')}`);
      
      let totalConfigSize = 0;
      let totalTransferTime = 0;
      let successCount = 0;
      
      for (const configFile of configFiles) {
        try {
          const fileStart = Date.now();
          this.log(`  📥 Capturing ${configFile}...`);
          const content = await this.captureConfigFile(deviceProfile, configFile);
          const fileSize = Buffer.byteLength(content, 'utf8');
          const transferTime = Date.now() - fileStart;
          
          this.log(`  📝 Writing ${configFile}.conf...`);
          const writeStart = Date.now();
          await fs.writeFile(path.join(snapshotPath, `${configFile}.conf`), content);
          const writeTime = Date.now() - writeStart;
          
          metadata.files_captured.push(`${configFile}.conf`);
          totalConfigSize += fileSize;
          totalTransferTime += transferTime;
          successCount++;
          
          this.log(`  ✓ ${configFile}: ${fileSize} bytes in ${transferTime}ms (write: ${writeTime}ms)`);
          if (transferTime > 0) {
            this.log(`    Transfer rate: ${((fileSize / 1024) / (transferTime / 1000)).toFixed(2)} KB/s`);
          }
        } catch (error) {
          this.log(`  ✗ ${configFile}: ${error.message}`);
          metadata.errors.push({
            file: configFile,
            error: error.message
          });
        }
      }
      
      const configPhaseTime = Date.now() - configFilesStart;
      this.log(`✓ Config files phase complete: ${successCount}/${configFiles.length} files successful`);
      this.log(`  Total size: ${(totalConfigSize / 1024).toFixed(2)} KB`);
      this.log(`  Phase duration: ${configPhaseTime}ms`);
      if (totalTransferTime > 0) {
        this.log(`  Average transfer rate: ${((totalConfigSize / 1024) / (totalTransferTime / 1000)).toFixed(2)} KB/s`);
      }

      // 3. Capture system information
      this.log('\n=== Phase 3: Capturing System Information ===');
      const systemInfoStart = Date.now();
      this.log('🖥️ Collecting system information...');
      const systemInfo = await this.captureSystemInfo(deviceProfile);
      const systemInfoJson = JSON.stringify(systemInfo, null, 2);
      const systemInfoSize = Buffer.byteLength(systemInfoJson, 'utf8');
      const systemInfoDuration = Date.now() - systemInfoStart;
      
      this.log('📝 Writing system-info.json...');
      const systemWriteStart = Date.now();
      await fs.writeFile(
        path.join(snapshotPath, 'system-info.json'), 
        systemInfoJson
      );
      const systemWriteDuration = Date.now() - systemWriteStart;
      
      metadata.files_captured.push('system-info.json');
      metadata.system_info = systemInfo;
      this.log(`✓ System info captured: ${systemInfoSize} bytes in ${systemInfoDuration}ms`);
      this.log(`  File write: ${systemWriteDuration}ms`);

      // 4. Capture network status
      this.log('\n=== Phase 4: Capturing Network Status ===');
      const networkStart = Date.now();
      this.log('🌐 Collecting network status...');
      const networkStatus = await this.captureNetworkStatus(deviceProfile);
      const networkJson = JSON.stringify(networkStatus, null, 2);
      const networkSize = Buffer.byteLength(networkJson, 'utf8');
      const networkDuration = Date.now() - networkStart;
      
      this.log('📝 Writing network-status.json...');
      const networkWriteStart = Date.now();
      await fs.writeFile(
        path.join(snapshotPath, 'network-status.json'),
        networkJson
      );
      const networkWriteDuration = Date.now() - networkWriteStart;
      
      metadata.files_captured.push('network-status.json');
      this.log(`✓ Network status captured: ${networkSize} bytes in ${networkDuration}ms`);
      this.log(`  File write: ${networkWriteDuration}ms`);

      // 5. Capture service status
      this.log('\n=== Phase 5: Capturing Service Status ===');
      const serviceStart = Date.now();
      this.log('⚙️ Collecting service status...');
      const serviceStatus = await this.captureServiceStatus(deviceProfile);
      const serviceJson = JSON.stringify(serviceStatus, null, 2);
      const serviceSize = Buffer.byteLength(serviceJson, 'utf8');
      const serviceDuration = Date.now() - serviceStart;
      
      this.log('📝 Writing service-status.json...');
      const serviceWriteStart = Date.now();
      await fs.writeFile(
        path.join(snapshotPath, 'service-status.json'),
        serviceJson
      );
      const serviceWriteDuration = Date.now() - serviceWriteStart;
      
      metadata.files_captured.push('service-status.json');
      this.log(`✓ Service status captured: ${serviceSize} bytes in ${serviceDuration}ms`);
      this.log(`  File write: ${serviceWriteDuration}ms`);

      // 6. Save metadata
      this.log('\n=== Phase 6: Saving Metadata ===');
      metadata.capture_completed = new Date().toISOString();
      metadata.capture_duration_ms = Date.now() - startTime;
      
      const metadataJson = JSON.stringify(metadata, null, 2);
      await fs.writeFile(
        path.join(snapshotPath, 'metadata.json'),
        metadataJson
      );
      
      // Calculate total snapshot size
      let totalSize = 0;
      for (const file of metadata.files_captured) {
        try {
          const stat = await fs.stat(path.join(snapshotPath, file));
          totalSize += stat.size;
        } catch (e) {
          // Ignore stat errors
        }
      }

      this.log(`\n=== 🎉 Snapshot Summary ===`);
      this.log(`✅ Snapshot completed successfully: ${snapshotId}`);
      this.log(`📁 Total files captured: ${metadata.files_captured.length}`);
      this.log(`📊 Total size: ${(totalSize / 1024).toFixed(2)} KB (${totalSize} bytes)`);
      this.log(`⏱️ Total duration: ${metadata.capture_duration_ms}ms (${(metadata.capture_duration_ms / 1000).toFixed(2)}s)`);
      this.log(`🎯 Average throughput: ${((totalSize / 1024) / (metadata.capture_duration_ms / 1000)).toFixed(2)} KB/s`);
      this.log(`📂 Snapshot location: ${snapshotPath}`);
      
      if (metadata.errors.length > 0) {
        this.log(`⚠️ Warnings: ${metadata.errors.length} files had issues:`);
        metadata.errors.forEach(error => {
          this.log(`  • ${error.file}: ${error.error}`);
        });
      } else {
        this.log(`✨ No errors or warnings - perfect capture!`);
      }
      
      // Performance metrics in verbose mode
      if (this.debug) {
        this.log(`\n📈 Detailed Performance Metrics:`);
        this.log(`  • Average file size: ${(totalSize / metadata.files_captured.length / 1024).toFixed(2)} KB`);
        this.log(`  • Files per second: ${(metadata.files_captured.length / (metadata.capture_duration_ms / 1000)).toFixed(2)}`);
        this.log(`  • Capture started: ${new Date(startTime).toISOString()}`);
        this.log(`  • Capture finished: ${metadata.capture_completed}`);
      }
      
      return {
        success: true,
        snapshotId,
        snapshotPath,
        metadata,
        message: `Configuration snapshot captured successfully for ${deviceName}`
      };

    } catch (error) {
      this.log(`\n=== ❌ Snapshot Failed ===`);
      this.log(`💥 Error: ${error.message}`);
      this.log(`⏱️ Failed after: ${Date.now() - startTime}ms`);
      
      if (this.debug) {
        this.log(`🔍 Error details:`);
        this.log(`  • Error type: ${error.constructor.name}`);
        this.log(`  • Stack trace: ${error.stack}`);
        this.log(`  • Device: ${deviceName}`);
        this.log(`  • Profile: ${JSON.stringify(deviceProfile.connection, null, 2)}`);
      }
      
      // Save error metadata
      metadata.capture_failed = true;
      metadata.capture_error = error.message;
      metadata.capture_completed = new Date().toISOString();
      metadata.capture_duration_ms = Date.now() - startTime;
      
      try {
        this.log(`💾 Saving error metadata...`);
        await fs.writeFile(
          path.join(snapshotPath, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );
        this.log(`✓ Error metadata saved to: ${path.join(snapshotPath, 'metadata.json')}`);
      } catch (metaError) {
        this.log(`❌ Could not save error metadata: ${metaError.message}`);
      }

      throw new Error(`Failed to capture configuration snapshot: ${error.message}`);
    }
  }

  /**
   * Capture UCI export (complete configuration dump)
   */
  async captureUCIExport(deviceProfile) {
    const command = 'uci export 2>/dev/null';
    this.log('  Running: uci export');
    const result = await this.executeSSHCommand(deviceProfile, command);
    const lineCount = result.stdout ? result.stdout.split('\n').length : 0;
    this.log(`  UCI export complete: ${lineCount} lines`);
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
      this.log(`  ⚠️  Could not get config file list: ${error.message}`);
      // Return common OpenWRT config files as fallback
      const defaults = ['network', 'firewall', 'dhcp', 'system', 'wireless', 'uhttpd'];
      this.log(`  Using default config list: ${defaults.join(', ')}`);
      return defaults;
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
    this.log('🖥️ Collecting comprehensive system information...');
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
    let successCount = 0;
    let errorCount = 0;
    
    for (const [key, command] of Object.entries(commands)) {
      let cmdStart = Date.now();
      try {
        this.log(`  🔄 Executing: ${key} (${command.substring(0, 50)}${command.length > 50 ? '...' : ''})`);
        cmdStart = Date.now();
        const result = await this.executeSSHCommand(deviceProfile, command);
        const cmdDuration = Date.now() - cmdStart;
        
        systemInfo[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        successCount++;
        
        const outputLength = result.stdout.length;
        this.log(`    ✓ ${key}: ${outputLength} bytes in ${cmdDuration}ms`);
        if (this.debug && outputLength > 0) {
          this.log(`      Rate: ${((outputLength / 1024) / (cmdDuration / 1000)).toFixed(2)} KB/s`);
          // Show first line of output for context
          const firstLine = result.stdout.split('\n')[0].substring(0, 80);
          this.log(`      Preview: "${firstLine}${result.stdout.length > 80 ? '...' : ''}"`);
        }
      } catch (error) {
        const cmdDuration = Date.now() - cmdStart;
        systemInfo[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        errorCount++;
        this.log(`    ❌ ${key}: ${error.message}`);
      }
    }
    
    this.log(`  📊 System info phase complete: ${successCount} success, ${errorCount} errors`);
    return systemInfo;
  }

  /**
   * Capture network status and connectivity
   */
  async captureNetworkStatus(deviceProfile) {
    this.log('🌐 Collecting comprehensive network status...');
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
    let successCount = 0;
    let errorCount = 0;
    
    for (const [key, command] of Object.entries(commands)) {
      let cmdStart = Date.now();
      try {
        this.log(`  🔄 Executing: ${key} (${command.substring(0, 50)}${command.length > 50 ? '...' : ''})`);
        cmdStart = Date.now();
        const result = await this.executeSSHCommand(deviceProfile, command);
        const cmdDuration = Date.now() - cmdStart;
        
        networkStatus[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        successCount++;
        
        const outputLength = result.stdout.length;
        this.log(`    ✓ ${key}: ${outputLength} bytes in ${cmdDuration}ms`);
        if (this.debug && outputLength > 0) {
          this.log(`      Rate: ${((outputLength / 1024) / (cmdDuration / 1000)).toFixed(2)} KB/s`);
          // Show first line of output for network context
          const firstLine = result.stdout.split('\n')[0].substring(0, 80);
          this.log(`      Preview: "${firstLine}${result.stdout.length > 80 ? '...' : ''}"`);
        }
      } catch (error) {
        const cmdDuration = Date.now() - cmdStart;
        networkStatus[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        errorCount++;
        this.log(`    ❌ ${key}: ${error.message}`);
      }
    }
    
    this.log(`  📊 Network status phase complete: ${successCount} success, ${errorCount} errors`);
    return networkStatus;
  }

  /**
   * Capture service status
   */
  async captureServiceStatus(deviceProfile) {
    this.log('⚙️ Collecting comprehensive service status...');
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
    let successCount = 0;
    let errorCount = 0;
    
    for (const [key, command] of Object.entries(commands)) {
      let cmdStart = Date.now();
      try {
        this.log(`  🔄 Executing: ${key} (${command.substring(0, 50)}${command.length > 50 ? '...' : ''})`);
        cmdStart = Date.now();
        const result = await this.executeSSHCommand(deviceProfile, command);
        const cmdDuration = Date.now() - cmdStart;
        
        serviceStatus[key] = {
          command,
          output: result.stdout,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        successCount++;
        
        const outputLength = result.stdout.length;
        this.log(`    ✓ ${key}: ${outputLength} bytes in ${cmdDuration}ms`);
        if (this.debug && outputLength > 0) {
          this.log(`      Rate: ${((outputLength / 1024) / (cmdDuration / 1000)).toFixed(2)} KB/s`);
          // Show first line of output for service context
          const firstLine = result.stdout.split('\n')[0].substring(0, 80);
          this.log(`      Preview: "${firstLine}${result.stdout.length > 80 ? '...' : ''}"`);
        }
      } catch (error) {
        const cmdDuration = Date.now() - cmdStart;
        serviceStatus[key] = {
          command,
          error: error.message,
          timestamp: new Date().toISOString(),
          execution_time_ms: cmdDuration
        };
        errorCount++;
        this.log(`    ❌ ${key}: ${error.message}`);
      }
    }
    
    this.log(`  📊 Service status phase complete: ${successCount} success, ${errorCount} errors`);
    return serviceStatus;
  }

  /**
   * Execute SSH command with proper error handling
   */
  async executeSSHCommand(deviceProfile, command) {
    const { connection } = deviceProfile;
    
    let sshCommand = '';
    
    // Log connection details in verbose mode
    if (this.debug && (command.includes('echo') || command.includes('uci export'))) {
      this.log(`\n  🔗 SSH Connection Details:`);
      this.log(`    🏠 Host: ${connection.host}:${connection.port || 22}`);
      this.log(`    👤 User: ${connection.username || 'root'}`);
      this.log(`    🔐 Auth: ${connection.key_file ? `key file (${connection.key_file})` : connection.password !== undefined ? 'password auth' : 'default ssh-agent'}`);
      this.log(`    ⏰ Timeout: ${this.sshTimeout}s`);
    }
    
    // Handle password authentication (including empty passwords)
    if (connection.password !== undefined) {
      // Use sshpass for password authentication to avoid prompting
      // Note: sshpass must be installed on the system
      sshCommand = `sshpass -p "${connection.password || ''}" ssh`;
    } else {
      sshCommand = 'ssh';
    }
    
    // Add standard SSH options
    sshCommand += ` -o ConnectTimeout=${this.sshTimeout} -o StrictHostKeyChecking=no`;
    
    // For password auth, disable batch mode to allow sshpass to work
    if (connection.password !== undefined) {
      sshCommand += ' -o BatchMode=no -o PasswordAuthentication=yes';
    }
    
    // Add key file if specified (takes precedence over password)
    if (connection.key_file) {
      sshCommand += ` -i ${connection.key_file}`;
    }
    
    // Add port if specified
    if (connection.port && connection.port !== 22) {
      sshCommand += ` -p ${connection.port}`;
    }
    
    sshCommand += ` ${connection.username}@${connection.host} "${command}"`;
    
    // Only log full SSH command in very verbose scenarios
    if (this.debug && command.length < 100) {
      this.log(`    CMD: ${command}`);
    }
    
    try {
      const result = await execAsync(sshCommand);
      return result;
    } catch (error) {
      // Check for sshpass not found error
      if (error.message.includes('sshpass') && error.message.includes('not found')) {
        throw new Error('sshpass is required for password authentication but not installed. Please install sshpass or use SSH key authentication.');
      }
      
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
   * Test SSH connection and measure latency (verbose mode only)
   */
  async testSSHConnection(deviceProfile) {
    this.log('\n🔌 Testing SSH connection...');
    const connectionStart = Date.now();
    
    try {
      const testCommand = 'echo "SSH connection test"';
      const result = await this.executeSSHCommand(deviceProfile, testCommand);
      const latency = Date.now() - connectionStart;
      
      this.log(`✓ SSH connection successful`);
      this.log(`  Connection latency: ${latency}ms`);
      this.log(`  Test response: "${result.stdout.trim()}"`);
      
      // Additional connection diagnostics
      const pingStart = Date.now();
      try {
        const pingResult = await this.executeSSHCommand(deviceProfile, 'echo $(($(date +%s%3N)))');
        const serverTime = parseInt(pingResult.stdout.trim());
        const clientTime = Date.now();
        this.log(`  Server timestamp: ${serverTime}`);
        this.log(`  Client timestamp: ${clientTime}`);
        this.log(`  Time sync check: ${Math.abs(clientTime - serverTime)}ms difference`);
      } catch (timeError) {
        this.log(`  ⚠️ Could not check time sync: ${timeError.message}`);
      }
      
    } catch (error) {
      this.log(`❌ SSH connection test failed: ${error.message}`);
      throw new Error(`SSH connection test failed: ${error.message}`);
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
    
    this.log(`Listing snapshots for ${deviceName} in ${deviceSnapshotDir}`);
    
    try {
      const snapshots = await fs.readdir(deviceSnapshotDir);
      const snapshotList = [];
      this.log(`Found ${snapshots.length} snapshot directories`);
      
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
          this.log(`  ⚠️  Could not read metadata for ${snapshotDir}: ${error.message}`);
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
    this.log(`Deleting snapshot: ${snapshotId} for device: ${deviceName}`);
    const snapshot = await this.findSnapshot(deviceName, snapshotId);
    
    if (!snapshot) {
      this.log(`  ✗ Snapshot not found: ${snapshotId}`);
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    this.log(`  Deleting directory: ${snapshot.path}`);
    await fs.rm(snapshot.path, { recursive: true });
    this.log(`  ✓ Deleted snapshot: ${snapshotId}`);
    
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