const fs = require('fs');
const path = require('path');
const winston = require('winston');

const logsDir = path.join(__dirname, '../logs');
const isTest = process.env.NODE_ENV === 'test';
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const pretty = process.env.LOG_PRETTY === '1' || process.env.NODE_ENV === 'development';

const redact = winston.format((info) => {
  const scrub = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgres://***');
  };
  info.message = scrub(info.message);
  if (info.stack) info.stack = scrub(info.stack);
  Object.keys(info).forEach((key) => {
    if (typeof info[key] === 'string') info[key] = scrub(info[key]);
  });
  return info;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  redact(),
);

const prettyFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const extra = Object.keys(meta).filter((k) => k !== 'service').length
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestamp} ${level}: ${message}${extra}`;
  }),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'educonnect' },
  format: baseFormat,
  transports: [
    new winston.transports.Console({
      silent: isTest,
      format: pretty ? prettyFormat : winston.format.json(),
    }),
  ],
});

if (!isTest && !isServerless) {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    logger.add(new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.json(),
    }));
    logger.add(new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.json(),
    }));
  } catch (err) {
    logger.warn('file logs disabled', { error: err.message });
  }
}

module.exports = logger;
