/**
 * Statistics Engine - Configuration change statistics and trend analysis
 * Handles calculation of diff statistics, trends, and change analysis
 */

export class StatisticsEngine {
  constructor(engines = {}) {
    this.snapshotEngine = engines.snapshotEngine;
    this.diffEngine = engines.diffEngine;
    this.debug = engines.debug || false;
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
      this.log(`Warning: diffResult is null or not an object: ${typeof diffResult}`);
      return stats;
    }

    // Parse the diff data structure
    if (diffResult.uci_diff && diffResult.uci_diff.packages) {
      Object.values(diffResult.uci_diff.packages).forEach(pkg => {
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
   * Calculate statistics directly from diff result (for testing and direct usage)
   * Returns statistics in the format expected by tests
   */
  calculateStatistics(diffResult) {
    // Initialize return structure
    const stats = {
      packageStats: { added: 0, removed: 0, modified: 0 },
      sectionStats: { added: 0, removed: 0, modified: 0 },
      optionStats: { added: 0, removed: 0, modified: 0 },
      hasChanges: false
    };

    if (!diffResult || typeof diffResult !== 'object') {
      console.warn(`Warning: diffResult is null or not an object: ${typeof diffResult}`);
      return stats;
    }

    // Parse the diff data structure (checking for correct nested structure)
    if (diffResult.uci_diff && diffResult.uci_diff.packages) {
      Object.values(diffResult.uci_diff.packages).forEach(pkg => {
        if (pkg.status === 'added') {
          stats.packageStats.added++;
        } else if (pkg.status === 'removed') {
          stats.packageStats.removed++;
        } else if (pkg.status === 'modified') {
          stats.packageStats.modified++;
        }
        
        if (pkg.sections) {
          Object.values(pkg.sections).forEach(section => {
            if (section.status === 'added') {
              stats.sectionStats.added++;
            } else if (section.status === 'removed') {
              stats.sectionStats.removed++;
            } else if (section.status === 'modified') {
              stats.sectionStats.modified++;
            }
            
            if (section.options) {
              Object.values(section.options).forEach(option => {
                if (option.status === 'added') {
                  stats.optionStats.added++;
                } else if (option.status === 'removed') {
                  stats.optionStats.removed++;
                } else if (option.status === 'modified') {
                  stats.optionStats.modified++;
                }
              });
            }
          });
        }
      });
    } else if (!diffResult.uci_diff) {
      console.warn(`Warning: diffResult is null or not an object: unexpected structure without uci_diff`);
    }

    // Also add statistics to the diffResult object for compatibility
    if (diffResult) {
      diffResult.statistics = {
        total_changes: stats.packageStats.added + stats.packageStats.removed + stats.packageStats.modified +
                      stats.sectionStats.added + stats.sectionStats.removed + stats.sectionStats.modified +
                      stats.optionStats.added + stats.optionStats.removed + stats.optionStats.modified,
        sections_added: stats.sectionStats.added,
        sections_removed: stats.sectionStats.removed,
        sections_modified: stats.sectionStats.modified,
        options_changed: stats.optionStats.added + stats.optionStats.removed + stats.optionStats.modified,
        packages_modified: stats.packageStats.modified,
        packages_added: stats.packageStats.added,
        packages_removed: stats.packageStats.removed
      };
    }

    // Determine if there are any changes
    stats.hasChanges = Object.values(stats.packageStats).some(count => count > 0) ||
                      Object.values(stats.sectionStats).some(count => count > 0) ||
                      Object.values(stats.optionStats).some(count => count > 0);

    return stats;
  }

  /**
   * Aggregate device statistics from snapshots with calculated statistics
   */
  aggregateDeviceStatistics(deviceName, snapshots) {
    const aggregated = {
      deviceName,
      normalizedName: this.normalizeDeviceName(deviceName),
      totalSnapshots: snapshots.length,
      latestSnapshot: snapshots[0]?.timestamp || null,
      firstSnapshot: snapshots[snapshots.length - 1]?.timestamp || null,
      totalComparisons: Math.max(0, snapshots.length - 1),
      filesChanged: 0,
      totalStats: {
        packageStats: { added: 0, removed: 0, modified: 0 },
        sectionStats: { added: 0, removed: 0, modified: 0 },
        optionStats: { added: 0, removed: 0, modified: 0 }
      }
    };

    // Aggregate statistics from snapshots
    snapshots.forEach(snapshot => {
      if (snapshot.statistics) {
        const stats = snapshot.statistics;
        // Handle both old and new statistics formats
        if (stats.packageStats) {
          // New format
          aggregated.totalStats.packageStats.added += stats.packageStats.added || 0;
          aggregated.totalStats.packageStats.removed += stats.packageStats.removed || 0;
          aggregated.totalStats.packageStats.modified += stats.packageStats.modified || 0;
          
          aggregated.totalStats.sectionStats.added += (stats.sectionStats && stats.sectionStats.added) || 0;
          aggregated.totalStats.sectionStats.removed += (stats.sectionStats && stats.sectionStats.removed) || 0;
          aggregated.totalStats.sectionStats.modified += (stats.sectionStats && stats.sectionStats.modified) || 0;
          
          aggregated.totalStats.optionStats.added += (stats.optionStats && stats.optionStats.added) || 0;
          aggregated.totalStats.optionStats.removed += (stats.optionStats && stats.optionStats.removed) || 0;
          aggregated.totalStats.optionStats.modified += (stats.optionStats && stats.optionStats.modified) || 0;
        } else {
          // Old format
          aggregated.totalStats.packageStats.added += stats.packages_added || 0;
          aggregated.totalStats.packageStats.removed += stats.packages_removed || 0;
          aggregated.totalStats.packageStats.modified += stats.packages_modified || 0;
          
          aggregated.totalStats.sectionStats.added += stats.sections_added || 0;
          aggregated.totalStats.sectionStats.removed += stats.sections_removed || 0;
          aggregated.totalStats.sectionStats.modified += stats.sections_modified || 0;
          
          aggregated.totalStats.optionStats.added += stats.options_changed || 0;
          aggregated.totalStats.optionStats.removed += 0; // Not tracked separately in old format
          aggregated.totalStats.optionStats.modified += 0; // Not tracked separately in old format
        }
        
        aggregated.filesChanged += stats.total_changes || 0;
      }
    });

    return aggregated;
  }

  /**
   * Calculate per-snapshot statistics to determine if each snapshot has changes
   */
  calculatePerSnapshotStatistics(snapshots) {
    const perSnapshotStats = {};

    snapshots.forEach(snapshot => {
      let hasChanges = false;

      if (snapshot.statistics) {
        // Check if there are any changes in the statistics
        if (snapshot.statistics.packageStats) {
          // New format
          hasChanges = Object.values(snapshot.statistics.packageStats).some(count => count > 0) ||
                      Object.values(snapshot.statistics.sectionStats || {}).some(count => count > 0) ||
                      Object.values(snapshot.statistics.optionStats || {}).some(count => count > 0);
        } else {
          // Old format
          hasChanges = (snapshot.statistics.packages_added || 0) > 0 ||
                      (snapshot.statistics.packages_removed || 0) > 0 ||
                      (snapshot.statistics.packages_modified || 0) > 0 ||
                      (snapshot.statistics.sections_added || 0) > 0 ||
                      (snapshot.statistics.sections_removed || 0) > 0 ||
                      (snapshot.statistics.sections_modified || 0) > 0 ||
                      (snapshot.statistics.options_changed || 0) > 0;
        }
      }

      perSnapshotStats[snapshot.id] = {
        hasChanges,
        changeCount: snapshot.statistics?.total_changes || 0
      };
    });

    return perSnapshotStats;
  }

  /**
   * Normalize device name for filename generation (used in tests)
   */
  normalizeDeviceName(deviceName) {
    if (!deviceName) return '';
    
    // Replace spaces with dashes, keep special characters like parentheses
    return deviceName.replace(/\s+/g, '-');
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
   * Calculate statistics summary for multiple devices
   */
  async calculateMultiDeviceStatistics(devices, days = 7) {
    const deviceStats = {};
    let totalSnapshots = 0;
    let totalChanges = 0;

    for (const device of devices) {
      try {
        const snapshots = await this.snapshotEngine.listSnapshots(device, {
          since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        });

        const stats = await this.calculateStatistics(device, snapshots);
        
        deviceStats[device] = {
          snapshotCount: snapshots.length,
          packageChanges: stats.packageStats.added + stats.packageStats.removed + stats.packageStats.modified,
          sectionChanges: stats.sectionStats.added + stats.sectionStats.removed + stats.sectionStats.modified,
          optionChanges: stats.optionStats.added + stats.optionStats.removed + stats.optionStats.modified,
          timeRange: stats.timeRange
        };

        totalSnapshots += snapshots.length;
        totalChanges += deviceStats[device].packageChanges + deviceStats[device].sectionChanges + deviceStats[device].optionChanges;

      } catch (error) {
        this.log(`Warning: Could not calculate statistics for device ${device}: ${error.message}`);
        deviceStats[device] = {
          snapshotCount: 0,
          packageChanges: 0,
          sectionChanges: 0,
          optionChanges: 0,
          error: error.message
        };
      }
    }

    return {
      devices: deviceStats,
      summary: {
        totalDevices: devices.length,
        totalSnapshots,
        totalChanges,
        averageChangesPerDevice: devices.length > 0 ? totalChanges / devices.length : 0
      }
    };
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
   * Validate statistics data integrity
   */
  validateStatistics(stats) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!stats) {
      validation.valid = false;
      validation.errors.push('Statistics object is null or undefined');
      return validation;
    }

    // Check required statistics structures
    const requiredStats = ['packageStats', 'sectionStats', 'optionStats'];
    requiredStats.forEach(statType => {
      if (!stats[statType]) {
        validation.valid = false;
        validation.errors.push(`Missing ${statType} in statistics`);
      } else {
        const requiredKeys = ['added', 'removed', 'modified'];
        requiredKeys.forEach(key => {
          if (typeof stats[statType][key] !== 'number') {
            validation.warnings.push(`${statType}.${key} is not a number`);
          }
        });
      }
    });

    if (!stats.perSnapshotStats || typeof stats.perSnapshotStats !== 'object') {
      validation.warnings.push('perSnapshotStats missing or invalid');
    }

    return validation;
  }

  /**
   * Log debug messages
   */
  log(message) {
    if (this.debug) {
      console.error(`[StatisticsEngine] ${message}`);
    }
  }

  /**
   * Get statistics engine status
   */
  getStats() {
    return {
      hasSnapshotEngine: !!this.snapshotEngine,
      hasDiffEngine: !!this.diffEngine,
      debug: this.debug
    };
  }
}