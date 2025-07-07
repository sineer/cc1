// Test setup for Vitest
import { vi } from 'vitest';

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: console.warn, // Keep warnings
  error: console.error, // Keep errors
};

// Mock file system operations that are commonly used
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
  };
});

// Mock path operations
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: (...args) => args.join('/'),
    resolve: (...args) => '/' + args.join('/'),
    dirname: (path) => path.split('/').slice(0, -1).join('/'),
    basename: (path) => path.split('/').pop(),
  };
});

// Global test utilities
global.createMockSnapshot = (id, label, timestamp = new Date().toISOString()) => ({
  id: `${timestamp.replace(/[:.]/g, '-')}-${label}`,
  label,
  timestamp,
  path: `/mock/path/snapshots/${id}`,
  metadata: {
    deviceName: 'Test Device',
    snapshotTime: timestamp
  }
});

global.createMockDiffResult = (sectionsAdded = 0, sectionsRemoved = 0, sectionsModified = 0) => ({
  uci_diff: {
    packages: {
      ...(sectionsAdded > 0 && {
        dhcp: {
          status: 'modified',
          sections: Object.fromEntries(
            Array.from({ length: sectionsAdded }, (_, i) => [
              `section_added_${i}`,
              { status: 'added' }
            ])
          )
        }
      }),
      ...(sectionsRemoved > 0 && {
        firewall: {
          status: 'modified', 
          sections: Object.fromEntries(
            Array.from({ length: sectionsRemoved }, (_, i) => [
              `section_removed_${i}`,
              { status: 'removed' }
            ])
          )
        }
      }),
      ...(sectionsModified > 0 && {
        network: {
          status: 'modified',
          sections: Object.fromEntries(
            Array.from({ length: sectionsModified }, (_, i) => [
              `section_modified_${i}`,
              { 
                status: 'modified',
                options: {
                  option1: { status: 'modified', from: 'old', to: 'new' }
                }
              }
            ])
          )
        }
      })
    }
  },
  statistics: {
    total_changes: sectionsAdded + sectionsRemoved + sectionsModified,
    sections_added: sectionsAdded,
    sections_removed: sectionsRemoved,
    sections_modified: sectionsModified,
    options_changed: sectionsModified
  }
});