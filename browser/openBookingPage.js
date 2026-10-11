const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');
const { captureMilestone } = require('../utils/visual');

/**
 * Waits until the showtimes list inside #main-content or the time pill container is rendered.
 */
async function waitForShowtimesList(page) {
  try {
    await page.waitForSelector('#main-content, .sc-19dkgz1-0, [aria-label*="Book "], div[role="button"]', { timeout: 10000 });
  } catch (err) {
    logger.warn('Page container did not render within 10s. Continuing anyway...');
    return;
  }

  try {
    await page.waitForSelector('#main-content a[href*="/cinema"], .sc-19dkgz1-0, [aria-label*="Book "]', { timeout: 5000 });
    logger.success('✓ Showtimes content rendered.');
  } catch (err) {
    logger.warn('No showtimes or cinema rows rendered yet (list may still be empty for this date).');
  }
}

/**
 * Opens a target booking URL directly.
 */
async function openBookingPage(page, config, targetUrl = null) {
  const url = targetUrl || config.booking.url;
  const simConfig = config.simulation || {};

  if (!url || url.trim() === '') {
    throw new Error('No booking URL configured. Set BOOKING_URL in .env');
  }

  logger.info(`Opening booking page: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(simConfig.pageLoadDelay || 1500);

  await waitForShowtimesList(page);

  await captureMilestone(page, 'booking_page_loaded');
  logger.success('✓ Booking page loaded.');
}

module.exports = openBookingPage;
module.exports.waitForShowtimesList = waitForShowtimesList;
