#!/usr/bin/env node

/**
 * Target Device Runner for UCI Configuration Tests
 * Executes tests on real target devices via SSH with comprehensive safety measures
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SSHConnection } from './safety/ssh-connection.js';
import { NetworkMonitor } from './safety/network-monitor.js';
import { BackupManager } from './safety/backup-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

class TargetDeviceRunner {
  constructor(targetProfile, options = {}) {
    this.targetProfile = targetProfile;
    this.options = {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      timeout: options.timeout || 600000, // 10 minutes default
      ...options
    };
    
    this.ssh = null;
    this.networkMonitor = null;
    this.backupManager = null;
    this.isConnected = false;
    this.testResults = [];
    this.operationId = `target-test-${Date.now()}`;
  }

  /**
   * Load target device profile
   */
  async loadTargetProfile(profileIdentifier) {
    try {
      let profilePath;
      
      // Handle IP address direct connection
      if (profileIdentifier.startsWith('ip:') || this.isValidIP(profileIdentifier)) {
        const ip = profileIdentifier.startsWith('ip:') ? profileIdentifier.substring(3) : profileIdentifier;
        return this.createIPProfile(ip);
      }
      
      // Handle named profiles
      profilePath = path.join(REPO_ROOT, 'targets', `${profileIdentifier}.json`);
      
      try {
        const profileData = await fs.readFile(profilePath, 'utf8');
        const profile = JSON.parse(profileData);
        this.validateProfile(profile);
        return profile;
      } catch (error) {
        // Fallback to default profile
        profilePath = path.join(REPO_ROOT, 'targets', 'default.json');
        const defaultData = await fs.readFile(profilePath, 'utf8');
        const defaultProfile = JSON.parse(defaultData);
        
        // Override connection host if it's an IP
        if (this.isValidIP(profileIdentifier)) {
          defaultProfile.connection.host = profileIdentifier;
        }
        
        return defaultProfile;
      }
    } catch (error) {
      throw new Error(`Failed to load target profile: ${error.message}`);
    }
  }

  /**
   * Create profile for direct IP connection
   */
  createIPProfile(ip) {
    if (!this.isValidIP(ip)) {
      throw new Error(`Invalid IP address: ${ip}`);
    }

    // Check for password authentication option
    const usePassword = this.options.password !== undefined;

    return {
      name: `Direct IP Connection (${ip})`,
      description: `Direct connection to ${ip} using default settings`,
      device_type: 'ip-direct',
      connection: {
        method: 'ssh',
        host: ip,
        port: 22,
        username: 'root',
        key_file: usePassword ? 'none' : '~/.ssh/id_rsa',
        password: usePassword ? this.options.password : undefined,
        timeout: 30,
        keepalive: true
      },
      safety: {
        backup_location: '/tmp/uci-backup',
        max_test_duration: 300,
        connectivity_check_interval: 30,
        auto_rollback_enabled: true,
        preserve_network: true,
        require_confirmation: true
      },
      test_config: {
        allowed_tests: ['test_production_deployment.lua'],
        test_timeout: 600,
        dry_run_first: true
      }
    };
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  /**
   * Validate target profile structure
   */
  validateProfile(profile) {
    const required = ['connection', 'safety', 'test_config'];
    for (const field of required) {
      if (!profile[field]) {
        throw new Error(`Profile missing required field: ${field}`);
      }
    }

    // Validate connection settings
    const conn = profile.connection;
    if (!conn.host || !conn.username) {
      throw new Error('Profile must specify connection host and username');
    }

    // Validate safety settings
    const safety = profile.safety;
    if (safety.preserve_network === undefined) {
      throw new Error('Profile must specify preserve_network safety setting');
    }
  }

  /**
   * Initialize connection to target device
   */
  async connect() {
    try {
      const profile = await this.loadTargetProfile(this.targetProfile);
      this.profile = profile;

      if (this.options.verbose) {
        console.error(`🔗 Connecting to target: ${profile.name}`);
        console.error(`   Host: ${profile.connection.host}`);
        console.error(`   User: ${profile.connection.username}`);
      }

      // Initialize SSH connection
      this.ssh = new SSHConnection(profile.connection);
      
      if (this.options.verbose) {
        console.error(`   Auth method: ${profile.connection.password !== undefined ? 'password' : 'key'}`);
      }
      
      await this.ssh.connect();

      // Initialize network monitor
      this.networkMonitor = new NetworkMonitor(this.ssh, profile.network);
      
      // Initialize backup manager
      this.backupManager = new BackupManager(this.ssh, profile.safety);

      this.isConnected = true;
      
      if (this.options.verbose) {
        console.error('✅ Connected to target device');
      }

      return true;
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from target device
   */
  async disconnect() {
    try {
      if (this.networkMonitor) {
        await this.networkMonitor.stop();
      }
      
      if (this.ssh) {
        await this.ssh.disconnect();
      }
      
      this.isConnected = false;
      
      if (this.options.verbose) {
        console.error('🔌 Disconnected from target device');
      }
    } catch (error) {
      console.error('Warning: Error during disconnect:', error.message);
    }
  }

  /**
   * Create comprehensive backup before testing
   */
  async createBackup() {
    try {
      if (this.options.verbose) {
        console.error('💾 Creating configuration backup...');
      }

      const backupId = await this.backupManager.createFullBackup(this.operationId);
      
      if (this.options.verbose) {
        console.error(`✅ Backup created: ${backupId}`);
      }

      return backupId;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Upload test framework to target device
   */
  async uploadTestFramework() {
    try {
      if (this.options.verbose) {
        console.error('📤 Uploading test framework...');
      }

      // Create remote test directory structure
      await this.ssh.execute('mkdir -p /tmp/uci-test-framework/lib');
      await this.ssh.execute('mkdir -p /tmp/uci-test-framework/test');

      // Upload required files individually
      const filesToUpload = [
        'lib/uci_merge_engine.lua',
        'lib/test_utils.lua',
        'test/luaunit_fixed.lua',
        'test/test_production_deployment.lua',
        'test/test_merge_engine.lua',
        'test/test_advanced_integration.lua'
      ];

      for (const file of filesToUpload) {
        const localPath = path.join(REPO_ROOT, file);
        const remotePath = `/tmp/uci-test-framework/${file}`;
        
        // Create parent directory if needed
        const remoteDir = path.dirname(remotePath);
        await this.ssh.execute(`mkdir -p ${remoteDir}`);
        
        await this.ssh.upload(localPath, remotePath);
        
        if (this.options.verbose) {
          console.error(`   Uploaded: ${file}`);
        }
      }
      
      // Upload test/etc directory recursively
      const testEtcLocal = path.join(REPO_ROOT, 'test/etc');
      const testEtcRemote = '/tmp/uci-test-framework/test/etc';
      await this.ssh.upload(testEtcLocal, testEtcRemote);
      
      if (this.options.verbose) {
        console.error(`   Uploaded: test/etc directory`);
      }

      if (this.options.verbose) {
        console.error('✅ Test framework uploaded');
      }

      return true;
    } catch (error) {
      throw new Error(`Framework upload failed: ${error.message}`);
    }
  }

  /**
   * Execute tests on target device
   */
  async runTests(testFile = 'test_production_deployment.lua') {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to target device');
      }

      // Validate test is allowed
      if (!this.isTestAllowed(testFile)) {
        throw new Error(`Test not allowed by profile: ${testFile}`);
      }

      if (this.options.verbose) {
        console.error(`🧪 Executing test: ${testFile}`);
      }

      // Start network monitoring
      await this.networkMonitor.start();

      // Setup test environment on target
      const testSetupScript = this.generateTestSetupScript(testFile);
      await this.ssh.writeFile('/tmp/uci-test-framework/run-test.sh', testSetupScript);
      await this.ssh.execute('chmod +x /tmp/uci-test-framework/run-test.sh');

      // Execute test with timeout
      const testCommand = '/tmp/uci-test-framework/run-test.sh';
      const testTimeout = this.profile.test_config.test_timeout * 1000;
      
      const result = await this.ssh.execute(testCommand, { timeout: testTimeout });

      // Parse test results
      const testResults = this.parseTestResults(result.stdout, result.stderr);

      if (this.options.verbose) {
        console.error(`✅ Test completed: ${testResults.passed}/${testResults.total} passed`);
      }

      return testResults;
    } catch (error) {
      // Attempt rollback on failure
      if (this.backupManager && this.profile.safety.auto_rollback_enabled) {
        try {
          await this.rollbackConfiguration();
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError.message);
        }
      }
      
      throw new Error(`Test execution failed: ${error.message}`);
    } finally {
      // Stop network monitoring
      if (this.networkMonitor) {
        await this.networkMonitor.stop();
      }
    }
  }

  /**
   * Check if test is allowed by profile
   */
  isTestAllowed(testFile) {
    const allowed = this.profile.test_config.allowed_tests;
    const skipped = this.profile.test_config.skip_tests || [];
    
    // Check if explicitly skipped
    if (skipped.includes(testFile) || skipped.includes('*')) {
      return false;
    }
    
    // Check if explicitly allowed (empty list means all allowed)
    if (allowed.length === 0 || allowed.includes(testFile)) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate test setup script for target device
   */
  generateTestSetupScript(testFile) {
    return `#!/bin/bash
set -euo pipefail

# UCI Test Framework Setup Script
cd /tmp/uci-test-framework

# Set up Lua path
export LUA_PATH="./lib/?.lua;./test/?.lua;$LUA_PATH"

# Ensure UCI tools are available
if ! command -v uci &> /dev/null; then
    echo "ERROR: UCI tools not available on target device"
    exit 1
fi

# Run the test with proper error handling
echo "=== UCI Configuration Test Runner ==="
echo "Test: ${testFile}"
echo "Target: $(hostname)"
echo "Time: $(date)"
echo "======================================"

if lua test/${testFile}; then
    echo "======================================"
    echo "✅ Test completed successfully"
    exit 0
else
    echo "======================================"
    echo "❌ Test failed"
    exit 1
fi
`;
  }

  /**
   * Parse test results from output
   */
  parseTestResults(stdout, stderr) {
    const results = {
      stdout: stdout,
      stderr: stderr,
      passed: 0,
      failed: 0,
      total: 0,
      success: false,
      errors: []
    };

    try {
      // Parse LuaUnit output
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Look for test summary line
        if (line.includes('Ran') && line.includes('tests')) {
          const match = line.match(/Ran (\d+) tests in .*, (\d+) successes?, (\d+) failures?/);
          if (match) {
            results.total = parseInt(match[1]);
            results.passed = parseInt(match[2]);
            results.failed = parseInt(match[3]);
            results.success = results.failed === 0;
          }
        }
        
        // Collect error messages
        if (line.includes('ERROR:') || line.includes('FAIL:')) {
          results.errors.push(line.trim());
        }
      }

      // If we couldn't parse standard format, check for basic success indicators
      if (results.total === 0) {
        if (stdout.includes('✅') || stdout.includes('Test completed successfully')) {
          results.success = true;
          results.passed = 1;
          results.total = 1;
        } else if (stdout.includes('❌') || stderr.length > 0) {
          results.success = false;
          results.failed = 1;
          results.total = 1;
        }
      }

    } catch (error) {
      results.errors.push(`Result parsing error: ${error.message}`);
    }

    return results;
  }

  /**
   * Rollback configuration to backup
   */
  async rollbackConfiguration() {
    try {
      if (this.options.verbose) {
        console.error('🔄 Rolling back configuration...');
      }

      await this.backupManager.restoreBackup(this.operationId);
      
      if (this.options.verbose) {
        console.error('✅ Configuration restored');
      }

      return true;
    } catch (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Cleanup remote test files
   */
  async cleanup() {
    try {
      if (this.ssh && this.isConnected) {
        await this.ssh.execute('rm -rf /tmp/uci-test-framework');
        
        if (this.options.verbose) {
          console.error('🧹 Cleaned up test framework');
        }
      }
    } catch (error) {
      console.warn('Warning: Cleanup failed:', error.message);
    }
  }

  /**
   * Execute a complete test run with all safety measures
   */
  async executeTestRun(testFile) {
    let backupId = null;
    
    try {
      // Connect to device
      await this.connect();
      
      // Create backup
      backupId = await this.createBackup();
      
      // Upload framework
      await this.uploadTestFramework();
      
      // Run tests
      const results = await this.runTests(testFile);
      
      // Cleanup
      await this.cleanup();
      
      return {
        success: true,
        results: results,
        backupId: backupId,
        operationId: this.operationId
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        backupId: backupId,
        operationId: this.operationId
      };
      
    } finally {
      await this.disconnect();
    }
  }
}

export { TargetDeviceRunner };