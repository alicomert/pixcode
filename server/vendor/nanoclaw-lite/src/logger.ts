import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NANOCLAW_NO_PRETTY
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});

// Only take over process lifecycle when running standalone (not inside Pixcode daemon)
if (process.env.NANOCLAW_STANDALONE === '1') {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
  });
}
