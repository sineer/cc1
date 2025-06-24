.PHONY: test build clean install docker-test help

# Default target
help:
	@echo "UCI Config Tool - Available targets:"
	@echo "  make test        - Run all tests in Docker"
	@echo "  make build       - Build Docker test image"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make install     - Install to /usr/local/bin"
	@echo "  make docker-test - Run specific test file"
	@echo "  make help        - Show this help"

# Run all tests
test: build
	docker-compose run --rm lua-test

# Build Docker image
build:
	docker-compose build

# Run specific test
docker-test: build
	@if [ -z "$(TEST)" ]; then \
		echo "Usage: make docker-test TEST=test_uci_config.lua"; \
		exit 1; \
	fi
	docker-compose run --rm lua-test lua test/$(TEST)

# Clean build artifacts
clean:
	rm -f logs/*.log
	rm -rf /tmp/uci-config-backups/*
	docker-compose down --rmi local

# Install to system
install:
	@echo "Installing uci-config to /usr/local/bin..."
	@ln -sf $(shell pwd)/bin/uci-config /usr/local/bin/uci-config
	@echo "Installation complete!"

# Development shortcuts
merge-dry:
	./bin/uci-config merge --dry-run --verbose ./etc/config/default

validate:
	./bin/uci-config validate --check-services

backup:
	./bin/uci-config backup --name dev-backup-$(shell date +%Y%m%d-%H%M%S)