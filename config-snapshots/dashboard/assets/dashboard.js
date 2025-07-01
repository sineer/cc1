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
    // In a real implementation, this would open a diff view
}

function viewSnapshot(snapshotId) {
    alert('Viewing snapshot: ' + snapshotId);
    // In a real implementation, this would show snapshot details
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