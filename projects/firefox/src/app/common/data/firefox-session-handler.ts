/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSessionData, BrowserSessionHandler } from '@common';
import browser from 'webextension-polyfill';

export class FirefoxSessionHandler extends BrowserSessionHandler {
  async loadFullData(): Promise<Partial<Record<string, any>>> {
    return browser.storage.session.get(null);
  }

  async saveFullData(data: BrowserSessionData): Promise<void> {
    await browser.storage.session.set(data as Record<string, any>);
  }

  async clearData(): Promise<void> {
    await browser.storage.session.clear();
  }
}
