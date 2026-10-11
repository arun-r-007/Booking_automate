const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load config.json: ${err.message}`);
  }
}

function getSelectors() {
  const selectorsPath = path.join(__dirname, '..', 'config', 'selectors.json');
  try {
    const raw = fs.readFileSync(selectorsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load selectors.json: ${err.message}`);
  }
}

module.exports = {
  sleep,
  getConfig,
  getSelectors
};
