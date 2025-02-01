/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Array<T> {
    /**
     * Sorts the array by the provided property and returns a new sorted array.
     * Default sorting is ASC. You can apply DESC sorting by using the optional parameter "order = 'desc'"
     */
    sortBy<K>(keyFunction: (t: T) => K, order?: 'asc' | 'desc'): T[];

    /** Check if the array is empty. */
    empty(): boolean;

    groupBy<K, R>(
      keyFunction: (t: T) => K,
      reduceFn: (items: T[]) => R
    ): Map<K, R>;
  }
}

if (!Array.prototype.empty) {
  Array.prototype.empty = function (): boolean {
    return this.length === 0;
  };
}

if (!Array.prototype.sortBy) {
  Array.prototype.sortBy = function <T, K>(
    keyFunction: (t: T) => K,
    order?: string
  ): T[] {
    if (this.length === 0) {
      return [];
    }

    // determine sort order (asc or desc / asc is default)
    let asc = true;
    if (order === 'desc') {
      asc = false;
    }

    const arrayClone = Array.from(this) as any[];
    const firstSortProperty = keyFunction(arrayClone[0]);

    if (typeof firstSortProperty === 'string') {
      // string in-place sort
      arrayClone.sort((a, b) => {
        if (asc) {
          return ('' + (keyFunction(a) as unknown as string)).localeCompare(
            keyFunction(b) as unknown as string
          );
        }

        return ('' + (keyFunction(b) as unknown as string)).localeCompare(
          keyFunction(a) as unknown as string
        );
      });
    } else if (typeof firstSortProperty === 'number') {
      // number in-place sort
      if (asc) {
        arrayClone.sort(
          (a, b) => Number(keyFunction(a)) - Number(keyFunction(b))
        );
      } else {
        arrayClone.sort(
          (a, b) => Number(keyFunction(b)) - Number(keyFunction(a))
        );
      }
    } else {
      throw new Error('sortBy is not implemented for that type!');
    }

    return arrayClone;
  };
}

if (!Array.prototype.groupBy) {
  Array.prototype.groupBy = function <T>(
    fn: (item: T) => any,
    reduceFn: (items: T[]) => any
  ): Map<any, any> {
    const result = new Map<any, any>();

    const distinctKeys = new Set<any>(this.map((x) => fn(x)));

    for (const distinctKey of distinctKeys) {
      const distinctKeyItems = this.filter((x) => fn(x) === distinctKey);

      result.set(distinctKey, reduceFn(distinctKeyItems));
    }

    return result;
  };
}

export {};
