/**
 * Profile Manager - Device profile management and resolution
 * Handles device profile loading, authentication, and name resolution
 */

import { createLogger } from './logger.js';

export class ProfileManager {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.repoRoot = options.repoRoot;
    this.sshManager = options.sshManager;
    
    // Initialize unified logger
    this.logger = createLogger('ProfileManager', {
      debug: this.debug,
      verbose: options.verbose || false
    });
  }

  /**
   * Load device profile with authentication
   */
  async loadDeviceProfile(device, password, keyFile) {
    const profile = await this.loadProfile(device);
    
    // Add authentication options
    const deviceProfile = {
      ...profile,
      auth: {
        password,
        keyFile
      }
    };
    
    this.log(`Loaded device profile for ${device}: ${JSON.stringify(deviceProfile.connection)}`);
    return deviceProfile;
  }

  /**
   * Get device name from profile or device identifier
   */
  getDeviceName(device) {
    // If it's already a device name/profile name, return as-is
    if (typeof device === 'string' && device.match(/^[a-zA-Z]/)) {
      return device;
    }
    
    // If it's an IP address, use it as device name
    if (typeof device === 'string' && device.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return device.replace(/\./g, '-');
    }
    
    return device || 'unknown-device';
  }

  /**
   * Load target profile - delegates to SSHManager
   */
  async loadProfile(target) {
    if (!this.sshManager) {
      throw new Error('SSHManager not configured for ProfileManager');
    }
    return this.sshManager.loadProfile(target);
  }

  /**
   * Resolve device name from various input types
   */
  resolveDeviceName(deviceInput) {
    if (typeof deviceInput === 'object' && deviceInput.name) {
      return deviceInput.name;
    }
    
    if (typeof deviceInput === 'object' && deviceInput.device_name) {
      return deviceInput.device_name;
    }
    
    if (typeof deviceInput === 'object' && deviceInput.connection?.host) {
      return this.getDeviceName(deviceInput.connection.host);
    }
    
    return this.getDeviceName(deviceInput);
  }

  /**
   * Validate device profile structure
   */
  validateProfile(profile) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!profile) {
      validation.valid = false;
      validation.errors.push('Profile is null or undefined');
      return validation;
    }

    if (!profile.connection) {
      validation.valid = false;
      validation.errors.push('Profile missing connection configuration');
    } else {
      if (!profile.connection.host) {
        validation.valid = false;
        validation.errors.push('Profile missing connection host');
      }
      
      if (!profile.connection.username) {
        validation.warnings.push('Profile missing username, will default to root');
      }
    }

    if (!profile.name && !profile.device_name) {
      validation.warnings.push('Profile missing name/device_name, will use host');
    }

    return validation;
  }

  /**
   * Get all available device profiles
   */
  async getAvailableProfiles() {
    if (!this.sshManager) {
      throw new Error('SSHManager not configured for ProfileManager');
    }

    try {
      // This would typically read from a profiles directory
      // For now, return the known profiles
      const knownProfiles = ['qemu', 'gl', 'openwrt'];
      const profiles = [];

      for (const profileName of knownProfiles) {
        try {
          const profile = await this.loadProfile(profileName);
          profiles.push({
            name: profileName,
            ...profile
          });
        } catch (error) {
          this.log(`Warning: Could not load profile ${profileName}: ${error.message}`);
        }
      }

      return profiles;
    } catch (error) {
      this.log(`Error getting available profiles: ${error.message}`);
      return [];
    }
  }

  /**
   * Create device profile from connection parameters
   */
  createProfileFromConnection(host, options = {}) {
    const profile = {
      name: this.getDeviceName(host),
      device_name: this.getDeviceName(host),
      connection: {
        host,
        username: options.username || 'root',
        port: options.port || 22
      }
    };

    if (options.keyFile) {
      profile.connection.key_file = options.keyFile;
    }

    if (options.password !== undefined) {
      profile.auth = { password: options.password };
    }

    this.log(`Created profile from connection: ${JSON.stringify(profile)}`);
    return profile;
  }

  /**
   * Log debug messages using unified logger
   */
  log(message) {
    this.logger.debug(message);
  }

  /**
   * Get profile manager statistics
   */
  getStats() {
    return {
      hasSSHManager: !!this.sshManager,
      debug: this.debug,
      repoRoot: this.repoRoot
    };
  }
}