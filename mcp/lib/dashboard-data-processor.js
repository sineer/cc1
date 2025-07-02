/**
 * Dashboard Data Processor - Device configuration data processing
 * Handles snapshot data loading, statistics calculation, and diff processing
 */

import { promises as fs } from 'fs';
import path from 'path';

export class DashboardDataProcessor {
  constructor(engines) {
    this.snapshotEngine = engines.snapshotEngine;
    this.diffEngine = engines.diffEngine;
    this.debug = engines.debug || false;
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
        statistics: this.getEmptyStatistics(),
        comparisons: 0,
        filesChanged: 0
      };
    }

    // Load snapshot data for embedding
    const snapshotData = await this.loadAllSnapshotData(deviceName, snapshots);
    
    // Calculate comprehensive statistics
    const statistics = await this.calculateStatistics(deviceName, snapshots);
    
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
   * Calculate comprehensive statistics across all snapshots
   */
  async calculateStatistics(deviceName, snapshots) {
    this.log(`Calculating statistics for ${snapshots.length} snapshots`);
    
    const stats = {
      packageStats: { added: 0, removed: 0, modified: 0 },
      sectionStats: { added: 0, removed: 0, modified: 0 },
      optionStats: { added: 0, removed: 0, modified: 0 },
      perSnapshotStats: {},
      timeRange: {
        start: snapshots[snapshots.length - 1]?.timestamp,
        end: snapshots[0]?.timestamp
      }
    };

    // Calculate per-snapshot statistics
    for (let i = 0; i < snapshots.length - 1; i++) {
      const currentSnapshot = snapshots[i];
      const previousSnapshot = snapshots[i + 1];
      
      try {
        const diffData = await this.calculateSnapshotDiff(deviceName, previousSnapshot.id, currentSnapshot.id);
        
        stats.perSnapshotStats[currentSnapshot.id] = diffData;
        
        // Aggregate statistics
        stats.packageStats.added += diffData.packageStats.added;
        stats.packageStats.removed += diffData.packageStats.removed;
        stats.packageStats.modified += diffData.packageStats.modified;
        
        stats.sectionStats.added += diffData.sectionStats.added;
        stats.sectionStats.removed += diffData.sectionStats.removed;
        stats.sectionStats.modified += diffData.sectionStats.modified;
        
        stats.optionStats.added += diffData.optionStats.added;
        stats.optionStats.removed += diffData.optionStats.removed;
        stats.optionStats.modified += diffData.optionStats.modified;
        
      } catch (error) {
        this.log(`Warning: Could not calculate diff between ${previousSnapshot.id} and ${currentSnapshot.id}: ${error.message}`);
        
        stats.perSnapshotStats[currentSnapshot.id] = {
          packageStats: { added: 0, removed: 0, modified: 0 },
          sectionStats: { added: 0, removed: 0, modified: 0 },
          optionStats: { added: 0, removed: 0, modified: 0 },
          hasChanges: false,
          error: error.message
        };
      }
    }

    return stats;
  }

  /**
   * Calculate diff statistics between two snapshots
   */
  async calculateSnapshotDiff(deviceName, beforeId, afterId) {
    try {
      const beforePath = await this.getSnapshotPath(deviceName, beforeId);
      const afterPath = await this.getSnapshotPath(deviceName, afterId);
      
      if (!beforePath || !afterPath) {
        throw new Error('Snapshot path not found');
      }

      // Generate diff and parse statistics
      const diffResult = await this.diffEngine.generateSnapshotDiff(beforePath, afterPath, 'structured');
      
      return this.parseDiffStatistics(diffResult);
      
    } catch (error) {
      this.log(`Error calculating snapshot diff: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse diff result into statistics
   */
  parseDiffStatistics(diffResult) {
    const stats = {
      packageStats: { added: 0, removed: 0, modified: 0 },
      sectionStats: { added: 0, removed: 0, modified: 0 },
      optionStats: { added: 0, removed: 0, modified: 0 },
      hasChanges: false
    };

    if (!diffResult || typeof diffResult !== 'object') {
      return stats;
    }

    // Parse the diff data structure
    if (diffResult.packages) {
      Object.values(diffResult.packages).forEach(pkg => {
        if (pkg.status === 'added') stats.packageStats.added++;
        else if (pkg.status === 'removed') stats.packageStats.removed++;
        else if (pkg.status === 'modified') stats.packageStats.modified++;
        
        if (pkg.sections) {
          Object.values(pkg.sections).forEach(section => {
            if (section.status === 'added') stats.sectionStats.added++;
            else if (section.status === 'removed') stats.sectionStats.removed++;
            else if (section.status === 'modified') stats.sectionStats.modified++;
            
            if (section.options) {
              Object.values(section.options).forEach(option => {
                if (option.status === 'added') stats.optionStats.added++;
                else if (option.status === 'removed') stats.optionStats.removed++;
                else if (option.status === 'modified') stats.optionStats.modified++;
              });
            }
          });
        }
      });
    }

    // Determine if there are any changes
    stats.hasChanges = Object.values(stats.packageStats).some(count => count > 0) ||
                      Object.values(stats.sectionStats).some(count => count > 0) ||
                      Object.values(stats.optionStats).some(count => count > 0);

    return stats;
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
   * Get empty statistics structure
   */
  getEmptyStatistics() {
    return {
      packageStats: { added: 0, removed: 0, modified: 0 },
      sectionStats: { added: 0, removed: 0, modified: 0 },
      optionStats: { added: 0, removed: 0, modified: 0 },
      perSnapshotStats: {},
      timeRange: { start: null, end: null }
    };
  }

  /**
   * Process historical data for trends
   */
  async processHistoricalTrends(deviceName, days = 30) {
    const snapshots = await this.snapshotEngine.listSnapshots(deviceName, {
      since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    });

    const trends = {
      snapshotFrequency: this.calculateSnapshotFrequency(snapshots),
      changeFrequency: await this.calculateChangeFrequency(deviceName, snapshots),
      mostActiveHours: this.calculateMostActiveHours(snapshots),
      averageChangeSize: await this.calculateAverageChangeSize(deviceName, snapshots)
    };

    return trends;
  }

  /**
   * Calculate snapshot frequency over time
   */
  calculateSnapshotFrequency(snapshots) {
    if (snapshots.length < 2) return 0;
    
    const timeSpan = new Date(snapshots[0].timestamp) - new Date(snapshots[snapshots.length - 1].timestamp);
    const days = timeSpan / (1000 * 60 * 60 * 24);
    
    return snapshots.length / Math.max(days, 1);
  }

  /**
   * Calculate change frequency
   */
  async calculateChangeFrequency(deviceName, snapshots) {
    let changesCount = 0;
    
    for (let i = 0; i < snapshots.length - 1; i++) {
      try {
        const diffData = await this.calculateSnapshotDiff(deviceName, snapshots[i + 1].id, snapshots[i].id);
        if (diffData.hasChanges) changesCount++;
      } catch (error) {
        // Skip failed diffs
      }
    }
    
    return changesCount / Math.max(snapshots.length - 1, 1);
  }

  /**
   * Calculate most active hours
   */
  calculateMostActiveHours(snapshots) {
    const hourCounts = new Array(24).fill(0);
    
    snapshots.forEach(snapshot => {
      const hour = new Date(snapshot.timestamp).getHours();
      hourCounts[hour]++;
    });
    
    const maxCount = Math.max(...hourCounts);
    const mostActiveHour = hourCounts.indexOf(maxCount);
    
    return {
      hour: mostActiveHour,
      count: maxCount,
      distribution: hourCounts
    };
  }

  /**
   * Calculate average change size
   */
  async calculateAverageChangeSize(deviceName, snapshots) {
    let totalChanges = 0;
    let comparisons = 0;
    
    for (let i = 0; i < snapshots.length - 1; i++) {
      try {
        const diffData = await this.calculateSnapshotDiff(deviceName, snapshots[i + 1].id, snapshots[i].id);
        const changeCount = Object.values(diffData.packageStats).reduce((a, b) => a + b, 0) +
                           Object.values(diffData.sectionStats).reduce((a, b) => a + b, 0) +
                           Object.values(diffData.optionStats).reduce((a, b) => a + b, 0);
        
        totalChanges += changeCount;
        comparisons++;
      } catch (error) {
        // Skip failed comparisons
      }
    }
    
    return comparisons > 0 ? totalChanges / comparisons : 0;
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