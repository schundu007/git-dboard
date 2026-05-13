// src/utils/logger.ts
// Structured JSON logger (pino).  In development the output is pretty-printed.
// All modules import { logger } from here — avoids console.log in production.

import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level:     config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: {
    service: 'isaaclab-pr-handler',
    env:     config.NODE_ENV,
  },
  // Redact potentially sensitive fields in log output
  redact: ['req.headers.authorization', 'req.headers["x-hub-signature-256"]'],
});
