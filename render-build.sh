#!/bin/bash
# render-build.sh

set -e

echo "🚀 Starting build process..."

# Install npm dependencies
echo "📦 Installing npm packages..."
npm ci

# Install ONLY the Chromium browser (no system dependencies attempt)
echo "🎭 Installing Chromium browser..."
npx playwright install chromium

# No need for --with-deps flag as Render's base image has most dependencies
# The specific error about su is avoided by not trying to install system packages

# Verify installation and set permissions
echo "📁 Checking Playwright cache..."
CACHE_DIR="/opt/render/.cache/ms-playwright"
if [ -d "$CACHE_DIR" ]; then
    ls -la "$CACHE_DIR"
    # Ensure correct permissions (no need for su)
    chmod -R 755 "$CACHE_DIR"
else
    echo "⚠️ Playwright cache directory not found at $CACHE_DIR"
fi

echo "✅ Build complete!"