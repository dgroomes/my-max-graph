/**
 * WARNING: Unedited AI output.
 */
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer-core';

export type ChromeLaunchOptions = {
  width: number;
  height: number;
  deviceScaleFactor?: number;
};

/**
 * Launch Chrome for headless render.
 * Resolution order: PUPPETEER_EXECUTABLE_PATH → channel 'chrome' → error with install hint.
 */
export async function launchChrome(options: ChromeLaunchOptions): Promise<Browser> {
  const base: LaunchOptions = {
    headless: true,
    defaultViewport: {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.deviceScaleFactor ?? 2,
    },
    args: ['--no-first-run', '--no-default-browser-check'],
  };

  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) {
    return puppeteer.launch({ ...base, executablePath: fromEnv });
  }

  try {
    return await puppeteer.launch({ ...base, channel: 'chrome' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        'Could not launch Chrome for rendering.',
        'Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH to a Chromium binary.',
        `Detail: ${detail}`,
      ].join(' '),
    );
  }
}
