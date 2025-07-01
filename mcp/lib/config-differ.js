/**
 * Intelligent UCI Configuration Diff Engine
 * Parses UCI configs and generates meaningful, structured diffs with visual formatting
 */

import { promises as fs } from 'fs';
import path from 'path';

export class ConfigDiffEngine {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.colorOutput = options.colorOutput !== false;
  }

  /**
   * Generate comprehensive diff between two configuration snapshots
   */
  async generateSnapshotDiff(beforeSnapshotPath, afterSnapshotPath, format = 'text') {
    this.log(`Generating diff between snapshots:`);
    this.log(`  Before: ${beforeSnapshotPath}`);
    this.log(`  After:  ${afterSnapshotPath}`);

    const beforeMetadata = await this.loadMetadata(beforeSnapshotPath);
    const afterMetadata = await this.loadMetadata(afterSnapshotPath);

    const diff = {
      summary: {
        before_snapshot: beforeMetadata.snapshot_id,
        after_snapshot: afterMetadata.snapshot_id,
        before_timestamp: beforeMetadata.timestamp,
        after_timestamp: afterMetadata.timestamp,
        comparison_timestamp: new Date().toISOString()
      },
      changes: {
        added: {},
        removed: {},
        modified: {},
        unchanged: {}
      },
      file_diffs: {},
      statistics: {
        total_changes: 0,
        files_changed: 0,
        sections_added: 0,
        sections_removed: 0,
        options_changed: 0
      }
    };

    try {
      // 1. Compare UCI exports (structured comparison)
      const beforeUci = await this.loadUCIExport(beforeSnapshotPath);
      const afterUci = await this.loadUCIExport(afterSnapshotPath);
      
      const uciDiff = await this.compareUCIConfigs(beforeUci, afterUci);
      diff.uci_diff = uciDiff;

      // 2. Compare individual config files
      const beforeFiles = await this.getConfigFiles(beforeSnapshotPath);
      const afterFiles = await this.getConfigFiles(afterSnapshotPath);
      
      const allFiles = new Set([...beforeFiles, ...afterFiles]);
      
      for (const fileName of allFiles) {
        const beforeContent = beforeFiles.includes(fileName) ? 
          await this.loadConfigFile(beforeSnapshotPath, fileName) : '';
        const afterContent = afterFiles.includes(fileName) ? 
          await this.loadConfigFile(afterSnapshotPath, fileName) : '';
        
        if (beforeContent !== afterContent) {
          diff.file_diffs[fileName] = await this.compareConfigFiles(
            beforeContent, 
            afterContent, 
            fileName
          );
          diff.statistics.files_changed++;
        }
      }

      // 3. Compare system information
      const systemDiff = await this.compareSystemInfo(beforeSnapshotPath, afterSnapshotPath);
      diff.system_changes = systemDiff;

      // 4. Calculate statistics
      this.calculateStatistics(diff);

      // 5. Format output
      if (format === 'html') {
        return this.formatDiffAsHTML(diff);
      } else if (format === 'json') {
        return JSON.stringify(diff, null, 2);
      } else {
        return this.formatDiffAsText(diff);
      }

    } catch (error) {
      throw new Error(`Failed to generate diff: ${error.message}`);
    }
  }

  /**
   * Compare UCI export configurations (structured comparison)
   */
  async compareUCIConfigs(beforeUci, afterUci) {
    const beforeParsed = this.parseUCIExport(beforeUci);
    const afterParsed = this.parseUCIExport(afterUci);

    const diff = {
      packages: {},
      summary: {
        packages_added: [],
        packages_removed: [],
        packages_modified: []
      }
    };

    // Get all package names
    const allPackages = new Set([
      ...Object.keys(beforeParsed),
      ...Object.keys(afterParsed)
    ]);

    for (const packageName of allPackages) {
      const beforePackage = beforeParsed[packageName] || {};
      const afterPackage = afterParsed[packageName] || {};

      if (!beforeParsed[packageName]) {
        diff.summary.packages_added.push(packageName);
        diff.packages[packageName] = {
          status: 'added',
          sections: afterPackage
        };
      } else if (!afterParsed[packageName]) {
        diff.summary.packages_removed.push(packageName);
        diff.packages[packageName] = {
          status: 'removed',
          sections: beforePackage
        };
      } else {
        const packageDiff = this.compareSections(beforePackage, afterPackage);
        if (packageDiff.has_changes) {
          diff.summary.packages_modified.push(packageName);
          diff.packages[packageName] = packageDiff;
        }
      }
    }

    return diff;
  }

  /**
   * Compare sections within a UCI package
   */
  compareSections(beforeSections, afterSections) {
    const diff = {
      status: 'modified',
      has_changes: false,
      sections: {},
      summary: {
        sections_added: [],
        sections_removed: [],
        sections_modified: []
      }
    };

    const allSections = new Set([
      ...Object.keys(beforeSections),
      ...Object.keys(afterSections)
    ]);

    for (const sectionName of allSections) {
      const beforeSection = beforeSections[sectionName];
      const afterSection = afterSections[sectionName];

      if (!beforeSection) {
        diff.summary.sections_added.push(sectionName);
        diff.sections[sectionName] = {
          status: 'added',
          section: afterSection
        };
        diff.has_changes = true;
      } else if (!afterSection) {
        diff.summary.sections_removed.push(sectionName);
        diff.sections[sectionName] = {
          status: 'removed',
          section: beforeSection
        };
        diff.has_changes = true;
      } else {
        const sectionDiff = this.compareSection(beforeSection, afterSection);
        if (sectionDiff.has_changes) {
          diff.summary.sections_modified.push(sectionName);
          diff.sections[sectionName] = sectionDiff;
          diff.has_changes = true;
        }
      }
    }

    return diff;
  }

  /**
   * Compare individual UCI section
   */
  compareSection(beforeSection, afterSection) {
    const diff = {
      status: 'modified',
      has_changes: false,
      options: {},
      summary: {
        options_added: [],
        options_removed: [],
        options_modified: []
      }
    };

    // Compare section type
    if (beforeSection['.type'] !== afterSection['.type']) {
      diff.type_changed = {
        from: beforeSection['.type'],
        to: afterSection['.type']
      };
      diff.has_changes = true;
    }

    // Get all option names
    const allOptions = new Set([
      ...Object.keys(beforeSection),
      ...Object.keys(afterSection)
    ]);

    for (const optionName of allOptions) {
      if (optionName === '.type') continue; // Already handled above

      const beforeValue = beforeSection[optionName];
      const afterValue = afterSection[optionName];

      if (beforeValue === undefined) {
        diff.summary.options_added.push(optionName);
        diff.options[optionName] = {
          status: 'added',
          value: afterValue
        };
        diff.has_changes = true;
      } else if (afterValue === undefined) {
        diff.summary.options_removed.push(optionName);
        diff.options[optionName] = {
          status: 'removed',
          value: beforeValue
        };
        diff.has_changes = true;
      } else if (!this.deepEqual(beforeValue, afterValue)) {
        diff.summary.options_modified.push(optionName);
        diff.options[optionName] = {
          status: 'modified',
          from: beforeValue,
          to: afterValue
        };
        diff.has_changes = true;
      }
    }

    return diff;
  }

  /**
   * Compare individual configuration files (line-by-line)
   */
  async compareConfigFiles(beforeContent, afterContent, fileName) {
    const beforeLines = beforeContent.split('\n');
    const afterLines = afterContent.split('\n');

    const diff = {
      file_name: fileName,
      before_lines: beforeLines.length,
      after_lines: afterLines.length,
      changes: [],
      summary: {
        lines_added: 0,
        lines_removed: 0,
        lines_modified: 0
      }
    };

    // Simple line-by-line comparison (could be enhanced with LCS algorithm)
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const beforeLine = beforeLines[i];
      const afterLine = afterLines[i];

      if (beforeLine === undefined) {
        diff.changes.push({
          type: 'added',
          line_number: i + 1,
          content: afterLine
        });
        diff.summary.lines_added++;
      } else if (afterLine === undefined) {
        diff.changes.push({
          type: 'removed',
          line_number: i + 1,
          content: beforeLine
        });
        diff.summary.lines_removed++;
      } else if (beforeLine !== afterLine) {
        diff.changes.push({
          type: 'modified',
          line_number: i + 1,
          before: beforeLine,
          after: afterLine
        });
        diff.summary.lines_modified++;
      }
    }

    return diff;
  }

  /**
   * Compare system information between snapshots
   */
  async compareSystemInfo(beforeSnapshotPath, afterSnapshotPath) {
    try {
      const beforeInfo = await this.loadSystemInfo(beforeSnapshotPath);
      const afterInfo = await this.loadSystemInfo(afterSnapshotPath);

      const changes = {};

      // Compare key system metrics
      const keyMetrics = ['uptime', 'memory_usage', 'disk_usage', 'load_average'];
      
      for (const metric of keyMetrics) {
        if (beforeInfo[metric] && afterInfo[metric]) {
          if (beforeInfo[metric].output !== afterInfo[metric].output) {
            changes[metric] = {
              before: beforeInfo[metric].output,
              after: afterInfo[metric].output
            };
          }
        }
      }

      return changes;
    } catch (error) {
      this.log(`Could not compare system info: ${error.message}`);
      return {};
    }
  }

  /**
   * Parse UCI export into structured format
   */
  parseUCIExport(uciContent) {
    const packages = {};
    const lines = uciContent.split('\n');

    let currentPackage = null;
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Package declaration: package network
      if (trimmed.startsWith('package ')) {
        currentPackage = trimmed.substring(8);
        packages[currentPackage] = {};
        continue;
      }

      if (!currentPackage) continue;

      // Section declaration: config interface 'lan'
      if (trimmed.startsWith('config ')) {
        const match = trimmed.match(/^config\s+(\w+)(?:\s+'([^']+)')?/);
        if (match) {
          const sectionType = match[1];
          const sectionName = match[2] || `@${sectionType}[${Object.keys(packages[currentPackage]).length}]`;
          
          currentSection = sectionName;
          packages[currentPackage][currentSection] = {
            '.type': sectionType
          };
        }
        continue;
      }

      // Option: option proto 'static'
      if (trimmed.startsWith('option ') && currentSection) {
        const match = trimmed.match(/^option\s+(\w+)\s+'([^']*)'$/);
        if (match) {
          const optionName = match[1];
          const optionValue = match[2];
          packages[currentPackage][currentSection][optionName] = optionValue;
        }
        continue;
      }

      // List option: list dns '8.8.8.8'
      if (trimmed.startsWith('list ') && currentSection) {
        const match = trimmed.match(/^list\s+(\w+)\s+'([^']*)'$/);
        if (match) {
          const listName = match[1];
          const listValue = match[2];
          
          if (!packages[currentPackage][currentSection][listName]) {
            packages[currentPackage][currentSection][listName] = [];
          }
          packages[currentPackage][currentSection][listName].push(listValue);
        }
      }
    }

    return packages;
  }

  /**
   * Format diff as human-readable text
   */
  formatDiffAsText(diff) {
    const lines = [];
    
    lines.push('🔍 Configuration Diff Report');
    lines.push('=' .repeat(50));
    lines.push('');
    
    // Summary
    lines.push(`Before: ${diff.summary.before_snapshot}`);
    lines.push(`After:  ${diff.summary.after_snapshot}`);
    lines.push(`Time:   ${diff.summary.before_timestamp} → ${diff.summary.after_timestamp}`);
    lines.push('');
    
    // Statistics
    lines.push('📊 Change Statistics:');
    lines.push(`  Files changed: ${diff.statistics.files_changed}`);
    lines.push(`  Total changes: ${diff.statistics.total_changes}`);
    lines.push('');

    // UCI Changes
    if (diff.uci_diff && Object.keys(diff.uci_diff.packages).length > 0) {
      lines.push('📝 UCI Configuration Changes:');
      lines.push('');

      for (const [packageName, packageDiff] of Object.entries(diff.uci_diff.packages)) {
        lines.push(`Package: ${packageName} [${packageDiff.status}]`);
        
        if (packageDiff.status === 'modified') {
          for (const [sectionName, sectionDiff] of Object.entries(packageDiff.sections)) {
            lines.push(`  Section: ${sectionName} [${sectionDiff.status}]`);
            
            if (sectionDiff.status === 'modified') {
              for (const [optionName, optionDiff] of Object.entries(sectionDiff.options)) {
                if (optionDiff.status === 'added') {
                  lines.push(`    + ${optionName}: ${this.formatValue(optionDiff.value)}`);
                } else if (optionDiff.status === 'removed') {
                  lines.push(`    - ${optionName}: ${this.formatValue(optionDiff.value)}`);
                } else if (optionDiff.status === 'modified') {
                  lines.push(`    ~ ${optionName}: ${this.formatValue(optionDiff.from)} → ${this.formatValue(optionDiff.to)}`);
                }
              }
            }
          }
        }
        lines.push('');
      }
    }

    // File diffs
    if (Object.keys(diff.file_diffs).length > 0) {
      lines.push('📄 File Changes:');
      lines.push('');

      for (const [fileName, fileDiff] of Object.entries(diff.file_diffs)) {
        lines.push(`File: ${fileName}`);
        lines.push(`  Lines: ${fileDiff.before_lines} → ${fileDiff.after_lines}`);
        lines.push(`  Changes: +${fileDiff.summary.lines_added} -${fileDiff.summary.lines_removed} ~${fileDiff.summary.lines_modified}`);
        lines.push('');
      }
    }

    // System changes
    if (diff.system_changes && Object.keys(diff.system_changes).length > 0) {
      lines.push('⚙️  System Changes:');
      for (const [metric, change] of Object.entries(diff.system_changes)) {
        lines.push(`  ${metric}: changed`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format diff as HTML (basic implementation)
   */
  formatDiffAsHTML(diff) {
    // This would generate a full HTML page with styling
    // For now, return a basic HTML structure
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Configuration Diff Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .added { color: green; }
        .removed { color: red; }
        .modified { color: orange; }
        .section { margin: 10px 0; padding: 10px; border-left: 3px solid #ccc; }
    </style>
</head>
<body>
    <h1>🔍 Configuration Diff Report</h1>
    <div class="summary">
        <p><strong>Before:</strong> ${diff.summary.before_snapshot}</p>
        <p><strong>After:</strong> ${diff.summary.after_snapshot}</p>
        <p><strong>Files changed:</strong> ${diff.statistics.files_changed}</p>
    </div>
    <!-- Full HTML diff would be implemented here -->
    <pre>${this.formatDiffAsText(diff)}</pre>
</body>
</html>`;
  }

  /**
   * Helper methods
   */
  async loadMetadata(snapshotPath) {
    const metadataPath = path.join(snapshotPath, 'metadata.json');
    const content = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(content);
  }

  async loadUCIExport(snapshotPath) {
    const uciPath = path.join(snapshotPath, 'uci-export.txt');
    try {
      return await fs.readFile(uciPath, 'utf8');
    } catch (error) {
      return '';
    }
  }

  async getConfigFiles(snapshotPath) {
    try {
      const files = await fs.readdir(snapshotPath);
      return files.filter(f => f.endsWith('.conf')).map(f => f.replace('.conf', ''));
    } catch (error) {
      return [];
    }
  }

  async loadConfigFile(snapshotPath, fileName) {
    const filePath = path.join(snapshotPath, `${fileName}.conf`);
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      return '';
    }
  }

  async loadSystemInfo(snapshotPath) {
    const systemInfoPath = path.join(snapshotPath, 'system-info.json');
    try {
      const content = await fs.readFile(systemInfoPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return {};
    }
  }

  formatValue(value) {
    if (Array.isArray(value)) {
      return `[${value.join(', ')}]`;
    }
    return String(value);
  }

  deepEqual(a, b) {
    // Handle UCI list comparison intelligently
    // Lists can be stored as arrays ['item1', 'item2'] or strings 'item1 item2'
    const normalizeUCIValue = (value) => {
      if (Array.isArray(value)) {
        // Convert array to space-separated string
        return value.join(' ');
      } else if (typeof value === 'string') {
        // Keep string as-is
        return value;
      }
      return value;
    };

    const normalizedA = normalizeUCIValue(a);
    const normalizedB = normalizeUCIValue(b);
    
    // If both are now strings, compare them
    if (typeof normalizedA === 'string' && typeof normalizedB === 'string') {
      return normalizedA === normalizedB;
    }
    
    // Fallback to JSON comparison for complex objects
    return JSON.stringify(a) === JSON.stringify(b);
  }

  calculateStatistics(diff) {
    let totalChanges = 0;
    
    if (diff.uci_diff) {
      for (const packageDiff of Object.values(diff.uci_diff.packages)) {
        if (packageDiff.status === 'added' || packageDiff.status === 'removed') {
          totalChanges++;
        } else if (packageDiff.status === 'modified') {
          for (const sectionDiff of Object.values(packageDiff.sections)) {
            if (sectionDiff.status === 'added' || sectionDiff.status === 'removed') {
              totalChanges++;
            } else if (sectionDiff.status === 'modified') {
              totalChanges += Object.keys(sectionDiff.options).length;
            }
          }
        }
      }
    }
    
    diff.statistics.total_changes = totalChanges;
  }

  log(message) {
    if (this.debug) {
      console.error(`[ConfigDiff] ${message}`);
    }
  }
}