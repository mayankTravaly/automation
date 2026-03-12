#!/bin/bash
# render-build.sh

# Install dependencies
npm ci

# Install Playwright browsers
npx playwright install chromium

# Install Playwright system dependencies
npx playwright install-deps chromium