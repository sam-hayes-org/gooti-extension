import { Component, inject, OnInit } from '@angular/core';
import {
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
        this.syncFlow = 'Mozilla Firefox';
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
