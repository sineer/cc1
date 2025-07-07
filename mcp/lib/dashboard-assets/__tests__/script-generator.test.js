import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptGenerator } from '../script-generator.js';

describe('ScriptGenerator', () => {
  let generator;
  let mockWindowOpen;

  beforeEach(() => {
    generator = new ScriptGenerator();
    
    // Setup DOM environment
    global.window = {
      DEVICE_NAME: '',
      open: vi.fn(),
      console: { log: vi.fn() }
    };
    global.document = {
      title: '',
      body: { innerHTML: '' }
    };
    
    mockWindowOpen = vi.fn();
    global.window.open = mockWindowOpen;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('compareTo function', () => {
    it('should generate correct diff filename for standard device names', () => {
      // This test would have caught the filename generation bug
      window.DEVICE_NAME = 'QEMU OpenWRT VM';
      
      const scriptContent = generator.generateScript();
      
      // Execute the generated script to get the compareTo function
      eval(scriptContent);
      
      // Test the compareTo function
      compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
      
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/QEMU OpenWRT VM-pre-test-post-test.html',
        '_blank'
      );
    });

    it('should handle device names with parentheses correctly', () => {
      // This would have caught the Direct IP device name bug
      window.DEVICE_NAME = 'Direct IP (192.168.11.2)';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
      
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/Direct-IP-(192.168.11.2)-pre-test-post-test.html',
        '_blank'
      );
    });

    it('should handle device names with multiple spaces', () => {
      window.DEVICE_NAME = 'My  Test   Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
      
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/My--Test---Device-pre-test-post-test.html',
        '_blank'
      );
    });

    it('should handle device names with special characters', () => {
      const testCases = [
        {
          deviceName: 'Router [Production]',
          expected: 'diffs/Router-[Production]-pre-test-post-test.html'
        },
        {
          deviceName: 'Device & Test',
          expected: 'diffs/Device-&-Test-pre-test-post-test.html'
        },
        {
          deviceName: 'OpenWRT/Test',
          expected: 'diffs/OpenWRT/Test-pre-test-post-test.html'
        }
      ];

      testCases.forEach(({ deviceName, expected }) => {
        window.DEVICE_NAME = deviceName;
        mockWindowOpen.mockClear();
        
        const scriptContent = generator.generateScript();
        eval(scriptContent);
        
        compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
        
        expect(mockWindowOpen).toHaveBeenCalledWith(expected, '_blank');
      });
    });

    it('should correctly extract labels from timestamp IDs', () => {
      window.DEVICE_NAME = 'Test Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      // Test various timestamp formats
      const testCases = [
        {
          id1: '2025-07-06T14-35-15-270Z-pre-ubispot-deployment',
          id2: '2025-07-06T14-35-39-020Z-post-ubispot-deployment',
          expectedFile: 'diffs/Test-Device-pre-ubispot-deployment-post-ubispot-deployment.html'
        },
        {
          id1: '2025-01-01T00-00-00-000Z-baseline-cowboy-demo',
          id2: '2025-01-01T01-00-00-000Z-after-changes',
          expectedFile: 'diffs/Test-Device-baseline-cowboy-demo-after-changes.html'
        }
      ];

      testCases.forEach(({ id1, id2, expectedFile }) => {
        mockWindowOpen.mockClear();
        compareTo(id1, id2);
        expect(mockWindowOpen).toHaveBeenCalledWith(expectedFile, '_blank');
      });
    });

    it('should handle IDs without timestamp prefix', () => {
      window.DEVICE_NAME = 'Test Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      // Test IDs that don't match the timestamp pattern
      compareTo('simple-label-1', 'simple-label-2');
      
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/Test-Device-simple-label-1-simple-label-2.html',
        '_blank'
      );
    });

    it('should fallback to default device name when window.DEVICE_NAME is missing', () => {
      window.DEVICE_NAME = undefined;
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
      
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/QEMU OpenWRT VM-pre-test-post-test.html',
        '_blank'
      );
    });

    it('should log debug information to console', () => {
      const consoleSpy = vi.spyOn(window.console, 'log');
      window.DEVICE_NAME = 'Test Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      compareTo('2025-01-01T00-00-00-000Z-pre-test', '2025-01-01T01-00-00-000Z-post-test');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Opening diff:',
        'diffs/Test-Device-pre-test-post-test.html'
      );
    });
  });

  describe('refreshDashboard function', () => {
    it('should reload the page', () => {
      const reloadSpy = vi.fn();
      window.location = { reload: reloadSpy };
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      refreshDashboard();
      
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe('viewSnapshot function', () => {
    it('should log snapshot viewing attempt', () => {
      const consoleSpy = vi.spyOn(window.console, 'log');
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      viewSnapshot('test-snapshot-id');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Viewing snapshot:',
        'test-snapshot-id'
      );
    });
  });

  describe('generated script structure', () => {
    it('should generate valid JavaScript code', () => {
      const scriptContent = generator.generateScript();
      
      // Should not throw when evaluated
      expect(() => eval(scriptContent)).not.toThrow();
      
      // Should contain expected function definitions
      expect(scriptContent).toContain('function refreshDashboard()');
      expect(scriptContent).toContain('function viewSnapshot(');
      expect(scriptContent).toContain('function compareTo(');
    });

    it('should include proper error handling', () => {
      const scriptContent = generator.generateScript();
      
      // Should contain try-catch blocks or error handling
      expect(scriptContent).toContain('||');  // Fallback operators
      expect(scriptContent).toMatch(/DEVICE_NAME.*\|\|/);  // Device name fallback
    });

    it('should be minification-friendly', () => {
      const scriptContent = generator.generateScript();
      
      // Should not rely on function names that could be minified
      expect(scriptContent).not.toContain('function.name');
      
      // Should use string literals for keys that might be minified
      expect(scriptContent).toContain('"');
    });

    it('should handle edge cases in regex patterns', () => {
      window.DEVICE_NAME = 'Test Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      // Test edge cases that could break regex
      const edgeCases = [
        '2025-13-45T99-99-99-999Z-invalid-timestamp',  // Invalid timestamp
        '',  // Empty string
        'no-timestamp-prefix',  // No timestamp
        '2025-01-01T00-00-00-000Z-',  // Ends with dash
        '2025-01-01T00-00-00-000Z-label-with-many-dashes-here'  // Many dashes
      ];

      edgeCases.forEach(id => {
        expect(() => compareTo(id, 'test')).not.toThrow();
      });
    });
  });

  describe('integration with dashboard HTML', () => {
    it('should work with dynamically generated HTML', () => {
      window.DEVICE_NAME = 'Test Device';
      
      // Simulate dashboard HTML with buttons
      document.body.innerHTML = `
        <button onclick="compareTo('2025-01-01T00-00-00-000Z-pre', '2025-01-01T01-00-00-000Z-post')">
          Compare Diffs
        </button>
      `;
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      // Simulate button click
      const button = document.querySelector('button');
      const onclickCode = button.getAttribute('onclick');
      
      expect(() => eval(onclickCode)).not.toThrow();
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'diffs/Test-Device-pre-post.html',
        '_blank'
      );
    });

    it('should handle multiple compare operations', () => {
      window.DEVICE_NAME = 'Test Device';
      
      const scriptContent = generator.generateScript();
      eval(scriptContent);
      
      // Multiple comparisons
      compareTo('2025-01-01T00-00-00-000Z-snap1', '2025-01-01T01-00-00-000Z-snap2');
      compareTo('2025-01-01T01-00-00-000Z-snap2', '2025-01-01T02-00-00-000Z-snap3');
      
      expect(mockWindowOpen).toHaveBeenCalledTimes(2);
      expect(mockWindowOpen).toHaveBeenNthCalledWith(1, 'diffs/Test-Device-snap1-snap2.html', '_blank');
      expect(mockWindowOpen).toHaveBeenNthCalledWith(2, 'diffs/Test-Device-snap2-snap3.html', '_blank');
    });
  });
});