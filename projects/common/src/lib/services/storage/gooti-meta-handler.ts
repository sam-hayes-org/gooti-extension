/* eslint-disable @typescript-eslint/no-explicit-any */
import { GOOTI_META_PROPERTIES, GootiMetaData } from './types';

export abstract class GootiMetaHandler {
  get gootiMetaData(): GootiMetaData | undefined {
    return this.#gootiMetaData;
  }

  #gootiMetaData?: GootiMetaData;

  readonly metaProperties: string[] = [...GOOTI_META_PROPERTIES];
  /**
   * Load the full data from the storage. Local storage also holds the vault,
   * so only the meta properties are returned.
   *
   * ATTENTION: Make sure to call "setFullData(..)" afterwards to update the in-memory data.
   */
  abstract loadFullData(): Promise<Partial<Record<string, any>>>;

  setFullData(data: GootiMetaData) {
    this.#gootiMetaData = data;
  }

  abstract saveFullData(data: GootiMetaData): Promise<void>;

  abstract clearData(keep: string[]): Promise<void>;
}
