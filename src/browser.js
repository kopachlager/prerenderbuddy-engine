import { chromium } from 'playwright';

let browser;

export async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (!browser) return;
  await browser.close();
  browser = undefined;
}
