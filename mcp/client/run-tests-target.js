#!/usr/bin/env node

/**
 * MCP Client for Target Device Testing
 * Interfaces with the MCP server to run tests on real target devices
 */

import { CustomMCPClient } from './custom-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

class TargetTestClient {
  constructor() {
    this.client = new CustomMCPClient();
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.disconnect();
  }

  /**
   * Display usage information
   */
  showUsage() {
    console.log(`
UCI Configuration Target Test Runner (MCP Client)

USAGE:
  ${process.argv[1]} <command> [options]

COMMANDS:
  run <target> [test-file]    Run tests on target device
  list                        List available target profiles  
  validate <target>           Validate target profile and connectivity
  help                        Show this help message

TARGET FORMATS:
  gl                          Use predefined GL-iNet profile
  openwrt                     Use generic OpenWRT profile  
  192.168.1.1                 Direct IP connection
  custom                      Use custom profile (targets/custom.json)

OPTIONS:
  --verbose, -v               Enable verbose output
  --dry-run, -d               Perform dry run without making changes
  --help, -h                  Show help message

EXAMPLES:
  # Run production tests on GL router
  ${process.argv[1]} run gl

  # Run specific test with verbose output
  ${process.argv[1]} run gl test_production_deployment.lua --verbose

  # Test direct IP connection
  ${process.argv[1]} run 192.168.1.1 --dry-run

  # Validate connectivity to device
  ${process.argv[1]} validate gl

  # List all available profiles
  ${process.argv[1]} list

SAFETY FEATURES:
  - Automatic configuration backup before testing
  - Network connectivity monitoring during tests
  - Automatic rollback on failure or connectivity loss
  - Dry-run mode for safe validation
  - Device profile validation and compatibility checks

REQUIREMENTS:
  - SSH access to target device
  - UCI tools available on target
  - Network connectivity to device
  - Proper device profile configuration

For more information, see targets/README.md
`);
  }

  /**
   * Parse command line arguments
   */
  parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
      command: null,
      target: null,
      testFile: null,
      verbose: false,
      dryRun: false,
      help: false
    };

    let i = 0;
    while (i < args.length) {
      const arg = args[i];

      switch (arg) {
        case 'help':
        case '--help':
        case '-h':
          parsed.help = true;
          return parsed;

        case 'run':
          parsed.command = 'run';
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            parsed.target = args[i + 1];
            i++;
          }
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            parsed.testFile = args[i + 1];
            i++;
          }
          break;

        case 'list':
          parsed.command = 'list';
          break;

        case 'validate':
          parsed.command = 'validate';
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            parsed.target = args[i + 1];
            i++;
          }
          break;

        case '--verbose':
        case '-v':
          parsed.verbose = true;
          break;

        case '--dry-run':
        case '-d':
          parsed.dryRun = true;
          break;

        default:
          if (!parsed.command) {
            console.error(`Unknown command: ${arg}`);
            process.exit(1);
          }
          break;
      }
      i++;
    }

    return parsed;
  }

  /**
   * Validate arguments
   */
  validateArgs(args) {
    if (args.help) {
      this.showUsage();
      process.exit(0);
    }

    if (!args.command) {
      console.error('❌ No command specified');
      this.showUsage();
      process.exit(1);
    }

    if ((args.command === 'run' || args.command === 'validate') && !args.target) {
      console.error('❌ Target parameter required');
      this.showUsage();
      process.exit(1);
    }

    return true;
  }

  /**
   * Execute run command
   */
  async executeRun(args) {
    try {
      console.log(`🚀 Starting target test execution...`);
      console.log(`   Target: ${args.target}`);
      console.log(`   Test: ${args.testFile || 'test_production_deployment.lua'}`);
      
      if (args.dryRun) {
        console.log(`   Mode: DRY RUN (no changes will be made)`);
      }
      
      console.log('');

      const result = await this.client.callTool('run_target_tests', {
        target: args.target,
        test_file: args.testFile,
        verbose: args.verbose,
        dry_run: args.dryRun
      });

      if (result && result.content && result.content[0]) {
        console.log(result.content[0].text);
      } else {
        console.log('✅ Test completed (no output)');
      }

    } catch (error) {
      console.error(`❌ Target test execution failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Execute list command
   */
  async executeList(args) {
    try {
      console.log('📋 Listing available target profiles...\n');

      const result = await this.client.callTool('list_target_profiles');

      if (result && result.content && result.content[0]) {
        console.log(result.content[0].text);
      } else {
        console.log('No target profiles found');
      }

    } catch (error) {
      console.error(`❌ Failed to list profiles: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Execute validate command
   */
  async executeValidate(args) {
    try {
      console.log(`🔍 Validating target profile: ${args.target}\n`);

      const result = await this.client.callTool('validate_target_profile', {
        target: args.target
      });

      if (result && result.content && result.content[0]) {
        console.log(result.content[0].text);
      } else {
        console.log('✅ Validation completed');
      }

    } catch (error) {
      console.error(`❌ Profile validation failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Main execution function
   */
  async run() {
    try {
      const args = this.parseArgs();
      this.validateArgs(args);

      // Connect to MCP server
      await this.connect();

      // Execute command
      switch (args.command) {
        case 'run':
          await this.executeRun(args);
          break;
        case 'list':
          await this.executeList(args);
          break;
        case 'validate':
          await this.executeValidate(args);
          break;
        default:
          console.error(`❌ Unknown command: ${args.command}`);
          process.exit(1);
      }

    } catch (error) {
      console.error(`❌ Client execution failed: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new TargetTestClient();
  
  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('\n🛑 Interrupted by user');
    await client.disconnect();
    process.exit(130);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Terminated');
    await client.disconnect();
    process.exit(143);
  });

  client.run().catch(error => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
  });
}

export { TargetTestClient };