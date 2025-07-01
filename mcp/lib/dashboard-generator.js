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
      change_statistics: totalChanges
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
    alert('Comparing ' + snapshotId1 + ' with ' + snapshotId2);
}

function viewSnapshot(snapshotId) {
    alert('Viewing snapshot: ' + snapshotId);
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

console.log('UCI Configuration Dashboard loaded');`;
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