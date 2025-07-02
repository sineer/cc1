/**
 * Unified Logger - Consistent logging across all components
 * Provides structured logging with different levels and component prefixes
 */

export class Logger {
  constructor(component, options = {}) {
    this.component = component;
    this._debug = options.debug || false;
    this._verbose = options.verbose || false;
    this._silent = options.silent || false;
    this.prefix = `[${component}]`;
  }

  /**
   * Log an info message (always shown unless silent)
   */
  info(message) {
    if (!this._silent) {
      console.error(`${this.prefix} ${message}`);
    }
  }

  /**
   * Log a debug message (only shown if debug is enabled)
   */
  debug(message) {
    if (this._debug && !this._silent) {
      console.error(`${this.prefix} [DEBUG] ${message}`);
    }
  }

  /**
   * Log a verbose message (only shown if verbose is enabled)
   */
  verbose(message) {
    if (this._verbose && !this._silent) {
      console.error(`${this.prefix} [VERBOSE] ${message}`);
    }
  }

  /**
   * Log a warning message (always shown unless silent)
   */
  warn(message) {
    if (!this._silent) {
      console.error(`${this.prefix} [WARN] ${message}`);
    }
  }

  /**
   * Log an error message (always shown unless silent)
   */
  error(message) {
    if (!this._silent) {
      console.error(`${this.prefix} [ERROR] ${message}`);
    }
  }

  /**
   * Log a success message (always shown unless silent)
   */
  success(message) {
    if (!this._silent) {
      console.error(`${this.prefix} [SUCCESS] ${message}`);
    }
  }

  /**
   * Log with a custom level
   */
  log(level, message) {
    const levelMap = {
      info: this.info.bind(this),
      debug: this.debug.bind(this),
      verbose: this.verbose.bind(this),
      warn: this.warn.bind(this),
      error: this.error.bind(this),
      success: this.success.bind(this)
    };

    const logFunction = levelMap[level.toLowerCase()];
    if (logFunction) {
      logFunction(message);
    } else {
      this.info(`[${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Create a child logger with a sub-component name
   */
  child(subComponent) {
    return new Logger(`${this.component}:${subComponent}`, {
      debug: this._debug,
      verbose: this._verbose,
      silent: this._silent
    });
  }

  /**
   * Update logger configuration
   */
  configure(options = {}) {
    if (options.debug !== undefined) this._debug = options.debug;
    if (options.verbose !== undefined) this._verbose = options.verbose;
    if (options.silent !== undefined) this._silent = options.silent;
  }

  /**
   * Temporarily enable verbose logging for a scope
   */
  withVerbose(fn) {
    const originalVerbose = this._verbose;
    this._verbose = true;
    try {
      return fn();
    } finally {
      this._verbose = originalVerbose;
    }
  }

  /**
   * Temporarily enable debug logging for a scope
   */
  withDebug(fn) {
    const originalDebug = this._debug;
    this._debug = true;
    try {
      return fn();
    } finally {
      this._debug = originalDebug;
    }
  }

  /**
   * Get logger configuration
   */
  getConfig() {
    return {
      component: this.component,
      debug: this._debug,
      verbose: this._verbose,
      silent: this._silent
    };
  }

  /**
   * Create a formatted message with timing information
   */
  withTiming(startTime, message) {
    const duration = Date.now() - startTime;
    return `${message} (${duration}ms)`;
  }

  /**
   * Log with timing information
   */
  timedLog(level, startTime, message) {
    this.log(level, this.withTiming(startTime, message));
  }

  /**
   * Create a progress logger for multi-step operations
   */
  createProgress(total, operation = 'operation') {
    let current = 0;
    
    return {
      step: (message = '') => {
        current++;
        const percentage = Math.round((current / total) * 100);
        const progress = `[${current}/${total}] (${percentage}%)`;
        this.info(`${progress} ${operation}: ${message}`);
      },
      
      complete: (message = 'completed') => {
        this.success(`${operation} ${message} (${current}/${total} steps)`);
      }
    };
  }
}

/**
 * Create a logger instance for a component
 */
export function createLogger(component, options = {}) {
  return new Logger(component, options);
}

/**
 * Global logger configuration
 */
export const LoggerConfig = {
  // Default log level configuration
  levels: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4
  },

  // Component-specific configurations
  components: {},

  /**
   * Configure logging for a specific component
   */
  configure(component, options) {
    this.components[component] = { ...this.components[component], ...options };
  },

  /**
   * Get configuration for a component
   */
  getConfig(component) {
    return this.components[component] || {};
  }
};