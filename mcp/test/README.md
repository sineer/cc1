# UCI Config MCP Testing Framework

This directory contains comprehensive testing infrastructure for the UCI Config MCP system, including unit tests, integration tests, fixtures, and testing utilities.

## Overview

The testing framework is designed to catch the types of bugs that were discovered in the dashboard and diff generation system:

- **Dashboard statistics showing zeros** instead of actual change counts
- **Compare buttons linking to non-existent files** due to filename generation bugs
- **SSH askpass errors** during remote deployment
- **Flag standardization issues** (--no-confirm vs --force)

## Directory Structure

```
test/
├── fixtures/           # Mock data and test configurations
│   ├── configs/        # Sample UCI configuration files
│   ├── diffs/          # Pre-generated diff results
│   ├── devices/        # Device profile configurations
│   ├── snapshots/      # Sample snapshot files
│   ├── ssh-responses/  # Mock SSH command responses
│   ├── dashboard-data.json     # Complete dashboard data structure
│   └── fixture-loader.js       # Fixture loading utilities
├── helpers/            # Testing utilities and helpers
│   └── test-helpers.js         # Comprehensive test utilities
├── examples/           # Example tests and usage patterns
│   └── fixture-usage-example.test.js
├── integration/        # Integration tests
│   └── dashboard-workflow.test.js
└── README.md          # This file
```

## Running Tests

### Prerequisites

```bash
cd mcp/
npm install  # Install Vitest and testing dependencies
```

### Running All Tests

```bash
npm test                    # Run all tests once
npm run test:watch          # Run tests in watch mode
npm run test:ui            # Run tests with web UI
npm run test:coverage      # Run tests with coverage report
```

### Running Specific Tests

```bash
# Run unit tests only
npm test lib/__tests__/

# Run integration tests only  
npm test test/integration/

# Run specific test file
npm test lib/__tests__/statistics-engine.test.js

# Run tests matching pattern
npm test -- dashboard
```

## Test Categories

### 1. Unit Tests (`lib/__tests__/`)

#### Statistics Engine Tests
- **Purpose**: Test statistics calculation and aggregation
- **Key Tests**: Verifies correct data path (`diffResult.uci_diff.packages`)
- **Bug Prevention**: Dashboard showing zero statistics

```javascript
// Example test that would have caught the statistics bug
expect(stats.packageStats.modified).toBe(2);
expect(stats.sectionStats.added).toBe(3);
expect(stats.sectionStats.removed).toBe(1);
```

#### Dashboard Generator Tests
- **Purpose**: Test HTML generation and compare button positioning
- **Key Tests**: Button placement and snapshot ordering
- **Bug Prevention**: Compare buttons on wrong timeline entries

```javascript
// Test that buttons appear on first timeline entry with correct order
const compareMatch = html.match(/compareTo\('([^']+)',\s*'([^']+)'\)/);
expect(compareMatch[1]).toBe(snapshot.id);
expect(compareMatch[2]).toBe(nextSnapshot.id);
```

#### Script Generator Tests  
- **Purpose**: Test JavaScript generation for dashboard interactions
- **Key Tests**: Filename generation with special characters
- **Bug Prevention**: Compare buttons linking to non-existent files

```javascript
// Test device name normalization
window.DEVICE_NAME = 'Direct IP (192.168.11.2)';
expect(mockWindowOpen).toHaveBeenCalledWith(
  'diffs/Direct-IP-(192.168.11.2)-pre-test-post-test.html',
  '_blank'
);
```

#### SSH Manager Tests
- **Purpose**: Test SSH connection and command execution
- **Key Tests**: Environment setup and error handling
- **Bug Prevention**: SSH askpass errors with empty passwords

```javascript
// Test environment configuration for password auth
expect(env.SSH_ASKPASS).toBe('');
expect(env.DISPLAY).toBe('');
expect(command).toContain('sshpass -p ""');
```

#### Demo Orchestrator Tests
- **Purpose**: Test deployment workflow orchestration
- **Key Tests**: Flag handling and actual vs simulated deployment
- **Bug Prevention**: --no-confirm vs --force flag issues

