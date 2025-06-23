#!/bin/bash

echo "Building Docker image..."
docker compose build

echo -e "\nRunning tests in OpenWRT 23.05 environment..."
docker compose run --rm lua-test