/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSyncFlow, GootiMetaData } from './types';

export abstract class GootiMetaHandler {
  get gootiMetaData(): GootiMetaData | undefined {
    return this.#gootiMetaData;
  }

  #gootiMetaData?: GootiMetaData;

  readonly metaProperties = ['syncFlow'];
  /**
   * Load the full data from the storage. If the storage is used for storing
   * other data (e.g. browser sync data when the user decided to NOT sync),
   * make sure to handle the "meta properties" to only load these.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;

  setFullData(data: GootiMetaData) {
    this.#gootiMetaData = data;
  }

  abstract saveFullData(data: GootiMetaData): Promise<void>;

  /**
   * Sets the browser sync flow for the user and immediately saves it.
   */
  async setBrowserSyncFlow(flow: BrowserSyncFlow): Promise<void> {
    if (!this.#gootiMetaData) {
      this.#gootiMetaData = {
        syncFlow: flow,
      };
    } else {
      this.#gootiMetaData.syncFlow = flow;
    }

    await this.saveFullData(this.#gootiMetaData);
  }

  abstract clearData(): Promise<void>;
}
