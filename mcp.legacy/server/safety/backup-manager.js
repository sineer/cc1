#!/usr/bin/env node

/**
 * Backup Manager for Target Device Testing
 * Creates and manages configuration backups for safe testing
 * Provides rollback capabilities in case of test failures
 */

import { EventEmitter } from 'events';

class BackupManager extends EventEmitter {
  constructor(sshConnection, safetyConfig = {}) {
    super();
    
    this.ssh = sshConnection;
    this.config = {
      backup_location: safetyConfig.backup_location || '/tmp/uci-backup',
      max_backups: safetyConfig.max_backups || 10,
      backup_retention_hours: safetyConfig.backup_retention_hours || 24,
      include_system_files: safetyConfig.include_system_files || false,
      compression: safetyConfig.compression || true,
      ...safetyConfig
    };

    this.backups = new Map();
    this.currentBackupId = null;
  }

  /**
   * Initialize backup system on target device
   */
  async initialize() {
    try {
      // Check if backup directory exists, create if needed
      await this.ssh.execute(`mkdir -p ${this.config.backup_location}`);
      
      // Verify UCI tools are available
      const uciCheck = await this.ssh.execute('which uci');
      if (!uciCheck.success) {
        throw new Error('UCI tools not available on target device');
      }

      // Clean old backups
      await this.cleanOldBackups();

      this.emit('backup_system_initialized', {
        timestamp: new Date().toISOString(),
        backup_location: this.config.backup_location
      });

      return true;
    } catch (error) {
      throw new Error(`Backup system initialization failed: ${error.message}`);
    }
  }

