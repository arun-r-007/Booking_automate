const { chromium } = require('playwright');
const logger = require('../utils/logger');

async function launchBrowser(config) {
  // Support environment variable or config setting for headless mode
  const isHeadless =
    process.env.HEADLESS !== undefined
      ? process.env.HEADLESS === 'true'
      : (config.monitoring?.headless ?? false);

  logger.info(`Launching Chromium browser in ${isHeadless ? 'HEADLESS' : 'HEADED'} mode...`);

  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ];

  if (!isHeadless) {
    launchArgs.push('--start-maximized');
  }

  const browser = await chromium.launch({
    headless: isHeadless,
    args: launchArgs
  });

  const contextOptions = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata'
  };

  if (!isHeadless) {
    contextOptions.viewport = null;
  } else {
    contextOptions.viewport = { width: 1366, height: 768 };
  }

  const context = await browser.newContext(contextOptions);

  // Bypass simple automated testing checks
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });

  logger.success('Browser launched and window initialized.');
  return { browser, context, page };
}

module.exports = launchBrowser;
