const { chromium } = require('playwright');
const { urls } = require('./constant/xpath');

// Guest configuration - you can change these values
const GUEST_CONFIG = {
    adults: 3,  // Testing with 3 adults
    children: 1  // Testing with 1 child
};

async function extractHotelPrices() {
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 100
    });
    const page = await browser.newPage();

    try {
        const url = urls[6];
        
        console.log('Starting hotel price extraction...');
        console.log('='.repeat(60));
        console.log(`Guest configuration: ${GUEST_CONFIG.adults} adults, ${GUEST_CONFIG.children} children`);
        
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle' });
        console.log('Page loaded');
        
        // Step 1: Find and verify we're in the right section
        const checkAvailability = await page.locator('h2:has-text("Check availability")').first();
        await checkAvailability.waitFor({ timeout: 10000 });
        console.log('Found "Check availability" section');
        
        // Step 2: Set guest count if needed
        console.log('\n Configuring guest count...');
        
        try {
            // Click on the guest selector to open the dropdown
            const guestSelector = await page.locator('.rb1Kdf.CpGuFd.r0Ogod').first();
            await guestSelector.click();
            console.log('Opened guest selector');
            
            await page.waitForTimeout(1000);
            
            // Get current adult count
            const currentAdults = await page.locator('[jsname="LBceb"] [jsname="yvdD4c"]').first();
            const currentAdultsText = await currentAdults.textContent();
            const currentAdultsCount = parseInt(currentAdultsText || '2');
            console.log(`Current adults: ${currentAdultsCount}`);
            
            // Adjust adults if needed
            if (currentAdultsCount !== GUEST_CONFIG.adults) {
                const difference = GUEST_CONFIG.adults - currentAdultsCount;
                const buttonSelector = difference > 0 ? '[jsname="TdyTDe"]' : '[jsname="DUGJie"]';
                
                for (let i = 0; i < Math.abs(difference); i++) {
                    const adjustButton = await page.locator(buttonSelector).first();
                    if (await adjustButton.isEnabled()) {
                        await adjustButton.click();
                        await page.waitForTimeout(300);
                        console.log(`Adjusted adults: ${difference > 0 ? '+' : '-'}1`);
                    } else {
                        console.log(`Cannot adjust further (reached limit)`);
                        break;
                    }
                }
            } else {
                console.log(`Adults already set to ${GUEST_CONFIG.adults}`);
            }
            
            // Handle children
            // Get current children count
            const currentChildren = await page.locator('[jsname="YKt5od"] [jsname="yvdD4c"]').first();
            const currentChildrenText = await currentChildren.textContent();
            const currentChildrenCount = parseInt(currentChildrenText || '0');
            console.log(`Current children: ${currentChildrenCount}`);
            
            if (currentChildrenCount !== GUEST_CONFIG.children) {
                const difference = GUEST_CONFIG.children - currentChildrenCount;
                const buttonSelector = difference > 0 ? 
                    '[jsname="YKt5od"] [jsname="TdyTDe"]' : 
                    '[jsname="YKt5od"] [jsname="DUGJie"]';
                
                for (let i = 0; i < Math.abs(difference); i++) {
                    const adjustButton = await page.locator(buttonSelector).first();
                    if (await adjustButton.isEnabled()) {
                        await adjustButton.click();
                        await page.waitForTimeout(300);
                        console.log(`Adjusted children: ${difference > 0 ? '+' : '-'}1`);
                    } else {
                        console.log(`Cannot adjust further (reached limit)`);
                        break;
                    }
                }
            } else {
                console.log(`Children already set to ${GUEST_CONFIG.children}`);
            }
            
            // Click Done button to apply changes
            const doneButton = await page.locator('button:has-text("Done")').first();
            await doneButton.click();
            console.log('Applied guest count changes');
            
            // Wait for page to reload with new guest count
            console.log('Waiting for prices to update...');
            
            // Wait for loading indicator to appear and disappear
            try {
                // Wait for loading spinner to appear (if any)
                await page.waitForSelector('.sZwd7c.B6Vhqe', { timeout: 5000 }).catch(() => {
                    console.log('No loading spinner detected');
                });
                
                // Wait for loading spinner to disappear
                await page.waitForSelector('.sZwd7c.B6Vhqe', { state: 'hidden', timeout: 10000 }).catch(() => {
                    console.log('Loading spinner not found or already hidden');
                });
            } catch (e) {
                console.log('No loading indicator found');
            }
            
            // Wait for network idle
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
                console.log('Network did not become completely idle, but continuing...');
            });
            
            // Additional wait to ensure DOM updates
            await page.waitForTimeout(3000);
            
        } catch (error) {
            console.log('Could not configure guests, using default:', error.message);
        }
        
        // Step 3: Check if prices are available after guest change
        console.log('\n Checking if prices are available...');
        
        // Check for error message
        const errorMessage = await page.locator('.q0amnf.AdWm1c').first();
        if (await errorMessage.isVisible().catch(() => false)) {
            const errorText = await errorMessage.textContent();
            if (errorText && errorText.includes('Having trouble loading prices')) {
                console.log('No pricing available for this guest configuration');
                console.log(`   ${GUEST_CONFIG.adults} adults, ${GUEST_CONFIG.children} children not available`);
                return { error: 'No pricing available for this guest configuration' };
            }
        }
        
        // Step 4: Find the "All options" heading with better waiting strategy
        console.log('\n Looking for "All options" section...');
        
        let allOptionsFound = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!allOptionsFound && retryCount < maxRetries) {
            try {
                const allOptionsHeading = await page.locator('h2:has-text("All options")').first();
                await allOptionsHeading.waitFor({ timeout: 10000, state: 'visible' });
                console.log('Found "All options" heading');
                allOptionsFound = true;
            } catch (error) {
                retryCount++;
                console.log(`Retry ${retryCount}/${maxRetries} - "All options" not visible yet...`);
                
                if (retryCount < maxRetries) {
                    // Wait and try to scroll or refresh
                    await page.waitForTimeout(3000);
                    
                    // Try to scroll to trigger lazy loading
                    await page.evaluate(() => {
                        window.scrollBy(0, 500);
                    });
                    
                    // Check again if there's an error message
                    const errorMsg = await page.locator('.q0amnf.AdWm1c').first();
                    if (await errorMsg.isVisible().catch(() => false)) {
                        const errorText = await errorMsg.textContent();
                        if (errorText && errorText.includes('Having trouble loading prices')) {
                            console.log('No pricing available for this guest configuration');
                            return { error: 'No pricing available for this guest configuration' };
                        }
                    }
                }
            }
        }
        
        if (!allOptionsFound) {
            console.log(' "All options" section not found - no pricing available');
            return { error: 'No pricing options found' };
        }
        
        // Step 5: Look for and click "View more options" button
        console.log('\n🔍 Looking for "View more options" button...');
        
        try {
            const viewMoreButton = await page.locator('button:has-text("View more options")').first();
            if (await viewMoreButton.isVisible()) {
                const buttonText = await viewMoreButton.textContent();
                console.log(`Found button: "${buttonText}"`);
                await viewMoreButton.click();
                console.log('   Clicked "View more options" button');
                
                await page.waitForTimeout(3000);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                console.log('⏳ Waiting for additional hotels to load...');
                await page.waitForTimeout(2000);
            } else {
                console.log('"View more options" button not visible');
            }
        } catch (error) {
            console.log('No "View more options" button found or already expanded');
        }
        
        // Step 6: Check if any hotel containers exist
        const hotelCount = await page.$$eval('[data-partner-id]', els => els.length);
        if (hotelCount === 0) {
            console.log('No hotel options found for this guest configuration');
            return { error: 'No hotel options available' };
        }
        
        console.log(`Found ${hotelCount} hotel options`);
        
        // Step 7: Extract provider-price pairs
        console.log('\n Extracting provider-price pairs...');
        
        const priceData = await page.evaluate((guestConfig) => {
            // Function to normalize provider names
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
                
                if (normalized.includes('.com')) {
                    const match = normalized.match(/([a-zA-Z0-9-]+)\.com/);
                    if (match) {
                        return match[1] + '.com';
                    }
                }
                
                return normalized;
            }
            
            const results = {};
            const priceOccurrences = [];
            
            const hotelContainers = document.querySelectorAll('[data-partner-id]');
            
            hotelContainers.forEach(container => {
                try {
                    let provider = null;
                    const img = container.querySelector('img[alt]');
                    if (img && img.alt && img.alt.trim() && !img.alt.includes('sponsored')) {
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
                    
                    if (!provider) {
                        const textElements = container.querySelectorAll('span, div');
                        for (const el of textElements) {
                            const text = el.textContent?.trim();
                            if (text && (
                                text.includes('.com') || 
                                text.includes('Booking') ||
                                text.includes('Agoda') ||
                                text.includes('Expedia') ||
                                text.includes('MakeMyTrip') ||
                                text.includes('Yatra') ||
                                text.includes('Goibibo') ||
                                text.includes('Hotels.com') ||
                                text.includes('Official')
                            )) {
                                if (!text.includes('₹') && text.length < 50) {
                                    provider = text;
                                    break;
                                }
                            }
                        }
                    }
                    
                    let price = null;
                    
                    const priceSelectors = [
                        '.nDkDDb', '.iqYCVb', '.MW1oTb', '.UeIHqb', 
                        '.QoBrxc', '.pNExyb', '[class*="price"]', '[class*="Price"]'
                    ];
                    
                    for (const selector of priceSelectors) {
                        const priceEl = container.querySelector(selector);
                        if (priceEl) {
                            const priceText = priceEl.textContent?.trim();
                            const match = priceText?.match(/₹[\d,]+/);
                            if (match) {
                                price = match[0];
                                break;
                            }
                        }
                    }
                    
                    if (!price) {
                        const containerText = container.innerText;
                        const match = containerText.match(/₹[\d,]+/);
                        if (match) {
                            price = match[0];
                        }
                    }
                    
                    if (provider && price) {
                        provider = provider.replace(/[®™]/g, '').trim();
                        const normalizedProvider = normalizeProviderName(provider);
                        const priceNum = parseInt(price.replace(/[^0-9]/g, ''));
                        
                        priceOccurrences.push({
                            original: provider,
                            normalized: normalizedProvider,
                            price: price,
                            priceNum: priceNum
                        });
                    }
                    
                } catch (e) {
                    // Skip errors
                }
            });
            
            // Group by normalized provider name
            const providerGroups = {};
            
            priceOccurrences.forEach(item => {
                if (!providerGroups[item.normalized]) {
                    providerGroups[item.normalized] = [];
                }
                providerGroups[item.normalized].push(item);
            });
            
            Object.keys(providerGroups).forEach(provider => {
                const items = providerGroups[provider];
                items.sort((a, b) => a.priceNum - b.priceNum);
                const lowestPriceItem = items[0];
                results[provider] = lowestPriceItem.price;
            });
            
            return results;
        }, GUEST_CONFIG);
        
        if (Object.keys(priceData).length === 0) {
            console.log('No provider-price pairs found');
            return { error: 'No prices extracted' };
        } else {
            const sortedEntries = Object.entries(priceData).sort((a, b) => {
                const priceA = parseInt(a[1].replace(/[^0-9]/g, ''));
                const priceB = parseInt(b[1].replace(/[^0-9]/g, ''));
                return priceA - priceB;
            });
            
            const resultObject = {};
            sortedEntries.forEach(([provider, price]) => {
                resultObject[provider] = price;
            });
            
            console.log('\n FINAL OBJECT:');
            console.log(JSON.stringify(resultObject, null, 2));
            
            console.log('\n PROVIDER-PRICE LIST:');
            console.log('-'.repeat(40));
            sortedEntries.forEach(([provider, price], index) => {
                console.log(`${index + 1}. ${provider}: ${price}`);
            });
            
        
            return {
                success: true,
                prices: resultObject
            };
        }

    } catch (error) {
        console.error(' Error:', error.message);
        return { error: error.message };
    } finally {
        console.log('\n Closing browser in 5 seconds...');
        await page.waitForTimeout(5000);
        await browser.close();
    }
}

// Run the script
extractHotelPrices().then(result => {
    if (result) {
        if (result.error) {
            console.log('\n Script completed with error:', result.error);
        } else {
            console.log('\n Script completed successfully!');
        }
    }
});