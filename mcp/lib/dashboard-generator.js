/**
 * HTML Dashboard Generator for Configuration Management
 * Creates interactive dashboards for device configuration tracking and visualization
 * 
 * Refactored to use extracted components for reduced complexity
 */

import { promises as fs } from 'fs';
import path from 'path';
import { StylesheetGenerator } from './dashboard-assets/stylesheet-generator.js';
import { ScriptGenerator } from './dashboard-assets/script-generator.js';
import { DashboardDataProcessor } from './dashboard-data-processor.js';
import { createLogger } from './logger.js';

export class DashboardGenerator {
  constructor(options = {}) {
    this.dashboardDir = options.dashboardDir || './config-snapshots/dashboard';
    this.debug = options.debug || false;
    this.snapshotEngine = options.snapshotEngine;
    this.diffEngine = options.diffEngine;
    
    // Initialize unified logger
    this.logger = createLogger('DashboardGenerator', {
      debug: this.debug,
      verbose: options.verbose || false
    });

    // Initialize extracted components
    this.stylesheetGenerator = new StylesheetGenerator({
      minify: options.minifyAssets || false,
      theme: options.theme || 'default'
    });

    this.scriptGenerator = new ScriptGenerator({
      minify: options.minifyAssets || false,
      includeDebug: this.debug
    });

    this.dataProcessor = new DashboardDataProcessor({
      snapshotEngine: this.snapshotEngine,
      diffEngine: this.diffEngine,
      debug: this.debug
    });
  }

  /**
   * Generate main dashboard HTML page
   */
  async generateMainDashboard(devices, timeframe = '7d') {
    this.log('Generating main dashboard...');

    const dashboardData = {
      generated_at: new Date().toISOString(),
      timeframe,
      devices: [],
      total_snapshots: 0,
      recent_changes: 0
    };

    // Collect data for each device
    for (const device of devices) {
      const deviceData = await this.collectDeviceData(device, timeframe);
      dashboardData.devices.push(deviceData);
      dashboardData.total_snapshots += deviceData.snapshot_count;
      dashboardData.recent_changes += deviceData.recent_changes;
    }

    const html = this.generateDashboardHTML(dashboardData);
    
    const dashboardPath = path.join(this.dashboardDir, 'index.html');
    await fs.writeFile(dashboardPath, html);
    
    // Copy static assets
    await this.generateStaticAssets();
    
    this.log(`Dashboard generated: ${dashboardPath}`);
    
    return {
      path: dashboardPath,
      url: `file://${path.resolve(dashboardPath)}`,
      data: dashboardData
    };
  }

  /**
   * Generate device-specific dashboard - simplified with extracted components
   */
  async generateDeviceDashboard(deviceName, days = 7) {
    this.log(`Generating device dashboard for ${deviceName}...`);

    // Generate static assets first
    await this.generateStaticAssets();

    // Process device data using extracted DataProcessor
    const processedData = await this.dataProcessor.processDeviceData(deviceName, days);
    
    // Add metadata for HTML generation
    const deviceData = {
      device_name: deviceName,
      total_snapshots: processedData.snapshots.length,
      snapshots: processedData.snapshots,
      snapshotData: processedData.snapshotData,
      packageStats: processedData.statistics.packageStats,
      sectionStats: processedData.statistics.sectionStats,
      optionStats: processedData.statistics.optionStats,
      perSnapshotStats: processedData.statistics.perSnapshotStats,
      generated_at: new Date().toISOString(),
      timeframe_days: days
    };

    // Generate HTML using simplified template
    const html = this.generateDeviceDashboardHTML(deviceData);
    
    const deviceDashboardPath = path.join(this.dashboardDir, `device-${deviceName}.html`);
    await fs.writeFile(deviceDashboardPath, html);
    
    this.log(`Dashboard generated with ${processedData.snapshots.length} snapshots and ${processedData.comparisons} diffs`);
    
    return {
      path: deviceDashboardPath,
      url: `file://${path.resolve(deviceDashboardPath)}`
    };
  }

  /**
   * Generate diff visualization HTML
   */
  async generateDiffVisualization(diffData, deviceName, beforeId, afterId) {
    this.log(`Generating diff visualization for ${deviceName}...`);

    // Use the rich dashboard HTML formatter if we have structured diff data
    let diffHtml;
    if (typeof diffData === 'object' && diffData.uci_diff) {
      diffHtml = this.diffEngine.formatDiffAsDashboardHTML(diffData, deviceName, beforeId, afterId);
    } else {
      // Fallback to basic HTML for simple diffs
      diffHtml = this.generateDiffHTML(diffData, deviceName, beforeId, afterId);
    }
    
    const diffPath = path.join(
      this.dashboardDir, 
      'diffs', 
      `${deviceName}-${beforeId}-${afterId}.html`
    );
    
    await fs.mkdir(path.dirname(diffPath), { recursive: true });
    await fs.writeFile(diffPath, diffHtml);
    
    return {
      path: diffPath,
      url: `file://${path.resolve(diffPath)}`
    };
  }

