/**
 * Stylesheet Generator - Dashboard CSS generation
 * Generates all CSS styles for UCI configuration dashboards
 */

export class StylesheetGenerator {
  constructor(options = {}) {
    this.minify = options.minify || false;
    this.theme = options.theme || 'default';
  }

  /**
   * Generate complete dashboard CSS
   */
  generate() {
    const css = `
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
}
`;

    return this.minify ? this.minifyCSS(css) : css;
  }

  /**
   * Generate theme-specific CSS
   */
  generateTheme(themeName) {
    switch (themeName) {
      case 'dark':
        return this.generateDarkTheme();
      case 'high-contrast':
        return this.generateHighContrastTheme();
      default:
        return this.generate();
    }
  }

  /**
   * Generate dark theme CSS
   */
  generateDarkTheme() {
    const darkOverrides = `
/* Dark theme overrides */
body {
    background-color: #1a1a1a;
    color: #e0e0e0;
}

.dashboard-header,
.device-card,
.timeline-item {
    background: #2d2d2d;
    color: #e0e0e0;
}

.stat,
.device-stat {
    background: #3a3a3a;
}

.btn-primary {
    background: #4a9eff;
}

.btn-primary:hover {
    background: #357abd;
}
`;
    return this.generate() + darkOverrides;
  }

  /**
   * Generate high contrast theme CSS
   */
  generateHighContrastTheme() {
    const highContrastOverrides = `
/* High contrast theme overrides */
.btn-primary {
    background: #000000;
    color: #ffffff;
    border: 2px solid #ffffff;
}

.timeline-marker {
    background: #000000;
    border: 3px solid #ffffff;
}

.stat-badge.added {
    background: #000000;
    color: #00ff00;
}

.stat-badge.removed {
    background: #000000;
    color: #ff0000;
}
`;
    return this.generate() + highContrastOverrides;
  }

  /**
   * Minify CSS by removing whitespace and comments
   */
  minifyCSS(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/;\s*}/g, '}') // Remove semicolon before closing brace
      .replace(/\s*{\s*/g, '{') // Remove spaces around opening brace
      .replace(/}\s*/g, '}') // Remove spaces after closing brace
      .replace(/:\s*/g, ':') // Remove spaces after colons
      .replace(/;\s*/g, ';') // Remove spaces after semicolons
      .trim();
  }

  /**
   * Get stylesheet statistics
   */
  getStats() {
    const css = this.generate();
    return {
      totalLines: css.split('\n').length,
      totalChars: css.length,
      minified: this.minify,
      theme: this.theme,
      estimatedGzipSize: Math.round(css.length * 0.3) // Rough estimate
    };
  }
}