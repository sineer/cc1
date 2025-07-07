/**
 * Script Generator - Dashboard JavaScript generation
 * Generates all JavaScript code for UCI configuration dashboards
 */

export class ScriptGenerator {
  constructor(options = {}) {
    this.minify = options.minify || false;
    this.includeDebug = options.includeDebug || true;
  }

  /**
   * Generate complete dashboard JavaScript
   */
  generate() {
    const js = `
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
    // Extract the descriptive part from snapshot IDs (removing timestamps)
    const getLabel = (id) => id.replace(/^2025-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-/, '');
    
    const label1 = getLabel(snapshotId1);
    const label2 = getLabel(snapshotId2);
    
    // Format device name to match actual file naming convention
    let deviceName = window.DEVICE_NAME || 'QEMU OpenWRT VM';
    if (deviceName.includes('(') && deviceName.includes(')')) {
        // Convert "Direct IP (192.168.11.2)" to "Direct-IP-(192.168.11.2)"
        deviceName = deviceName.replace(/\\s+/g, '-');
    }
    
    // Construct filename to match actual generated diff files
    const fileName = \`\${deviceName}-\${label1}-\${label2}.html\`;
    const diffUrl = \`diffs/\${fileName}\`;
    
    console.log('Opening diff:', diffUrl); // Debug log
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
        
        // Calculate file information from available data
        let fileCount = 'Unknown';
        let totalSize = 'Unknown';
        let fileListHtml = '<p>File information not available</p>';
        
        if (metadata.files_captured && Array.isArray(metadata.files_captured)) {
            fileCount = metadata.files_captured.length;
            
            // If we have detailed file info with sizes
            if (metadata.files && Array.isArray(metadata.files)) {
                totalSize = metadata.files.reduce((sum, file) => sum + (file.size || 0), 0);
                totalSize = (totalSize / 1024).toFixed(1) + ' KB';
                
                fileListHtml = metadata.files.map(file => \`
                    <div class="file-item">
                        <span class="file-name">\${file.name}</span>
                        <span class="file-size">\${((file.size || 0) / 1024).toFixed(1)} KB</span>
                    </div>
                \`).join('');
            } else {
                // Just show file names from files_captured
                fileListHtml = metadata.files_captured.map(fileName => \`
                    <div class="file-item">
                        <span class="file-name">\${fileName}</span>
                        <span class="file-size">Size unknown</span>
                    </div>
                \`).join('');
            }
        } else if (metadata.file_count) {
            fileCount = metadata.file_count;
            if (metadata.total_size) {
                totalSize = (metadata.total_size / 1024).toFixed(1) + ' KB';
            }
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
                        <span>\${fileCount}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Total Size:</strong>
                        <span>\${totalSize}</span>
                    </div>
                </div>
                
                <h4>📁 Captured Files</h4>
                <div class="file-list">
                    \${fileListHtml}
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
        
        // Try to get system info from metadata first, then from separate systemInfo
        if (window.SNAPSHOT_DATA && window.SNAPSHOT_DATA[snapshotId]) {
            const snapshotData = window.SNAPSHOT_DATA[snapshotId];
            systemInfo = snapshotData.metadata?.system_info || snapshotData.systemInfo;
        }
        
        if (!systemInfo) {
            throw new Error('System information not available for this snapshot');
        }
        
        // Helper function to extract value, handling both output and error cases
        function getValue(cmdObj, defaultValue = 'Unknown') {
            if (!cmdObj) return defaultValue;
            if (typeof cmdObj === 'string') return cmdObj;
            if (cmdObj.output) return cmdObj.output;
            if (cmdObj.error) return \`Error: \${cmdObj.error}\`;
            return defaultValue;
        }
        
        // Extract OpenWRT release version from multi-line output
        function getOpenWrtVersion(cmdObj) {
            const output = getValue(cmdObj);
            if (output && output.includes('DISTRIB_DESCRIPTION=')) {
                const match = output.match(/DISTRIB_DESCRIPTION='([^']+)'/);
                return match ? match[1] : output.split('\\n')[0];
            }
            return output;
        }
        
        // Extract memory info from free command output
        function getMemoryInfo(cmdObj) {
            const output = getValue(cmdObj);
            if (output && output.includes('Mem:')) {
                const lines = output.split('\\n');
                const memLine = lines.find(line => line.trim().startsWith('Mem:'));
                return memLine ? memLine.trim() : output;
            }
            return output;
        }
        
        // Extract disk usage from df command output  
        function getDiskInfo(cmdObj) {
            const output = getValue(cmdObj);
            if (output && output.includes('/dev/root')) {
                const lines = output.split('\\n');
                const rootLine = lines.find(line => line.includes('/dev/root'));
                return rootLine ? rootLine.trim() : output;
            }
            return output;
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
                                <span>\${getValue(systemInfo.hostname, 'Not available')}</span>
                            </div>
                            <div class="info-item">
                                <strong>Uptime:</strong>
                                <span>\${getValue(systemInfo.uptime).trim()}</span>
                            </div>
                            <div class="info-item">
                                <strong>Date:</strong>
                                <span>\${getValue(systemInfo.date).trim()}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Hardware & OS</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Kernel:</strong>
                                <span>\${getValue(systemInfo.kernel).trim()}</span>
                            </div>
                            <div class="info-item">
                                <strong>OpenWRT Release:</strong>
                                <span>\${getOpenWrtVersion(systemInfo.openwrt_release)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Memory & Storage</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Memory Usage:</strong>
                                <span style="font-family: monospace; font-size: 0.85em;">\${getMemoryInfo(systemInfo.memory_usage)}</span>
                            </div>
                            <div class="info-item">
                                <strong>Disk Usage:</strong>
                                <span style="font-family: monospace; font-size: 0.85em;">\${getDiskInfo(systemInfo.disk_usage)}</span>
                            </div>
                            <div class="info-item">
                                <strong>Load Average:</strong>
                                <span>\${getValue(systemInfo.load_average).trim()}</span>
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
        
        // Helper function to extract value, handling both output and error cases
        function getValue(cmdObj, defaultValue = 'Not available') {
            if (!cmdObj) return defaultValue;
            if (typeof cmdObj === 'string') return cmdObj;
            if (cmdObj.output) return cmdObj.output.trim();
            if (cmdObj.error) return \`Error: \${cmdObj.error}\`;
            return defaultValue;
        }
        
        // Helper to format network output with proper wrapping
        function formatNetworkOutput(cmdObj) {
            const output = getValue(cmdObj);
            if (output === 'Not available' || output.startsWith('Error:')) {
                return output;
            }
            // Keep network output as-is for proper formatting
            return output;
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>🌐 Network Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Interface Information</h4>
                        <div class="network-info">
                            <strong>IP Addresses:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.ip_addresses)}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Routing Table:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.routing_table)}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Bridge Information:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.bridge_info)}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Network Statistics</h4>
                        <div class="network-info">
                            <strong>Interface Statistics:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.interface_stats)}</pre>
                        </div>
                        <div class="network-info">
                            <strong>ARP Table:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.arp_table)}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Connectivity & Security</h4>
                        <div class="network-info">
                            <strong>DNS Resolution:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.dns_test)}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Gateway Ping:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.ping_gateway)}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Firewall Rules:</strong>
                            <pre>\${formatNetworkOutput(networkInfo.iptables_rules)}</pre>
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
        
        // Helper function to extract value, handling both output and error cases
        function getValue(cmdObj, defaultValue = 'Not available') {
            if (!cmdObj) return defaultValue;
            if (typeof cmdObj === 'string') return cmdObj;
            if (cmdObj.output) {
                // Handle empty output
                const output = cmdObj.output.trim();
                return output || 'No output returned';
            }
            if (cmdObj.error) return \`Error: \${cmdObj.error}\`;
            return defaultValue;
        }
        
        // Helper to format service output, handling empty or no data gracefully
        function formatServiceOutput(cmdObj, emptyMessage = 'No data available') {
            const output = getValue(cmdObj);
            if (output === 'Not available' || output.startsWith('Error:')) {
                return output;
            }
            if (output === 'No output returned') {
                return emptyMessage;
            }
            return output;
        }
        
        container.innerHTML = \`
            <div class="tab-content">
                <h3>⚙ Services Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>System Resources</h4>
                        <div class="service-info">
                            <strong>Memory Usage:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.memory_usage, 'Memory information not available')}</pre>
                        </div>
                        <div class="service-info">
                            <strong>Disk Usage:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.disk_usage, 'Disk information not available')}</pre>
                        </div>
                        <div class="service-info">
                            <strong>Load Average:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.load_average, 'Load information not available')}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Process Information</h4>
                        <div class="service-info">
                            <strong>Active Processes:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.active_processes, 'Process list not available')}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Service Configuration</h4>
                        <div class="service-info">
                            <strong>Running Services:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.running_services, 'Service list not available')}</pre>
                        </div>
                        <div class="service-info">
                            <strong>UCI Services:</strong>
                            <pre>\${formatServiceOutput(serviceInfo.uci_services, 'UCI service configuration not available')}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>System Logs</h4>
                        <div class="service-info">
                            <strong>System Log (Recent):</strong>
                            <pre style="max-height: 300px; overflow-y: auto;">\${formatServiceOutput(serviceInfo.system_log, 'System log not available')}</pre>
                        </div>
                        <div class="service-info">
                            <strong>Kernel Log (Recent):</strong>
                            <pre style="max-height: 200px; overflow-y: auto;">\${formatServiceOutput(serviceInfo.kernel_log, 'Kernel log not available')}</pre>
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
});

// Enhanced functionality for dashboard interactions
function initializeDashboard() {
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'r':
                    e.preventDefault();
                    refreshDashboard();
                    break;
                case 'f':
                    e.preventDefault();
                    focusSearch();
                    break;
            }
        }
        if (e.key === 'Escape') {
            closeSnapshotModal();
        }
    });
    
    // Add search functionality
    addSearchCapability();
    
    // Add tooltip functionality
    addTooltips();
}

function focusSearch() {
    const searchInput = document.querySelector('input[type="search"]');
    if (searchInput) {
        searchInput.focus();
    }
}

function addSearchCapability() {
    // This would add search functionality to filter snapshots/data
    console.log('Search capability initialized');
}

function addTooltips() {
    // This would add helpful tooltips to various elements
    console.log('Tooltips initialized');
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}
`;

    return this.minify ? this.minifyJS(js) : js;
  }

