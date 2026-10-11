const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let currentMouseX = 100;
let currentMouseY = 100;
let screenshotCounter = 1;

/**
 * Resets the screenshot counter (useful on fresh monitor runs)
 */
function resetScreenshotCounter() {
  screenshotCounter = 1;
}

/**
 * Capture a sequential screenshot for milestone debugging
 */
async function captureMilestone(page, milestoneName) {
  const prefix = String(screenshotCounter++).padStart(2, '0');
  const screenshotDir = path.join(__dirname, '..', 'logs', 'screenshots');
  
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const filename = `${prefix}_${milestoneName.toLowerCase().replace(/\s+/g, '_')}.png`;
  const fullPath = path.join(screenshotDir, filename);

  try {
    await page.screenshot({ path: fullPath });
    logger.success(`Screenshot saved: logs/screenshots/${filename}`);
    return fullPath;
  } catch (err) {
    logger.error(`Failed to capture screenshot for milestone: ${milestoneName}`, err);
    return null;
  }
}

/**
 * Moves mouse smoothly from current coordinate to the center of the target element
 */
async function smoothMouseMove(page, locator, steps = 25) {
  const box = await locator.boundingBox();
  if (!box) {
    logger.warn('Could not retrieve bounding box for mouse movement.');
    return;
  }

  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;

  // Interpolate mouse coordinates to create a smooth path
  for (let i = 1; i <= steps; i++) {
    const x = currentMouseX + (targetX - currentMouseX) * (i / steps);
    const y = currentMouseY + (targetY - currentMouseY) * (i / steps);
    await page.mouse.move(x, y);
    // Mimic real mouse movement speed
    await new Promise(resolve => setTimeout(resolve, 8));
  }

  currentMouseX = targetX;
  currentMouseY = targetY;
  await page.waitForTimeout(100);
}

/**
 * Injects a visual glow/border to highlight an element
 */
async function highlightElement(locator) {
  try {
    if (await locator.count() === 0) return;
    await Promise.race([
      locator.evaluate((el) => {
        el.style.outline = '3px dashed #f84464';
        el.style.boxShadow = '0 0 15px #f84464, inset 0 0 10px rgba(248, 68, 100, 0.3)';
        el.style.backgroundColor = 'rgba(248, 68, 100, 0.12)';
        el.style.transition = 'all 0.4s ease-in-out';
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
    ]);
  } catch (err) {
    // Fail silently since highlighting is visual-only
  }
}

/**
 * Removes visual highlights from an element
 */
async function unhighlightElement(locator) {
  try {
    if (await locator.count() === 0) return;
    await Promise.race([
      locator.evaluate((el) => {
        el.style.outline = '';
        el.style.boxShadow = '';
        el.style.backgroundColor = '';
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
    ]);
  } catch (err) {
    // Fail silently
  }
}

/**
 * Performs character-by-character typing into a focused locator
 */
async function humanType(page, locator, text, delayMs = 100) {
  await locator.focus();
  await locator.fill(''); // Clear first
  await page.waitForTimeout(300);

  // Type character-by-character using pressSequentially
  await locator.pressSequentially(text, { delay: delayMs });
  await page.waitForTimeout(500);
}

/**
 * Move, highlight, hover, wait, and click an element
 */
async function humanClick(page, locator, simulationConfig) {
  const steps = simulationConfig.mouseMoveSteps || 25;
  const clickDelay = simulationConfig.clickDelay || 500;
  const highlightDuration = simulationConfig.highlightDuration || 700;

  // 1. Move mouse to target
  await smoothMouseMove(page, locator, steps);
  
  // 2. Highlight target
  await highlightElement(locator);
  await page.waitForTimeout(highlightDuration);

  // 3. Hover and click
  try {
    await locator.click({ timeout: 4000 });
  } catch (clickErr) {
    await locator.hover().catch(() => {});
    await page.waitForTimeout(clickDelay);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
  }
  
  // 4. Remove highlight outline
  await unhighlightElement(locator);
  await page.waitForTimeout(200);
}

/**
 * Smooth scrolls the window by a relative amount
 */
async function smoothScroll(page, scrollAmount) {
  await page.evaluate((amount) => {
    return new Promise((resolve) => {
      let currentScroll = 0;
      const step = amount > 0 ? 10 : -10;
      const id = setInterval(() => {
        window.scrollBy(0, step);
        currentScroll += step;
        if (Math.abs(currentScroll) >= Math.abs(amount)) {
          clearInterval(id);
          resolve();
        }
      }, 8);
    });
  }, scrollAmount);
  await page.waitForTimeout(500);
}

module.exports = {
  resetScreenshotCounter,
  captureMilestone,
  smoothMouseMove,
  highlightElement,
  unhighlightElement,
  humanType,
  humanClick,
  smoothScroll
};
