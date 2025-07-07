import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigDiffEngine } from '../config-differ.js';

describe('ConfigDiffEngine', () => {
  let diffEngine;

  beforeEach(() => {
    diffEngine = new ConfigDiffEngine();
  });

  describe('calculateStatistics', () => {
    it('should correctly track sections added, removed, and modified', () => {
      // This test would have caught the missing sections tracking bug
      const diff = {
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
                captive_rule12: { 
                  status: 'modified',
                  options: {
                    proto: { status: 'modified', from: 'tcp', to: 'udp' },
                    port: { status: 'added', value: '8080' }
                  }
                }
              }
            }
          }
        }
      };

      diffEngine.calculateStatistics(diff);

      // These assertions would have failed before the fix
      expect(diff.statistics.total_changes).toBe(5); // 3 sections + 2 options
      expect(diff.statistics.sections_added).toBe(3); // captive, captive_domain1, captive_rule10
      expect(diff.statistics.sections_removed).toBe(1); // captive_rule11
      expect(diff.statistics.options_changed).toBe(2); // proto modified + port added
    });

    it('should handle package-level changes correctly', () => {
      const diff = {
        uci_diff: {
          packages: {
            dhcp: { status: 'added' },
            firewall: { status: 'removed' },
            network: { status: 'modified', sections: {} }
          }
        }
      };

      diffEngine.calculateStatistics(diff);

      expect(diff.statistics.total_changes).toBe(3); // 3 packages changed
      expect(diff.statistics.sections_added).toBe(0);
      expect(diff.statistics.sections_removed).toBe(0);
      expect(diff.statistics.options_changed).toBe(0);
    });

    it('should handle complex nested option changes', () => {
      const diff = {
        uci_diff: {
          packages: {
            network: {
              status: 'modified',
              sections: {
                lan: {
                  status: 'modified',
                  options: {
                    proto: { status: 'modified', from: 'static', to: 'dhcp' },
                    ipaddr: { status: 'removed', value: '192.168.1.1' },
                    netmask: { status: 'removed', value: '255.255.255.0' },
                    dns: { status: 'added', value: '8.8.8.8' }
                  }
                },
                wan: {
                  status: 'modified',
                  options: {
                    proto: { status: 'modified', from: 'dhcp', to: 'static' }
                  }
                }
              }
            }
          }
        }
      };

      diffEngine.calculateStatistics(diff);

      expect(diff.statistics.total_changes).toBe(5); // 1 modified + 4 options
      expect(diff.statistics.sections_added).toBe(0);
      expect(diff.statistics.sections_removed).toBe(0);
      expect(diff.statistics.options_changed).toBe(5); // 2 modified + 2 removed + 1 added
    });

    it('should handle empty diff results', () => {
      const diff = {
        uci_diff: {
          packages: {}
        }
      };

      diffEngine.calculateStatistics(diff);

      expect(diff.statistics.total_changes).toBe(0);
      expect(diff.statistics.sections_added).toBe(0);
      expect(diff.statistics.sections_removed).toBe(0);
      expect(diff.statistics.options_changed).toBe(0);
    });

    it('should handle malformed diff structures gracefully', () => {
      const malformedDiffs = [
        { uci_diff: null },
        { uci_diff: { packages: null } },
        {},
        null,
        undefined
      ];

      malformedDiffs.forEach(diff => {
        expect(() => diffEngine.calculateStatistics(diff)).not.toThrow();
        
        if (diff && diff.statistics) {
          expect(diff.statistics.total_changes).toBe(0);
        }
      });
    });
  });

  describe('generateSnapshotDiff', () => {
    it('should generate diff in multiple formats', () => {
      const mockSnapshot1 = '/path/to/snapshot1';
      const mockSnapshot2 = '/path/to/snapshot2';

      // Mock file reading
      vi.doMock('fs/promises', () => ({
        readFile: vi.fn()
          .mockResolvedValueOnce('config dhcp\noption domain "test1"')
          .mockResolvedValueOnce('config dhcp\noption domain "test2"')
      }));

      const formats = ['text', 'html', 'json', 'structured'];

      formats.forEach(async (format) => {
        const result = await diffEngine.generateSnapshotDiff(
          mockSnapshot1,
          mockSnapshot2,
          format
        );

        switch (format) {
          case 'json':
            expect(() => JSON.parse(result)).not.toThrow();
            break;
          case 'html':
            expect(result).toContain('<');
            expect(result).toContain('<!DOCTYPE html>');
            break;
          case 'structured':
            expect(typeof result).toBe('object');
            break;
          case 'text':
          default:
            expect(typeof result).toBe('string');
            break;
        }
      });
    });

    it('should handle non-existent snapshot files', async () => {
      vi.doMock('fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('File not found'))
      }));

      await expect(
        diffEngine.generateSnapshotDiff('/nonexistent1', '/nonexistent2', 'json')
      ).rejects.toThrow();
    });
  });

  describe('formatDiffAsHTML', () => {
    it('should generate valid HTML with proper structure', () => {
      const diff = {
        uci_diff: {
          packages: {
            dhcp: {
              status: 'modified',
              sections: {
                captive: { status: 'added' }
              }
            }
          }
        },
        statistics: {
          total_changes: 1,
          sections_added: 1,
          sections_removed: 0,
          options_changed: 0
        }
      };

      const html = diffEngine.formatDiffAsHTML(diff);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      
      // Should contain statistics
      expect(html).toContain('Total Changes: 1');
      expect(html).toContain('Sections Added: 1');
      
      // Should contain package information
      expect(html).toContain('dhcp');
      expect(html).toContain('captive');
    });

    it('should properly escape HTML entities', () => {
      const diff = {
        uci_diff: {
          packages: {
            'package<script>': {
              status: 'modified',
              sections: {
                'section&test': { status: 'added' }
              }
            }
          }
        },
        statistics: { total_changes: 1 }
      };

      const html = diffEngine.formatDiffAsHTML(diff);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('&test');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;test');
    });

    it('should handle large diffs efficiently', () => {
      // Create a large diff with many packages and sections
      const largeDiff = {
        uci_diff: {
          packages: {}
        },
        statistics: { total_changes: 10000 }
      };

      for (let i = 0; i < 1000; i++) {
        largeDiff.uci_diff.packages[`package${i}`] = {
          status: 'modified',
          sections: {
            [`section${i}`]: { status: 'added' }
          }
        };
      }

      const startTime = Date.now();
      const html = diffEngine.formatDiffAsHTML(largeDiff);
      const endTime = Date.now();

      expect(html).toContain('<!DOCTYPE html>');
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('formatDiffAsText', () => {
    it('should generate readable text output', () => {
      const diff = {
        uci_diff: {
          packages: {
            dhcp: {
              status: 'modified',
              sections: {
                captive: { status: 'added' },
                old_section: { status: 'removed' }
              }
            }
          }
        },
        statistics: {
          total_changes: 2,
          sections_added: 1,
          sections_removed: 1
        }
      };

      const text = diffEngine.formatDiffAsText(diff);

      expect(text).toContain('dhcp');
      expect(text).toContain('captive');
      expect(text).toContain('old_section');
      expect(text).toContain('added');
      expect(text).toContain('removed');
      expect(text).toContain('Total Changes: 2');
    });

    it('should handle empty diffs', () => {
      const emptyDiff = {
        uci_diff: { packages: {} },
        statistics: { total_changes: 0 }
      };

      const text = diffEngine.formatDiffAsText(emptyDiff);

      expect(text).toContain('No changes detected');
      expect(text).toContain('Total Changes: 0');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle circular references in diff data', () => {
      const circularDiff = {
        uci_diff: {
          packages: {
            test: { status: 'modified' }
          }
        }
      };
      
      // Create circular reference
      circularDiff.uci_diff.packages.test.circular = circularDiff;

      expect(() => diffEngine.calculateStatistics(circularDiff)).not.toThrow();
    });

    it('should handle very deep nesting', () => {
      const deepDiff = {
        uci_diff: {
          packages: {
            test: {
              status: 'modified',
              sections: {
                section1: {
                  status: 'modified',
                  options: {
                    option1: {
                      status: 'modified',
                      nested: {
                        deep: {
                          value: 'test'
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      expect(() => diffEngine.calculateStatistics(deepDiff)).not.toThrow();
    });

    it('should handle special characters in package names', () => {
      const specialCharDiff = {
        uci_diff: {
          packages: {
            'package-with-dashes': { status: 'added' },
            'package_with_underscores': { status: 'removed' },
            'package.with.dots': { status: 'modified', sections: {} },
            'package with spaces': { status: 'modified', sections: {} }
          }
        }
      };

      diffEngine.calculateStatistics(specialCharDiff);

      expect(specialCharDiff.statistics.total_changes).toBe(4);
    });

    it('should validate diff format consistency', () => {
      const inconsistentDiff = {
        uci_diff: {
          packages: {
            valid_package: {
              status: 'modified',
              sections: {
                valid_section: { status: 'added' }
              }
            },
            invalid_package: {
              // Missing status field
              sections: {
                section: { status: 'added' }
              }
            }
          }
        }
      };

      // Should handle inconsistent data gracefully
      expect(() => diffEngine.calculateStatistics(inconsistentDiff)).not.toThrow();
    });

    it('should log warnings for unexpected data structures', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const unexpectedDiff = {
        unexpected_format: {}
      };

      diffEngine.calculateStatistics(unexpectedDiff);
      
      // Should warn about unexpected structure but not throw
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});