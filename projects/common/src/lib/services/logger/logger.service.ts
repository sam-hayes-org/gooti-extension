/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  #namespace: string | undefined;

  initialize(namespace: string): void {
    this.#namespace = namespace;
  }

  log(value: any) {
    this.#assureInitialized();

    const nowString = new Date().toLocaleString();

    console.log(`[${this.#namespace} - ${nowString}]`, JSON.stringify(value));
  }

  #assureInitialized() {
    if (!this.#namespace) {
      throw new Error(
        'LoggerService not initialized. Please call initialize(..) first.'
      );
    }
  }
}
