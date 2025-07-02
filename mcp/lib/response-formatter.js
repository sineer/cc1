/**
 * Response Formatter - Standardized MCP response formatting
 * Handles consistent response formatting for all MCP tools
 */

export class ResponseFormatter {
  constructor(options = {}) {
    this.includeTimestamp = options.includeTimestamp || false;
    this.debug = options.debug || false;
  }

  /**
   * Format successful result for MCP response
   */
  formatResult(text, metadata = {}) {
    const response = {
      content: [{
        type: 'text',
        text: this.includeTimestamp ? this.addTimestamp(text) : text,
      }],
    };

    if (metadata && Object.keys(metadata).length > 0) {
      response.metadata = metadata;
    }

    if (this.debug) {
      console.error(`[ResponseFormatter] Success: ${text.substring(0, 100)}...`);
    }

    return response;
  }

  /**
   * Format error result for MCP response
   */
  formatError(message, errorCode = null, details = {}) {
    const errorText = `❌ Error: ${message}`;
    
    const response = {
      content: [{
        type: 'text',
        text: this.includeTimestamp ? this.addTimestamp(errorText) : errorText,
      }],
    };

    if (errorCode) {
      response.errorCode = errorCode;
    }

    if (details && Object.keys(details).length > 0) {
      response.errorDetails = details;
    }

    if (this.debug) {
      console.error(`[ResponseFormatter] Error: ${message}`);
    }

    return response;
  }

  /**
   * Format success with structured data
   */
  formatStructuredResult(text, data = null, format = 'text') {
    const content = [{
      type: 'text',
      text: this.includeTimestamp ? this.addTimestamp(text) : text,
    }];

    if (data) {
      content.push({
        type: format === 'json' ? 'json' : 'text',
        [format === 'json' ? 'data' : 'text']: format === 'json' ? data : JSON.stringify(data, null, 2)
      });
    }

    return { content };
  }

  /**
   * Format validation error
   */
  formatValidationError(field, message, value = null) {
    const errorText = `❌ Validation Error: ${field} - ${message}`;
    const details = { field, message };
    
    if (value !== null) {
      details.providedValue = value;
    }

    return this.formatError(errorText, 'VALIDATION_ERROR', details);
  }

  /**
   * Format operation status with progress
   */
  formatProgress(operation, step, total, message = '') {
    const progressText = `🔄 ${operation} - Step ${step}/${total}${message ? ': ' + message : ''}`;
    
    return this.formatResult(progressText, {
      operation,
      step,
      total,
      progress: Math.round((step / total) * 100)
    });
  }

  /**
   * Add timestamp to text
   */
  addTimestamp(text) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${text}`;
  }

  /**
   * Format list of items
   */
  formatList(title, items, numbered = true) {
    let output = `${title}\n\n`;
    
    items.forEach((item, index) => {
      const prefix = numbered ? `${index + 1}. ` : '• ';
      output += `${prefix}${item}\n`;
    });

    return this.formatResult(output);
  }

  /**
   * Format key-value pairs
   */
  formatKeyValuePairs(title, pairs) {
    let output = `${title}\n\n`;
    
    Object.entries(pairs).forEach(([key, value]) => {
      output += `${key}: ${value}\n`;
    });

    return this.formatResult(output);
  }

  /**
   * Format table data
   */
  formatTable(title, headers, rows) {
    let output = `${title}\n\n`;
    
    // Calculate column widths
    const widths = headers.map((header, index) => {
      const maxRowWidth = Math.max(...rows.map(row => String(row[index] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    // Format header
    const headerRow = headers.map((header, index) => header.padEnd(widths[index])).join(' | ');
    const separator = widths.map(width => '-'.repeat(width)).join(' | ');
    
    output += `${headerRow}\n${separator}\n`;

    // Format rows
    rows.forEach(row => {
      const formattedRow = row.map((cell, index) => 
        String(cell || '').padEnd(widths[index])
      ).join(' | ');
      output += `${formattedRow}\n`;
    });

    return this.formatResult(output);
  }

  /**
   * Configure formatter options
   */
  configure(options) {
    if (options.includeTimestamp !== undefined) {
      this.includeTimestamp = options.includeTimestamp;
    }
    if (options.debug !== undefined) {
      this.debug = options.debug;
    }
  }

  /**
   * Get formatter stats
   */
  getStats() {
    return {
      includeTimestamp: this.includeTimestamp,
      debug: this.debug
    };
  }
}