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
    // Generate diff file name from snapshot IDs
    const deviceName = 'QEMU OpenWRT VM';
    
    // Extract meaningful names from snapshot IDs for filename
    const beforeName = extractLabelFromId(snapshotId1);
    const afterName = extractLabelFromId(snapshotId2);
    
    const diffFileName = `${deviceName}-${beforeName}-${afterName}.html`;
    const diffUrl = `diffs/${encodeURIComponent(diffFileName)}`;
    
    // Try to open the diff file
    const newWindow = window.open(diffUrl, '_blank');
    
    // Fallback if file doesn't exist
    if (!newWindow) {
        alert('Popup blocked. Please allow popups and try again.\nDiff file: ' + diffFileName);
    }
}

function viewSnapshot(snapshotId) {
    // Create a snapshot detail popup
    const deviceName = 'QEMU OpenWRT VM';
    const label = extractLabelFromId(snapshotId);
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 1000; display: flex;
        align-items: center; justify-content: center;
    `;
    
    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: white; padding: 20px; border-radius: 8px;
        max-width: 600px; max-height: 80%; overflow-y: auto;
        position: relative;
    `;
    
    content.innerHTML = `
        <button onclick="this.parentElement.parentElement.remove()" style="
            position: absolute; top: 10px; right: 15px; 
            background: none; border: none; font-size: 20px; cursor: pointer;
        ">×</button>
        <h3>📸 Snapshot Details</h3>
        <p><strong>Device:</strong> ${deviceName}</p>
        <p><strong>Snapshot ID:</strong> ${snapshotId}</p>
        <p><strong>Label:</strong> ${label}</p>
        <p><strong>Timestamp:</strong> ${formatTimestamp(snapshotId)}</p>
        <hr style="margin: 15px 0;">
        <h4>Captured Files:</h4>
        <ul style="margin: 10px 0; padding-left: 20px;">
            <li>UCI Export (uci-export.txt)</li>
            <li>System Configuration (system.conf)</li>
            <li>DHCP Configuration (dhcp.conf)</li>
            <li>Network Configuration (network.conf)</li>
            <li>Firewall Configuration (firewall.conf)</li>
            <li>Dropbear SSH (dropbear.conf)</li>
            <li>UHTTPd Web Server (uhttpd.conf)</li>
            <li>System Information (system-info.json)</li>
            <li>Network Status (network-status.json)</li>
            <li>Service Status (service-status.json)</li>
            <li>+ 10 more configuration files</li>
        </ul>
        <p style="color: #666; font-size: 0.9em; margin-top: 15px;">
            Total: 20 files captured including all UCI configurations and system state
        </p>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Helper functions
function extractLabelFromId(snapshotId) {
    // Extract label from snapshot ID like "2025-07-01T15-44-23-553Z-baseline-cowboy-demo"
    const parts = snapshotId.split('-');
    if (parts.length > 6) {
        return parts.slice(6).join('-');
    }
    return snapshotId.substring(snapshotId.lastIndexOf('-') + 1);
}

function formatTimestamp(snapshotId) {
    // Extract timestamp from snapshot ID
    const match = snapshotId.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
    if (match) {
        const [, date, hour, minute, second] = match;
        return new Date(`${date}T${hour}:${minute}:${second}Z`).toLocaleString();
    }
    return 'Unknown';
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

// Add some interactivity when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('UCI Configuration Dashboard loaded');
    
    // Add click handlers for timeline items
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach(function(item) {
        item.addEventListener('click', function() {
            item.classList.toggle('expanded');
        });
    });
    
    // Add tooltips to device cards
    const deviceCards = document.querySelectorAll('.device-card');
    deviceCards.forEach(function(card) {
        card.title = 'Click to view device details';
    });
    
    // Initialize dashboard
    initializeDashboard();
});

function initializeDashboard() {
    // Set current time in any timestamp displays
    const timestampElements = document.querySelectorAll('.current-time');
    timestampElements.forEach(function(element) {
        element.textContent = new Date().toLocaleString();
    });
    
    // Highlight recent changes
    highlightRecentChanges();
}

function highlightRecentChanges() {
    const timelineItems = document.querySelectorAll('.timeline-item');
    const now = new Date();
    
    timelineItems.forEach(function(item) {
        const timestampElement = item.querySelector('.timestamp');
        if (timestampElement) {
            const timestamp = new Date(timestampElement.textContent);
            const hoursDiff = (now - timestamp) / (1000 * 60 * 60);
            
            if (hoursDiff < 1) {
                item.classList.add('recent');
                item.style.borderLeft = '4px solid #e67e22';
            } else if (hoursDiff < 24) {
                item.style.borderLeft = '4px solid #f39c12';
            }
        }
    });
}