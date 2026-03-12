const express = require('express');
const { chromium } = require('playwright');
const { urls } = require('./constant/xpath');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Enable CORS for all routes (this will fix Postman issues)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests
    crossOriginEmbedderPolicy: false // Allow embedding
}));

// Logging
app.use(morgan('combined'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
        xForwardedForHeader: false,
        trustProxy: false
    }
});

app.use('/api/', limiter);

// ============ PLAYWRIGHT EXECUTABLE PATH FIX FOR RENDER ============
function getPlaywrightExecutablePath() {
    const possiblePaths = [
        // Common paths on Render
        '/opt/render/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell',
        '/opt/render/.cache/ms-playwright/chromium-1208/chrome-linux/chrome',
        '/opt/render/.cache/ms-playwright/chromium-1208/chrome-linux/chrome-headless-shell',
        '/opt/render/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell'
    ];

    for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
            console.log(`✅ Found Playwright executable at: ${testPath}`);
            return testPath;
        }
    }

    // If not found, list directory contents for debugging
    console.log('📁 Playwright cache contents:');
    const basePath = '/opt/render/.cache/ms-playwright';
    if (fs.existsSync(basePath)) {
        const dirs = fs.readdirSync(basePath);
        dirs.forEach(dir => {
            console.log(`  - ${dir}`);
            const subPath = path.join(basePath, dir);
            if (fs.statSync(subPath).isDirectory()) {
                const subDirs = fs.readdirSync(subPath);
                subDirs.forEach(subDir => {
                    console.log(`    └─ ${subDir}`);
                });
            }
        });
    }

    return null;
}

const playwrightExecutablePath = getPlaywrightExecutablePath();

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(30000); // 30 seconds
    res.setTimeout(30000);
    next();
});

// ============ ROUTES ============

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Hotel Price API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Get available hotels (for reference)
app.get('/api/hotels', (req, res) => {
    const hotels = urls.map((url, index) => ({
        index,
        url,
        name: `Hotel ${index + 1}`
    }));
    res.json({
        success: true,
        count: hotels.length,
        hotels
    });
});

// Main endpoint to get hotel prices
app.post('/api/hotel-prices', async (req, res) => {
    const { adults = 2, children = 0, url } = req.body;

    // Validation
    if (!url) {
        return res.status(400).json({
            error: 'URL is required in the request body'
        });
    }

    // Validate URL format
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({
            error: 'Invalid URL format'
        });
    }

    // Validate guest counts
    if (adults < 1 || adults > 6) {
        return res.status(400).json({
            error: 'Adults must be between 1 and 6'
        });
    }

    if (children < 0 || children > 4) {
        return res.status(400).json({
            error: 'Children must be between 0 and 4'
        });
    }

    try {
        const result = await extractHotelPrices({ adults, children, url });

        if (result.error) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});


// ============ EXTRACTION FUNCTION ============

async function extractHotelPrices({ adults, children, url }) {

    let browser;

    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,720'
        ]
    };

    // Use executable path if found
    if (playwrightExecutablePath) {
        launchOptions.executablePath = playwrightExecutablePath;
        console.log(`🎯 Using executable: ${playwrightExecutablePath}`);
    }

    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        console.log(` Extracting prices for: ${adults} adults, ${children} children`);
        console.log(`🌐 URL: ${url}`);

        // Navigate to the page with timeout
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait for check availability section
        const checkAvailability = await page.locator('h2:has-text("Check availability")').first();
        await checkAvailability.waitFor({ timeout: 10000 });

        // Configure guests if needed
        await configureGuests(page, adults, children);

        // Wait for "All options" section
        try {
            const allOptionsHeading = await page.locator('h2:has-text("All options")').first();
            await allOptionsHeading.waitFor({ timeout: 15000, state: 'visible' });
            console.log('Found "All options" section');
        } catch (error) {
            console.log('"All options" section not found, trying to continue...');
        }

        // Click "View more options" if available
        try {
            const viewMoreButton = await page.locator('button:has-text("View more options")').first();
            if (await viewMoreButton.isVisible().catch(() => false)) {
                await viewMoreButton.click();
                console.log('Clicked "View more options"');
                await page.waitForTimeout(2000);
                await page.waitForLoadState('networkidle').catch(() => { });
            }
        } catch (error) {
            console.log('No "View more options" button found');
        }

        // Check if prices are available
        const priceData = await extractPriceData(page);

        if (Object.keys(priceData).length === 0) {
            return {
                error: 'No prices available for this configuration',
                guests: { adults, children }
            };
        }

        return {
            success: true,
            guests: { adults, children },
            hotel: { url },
            prices: priceData,
            totalProviders: Object.keys(priceData).length,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Extraction error:', error);
        return {
            error: error.message,
            guests: { adults, children }
        };
    } finally {
        await browser.close();
    }
}

