/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSessionData } from './types';

export abstract class BrowserSessionHandler {
  get browserSessionData(): BrowserSessionData | undefined {
    return this.#browserSessionData;
  }

  #browserSessionData?: BrowserSessionData;

  /**
   * Load the data from the browser session storage. It should be an empty object,
   * if no data is available yet (e.g. because the vault (from the browser sync data)
   * was not unlocked via password).
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;
  setFullData(data: BrowserSessionData) {
    this.#browserSessionData = JSON.parse(JSON.stringify(data));
  }

  /**
   * Persist the full data to the session data storage.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards of before to update the in-memory data.
   */
  abstract saveFullData(data: BrowserSessionData): Promise<void>;

  abstract clearData(): Promise<void>;
}
