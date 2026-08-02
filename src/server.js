import { createApp } from './app.js';
import { closeBrowser, getBrowser } from './browser.js';
import { assertValidConfiguration } from './config.js';
import { ENGINE_VERSION } from './version.js';

const port = Number(process.env.PORT || 3000);

async function start() {
  assertValidConfiguration();
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid TCP port');

  await getBrowser();
  const server = createApp().listen(port, '0.0.0.0', () => {
    console.log(`Prerender Buddy Engine ${ENGINE_VERSION} listening on port ${port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down`);
    server.close(async () => {
      await closeBrowser().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
