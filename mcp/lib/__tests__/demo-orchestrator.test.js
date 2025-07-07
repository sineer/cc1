import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { DemoOrchestrator } from '../demo-orchestrator.js';

describe('DemoOrchestrator', () => {
  let orchestrator;
  let mockExec;
  let mockSpawn;

  beforeEach(() => {
    orchestrator = new DemoOrchestrator();
    
    // Mock child_process operations
    mockExec = vi.fn();
    mockSpawn = vi.fn();
    
    vi.doMock('child_process', () => ({
      exec: mockExec,
      spawn: mockSpawn
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Flag Handling', () => {
    it('should use --force flag instead of deprecated --no-confirm', async () => {
      // This test ensures the flag standardization fix is working
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Verify the command uses --force, not --no-confirm
        expect(cmd).toContain('--force');
        expect(cmd).not.toContain('--no-confirm');
        callback(null, { stdout: 'SUCCESS: Operation completed', stderr: '' });
      });

      await orchestrator.executeDeployment(mockConfig);
      
      expect(mockExec).toHaveBeenCalled();
    });

    it('should pass through --force flag to uci-config commands', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        force: true
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Should include --force in the actual uci-config command
        expect(cmd).toMatch(/uci-config.*--force/);
        callback(null, { stdout: 'SUCCESS', stderr: '' });
      });

      await orchestrator.executeRemoval(mockConfig);
      
      expect(mockExec).toHaveBeenCalled();
    });

    it('should handle --dry-run flag correctly', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        dryRun: true
      };

      mockExec.mockImplementation((cmd, callback) => {
        expect(cmd).toContain('--dry-run');
        callback(null, { stdout: 'DRY-RUN: Would execute', stderr: '' });
      });

      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.dryRun).toBe(true);
      expect(mockExec).toHaveBeenCalled();
    });

    it('should not mix --force and --dry-run inappropriately', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        force: true,
        dryRun: true
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Both flags should be present but handled correctly
        expect(cmd).toContain('--force');
        expect(cmd).toContain('--dry-run');
        callback(null, { stdout: 'DRY-RUN: Would force execute', stderr: '' });
      });

      await orchestrator.executeDeployment(mockConfig);
      
      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('Deployment Execution', () => {
    it('should execute actual deployments rather than simulations', async () => {
      // This test ensures we're not just simulating but actually deploying
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      let executedCommands = [];
      mockExec.mockImplementation((cmd, callback) => {
        executedCommands.push(cmd);
        
        // Should execute real SSH commands, not just echo statements
        expect(cmd).not.toContain('echo "Simulating');
        expect(cmd).not.toContain('echo "Would execute');
        
        // Should contain actual SSH execution
        expect(cmd).toMatch(/sshpass.*ssh.*uci-config/);
        
        callback(null, { stdout: 'SUCCESS: Configuration applied', stderr: '' });
      });

      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.success).toBe(true);
      expect(executedCommands.length).toBeGreaterThan(0);
      expect(executedCommands.some(cmd => cmd.includes('ssh'))).toBe(true);
    });

    it('should handle SSH connection failures gracefully', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('ssh: connect to host 192.168.11.2 port 22: Connection refused'));
      });

      await expect(orchestrator.executeDeployment(mockConfig)).rejects.toThrow('Connection refused');
    });

    it('should handle SSH authentication failures', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: 'wrong-password',
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { 
          stdout: '', 
          stderr: 'Permission denied (publickey,password)' 
        });
      });

      await expect(orchestrator.executeDeployment(mockConfig)).rejects.toThrow('Permission denied');
    });

    it('should properly handle empty passwords', async () => {
      // This tests the exact scenario that caused the ssh_askpass bug
      const mockConfig = {
        host: '192.168.11.2',
        password: '',  // Empty password
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Should use sshpass with empty password
        expect(cmd).toContain('sshpass -p ""');
        
        // Should disable SSH_ASKPASS to prevent askpass errors
        expect(cmd).toContain('SSH_ASKPASS=""');
        expect(cmd).toContain('DISPLAY=""');
        
        callback(null, { stdout: 'SUCCESS: Configuration applied', stderr: '' });
      });

      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.success).toBe(true);
    });
  });

  describe('ubispot Demo Workflow', () => {
    it('should execute complete ubispot deployment workflow', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'ubispot'
      };

      const executedSteps = [];
      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('snapshot')) {
          executedSteps.push('snapshot');
          callback(null, { stdout: 'Snapshot created successfully', stderr: '' });
        } else if (cmd.includes('remove')) {
          executedSteps.push('remove');
          callback(null, { stdout: 'Removed 17 sections', stderr: '' });
        } else if (cmd.includes('safe-merge')) {
          executedSteps.push('deploy');
          callback(null, { stdout: 'Applied 17 changes', stderr: '' });
        } else {
          callback(null, { stdout: 'SUCCESS', stderr: '' });
        }
      });

      const result = await orchestrator.runUbispotDemo(mockConfig);
      
      expect(result.success).toBe(true);
      expect(executedSteps).toContain('snapshot');
      expect(executedSteps).toContain('remove');
      expect(executedSteps).toContain('deploy');
    });

    it('should handle ubispot deployment failures', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'ubispot'
      };

      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('safe-merge')) {
          callback(new Error('MERGE ERROR: Configuration conflict detected'));
        } else {
          callback(null, { stdout: 'SUCCESS', stderr: '' });
        }
      });

      await expect(orchestrator.runUbispotDemo(mockConfig)).rejects.toThrow('Configuration conflict');
    });

    it('should generate correct ubispot configuration', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'ubispot',
        target: 'gl-mt3000'
      };

      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('safe-merge')) {
          // Should reference the correct target configuration
          expect(cmd).toContain('gl-mt3000');
          expect(cmd).toContain('ubispot');
        }
        callback(null, { stdout: 'SUCCESS', stderr: '' });
      });

      await orchestrator.runUbispotDemo(mockConfig);
      
      expect(mockExec).toHaveBeenCalled();
    });

    it('should support --no-deploy flag for analysis mode', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'ubispot',
        noDeploy: true
      };

      const executedSteps = [];
      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('snapshot')) {
          executedSteps.push('snapshot');
        } else if (cmd.includes('safe-merge')) {
          executedSteps.push('deploy');
        }
        callback(null, { stdout: 'SUCCESS', stderr: '' });
      });

      const result = await orchestrator.runUbispotDemo(mockConfig);
      
      expect(result.analysisMode).toBe(true);
      expect(executedSteps).toContain('snapshot');
      expect(executedSteps).not.toContain('deploy');
    });
  });

  describe('Cowboy Demo Workflow', () => {
    it('should execute cowboy snapshot and analysis workflow', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'cowboy'
      };

      const executedSteps = [];
      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('snapshot')) {
          executedSteps.push('snapshot');
          callback(null, { stdout: 'Snapshot created: baseline-cowboy-demo', stderr: '' });
        } else if (cmd.includes('compare')) {
          executedSteps.push('compare');
          callback(null, { stdout: 'Generated comparison', stderr: '' });
        } else if (cmd.includes('dashboard')) {
          executedSteps.push('dashboard');
          callback(null, { stdout: 'Dashboard updated', stderr: '' });
        } else {
          callback(null, { stdout: 'SUCCESS', stderr: '' });
        }
      });

      const result = await orchestrator.runCowboyDemo(mockConfig);
      
      expect(result.success).toBe(true);
      expect(executedSteps).toContain('snapshot');
      expect(executedSteps).toContain('compare');
      expect(executedSteps).toContain('dashboard');
    });

    it('should create baseline snapshot with correct naming', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'cowboy'
      };

      mockExec.mockImplementation((cmd, callback) => {
        if (cmd.includes('snapshot')) {
          expect(cmd).toContain('baseline-cowboy-demo');
        }
        callback(null, { stdout: 'SUCCESS', stderr: '' });
      });

      await orchestrator.runCowboyDemo(mockConfig);
      
      expect(mockExec).toHaveBeenCalled();
    });

    it('should handle cowboy demo without requiring actual changes', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'cowboy'
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'No changes detected', stderr: '' });
      });

      const result = await orchestrator.runCowboyDemo(mockConfig);
      
      expect(result.success).toBe(true);
      expect(result.changes).toBe(false);
    });
  });

  describe('SSH Command Construction', () => {
    it('should build correct SSH commands with proper options', () => {
      const config = {
        host: '192.168.11.2',
        username: 'root',
        password: '',
        port: 22
      };

      const command = orchestrator.buildSSHCommand(config, 'uci-config --version');
      
      expect(command).toContain('sshpass -p ""');
      expect(command).toContain('ssh -o StrictHostKeyChecking=no');
      expect(command).toContain('-o UserKnownHostsFile=/dev/null');
      expect(command).toContain('-o LogLevel=ERROR');
      expect(command).toContain('-o PasswordAuthentication=yes');
      expect(command).toContain('-o PreferredAuthentications=password');
      expect(command).toContain('-o PubkeyAuthentication=no');
      expect(command).toContain('root@192.168.11.2');
      expect(command).toContain('uci-config --version');
    });

    it('should handle SSH key authentication correctly', () => {
      const config = {
        host: '192.168.11.2',
        username: 'root',
        keyFile: '/path/to/key.pem'
      };

      const command = orchestrator.buildSSHCommand(config, 'uci-config --version');
      
      expect(command).toContain('ssh -i /path/to/key.pem');
      expect(command).not.toContain('sshpass');
      expect(command).not.toContain('PasswordAuthentication=yes');
      expect(command).toContain('root@192.168.11.2');
    });

    it('should properly escape shell commands', () => {
      const config = {
        host: '192.168.11.2',
        username: 'root',
        password: 'pass"word'
      };

      const command = orchestrator.buildSSHCommand(config, 'echo "test"');
      
      expect(command).toContain('sshpass -p "pass\\"word"');
      expect(command).toContain('"echo \\"test\\""');
    });

    it('should handle custom SSH ports', () => {
      const config = {
        host: '192.168.11.2',
        username: 'root',
        password: '',
        port: 2222
      };

      const command = orchestrator.buildSSHCommand(config, 'uci-config --version');
      
      expect(command).toContain('ssh -p 2222');
    });

    it('should set up proper environment variables', () => {
      const config = {
        host: '192.168.11.2',
        username: 'root',
        password: ''
      };

      const command = orchestrator.buildSSHCommand(config, 'uci-config --version');
      
      // Should disable SSH_ASKPASS to prevent askpass errors
      expect(command).toContain('SSH_ASKPASS=""');
      expect(command).toContain('DISPLAY=""');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('ssh: connect to host 192.168.11.2 port 22: Operation timed out'));
      });

      await expect(orchestrator.executeDeployment(mockConfig)).rejects.toThrow('Operation timed out');
    });

    it('should handle UCI configuration errors', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { 
          stdout: '', 
          stderr: 'ERROR: Target configuration not found: default' 
        });
      });

      await expect(orchestrator.executeDeployment(mockConfig)).rejects.toThrow('Target configuration not found');
    });

    it('should handle partial deployment failures', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        demo: 'ubispot'
      };

      let stepCount = 0;
      mockExec.mockImplementation((cmd, callback) => {
        stepCount++;
        if (stepCount === 2) {
          // Second step fails
          callback(new Error('MERGE ERROR: Configuration conflict'));
        } else {
          callback(null, { stdout: 'SUCCESS', stderr: '' });
        }
      });

      const result = await orchestrator.runUbispotDemo(mockConfig).catch(err => ({ error: err.message }));
      
      expect(result.error).toContain('Configuration conflict');
    });

    it('should validate configuration before deployment', async () => {
      const invalidConfigs = [
        { host: '', password: '' },  // Empty host
        { host: '192.168.11.2', password: '', target: '' },  // Empty target
        { host: '192.168.11.2' },  // No auth method
        { host: '192.168.11.2', password: '', port: 'invalid' }  // Invalid port
      ];

      for (const config of invalidConfigs) {
        await expect(orchestrator.executeDeployment(config)).rejects.toThrow();
      }
    });

    it('should handle SSH connection recovery', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        retryCount: 3
      };

      let attemptCount = 0;
      mockExec.mockImplementation((cmd, callback) => {
        attemptCount++;
        if (attemptCount < 3) {
          callback(new Error('ssh: connect to host 192.168.11.2 port 22: Connection refused'));
        } else {
          callback(null, { stdout: 'SUCCESS: Configuration applied', stderr: '' });
        }
      });

      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large configuration deployments efficiently', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'large-config'
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Simulate large configuration deployment
        setTimeout(() => {
          callback(null, { stdout: 'Applied 1000 changes', stderr: '' });
        }, 100);
      });

      const startTime = Date.now();
      const result = await orchestrator.executeDeployment(mockConfig);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle multiple concurrent deployments', async () => {
      const configs = Array.from({ length: 5 }, (_, i) => ({
        host: `192.168.11.${i + 2}`,
        password: '',
        target: 'default'
      }));

      mockExec.mockImplementation((cmd, callback) => {
        setTimeout(() => {
          callback(null, { stdout: 'SUCCESS', stderr: '' });
        }, Math.random() * 100);
      });

      const promises = configs.map(config => orchestrator.executeDeployment(config));
      const results = await Promise.all(promises);
      
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should cleanup resources after deployment', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default'
      };

      const cleanupSpy = vi.spyOn(orchestrator, 'cleanup');
      
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'SUCCESS', stderr: '' });
      });

      await orchestrator.executeDeployment(mockConfig);
      
      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Integration with MCP Tools', () => {
    it('should integrate with MCP test tool correctly', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        mcpIntegration: true
      };

      mockExec.mockImplementation((cmd, callback) => {
        // Should use MCP-compatible command format
        expect(cmd).toMatch(/mcp.*test.*192\.168\.11\.2/);
        callback(null, { stdout: 'MCP test completed successfully', stderr: '' });
      });

      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.success).toBe(true);
      expect(result.mcpIntegrated).toBe(true);
    });

    it('should handle MCP tool failures gracefully', async () => {
      const mockConfig = {
        host: '192.168.11.2',
        password: '',
        target: 'default',
        mcpIntegration: true
      };

      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('MCP tool not available'));
      });

      // Should fall back to direct execution
      const result = await orchestrator.executeDeployment(mockConfig);
      
      expect(result.fallbackMode).toBe(true);
    });
  });
});

// Helper function to create mock snapshots
function createMockSnapshot(id, label) {
  return {
    id,
    label,
    timestamp: new Date().toISOString(),
    path: `/tmp/snapshots/${id}`,
    metadata: { deviceName: 'Test Device' }
  };
}

// Helper function to create mock diff result
function createMockDiffResult(added, removed, modified) {
  return {
    uci_diff: {
      packages: {
        test: {
          status: 'modified',
          sections: {
            added_section: { status: 'added' },
            removed_section: { status: 'removed' },
            modified_section: { status: 'modified' }
          }
        }
      }
    },
    statistics: {
      total_changes: added + removed + modified,
      sections_added: added,
      sections_removed: removed,
      options_changed: modified
    }
  };
}