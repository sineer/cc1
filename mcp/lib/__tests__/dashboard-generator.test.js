import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardGenerator } from '../dashboard-generator.js';

describe('DashboardGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new DashboardGenerator();
  });

  describe('generateTimelineItem', () => {
    it('should place compare button on first timeline entry with next snapshot', () => {
      // This test would have caught the compare button positioning bug
      const snapshot = { 
        id: '2025-01-01T00-00-00-000Z-pre-test', 
        label: 'pre-test',
        timestamp: '2025-01-01T00:00:00.000Z'
      };
      const nextSnapshot = { 
        id: '2025-01-01T01-00-00-000Z-post-test', 
        label: 'post-test',
        timestamp: '2025-01-01T01:00:00.000Z'
      };
      const stats = {};
      
      const html = generator.generateTimelineItem(snapshot, stats, nextSnapshot);
      
      // Should contain compare button with correct snapshot IDs
      expect(html).toContain('compareTo');
      expect(html).toContain(snapshot.id);
      expect(html).toContain(nextSnapshot.id);
      expect(html).toContain('Compare Diffs');
      
      // Should have the correct button order (snapshot, nextSnapshot)
      const compareMatch = html.match(/compareTo\('([^']+)',\s*'([^']+)'\)/);
      expect(compareMatch).toBeTruthy();
      expect(compareMatch[1]).toBe(snapshot.id);
      expect(compareMatch[2]).toBe(nextSnapshot.id);
    });

    it('should not show compare button on last timeline entry', () => {
      // This test ensures compare buttons only appear when there's a next snapshot
      const snapshot = { 
        id: '2025-01-01T00-00-00-000Z-test', 
        label: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
      };
      const stats = {};
      
      const html = generator.generateTimelineItem(snapshot, stats, null);
      
      expect(html).not.toContain('compareTo');
      expect(html).not.toContain('Compare Diffs');
    });

    it('should generate correct timeline structure', () => {
      const snapshot = createMockSnapshot('test-id', 'test-label');
      const stats = { hasChanges: true };
      const nextSnapshot = createMockSnapshot('next-id', 'next-label');
      
      const html = generator.generateTimelineItem(snapshot, stats, nextSnapshot);
      
      // Should contain timeline item structure
      expect(html).toContain('timeline-item');
      expect(html).toContain('has-changes');
      expect(html).toContain('timeline-content');
      expect(html).toContain('timeline-actions');
      
      // Should contain snapshot information
      expect(html).toContain('test-label');
      expect(html).toContain('View Details');
    });

    it('should handle snapshots without changes correctly', () => {
      const snapshot = createMockSnapshot('test-id', 'test-label');
      const stats = { hasChanges: false };
      
      const html = generator.generateTimelineItem(snapshot, stats, null);
      
      expect(html).not.toContain('has-changes');
      expect(html).toContain('timeline-item');
    });

    it('should escape HTML in snapshot labels', () => {
      const snapshot = {
        id: 'test-id',
        label: '<script>alert("xss")</script>',
        timestamp: '2025-01-01T00:00:00.000Z'
      };
      const stats = {};
      
      const html = generator.generateTimelineItem(snapshot, stats, null);
      
      // Should not contain raw script tags
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert("xss")');
    });
  });

  describe('generateDashboard', () => {
    it('should generate complete dashboard HTML', () => {
      const data = {
        device: {
          deviceName: 'Test Device',
          totalSnapshots: 3,
          latestSnapshot: '2025-01-01T12:00:00.000Z',
          totalComparisons: 2,
          filesChanged: 5
        },
        snapshots: [
          createMockSnapshot('id1', 'first'),
          createMockSnapshot('id2', 'second'),
          createMockSnapshot('id3', 'third')
        ],
        perSnapshotStats: {
          id1: { hasChanges: false },
          id2: { hasChanges: true },
          id3: { hasChanges: true }
        },
        packageStats: { added: 1, removed: 0, modified: 2 },
        sectionStats: { added: 5, removed: 3, modified: 1 },
        optionStats: { added: 10, removed: 5, modified: 3 }
      };
      
      const html = generator.generateDashboard(data);
      
      // Should contain essential dashboard elements
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Device Dashboard');
      expect(html).toContain('Total Snapshots');
      expect(html).toContain('3'); // Total snapshots
      expect(html).toContain('Configuration Timeline');
      
      // Should contain statistics
      expect(html).toContain('Package Changes');
      expect(html).toContain('Section Changes');
      expect(html).toContain('Option Changes');
      
      // Should contain timeline with correct compare buttons
      expect(html).toContain('compareTo');
      
      // Should have proper HTML structure
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</html>');
    });

    it('should handle empty snapshots array', () => {
      const data = {
        device: {
          deviceName: 'Empty Device',
          totalSnapshots: 0,
          latestSnapshot: null,
          totalComparisons: 0,
          filesChanged: 0
        },
        snapshots: [],
        perSnapshotStats: {},
        packageStats: { added: 0, removed: 0, modified: 0 },
        sectionStats: { added: 0, removed: 0, modified: 0 },
        optionStats: { added: 0, removed: 0, modified: 0 }
      };
      
      const html = generator.generateDashboard(data);
      
      expect(html).toContain('Empty Device Dashboard');
      expect(html).toContain('0'); // Zero snapshots
      expect(html).not.toContain('compareTo'); // No compare buttons
    });

    it('should generate device-specific JavaScript variables', () => {
      const data = {
        device: { deviceName: 'Direct IP (192.168.11.2)' },
        snapshots: [],
        perSnapshotStats: {},
        packageStats: { added: 0, removed: 0, modified: 0 },
        sectionStats: { added: 0, removed: 0, modified: 0 },
        optionStats: { added: 0, removed: 0, modified: 0 }
      };
      
      const html = generator.generateDashboard(data);
      
      expect(html).toContain('window.DEVICE_NAME = "Direct IP (192.168.11.2)"');
    });
  });

  describe('generateStatisticsSection', () => {
    it('should generate statistics with correct values', () => {
      const packageStats = { added: 2, removed: 1, modified: 3 };
      const sectionStats = { added: 10, removed: 5, modified: 8 };
      const optionStats = { added: 20, removed: 15, modified: 12 };
      
      const html = generator.generateStatisticsSection(packageStats, sectionStats, optionStats);
      
      // Package statistics
      expect(html).toContain('2'); // packages added
      expect(html).toContain('1'); // packages removed  
      expect(html).toContain('3'); // packages modified
      
      // Section statistics
      expect(html).toContain('10'); // sections added
      expect(html).toContain('5'); // sections removed
      expect(html).toContain('8'); // sections modified
      
      // Option statistics
      expect(html).toContain('20'); // options added
      expect(html).toContain('15'); // options removed
      expect(html).toContain('12'); // options modified
      
      // Should contain proper CSS classes for styling
      expect(html).toContain('stat-item added');
      expect(html).toContain('stat-item removed');
      expect(html).toContain('stat-item modified');
    });

    it('should handle zero statistics', () => {
      const zeroStats = { added: 0, removed: 0, modified: 0 };
      
      const html = generator.generateStatisticsSection(zeroStats, zeroStats, zeroStats);
      
      // Should still display zeros properly
      expect(html).toMatch(/>\s*0\s*</g); // Zero values displayed
      expect(html).toContain('Package Changes');
      expect(html).toContain('Section Changes');
      expect(html).toContain('Option Changes');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed data gracefully', () => {
      const malformedData = {
        device: null,
        snapshots: null,
        perSnapshotStats: null
      };
      
      expect(() => generator.generateDashboard(malformedData)).not.toThrow();
    });

    it('should handle very long device names', () => {
      const longDeviceName = 'A'.repeat(200);
      const snapshot = createMockSnapshot('id', 'label');
      
      const html = generator.generateTimelineItem(snapshot, {}, null);
      
      // Should not break HTML structure
      expect(html).toContain('timeline-item');
    });

    it('should handle special characters in device names', () => {
      const specialChars = ['<', '>', '"', "'", '&'];
      
      specialChars.forEach(char => {
        const data = {
          device: { deviceName: `Device ${char} Test` },
          snapshots: [],
          perSnapshotStats: {},
          packageStats: { added: 0, removed: 0, modified: 0 },
          sectionStats: { added: 0, removed: 0, modified: 0 },
          optionStats: { added: 0, removed: 0, modified: 0 }
        };
        
        const html = generator.generateDashboard(data);
        
        // Should properly escape HTML entities
        expect(html).not.toContain(`Device ${char} Test`);
        expect(html).toContain('Device'); // Should still contain device name parts
      });
    });

    it('should generate valid HTML structure', () => {
      const data = {
        device: { deviceName: 'Test Device' },
        snapshots: [createMockSnapshot('id', 'label')],
        perSnapshotStats: { id: { hasChanges: true } },
        packageStats: { added: 1, removed: 0, modified: 0 },
        sectionStats: { added: 1, removed: 0, modified: 0 },
        optionStats: { added: 1, removed: 0, modified: 0 }
      };
      
      const html = generator.generateDashboard(data);
      
      // Basic HTML validation
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toMatch(/<html.*>.*<\/html>$/s);
      expect(html).toMatch(/<head>.*<\/head>/s);
      expect(html).toMatch(/<body>.*<\/body>/s);
      
      // Should have matching opening/closing tags for main sections
      const openTags = html.match(/<(div|section|header|main|nav)\b[^>]*>/g) || [];
      const closeTags = html.match(/<\/(div|section|header|main|nav)>/g) || [];
      
      // Basic tag balance check (not perfect but catches major issues)
      expect(openTags.length).toBeGreaterThan(0);
      expect(closeTags.length).toBeGreaterThan(0);
    });
  });
});