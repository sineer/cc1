/**
 * Dashboard Data Processor - Device configuration data processing
 * Handles snapshot data loading, statistics calculation, and diff processing
 */

import { promises as fs } from 'fs';
import path from 'path';
import { StatisticsEngine } from './statistics-engine.js';

export class DashboardDataProcessor {
  constructor(engines) {
    this.snapshotEngine = engines.snapshotEngine;
    this.diffEngine = engines.diffEngine;
    this.debug = engines.debug || false;
    
    // Initialize StatisticsEngine
    this.statisticsEngine = new StatisticsEngine({
      snapshotEngine: this.snapshotEngine,
      diffEngine: this.diffEngine,
      debug: this.debug
    });
  }

  /**
   * Process device data for dashboard generation
   */
  async processDeviceData(deviceName, days = 7) {
    this.log(`Processing device data for ${deviceName} (${days} days)`);
    
    // Load snapshots for device
    const snapshots = await this.snapshotEngine.listSnapshots(deviceName, {
      since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    });

    if (snapshots.length === 0) {
      return {
        snapshots: [],
        snapshotData: {},
        statistics: this.statisticsEngine.getEmptyStatistics(),
        comparisons: 0,
        filesChanged: 0
      };
    }

    // Load snapshot data for embedding
    const snapshotData = await this.loadAllSnapshotData(deviceName, snapshots);
    
    // Calculate comprehensive statistics
    const statistics = await this.statisticsEngine.calculateStatistics(deviceName, snapshots);
    
    // Generate diff files for comparisons
    const diffs = await this.generateDiffFiles(deviceName, snapshots);
    
    return {
      snapshots,
      snapshotData,
      statistics,
      comparisons: diffs.length,
      filesChanged: statistics.packageStats.modified + statistics.sectionStats.modified
    };
  }

  /**
   * Load all snapshot data for embedding in dashboard
   */
  async loadAllSnapshotData(deviceName, snapshots) {
    const snapshotData = {};
    
    for (const snapshot of snapshots) {
      const snapshotDir = path.join('./config-snapshots', deviceName, snapshot.id);
      
      snapshotData[snapshot.id] = {
        metadata: await this.loadSnapshotMetadata(snapshotDir),
        systemInfo: await this.loadSystemInfo(snapshotDir),
        networkStatus: await this.loadNetworkStatus(snapshotDir),
        serviceStatus: await this.loadServiceStatus(snapshotDir),
        configFiles: await this.loadConfigFiles(snapshotDir)
      };
    }
    
    return snapshotData;
  }

  /**
   * Load snapshot metadata
   */
  async loadSnapshotMetadata(snapshotDir) {
    try {
      const metadataPath = path.join(snapshotDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(metadataContent);
    } catch (error) {
      this.log(`Warning: Could not load metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Load system information
   */
  async loadSystemInfo(snapshotDir) {
    try {
      const systemInfoPath = path.join(snapshotDir, 'system-info.json');
      const systemInfoContent = await fs.readFile(systemInfoPath, 'utf8');
      return JSON.parse(systemInfoContent);
    } catch (error) {
      this.log(`Warning: Could not load system info: ${error.message}`);
      return null;
    }
  }

  /**
   * Load network status
   */
  async loadNetworkStatus(snapshotDir) {
    try {
      const networkPath = path.join(snapshotDir, 'network-status.json');
      const networkContent = await fs.readFile(networkPath, 'utf8');
      return JSON.parse(networkContent);
    } catch (error) {
      this.log(`Warning: Could not load network status: ${error.message}`);
      return null;
    }
  }

  /**
   * Load service status
   */
  async loadServiceStatus(snapshotDir) {
    try {
      const servicePath = path.join(snapshotDir, 'service-status.json');
      const serviceContent = await fs.readFile(servicePath, 'utf8');
      return JSON.parse(serviceContent);
    } catch (error) {
      this.log(`Warning: Could not load service status: ${error.message}`);
      return null;
    }
  }

  /**
   * Load configuration files
   */
  async loadConfigFiles(snapshotDir) {
    const configFiles = {};
    const configDir = path.join(snapshotDir, 'config');
    
    try {
      const files = await fs.readdir(configDir);
      
      for (const file of files) {
        if (file.endsWith('.conf')) {
          try {
            const filePath = path.join(configDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            configFiles[file] = content;
          } catch (error) {
            this.log(`Warning: Could not load config file ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.log(`Warning: Could not read config directory: ${error.message}`);
    }
    
    return configFiles;
  }


  /**
   * Generate diff files for all snapshot pairs
   */
  async generateDiffFiles(deviceName, snapshots) {
    const diffs = [];
    
    for (let i = 0; i < snapshots.length - 1; i++) {
      const currentSnapshot = snapshots[i];
      const previousSnapshot = snapshots[i + 1];
      
      try {
        const diffPath = await this.diffEngine.compareSnapshots(
          deviceName, 
          previousSnapshot.label, 
          currentSnapshot.label
        );
        
        diffs.push({
          before: previousSnapshot,
          after: currentSnapshot,
          path: diffPath
        });
        
      } catch (error) {
        this.log(`Warning: Could not generate diff file for ${previousSnapshot.id} -> ${currentSnapshot.id}: ${error.message}`);
      }
    }
    
    return diffs;
  }

  /**
   * Get snapshot path by device and snapshot ID
   */
  async getSnapshotPath(deviceName, snapshotId) {
    try {
      const snapshots = await this.snapshotEngine.listSnapshots(deviceName);
      const snapshot = snapshots.find(s => s.id === snapshotId || s.label === snapshotId);
      return snapshot ? snapshot.path : null;
    } catch (error) {
      this.log(`Error getting snapshot path: ${error.message}`);
      return null;
    }
  }

  /**
   * Process historical data for trends - delegates to StatisticsEngine
   */
  async processHistoricalTrends(deviceName, days = 30) {
    return this.statisticsEngine.processHistoricalTrends(deviceName, days);
  }

  /**
   * Validate snapshot data integrity
   */
  async validateSnapshotData(snapshotData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    Object.entries(snapshotData).forEach(([snapshotId, data]) => {
      if (!data.metadata) {
        validation.warnings.push(`Missing metadata for snapshot ${snapshotId}`);
      }
      
      if (!data.configFiles || Object.keys(data.configFiles).length === 0) {
        validation.warnings.push(`No config files found for snapshot ${snapshotId}`);
      }
      
      if (!data.systemInfo) {
        validation.warnings.push(`Missing system info for snapshot ${snapshotId}`);
      }
    });

    return validation;
  }

  /**
   * Log debug messages
   */
  log(message) {
    if (this.debug) {
      console.error(`[DataProcessor] ${message}`);
    }
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return {
      hasSnapshotEngine: !!this.snapshotEngine,
      hasDiffEngine: !!this.diffEngine,
      debug: this.debug
    };
  }
}