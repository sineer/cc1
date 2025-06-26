/**
 * Simplified Test Utilities
 * Common functions for both Docker and remote testing
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * SimpleSSH - Lightweight SSH wrapper for test execution
 */
class SimpleSSH {
  constructor(config) {
    this.host = config.host;
    this.username = config.username || 'root';
    this.port = config.port || 22;
    this.password = config.password;
    this.keyFile = config.keyFile;
    this.verbose = config.verbose || false;
    
    // Build SSH command components
    this.baseArgs = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${this.port}`;
    this.setupCommands();
  }

  setupCommands() {
    const target = `${this.username}@${this.host}`;
    
    if (this.password !== undefined) {
      // Password authentication (including empty password)
      this.sshCmd = `sshpass -p '${this.password}' ssh ${this.baseArgs} ${target}`;
      this.scpCmd = `sshpass -p '${this.password}' scp -O ${this.baseArgs}`;
      this.scpTarget = target;
    } else if (this.keyFile) {
      // Key file authentication
      this.sshCmd = `ssh -i ${this.keyFile} ${this.baseArgs} ${target}`;
      this.scpCmd = `scp -i ${this.keyFile} -O ${this.baseArgs}`;
      this.scpTarget = target;
    } else {
      // Default authentication
      this.sshCmd = `ssh ${this.baseArgs} ${target}`;
      this.scpCmd = `scp -O ${this.baseArgs}`;
      this.scpTarget = target;
    }
  }

  async exec(command) {
    const fullCmd = `${this.sshCmd} "${command}"`;
    if (this.verbose) {
      console.error(`[SSH] Executing: ${command}`);
    }
    
    try {
      const { stdout, stderr } = await execAsync(fullCmd, { maxBuffer: 10 * 1024 * 1024 });
      return { success: true, stdout, stderr };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1
      };
    }
  }

  async upload(localPath, remotePath) {
    const fullCmd = `${this.scpCmd} -r ${localPath} ${this.scpTarget}:${remotePath}`;
    if (this.verbose) {
      console.error(`[SCP] Uploading: ${localPath} -> ${remotePath}`);
    }
    
    try {
      const { stdout, stderr } = await execAsync(fullCmd);
      return { success: true, stdout, stderr };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1
      };
    }
  }

  async testConnection() {
    const result = await this.exec('echo "SSH_OK"');
    return result.success && result.stdout.includes('SSH_OK');
  }

  async getDeviceInfo() {
    const info = {};
    
    // Get hostname
    const hostnameResult = await this.exec('hostname');
    if (hostnameResult.success) {
      info.hostname = hostnameResult.stdout.trim();
    }
    
    // Get OpenWRT version
    const versionResult = await this.exec('cat /etc/openwrt_release 2>/dev/null | grep DISTRIB_DESCRIPTION');
    if (versionResult.success) {
      info.version = versionResult.stdout.trim().replace('DISTRIB_DESCRIPTION=', '').replace(/['"]/g, '');
    }
    
    // Get architecture
    const archResult = await this.exec('uname -m');
    if (archResult.success) {
      info.architecture = archResult.stdout.trim();
    }
    
    // Get uptime
    const uptimeResult = await this.exec('uptime');
    if (uptimeResult.success) {
      info.uptime = uptimeResult.stdout.trim();
    }
    
    return info;
  }
}

/**
 * Load target profile from JSON file or return default for IP
 */
async function loadTargetProfile(target, repoRoot = process.cwd()) {
  // Check if it's an IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    return {
      name: `Direct IP (${target})`,
      device_type: 'generic',
      connection: {
        host: target,
        username: 'root',
        port: 22
      }
    };
  }
  
  // Try to load profile JSON
  try {
    const profilePath = path.join(repoRoot, 'targets', `${target}.json`);
    const profileData = await fs.readFile(profilePath, 'utf8');
    return JSON.parse(profileData);
  } catch (error) {
    throw new Error(`Cannot load profile '${target}': ${error.message}`);
  }
}

/**
 * Execute command with timeout and proper error handling
 */
async function executeCommand(cmd, options = {}) {
  const timeout = options.timeout || 300000; // 5 minutes default
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024;
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { 
      maxBuffer,
      timeout,
      ...options 
    });
    
    return { 
      success: true, 
      stdout, 
      stderr 
    };
  } catch (error) {
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      code: error.code || 1,
      signal: error.signal,
      timedOut: error.signal === 'SIGTERM'
    };
  }
}

/**
 * Format test results consistently
 */
function formatTestResults(results) {
  const { passed = 0, failed = 0, total = 0 } = results;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
  
  let status = '✅';
  if (failed > 0) {
    status = '❌';
  } else if (total === 0) {
    status = '⚠️';
  }
  
  return {
    status,
    summary: `${status} Tests: ${passed}/${total} passed (${percentage}%)`,
    passed,
    failed,
    total,
    percentage
  };
}

/**
 * Parse Lua test output to extract test counts
 */
function parseTestOutput(output) {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    errors: []
  };
  
  // Look for LuaUnit summary patterns
  const summaryMatch = output.match(/Ran (\d+) tests? in [\d.]+s?: (\d+) passed, (\d+) failed/);
  if (summaryMatch) {
    results.total = parseInt(summaryMatch[1], 10);
    results.passed = parseInt(summaryMatch[2], 10);
    results.failed = parseInt(summaryMatch[3], 10);
  }
  
  // Alternative pattern
  const altMatch = output.match(/(\d+) tests?, (\d+) passed, (\d+) failed/);
  if (!summaryMatch && altMatch) {
    results.total = parseInt(altMatch[1], 10);
    results.passed = parseInt(altMatch[2], 10);
    results.failed = parseInt(altMatch[3], 10);
  }
  
  // Extract error messages
  const errorMatches = output.matchAll(/FAIL\s+\[(.*?)\]\s*:\s*(.*?)(?=\n(?:PASS|FAIL|$))/gs);
  for (const match of errorMatches) {
    results.errors.push({
      test: match[1],
      message: match[2].trim()
    });
  }
  
  return results;
}

/**
 * Check if Docker is available
 */
async function checkDocker() {
  const result = await executeCommand('docker --version');
  return result.success;
}

/**
 * Check if Docker image exists
 */
async function dockerImageExists(imageName) {
  const result = await executeCommand(`docker image inspect ${imageName}`);
  return result.success;
}

module.exports = {
  SimpleSSH,
  loadTargetProfile,
  executeCommand,
  formatTestResults,
  parseTestOutput,
  checkDocker,
  dockerImageExists
};