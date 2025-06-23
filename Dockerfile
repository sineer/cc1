FROM openwrt/rootfs:x86-64-23.05.0

# Update package list and install required packages
RUN mkdir -p /var/lock && \
    opkg update && \
    opkg install lua luafilesystem libuci-lua

# Create working directory and directories for UCI configs
WORKDIR /app
RUN mkdir -p /app/etc/config /tmp/uci-config-backups

# Copy UCI config tool and config files
COPY uci-config ./
COPY etc/config/* ./etc/config/
COPY *.lua ./

# Make UCI config tool executable
RUN chmod +x /app/uci-config

# Install luaunit for testing (download from GitHub)
RUN wget -O luaunit.lua https://raw.githubusercontent.com/sineer/luaunit/master/luaunit.lua

# Set default command to run all tests
CMD ["sh", "-c", "echo '=== UCI CONFIG TESTS ===' && lua test_uci_config.lua && echo '=== MERGE ENGINE TESTS ===' && lua test_merge_engine.lua && echo '=== ADVANCED INTEGRATION TESTS ===' && lua test_advanced_integration.lua"]