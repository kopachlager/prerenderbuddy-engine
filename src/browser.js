import { chromium } from 'playwright';

let browser;

export async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browser.on('disconnected', () => { browser = undefined; });
  }
  return browser;
}

export function isBrowserReady() {
  return Boolean(browser?.isConnected());
}

export async function closeBrowser() {
  if (!browser) return;
  await browser.close();
  browser = undefined;
}
