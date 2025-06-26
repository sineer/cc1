#!/usr/bin/env node

/**
 * Network Monitor for Target Device Testing
 * Monitors connectivity and network status during test execution
 * Triggers rollback if critical network issues are detected
 */

import { EventEmitter } from 'events';

class NetworkMonitor extends EventEmitter {
  constructor(sshConnection, networkConfig = {}) {
    super();
    
    this.ssh = sshConnection;
    this.config = {
      management_interface: networkConfig.management_interface || 'lan',
      management_ip: networkConfig.management_ip || '192.168.1.1',
      management_subnet: networkConfig.management_subnet || '192.168.1.0/24',
      preserve_interfaces: networkConfig.preserve_interfaces || ['lan', 'br-lan'],
      critical_services: networkConfig.critical_services || ['dropbear', 'uhttpd'],
      check_interval: networkConfig.connectivity_check_interval || 30,
      failure_threshold: networkConfig.failure_threshold || 3,
      ...networkConfig
    };

    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.consecutiveFailures = 0;
    this.lastSuccessfulCheck = null;
    this.initialNetworkState = null;
    this.networkHistory = [];
  }

  /**
   * Start network monitoring
   */
  async start() {
    try {
      if (this.isMonitoring) {
        return true;
      }

      // Capture initial network state
      this.initialNetworkState = await this.captureNetworkState();
      this.lastSuccessfulCheck = Date.now();

      // Start monitoring loop
      this.isMonitoring = true;
      this.monitoringInterval = setInterval(
        () => this.performConnectivityCheck(),
        this.config.check_interval * 1000
      );

      this.emit('monitoring_started', {
        timestamp: new Date().toISOString(),
        initial_state: this.initialNetworkState
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to start network monitoring: ${error.message}`);
    }
  }

  /**
   * Stop network monitoring
   */
  async stop() {
    if (!this.isMonitoring) {
      return true;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring_stopped', {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.lastSuccessfulCheck,
      total_checks: this.networkHistory.length
    });

    return true;
  }

  /**
   * Capture comprehensive network state
   */
  async captureNetworkState() {
    try {
      const commands = {
        interfaces: "ip link show | grep -E '^[0-9]+:' | awk '{print $2}' | sed 's/:$//'",
        ip_addresses: "ip addr show | grep -E 'inet ' | grep -v 127.0.0.1",
        routing_table: "ip route show",
        arp_table: "ip neigh show",
        network_config: "uci show network 2>/dev/null || echo 'UCI network not available'",
        firewall_status: "uci show firewall 2>/dev/null || echo 'UCI firewall not available'",
        running_services: "ps | grep -E '(dropbear|uhttpd|dnsmasq)' | grep -v grep",
        interface_stats: `cat /proc/net/dev | grep -E '(${this.config.preserve_interfaces.join('|')})'`
      };

      const state = {};
      
      for (const [key, command] of Object.entries(commands)) {
        try {
          const result = await this.ssh.execute(command, { timeout: 10000 });
          state[key] = result.stdout.trim();
        } catch (error) {
          state[key] = `Error: ${error.message}`;
        }
      }

      state.timestamp = new Date().toISOString();
      state.management_ip = this.config.management_ip;
      state.management_interface = this.config.management_interface;

      return state;
    } catch (error) {
      throw new Error(`Network state capture failed: ${error.message}`);
    }
  }

  /**
   * Perform connectivity check
   */
  async performConnectivityCheck() {
    try {
      const checkStart = Date.now();
      
      // Basic connectivity test
      const pingResult = await this.ssh.execute('echo "CONNECTIVITY_OK"', { timeout: 5000 });
      
      if (!pingResult.success || !pingResult.stdout.includes('CONNECTIVITY_OK')) {
        await this.handleConnectivityFailure('Basic connectivity failed');
        return;
      }

      // Check critical services
      const servicesOk = await this.checkCriticalServices();
      if (!servicesOk) {
        await this.handleConnectivityFailure('Critical services not running');
        return;
      }

      // Check network interfaces
      const interfacesOk = await this.checkNetworkInterfaces();
      if (!interfacesOk) {
        await this.handleConnectivityFailure('Network interfaces changed');
        return;
      }

      // Success - reset failure counter
      this.consecutiveFailures = 0;
      this.lastSuccessfulCheck = Date.now();

      const checkResult = {
        timestamp: new Date().toISOString(),
        duration: Date.now() - checkStart,
        status: 'success',
        consecutive_failures: this.consecutiveFailures
      };

      this.networkHistory.push(checkResult);
      
      this.emit('connectivity_check', checkResult);

    } catch (error) {
      await this.handleConnectivityFailure(`Connectivity check error: ${error.message}`);
    }
  }

  /**
   * Check if critical services are running
   */
  async checkCriticalServices() {
    try {
      for (const service of this.config.critical_services) {
        const result = await this.ssh.execute(`pgrep ${service}`, { timeout: 5000 });
        if (!result.success || !result.stdout.trim()) {
          this.emit('service_warning', {
            service: service,
            status: 'not_running',
            timestamp: new Date().toISOString()
          });
          return false;
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check network interfaces status
   */
  async checkNetworkInterfaces() {
    try {
      // Check if preserved interfaces are still up
      for (const iface of this.config.preserve_interfaces) {
        const result = await this.ssh.execute(`ip link show ${iface} | grep -E 'state UP|state UNKNOWN'`, { timeout: 5000 });
        if (!result.success) {
          this.emit('interface_warning', {
            interface: iface,
            status: 'down_or_missing',
            timestamp: new Date().toISOString()
          });
          return false;
        }
      }

      // Check management IP is still assigned
      const ipResult = await this.ssh.execute(`ip addr show | grep ${this.config.management_ip}`, { timeout: 5000 });
      if (!ipResult.success || !ipResult.stdout.includes(this.config.management_ip)) {
        this.emit('ip_warning', {
          expected_ip: this.config.management_ip,
          status: 'not_assigned',
          timestamp: new Date().toISOString()
        });
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle connectivity failure
   */
  async handleConnectivityFailure(reason) {
    this.consecutiveFailures++;
    
    const failureEvent = {
      timestamp: new Date().toISOString(),
      reason: reason,
      consecutive_failures: this.consecutiveFailures,
      threshold: this.config.failure_threshold
    };

    this.networkHistory.push({
      ...failureEvent,
      status: 'failure'
    });

    this.emit('connectivity_failure', failureEvent);

    // Trigger emergency rollback if threshold exceeded
    if (this.consecutiveFailures >= this.config.failure_threshold) {
      await this.triggerEmergencyRollback(reason);
    }
  }

  /**
   * Trigger emergency rollback due to network issues
   */
  async triggerEmergencyRollback(reason) {
    const emergencyEvent = {
      timestamp: new Date().toISOString(),
      reason: reason,
      consecutive_failures: this.consecutiveFailures,
      action: 'emergency_rollback_triggered'
    };

    this.emit('emergency_rollback', emergencyEvent);

    // Note: The actual rollback is handled by the caller (TargetDeviceRunner)
    // This just signals that rollback should be triggered
  }

  /**
   * Get network monitoring statistics
   */
  getMonitoringStats() {
    const totalChecks = this.networkHistory.length;
    const successfulChecks = this.networkHistory.filter(check => check.status === 'success').length;
    const failedChecks = totalChecks - successfulChecks;

    return {
      is_monitoring: this.isMonitoring,
      total_checks: totalChecks,
      successful_checks: successfulChecks,
      failed_checks: failedChecks,
      consecutive_failures: this.consecutiveFailures,
      last_successful_check: this.lastSuccessfulCheck ? new Date(this.lastSuccessfulCheck).toISOString() : null,
      uptime_percentage: totalChecks > 0 ? ((successfulChecks / totalChecks) * 100).toFixed(2) : 0,
      monitoring_duration: this.lastSuccessfulCheck ? Date.now() - this.lastSuccessfulCheck : 0,
      config: this.config
    };
  }

  /**
   * Compare current state with initial state
   */
  async compareWithInitialState() {
    try {
      if (!this.initialNetworkState) {
        throw new Error('No initial network state captured');
      }

      const currentState = await this.captureNetworkState();
      
      const comparison = {
        timestamp: new Date().toISOString(),
        changes: [],
        warnings: [],
        critical_changes: []
      };

      // Compare interfaces
      if (currentState.interfaces !== this.initialNetworkState.interfaces) {
        comparison.changes.push({
          type: 'interfaces',
          initial: this.initialNetworkState.interfaces,
          current: currentState.interfaces
        });
      }

      // Compare IP addresses  
      if (currentState.ip_addresses !== this.initialNetworkState.ip_addresses) {
        comparison.changes.push({
          type: 'ip_addresses',
          initial: this.initialNetworkState.ip_addresses,
          current: currentState.ip_addresses
        });
      }

      // Check for critical changes that might affect connectivity
      for (const preservedInterface of this.config.preserve_interfaces) {
        if (!currentState.interfaces.includes(preservedInterface)) {
          comparison.critical_changes.push({
            type: 'missing_interface',
            interface: preservedInterface,
            severity: 'critical'
          });
        }
      }

      return comparison;
    } catch (error) {
      throw new Error(`State comparison failed: ${error.message}`);
    }
  }

  /**
   * Export monitoring history
   */
  exportHistory() {
    return {
      initial_state: this.initialNetworkState,
      monitoring_history: this.networkHistory,
      stats: this.getMonitoringStats(),
      export_timestamp: new Date().toISOString()
    };
  }
}

export { NetworkMonitor };