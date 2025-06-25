# UCI Config Tool Production Deployment Guide

## Prerequisites

- OpenWRT 23.05 or newer
- Lua 5.1+ with UCI library support  
- Required packages:
  ```bash
  opkg update
  opkg install lua luafilesystem libuci-lua
  ```

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/uci-config-tool.git
cd uci-config-tool
```

### 2. Set Permissions

```bash
chmod +x bin/uci-config
```

### 3. Add to PATH (Optional)

```bash
ln -s $(pwd)/bin/uci-config /usr/local/bin/uci-config
```

## Production Deployment Workflow

### 1. Pre-Deployment Testing

Always test configurations in a safe environment first:

```bash
# Run tests to ensure tool functionality
docker build -t uci-config-test .
docker run uci-config-test

# Validate configurations
./bin/uci-config validate --source-dir ./etc/config/default --check-services
```

### 2. Backup Current Configuration

```bash
# Create backup before any changes
./bin/uci-config backup --name pre-deployment-$(date +%Y%m%d)
```

### 3. Dry Run First

```bash
# Preview changes without applying
./bin/uci-config merge --dry-run --verbose ./etc/config/default
```

### 4. Apply Configuration

```bash
# Apply with all safety features enabled
./bin/uci-config merge \
  --preserve-network \
  --dedupe-lists \
  --rollback-on-failure \
  ./etc/config/default
```

### 5. Verify Deployment

```bash
# Check service status
for service in firewall network dnsmasq uhttpd; do
  /etc/init.d/$service status
done

# Validate final configuration
./bin/uci-config validate --check-services
```

## Rollback Procedures

### Automatic Rollback

The tool automatically rolls back on service restart failures when using `--rollback-on-failure`.

### Manual Rollback

If needed, restore from backup:

```bash
# List available backups
ls -la /tmp/uci-config-backups/

# Restore specific backup
tar -xzf /tmp/uci-config-backups/backup-pre-deployment-20250624.tar.gz -C /etc/config/
```

## Configuration Examples

### Captive Portal Deployment

```bash
# Deploy complete captive portal setup
./bin/uci-config safe-merge --target default
```

### Custom Network Configuration

```bash
# Merge only network and firewall configs
./bin/uci-config merge --dedupe-lists ./custom/network ./custom/firewall
```

## Monitoring and Logging

### Check Operation Logs

The tool provides detailed logging of all operations:

```bash
# Run with verbose output
./bin/uci-config merge --verbose ./configs 2>&1 | tee deployment.log
```

### Service Monitoring

Monitor services after deployment:

```bash
# Check system logs
logread | grep -E "(firewall|network|dnsmasq|uhttpd)"

# Monitor service status
watch -n 5 '/etc/init.d/firewall status; /etc/init.d/network status'
```

## Troubleshooting

### Common Issues

1. **Service Restart Failures**
   - Check service logs: `logread -e service_name`
   - Verify configuration syntax: `uci show | grep -A5 error`
   - Manual service restart: `/etc/init.d/service_name restart`

2. **Network Connectivity Loss**
   - Tool preserves network with `--preserve-network`
   - If lost, access via serial console
   - Restore from backup in /tmp/uci-config-backups/

3. **Configuration Conflicts**
   - Review dry-run output for conflicts
   - Use `--preserve-existing` to keep current values
   - Manually resolve in source configs if needed

### Debug Mode

Enable maximum verbosity for troubleshooting:

```bash
./bin/uci-config merge --verbose --dry-run ./configs > debug.log 2>&1
```

## Security Considerations

1. **Backup Encryption**: Encrypt backups containing sensitive data
2. **Access Control**: Restrict tool access to authorized users
3. **Audit Trail**: Keep deployment logs for compliance
4. **Secret Management**: Never commit secrets to version control

## Performance Optimization

For large deployments:

```bash
# Skip service restarts during bulk operations
./bin/uci-config merge --no-restart ./configs

# Manually restart services after all changes
/etc/init.d/network restart
/etc/init.d/firewall restart
```

## Integration with CI/CD

### GitLab CI Example

```yaml
deploy:
  stage: deploy
  script:
    - ./bin/uci-config backup --name ci-backup-$CI_COMMIT_SHA
    - ./bin/uci-config merge --dry-run ./configs
    - ./bin/uci-config merge --preserve-network --dedupe-lists ./configs
    - ./bin/uci-config validate --check-services
  only:
    - main
```

## Health Checks

Post-deployment verification script:

```bash
#!/bin/sh
# health-check.sh

echo "Checking UCI Config Tool deployment..."

# Check services
for service in firewall network dnsmasq uhttpd; do
    if /etc/init.d/$service enabled; then
        /etc/init.d/$service status || exit 1
    fi
done

# Validate configuration
./bin/uci-config validate --check-services || exit 1

echo "All checks passed!"
```