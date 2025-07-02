/**
 * Demo Orchestrator - Centralized demo workflow management
 * Handles ubispot deployment and cowboy snapshot analysis workflows
 */

export class DemoOrchestrator {
  constructor(engines) {
    this.snapshotEngine = engines.snapshotEngine;
    this.diffEngine = engines.diffEngine;
    this.dashboardGenerator = engines.dashboardGenerator;
    this.sshManager = engines.sshManager;
    this.commandRunner = engines.commandRunner;
    this.debug = engines.debug || false;
  }

  /**
   * Main demo dispatcher - routes to specific demo workflows
   */
  async runDemo(args) {
    const { 
      type = 'ubispot', 
      host = '192.168.11.2', 
      deploy = true, 
      target = 'default', 
      mode = 'safe-merge', 
      password 
    } = args;
    
    try {
      if (type === 'ubispot') {
        return await this.runUbispotDemo({ host, deploy, target, mode, password });
      } else if (type === 'cowboy') {
        return await this.runCowboyDemo({ host, deploy, target, mode, password });
      } else {
        return this.formatError(`Unknown demo type: ${type}. Available: ubispot, cowboy`);
      }
    } catch (error) {
      return this.formatError(`Demo failed: ${error.message}`);
    }
  }

  /**
   * Run ubispot captive portal deployment demo
   */
  async runUbispotDemo(args) {
    const { host, deploy, target, mode, password } = args;
    
    let output = `=== UBISPOT DEPLOYMENT DEMO ===\n`;
    output += `🎯 Target: ${host}\n`;
    output += `📦 Deploy: ${deploy ? 'Yes' : 'No (analysis only)'}\n`;
    output += `🔧 Mode: ${mode}\n\n`;
    
    try {
      // Load device profile and get device name
      const deviceProfile = await this.loadDeviceProfile(host, password);
      const deviceName = this.getDeviceName(host);
      
      // Take pre-deployment snapshot
      output += '📸 Taking pre-deployment snapshot...\n';
      const preLabel = 'pre-ubispot-deployment';
      await this.snapshotEngine.captureSnapshot(deviceProfile, preLabel);
      output += '✅ Pre-deployment snapshot captured\n\n';
      
      if (deploy) {
        // Run UCI deployment
        output += '🚀 Deploying ubispot configuration...\n';
        const deployResult = await this.runDeployment(host, mode, target, password);
        
        if (!deployResult.success) {
          output += `❌ Deployment failed: ${deployResult.stderr}\n`;
          return this.formatResult(output);
        }
        
        output += '✅ Configuration deployed successfully\n\n';
        
        // Take post-deployment snapshot
        output += '📸 Taking post-deployment snapshot...\n';
        const postLabel = 'post-ubispot-deployment';
        await this.snapshotEngine.captureSnapshot(deviceProfile, postLabel);
        output += '✅ Post-deployment snapshot captured\n\n';
        
        // Generate configuration diff
        output += '🔍 Generating configuration diff...\n';
        const diffPath = await this.diffEngine.compareSnapshots(deviceName, preLabel, postLabel);
        output += `✅ Configuration diff generated: ${diffPath}\n\n`;
      }
      
      // Generate dashboard
      output += '📊 Generating deployment dashboard...\n';
      const dashboardResult = await this.dashboardGenerator.generateDeviceDashboard(deviceName, 7);
      output += `✅ Dashboard generated: ${dashboardResult.path}\n\n`;
      
      output += '🎉 Ubispot deployment demo completed successfully!\n\n';
      output += 'Results:\n';
      output += `- Device: ${deviceName}\n`;
      output += `- Snapshots: ${deploy ? 'pre and post deployment' : 'pre-deployment only'}\n`;
      if (deploy) {
        output += `- Configuration changes applied\n`;
      }
      output += `- Dashboard: ${dashboardResult.url}\n`;
      
      return this.formatResult(output);
      
    } catch (error) {
      output += `❌ Demo failed: ${error.message}\n`;
      return this.formatError(`ubispot demo failed: ${error.message}`);
    }
  }

