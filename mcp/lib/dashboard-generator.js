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
  async generateDeviceDashboard(deviceName, snapshots) {
    this.log(`Generating device dashboard for ${deviceName}...`);

    const deviceData = {
      device_name: deviceName,
      generated_at: new Date().toISOString(),
      snapshots: snapshots.map(s => ({
        id: s.id,
        label: s.label,
        timestamp: s.timestamp,
        files_count: s.files_count,
        has_errors: s.has_errors
      }))
    };

    const html = this.generateDeviceDashboardHTML(deviceData);
    
    const deviceDashboardPath = path.join(this.dashboardDir, `device-${deviceName}.html`);
    await fs.writeFile(deviceDashboardPath, html);
    
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

    const diffHtml = this.generateDiffHTML(diffData, deviceName, beforeId, afterId);
    
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
                <h2>Device Information</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="label">Total Snapshots</span>
                        <span class="value">${data.snapshots.length}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Latest Snapshot</span>
                        <span class="value">${data.snapshots[0] ? new Date(data.snapshots[0].timestamp).toLocaleString() : 'None'}</span>
                    </div>
                </div>
            </section>

            <section class="snapshots-timeline">
                <h2>📈 Snapshots Timeline</h2>
                <div class="timeline">
                    ${data.snapshots.map((snapshot, index) => `
                        <div class="timeline-item ${snapshot.has_errors ? 'has-errors' : ''}">
                            <div class="timeline-marker"></div>
                            <div class="timeline-content">
                                <div class="timeline-header">
                                    <h4>${snapshot.label}</h4>
                                    <span class="timestamp">${new Date(snapshot.timestamp).toLocaleString()}</span>
                                </div>
                                <div class="timeline-details">
                                    <span class="files-count">${snapshot.files_count} files captured</span>
                                    ${snapshot.has_errors ? '<span class="error-indicator">⚠️ Has warnings</span>' : ''}
                                </div>
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
    // Parse diff data if it's a string
    let diff = diffData;
    if (typeof diffData === 'string') {
      // For now, display as preformatted text
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  log(message) {
    if (this.debug) {
      console.error(`[Dashboard] ${message}`);
    }
  }
}