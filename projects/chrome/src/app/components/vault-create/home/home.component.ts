import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BrowserSyncData, StartupService, StorageService } from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly router = inject(Router);
  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);

  async onImportFileChange(event: Event) {
    try {
      const element = event.currentTarget as HTMLInputElement;
      const file = element.files !== null ? element.files[0] : undefined;
      if (!file) {
        return;
      }

      const text = await file.text();
      const vault = JSON.parse(text) as BrowserSyncData;
      console.log(vault);

      await this.#storage.importVault(vault);
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }
}
