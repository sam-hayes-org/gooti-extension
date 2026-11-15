/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSessionData, BrowserSessionHandler } from '@common';
import browser from 'webextension-polyfill';

export class FirefoxSessionHandler extends BrowserSessionHandler {
  constructor() {
    super();
    if (!browser.storage?.onChanged) {
      return;
    }
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'session') {
        this.applySiteChanges(changes);
      }
    });
  }

  async loadFullData(): Promise<Partial<Record<string, any>>> {
    return browser.storage.session.get(null);
  }

  async saveFullData(data: BrowserSessionData): Promise<void> {
    await browser.storage.session.set(data as Record<string, any>);
  }

  async removeKeys(keys: string[]): Promise<void> {
    await browser.storage.session.remove(keys);
  }

  async clearData(): Promise<void> {
    await browser.storage.session.clear();
  }
}
