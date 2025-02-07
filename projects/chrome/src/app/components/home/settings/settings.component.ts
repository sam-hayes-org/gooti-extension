import { Component, inject, OnInit } from '@angular/core';
import {
  BrowserSyncData,
  BrowserSyncFlow,
  ConfirmComponent,
  DateHelper,
  NavComponent,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent implements OnInit {
  syncFlow: string | undefined;

  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);

  ngOnInit(): void {
    const vault = JSON.stringify(
      this.#storage.getBrowserSyncHandler().browserSyncData
    );
    console.log(vault.length / 1024 + ' KB');

    switch (this.#storage.getGootiMetaHandler().gootiMetaData?.syncFlow) {
      case BrowserSyncFlow.NO_SYNC:
        this.syncFlow = 'Off';
        break;

      case BrowserSyncFlow.BROWSER_SYNC:
        this.syncFlow = 'Google Chrome';
        break;

      default:
        break;
    }
  }

  async onResetExtension() {
    try {
      await this.#storage.resetExtension();
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  onImportVault() {
    (this as unknown as HTMLInputElement).click();
  }

  async onImportFileChange(event: Event) {
    try {
      const element = event.currentTarget as HTMLInputElement;
      const file = element.files !== null ? element.files[0] : undefined;
      if (!file) {
        return;
      }

      const text = await file.text();
      const vault = JSON.parse(text) as BrowserSyncData;

      await this.#storage.deleteVault(true);
      await this.#storage.importVault(vault);
      this.#storage.isInitialized = false;
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async onClickExportVault() {
    const jsonVault = this.#storage.exportVault();

    const dateTimeString = DateHelper.dateToISOLikeButLocal(new Date());
    const fileName = `Gooti Chrome - Vault Export - ${dateTimeString}.json`;

    this.#downloadJson(jsonVault, fileName);
  }

  #downloadJson(jsonString: string, fileName: string) {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(jsonString);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }
}
