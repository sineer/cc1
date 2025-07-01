
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
    const fileName = `${deviceName}-${snapshotId2.replace(/2025-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '')}-${snapshotId1.replace(/2025-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '')}.html`;
    const diffUrl = `diffs/${fileName}`;
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
    
    modalTitle.textContent = `Snapshot: ${snapshotId}`;
    modalContent.innerHTML = '<div class="loading">Loading snapshot details...</div>';
    
    modal.style.display = 'block';
    
    // Load snapshot data
    loadSnapshotData(snapshotId);
}

function createSnapshotModal() {
    const modal = document.createElement('div');
    modal.id = 'snapshotModal';
    modal.className = 'snapshot-modal';
    
    modal.innerHTML = `
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
    `;
    
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
        
        container.innerHTML = `
            <div class="tab-content">
                <h3>📊 Snapshot Overview</h3>
                <div class="overview-grid">
                    <div class="overview-item">
                        <strong>Snapshot ID:</strong>
                        <span>${snapshotId}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Captured:</strong>
                        <span>${metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'Unknown'}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Files Count:</strong>
                        <span>${metadata.file_count || 'Unknown'}</span>
                    </div>
                    <div class="overview-item">
                        <strong>Total Size:</strong>
                        <span>${metadata.total_size ? (metadata.total_size / 1024).toFixed(1) + ' KB' : 'Unknown'}</span>
                    </div>
                </div>
                
                <h4>📁 Captured Files</h4>
                <div class="file-list">
                    ${metadata.files ? metadata.files.map(file => `
                        <div class="file-item">
                            <span class="file-name">${file.name}</span>
                            <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                    `).join('') : '<p>File information not available</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Error Loading Overview</h3>
                    <p>Could not load snapshot overview: ${error.message}</p>
                </div>
            </div>
        `;
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
        
        container.innerHTML = `
            <div class="tab-content">
                <h3>🖥 System Information</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Basic Information</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Hostname:</strong>
                                <span>${systemInfo.hostname || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Uptime:</strong>
                                <span>${systemInfo.uptime || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Date:</strong>
                                <span>${systemInfo.date || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Hardware & OS</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Kernel:</strong>
                                <span>${systemInfo.uname || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>OpenWRT Release:</strong>
                                <span>${systemInfo.openwrt_release || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Memory & Storage</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Memory Usage:</strong>
                                <span>${systemInfo.memory_usage || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Disk Usage:</strong>
                                <span>${systemInfo.disk_usage || 'Unknown'}</span>
                            </div>
                            <div class="info-item">
                                <strong>Load Average:</strong>
                                <span>${systemInfo.load_average || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ System Information Not Available</h3>
                    <p>System information not available for this snapshot: ${error.message}</p>
                </div>
            </div>
        `;
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
        
        container.innerHTML = `
            <div class="tab-content">
                <h3>🌐 Network Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Interface Information</h4>
                        <div class="network-info">
                            <strong>IP Addresses:</strong>
                            <pre>${networkInfo.ip_addresses || 'Not available'}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Routing Table:</strong>
                            <pre>${networkInfo.routes || 'Not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Network Statistics</h4>
                        <div class="network-info">
                            <strong>Interface Statistics:</strong>
                            <pre>${networkInfo.interface_stats || 'Not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Connectivity</h4>
                        <div class="network-info">
                            <strong>DNS Resolution:</strong>
                            <pre>${networkInfo.dns_test || 'Not available'}</pre>
                        </div>
                        <div class="network-info">
                            <strong>Gateway Ping:</strong>
                            <pre>${networkInfo.gateway_ping || 'Not available'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Network Information Not Available</h3>
                    <p>Network information not available for this snapshot: ${error.message}</p>
                </div>
            </div>
        `;
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
        
        container.innerHTML = `
            <div class="tab-content">
                <h3>⚙ Services Status</h3>
                <div class="info-sections">
                    <div class="info-section">
                        <h4>Running Processes</h4>
                        <div class="service-info">
                            <pre>${serviceInfo.processes || 'Process information not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>Service Configuration</h4>
                        <div class="service-info">
                            <pre>${serviceInfo.enabled_services || 'Service configuration not available'}</pre>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h4>System Logs</h4>
                        <div class="service-info">
                            <strong>Recent Log Entries:</strong>
                            <pre>${serviceInfo.recent_logs || 'Log information not available'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Service Information Not Available</h3>
                    <p>Service information not available for this snapshot: ${error.message}</p>
                </div>
            </div>
        `;
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
        
        const fileButtons = availableFiles.map(file => `
            <button class="config-file-btn" onclick="loadConfigFile('${snapshotId}', '${file}')">
                ${file}
            </button>
        `).join('');
        
        container.innerHTML = `
            <div class="tab-content">
                <h3>📝 Configuration Files</h3>
                <div class="config-section">
                    <h4>Available Configuration Files (${availableFiles.length})</h4>
                    <div class="config-files-grid">
                        ${fileButtons || '<p>No configuration files available for this snapshot</p>'}
                    </div>
                </div>
                <div id="configFileContent" class="config-file-content">
                    <p>Select a configuration file to view its contents.</p>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `
            <div class="tab-content">
                <div class="error-message">
                    <h3>⚠ Configuration Not Available</h3>
                    <p>Configuration files not available for this snapshot: ${error.message}</p>
                </div>
            </div>
        `;
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
            throw new Error(`File not found: ${fileName}`);
        }
        
        contentDiv.innerHTML = `
            <h4>📄 ${fileName}</h4>
            <div class="config-file-viewer">
                <pre><code>${escapeHtml(content)}</code></pre>
            </div>
        `;
        
        // Highlight active file button
        document.querySelectorAll('.config-file-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
    } catch (error) {
        contentDiv.innerHTML = `
            <div class="error-message">
                <p>Error loading ${fileName}: ${error.message}</p>
            </div>
        `;
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