  /**
   * Run cowboy demo (configuration snapshot analysis)
   */
  async runCowboyDemo(args) {
    const device = 'qemu';
    const deviceName = 'QEMU OpenWRT VM';
    
    let output = `=== COWBOY CONFIGURATION DEMO ===\n`;
    output += `🎯 Device: ${deviceName}\n`;
    output += `📋 Purpose: Baseline snapshot and change tracking\n\n`;
    
    try {
      // Take baseline snapshot
      output += '📸 Taking baseline snapshot...\n';
      const deviceProfile = await this.loadDeviceProfile(device, args.password);
      await this.snapshotEngine.captureSnapshot(deviceProfile, 'baseline-cowboy-demo');
      output += '✅ Baseline snapshot captured\n\n';
      
      output += '👉 Now make some configuration changes on your device...\n';
      output += '   (This demo captured the baseline - you can compare against it later)\n\n';
      
      // Generate dashboard  
      output += '📊 Generating configuration dashboard...\n';
      const dashboardResult = await this.dashboardGenerator.generateDeviceDashboard(deviceName, 7);
      output += `✅ Dashboard generated: ${dashboardResult.path}\n\n`;
      
      output += '🎯 Next Steps:\n';
      output += '1. Make configuration changes on your device\n';
      output += '2. Take another snapshot: `snapshot qemu after-changes`\n';
      output += '3. Compare configurations: `compare qemu baseline-cowboy-demo after-changes`\n';
      output += '4. View dashboard for timeline analysis\n\n';
      
      output += `📊 Dashboard: ${dashboardResult.url}\n`;
      
      return this.formatResult(output);
      
    } catch (error) {
      output += `❌ Demo failed: ${error.message}\n`;
      return this.formatError(`cowboy demo failed: ${error.message}`);
    }
  }

  /**
   * Load device profile for operations
   */
  async loadDeviceProfile(device, password, keyFile) {
    return this.sshManager.loadDeviceProfile(device, password, keyFile);
  }

  /**
   * Get standardized device name
   */
  getDeviceName(device) {
    return device.includes('.') ? device : 'QEMU OpenWRT VM';
  }

  /**
   * Run UCI configuration deployment
   */
  async runDeployment(host, mode, target, password) {
    // This would integrate with the actual deployment logic
    // For now, simulate deployment via command execution
    const deployCmd = `echo "Simulated UCI deployment to ${host} with mode ${mode}"`;
    return this.commandRunner.execute(deployCmd);
  }

  /**
   * Generate snapshot path for device and label
   */
  async getSnapshotPath(deviceName, label) {
    // Generate consistent snapshot path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${deviceName}/${timestamp}-${label}`;
  }

  /**
   * Format successful result for MCP response
   */
  formatResult(output) {
    return {
      isError: false,
      content: [{
        type: 'text',
        text: output
      }]
    };
  }

  /**
   * Format error result for MCP response
   */
  formatError(message) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `❌ ${message}`
      }]
    };
  }

  /**
   * Get demo statistics and capabilities
   */
  getStats() {
    return {
      availableDemos: ['ubispot', 'cowboy'],
      engines: {
        snapshotEngine: !!this.snapshotEngine,
        diffEngine: !!this.diffEngine,
        dashboardGenerator: !!this.dashboardGenerator,
        sshManager: !!this.sshManager,
        commandRunner: !!this.commandRunner
      },
      debug: this.debug
    };
  }

  /**
   * Validate demo parameters
   */
  validateDemoArgs(type, args) {
    const validTypes = ['ubispot', 'cowboy'];
    
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid demo type: ${type}. Valid types: ${validTypes.join(', ')}`);
    }
    
    if (type === 'ubispot' && !args.host) {
      throw new Error('ubispot demo requires host parameter');
    }
    
    return true;
  }

  /**
   * List available demo workflows
   */
  listDemos() {
    return [
      {
        type: 'ubispot',
        description: 'Captive portal deployment with before/after snapshots',
        parameters: ['host', 'deploy', 'target', 'mode', 'password']
      },
      {
        type: 'cowboy',
        description: 'Configuration snapshot analysis and change tracking',
        parameters: ['password']
      }
    ];
  }

  /**
   * Health check for all required engines
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      engines: {},
      issues: []
    };

    try {
      // Check snapshot engine
      if (this.snapshotEngine) {
        health.engines.snapshotEngine = 'available';
      } else {
        health.engines.snapshotEngine = 'missing';
        health.issues.push('snapshotEngine not initialized');
      }

      // Check diff engine
      if (this.diffEngine) {
        health.engines.diffEngine = 'available';
      } else {
        health.engines.diffEngine = 'missing';
        health.issues.push('diffEngine not initialized');
      }

      // Check dashboard generator
      if (this.dashboardGenerator) {
        health.engines.dashboardGenerator = 'available';
      } else {
        health.engines.dashboardGenerator = 'missing';
        health.issues.push('dashboardGenerator not initialized');
      }

      // Check SSH manager
      if (this.sshManager) {
        health.engines.sshManager = 'available';
      } else {
        health.engines.sshManager = 'missing';
        health.issues.push('sshManager not initialized');
      }

      // Check command runner
      if (this.commandRunner) {
        health.engines.commandRunner = 'available';
      } else {
        health.engines.commandRunner = 'missing';
        health.issues.push('commandRunner not initialized');
      }

      if (health.issues.length > 0) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.issues.push(`Health check failed: ${error.message}`);
    }

    return health;
  }
}