```javascript
// Test flag standardization
expect(cmd).toContain('--force');
expect(cmd).not.toContain('--no-confirm');
```

### 2. Integration Tests (`test/integration/`)

#### Dashboard Workflow Tests
- **Purpose**: Test complete dashboard generation pipeline
- **Key Tests**: End-to-end workflow with realistic data
- **Bug Prevention**: Integration issues between components

### 3. Test Fixtures (`test/fixtures/`)

#### Configuration Files
- `basic-openwrt.uci`: Standard OpenWRT configuration
- `ubispot-captive.uci`: Captive portal configuration with all sections
- `gl-mt3000.uci`: GL-iNet device specific configuration

#### Diff Results
- `ubispot-deployment.json`: Complete ubispot deployment diff (17 changes)
- `config-removal.json`: Configuration removal diff

#### Device Profiles
- `gl-mt3000.json`: GL-iNet MT3000 device profile
- `generic-openwrt.json`: Generic OpenWRT device profile

#### SSH Responses
- `successful-deployment.json`: Successful command responses
- `authentication-failure.json`: Various error scenarios

#### Dashboard Data
- `dashboard-data.json`: Complete dashboard data structure

### 4. Test Utilities (`test/helpers/`)

#### TestHelpers Class
Provides utilities for:
- Temporary directory management
- Mock creation (exec, spawn, SSH, file system)
- HTML validation
- Performance testing data generation
- Test environment setup

#### FixtureLoader Class
Provides methods for:
- Loading configuration files
- Loading diff results
- Loading device profiles
- Creating mock data
- Validating fixture availability

## Writing Tests

### Basic Test Structure

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixtures } from '../test/fixtures/fixture-loader.js';
import { TestHelpers } from '../test/helpers/test-helpers.js';

describe('My Component', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = await TestHelpers.createTestEnvironment();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  it('should do something', async () => {
    // Load fixture data
    const config = await fixtures.loadConfig('basic-openwrt');
    
    // Use test helpers
    const mockSSH = TestHelpers.createMockSSHManager({
      'test': { stdout: 'success', exitCode: 0 }
    });
    
    // Your test logic here
    expect(config).toContain('config system');
  });
});
```

### Using Fixtures

```javascript
// Load configuration files
const openWrtConfig = await fixtures.loadConfig('basic-openwrt');
const ubispotConfig = await fixtures.loadConfig('ubispot-captive');

// Load diff results
const deploymentDiff = await fixtures.loadDiff('ubispot-deployment');

// Load device profiles
const glDevice = await fixtures.loadDevice('gl-mt3000');

// Create mock data
const mockSnapshot = fixtures.createMockSnapshot('test-id', 'test-label');
const mockDiff = fixtures.createMockDiffResult(5, 3, 2);
```

### Using Test Helpers

```javascript
// Mock SSH operations
const mockSSH = TestHelpers.createMockSSHManager({
  'uci-config test': { stdout: 'All tests passed', exitCode: 0 }
});

// Mock file system
const mockFS = TestHelpers.mockFS({
  '/test/file.txt': 'test content'
});

// Validate HTML
const validation = TestHelpers.validateHTML(htmlContent);
expect(validation.valid).toBe(true);

