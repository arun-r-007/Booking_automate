const logger = require('../utils/logger');
const { sleep, getSelectors } = require('../utils/helpers');
const { 
  captureMilestone, 
  humanClick, 
  humanType, 
  smoothScroll, 
  highlightElement, 
  unhighlightElement,
  smoothMouseMove
} = require('../utils/visual');

async function searchMovie(page, config) {
  const movieConfig = config.movie;
  const simConfig = config.simulation || {};
  const selectors = getSelectors();

  // If directUrl is configured (used for Dry-Run/Mock or override), navigate directly but still simulate human behaviors
  if (movieConfig.directUrl && movieConfig.directUrl.trim() !== '') {
    logger.info(`[Step 2/7] Direct URL provided: ${movieConfig.directUrl}`);
    logger.action('Navigating directly to target URL...');
    await page.goto(movieConfig.directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(simConfig.pageLoadDelay || 2000);
    await captureMilestone(page, 'movie_page_direct');
    
    logger.action('Simulating human scrolling on target page...');
    await smoothScroll(page, 200);
    await sleep(1000);
    return;
  }

  // --- STEP 2: Open BookMyShow Homepage ---
  logger.info('[Step 2/7] Opening BookMyShow homepage...');
  logger.action('Navigating to https://in.bookmyshow.com/ ...');
  await page.goto('https://in.bookmyshow.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(simConfig.pageLoadDelay || 2000);
  await captureMilestone(page, 'homepage_loaded');
  logger.success('✓ Homepage loaded successfully.');

  // --- STEP 3: Handle City Selection Popup ---
  logger.info('[Step 3/7] Handling location selection...');
  try {
    const searchBox = page.locator(selectors.citySelector.searchBox);
    const isModalVisible = await searchBox.count() > 0 || await page.locator(`text=Select your city`).count() > 0;

    if (isModalVisible) {
      logger.action(`City selection modal detected. Locating city: ${movieConfig.city}...`);
      
      // Try to find the city in the popular list first
      const popularCity = page.locator(`ul li span:has-text("${movieConfig.city}"):visible, span:has-text("${movieConfig.city}"):visible, p:has-text("${movieConfig.city}"):visible`).first();
      
      if (await popularCity.count() > 0) {
        logger.action(`Moving mouse to city button: ${movieConfig.city}...`);
        await humanClick(page, popularCity, simConfig);
      } else {
        // If not in popular list, type in the city search box
        logger.action(`City not in popular list. Moving to city search box...`);
        const searchInput = searchBox.first();
        await humanClick(page, searchInput, simConfig);
        await humanType(page, searchInput, movieConfig.city, simConfig.typingDelay || 100);
        
        logger.action('Selecting the first city suggestion...');
        const citySuggestion = page.locator('div[data-result-item="true"]').filter({ hasText: movieConfig.city }).first();
        await citySuggestion.waitFor({ state: 'visible', timeout: 10000 });
        await humanClick(page, citySuggestion, simConfig);
        
        logger.info('Waiting for city selection modal to close...');
        await page.locator(`text=Select your city`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
        await searchBox.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
        await sleep(1500);
      }
      
      await captureMilestone(page, 'city_selected');
      logger.success(`✓ City selected: ${movieConfig.city}`);
    } else {
      logger.info('City selection modal did not appear. Skipping select city step.');
    }
  } catch (err) {
    logger.warn(`Could not complete visual city selection: ${err.message}. Proceeding...`);
  }

  // --- STEP 4: Clicking Search Icon ---
  logger.info('[Step 4/7] Opening Search bar...');
  try {
    const searchTrigger = page.locator(selectors.search.searchContainer).first();
    await searchTrigger.waitFor({ state: 'visible', timeout: 8000 });
    
    logger.action('Moving mouse to search trigger bar...');
    await humanClick(page, searchTrigger, simConfig);
    await sleep(1000);
    await captureMilestone(page, 'search_opened');
    logger.success('✓ Search bar activated.');
  } catch (err) {
    logger.error('Failed to locate or click search trigger bar', err);
    throw err;
  }

  // --- STEP 5: Type Movie Name character-by-character ---
  logger.info(`[Step 5/7] Typing movie name: "${movieConfig.name}"...`);
  try {
    const searchInput = page.locator(selectors.search.searchInput).first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    
    logger.action('Focusing search input field...');
    await smoothMouseMove(page, searchInput, simConfig.mouseMoveSteps || 25);
    await highlightElement(searchInput);
    
    logger.action('Typing movie name character-by-character...');
    await humanType(page, searchInput, movieConfig.name, simConfig.typingDelay || 100);
    await unhighlightElement(searchInput);
    logger.success('✓ Movie name entered.');
  } catch (err) {
    logger.error('Failed to focus or type in search field', err);
    throw err;
  }

  // --- STEP 6: Selecting the Movie Result ---
  logger.info('[Step 6/7] Selecting the first movie suggestion...');
  try {
    // Target the first element in the searchResultsV2 container
    const movieResult = page.locator('#searchResultsV2 > div, #searchResultsV2 li, #searchResultsV2 a').first();
    await movieResult.waitFor({ state: 'visible', timeout: 15000 });
    
    logger.action(`Moving mouse to first suggestion for "${movieConfig.name}"...`);
    await humanClick(page, movieResult, simConfig);
    
    await page.waitForLoadState('domcontentloaded');
    await sleep(simConfig.pageLoadDelay || 2000);
    await captureMilestone(page, 'movie_page_loaded');
    logger.success('✓ Movie details page opened.');
  } catch (err) {
    logger.error(`Could not locate or click suggestions for movie: ${movieConfig.name}`, err);
    throw err;
  }

  // --- STEP 7: Smooth Scrolling on Movie Details page ---
  logger.info('[Step 7/7] Scrolling movie details page...');
  logger.action('Performing smooth scroll to mimic reading/focusing contents...');
  await smoothScroll(page, 300);
  await sleep(1000);
  await captureMilestone(page, 'monitoring_ready');
  logger.success('✓ Page scrolled and ready for monitoring.');
}

module.exports = searchMovie;
