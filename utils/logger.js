const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'app.log');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Colors for console
const COLORS = {
  reset: '\x1b[0m',
  info: '\x1b[36m',     // Cyan
  action: '\x1b[35m',   // Magenta
  success: '\x1b[32m',  // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
  timestamp: '\x1b[90m' // Gray
};

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function writeToFile(level, message) {
  const logLine = `[${getTimestamp()}] [${level.toUpperCase()}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

const logger = {
  info: (msg) => {
    console.log(`${COLORS.timestamp}[${getTimestamp()}]${COLORS.reset} ${COLORS.info}[INFO]${COLORS.reset} ${msg}`);
    writeToFile('info', msg);
  },
  action: (msg) => {
    console.log(`${COLORS.timestamp}[${getTimestamp()}]${COLORS.reset} ${COLORS.action}[ACTION]${COLORS.reset} ${msg}`);
    writeToFile('action', msg);
  },
  success: (msg) => {
    console.log(`${COLORS.timestamp}[${getTimestamp()}]${COLORS.reset} ${COLORS.success}[SUCCESS]${COLORS.reset} ${msg}`);
    writeToFile('success', msg);
  },
  warn: (msg) => {
    console.warn(`${COLORS.timestamp}[${getTimestamp()}]${COLORS.reset} ${COLORS.warn}[WARN]${COLORS.reset} ${msg}`);
    writeToFile('warn', msg);
  },
  error: (msg, err) => {
    let output = msg;
    if (err) {
      output += ` | Error: ${err.message || err}\n${err.stack || ''}`;
    }
    console.error(`${COLORS.timestamp}[${getTimestamp()}]${COLORS.reset} ${COLORS.error}[ERROR]${COLORS.reset} ${output}`);
    writeToFile('error', output);
  }
};

module.exports = logger;
