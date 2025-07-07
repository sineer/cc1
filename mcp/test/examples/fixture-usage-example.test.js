import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixtures } from '../fixtures/fixture-loader.js';
import { TestHelpers } from '../helpers/test-helpers.js';

/**
 * Example test demonstrating how to use fixtures and test helpers
 * This test shows all the available testing utilities and patterns
 */
describe('Fixture Usage Examples', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = await TestHelpers.createTestEnvironment({
      execResponses: {
        'uci-config': {
          stdout: 'SUCCESS: Configuration applied',
          stderr: '',
          error: null
        }
      },
      sshResponses: {
        'snapshot': {
          stdout: 'Snapshot created successfully',
          stderr: '',
          exitCode: 0
        }
      }
    });
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('Loading Configuration Fixtures', () => {
    it('should load basic OpenWRT configuration', async () => {
      const config = await fixtures.loadConfig('basic-openwrt');
      
      expect(config).toContain('config system');
      expect(config).toContain('option hostname \'OpenWrt\'');
      expect(config).toContain('config interface \'lan\'');
      expect(config).toContain('config dhcp');
      expect(config).toContain('config firewall');
    });

    it('should load ubispot captive portal configuration', async () => {
      const config = await fixtures.loadConfig('ubispot-captive');
      
      expect(config).toContain('config interface \'captive\'');
      expect(config).toContain('config ubispot \'captive\'');
      expect(config).toContain('config rule \'captive_rule10\'');
      expect(config).toContain('config uhttpd \'uam3990\'');
    });

    it('should load GL-iNet device configuration', async () => {
      const config = await fixtures.loadConfig('gl-mt3000');
      
      expect(config).toContain('option hostname \'GL-MT3000\'');
      expect(config).toContain('option model \'GL-MT3000\'');
      expect(config).toContain('option ipaddr \'192.168.8.1\'');
      expect(config).toContain('config wireless');
    });
  });

  describe('Loading Diff Fixtures', () => {
    it('should load ubispot deployment diff', async () => {
      const diff = await fixtures.loadDiff('ubispot-deployment');
      
      expect(diff.uci_diff.packages).toBeDefined();
      expect(diff.statistics.total_changes).toBe(17);
      expect(diff.statistics.sections_added).toBe(17);
      expect(diff.metadata.comparison_type).toBe('ubispot-deployment');
      
      // Verify specific changes
      expect(diff.uci_diff.packages.dhcp.sections.captive).toBeDefined();
      expect(diff.uci_diff.packages.firewall.sections.captive_rule10).toBeDefined();
      expect(diff.uci_diff.packages.ubispot.sections.captive).toBeDefined();
    });

    it('should load config removal diff', async () => {
      const diff = await fixtures.loadDiff('config-removal');
      
      expect(diff.statistics.sections_removed).toBe(17);
      expect(diff.statistics.sections_added).toBe(0);
      expect(diff.metadata.comparison_type).toBe('config-removal');
    });
  });

  describe('Loading Device Profiles', () => {
    it('should load GL-MT3000 device profile', async () => {
      const device = await fixtures.loadDevice('gl-mt3000');
      
      expect(device.name).toBe('GL-iNet GL-MT3000');
      expect(device.model).toBe('GL-MT3000');
      expect(device.default_ip).toBe('192.168.8.1');
      expect(device.interfaces.lan.default_ip).toBe('192.168.8.1');
      expect(device.capabilities).toContain('wifi');
      expect(device.testing.safe_mode).toBe(true);
    });

    it('should load generic OpenWRT device profile', async () => {
      const device = await fixtures.loadDevice('generic-openwrt');
      
      expect(device.name).toBe('Generic OpenWRT');
      expect(device.default_ip).toBe('192.168.1.1');
      expect(device.interfaces.lan.type).toBe('bridge');
      expect(device.testing.ssh_options).toContain('-o StrictHostKeyChecking=no');
    });
  });

  describe('Loading Snapshot Fixtures', () => {
    it('should load baseline snapshot', async () => {
      const snapshot = await fixtures.loadSnapshot('baseline-snapshot');
      
      expect(snapshot).toContain('config system');
      expect(snapshot).toContain('config network');
      expect(snapshot).toContain('option hostname \'OpenWrt\'');
    });

    it('should load after-changes snapshot', async () => {
      const snapshot = await fixtures.loadSnapshot('after-changes-snapshot');
      
      expect(snapshot).toContain('option hostname \'OpenWrt-Modified\'');
      expect(snapshot).toContain('config interface \'guest\'');
      expect(snapshot).toContain('config zone');
    });
  });

  describe('Loading SSH Response Fixtures', () => {
    it('should load successful deployment responses', async () => {
      const responses = await fixtures.loadSSHResponses('successful-deployment');
      
      expect(responses.responses.snapshot.stdout).toContain('Snapshot created successfully');
      expect(responses.responses.remove.stdout).toContain('Removed 17 sections');
      expect(responses.responses.deploy.stdout).toContain('Applied 17 changes');
      expect(responses.metadata.device_ip).toBe('192.168.11.2');
    });

    it('should load authentication failure responses', async () => {
      const responses = await fixtures.loadSSHResponses('authentication-failure');
      
      expect(responses.responses.permission_denied.stderr).toContain('Permission denied');
      expect(responses.responses.timeout.stderr).toContain('Operation timed out');
      expect(responses.responses.askpass_error.stderr).toContain('ssh_askpass');
      expect(responses.responses.askpass_error.exit_code).toBe(0); // Non-fatal
    });
  });

  describe('Loading Dashboard Data', () => {
    it('should load comprehensive dashboard data', async () => {
      const data = await fixtures.loadDashboardData();
      
      expect(data.device.deviceName).toBe('Direct IP (192.168.11.2)');
      expect(data.device.totalSnapshots).toBe(3);
      expect(data.snapshots).toHaveLength(3);
      expect(data.comparisons).toHaveLength(2);
      
      // Verify statistics aggregation
      expect(data.sectionStats.added).toBe(17);
      expect(data.packageStats.modified).toBe(5);
      expect(data.optionStats.added).toBe(67);
    });
  });

  describe('Creating Mock Data', () => {
    it('should create mock snapshots', () => {
      const snapshot = fixtures.createMockSnapshot(
        '2025-07-06T15-00-00-000Z-test',
        'test-snapshot',
        {
          deviceName: 'Test Device',
          type: 'manual'
        }
      );
      
      expect(snapshot.id).toBe('2025-07-06T15-00-00-000Z-test');
      expect(snapshot.label).toBe('test-snapshot');
      expect(snapshot.metadata.deviceName).toBe('Test Device');
      expect(snapshot.metadata.type).toBe('manual');
    });

    it('should create mock diff results', () => {
      const diff = fixtures.createMockDiffResult(5, 3, 2, {
        device: 'Test Device',
        comparisonType: 'test-comparison'
      });
      
      expect(diff.statistics.sections_added).toBe(5);
      expect(diff.statistics.sections_removed).toBe(3);
      expect(diff.statistics.sections_modified).toBe(2);
      expect(diff.statistics.total_changes).toBe(10);
      expect(diff.metadata.device).toBe('Test Device');
    });

    it('should create mock device configurations', () => {
      const device = fixtures.createMockDevice('Custom Device', {
        default_ip: '10.0.0.1',
        capabilities: ['custom_feature']
      });
      
      expect(device.name).toBe('Custom Device');
      expect(device.default_ip).toBe('10.0.0.1');
      expect(device.capabilities).toContain('custom_feature');
    });
  });

  describe('Using Test Helpers', () => {
    it('should mock exec commands', async () => {
      const mockExec = TestHelpers.mockExec({
        'uci-config test': {
          stdout: 'All tests passed',
          stderr: '',
          error: null
        }
      });
      
      const result = await new Promise((resolve, reject) => {
        mockExec('uci-config test', (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
      
      expect(result.stdout).toBe('All tests passed');
      expect(mockExec).toHaveBeenCalledWith('uci-config test', expect.any(Function));
    });

    it('should mock SSH manager', async () => {
      const sshManager = TestHelpers.createMockSSHManager({
        'snapshot': {
          stdout: 'Snapshot created: test-snapshot',
          stderr: '',
          exitCode: 0
        }
      });
      
      await sshManager.connect();
      const result = await sshManager.executeCommand('snapshot qemu test');
      
      expect(result.stdout).toBe('Snapshot created: test-snapshot');
      expect(sshManager.connect).toHaveBeenCalled();
      expect(sshManager.executeCommand).toHaveBeenCalledWith('snapshot qemu test');
    });

    it('should validate HTML structure', () => {
      const validHTML = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body><h1>Test Content</h1></body>
        </html>
      `;
      
      const result = TestHelpers.validateHTML(validHTML);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect HTML issues', () => {
      const invalidHTML = `
        <html>
        <body>
        <script>alert('xss')</script>
        <h1>Test</h1>
        </body>
        </html>
      `;
      
      const result = TestHelpers.validateHTML(invalidHTML);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing DOCTYPE declaration');
      expect(result.warnings.some(w => w.includes('script'))).toBe(true);
    });

    it('should generate performance test data', () => {
      const data = TestHelpers.generatePerformanceTestData(10, 5);
      
      expect(data.snapshots).toHaveLength(10);
      expect(data.diffs).toHaveLength(9); // n-1 diffs for n snapshots
      
      data.diffs.forEach(diff => {
        expect(diff.statistics.total_changes).toBeGreaterThanOrEqual(0);
        expect(diff.statistics.total_changes).toBeLessThanOrEqual(20); // max changes
      });
    });
  });

  describe('Integration Testing with Fixtures', () => {
    it('should simulate complete ubispot deployment workflow', async () => {
      // Load configuration fixtures
      const baseConfig = await fixtures.loadConfig('basic-openwrt');
      const ubispotConfig = await fixtures.loadConfig('ubispot-captive');
      const deploymentDiff = await fixtures.loadDiff('ubispot-deployment');
      
      // Create mock environment
      const sshResponses = await fixtures.loadSSHResponses('successful-deployment');
      const mockSSH = TestHelpers.createMockSSHManager(sshResponses.responses);
      
      // Simulate workflow steps
      await mockSSH.connect();
      
      // 1. Take baseline snapshot
      const snapshotResult = await mockSSH.executeCommand('snapshot qemu baseline');
      expect(snapshotResult.stdout).toContain('Snapshot created successfully');
      
      // 2. Remove existing config
      const removeResult = await mockSSH.executeCommand('remove --target default');
      expect(removeResult.stdout).toContain('Removed 17 sections');
      
      // 3. Deploy new config
      const deployResult = await mockSSH.executeCommand('safe-merge --target ubispot');
      expect(deployResult.stdout).toContain('Applied 17 changes');
      
      // Verify the diff matches expected changes
      expect(deploymentDiff.statistics.sections_added).toBe(17);
      expect(deploymentDiff.uci_diff.packages.ubispot).toBeDefined();
    });

    it('should handle error scenarios with fixtures', async () => {
      const errorResponses = await fixtures.loadSSHResponses('authentication-failure');
      const mockSSH = TestHelpers.createMockSSHManager(errorResponses.responses);
      
      // Test connection failure
      mockSSH.executeCommand.mockRejectedValueOnce(new Error('Connection refused'));
      
      await expect(mockSSH.executeCommand('test')).rejects.toThrow('Connection refused');
      
      // Test authentication failure
      mockSSH.executeCommand.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Permission denied (publickey,password)',
        exitCode: 255
      });
      
      const result = await mockSSH.executeCommand('test');
      expect(result.stderr).toContain('Permission denied');
      expect(result.exitCode).toBe(255);
    });
  });

  describe('Fixture Availability', () => {
    it('should list all available fixtures', async () => {
      const available = await fixtures.getAvailableFixtures();
      
      expect(available.configs).toContain('basic-openwrt');
      expect(available.configs).toContain('ubispot-captive');
      expect(available.configs).toContain('gl-mt3000');
      
      expect(available.diffs).toContain('ubispot-deployment');
      expect(available.diffs).toContain('config-removal');
      
      expect(available.devices).toContain('gl-mt3000');
      expect(available.devices).toContain('generic-openwrt');
      
      expect(available.snapshots).toContain('baseline-snapshot');
      expect(available.snapshots).toContain('after-changes-snapshot');
      
      expect(available['ssh-responses']).toContain('successful-deployment');
      expect(available['ssh-responses']).toContain('authentication-failure');
    });

    it('should validate fixture existence', async () => {
      expect(await fixtures.fixtureExists('configs', 'basic-openwrt')).toBe(true);
      expect(await fixtures.fixtureExists('configs', 'nonexistent')).toBe(false);
      
      expect(await fixtures.fixtureExists('diffs', 'ubispot-deployment')).toBe(true);
      expect(await fixtures.fixtureExists('diffs', 'nonexistent')).toBe(false);
    });
  });
});