  /**
   * Generate debug-specific JavaScript
   */
  generateDebugScript() {
    if (!this.includeDebug) {
      return '';
    }

    return `
// Debug functionality
window.dashboardDebug = {
    logLevel: 'info',
    
    log: function(message, level = 'info') {
        if (this.shouldLog(level)) {
            console.log(\`[Dashboard] \${level.toUpperCase()}: \${message}\`);
        }
    },
    
    shouldLog: function(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.logLevel];
    },
    
    inspect: function(obj, label = 'Object') {
        this.log(\`\${label}:\`, 'debug');
        console.dir(obj);
    },
    
    performance: {
        marks: {},
        
        start: function(name) {
            window.dashboardDebug.performance.marks[name] = performance.now();
        },
        
        end: function(name) {
            const start = window.dashboardDebug.performance.marks[name];
            if (start) {
                const duration = performance.now() - start;
                window.dashboardDebug.log(\`\${name} took \${duration.toFixed(2)}ms\`, 'debug');
                delete window.dashboardDebug.performance.marks[name];
                return duration;
            }
        }
    },
    
    dumpState: function() {
        const state = {
            snapshots: window.SNAPSHOT_DATA ? Object.keys(window.SNAPSHOT_DATA) : null,
            deviceName: window.DEVICE_NAME,
            modals: document.querySelectorAll('.snapshot-modal').length,
            activeTab: document.querySelector('.tab-button.active')?.textContent
        };
        this.inspect(state, 'Dashboard State');
        return state;
    }
};

// Export debug functions to global scope in debug mode
if (typeof window !== 'undefined') {
    window.debugDashboard = window.dashboardDebug.dumpState;
    window.perfStart = window.dashboardDebug.performance.start;
    window.perfEnd = window.dashboardDebug.performance.end;
}
`;
  }

