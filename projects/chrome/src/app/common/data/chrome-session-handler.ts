/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSessionData, BrowserSessionHandler } from '@common';

export class ChromeSessionHandler extends BrowserSessionHandler {
  constructor() {
    super();
    if (!chrome.storage?.onChanged) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'session') {
        this.applySiteChanges(changes);
      }
    });
  }

  async loadFullData(): Promise<Partial<Record<string, any>>> {
    return chrome.storage.session.get(null);
  }

  async saveFullData(data: BrowserSessionData): Promise<void> {
    await chrome.storage.session.set(data);
  }

  async removeKeys(keys: string[]): Promise<void> {
    await chrome.storage.session.remove(keys);
  }

  async clearData(): Promise<void> {
    await chrome.storage.session.clear();
  }
}
