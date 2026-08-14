const fs = require('fs');
const path = require('path');
const winston = require('winston');

const logsDir = path.join(__dirname, '../logs');
const isTest = process.env.NODE_ENV === 'test';
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'edupay-ci' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      silent: isTest,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).filter((k) => k !== 'service').length
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `${timestamp} ${level}: ${message}${extra}`;
        }),
      ),
    }),
  ],
});

if (!isTest && !isServerless) {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    logger.add(new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }));
    logger.add(new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }));
  } catch (err) {
    logger.warn('file logs disabled', { error: err.message });
  }
}

module.exports = logger;
