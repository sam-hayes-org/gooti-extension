import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BrowserSyncFlow,
  GootiMetaData_VaultSnapshot,
  IconButtonComponent,
  NavComponent,
  StartupService,
  StorageService,
} from '@common';
import browser from 'webextension-polyfill';
import { getNewStorageServiceConfig } from '../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-vault-import',
  imports: [IconButtonComponent, FormsModule],
  templateUrl: './vault-import.component.html',
  styleUrl: './vault-import.component.scss',
})
export class VaultImportComponent extends NavComponent implements OnInit {
  snapshots: GootiMetaData_VaultSnapshot[] = [];
  selectedSnapshot: GootiMetaData_VaultSnapshot | undefined;
  syncText: string | undefined;

  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);

  async openOptionsPage() {
    await browser.runtime.openOptionsPage();
  }

  ngOnInit(): void {
    this.#loadData();
  }

  async onClickImport() {
    if (!this.selectedSnapshot) {
      return;
    }

    try {
      await this.#storage.deleteVault(true);
      await this.#storage.importVault(this.selectedSnapshot.data);
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async #loadData() {
    this.snapshots = (
      this.#storage.getGootiMetaHandler().gootiMetaData?.vaultSnapshots ?? []
    ).sortBy((x) => x.fileName, 'desc');

    const syncFlow =
      this.#storage.getGootiMetaHandler().gootiMetaData?.syncFlow;

    switch (syncFlow) {
      case BrowserSyncFlow.BROWSER_SYNC:
        this.syncText = 'MOZILLA FIREFOX';
        break;

      default:
      case BrowserSyncFlow.NO_SYNC:
        this.syncText = 'OFF';
        break;
    }
  }
}
