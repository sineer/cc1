import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fixture loader utility for testing
 * Provides convenient methods to load mock data, configurations, and responses
 */
export class FixtureLoader {
  constructor() {
    this.fixturesDir = __dirname;
  }

  /**
   * Load a UCI configuration fixture
   * @param {string} name - Name of the config file (without .uci extension)
   * @returns {Promise<string>} UCI configuration content
   */
  async loadConfig(name) {
    const configPath = path.join(this.fixturesDir, 'configs', `${name}.uci`);
    return await fs.readFile(configPath, 'utf8');
  }

  /**
   * Load a diff result fixture
   * @param {string} name - Name of the diff file (without .json extension)
   * @returns {Promise<Object>} Parsed diff result object
   */
  async loadDiff(name) {
    const diffPath = path.join(this.fixturesDir, 'diffs', `${name}.json`);
    const content = await fs.readFile(diffPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Load a device profile fixture
   * @param {string} name - Name of the device file (without .json extension)
   * @returns {Promise<Object>} Parsed device profile object
   */
  async loadDevice(name) {
    const devicePath = path.join(this.fixturesDir, 'devices', `${name}.json`);
    const content = await fs.readFile(devicePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Load a snapshot fixture
   * @param {string} name - Name of the snapshot file (without .uci extension)
   * @returns {Promise<string>} Snapshot content
   */
  async loadSnapshot(name) {
    const snapshotPath = path.join(this.fixturesDir, 'snapshots', `${name}.uci`);
    return await fs.readFile(snapshotPath, 'utf8');
  }

  /**
   * Load SSH response fixtures
   * @param {string} name - Name of the SSH response file (without .json extension)
   * @returns {Promise<Object>} Parsed SSH responses object
   */
  async loadSSHResponses(name) {
    const responsePath = path.join(this.fixturesDir, 'ssh-responses', `${name}.json`);
    const content = await fs.readFile(responsePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Load dashboard data fixture
   * @returns {Promise<Object>} Parsed dashboard data object
   */
  async loadDashboardData() {
    const dashboardPath = path.join(this.fixturesDir, 'dashboard-data.json');
    const content = await fs.readFile(dashboardPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Create a mock snapshot with test data
   * @param {string} id - Snapshot ID
   * @param {string} label - Snapshot label
   * @param {Object} options - Additional options
   * @returns {Object} Mock snapshot object
   */
  createMockSnapshot(id, label, options = {}) {
    return {
      id,
      label,
      timestamp: options.timestamp || new Date().toISOString(),
      path: options.path || `/tmp/snapshots/${id}`,
      metadata: {
        deviceName: options.deviceName || 'Test Device',
        type: options.type || 'manual',
        demo: options.demo || null,
        ...options.metadata
      },
      ...options
    };
  }

  /**
   * Create a mock diff result with specified statistics
   * @param {number} added - Number of sections added
   * @param {number} removed - Number of sections removed
   * @param {number} modified - Number of sections modified
   * @param {Object} options - Additional options
   * @returns {Object} Mock diff result object
   */
  createMockDiffResult(added = 0, removed = 0, modified = 0, options = {}) {
    const packages = {};
    
    // Create mock packages with sections
    for (let i = 0; i < added; i++) {
      if (!packages.test_package) {
        packages.test_package = { status: 'modified', sections: {} };
      }
      packages.test_package.sections[`added_section_${i}`] = { status: 'added' };
    }
    
    for (let i = 0; i < removed; i++) {
      if (!packages.test_package) {
        packages.test_package = { status: 'modified', sections: {} };
      }
      packages.test_package.sections[`removed_section_${i}`] = { status: 'removed' };
    }
    
    for (let i = 0; i < modified; i++) {
      if (!packages.test_package) {
        packages.test_package = { status: 'modified', sections: {} };
      }
      packages.test_package.sections[`modified_section_${i}`] = { status: 'modified' };
    }

    return {
      uci_diff: {
        packages: packages
      },
      statistics: {
        total_changes: added + removed + modified,
        sections_added: added,
        sections_removed: removed,
        sections_modified: modified,
        options_changed: options.optionChanges || 0,
        packages_modified: Object.keys(packages).length,
        packages_added: options.packagesAdded || 0,
        packages_removed: options.packagesRemoved || 0
      },
      metadata: {
        timestamp: new Date().toISOString(),
        device: options.device || 'Test Device',
        before_snapshot: options.beforeSnapshot || 'test-before',
        after_snapshot: options.afterSnapshot || 'test-after',
        comparison_type: options.comparisonType || 'test',
        ...options.metadata
      }
    };
  }

  /**
   * Create mock SSH command responses
   * @param {Object} commands - Command-response mapping
   * @returns {Object} Mock SSH responses
   */
  createMockSSHResponses(commands = {}) {
    const defaultResponses = {
      'uci-config --version': {
        stdout: 'uci-config version 2.1.0\n',
        stderr: '',
        exit_code: 0
      },
      'uci-config test': {
        stdout: 'All tests passed\n',
        stderr: '',
        exit_code: 0
      }
    };

    return {
      responses: { ...defaultResponses, ...commands },
      metadata: {
        device_ip: '192.168.1.1',
        device_name: 'Test Device',
        test_scenario: 'mock_responses',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create mock device configuration
   * @param {string} name - Device name
   * @param {Object} overrides - Property overrides
   * @returns {Object} Mock device configuration
   */
  createMockDevice(name = 'Test Device', overrides = {}) {
    return {
      name,
      model: 'Test-Model',
      manufacturer: 'Test-Manufacturer',
      arch: 'x86_64',
      default_ip: '192.168.1.1',
      default_username: 'root',
      default_password: '',
      ssh_port: 22,
      web_port: 80,
      capabilities: ['wifi', 'ethernet', 'firewall', 'dhcp'],
      interfaces: {
        lan: {
          type: 'bridge',
          default_ip: '192.168.1.1',
          netmask: '255.255.255.0'
        },
        wan: {
          type: 'ethernet',
          proto: 'dhcp'
        }
      },
      uci_packages: ['system', 'network', 'dhcp', 'firewall'],
      testing: {
        ssh_options: [
          '-o StrictHostKeyChecking=no',
          '-o UserKnownHostsFile=/dev/null',
          '-o LogLevel=ERROR'
        ],
        safe_mode: true,
        timeout: 300
      },
      ...overrides
    };
  }

  /**
   * Get all available fixture files
   * @returns {Promise<Object>} Available fixtures by category
   */
  async getAvailableFixtures() {
    const categories = ['configs', 'diffs', 'devices', 'snapshots', 'ssh-responses'];
    const fixtures = {};

    for (const category of categories) {
      const categoryPath = path.join(this.fixturesDir, category);
      try {
        const files = await fs.readdir(categoryPath);
        fixtures[category] = files.map(file => path.parse(file).name);
      } catch (error) {
        fixtures[category] = [];
      }
    }

    return fixtures;
  }

  /**
   * Validate fixture file exists
   * @param {string} category - Fixture category
   * @param {string} name - Fixture name
   * @returns {Promise<boolean>} Whether fixture exists
   */
  async fixtureExists(category, name) {
    const extensions = {
      configs: '.uci',
      diffs: '.json',
      devices: '.json',
      snapshots: '.uci',
      'ssh-responses': '.json'
    };

    const extension = extensions[category] || '.json';
    const fixturePath = path.join(this.fixturesDir, category, `${name}${extension}`);
    
    try {
      await fs.access(fixturePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance for convenience
export const fixtures = new FixtureLoader();

// Export helper functions
export const {
  loadConfig,
  loadDiff,
  loadDevice,
  loadSnapshot,
  loadSSHResponses,
  loadDashboardData,
  createMockSnapshot,
  createMockDiffResult,
  createMockSSHResponses,
  createMockDevice,
  getAvailableFixtures,
  fixtureExists
} = fixtures;