  /**
   * Create a comprehensive backup of the system
   */
  async createFullBackup(operationId) {
    try {
      const backupId = `backup-${operationId}-${Date.now()}`;
      const backupPath = `${this.config.backup_location}/${backupId}`;
      
      // Initialize backup system if not done
      await this.initialize();

      // Create backup directory
      await this.ssh.execute(`mkdir -p ${backupPath}`);

      const backupInfo = {
        id: backupId,
        operation_id: operationId,
        timestamp: new Date().toISOString(),
        backup_path: backupPath,
        files: [],
        size_bytes: 0,
        status: 'in_progress'
      };

      this.emit('backup_started', backupInfo);

      // Backup UCI configuration
      await this.backupUCIConfig(backupPath, backupInfo);

      // Backup network configuration files
      await this.backupNetworkFiles(backupPath, backupInfo);

      // Backup system files if requested
      if (this.config.include_system_files) {
        await this.backupSystemFiles(backupPath, backupInfo);
      }

      // Create backup manifest
      await this.createBackupManifest(backupPath, backupInfo);

      // Calculate backup size
      const sizeResult = await this.ssh.execute(`du -sb ${backupPath} | awk '{print $1}'`);
      backupInfo.size_bytes = parseInt(sizeResult.stdout.trim()) || 0;

      // Compress backup if enabled
      if (this.config.compression) {
        await this.compressBackup(backupPath, backupInfo);
      }

      backupInfo.status = 'completed';
      this.backups.set(backupId, backupInfo);
      this.currentBackupId = backupId;

      this.emit('backup_completed', backupInfo);

      return backupId;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Backup UCI configuration
   */
  async backupUCIConfig(backupPath, backupInfo) {
    try {
      // Export all UCI configuration directly to file on target
      const uciExportResult = await this.ssh.execute(`uci export > ${backupPath}/uci-export.txt`);
      if (uciExportResult.success) {
        backupInfo.files.push('uci-export.txt');
      }

      // Backup individual UCI configuration files
      const uciConfigs = await this.ssh.execute("ls /etc/config/ 2>/dev/null | grep -v '\\.'");
      
      if (uciConfigs.success) {
        const configs = uciConfigs.stdout.trim().split('\n').filter(c => c.trim());
        
        for (const config of configs) {
          if (config.trim()) {
            const copyResult = await this.ssh.execute(`cp /etc/config/${config} ${backupPath}/config-${config}.bak`);
            if (copyResult.success) {
              backupInfo.files.push(`config-${config}.bak`);
            }
          }
        }
      }

      // Create UCI show output for all packages
      const uciShowResult = await this.ssh.execute(`uci show > ${backupPath}/uci-show.txt`);
      if (uciShowResult.success) {
        backupInfo.files.push('uci-show.txt');
      }

    } catch (error) {
      throw new Error(`UCI backup failed: ${error.message}`);
    }
  }

  /**
   * Backup network configuration files
   */
  async backupNetworkFiles(backupPath, backupInfo) {
    try {
      const networkFiles = [
        '/etc/config/network',
        '/etc/config/firewall', 
        '/etc/config/dhcp',
        '/etc/config/wireless',
        '/etc/hosts',
        '/etc/resolv.conf',
        '/etc/dropbear/authorized_keys'
      ];

      for (const file of networkFiles) {
        const exists = await this.ssh.execute(`test -f ${file} && echo "EXISTS"`);
        if (exists.stdout.includes('EXISTS')) {
          const filename = file.replace(/\//g, '_').replace(/^_/, '');
          const copyResult = await this.ssh.execute(`cp ${file} ${backupPath}/${filename}.bak`);
          if (copyResult.success) {
            backupInfo.files.push(`${filename}.bak`);
          }
        }
      }

      // Backup current network state
      const networkStateResult = await this.ssh.execute(`{ ip addr show; echo; ip route show; } > ${backupPath}/network-state.txt`);
      if (networkStateResult.success) {
        backupInfo.files.push('network-state.txt');
      }

    } catch (error) {
      throw new Error(`Network files backup failed: ${error.message}`);
    }
  }

  /**
   * Backup system files
   */
  async backupSystemFiles(backupPath, backupInfo) {
    try {
      const systemFiles = [
        '/etc/passwd',
        '/etc/shadow',
        '/etc/group',
        '/etc/inittab',
        '/etc/rc.local',
        '/etc/crontabs/root'
      ];

      for (const file of systemFiles) {
        const exists = await this.ssh.execute(`test -f ${file} && echo "EXISTS"`);
        if (exists.stdout.includes('EXISTS')) {
          const filename = file.replace(/\//g, '_').replace(/^_/, '');
          const copyResult = await this.ssh.execute(`cp ${file} ${backupPath}/${filename}.bak`);
          if (copyResult.success) {
            backupInfo.files.push(`${filename}.bak`);
          }
        }
      }

    } catch (error) {
      throw new Error(`System files backup failed: ${error.message}`);
    }
  }

  /**
   * Create backup manifest
   */
  async createBackupManifest(backupPath, backupInfo) {
    try {
      const manifest = {
        backup_id: backupInfo.id,
        operation_id: backupInfo.operation_id,
        timestamp: backupInfo.timestamp,
        device_info: await this.getDeviceInfo(),
        files: backupInfo.files,
        backup_config: this.config,
        created_by: 'UCI Test Framework'
      };

      // Create manifest using echo to avoid SSH command length limits
      const manifestJson = JSON.stringify(manifest, null, 2).replace(/'/g, "'\\''");
      await this.ssh.execute(`echo '${manifestJson}' > ${backupPath}/manifest.json`);
      backupInfo.files.push('manifest.json');

    } catch (error) {
      throw new Error(`Manifest creation failed: ${error.message}`);
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo() {
    try {
      const commands = {
        hostname: 'hostname',
        kernel: 'uname -r',
        openwrt_release: 'cat /etc/openwrt_release 2>/dev/null || echo "Unknown"',
        model: 'cat /tmp/sysinfo/model 2>/dev/null || echo "Unknown"',
        board: 'cat /tmp/sysinfo/board_name 2>/dev/null || echo "Unknown"'
      };

      const info = {};
      for (const [key, command] of Object.entries(commands)) {
        const result = await this.ssh.execute(command);
        info[key] = result.success ? result.stdout.trim() : 'Unknown';
      }

      return info;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Compress backup
   */
  async compressBackup(backupPath, backupInfo) {
    try {
      const compressedPath = `${backupPath}.tar.gz`;
      const compressResult = await this.ssh.execute(`cd ${this.config.backup_location} && tar -czf ${backupInfo.id}.tar.gz ${backupInfo.id}`);
      
      if (compressResult.success) {
        // Remove uncompressed directory
        await this.ssh.execute(`rm -rf ${backupPath}`);
        backupInfo.backup_path = compressedPath;
        backupInfo.compressed = true;
      }

    } catch (error) {
      // Compression failed, but backup still exists uncompressed
      backupInfo.compression_error = error.message;
    }
  }

  /**
   * Restore backup
   */
  async restoreBackup(backupId) {
    try {
      const backupInfo = this.backups.get(backupId);
      if (!backupInfo) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      this.emit('restore_started', {
        backup_id: backupId,
        timestamp: new Date().toISOString()
      });

      let restorePath = backupInfo.backup_path;

      // Decompress if needed
      if (backupInfo.compressed) {
        const decompressResult = await this.ssh.execute(`cd ${this.config.backup_location} && tar -xzf ${backupId}.tar.gz`);
        if (!decompressResult.success) {
          throw new Error(`Backup decompression failed: ${decompressResult.stderr}`);
        }
        restorePath = `${this.config.backup_location}/${backupId}`;
      }

      // Restore UCI configuration
      await this.restoreUCIConfig(restorePath);

      // Commit and reload configuration
      const commitResult = await this.ssh.execute('uci commit && /etc/init.d/network reload');
      if (!commitResult.success) {
        throw new Error(`Configuration commit failed: ${commitResult.stderr}`);
      }

      this.emit('restore_completed', {
        backup_id: backupId,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      throw new Error(`Backup restore failed: ${error.message}`);
    }
  }

  /**
   * Restore UCI configuration
   */
  async restoreUCIConfig(restorePath) {
    try {
      // Check if UCI export file exists
      const uciExportExists = await this.ssh.execute(`test -f ${restorePath}/uci-export.txt && echo "EXISTS"`);
      
      if (uciExportExists.stdout.includes('EXISTS')) {
        // Restore from UCI export
        const restoreResult = await this.ssh.execute(`uci import < ${restorePath}/uci-export.txt`);
        if (!restoreResult.success) {
          throw new Error(`UCI import failed: ${restoreResult.stderr}`);
        }
      } else {
        // Restore individual config files
        const configFiles = await this.ssh.execute(`ls ${restorePath}/config-*.bak 2>/dev/null || true`);
        
        if (configFiles.success && configFiles.stdout.trim()) {
          const files = configFiles.stdout.trim().split('\n');
          
          for (const file of files) {
            const configName = file.replace(/.*config-/, '').replace('.bak', '');
            const copyResult = await this.ssh.execute(`cp ${file} /etc/config/${configName}`);
            if (!copyResult.success) {
              throw new Error(`Failed to restore config ${configName}: ${copyResult.stderr}`);
            }
          }
        }
      }

    } catch (error) {
      throw new Error(`UCI restore failed: ${error.message}`);
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const backupsList = [];
      
      for (const [id, info] of this.backups) {
        backupsList.push({
          id: info.id,
          operation_id: info.operation_id,
          timestamp: info.timestamp,
          size_bytes: info.size_bytes,
          file_count: info.files.length,
          compressed: info.compressed || false,
          status: info.status
        });
      }

      return backupsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      throw new Error(`Backup listing failed: ${error.message}`);
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId) {
    try {
      const backupInfo = this.backups.get(backupId);
      if (!backupInfo) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Delete backup files
      const deletePath = backupInfo.compressed ? 
        `${this.config.backup_location}/${backupId}.tar.gz` : 
        backupInfo.backup_path;
      
      const deleteResult = await this.ssh.execute(`rm -rf ${deletePath}`);
      if (!deleteResult.success) {
        throw new Error(`Failed to delete backup files: ${deleteResult.stderr}`);
      }

      // Remove from tracking
      this.backups.delete(backupId);

      this.emit('backup_deleted', {
        backup_id: backupId,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      throw new Error(`Backup deletion failed: ${error.message}`);
    }
  }

  /**
   * Clean old backups
   */
  async cleanOldBackups() {
    try {
      const cutoffTime = Date.now() - (this.config.backup_retention_hours * 60 * 60 * 1000);
      
      const toDelete = [];
      for (const [id, info] of this.backups) {
        const backupTime = new Date(info.timestamp).getTime();
        if (backupTime < cutoffTime) {
          toDelete.push(id);
        }
      }

      // Keep at least the most recent backup
      if (toDelete.length >= this.backups.size) {
        toDelete.pop();
      }

      for (const id of toDelete) {
        await this.deleteBackup(id);
      }

      return toDelete.length;
    } catch (error) {
      throw new Error(`Backup cleanup failed: ${error.message}`);
    }
  }

  /**
   * Get backup statistics
   */
  getBackupStats() {
    return {
      total_backups: this.backups.size,
      current_backup_id: this.currentBackupId,
      backup_location: this.config.backup_location,
      retention_hours: this.config.backup_retention_hours,
      max_backups: this.config.max_backups,
      config: this.config
    };
  }
}

export { BackupManager };