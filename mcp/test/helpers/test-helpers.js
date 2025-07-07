import { vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fixtures } from '../fixtures/fixture-loader.js';

/**
 * Test utilities and helpers for the UCI Config MCP system
 */
export class TestHelpers {
  /**
   * Create a temporary directory for test files
   * @returns {Promise<string>} Path to temporary directory
   */
  static async createTempDir() {
    const tempDir = `/tmp/uci-config-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Clean up temporary directory
   * @param {string} tempDir - Path to temporary directory
   */
  static async cleanupTempDir(tempDir) {
    if (tempDir && tempDir.startsWith('/tmp/')) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Mock child_process.exec with predefined responses
   * @param {Object} responses - Command-response mapping
   * @returns {Function} Mock function
   */
  static mockExec(responses = {}) {
    return vi.fn().mockImplementation((command, options, callback) => {
      // Handle both (cmd, callback) and (cmd, options, callback) signatures
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // Find matching response
      let response = null;
      for (const [cmdPattern, resp] of Object.entries(responses)) {
        if (command.includes(cmdPattern)) {
          response = resp;
          break;
        }
      }

      // Default response if no match found
      if (!response) {
        response = {
          stdout: 'Mock command executed successfully',
          stderr: '',
          error: null
        };
      }

      // Simulate async execution
      setTimeout(() => {
        if (response.error) {
          callback(response.error);
        } else {
          callback(null, {
            stdout: response.stdout || '',
            stderr: response.stderr || ''
          });
        }
      }, response.delay || 10);
    });
  }

  /**
   * Mock child_process.spawn with predefined behavior
   * @param {Object} options - Spawn mock options
   * @returns {Function} Mock function
   */
  static mockSpawn(options = {}) {
    return vi.fn().mockImplementation((command, args, spawnOptions) => {
      const mockProcess = {
        stdout: {
          on: vi.fn(),
          pipe: vi.fn()
        },
        stderr: {
          on: vi.fn(),
          pipe: vi.fn()
        },
        on: vi.fn(),
        kill: vi.fn(),
        pid: Math.floor(Math.random() * 10000)
      };

      // Simulate process events
      setTimeout(() => {
        if (options.stdout) {
          mockProcess.stdout.on.mock.calls
            .filter(call => call[0] === 'data')
            .forEach(call => call[1](Buffer.from(options.stdout)));
        }

        if (options.stderr) {
          mockProcess.stderr.on.mock.calls
            .filter(call => call[0] === 'data')
            .forEach(call => call[1](Buffer.from(options.stderr)));
        }

        const exitCode = options.exitCode || 0;
        mockProcess.on.mock.calls
          .filter(call => call[0] === 'close')
          .forEach(call => call[1](exitCode));
      }, options.delay || 10);

      return mockProcess;
    });
  }

  /**
   * Mock file system operations
   * @param {Object} files - File path to content mapping
   * @returns {Object} Mocked fs functions
   */
  static mockFS(files = {}) {
    const mockReadFile = vi.fn().mockImplementation(async (filePath, encoding) => {
      if (files[filePath]) {
        return encoding === 'utf8' ? files[filePath] : Buffer.from(files[filePath]);
      }
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    });

    const mockWriteFile = vi.fn().mockImplementation(async (filePath, content) => {
      files[filePath] = content;
    });

    const mockAccess = vi.fn().mockImplementation(async (filePath) => {
      if (!files[filePath]) {
        throw new Error(`ENOENT: no such file or directory, access '${filePath}'`);
      }
    });

    const mockMkdir = vi.fn().mockImplementation(async (dirPath, options) => {
      // Simulate successful directory creation
      return dirPath;
    });

    const mockRm = vi.fn().mockImplementation(async (filePath, options) => {
      // Simulate successful removal
      delete files[filePath];
    });

    return {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      access: mockAccess,
      mkdir: mockMkdir,
      rm: mockRm,
      files
    };
  }

  /**
   * Create a mock SSH manager
   * @param {Object} responses - SSH command responses
   * @returns {Object} Mock SSH manager
   */
  static createMockSSHManager(responses = {}) {
    return {
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(true),
      executeCommand: vi.fn().mockImplementation(async (command) => {
        for (const [pattern, response] of Object.entries(responses)) {
          if (command.includes(pattern)) {
            if (response.error) {
              throw new Error(response.error);
            }
            return {
              stdout: response.stdout || '',
              stderr: response.stderr || '',
              exitCode: response.exitCode || 0
            };
          }
        }
        return {
          stdout: 'Mock command executed',
          stderr: '',
          exitCode: 0
        };
      }),
      isConnected: vi.fn().mockReturnValue(true),
      getConnectionInfo: vi.fn().mockReturnValue({
        host: '192.168.1.1',
        username: 'root',
        connected: true
      })
    };
  }

  /**
   * Create a mock statistics engine
   * @returns {Object} Mock statistics engine
   */
  static createMockStatisticsEngine() {
    return {
      calculateStatistics: vi.fn().mockImplementation((diffResult) => {
        // Simulate statistics calculation
        if (diffResult && diffResult.uci_diff && diffResult.uci_diff.packages) {
          let totalChanges = 0;
          let sectionsAdded = 0;
          let sectionsRemoved = 0;
          let sectionsModified = 0;

          Object.values(diffResult.uci_diff.packages).forEach(pkg => {
            if (pkg.sections) {
              Object.values(pkg.sections).forEach(section => {
                totalChanges++;
                switch (section.status) {
                  case 'added': sectionsAdded++; break;
                  case 'removed': sectionsRemoved++; break;
                  case 'modified': sectionsModified++; break;
                }
              });
            }
          });

          diffResult.statistics = {
            total_changes: totalChanges,
            sections_added: sectionsAdded,
            sections_removed: sectionsRemoved,
            sections_modified: sectionsModified,
            options_changed: 0,
            packages_modified: Object.keys(diffResult.uci_diff.packages).length
          };
        }
      }),
      aggregateDeviceStatistics: vi.fn().mockImplementation((deviceName, snapshots) => {
        return {
          deviceName,
          totalSnapshots: snapshots.length,
          totalStats: {
            packageStats: { added: 1, removed: 0, modified: 3 },
            sectionStats: { added: 5, removed: 2, modified: 1 },
            optionStats: { added: 10, removed: 3, modified: 2 }
          }
        };
      })
    };
  }

  /**
   * Create a mock config differ
   * @returns {Object} Mock config differ
   */
  static createMockConfigDiffer() {
    return {
      generateSnapshotDiff: vi.fn().mockImplementation(async (before, after, format = 'json') => {
        const mockDiff = fixtures.createMockDiffResult(2, 1, 1);
        
        switch (format) {
          case 'json':
            return JSON.stringify(mockDiff);
          case 'html':
            return `<!DOCTYPE html><html><body><h1>Mock Diff</h1><p>Changes: ${mockDiff.statistics.total_changes}</p></body></html>`;
          case 'text':
            return `Mock Diff\nTotal Changes: ${mockDiff.statistics.total_changes}`;
          default:
            return mockDiff;
        }
      }),
      formatDiffAsHTML: vi.fn().mockImplementation((diff) => {
        return `<!DOCTYPE html><html><body><h1>Mock HTML Diff</h1><p>Total Changes: ${diff.statistics?.total_changes || 0}</p></body></html>`;
      }),
      formatDiffAsText: vi.fn().mockImplementation((diff) => {
        return `Mock Text Diff\nTotal Changes: ${diff.statistics?.total_changes || 0}`;
      }),
      calculateStatistics: vi.fn().mockImplementation((diff) => {
        // Use the same logic as mock statistics engine
        TestHelpers.createMockStatisticsEngine().calculateStatistics(diff);
      })
    };
  }

  /**
   * Wait for a condition to be true
   * @param {Function} condition - Function that returns boolean
   * @param {number} timeout - Timeout in milliseconds
   * @param {number} interval - Check interval in milliseconds
   * @returns {Promise<void>}
   */
  static async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Validate HTML structure
   * @param {string} html - HTML content to validate
   * @returns {Object} Validation result
   */
  static validateHTML(html) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Basic structure checks
    if (!html.includes('<!DOCTYPE html>')) {
      result.errors.push('Missing DOCTYPE declaration');
      result.valid = false;
    }

    if (!html.includes('<html') || !html.includes('</html>')) {
      result.errors.push('Missing html tags');
      result.valid = false;
    }

    if (!html.includes('<head>') || !html.includes('</head>')) {
      result.errors.push('Missing head tags');
      result.valid = false;
    }

    if (!html.includes('<body>') || !html.includes('</body>')) {
      result.errors.push('Missing body tags');
      result.valid = false;
    }

    // Security checks
    if (html.includes('<script>') && !html.includes('&lt;script&gt;')) {
      result.warnings.push('Unescaped script tags detected');
    }

    // XSS checks
    const xssPatterns = [
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<script[^>]*>/gi
    ];

    xssPatterns.forEach(pattern => {
      if (pattern.test(html)) {
        result.warnings.push(`Potential XSS pattern detected: ${pattern}`);
      }
    });

    return result;
  }

  /**
   * Generate test data for performance testing
   * @param {number} snapshotCount - Number of snapshots to generate
   * @param {number} changesPerSnapshot - Average changes per snapshot
   * @returns {Object} Test data
   */
  static generatePerformanceTestData(snapshotCount = 100, changesPerSnapshot = 10) {
    const snapshots = [];
    const diffs = [];

    for (let i = 0; i < snapshotCount; i++) {
      const snapshot = fixtures.createMockSnapshot(
        `2025-07-06T${(14 + Math.floor(i / 60)).toString().padStart(2, '0')}-${(i % 60).toString().padStart(2, '0')}-00-000Z-snapshot-${i}`,
        `snapshot-${i}`,
        {
          timestamp: new Date(Date.now() + i * 60000).toISOString()
        }
      );
      snapshots.push(snapshot);

      if (i > 0) {
        const changes = Math.floor(Math.random() * changesPerSnapshot * 2);
        const diff = fixtures.createMockDiffResult(
          Math.floor(changes * 0.6),  // 60% additions
          Math.floor(changes * 0.2),  // 20% removals
          Math.floor(changes * 0.2)   // 20% modifications
        );
        diffs.push(diff);
      }
    }

    return { snapshots, diffs };
  }

  /**
   * Assert that operation completes within time limit
   * @param {Function} operation - Async operation to test
   * @param {number} maxTime - Maximum time in milliseconds
   * @returns {Promise<any>} Operation result
   */
  static async assertTimingConstraint(operation, maxTime) {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    
    if (duration > maxTime) {
      throw new Error(`Operation took ${duration}ms, expected less than ${maxTime}ms`);
    }
    
    return result;
  }

  /**
   * Create a comprehensive test environment
   * @param {Object} options - Environment options
   * @returns {Object} Test environment
   */
  static async createTestEnvironment(options = {}) {
    const tempDir = await TestHelpers.createTempDir();
    
    const env = {
      tempDir,
      fixtures: fixtures,
      mocks: {
        exec: TestHelpers.mockExec(options.execResponses || {}),
        spawn: TestHelpers.mockSpawn(options.spawnOptions || {}),
        fs: TestHelpers.mockFS(options.files || {}),
        ssh: TestHelpers.createMockSSHManager(options.sshResponses || {}),
        statistics: TestHelpers.createMockStatisticsEngine(),
        differ: TestHelpers.createMockConfigDiffer()
      },
      cleanup: async () => {
        await TestHelpers.cleanupTempDir(tempDir);
        vi.restoreAllMocks();
      }
    };

    return env;
  }
}

// Export convenience functions
export const {
  createTempDir,
  cleanupTempDir,
  mockExec,
  mockSpawn,
  mockFS,
  createMockSSHManager,
  createMockStatisticsEngine,
  createMockConfigDiffer,
  waitFor,
  validateHTML,
  generatePerformanceTestData,
  assertTimingConstraint,
  createTestEnvironment
} = TestHelpers;