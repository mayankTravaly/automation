#!/bin/bash
# render-build.sh

set -e

echo "🚀 Starting build process..."

# Install dependencies
npm ci

# Install ALL Playwright browsers and dependencies
echo "🎭 Installing Playwright browsers..."
npx playwright install --with-deps chromium

# Verify installation
echo "📁 Checking Playwright cache..."
ls -la /opt/render/.cache/ms-playwright/

# Set correct permissions
chmod -R 755 /opt/render/.cache/ms-playwright/

echo "✅ Build complete!"