// Performance testing
const perfData = TestHelpers.generatePerformanceTestData(100, 10);
```

## Bug Prevention Strategy

### 1. Data Path Validation
Tests verify that components access correct data paths:

```javascript
// Statistics Engine test
expect(stats).toHaveProperty('packageStats.modified');
expect(diffResult.uci_diff.packages).toBeDefined();
```

### 2. Integration Testing
End-to-end tests catch integration issues:

```javascript
// Dashboard workflow test  
const dashboardData = await processor.processSnapshots(deviceName, snapshots);
const dashboardHtml = generator.generateDashboard(dashboardData);
expect(dashboardHtml).toContain('compareTo');
```

### 3. Realistic Test Data
Uses actual deployment scenarios:

```javascript
// Real ubispot deployment diff with 17 sections
const ubispotDiff = await fixtures.loadDiff('ubispot-deployment');
expect(ubispotDiff.statistics.sections_added).toBe(17);
```

### 4. Error Scenario Testing
Tests handle actual error conditions:

```javascript
// SSH askpass error (non-fatal)
const responses = await fixtures.loadSSHResponses('authentication-failure');
expect(responses.responses.askpass_error.exit_code).toBe(0);
```

## Common Testing Patterns

### Testing Dashboard Components

```javascript
describe('Dashboard Generation', () => {
  it('should generate dashboard with correct statistics', async () => {
    // Load realistic test data
    const dashboardData = await fixtures.loadDashboardData();
    
    // Generate dashboard
    const html = generator.generateDashboard(dashboardData);
    
    // Verify statistics are not zero
    expect(html).not.toContain('<span class="value">0</span>');
    expect(html).toContain('17'); // Expected change count
    
    // Verify compare buttons work
    expect(html).toContain('compareTo');
    const compareMatch = html.match(/compareTo\('([^']+)',\s*'([^']+)'\)/);
    expect(compareMatch).toBeTruthy();
  });
});
```

### Testing SSH Operations

```javascript
describe('SSH Deployment', () => {
  it('should handle empty password authentication', async () => {
    const config = { host: '192.168.11.2', password: '' };
    
    const command = buildSSHCommand(config, 'uci-config test');
    
    // Verify askpass prevention
    expect(command).toContain('SSH_ASKPASS=""');
    expect(command).toContain('DISPLAY=""');
    expect(command).toContain('sshpass -p ""');
  });
});
```

### Testing Flag Handling

```javascript
describe('Flag Standardization', () => {
  it('should use --force instead of --no-confirm', () => {
    const command = buildCommand({ force: true });
    
    expect(command).toContain('--force');
    expect(command).not.toContain('--no-confirm');
  });
});
```

## Performance Testing

### Load Testing
```javascript
it('should handle large numbers of snapshots efficiently', async () => {
  const data = TestHelpers.generatePerformanceTestData(100, 10);
  
  const startTime = Date.now();
  const dashboard = await processor.processSnapshots('device', data.snapshots);
  const endTime = Date.now();
  
  expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
});
```

### Memory Testing
```javascript
it('should cleanup resources after processing', async () => {
  const cleanupSpy = vi.spyOn(processor, 'cleanup');
  
  await processor.processLargeDataset(testData);
  
  expect(cleanupSpy).toHaveBeenCalled();
});
```

## Debugging Tests

### Verbose Output
```bash
npm test -- --reporter=verbose
```

### Debug Specific Test
```bash
npm test -- --reporter=verbose lib/__tests__/statistics-engine.test.js
```

### Coverage Report
```bash
npm run test:coverage
```

### Visual Test UI
```bash
npm run test:ui
```

## Best Practices

### 1. Use Realistic Data
- Load actual configuration files from fixtures
- Use real diff results from deployments
- Test with actual device profiles

### 2. Test Error Conditions
- Network failures
- Authentication errors
- Malformed data
- Edge cases

### 3. Mock External Dependencies
- SSH connections
- File system operations
- Command execution
- Network requests

### 4. Validate Outputs
- HTML structure and validity
- Data integrity
- Security (XSS prevention)
- Performance constraints

### 5. Test Integration Points
- Data flow between components
- Component interaction
- End-to-end workflows
- Error propagation

## Continuous Integration

The test suite is designed to run in CI environments:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    cd mcp/
    npm ci
    npm run test:coverage
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./mcp/coverage/lcov.info
```

## Contributing

When adding new features:

1. **Add unit tests** for individual components
2. **Add integration tests** for component interactions  
3. **Add fixtures** for new data types or scenarios
4. **Update test helpers** if new utilities are needed
5. **Update documentation** with new testing patterns

When fixing bugs:

1. **Add test that reproduces the bug** before fixing
2. **Verify the test fails** with current code
3. **Fix the bug** and verify test passes
4. **Add regression test** to prevent future occurrences

This comprehensive testing framework ensures that the UCI Config MCP system remains reliable and catches issues before they reach production.