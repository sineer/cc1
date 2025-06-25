FROM openwrt/rootfs:x86-64-23.05.0

# Update package list and install required packages
RUN mkdir -p /var/lock && \
    opkg update && \
    opkg install lua luafilesystem libuci-lua

# Create working directory and directories for UCI configs
WORKDIR /app
RUN mkdir -p /app/etc/config /tmp/uci-config-backups

# Copy UCI config tool and config files
COPY bin/uci-config ./bin/
COPY etc ./etc
COPY lib/ ./lib/
COPY test/*.lua ./test/
COPY test/etc ./test/etc

# Make UCI config tool executable
RUN chmod +x /app/bin/uci-config

# Set default command to run all tests
CMD ["sh", "-c", "echo '=== UCI CONFIG TESTS ===' && lua test/test_uci_config.lua && echo '=== MERGE ENGINE TESTS ===' && lua test/test_merge_engine.lua && echo '=== ADVANCED INTEGRATION TESTS ===' && lua test/test_advanced_integration.lua && echo '=== PRODUCTION DEPLOYMENT TESTS ===' && lua test/test_production_deployment.lua"]