  /**
   * Generate main dashboard HTML template
   */
  generateDashboardHTML(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UCI Configuration Dashboard</title>
    <link rel="stylesheet" href="assets/dashboard.css">
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>🔧 UCI Configuration Dashboard</h1>
            <div class="header-stats">
                <div class="stat">
                    <div class="stat-label">Total Devices</div>
                    <div class="stat-value">${data.devices.length}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Total Snapshots</div>
                    <div class="stat-value">${data.total_snapshots}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Recent Changes</div>
                    <div class="stat-value">${data.recent_changes}</div>
                </div>
            </div>
        </header>

        <main class="dashboard-main">
            <div class="devices-grid">
                ${data.devices.map(device => `
                    <div class="device-card ${device.status}">
                        <div class="device-header">
                            <h3>${device.name}</h3>
                            <span class="device-status ${device.status}">${device.status}</span>
                        </div>
                        <div class="device-stats">
                            <div class="device-stat">
                                <span class="label">Snapshots</span>
                                <span class="value">${device.snapshot_count}</span>
                            </div>
                            <div class="device-stat">
                                <span class="label">Changes</span>
                                <span class="value">${device.recent_changes}</span>
                            </div>
                            <div class="device-stat">
                                <span class="label">Last Seen</span>
                                <span class="value">${device.last_seen}</span>
                            </div>
                        </div>
                        <div class="device-actions">
                            <a href="device-${device.name}.html" class="btn btn-primary">View Dashboard</a>
                            <button onclick="takeSnapshot('${device.name}')" class="btn btn-secondary">Take Snapshot</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="actions-grid">
                <button onclick="snapshotAllDevices()" class="action-btn">📸 Snapshot All Devices</button>
                <button onclick="checkDrift()" class="action-btn">🔍 Check Configuration Drift</button>
                <button onclick="generateReport()" class="action-btn">📊 Generate Report</button>
                <button onclick="refreshDashboard()" class="action-btn">🔄 Refresh Dashboard</button>
            </div>
        </main>
    </div>
    
    <script src="assets/dashboard.js"></script>
</body>
</html>`;
  }

  /**
   * Generate device dashboard HTML template
   */
  generateDeviceDashboardHTML(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Device Dashboard - ${data.device_name}</title>
    <link rel="stylesheet" href="assets/dashboard.css">
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>📱 ${data.device_name} Dashboard</h1>
            <nav class="breadcrumb">
                <a href="index.html">Dashboard</a> › ${data.device_name}
            </nav>
        </header>

        <main class="dashboard-main">
            <section class="device-info">
                <h2>📊 Device Overview & Change Statistics</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="label">Total Snapshots</span>
                        <span class="value">${data.total_snapshots}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Latest Snapshot</span>
                        <span class="value">${data.snapshots[0] ? new Date(data.snapshots[0].timestamp).toLocaleString() : 'None'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Total Comparisons</span>
                        <span class="value">${data.total_snapshots > 1 ? data.total_snapshots - 1 : 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Files Changed</span>
                        <span class="value">${data.packageStats.modified + data.sectionStats.modified}</span>
                    </div>
                </div>
                
                ${this.generateChangeStatsSection(data)}
            </section>

            <section class="timeline-section">
                <h2>📅 Configuration Timeline</h2>
                <div class="timeline">
                    ${data.snapshots.map(snapshot => this.generateTimelineItem(snapshot, data.perSnapshotStats)).join('')}
                </div>
            </section>
        </main>
    </div>
    
    <script>
        window.DEVICE_NAME = '${data.device_name}';
        window.SNAPSHOT_DATA = ${JSON.stringify(data.snapshotData)};
    </script>
    <script src="assets/dashboard.js"></script>
</body>
</html>`;
  }

  /**
   * Generate change statistics section
   */
  generateChangeStatsSection(data) {
    return `
                <div class="change-stats-section">
                    <h3>🔧 Configuration Changes Summary</h3>
                    <div class="stats-grid">
                        <div class="stat-group package-stats">
                            <h4>📦 Package Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.packageStats.added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.packageStats.removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.packageStats.modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stat-group section-stats">
                            <h4>📝 Section Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.sectionStats.added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.sectionStats.removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.sectionStats.modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stat-group option-stats">
                            <h4>⚙️ Option Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.optionStats.added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.optionStats.removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.optionStats.modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
  }

  /**
   * Generate timeline item for snapshot
   */
  generateTimelineItem(snapshot, perSnapshotStats) {
    const stats = perSnapshotStats[snapshot.id] || { hasChanges: false };
    const hasChanges = stats.hasChanges;
    const changeClass = hasChanges ? 'has-changes' : '';
    
    return `
                    <div class="timeline-item ${changeClass}">
                        <div class="timeline-marker"></div>
                        <div class="timeline-content">
                            <h4>${snapshot.label} ${hasChanges ? '<span class="change-indicator">Changes</span>' : ''}</h4>
                            <p class="timeline-date">${new Date(snapshot.timestamp).toLocaleString()}</p>
                            
                            ${hasChanges ? this.generateSnapshotDiffStats(stats) : '<p class="no-changes">No configuration changes detected</p>'}
                            
                            <div class="timeline-actions">
                                <button onclick="viewSnapshot('${snapshot.id}')" class="btn btn-primary">View Details</button>
                                ${hasChanges ? `<button onclick="compareTo('${snapshot.id}', '${snapshot.id}')" class="btn btn-secondary">Compare Diffs</button>` : ''}
                            </div>
                        </div>
                    </div>`;
  }

  /**
   * Generate per-snapshot diff statistics
   */
  generateSnapshotDiffStats(stats) {
    if (!stats.hasChanges) {
      return '<p class="no-changes">No changes detected</p>';
    }

    return `
                            <div class="snapshot-diff-stats">
                                <h5>📊 Changes in this snapshot:</h5>
                                <div class="snapshot-stats-grid">
                                    <div class="snapshot-stat-group">
                                        <span class="stat-label">Packages:</span>
                                        <div class="stat-badges">
                                            ${stats.packageStats.added > 0 ? `<span class="stat-badge added">+${stats.packageStats.added}</span>` : ''}
                                            ${stats.packageStats.removed > 0 ? `<span class="stat-badge removed">-${stats.packageStats.removed}</span>` : ''}
                                            ${stats.packageStats.modified > 0 ? `<span class="stat-badge modified">~${stats.packageStats.modified}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="snapshot-stat-group">
                                        <span class="stat-label">Sections:</span>
                                        <div class="stat-badges">
                                            ${stats.sectionStats.added > 0 ? `<span class="stat-badge added">+${stats.sectionStats.added}</span>` : ''}
                                            ${stats.sectionStats.removed > 0 ? `<span class="stat-badge removed">-${stats.sectionStats.removed}</span>` : ''}
                                            ${stats.sectionStats.modified > 0 ? `<span class="stat-badge modified">~${stats.sectionStats.modified}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="snapshot-stat-group">
                                        <span class="stat-label">Options:</span>
                                        <div class="stat-badges">
                                            ${stats.optionStats.added > 0 ? `<span class="stat-badge added">+${stats.optionStats.added}</span>` : ''}
                                            ${stats.optionStats.removed > 0 ? `<span class="stat-badge removed">-${stats.optionStats.removed}</span>` : ''}
                                            ${stats.optionStats.modified > 0 ? `<span class="stat-badge modified">~${stats.optionStats.modified}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>`;
  }

  /**
   * Generate diff HTML for simple diffs
   */
  generateDiffHTML(diffData, deviceName, beforeId, afterId) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration Diff - ${deviceName}</title>
    <link rel="stylesheet" href="../assets/dashboard.css">
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>🔍 Configuration Diff</h1>
            <nav class="breadcrumb">
                <a href="../index.html">Dashboard</a> › 
                <a href="../device-${deviceName}.html">${deviceName}</a> › 
                Diff
            </nav>
        </header>

        <main class="dashboard-main">
            <div class="diff-container">
                <h2>Changes from ${beforeId} to ${afterId}</h2>
                <div class="diff-text">
                    <pre>${typeof diffData === 'string' ? diffData : JSON.stringify(diffData, null, 2)}</pre>
                </div>
            </div>
        </main>
    </div>
</body>
</html>`;
  }

  /**
   * Generate static assets (CSS and JavaScript) using extracted generators
   */
  async generateStaticAssets() {
    const assetsDir = path.join(this.dashboardDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    // Generate CSS using StylesheetGenerator
    const css = this.stylesheetGenerator.generate();
    await fs.writeFile(path.join(assetsDir, 'dashboard.css'), css);

    // Generate JavaScript using ScriptGenerator  
    const js = this.scriptGenerator.generate();
    await fs.writeFile(path.join(assetsDir, 'dashboard.js'), js);

    this.log('Static assets generated');
  }

  /**
   * Collect device data for main dashboard
   */
  async collectDeviceData(device, timeframe) {
    try {
      const processedData = await this.dataProcessor.processDeviceData(device, 7);
      
      return {
        name: device,
        status: 'online', // This would be determined by actual device status
        snapshot_count: processedData.snapshots.length,
        recent_changes: processedData.filesChanged,
        last_seen: processedData.snapshots[0] ? new Date(processedData.snapshots[0].timestamp).toLocaleString() : 'Never'
      };
    } catch (error) {
      this.log(`Error collecting data for device ${device}: ${error.message}`);
      return {
        name: device,
        status: 'offline',
        snapshot_count: 0,
        recent_changes: 0,
        last_seen: 'Error'
      };
    }
  }

  /**
   * Get snapshot path by device and label
   */
  async getSnapshotPath(deviceName, label) {
    try {
      const snapshots = await this.snapshotEngine.listSnapshots(deviceName);
      const snapshot = snapshots.find(s => s.label === label);
      return snapshot ? snapshot.path : null;
    } catch (error) {
      this.log(`Error getting snapshot path: ${error.message}`);
      return null;
    }
  }

  /**
   * Log debug messages using unified logger
   */
  log(message) {
    this.logger.debug(message);
  }
}