/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSessionData, Site_DECRYPTED } from './types';

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

  /** Drop the unlocked copy. Storage is cleared separately. */
  forget(): void {
    this.#browserSessionData = undefined;
  }

  /**
   * Persist the full data to the session data storage.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards of before to update the in-memory data.
   */
  abstract saveFullData(data: BrowserSessionData): Promise<void>;

  /** Drop keys that a merge-style session.set would otherwise keep. */
  abstract removeKeys(keys: string[]): Promise<void>;

  /**
   * Patch site rows written by the background into this popup's copy.
   * An explicit write from this same object is applied again and stays the same.
   */
  applySiteChanges(changes: Record<string, { newValue?: unknown }>): void {
    const session = this.#browserSessionData;
    if (!session) {
      return;
    }
    if ('sites' in changes) {
      const next = changes['sites'].newValue;
      session.sites = Array.isArray(next)
        ? next.filter((id): id is string => typeof id === 'string')
        : [];
    }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith('site_')) {
        continue;
      }
      const siteKey = key as `site_${string}`;
      if (change.newValue === undefined) {
        delete session[siteKey];
        continue;
      }
      const row = change.newValue as Partial<Site_DECRYPTED>;
      if (
        typeof row.id === 'string' &&
        typeof row.identityId === 'string' &&
        typeof row.host === 'string'
      ) {
        session[siteKey] = { id: row.id, identityId: row.identityId, host: row.host };
      }
    }
  }

  abstract clearData(): Promise<void>;
}
