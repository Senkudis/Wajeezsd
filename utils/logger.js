const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['password', 'token', 'authorization', '*.password', '*.token']
});

module.exports = logger;
