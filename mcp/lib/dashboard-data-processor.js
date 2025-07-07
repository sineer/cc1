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
      filesChanged: statistics.packageStats.added + statistics.packageStats.removed + statistics.packageStats.modified + 
                   statistics.sectionStats.added + statistics.sectionStats.removed + statistics.sectionStats.modified
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
      const metadata = JSON.parse(metadataContent);
      
      // Enhance metadata with file size information if missing
      if (!metadata.files || metadata.files.length === 0) {
        const enhancedMetadata = await this.enhanceMetadataWithFileSizes(snapshotDir, metadata);
        return enhancedMetadata;
      }
      
      return metadata;
    } catch (error) {
      this.log(`Warning: Could not load metadata: ${error.message}`);
      
      // Generate fallback metadata from available files
      return await this.generateFallbackMetadata(snapshotDir);
    }
  }

  /**
   * Enhance existing metadata with file size information
   */
  async enhanceMetadataWithFileSizes(snapshotDir, metadata) {
    try {
      const files = await fs.readdir(snapshotDir);
      let totalSize = 0;
      const fileList = [];

      for (const file of files) {
        try {
          const filePath = path.join(snapshotDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            totalSize += stat.size;
            fileList.push({
              name: file,
              size: stat.size
            });
          }
        } catch (error) {
          this.log(`Warning: Could not stat file ${file}: ${error.message}`);
        }
      }

      // Merge with existing metadata
      return {
        ...metadata,
        files: fileList,
        file_count: fileList.length,
        total_size: totalSize,
        files_captured: metadata.files_captured || files.filter(f => f.endsWith('.conf') || f.endsWith('.txt') || f.endsWith('.json'))
      };
    } catch (error) {
      this.log(`Warning: Could not enhance metadata with file sizes: ${error.message}`);
      return metadata; // Return original metadata if enhancement fails
    }
  }

  /**
   * Generate fallback metadata when metadata.json is missing
   */
  async generateFallbackMetadata(snapshotDir) {
    try {
      const files = await fs.readdir(snapshotDir);
      const snapshotId = path.basename(snapshotDir);
      let totalSize = 0;
      const fileList = [];

      for (const file of files) {
        try {
          const filePath = path.join(snapshotDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            totalSize += stat.size;
            fileList.push({
              name: file,
              size: stat.size
            });
          }
        } catch (error) {
          this.log(`Warning: Could not stat file ${file}: ${error.message}`);
        }
      }

      return {
        snapshot_id: snapshotId,
        timestamp: new Date().toISOString(),
        files: fileList,
        file_count: fileList.length,
        total_size: totalSize,
        files_captured: files,
        errors: [],
        capture_method: 'unknown'
      };
    } catch (error) {
      this.log(`Warning: Could not generate fallback metadata: ${error.message}`);
      return {
        snapshot_id: 'unknown',
        timestamp: new Date().toISOString(),
        files: [],
        file_count: 0,
        total_size: 0,
        files_captured: [],
        errors: ['Metadata generation failed'],
        capture_method: 'unknown'
      };
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
      
      // Return default system info structure
      return {
        hostname: { output: 'Unknown' },
        uptime: { output: 'Unknown' },
        date: { output: 'Unknown' },
        openwrt_release: { output: 'OpenWrt (version unknown)' },
        kernel: { output: 'Linux (kernel unknown)' },
        memory_usage: { output: 'Memory information not available' },
        disk_usage: { output: 'Disk information not available' },
        load_average: { output: 'Load information not available' }
      };
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
      
      // Return default network status structure
      return {
        ip_addresses: { output: 'Interface information not available' },
        routing_table: { output: 'Routing information not available' },
        interface_stats: { output: 'Interface statistics not available' },
        dns_test: { output: 'DNS test not available' },
        ping_gateway: { output: 'Gateway connectivity not available' }
      };
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
      
      // Return default service status structure
      return {
        active_processes: { output: 'Process information not available' },
        running_services: { output: 'Service configuration not available' },
        system_log: { output: 'Log information not available' }
      };
    }
  }

  /**
   * Load configuration files
   */
  async loadConfigFiles(snapshotDir) {
    const configFiles = {};
    
    try {
      // Config files are stored directly in the snapshot directory, not in a 'config' subdirectory
      const files = await fs.readdir(snapshotDir);
      
      for (const file of files) {
        if (file.endsWith('.conf')) {
          try {
            const filePath = path.join(snapshotDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            configFiles[file] = content;
          } catch (error) {
            this.log(`Warning: Could not load config file ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.log(`Warning: Could not read snapshot directory for config files: ${error.message}`);
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
        // Generate diff using JSON format to get structured data
        const diffResult = await this.diffEngine.generateSnapshotDiff(
          previousSnapshot.path,
          currentSnapshot.path,
          'json'
        );
        
        // Parse the JSON result  
        const diff = JSON.parse(diffResult);
        
        // Create HTML diff file
        const diffFileName = `${deviceName}-${currentSnapshot.label}-${previousSnapshot.label}.html`.replace(/ /g, '-');
        const diffPath = path.join('./config-snapshots/dashboard/diffs', diffFileName);
        
        // Ensure diffs directory exists
        await fs.mkdir(path.dirname(diffPath), { recursive: true });
        
        // Generate HTML content for the diff
        const htmlContent = this.generateDiffHTML(diff, previousSnapshot, currentSnapshot, deviceName);
        await fs.writeFile(diffPath, htmlContent, 'utf8');
        
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
   * Generate HTML content for diff visualization
   */
  generateDiffHTML(diff, beforeSnapshot, afterSnapshot, deviceName) {
    const timestamp = new Date().toISOString();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration Diff: ${beforeSnapshot.label} → ${afterSnapshot.label}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background-color: #f5f5f5; 
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .diff-header { 
            border-bottom: 2px solid #e0e0e0; 
            padding-bottom: 15px; 
            margin-bottom: 20px; 
        }
        .diff-header h1 { 
            color: #333; 
            margin: 0 0 10px 0; 
        }
        .diff-info { 
            color: #666; 
            font-size: 14px; 
        }
        .diff-section { 
            margin: 20px 0; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
        }
        .diff-section-header { 
            background: #f8f9fa; 
            padding: 10px 15px; 
            font-weight: bold; 
            border-bottom: 1px solid #ddd; 
        }
        .diff-content { 
            padding: 15px; 
        }
        .diff-line { 
            padding: 2px 5px; 
            font-family: monospace; 
            white-space: pre-wrap; 
        }
        .added { 
            background-color: #d4edda; 
            color: #155724; 
        }
        .removed { 
            background-color: #f8d7da; 
            color: #721c24; 
        }
        .modified { 
            background-color: #fff3cd; 
            color: #856404; 
        }
        .unchanged { 
            color: #6c757d; 
        }
        .statistics { 
            background: #e9ecef; 
            padding: 15px; 
            border-radius: 4px; 
            margin: 20px 0; 
        }
        .statistics h3 { 
            margin: 0 0 10px 0; 
        }
        .stat-item { 
            display: inline-block; 
            margin-right: 20px; 
            padding: 5px 10px; 
            background: white; 
            border-radius: 3px; 
            font-size: 14px; 
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="diff-header">
            <h1>📊 Configuration Diff: ${deviceName}</h1>
            <div class="diff-info">
                <strong>Before:</strong> ${beforeSnapshot.label} (${beforeSnapshot.id})<br>
                <strong>After:</strong> ${afterSnapshot.label} (${afterSnapshot.id})<br>
                <strong>Generated:</strong> ${timestamp}
            </div>
        </div>

        <div class="statistics">
            <h3>📈 Change Statistics</h3>
            <span class="stat-item">Total Changes: ${diff.statistics?.total_changes || 0}</span>
            <span class="stat-item">Files Changed: ${diff.statistics?.files_changed || 0}</span>
            <span class="stat-item">Sections Added: ${diff.statistics?.sections_added || 0}</span>
            <span class="stat-item">Sections Removed: ${diff.statistics?.sections_removed || 0}</span>
            <span class="stat-item">Options Changed: ${diff.statistics?.options_changed || 0}</span>
        </div>

        ${this.generateDiffSections(diff)}
    </div>
</body>
</html>`;
  }

  /**
   * Generate HTML sections for diff content
   */
  generateDiffSections(diff) {
    let sectionsHTML = '';
    
    // Check for UCI configuration changes in the correct location
    if (diff.uci_diff && diff.uci_diff.packages && Object.keys(diff.uci_diff.packages).length > 0) {
      for (const [packageName, packageDiff] of Object.entries(diff.uci_diff.packages)) {
        sectionsHTML += `
        <div class="diff-section">
            <div class="diff-section-header">📦 Package: ${packageName} (${packageDiff.status})</div>
            <div class="diff-content">
                ${this.generateUCIPackageHTML(packageName, packageDiff)}
            </div>
        </div>`;
      }
    }
    
    return sectionsHTML || '<div class="diff-section"><div class="diff-content">No changes detected between snapshots.</div></div>';
  }

  /**
   * Generate HTML for UCI package changes
   */
  generateUCIPackageHTML(packageName, packageDiff) {
    let html = '';
    
    if (packageDiff.status === 'added') {
      html += `<p class="added">➕ Entire package '${packageName}' was added</p>`;
    } else if (packageDiff.status === 'removed') {
      html += `<p class="removed">➖ Entire package '${packageName}' was removed</p>`;
    } else if (packageDiff.status === 'modified' && packageDiff.sections) {
      // Show section-level changes
      for (const [sectionName, sectionDiff] of Object.entries(packageDiff.sections)) {
        if (sectionDiff.status === 'added') {
          html += `<p class="added">➕ Section '${sectionName}' added</p>`;
        } else if (sectionDiff.status === 'removed') {
          html += `<p class="removed">➖ Section '${sectionName}' removed</p>`;
        } else if (sectionDiff.status === 'modified' && sectionDiff.options) {
          html += `<p class="modified">🔄 Section '${sectionName}' modified:</p><ul>`;
          for (const [optionName, optionDiff] of Object.entries(sectionDiff.options)) {
            if (optionDiff.status === 'added') {
              html += `<li class="added">+ ${optionName}: ${optionDiff.value}</li>`;
            } else if (optionDiff.status === 'removed') {
              html += `<li class="removed">- ${optionName}: ${optionDiff.value}</li>`;
            } else if (optionDiff.status === 'modified') {
              html += `<li class="modified">~ ${optionName}: ${optionDiff.from} → ${optionDiff.to}</li>`;
            }
          }
          html += '</ul>';
        }
      }
    }
    
    return html;
  }

  /**
   * Generate HTML for specific changes
   */
  generateChangeHTML(changes, changeType) {
    let html = '';
    
    for (const [key, value] of Object.entries(changes)) {
      html += `<div class="diff-line ${changeType}">${key}: ${JSON.stringify(value, null, 2)}</div>`;
    }
    
    return html || `<div class="diff-line">No ${changeType} changes</div>`;
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