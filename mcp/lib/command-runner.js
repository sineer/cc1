/**
 * Command Runner - Centralized command execution for UCI config management
 * Standardizes local shell, SSH, Docker, and file transfer operations
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import { appendFileSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class CommandRunner {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.timeout = options.timeout || 30000;
    this.maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB
    this.debugLog = options.debugLog || this.defaultLogger;
    this.repoRoot = options.repoRoot;
  }

  /**
   * Default logger implementation
   */
  defaultLogger(message, level = 'debug') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    if (this.debug) {
      console.error(`[${level.toUpperCase()}] ${message}`);
    }
    
    // Optionally log to file
    if (process.env.UCI_DEBUG_LOG) {
      try {
        appendFileSync(process.env.UCI_DEBUG_LOG, logMessage);
      } catch (error) {
        // Ignore file logging errors
      }
    }
  }

  /**
   * Log message with context
   */
  log(message, level = 'debug') {
    this.debugLog(message, level);
  }

  /**
   * Execute local shell command
   */
  async execute(cmd, options = {}) {
    const startTime = Date.now();
    const timeout = options.timeout || this.timeout;
    const maxBuffer = options.maxBuffer || this.maxBuffer;

    this.log(`Executing local command: ${cmd}`);

    try {
      const { stdout, stderr } = await execAsync(cmd, { 
        timeout,
        maxBuffer,
        cwd: options.cwd || this.repoRoot
      });
      
      const duration = Date.now() - startTime;
      this.log(`Command completed in ${duration}ms`);
      
      if (stderr && this.debug) {
        this.log(`Command stderr: ${stderr.trim()}`);
      }
      
      return this.formatResult(true, stdout.trim(), stderr.trim());
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`Command failed after ${duration}ms: ${error.message}`, 'error');
      
      return this.formatResult(
        false, 
        error.stdout || '', 
        error.stderr || error.message,
        error.code || 1
      );
    }
  }

  /**
   * Execute SSH command through established connection
   */
  async executeSSH(sshCmd, host, command, options = {}) {
    const fullCmd = `${sshCmd} ${host} "${command}"`;
    const startTime = Date.now();
    const timeout = options.timeout || this.timeout;
    const maxBuffer = options.maxBuffer || this.maxBuffer;

    this.log(`Executing SSH command: ${command} on ${host}`);

    try {
      const { stdout, stderr } = await execAsync(fullCmd, { 
        timeout,
        maxBuffer
      });
      
      const duration = Date.now() - startTime;
      this.log(`SSH command completed in ${duration}ms`);
      
      if (stderr && this.debug) {
        this.log(`SSH stderr: ${stderr.trim()}`);
      }
      
      return { 
        success: true,
        stdout: stdout.trim(), 
        stderr: stderr.trim(),
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`SSH command failed after ${duration}ms: ${error.message}`, 'error');
      
      throw new Error(`SSH command failed: ${error.message}`);
    }
  }

  /**
   * Execute file upload via SCP
   */
  async uploadFile(scpCmd, host, localPath, remotePath, options = {}) {
    const resolvedLocalPath = path.isAbsolute(localPath) ? localPath : path.join(this.repoRoot, localPath);
    const fullCmd = `${scpCmd} -r "${resolvedLocalPath}" ${host}:"${remotePath}"`;
    const startTime = Date.now();
    const timeout = options.timeout || this.timeout;
    const maxBuffer = options.maxBuffer || this.maxBuffer;

    this.log(`Uploading file: ${resolvedLocalPath} -> ${host}:${remotePath}`);

    try {
      const { stdout, stderr } = await execAsync(fullCmd, { 
        timeout,
        maxBuffer
      });
      
      const duration = Date.now() - startTime;
      this.log(`File upload completed in ${duration}ms`);
      
      if (stderr && this.debug) {
        this.log(`SCP stderr: ${stderr.trim()}`);
      }
      
      return { 
        success: true,
        stdout: stdout.trim(), 
        stderr: stderr.trim(),
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`File upload failed after ${duration}ms: ${error.message}`, 'error');
      
      throw new Error(`SCP upload failed: ${error.message}`);
    }
  }

  /**
   * Execute Docker command with special handling
   */
  async executeDocker(cmd, options = {}) {
    const dockerCmd = cmd.startsWith('docker') ? cmd : `docker ${cmd}`;
    
    this.log(`Executing Docker command: ${dockerCmd}`);
    
    return this.execute(dockerCmd, {
      ...options,
      timeout: options.timeout || (this.timeout * 3) // Docker operations can be slower
    });
  }

  /**
   * Check if Docker image exists
   */
  async dockerImageExists(imageName) {
    this.log(`Checking if Docker image exists: ${imageName}`);
    
    const result = await this.executeDocker(`image inspect ${imageName}`, {
      timeout: 10000 // Quick check
    });
    
    return result.success;
  }

  /**
   * Build Docker image
   */
  async buildDockerImage(imageName, dockerfilePath = '.', options = {}) {
    const extraArgs = options.extraArgs || '';
    const buildCmd = `build ${extraArgs} -t ${imageName} ${dockerfilePath}`.replace(/\s+/g, ' ').trim();
    const buildOptions = {
      timeout: options.timeout || 300000, // 5 minutes for builds
      ...options
    };

    this.log(`Building Docker image: ${imageName} from ${dockerfilePath}${extraArgs ? ' with options: ' + extraArgs : ''}`);
    
    const result = await this.executeDocker(buildCmd, buildOptions);
    
    if (result.success) {
      this.log(`Docker image built successfully: ${imageName}`);
    } else {
      this.log(`Docker image build failed: ${result.stderr}`, 'error');
    }
    
    return result;
  }

  /**
   * Execute command with retry logic
   */
  async executeWithRetry(executeFunc, maxRetries = 3, backoffMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log(`Executing command (attempt ${attempt}/${maxRetries})`);
        return await executeFunc();
      } catch (error) {
        lastError = error;
        this.log(`Attempt ${attempt} failed: ${error.message}`, 'warn');
        
        if (attempt < maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt - 1); // Exponential backoff
          this.log(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }
    
    this.log(`All ${maxRetries} attempts failed`, 'error');
    throw lastError;
  }

  /**
   * Execute multiple commands in parallel
   */
  async executeParallel(commands, options = {}) {
    const maxConcurrency = options.maxConcurrency || 5;
    const results = [];
    
    this.log(`Executing ${commands.length} commands in parallel (max concurrency: ${maxConcurrency})`);
    
    // Process commands in batches
    for (let i = 0; i < commands.length; i += maxConcurrency) {
      const batch = commands.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(async (cmd, index) => {
        try {
          const result = await this.execute(cmd, options);
          return { index: i + index, command: cmd, result };
        } catch (error) {
          return { index: i + index, command: cmd, error };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Validate command before execution
   */
  validateCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') {
      throw new Error('Command must be a non-empty string');
    }
    
    if (cmd.trim().length === 0) {
      throw new Error('Command cannot be empty or whitespace');
    }
    
    // Add security checks for dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\/[^\/\s]*/,  // rm -rf /something
      />\s*\/dev\/sd[a-z]/,      // Writing to disk devices
      /mkfs\./,                  // Filesystem formatting
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        this.log(`Potentially dangerous command detected: ${cmd}`, 'warn');
        // Don't block, just warn
      }
    }
    
    return true;
  }

  /**
   * Format standardized result object
   */
  formatResult(success, stdout = '', stderr = '', code = 0) {
    return {
      success,
      stdout: stdout.toString().trim(),
      stderr: stderr.toString().trim(),
      code: success ? 0 : (code || 1),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format standardized error object
   */
  formatError(error, context = '') {
    const errorMessage = context ? `${context}: ${error.message}` : error.message;
    
    return {
      success: false,
      error: errorMessage,
      code: error.code || 1,
      timestamp: new Date().toISOString(),
      context
    };
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get command execution statistics
   */
  getStats() {
    return {
      timeout: this.timeout,
      maxBuffer: this.maxBuffer,
      debug: this.debug,
      repoRoot: this.repoRoot
    };
  }

  /**
   * Update configuration
   */
  configure(options = {}) {
    if (options.timeout !== undefined) this.timeout = options.timeout;
    if (options.maxBuffer !== undefined) this.maxBuffer = options.maxBuffer;
    if (options.debug !== undefined) this.debug = options.debug;
    if (options.repoRoot !== undefined) this.repoRoot = options.repoRoot;
    
    this.log(`Command runner reconfigured: ${JSON.stringify(this.getStats())}`);
  }
}