async function configureGuests(page, targetAdults, targetChildren) {
    try {
        // Open guest selector
        const guestSelector = await page.locator('.rb1Kdf.CpGuFd.r0Ogod').first();
        await guestSelector.click();
        console.log(' Opened guest selector');
        await page.waitForTimeout(500);

        // Get current adult count
        const currentAdultsEl = await page.locator('[jsname="LBceb"] [jsname="yvdD4c"]').first();
        const currentAdultsText = await currentAdultsEl.textContent();
        const currentAdults = parseInt(currentAdultsText || '2');
        console.log(`Current adults: ${currentAdults}`);

        // Adjust adults
        if (currentAdults !== targetAdults) {
            const diff = targetAdults - currentAdults;
            const buttonSelector = diff > 0 ? '[jsname="TdyTDe"]' : '[jsname="DUGJie"]';

            for (let i = 0; i < Math.abs(diff); i++) {
                const btn = await page.locator(buttonSelector).first();
                if (await btn.isEnabled()) {
                    await btn.click();
                    await page.waitForTimeout(200);
                }
            }
            console.log(`Adjusted adults to ${targetAdults}`);
        }

        // Get current children count
        const currentChildrenEl = await page.locator('[jsname="YKt5od"] [jsname="yvdD4c"]').first();
        const currentChildrenText = await currentChildrenEl.textContent();
        const currentChildren = parseInt(currentChildrenText || '0');
        console.log(`Current children: ${currentChildren}`);

        // Adjust children
        if (currentChildren !== targetChildren) {
            const diff = targetChildren - currentChildren;
            const buttonSelector = diff > 0 ?
                '[jsname="YKt5od"] [jsname="TdyTDe"]' :
                '[jsname="YKt5od"] [jsname="DUGJie"]';

            for (let i = 0; i < Math.abs(diff); i++) {
                const btn = await page.locator(buttonSelector).first();
                if (await btn.isEnabled()) {
                    await btn.click();
                    await page.waitForTimeout(200);
                }
            }
            console.log(`   Adjusted children to ${targetChildren}`);
        }

        // Click Done
        const doneButton = await page.locator('button:has-text("Done")').first();
        await doneButton.click();
        console.log('Applied guest count changes');

        // Wait for update
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle').catch(() => { });

    } catch (error) {
        console.log('Guest configuration skipped:', error.message);
    }
}

async function extractPriceData(page) {
    return await page.evaluate(() => {
        function normalizeProviderName(name) {
            if (!name) return name;

            let normalized = name
                .replace(/[®™]/g, '')
                .replace(/Free Wi-Fi|Free WiFi|Breakfast included|Free cancellation/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            const providerPatterns = [
                { pattern: /^expedia\..*/i, name: 'Expedia' },
                { pattern: /^agoda.*/i, name: 'Agoda' },
                { pattern: /^booking\..*/i, name: 'Booking.com' },
                { pattern: /^hotels\..*/i, name: 'Hotels.com' },
                { pattern: /^makemytrip.*/i, name: 'MakeMyTrip.com' },
                { pattern: /^cleartrip.*/i, name: 'Cleartrip.com' },
                { pattern: /^yatra.*/i, name: 'Yatra.com' },
                { pattern: /^goibibo.*/i, name: 'Goibibo' },
                { pattern: /^mytravaly.*/i, name: 'MyTravaly.com' },
                { pattern: /^skyscanner.*/i, name: 'Skyscanner' },
                { pattern: /^ixigo.*/i, name: 'ixigo' },
                { pattern: /^bluepillow.*/i, name: 'Bluepillow.in' }
            ];

            for (const { pattern, name: providerName } of providerPatterns) {
                if (pattern.test(normalized)) {
                    return providerName;
                }
            }

            return normalized;
        }

        const results = {};
        const containers = document.querySelectorAll('[data-partner-id]');

        containers.forEach(container => {
            try {
                // Get provider
                let provider = null;
                const img = container.querySelector('img[alt]');
                if (img && img.alt && !img.alt.includes('sponsored')) {
                    provider = img.alt.trim();
                }

                if (!provider) {
                    const providerSpan = container.querySelector('.FjC1We');
                    if (providerSpan) {
                        const text = providerSpan.textContent?.trim();
                        if (text && text.length < 50 && !text.includes('₹')) {
                            provider = text;
                        }
                    }
                }

                // Get price
                let price = null;
                const priceSelectors = [
                    '.nDkDDb', '.iqYCVb', '.MW1oTb', '.UeIHqb',
                    '.QoBrxc', '.pNExyb'
                ];

                for (const selector of priceSelectors) {
                    const el = container.querySelector(selector);
                    if (el) {
                        const match = el.textContent?.match(/₹[\d,]+/);
                        if (match) {
                            price = match[0];
                            break;
                        }
                    }
                }

                if (!price) {
                    const match = container.innerText.match(/₹[\d,]+/);
                    if (match) price = match[0];
                }

                if (provider && price) {
                    const normalized = normalizeProviderName(provider);
                    const priceNum = parseInt(price.replace(/[^0-9]/g, ''));

                    if (!results[normalized] ||
                        priceNum < parseInt(results[normalized].replace(/[^0-9]/g, ''))) {
                        results[normalized] = price;
                    }
                }
            } catch (e) { }
        });

        // Sort by price
        return Object.fromEntries(
            Object.entries(results).sort((a, b) =>
                parseInt(a[1].replace(/[^0-9]/g, '')) -
                parseInt(b[1].replace(/[^0-9]/g, ''))
            )
        );
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});

// Start server
app.listen(port, () => {
    console.log(` Hotel Price API running at http://localhost:${port}`);
    console.log(` POST to http://localhost:${port}/api/hotel-prices`);
    console.log(` GET http://localhost:${port}/health - Health check`);
});