  /**
   * Generate production-optimized JavaScript
   */
  generateProductionScript() {
    const baseScript = this.generate();
    const debugScript = this.includeDebug ? this.generateDebugScript() : '';
    
    let script = baseScript + debugScript;
    
    if (this.minify) {
      script = this.minifyJS(script);
    }
    
    return script;
  }

  /**
   * Minify JavaScript by removing whitespace and comments
   */
  minifyJS(js) {
    return js
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/;\s*}/g, '}') // Remove semicolon before closing brace
      .replace(/\s*{\s*/g, '{') // Remove spaces around opening brace
      .replace(/}\s*/g, '}') // Remove spaces after closing brace
      .replace(/\s*,\s*/g, ',') // Remove spaces around commas
      .replace(/\s*;\s*/g, ';') // Remove spaces around semicolons
      .trim();
  }

  /**
   * Get script statistics
   */
  getStats() {
    const js = this.generate();
    const debugJs = this.generateDebugScript();
    
    return {
      totalLines: js.split('\n').length,
      totalChars: js.length,
      debugLines: debugJs.split('\n').length,
      minified: this.minify,
      includeDebug: this.includeDebug,
      estimatedGzipSize: Math.round(js.length * 0.4) // Rough estimate
    };
  }

  /**
   * Generate script with custom configuration
   */
  generateCustom(config = {}) {
    const options = {
      includeModals: config.includeModals !== false,
      includeSearch: config.includeSearch !== false,
      includeKeyboards: config.includeKeyboards !== false,
      includeTooltips: config.includeTooltips !== false,
      ...config
    };

    let script = this.generate();

    if (!options.includeModals) {
      // Remove modal-related functions
      script = script.replace(/function\s+.*Modal[\s\S]*?(?=function|\Z)/g, '');
    }

    if (!options.includeSearch) {
      // Remove search-related functions
      script = script.replace(/function\s+.*Search[\s\S]*?(?=function|\Z)/g, '');
    }

    return script;
  }
}