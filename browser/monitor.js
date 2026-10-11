const logger = require('../utils/logger');
const { getSelectors } = require('../utils/helpers');
const { highlightElement, unhighlightElement, smoothMouseMove } = require('../utils/visual');

async function monitorTicketAvailability(page, config) {
  const selectors = getSelectors();
  const simConfig = config.simulation || {};
  const bookButtonSelector = selectors.moviePage.bookButton;

  try {
    const bookButton = page.locator(bookButtonSelector).first();
    const count = await bookButton.count();

    if (count === 0) {
      return {
        available: false,
        reason: 'Book button not found on page'
      };
    }

    const isVisible = await bookButton.isVisible();
    if (!isVisible) {
      return {
        available: false,
        reason: 'Book button exists but is hidden'
      };
    }

    // Visibly highlight the button to show the user we are inspecting it
    await highlightElement(bookButton);
    await page.waitForTimeout(simConfig.highlightDuration || 700);

    // Comprehensive check to see if the button is disabled
    const isDisabled = await bookButton.evaluate((el) => {
      const style = window.getComputedStyle(el);
      
      const hasDisabledAttr = el.hasAttribute('disabled') || el.getAttribute('disabled') === 'true';
      const hasAriaDisabled = el.getAttribute('aria-disabled') === 'true';
      const hasDisabledClass = el.classList.contains('disabled') || 
                               Array.from(el.classList).some(cls => cls.toLowerCase().includes('disabled'));
      const hasPointerEventsNone = style.pointerEvents === 'none';
      
      return hasDisabledAttr || hasAriaDisabled || hasDisabledClass || hasPointerEventsNone;
    });

    if (isDisabled) {
      // Remove outline highlight after inspection
      await unhighlightElement(bookButton);
      return {
        available: false,
        reason: 'Book button is visible but currently disabled'
      };
    }

    // Book button is visible and enabled!
    // Move the mouse smoothly to the button
    logger.action('Hovering mouse over enabled booking button...');
    await smoothMouseMove(page, bookButton, simConfig.mouseMoveSteps || 25);

    return {
      available: true,
      reason: 'Book button is visible and enabled!'
    };
  } catch (err) {
    logger.error('Error occurred while checking button status', err);
    return {
      available: false,
      reason: `Error during check: ${err.message}`
    };
  }
}

module.exports = monitorTicketAvailability;
