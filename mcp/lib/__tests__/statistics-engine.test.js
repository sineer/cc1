import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsEngine } from '../statistics-engine.js';

describe('StatisticsEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new StatisticsEngine();
  });

  describe('calculateStatistics', () => {
    it('should correctly parse diff results with nested uci_diff structure', () => {
      // This test would have caught the original bug where statistics showed zeros
      const diffResult = {
        uci_diff: {
          packages: {
            dhcp: { 
              status: 'modified',
              sections: { 
                captive: { status: 'added' },
                captive_domain1: { status: 'added' }
              }
            },
            firewall: { 
              status: 'modified',
              sections: { 
                captive_rule10: { status: 'added' },
                captive_rule11: { status: 'removed' },
                captive_rule12: { status: 'modified', options: { proto: { status: 'modified' } } }
              }
            }
          }
        }
      };
      
      const stats = engine.calculateStatistics(diffResult);
      
      // These assertions would have failed with the original bug
      expect(stats.packageStats.modified).toBe(2);
      expect(stats.sectionStats.added).toBe(3);
      expect(stats.sectionStats.removed).toBe(1);
      expect(stats.sectionStats.modified).toBe(1);
      expect(stats.optionStats.modified).toBe(1);
    });

    it('should return zero stats for malformed diff results (old buggy structure)', () => {
      // Test the old structure that was being incorrectly accessed
      const malformedDiffResult = {
        packages: {  // This is the wrong location - should be under uci_diff
          dhcp: { status: 'modified' }
        }
      };
      
      const stats = engine.calculateStatistics(malformedDiffResult);
      
      // Should return zeros when structure is wrong
      expect(stats.packageStats.added).toBe(0);
      expect(stats.packageStats.removed).toBe(0);
      expect(stats.packageStats.modified).toBe(0);
      expect(stats.sectionStats.added).toBe(0);
      expect(stats.sectionStats.removed).toBe(0);
      expect(stats.sectionStats.modified).toBe(0);
    });

    it('should handle null or undefined diff results gracefully', () => {
      expect(engine.calculateStatistics(null).packageStats.added).toBe(0);
      expect(engine.calculateStatistics(undefined).packageStats.added).toBe(0);
      expect(engine.calculateStatistics({}).packageStats.added).toBe(0);
    });

    it('should handle empty uci_diff structure', () => {
      const emptyDiffResult = {
        uci_diff: {
          packages: {}
        }
      };
      
      const stats = engine.calculateStatistics(emptyDiffResult);
      
      expect(stats.packageStats.added).toBe(0);
      expect(stats.packageStats.removed).toBe(0);
      expect(stats.packageStats.modified).toBe(0);
    });

    it('should calculate complex nested statistics correctly', () => {
      const complexDiffResult = {
        uci_diff: {
          packages: {
            dhcp: { status: 'added' },  // Entire package added
            firewall: { status: 'removed' },  // Entire package removed
            network: {
              status: 'modified',
              sections: {
                captive: { 
                  status: 'added',
                  options: {
                    proto: { status: 'added' },
                    ipaddr: { status: 'added' }
                  }
                },
                lan: {
                  status: 'modified',
                  options: {
                    proto: { status: 'modified', from: 'static', to: 'dhcp' },
                    ipaddr: { status: 'removed' },
                    netmask: { status: 'removed' }
                  }
                },
                wan: { status: 'removed' }
              }
            }
          }
        }
      };
      
      const stats = engine.calculateStatistics(complexDiffResult);
      
      expect(stats.packageStats.added).toBe(1);      // dhcp
      expect(stats.packageStats.removed).toBe(1);    // firewall
      expect(stats.packageStats.modified).toBe(1);   // network
      expect(stats.sectionStats.added).toBe(1);      // captive
      expect(stats.sectionStats.removed).toBe(1);    // wan
      expect(stats.sectionStats.modified).toBe(1);   // lan
      expect(stats.optionStats.added).toBe(2);       // captive options
      expect(stats.optionStats.removed).toBe(2);     // lan options
      expect(stats.optionStats.modified).toBe(1);    // lan proto
    });
  });

  describe('aggregateDeviceStatistics', () => {
    it('should handle device names with special characters', () => {
      // This would have caught the device name resolution bug
      const testCases = [
        {
          input: 'Direct IP (192.168.11.2)',
          expected: 'Direct-IP-(192.168.11.2)'
        },
        {
          input: 'QEMU OpenWRT VM',
          expected: 'QEMU-OpenWRT-VM'
        },
        {
          input: 'My Router [Test]',
          expected: 'My-Router-[Test]'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const deviceStats = engine.aggregateDeviceStatistics(input, []);
        
        expect(deviceStats.deviceName).toBe(input);
        expect(deviceStats.normalizedName).toBe(expected);
      });
    });

    it('should aggregate statistics across multiple snapshots', () => {
      const mockSnapshots = [
        {
          statistics: { packageStats: { added: 1, removed: 0, modified: 2 } }
        },
        {
          statistics: { packageStats: { added: 0, removed: 1, modified: 1 } }
        }
      ];

      const deviceStats = engine.aggregateDeviceStatistics('Test Device', mockSnapshots);
      
      expect(deviceStats.totalStats.packageStats.added).toBe(1);
      expect(deviceStats.totalStats.packageStats.removed).toBe(1);
      expect(deviceStats.totalStats.packageStats.modified).toBe(3);
    });

    it('should handle empty snapshots array', () => {
      const deviceStats = engine.aggregateDeviceStatistics('Test Device', []);
      
      expect(deviceStats.totalSnapshots).toBe(0);
      expect(deviceStats.totalStats.packageStats.added).toBe(0);
      expect(deviceStats.totalStats.packageStats.removed).toBe(0);
      expect(deviceStats.totalStats.packageStats.modified).toBe(0);
    });
  });

  describe('calculatePerSnapshotStatistics', () => {
    it('should determine if snapshots have changes correctly', () => {
      const snapshots = [
        {
          id: 'snapshot1',
          statistics: { packageStats: { added: 0, removed: 0, modified: 0 } }
        },
        {
          id: 'snapshot2', 
          statistics: { packageStats: { added: 1, removed: 0, modified: 0 } }
        }
      ];

      const perSnapshotStats = engine.calculatePerSnapshotStatistics(snapshots);
      
      expect(perSnapshotStats.snapshot1.hasChanges).toBe(false);
      expect(perSnapshotStats.snapshot2.hasChanges).toBe(true);
    });

    it('should handle snapshots without statistics', () => {
      const snapshots = [
        { id: 'snapshot1' },  // No statistics property
        { id: 'snapshot2', statistics: null }  // Null statistics
      ];

      const perSnapshotStats = engine.calculatePerSnapshotStatistics(snapshots);
      
      expect(perSnapshotStats.snapshot1.hasChanges).toBe(false);
      expect(perSnapshotStats.snapshot2.hasChanges).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle circular references in diff results', () => {
      const circularDiff = {
        uci_diff: {
          packages: {
            test: { status: 'modified' }
          }
        }
      };
      // Create circular reference
      circularDiff.uci_diff.packages.test.self = circularDiff;

      // Should not throw an error
      expect(() => engine.calculateStatistics(circularDiff)).not.toThrow();
    });

    it('should handle very large diff results', () => {
      const largeDiff = {
        uci_diff: {
          packages: {}
        }
      };

      // Create 1000 packages with sections
      for (let i = 0; i < 1000; i++) {
        largeDiff.uci_diff.packages[`package${i}`] = {
          status: 'modified',
          sections: {
            [`section${i}`]: { status: 'added' }
          }
        };
      }

      const stats = engine.calculateStatistics(largeDiff);
      
      expect(stats.packageStats.modified).toBe(1000);
      expect(stats.sectionStats.added).toBe(1000);
    });

    it('should log warning for unexpected diff structure', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const invalidDiff = {
        unexpected_structure: {}
      };

      engine.calculateStatistics(invalidDiff);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: diffResult is null or not an object')
      );
      
      consoleSpy.mockRestore();
    });
  });
});