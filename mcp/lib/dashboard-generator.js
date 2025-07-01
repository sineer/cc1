/**
 * HTML Dashboard Generator for Configuration Management
 * Creates interactive dashboards for device configuration tracking and visualization
 */

import { promises as fs } from 'fs';
import path from 'path';

export class DashboardGenerator {
  constructor(options = {}) {
    this.dashboardDir = options.dashboardDir || './config-snapshots/dashboard';
    this.debug = options.debug || false;
    this.snapshotEngine = options.snapshotEngine;
    this.diffEngine = options.diffEngine;
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
   * Generate device-specific dashboard
   */
  async generateDeviceDashboard(deviceName, days = 7) {
    this.log(`Generating device dashboard for ${deviceName}...`);

    // Load snapshots for device
    const snapshots = await this.snapshotEngine.listSnapshots(deviceName, {
      since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    });

    // Generate static assets first
    await this.generateStaticAssets();

    // Load all snapshot data for embedding
    const snapshotData = {};
    for (const snapshot of snapshots) {
      const snapshotDir = path.join('./config-snapshots', deviceName, snapshot.id);
      const data = {
        metadata: null,
        systemInfo: null,
        networkStatus: null,
        serviceStatus: null,
        configFiles: {}
      };

      try {
        // Load metadata
        try {
          const metadataPath = path.join(snapshotDir, 'metadata.json');
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          data.metadata = JSON.parse(metadataContent);
        } catch (e) {
          this.log(`Warning: Could not load metadata for ${snapshot.id}: ${e.message}`);
        }

        // Load system info
        try {
          const systemInfoPath = path.join(snapshotDir, 'system-info.json');
          const systemInfoContent = await fs.readFile(systemInfoPath, 'utf8');
          data.systemInfo = JSON.parse(systemInfoContent);
        } catch (e) {
          this.log(`Warning: Could not load system info for ${snapshot.id}: ${e.message}`);
        }

        // Load network status
        try {
          const networkStatusPath = path.join(snapshotDir, 'network-status.json');
          const networkStatusContent = await fs.readFile(networkStatusPath, 'utf8');
          data.networkStatus = JSON.parse(networkStatusContent);
        } catch (e) {
          this.log(`Warning: Could not load network status for ${snapshot.id}: ${e.message}`);
        }

        // Load service status
        try {
          const serviceStatusPath = path.join(snapshotDir, 'service-status.json');
          const serviceStatusContent = await fs.readFile(serviceStatusPath, 'utf8');
          data.serviceStatus = JSON.parse(serviceStatusContent);
        } catch (e) {
          this.log(`Warning: Could not load service status for ${snapshot.id}: ${e.message}`);
        }

        // Load config files
        const configFiles = [
          'dhcp.conf', 'dropbear.conf', 'firewall.conf', 'luci.conf', 'network.conf',
          'openvpn.conf', 'openvpn-opkg.conf', 'openwisp.conf', 'openwisp-monitoring.conf',
          'rpcd.conf', 'socat.conf', 'system.conf', 'ubispot.conf', 'ubispot-opkg.conf',
          'ucitrack.conf', 'uhttpd.conf'
        ];

        for (const fileName of configFiles) {
          try {
            const filePath = path.join(snapshotDir, fileName);
            const fileContent = await fs.readFile(filePath, 'utf8');
            data.configFiles[fileName] = fileContent;
          } catch (e) {
            // File doesn't exist, skip silently
          }
        }

        snapshotData[snapshot.id] = data;
      } catch (error) {
        this.log(`Warning: Could not load data for snapshot ${snapshot.id}: ${error.message}`);
      }
    }

    // Pre-generate diff files and collect per-snapshot statistics
    let totalChanges = {
      options_added: 0,
      options_removed: 0, 
      options_modified: 0,
      sections_added: 0,
      sections_removed: 0,
      sections_modified: 0,
      packages_added: 0,
      packages_removed: 0,
      packages_modified: 0,
      files_changed: 0,
      total_diffs: 0
    };

    // Add diff statistics to each snapshot
    const snapshotsWithStats = snapshots.map(s => ({
      ...s,
      diff_stats: {
        options_added: 0,
        options_removed: 0,
        options_modified: 0,
        sections_added: 0,
        sections_removed: 0,
        sections_modified: 0,
        packages_added: 0,
        packages_removed: 0,
        packages_modified: 0,
        files_changed: 0,
        has_changes: false
      }
    }));

    if (snapshots.length > 1) {
      this.log(`Pre-generating ${snapshots.length - 1} diff files...`);
      
      // Ensure diffs directory exists
      const diffsDir = path.join(this.dashboardDir, 'diffs');
      await fs.mkdir(diffsDir, { recursive: true });
      
      for (let i = 0; i < snapshots.length - 1; i++) {
        const afterSnapshot = snapshots[i];
        const beforeSnapshot = snapshots[i + 1];
        
        try {
          // Generate diff between snapshots
          const diff = await this.diffEngine.generateSnapshotDiff(
            beforeSnapshot.path,
            afterSnapshot.path,
            'json'
          );
          
          // Parse diff data to collect statistics
          const diffData = JSON.parse(diff);
          
          // Initialize per-snapshot statistics for the "after" snapshot
          let snapshotStats = {
            options_added: 0,
            options_removed: 0,
            options_modified: 0,
            sections_added: 0,
            sections_removed: 0,
            sections_modified: 0,
            packages_added: 0,
            packages_removed: 0,
            packages_modified: 0,
            files_changed: 0,
            has_changes: false
          };
          
          if (diffData.uci_diff && diffData.uci_diff.packages) {
            totalChanges.total_diffs++;
            
            // Count package-level changes for this specific snapshot
            for (const [packageName, packageDiff] of Object.entries(diffData.uci_diff.packages)) {
              if (packageDiff.status === 'added') {
                totalChanges.packages_added++;
                snapshotStats.packages_added++;
                snapshotStats.has_changes = true;
              } else if (packageDiff.status === 'removed') {
                totalChanges.packages_removed++;
                snapshotStats.packages_removed++;
                snapshotStats.has_changes = true;
              } else if (packageDiff.status === 'modified') {
                totalChanges.packages_modified++;
                snapshotStats.packages_modified++;
                snapshotStats.has_changes = true;
                
                // Count section-level changes
                if (packageDiff.sections) {
                  for (const [sectionName, sectionDiff] of Object.entries(packageDiff.sections)) {
                    if (sectionDiff.status === 'added') {
                      totalChanges.sections_added++;
                      snapshotStats.sections_added++;
                    } else if (sectionDiff.status === 'removed') {
                      totalChanges.sections_removed++;
                      snapshotStats.sections_removed++;
                    } else if (sectionDiff.status === 'modified') {
                      totalChanges.sections_modified++;
                      snapshotStats.sections_modified++;
                      
                      // Count option-level changes
                      if (sectionDiff.options) {
                        for (const [optionName, optionDiff] of Object.entries(sectionDiff.options)) {
                          if (optionDiff.status === 'added') {
                            totalChanges.options_added++;
                            snapshotStats.options_added++;
                          } else if (optionDiff.status === 'removed') {
                            totalChanges.options_removed++;
                            snapshotStats.options_removed++;
                          } else if (optionDiff.status === 'modified') {
                            totalChanges.options_modified++;
                            snapshotStats.options_modified++;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Count file changes for this snapshot
          if (diffData.statistics && diffData.statistics.files_changed) {
            totalChanges.files_changed += diffData.statistics.files_changed;
            snapshotStats.files_changed = diffData.statistics.files_changed;
            if (diffData.statistics.files_changed > 0) {
              snapshotStats.has_changes = true;
            }
          }
          
          // Assign statistics to the "after" snapshot (the one that contains the changes)
          snapshotsWithStats[i].diff_stats = snapshotStats;
          
          // Extract labels from snapshots
          const beforeLabel = beforeSnapshot.label;
          const afterLabel = afterSnapshot.label;
          
          // Save diff as HTML file
          const diffFileName = `${deviceName}-${beforeLabel}-${afterLabel}.html`;
          const diffPath = path.join(diffsDir, diffFileName);
          
          // Generate and save rich dashboard diff HTML 
          const diffHtml = this.diffEngine.formatDiffAsDashboardHTML(diffData, deviceName, beforeSnapshot.id, afterSnapshot.id);
          await fs.writeFile(diffPath, diffHtml);
          
          this.log(`Generated diff: ${diffFileName}`);
        } catch (error) {
          this.log(`Warning: Could not generate diff for ${beforeSnapshot.label} -> ${afterSnapshot.label}: ${error.message}`);
        }
      }
    }

    const deviceData = {
      device_name: deviceName,
      generated_at: new Date().toISOString(),
      snapshots: snapshotsWithStats.map(s => ({
        id: s.id,
        label: s.label,
        timestamp: s.timestamp,
        files_count: s.files_count,
        has_errors: s.has_errors,
        diff_stats: s.diff_stats
      })),
      change_statistics: totalChanges,
      snapshot_data: snapshotData
    };

    const html = this.generateDeviceDashboardHTML(deviceData);
    
    const deviceDashboardPath = path.join(this.dashboardDir, `device-${deviceName}.html`);
    await fs.writeFile(deviceDashboardPath, html);
    
    this.log(`Dashboard generated with ${snapshots.length} snapshots and ${Math.max(0, snapshots.length - 1)} diffs`);
    
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
   * Generate main dashboard HTML
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
                    <span class="stat-label">Total Snapshots</span>
                    <span class="stat-value">${data.total_snapshots}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Recent Changes</span>
                    <span class="stat-value">${data.recent_changes}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Timeframe</span>
                    <span class="stat-value">${data.timeframe}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Generated</span>
                    <span class="stat-value">${new Date(data.generated_at).toLocaleString()}</span>
                </div>
            </div>
        </header>

        <main class="dashboard-main">
            <section class="devices-overview">
                <h2>📱 Device Overview</h2>
                <div class="devices-grid">
                    ${data.devices.map(device => `
                        <div class="device-card ${device.status === 'online' ? 'online' : 'offline'}">
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
                                    <span class="label">Last Snapshot</span>
                                    <span class="value">${device.last_snapshot ? new Date(device.last_snapshot).toLocaleDateString() : 'Never'}</span>
                                </div>
                                <div class="device-stat">
                                    <span class="label">Changes</span>
                                    <span class="value">${device.recent_changes}</span>
                                </div>
                            </div>
                            <div class="device-actions">
                                <a href="device-${device.name}.html" class="btn btn-primary">View Details</a>
                                <button class="btn btn-secondary" onclick="takeSnapshot('${device.name}')">Take Snapshot</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="recent-activity">
                <h2>📊 Recent Activity</h2>
                <div class="activity-timeline">
                    ${this.generateActivityTimeline(data.devices)}
                </div>
            </section>

            <section class="quick-actions">
                <h2>⚡ Quick Actions</h2>
                <div class="actions-grid">
                    <button class="action-btn" onclick="snapshotAllDevices()">
                        📸 Snapshot All Devices
                    </button>
                    <button class="action-btn" onclick="checkDrift()">
                        🔍 Check Configuration Drift
                    </button>
                    <button class="action-btn" onclick="generateReport()">
                        📋 Generate Report
                    </button>
                    <button class="action-btn" onclick="refreshDashboard()">
                        🔄 Refresh Dashboard
                    </button>
                </div>
            </section>
        </main>
    </div>

    <script>
        // Embedded snapshot data to avoid CORS issues
        ${data.snapshot_data ? `window.SNAPSHOT_DATA = ${JSON.stringify(data.snapshot_data, null, 2)};` : ''}
        ${data.device_name ? `window.DEVICE_NAME = ${JSON.stringify(data.device_name)};` : ''}
    </script>
    <script src="assets/dashboard.js"></script>
</body>
</html>`;
  }

  /**
   * Generate device-specific dashboard HTML
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
                        <span class="value">${data.snapshots.length}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Latest Snapshot</span>
                        <span class="value">${data.snapshots[0] ? new Date(data.snapshots[0].timestamp).toLocaleString() : 'None'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Total Comparisons</span>
                        <span class="value">${data.change_statistics.total_diffs}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Files Changed</span>
                        <span class="value">${data.change_statistics.files_changed}</span>
                    </div>
                </div>
                
                <div class="change-stats-section">
                    <h3>🔧 Configuration Changes Summary</h3>
                    <div class="stats-grid">
                        <div class="stat-group package-stats">
                            <h4>📦 Package Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.change_statistics.packages_added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.change_statistics.packages_removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.change_statistics.packages_modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stat-group section-stats">
                            <h4>📝 Section Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.change_statistics.sections_added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.change_statistics.sections_removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.change_statistics.sections_modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stat-group option-stats">
                            <h4>⚙️ Option Changes</h4>
                            <div class="stat-items">
                                <div class="stat-item added">
                                    <span class="stat-icon">+</span>
                                    <span class="stat-count">${data.change_statistics.options_added}</span>
                                    <span class="stat-label">Added</span>
                                </div>
                                <div class="stat-item removed">
                                    <span class="stat-icon">-</span>
                                    <span class="stat-count">${data.change_statistics.options_removed}</span>
                                    <span class="stat-label">Removed</span>
                                </div>
                                <div class="stat-item modified">
                                    <span class="stat-icon">~</span>
                                    <span class="stat-count">${data.change_statistics.options_modified}</span>
                                    <span class="stat-label">Modified</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="snapshots-timeline">
                <h2>📈 Snapshots Timeline</h2>
                <div class="timeline">
                    ${data.snapshots.map((snapshot, index) => `
                        <div class="timeline-item ${snapshot.has_errors ? 'has-errors' : ''} ${snapshot.diff_stats.has_changes ? 'has-changes' : ''}">
                            <div class="timeline-marker"></div>
                            <div class="timeline-content">
                                <div class="timeline-header">
                                    <h4>${snapshot.label}</h4>
                                    <span class="timestamp">${new Date(snapshot.timestamp).toLocaleString()}</span>
                                </div>
                                <div class="timeline-details">
                                    <span class="files-count">${snapshot.files_count} files captured</span>
                                    ${snapshot.has_errors ? '<span class="error-indicator">⚠️ Has warnings</span>' : ''}
                                    ${snapshot.diff_stats.has_changes ? '<span class="change-indicator">📊 Has changes</span>' : ''}
                                </div>
                                
                                ${snapshot.diff_stats.has_changes ? `
                                <div class="snapshot-diff-stats">
                                    <h5>📊 Changes since previous snapshot:</h5>
                                    <div class="snapshot-stats-grid">
                                        <div class="snapshot-stat-group">
                                            <span class="stat-label">📦 Packages:</span>
                                            <div class="stat-badges">
                                                ${snapshot.diff_stats.packages_added > 0 ? `<span class="stat-badge added">+${snapshot.diff_stats.packages_added}</span>` : ''}
                                                ${snapshot.diff_stats.packages_removed > 0 ? `<span class="stat-badge removed">-${snapshot.diff_stats.packages_removed}</span>` : ''}
                                                ${snapshot.diff_stats.packages_modified > 0 ? `<span class="stat-badge modified">~${snapshot.diff_stats.packages_modified}</span>` : ''}
                                            </div>
                                        </div>
                                        <div class="snapshot-stat-group">
                                            <span class="stat-label">📝 Sections:</span>
                                            <div class="stat-badges">
                                                ${snapshot.diff_stats.sections_added > 0 ? `<span class="stat-badge added">+${snapshot.diff_stats.sections_added}</span>` : ''}
                                                ${snapshot.diff_stats.sections_removed > 0 ? `<span class="stat-badge removed">-${snapshot.diff_stats.sections_removed}</span>` : ''}
                                                ${snapshot.diff_stats.sections_modified > 0 ? `<span class="stat-badge modified">~${snapshot.diff_stats.sections_modified}</span>` : ''}
                                            </div>
                                        </div>
                                        <div class="snapshot-stat-group">
                                            <span class="stat-label">⚙️ Options:</span>
                                            <div class="stat-badges">
                                                ${snapshot.diff_stats.options_added > 0 ? `<span class="stat-badge added">+${snapshot.diff_stats.options_added}</span>` : ''}
                                                ${snapshot.diff_stats.options_removed > 0 ? `<span class="stat-badge removed">-${snapshot.diff_stats.options_removed}</span>` : ''}
                                                ${snapshot.diff_stats.options_modified > 0 ? `<span class="stat-badge modified">~${snapshot.diff_stats.options_modified}</span>` : ''}
                                            </div>
                                        </div>
                                        ${snapshot.diff_stats.files_changed > 0 ? `
                                        <div class="snapshot-stat-group">
                                            <span class="stat-label">📄 Files:</span>
                                            <div class="stat-badges">
                                                <span class="stat-badge modified">${snapshot.diff_stats.files_changed} changed</span>
                                            </div>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                                ` : index === data.snapshots.length - 1 ? `
                                <div class="snapshot-diff-stats">
                                    <p class="no-changes">🔍 Initial snapshot - no previous snapshot to compare with</p>
                                </div>
                                ` : `
                                <div class="snapshot-diff-stats">
                                    <p class="no-changes">✅ No configuration changes since previous snapshot</p>
                                </div>
                                `}
                                
                                <div class="timeline-actions">
                                    ${index < data.snapshots.length - 1 ? `
                                        <button class="btn btn-sm" onclick="compareTo('${snapshot.id}', '${data.snapshots[index + 1].id}')">
                                            Compare with Previous
                                        </button>
                                    ` : ''}
                                    <button class="btn btn-sm btn-secondary" onclick="viewSnapshot('${snapshot.id}')">
                                        View Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        </main>
    </div>

    <script>
        // Embedded snapshot data to avoid CORS issues
        ${data.snapshot_data ? `window.SNAPSHOT_DATA = ${JSON.stringify(data.snapshot_data, null, 2)};` : ''}
        ${data.device_name ? `window.DEVICE_NAME = ${JSON.stringify(data.device_name)};` : ''}
    </script>
    <script src="assets/dashboard.js"></script>
</body>
</html>`;
  }

  /**
   * Generate diff visualization HTML
   */
  generateDiffHTML(diffData, deviceName, beforeId, afterId) {
    // If diffData is already HTML (starts with <!DOCTYPE), return it directly
    if (typeof diffData === 'string' && diffData.trim().startsWith('<!DOCTYPE')) {
      return diffData;
    }
    
    // If it's plain text diff, wrap it in our template
    if (typeof diffData === 'string') {
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration Diff - ${deviceName}</title>
    <link rel="stylesheet" href="../assets/dashboard.css">
    <style>
        .diff-content { font-family: 'Courier New', monospace; }
        .diff-text { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 4px; 
            white-space: pre-wrap;
            max-height: 80vh;
            overflow-y: auto;
        }
    </style>
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
            <div class="diff-header">
                <h2>${deviceName}: ${beforeId} → ${afterId}</h2>
            </div>
            
            <div class="diff-content">
                <pre class="diff-text">${this.escapeHtml(diffData)}</pre>
            </div>
        </main>
    </div>
</body>
</html>`;
    }

    // If we have structured diff data, create a more sophisticated view
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
            <div class="diff-summary">
                <h2>Summary</h2>
                <div class="diff-stats">
                    <div class="stat added">+${diff.statistics?.sections_added || 0} sections added</div>
                    <div class="stat removed">-${diff.statistics?.sections_removed || 0} sections removed</div>
                    <div class="stat modified">~${diff.statistics?.options_changed || 0} options changed</div>
                </div>
            </div>
            
            <div class="diff-details">
                <h3>Detailed Changes</h3>
                <!-- Structured diff display would go here -->
                <pre class="diff-text">${this.escapeHtml(JSON.stringify(diff, null, 2))}</pre>
            </div>
        </main>
    </div>
</body>
</html>`;
  }

  /**
   * Generate activity timeline
   */
  generateActivityTimeline(devices) {
    const activities = [];
    
    devices.forEach(device => {
      if (device.last_snapshot) {
        activities.push({
          timestamp: device.last_snapshot,
          type: 'snapshot',
          device: device.name,
          description: `Snapshot taken for ${device.name}`
        });
      }
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return activities.slice(0, 10).map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">📸</div>
            <div class="activity-content">
                <div class="activity-description">${activity.description}</div>
                <div class="activity-timestamp">${new Date(activity.timestamp).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
  }

  /**
   * Generate static assets (CSS and JS)
   */
  async generateStaticAssets() {
    const assetsDir = path.join(this.dashboardDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    // Generate CSS
    const css = this.generateCSS();
    await fs.writeFile(path.join(assetsDir, 'dashboard.css'), css);

    // Generate JavaScript
    const js = this.generateJavaScript();
    await fs.writeFile(path.join(assetsDir, 'dashboard.js'), js);
  }

  /**
   * Generate CSS styles
   */
  generateCSS() {
    return `
/* UCI Configuration Dashboard Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
}

.dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.dashboard-header {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    margin-bottom: 20px;
}

.dashboard-header h1 {
    color: #2c3e50;
    margin-bottom: 15px;
}

.header-stats {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
}

.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 6px;
    min-width: 120px;
}

.stat-label {
    font-size: 0.85em;
    color: #666;
    margin-bottom: 5px;
}

.stat-value {
    font-size: 1.5em;
    font-weight: bold;
    color: #2c3e50;
}

.devices-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 20px;
}

.device-card {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border-left: 4px solid #e74c3c;
}

.device-card.online {
    border-left-color: #27ae60;
}

.device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.device-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: bold;
    text-transform: uppercase;
}

.device-status.online {
    background: #d4edda;
    color: #155724;
}

.device-status.offline {
    background: #f8d7da;
    color: #721c24;
}

.device-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 15px;
}

.device-stat {
    text-align: center;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 4px;
}

.device-stat .label {
    display: block;
    font-size: 0.8em;
    color: #666;
}

.device-stat .value {
    display: block;
    font-weight: bold;
    font-size: 1.1em;
}

.device-actions {
    display: flex;
    gap: 10px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-decoration: none;
    font-size: 0.9em;
    transition: background-color 0.2s;
}

.btn-primary {
    background: #3498db;
    color: white;
}

.btn-primary:hover {
    background: #2980b9;
}

.btn-secondary {
    background: #95a5a6;
    color: white;
}

.btn-secondary:hover {
    background: #7f8c8d;
}

.timeline {
    position: relative;
    padding-left: 30px;
}

.timeline::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #bdc3c7;
}

.timeline-item {
    position: relative;
    margin-bottom: 20px;
    background: white;
    padding: 15px;
    border-radius: 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.timeline-marker {
    position: absolute;
    left: -22px;
    top: 20px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #3498db;
    border: 3px solid white;
    box-shadow: 0 0 0 2px #bdc3c7;
}

.timeline-item.has-errors .timeline-marker {
    background: #e74c3c;
}

.diff-text {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 6px;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9em;
    line-height: 1.4;
}

.actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-top: 20px;
}

.action-btn {
    padding: 20px;
    background: white;
    border: 2px solid #3498db;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.2s;
}

.action-btn:hover {
    background: #3498db;
    color: white;
}

.breadcrumb {
    margin-bottom: 10px;
}

.breadcrumb a {
    color: #3498db;
    text-decoration: none;
}

.breadcrumb a:hover {
    text-decoration: underline;
}

.diff-stats {
    display: flex;
    gap: 15px;
    margin: 15px 0;
}

.diff-stats .stat {
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: bold;
}

.diff-stats .added {
    background: #d4edda;
    color: #155724;
}

.diff-stats .removed {
    background: #f8d7da;
    color: #721c24;
}

.diff-stats .modified {
    background: #fff3cd;
    color: #856404;
}

/* Change Statistics Styles */
.change-stats-section {
    margin-top: 25px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.change-stats-section h3 {
    margin-bottom: 20px;
    color: #2c3e50;
    border-bottom: 2px solid #ecf0f1;
    padding-bottom: 10px;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
}

.stat-group {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.stat-group h4 {
    margin-bottom: 15px;
    color: #495057;
    font-size: 1em;
    text-align: center;
}

.stat-items {
    display: flex;
    justify-content: space-around;
    align-items: center;
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    border-radius: 4px;
    min-width: 60px;
}

.stat-item.added {
    background: #d4edda;
    color: #155724;
}

.stat-item.removed {
    background: #f8d7da;
    color: #721c24;
}

.stat-item.modified {
    background: #fff3cd;
    color: #856404;
}

.stat-icon {
    font-size: 1.2em;
    font-weight: bold;
    margin-bottom: 5px;
}

.stat-count {
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 2px;
}

.stat-label {
    font-size: 0.8em;
    text-transform: uppercase;
    font-weight: 500;
}

.info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 15px;
}

.info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.info-item .label {
    font-size: 0.9em;
    color: #6c757d;
    margin-bottom: 8px;
    text-align: center;
}

.info-item .value {
    font-size: 1.3em;
    font-weight: bold;
    color: #2c3e50;
    text-align: center;
}

@media (max-width: 768px) {
    .devices-grid {
        grid-template-columns: 1fr;
    }
    
    .header-stats {
        justify-content: center;
    }
    
    .device-stats {
        grid-template-columns: 1fr;
    }
    
    .stats-grid {
        grid-template-columns: 1fr;
    }
    
    .info-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .stat-items {
        justify-content: space-between;
    }
}

/* Per-Snapshot Diff Statistics */
.timeline-item.has-changes {
    border-left: 4px solid #28a745;
}

.change-indicator {
    background: #d4edda;
    color: #155724;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.8em;
    font-weight: bold;
    margin-left: 10px;
}

.snapshot-diff-stats {
    margin: 15px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.snapshot-diff-stats h5 {
    margin: 0 0 10px 0;
    color: #495057;
    font-size: 0.9em;
}

.snapshot-stats-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: center;
}

.snapshot-stat-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.stat-label {
    font-size: 0.8em;
    font-weight: 500;
    color: #6c757d;
    white-space: nowrap;
}

.stat-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.stat-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: bold;
    white-space: nowrap;
}

.stat-badge.added {
    background: #d4edda;
    color: #155724;
}

.stat-badge.removed {
    background: #f8d7da;
    color: #721c24;
}

.stat-badge.modified {
    background: #fff3cd;
    color: #856404;
}

.no-changes {
    margin: 0;
    color: #6c757d;
    font-style: italic;
    font-size: 0.9em;
}

@media (max-width: 768px) {
    .snapshot-stats-grid {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    
    .snapshot-stat-group {
        width: 100%;
        justify-content: space-between;
    }
}

/* Modal Styles */
.snapshot-modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0,0,0,0.4);
}

.modal-content {
    background-color: #fefefe;
    margin: 2% auto;
    padding: 0;
    border: 1px solid #888;
    width: 90%;
    max-width: 1000px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.modal-header {
    padding: 20px;
    background: #3498db;
    color: white;
    border-radius: 8px 8px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h2 {
    margin: 0;
    font-size: 1.5em;
}

.modal-close {
    color: white;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    line-height: 1;
    opacity: 0.8;
    transition: opacity 0.2s;
}

.modal-close:hover,
.modal-close:focus {
    opacity: 1;
}

.modal-tabs {
    background: #f8f9fa;
    padding: 10px 20px;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    gap: 10px;
    overflow-x: auto;
}

.tab-button {
    padding: 10px 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 1em;
    color: #495057;
    border-radius: 4px;
    transition: all 0.2s;
    white-space: nowrap;
}

.tab-button:hover {
    background: #e9ecef;
}

.tab-button.active {
    background: #3498db;
    color: white;
}

.modal-body {
    padding: 20px;
    max-height: 70vh;
    overflow-y: auto;
}

.loading {
    text-align: center;
    padding: 40px;
    color: #6c757d;
}

.tab-content h3 {
    margin-bottom: 20px;
    color: #2c3e50;
}

.tab-content h4 {
    margin-bottom: 15px;
    color: #495057;
}

.overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 30px;
}

.overview-item {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.overview-item strong {
    display: block;
    color: #6c757d;
    font-size: 0.9em;
    margin-bottom: 5px;
}

.overview-item span {
    color: #2c3e50;
    font-size: 1.1em;
}

.file-list {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 6px;
    max-height: 300px;
    overflow-y: auto;
}

.file-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #e9ecef;
}

.file-item:last-child {
    border-bottom: none;
}

.file-name {
    color: #495057;
    font-family: monospace;
}

.file-size {
    color: #6c757d;
    font-size: 0.9em;
}

.info-sections {
    display: flex;
    flex-direction: column;
    gap: 25px;
}

.info-section {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.info-section h4 {
    margin-bottom: 15px;
    color: #495057;
    border-bottom: 1px solid #dee2e6;
    padding-bottom: 10px;
}

.network-info,
.service-info {
    margin-bottom: 15px;
}

.network-info strong,
.service-info strong {
    display: block;
    color: #495057;
    margin-bottom: 10px;
}

.network-info pre,
.service-info pre {
    background: white;
    padding: 15px;
    border-radius: 4px;
    border: 1px solid #dee2e6;
    overflow-x: auto;
    font-size: 0.9em;
    white-space: pre-wrap;
}

.config-section {
    margin-bottom: 20px;
}

.config-files-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
}

.config-file-btn {
    padding: 10px 15px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.2s;
    text-align: center;
}

.config-file-btn:hover {
    background: #e9ecef;
    border-color: #adb5bd;
}

.config-file-btn.active {
    background: #3498db;
    color: white;
    border-color: #3498db;
}

.config-file-content {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #e9ecef;
}

.config-file-viewer {
    background: white;
    padding: 15px;
    border-radius: 4px;
    border: 1px solid #dee2e6;
    max-height: 400px;
    overflow: auto;
}

.config-file-viewer pre {
    margin: 0;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 0.85em;
    line-height: 1.4;
}

.config-file-viewer code {
    display: block;
    white-space: pre;
}

.error-message {
    background: #f8d7da;
    color: #721c24;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #f5c6cb;
}

.error-message h3 {
    margin-bottom: 10px;
}

.error-message p {
    margin: 0;
}

@media (max-width: 768px) {
    .modal-content {
        width: 95%;
        margin: 10px auto;
    }
    
    .modal-tabs {
        padding: 10px;
    }
    
    .tab-button {
        padding: 8px 12px;
        font-size: 0.9em;
    }
    
    .overview-grid {
        grid-template-columns: 1fr;
    }
    
    .config-files-grid {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
}`;
  }

  /**
   * Generate JavaScript functionality
   */
  generateJavaScript() {
    return `
// UCI Configuration Dashboard JavaScript

function takeSnapshot(deviceName) {
    alert('Taking snapshot for ' + deviceName + '...');
    // This would integrate with the MCP server
}

function snapshotAllDevices() {
    alert('Taking snapshots for all devices...');
}

function checkDrift() {
    alert('Checking configuration drift...');
}

function generateReport() {
    alert('Generating report...');
}

function refreshDashboard() {
    location.reload();
}

function compareTo(snapshotId1, snapshotId2) {
    const deviceName = window.DEVICE_NAME || document.title.includes('QEMU OpenWRT VM') ? 'QEMU OpenWRT VM' : 'Unknown Device';
    const fileName = \`\${deviceName}-\${snapshotId2.replace(/2025-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-/, '')}-\${snapshotId1.replace(/2025-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-/, '')}.html\`;
    const diffUrl = \`diffs/\${fileName}\`;
    window.open(diffUrl, '_blank');
}

function viewSnapshot(snapshotId) {
    showSnapshotModal(snapshotId);
}

// Modal functionality
function showSnapshotModal(snapshotId) {
    // Create modal if it doesn't exist
    if (!document.getElementById('snapshotModal')) {
        createSnapshotModal();
    }
    
    const modal = document.getElementById('snapshotModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    modalTitle.textContent = \`Snapshot: \${snapshotId}\`;
    modalContent.innerHTML = '<div class="loading">Loading snapshot details...</div>';
    
    modal.style.display = 'block';
    
    // Load snapshot data
    loadSnapshotData(snapshotId);
}

function createSnapshotModal() {
    const modal = document.createElement('div');
    modal.id = 'snapshotModal';
    modal.className = 'snapshot-modal';
    
    modal.innerHTML = \`
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">Snapshot Details</h2>
                <span class="modal-close" onclick="closeSnapshotModal()">&times;</span>
            </div>
            <div class="modal-tabs">
                <button class="tab-button active" onclick="showTab('overview')">Overview</button>
                <button class="tab-button" onclick="showTab('system')">System</button>
                <button class="tab-button" onclick="showTab('network')">Network</button>
                <button class="tab-button" onclick="showTab('services')">Services</button>
                <button class="tab-button" onclick="showTab('configuration')">Configuration</button>
            </div>
            <div id="modalContent" class="modal-body">
                <!-- Content will be loaded dynamically -->
            </div>
        </div>
    \`;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeSnapshotModal();
        }
    });
}

function closeSnapshotModal() {
    const modal = document.getElementById('snapshotModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showTab(tabName) {
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Show appropriate content
    const modalContent = document.getElementById('modalContent');
    const currentSnapshotId = document.getElementById('modalTitle').textContent.replace('Snapshot: ', '');
    
    switch(tabName) {
        case 'overview':
            loadOverviewTab(currentSnapshotId, modalContent);
            break;
        case 'system':
            loadSystemTab(currentSnapshotId, modalContent);
            break;
        case 'network':
            loadNetworkTab(currentSnapshotId, modalContent);
            break;
        case 'services':
            loadServicesTab(currentSnapshotId, modalContent);
            break;
        case 'configuration':
            loadConfigurationTab(currentSnapshotId, modalContent);
            break;
    }
}

async function loadSnapshotData(snapshotId) {
    // Default to overview tab
    loadOverviewTab(snapshotId, document.getElementById('modalContent'));
}

async function loadOverviewTab(snapshotId, container) {
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        let metadata = {};
        
        // Use embedded data if available, otherwise show fallback
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId] && window.SNAPSHOT_DATA[snapshotId].metadata) {
            metadata = window.SNAPSHOT_DATA[snapshotId].metadata;
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>📊 Snapshot Overview</h3>
                <div class="overview-grid">
                    <div class="overview-item">
                        <strong>Snapshot ID:</strong>
                        <span>\${snapshotId}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Captured:</strong>
                        <span>\${metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'Unknown'}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Files Count:</strong>
                        <span>\${metadata.file_count || 'Unknown'}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Total Size:</strong>
                        <span>\${metadata.total_size ? (metadata.total_size / 1024).toFixed(1) + ' KB' : 'Unknown'}</span>
                    </div>
                </div>
                
                <h4>📁 Captured Files</h4>
                <div class="file-list">
                    \${metadata.files ? metadata.files.map(file => \`
                        <div class="file-item">
                            <span class="file-name">\${file.name}</span>
                            <span class="file-size">\${(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                    \`).join('') : '<p>File information not available</p>'}
                </div>
            </div>
        \`;
    } catch (error) {
        container.innerHTML = \`
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Error Loading Overview</h3>
                    <p>Could not load snapshot overview: \${error.message}</p>
                </div>
            </div>
        \`;
    }
}

async function loadSystemTab(snapshotId, container) {
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        let systemInfo = null;
        
        // Use embedded data if available
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId] && window.SNAPSHOT_DATA[snapshotId].systemInfo) {
            systemInfo = window.SNAPSHOT_DATA[snapshotId].systemInfo;
        } else {
            throw new Error('System information not available for this snapshot');
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>🖥 System Information</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Basic Information</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Hostname:</strong>
                                <span>\${systemInfo.hostname || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Uptime:</strong>
                                <span>\${systemInfo.uptime || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Date:</strong>
                                <span>\${systemInfo.date || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Hardware & OS</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Kernel:</strong>
                                <span>\${systemInfo.uname || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>OpenWRT Release:</strong>
                                <span>\${systemInfo.openwrt_release || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Memory & Storage</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Memory Usage:</strong>
                                <span>\${systemInfo.memory_usage || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Disk Usage:</strong>
                                <span>\${systemInfo.disk_usage || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Load Average:</strong>
                                <span>\${systemInfo.load_average || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        \`;
    } catch (error) {
        container.innerHTML = \`
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ System Information Not Available</h3>
                    <p>System information not available for this snapshot: \${error.message}</p>
                </div>
            </div>
        \`;
    }
}

async function loadNetworkTab(snapshotId, container) {
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        let networkInfo = null;
        
        // Use embedded data if available
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId] && window.SNAPSHOT_DATA[snapshotId].networkStatus) {
            networkInfo = window.SNAPSHOT_DATA[snapshotId].networkStatus;
        } else {
            throw new Error('Network information not available for this snapshot');
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>🌐 Network Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Interface Information</h4>
                        <div class="network-info">
                            <strong>IP Addresses:</strong>
                            <pre>\${networkInfo.ip_addresses || 'Not available'}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Routing Table:</strong>
                            <pre>\${networkInfo.routes || 'Not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Network Statistics</h4>
                        <div class="network-info">
                            <strong>Interface Statistics:</strong>
                            <pre>\${networkInfo.interface_stats || 'Not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Connectivity</h4>
                        <div class="network-info">
                            <strong>DNS Resolution:</strong>
                            <pre>\${networkInfo.dns_test || 'Not available'}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Gateway Ping:</strong>
                            <pre>\${networkInfo.gateway_ping || 'Not available'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        \`;
    } catch (error) {
        container.innerHTML = \`
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Network Information Not Available</h3>
                    <p>Network information not available for this snapshot: \${error.message}</p>
                </div>
            </div>
        \`;
    }
}

async function loadServicesTab(snapshotId, container) {
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        let serviceInfo = null;
        
        // Use embedded data if available
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId] && window.SNAPSHOT_DATA[snapshotId].serviceStatus) {
            serviceInfo = window.SNAPSHOT_DATA[snapshotId].serviceStatus;
        } else {
            throw new Error('Service information not available for this snapshot');
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>⚙ Services Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Running Processes</h4>
                        <div class="service-info">
                            <pre>\${serviceInfo.processes || 'Process information not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Service Configuration</h4>
                        <div class="service-info">
                            <pre>\${serviceInfo.enabled_services || 'Service configuration not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>System Logs</h4>
                        <div class="service-info">
                            <strong>Recent Log Entries:</strong>
                            <pre>\${serviceInfo.recent_logs || 'Log information not available'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        \`;
    } catch (error) {
        container.innerHTML = \`
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Service Information Not Available</h3>
                    <p>Service information not available for this snapshot: \${error.message}</p>
                </div>
            </div>
        \`;
    }
}

async function loadConfigurationTab(snapshotId, container) {
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        
        // Get list of config files
        const configFiles = [
            'dhcp.conf', 'dropbear.conf', 'firewall.conf', 'luci.conf', 'network.conf',
            'openvpn.conf', 'openvpn-opkg.conf', 'openwisp.conf', 'openwisp-monitoring.conf',
            'rpcd.conf', 'socat.conf', 'system.conf', 'ubispot.conf', 'ubispot-opkg.conf',
            'ucitrack.conf', 'uhttpd.conf'
        ];
        
        // Filter to only show files that exist in the embedded data
        const availableFiles = configFiles.filter(file => 
            window.SNAPSHOT_DATA && 
            window.SNAPSHOT_DATA[snapshotId] && 
            window.SNAPSHOT_DATA[snapshotId].configFiles && 
            window.SNAPSHOT_DATA[snapshotId].configFiles[file]
        );
        
        const fileButtons = availableFiles.map(file => \`
            <button class="config-file-btn" onclick="loadConfigFile('\${snapshotId}', '\${file}')">
                \${file}
            </button>
        \`).join('');
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>📝 Configuration Files</h3>
                <div class="config-section">
                    <h4>Available Configuration Files (\${availableFiles.length})</h4>
                    <div class="config-files-grid">
                        \${fileButtons || '<p>No configuration files available for this snapshot</p>'}
                    </div>
                </div>
                <div id="configFileContent" class="config-file-content">
                    <p>Select a configuration file to view its contents.</p>
                </div>
            </div>
        \`;
    } catch (error) {
        container.innerHTML = \`
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Configuration Not Available</h3>
                    <p>Configuration files not available for this snapshot: \${error.message}</p>
                </div>
            </div>
        \`;
    }
}

async function loadConfigFile(snapshotId, fileName) {
    const contentDiv = document.getElementById('configFileContent');
    contentDiv.innerHTML = '<div class="loading">Loading configuration file...</div>';
    
    try {
        const deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
        let content = null;
        
        // Use embedded data if available
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId] && 
            window.SNAPSHOT_DATA[snapshotId].configFiles && 
            window.SNAPSHOT_DATA[snapshotId].configFiles[fileName]) {
            content = window.SNAPSHOT_DATA[snapshotId].configFiles[fileName];
        } else {
            throw new Error(\`File not found: \${fileName}\`);
        }
        
        contentDiv.innerHTML = \`
            <h4>📄 \${fileName}</h4>
            <div class="config-file-viewer">
                <pre><code>\${escapeHtml(content)}</code></pre>
            </div>
        \`;
        
        // Highlight active file button
        document.querySelectorAll('.config-file-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
    } catch (error) {
        contentDiv.innerHTML = \`
            <div class="error-message">
                <p>Error loading \${fileName}: \${error.message}</p>
            </div>
        \`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debug function to check embedded data
function checkEmbeddedData() {
    if (window.SNAPSHOT_DATA) {
        console.log('✅ Embedded snapshot data available for', Object.keys(window.SNAPSHOT_DATA).length, 'snapshots');
        console.log('Device name:', window.DEVICE_NAME);
        console.log('Available snapshots:', Object.keys(window.SNAPSHOT_DATA));
    } else {
        console.log('❌ No embedded snapshot data found');
    }
}

// Auto-refresh every 5 minutes
setInterval(function() {
    const lastRefresh = localStorage.getItem('lastRefresh');
    const now = Date.now();
    
    if (!lastRefresh || now - parseInt(lastRefresh) > 300000) {
        localStorage.setItem('lastRefresh', now.toString());
        // Could auto-refresh here
    }
}, 60000);

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('UCI Configuration Dashboard loaded');
    checkEmbeddedData();
});`;
  }

  /**
   * Helper methods
   */
  async collectDeviceData(device, timeframe) {
    // This would integrate with the snapshot engine
    return {
      name: device.name || device,
      status: 'unknown',
      snapshot_count: 0,
      last_snapshot: null,
      recent_changes: 0
    };
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  log(message) {
    if (this.debug) {
      console.error(`[Dashboard] ${message}`);
    }
  }
}