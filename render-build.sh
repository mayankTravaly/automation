#!/bin/bash
# render-build.sh

set -e

echo "🚀 Starting build process..."

# Install npm dependencies
echo "📦 Installing npm packages..."
npm ci

# Install ONLY Chromium browser (NO system dependencies)
echo "🎭 Installing Chromium browser..."
npx playwright install chromium

# No --with-deps flag - this avoids the su authentication failure

# Verify installation
echo "📁 Checking Playwright cache..."
ls -la /opt/render/.cache/ms-playwright/ || echo "Cache directory not found yet"

echo "✅ Build complete!"