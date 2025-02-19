/* eslint-disable @typescript-eslint/no-explicit-any */
import { GootiMetaData, GootiMetaHandler } from '@common';

export class ChromeMetaHandler extends GootiMetaHandler {
  async loadFullData(): Promise<Partial<Record<string, any>>> {
    const dataWithPossibleAlienProperties = await chrome.storage.local.get(
      null
    );

    if (Object.keys(dataWithPossibleAlienProperties).length === 0) {
      return dataWithPossibleAlienProperties;
    }

    const data: Partial<Record<string, any>> = {};
    this.metaProperties.forEach((property) => {
      data[property] = dataWithPossibleAlienProperties[property];
    });

    return data;
  }

  async saveFullData(data: GootiMetaData): Promise<void> {
    await chrome.storage.local.set(data);
  }

  async clearData(keep: string[]): Promise<void> {
    const toBeRemovedProperties: string[] = [];

    for (const property of this.metaProperties) {
      if (!keep.includes(property)) {
        toBeRemovedProperties.push(property);
      }
    }

    await chrome.storage.local.remove(toBeRemovedProperties);
  }
}
