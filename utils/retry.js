const logger = require('./logger');
const { sleep } = require('./helpers');

async function retry(fn, retries = 3, delay = 2000, context = 'Operation') {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) {
        logger.error(`${context} failed after ${retries} attempts.`, err);
        throw err;
      }
      logger.warn(`${context} failed (attempt ${attempt}/${retries}): ${err.message || err}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

module.exports = { retry };
