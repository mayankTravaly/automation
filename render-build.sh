#!/bin/bash
# render-build.sh

set -e

echo "🚀 Starting build process..."

# Install dependencies
npm ci

# Set environment variable to skip root requirement
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
export PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright

# Install Playwright browsers
echo "🎭 Installing Playwright browsers..."
npx playwright install chromium

# Try to install deps with --no-root flag
echo "🔧 Installing Playwright dependencies..."
npx playwright install-deps --no-root || true

echo "✅ Build complete!"