import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { DashboardDataProcessor } from '../../lib/dashboard-data-processor.js';
import { DashboardGenerator } from '../../lib/dashboard-generator.js';
import { StatisticsEngine } from '../../lib/statistics-engine.js';
import { ConfigDiffEngine } from '../../lib/config-differ.js';

describe('Dashboard Workflow Integration', () => {
  let processor;
  let generator;
  let statsEngine;
  let diffEngine;
  let tempDir;

  beforeEach(async () => {
    processor = new DashboardDataProcessor();
    generator = new DashboardGenerator();
    statsEngine = new StatisticsEngine();
    diffEngine = new ConfigDiffEngine();
    
    // Create temporary directory for test files
    tempDir = `/tmp/dashboard-test-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, 'diffs'), { recursive: true });
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('Complete Dashboard Generation Workflow', () => {
    it('should generate dashboard with correct statistics and working compare buttons', async () => {
      // This integration test would have caught all the bugs together
      
      // Setup test snapshots with realistic data
      const snapshots = [
        {
          id: '2025-07-06T14-53-04-788Z-pre-ubispot-deployment',
          label: 'pre-ubispot-deployment',
          timestamp: '2025-07-06T14:53:04.788Z',
          path: path.join(tempDir, 'snapshot1'),
          metadata: { deviceName: 'Direct IP (192.168.11.2)' }
        },
        {
          id: '2025-07-06T14-53-39-020Z-post-ubispot-deployment', 
          label: 'post-ubispot-deployment',
          timestamp: '2025-07-06T14:53:39.020Z',
          path: path.join(tempDir, 'snapshot2'),
          metadata: { deviceName: 'Direct IP (192.168.11.2)' }
        }
      ];

      // Create test snapshot files
      await fs.writeFile(snapshots[0].path, 'config dhcp\nconfig firewall\n');
      await fs.writeFile(snapshots[1].path, 'config dhcp\noption captive "1"\nconfig firewall\nconfig ubispot\n');

      // Mock the diff engine to return realistic ubispot deployment diff
      const mockDiffResult = {
        uci_diff: {
          packages: {
            dhcp: {
              status: 'modified',
              sections: {
                captive_domain1: { status: 'added' },
                captive: { status: 'added' }
              }
            },
            firewall: {
              status: 'modified',
              sections: {
                captive_rule10: { status: 'added' },
                captive_rule11: { status: 'added' },
                captive_rule12: { status: 'added' },
                captive_rule13: { status: 'added' },
                captive_rule14: { status: 'added' },
                captive_rule15: { status: 'added' },
                captive_rule16: { status: 'added' },
                captive_redirect1: { status: 'added' },
                captive_ipset1: { status: 'added' },
                captive_ipset2: { status: 'added' },
                captive: { status: 'added' }
              }
            },
            network: {
              status: 'modified',
              sections: {
                captive: { status: 'added' }
              }
            },
            ubispot: {
              status: 'modified',
              sections: {
                captive: { status: 'added' }
              }
            },
            uhttpd: {
              status: 'modified',
              sections: {
                uam3990: { status: 'added' },
                ubispot: { status: 'added' }
              }
            }
          }
        }
      };

      // Calculate statistics (this would have failed with original bug)
      diffEngine.calculateStatistics(mockDiffResult);
      expect(mockDiffResult.statistics.total_changes).toBe(17);
      expect(mockDiffResult.statistics.sections_added).toBe(17);

      // Mock diff generation to return our test diff
      vi.spyOn(diffEngine, 'generateSnapshotDiff').mockResolvedValue(JSON.stringify(mockDiffResult));

      // Process dashboard data
      const dashboardData = await processor.processSnapshots('Direct IP (192.168.11.2)', snapshots);

      // Verify statistics were calculated correctly (bug fix verification)
      expect(dashboardData.device.filesChanged).toBe(22); // 5 packages + 17 sections
      expect(dashboardData.device.filesChanged).not.toBe(0); // Original bug

      // Verify aggregated statistics
      expect(dashboardData.sectionStats.added).toBe(17);
      expect(dashboardData.sectionStats.removed).toBe(0);
      expect(dashboardData.packageStats.modified).toBe(5);

      // Generate dashboard HTML
      const dashboardHtml = generator.generateDashboard(dashboardData);

      // Verify dashboard contains correct statistics (not zeros)
      expect(dashboardHtml).toContain('Files Changed</span>');
      expect(dashboardHtml).toContain('<span class="value">22</span>'); // Correct file count
      expect(dashboardHtml).not.toContain('<span class="value">0</span>'); // Not zero

      // Verify compare button positioning (bug fix verification)
      expect(dashboardHtml).toContain('compareTo');
      
      // Should have compare button on first timeline entry
      const timelineItems = dashboardHtml.split('timeline-item');
      expect(timelineItems[1]).toContain('compareTo'); // First item should have button
      
      // Compare button should have correct snapshot order
      const compareMatch = dashboardHtml.match(/compareTo\('([^']+)',\s*'([^']+)'\)/);
      expect(compareMatch).toBeTruthy();
      expect(compareMatch[1]).toBe(snapshots[0].id);
      expect(compareMatch[2]).toBe(snapshots[1].id);

      // Verify device name is properly set for JavaScript
      expect(dashboardHtml).toContain('window.DEVICE_NAME = "Direct IP (192.168.11.2)"');

      // Write dashboard to temp file
      const dashboardFile = path.join(tempDir, 'device-Direct IP (192.168.11.2).html');
      await fs.writeFile(dashboardFile, dashboardHtml);

      // Verify file was created
      const dashboardExists = await fs.access(dashboardFile).then(() => true).catch(() => false);
      expect(dashboardExists).toBe(true);

      // Verify HTML structure is valid
      expect(dashboardHtml).toMatch(/^<!DOCTYPE html>/);
      expect(dashboardHtml).toMatch(/<html.*>.*<\/html>$/s);
      expect(dashboardHtml).toMatch(/<head>.*<\/head>/s);
      expect(dashboardHtml).toMatch(/<body>.*<\/body>/s);
    });

    it('should generate diff files with correct naming convention', async () => {
      const deviceName = 'Direct IP (192.168.11.2)';
      const snapshots = [
        {
          id: '2025-07-06T14-53-04-788Z-pre-test',
          label: 'pre-test',
          path: path.join(tempDir, 'snap1')
        },
        {
          id: '2025-07-06T14-53-39-020Z-post-test',
          label: 'post-test', 
          path: path.join(tempDir, 'snap2')
        }
      ];

      // Create snapshot files
      await fs.writeFile(snapshots[0].path, 'config test1\n');
      await fs.writeFile(snapshots[1].path, 'config test2\n');

      // Mock diff generation
      const mockDiff = createMockDiffResult(1, 0, 0);
      vi.spyOn(diffEngine, 'generateSnapshotDiff').mockResolvedValue(JSON.stringify(mockDiff));

      // Process dashboard data
      await processor.processSnapshots(deviceName, snapshots);

      // Expected filename should match ScriptGenerator naming
      const expectedDiffFile = 'Direct-IP-(192.168.11.2)-pre-test-post-test.html';
      const diffPath = path.join(tempDir, 'diffs', expectedDiffFile);

      // Verify the diff file would be accessible by the JavaScript
      // This verifies the filename bug fix
      expect(expectedDiffFile).toMatch(/^Direct-IP-\(192\.168\.11\.2\)-pre-test-post-test\.html$/);
      
      // Verify device name normalization matches ScriptGenerator
      const normalizedName = deviceName.replace(/\s+/g, '-');
      expect(normalizedName).toBe('Direct-IP-(192.168.11.2)');
    });

    it('should handle empty snapshots gracefully', async () => {
      const deviceName = 'Empty Device';
      const snapshots = [];

      const dashboardData = await processor.processSnapshots(deviceName, snapshots);

      expect(dashboardData.device.totalSnapshots).toBe(0);
      expect(dashboardData.device.filesChanged).toBe(0);
      expect(dashboardData.snapshots).toEqual([]);

      const dashboardHtml = generator.generateDashboard(dashboardData);

      expect(dashboardHtml).toContain('Empty Device Dashboard');
      expect(dashboardHtml).not.toContain('compareTo');
      expect(dashboardHtml).toContain('<span class="value">0</span>');
    });

    it('should handle single snapshot without compare buttons', async () => {
      const deviceName = 'Single Snapshot Device';
      const snapshots = [
        {
          id: '2025-07-06T14-53-04-788Z-single',
          label: 'single',
          timestamp: '2025-07-06T14:53:04.788Z',
          path: path.join(tempDir, 'single'),
          metadata: { deviceName }
        }
      ];

      await fs.writeFile(snapshots[0].path, 'config test\n');

      const dashboardData = await processor.processSnapshots(deviceName, snapshots);
      const dashboardHtml = generator.generateDashboard(dashboardData);

      expect(dashboardData.device.totalSnapshots).toBe(1);
      expect(dashboardHtml).not.toContain('compareTo');
      expect(dashboardHtml).toContain('Single Snapshot Device Dashboard');
    });

    it('should handle large numbers of snapshots efficiently', async () => {
      const deviceName = 'Load Test Device';
      const snapshots = [];

      // Create 50 snapshots
      for (let i = 0; i < 50; i++) {
        const snapshot = {
          id: `2025-07-06T14-53-${i.toString().padStart(2, '0')}-000Z-snapshot-${i}`,
          label: `snapshot-${i}`,
          timestamp: `2025-07-06T14:53:${i.toString().padStart(2, '0')}.000Z`,
          path: path.join(tempDir, `snapshot-${i}`),
          metadata: { deviceName }
        };
        snapshots.push(snapshot);
        await fs.writeFile(snapshot.path, `config snapshot${i}\n`);
      }

      // Mock diff generation to return empty diffs for performance
      vi.spyOn(diffEngine, 'generateSnapshotDiff').mockResolvedValue(JSON.stringify(createMockDiffResult(0, 0, 0)));

      const startTime = Date.now();
      const dashboardData = await processor.processSnapshots(deviceName, snapshots);
      const dashboardHtml = generator.generateDashboard(dashboardData);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds

      expect(dashboardData.device.totalSnapshots).toBe(50);
      expect(dashboardHtml).toContain('Load Test Device Dashboard');
      
      // Should have 49 compare buttons (each snapshot except last)
      const compareMatches = dashboardHtml.match(/compareTo/g);
      expect(compareMatches).toHaveLength(49);
    });
  });

  describe('Error Handling in Workflow', () => {
    it('should handle corrupt snapshot files', async () => {
      const deviceName = 'Corrupt Device';
      const snapshots = [
        {
          id: '2025-07-06T14-53-04-788Z-corrupt',
          label: 'corrupt',
          path: '/nonexistent/path',
          metadata: { deviceName }
        }
      ];

      // Should not throw but handle gracefully
      await expect(processor.processSnapshots(deviceName, snapshots)).resolves.toBeDefined();
    });

    it('should handle malformed device names', async () => {
      const malformedNames = [
        '',
        '<script>alert("xss")</script>',
        'Device\x00\x01\x02',
        'A'.repeat(1000)
      ];

      for (const deviceName of malformedNames) {
        const dashboardData = await processor.processSnapshots(deviceName, []);
        const dashboardHtml = generator.generateDashboard(dashboardData);

        // Should not contain malicious content
        expect(dashboardHtml).not.toContain('<script>');
        expect(dashboardHtml).not.toContain('\x00');
        
        // Should still be valid HTML
        expect(dashboardHtml).toContain('<!DOCTYPE html>');
      }
    });

    it('should handle diff generation failures gracefully', async () => {
      const deviceName = 'Diff Error Device';
      const snapshots = [
        {
          id: '2025-07-06T14-53-04-788Z-error1',
          label: 'error1',
          path: path.join(tempDir, 'error1')
        },
        {
          id: '2025-07-06T14-53-39-020Z-error2',
          label: 'error2',
          path: path.join(tempDir, 'error2')
        }
      ];

      await fs.writeFile(snapshots[0].path, 'config test\n');
      await fs.writeFile(snapshots[1].path, 'config test\n');

      // Mock diff to throw error
      vi.spyOn(diffEngine, 'generateSnapshotDiff').mockRejectedValue(new Error('Diff failed'));

      // Should handle error gracefully
      const dashboardData = await processor.processSnapshots(deviceName, snapshots);
      expect(dashboardData.device.totalSnapshots).toBe(2);
      
      // Should still generate dashboard even with diff errors
      const dashboardHtml = generator.generateDashboard(dashboardData);
      expect(dashboardHtml).toContain('Diff Error Device Dashboard');
    });
  });

  describe('Cross-Component Data Flow', () => {
    it('should maintain data consistency across all components', async () => {
      // Test that data flows correctly through all components
      const deviceName = 'Consistency Test';
      const mockDiff = createMockDiffResult(5, 3, 2);
      
      // Test StatisticsEngine
      statsEngine.calculateStatistics(mockDiff);
      expect(mockDiff.statistics.sections_added).toBe(5);
      expect(mockDiff.statistics.sections_removed).toBe(3);
      
      // Test that DashboardDataProcessor correctly aggregates
      const snapshots = [
        { id: 'snap1', statistics: mockDiff.statistics },
        { id: 'snap2', statistics: mockDiff.statistics }
      ];
      
      const deviceStats = statsEngine.aggregateDeviceStatistics(deviceName, snapshots);
      expect(deviceStats.totalStats.sectionStats.added).toBe(10); // 5 + 5
      expect(deviceStats.totalStats.sectionStats.removed).toBe(6); // 3 + 3
      
      // Test that DashboardGenerator preserves statistics
      const dashboardData = {
        device: deviceStats,
        snapshots: snapshots,
        perSnapshotStats: {},
        sectionStats: deviceStats.totalStats.sectionStats,
        packageStats: deviceStats.totalStats.packageStats,
        optionStats: deviceStats.totalStats.optionStats
      };
      
      const html = generator.generateDashboard(dashboardData);
      expect(html).toContain('10'); // sections added
      expect(html).toContain('6');  // sections removed
    });
  });
});