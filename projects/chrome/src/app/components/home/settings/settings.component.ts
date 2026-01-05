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
import { CommonModule, DecimalPipe, NgTemplateOutlet } from '@angular/common';

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent, DecimalPipe, NgTemplateOutlet, CommonModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent implements OnInit {
  syncFlow: string | undefined;
  syncUtilization:
    | {
        kiloBytesInUse: number;
        quotaKiloBytes: number;
        quotaKiloBytesPerItem: number;
        utilizationBytes: number;
        itemsInUse: number;
        quotaItems: number;
        utilizationItems: number;
        itemIdentitiesKiloBytesInUse: number;
        utilizationIdentities: number;
        itemPermissionsKiloBytesInUse: number;
        utilizationPermissions: number;
        itemRelaysKiloBytesInUse: number;
        utilizationRelays: number;
      }
    | undefined;

  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);

  ngOnInit(): void {
    this.#loadData();

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

  async onClickExportVault() {
    const jsonVault = this.#storage.exportVault();

    const dateTimeString = DateHelper.dateToISOLikeButLocal(new Date());
    const fileName = `Gooti Chrome - Vault Export - ${dateTimeString}.json`;

    this.#downloadJson(jsonVault, fileName);
  }

  async #loadData() {
    const bsh = this.#storage.getBrowserSyncHandler();
    if (!bsh.browserSyncData) {
      return;
    }
    const browserSyncUtilization = await bsh.getUtilization?.();

    if (!browserSyncUtilization) {
      return;
    }

    const kiloBytesInUse = browserSyncUtilization.bytesInUse / 1024;
    const quotaKiloBytes = browserSyncUtilization.quotaBytes / 1024;
    const quotaKiloBytesPerItem =
      browserSyncUtilization.quotaBytesPerItem / 1024;
    const itemsInUse = Object.keys(bsh.browserSyncData).length;

    const itemIdentitiesKiloBytesInUse =
      (JSON.stringify(bsh.browserSyncData.identities, null, 0).length +
        'identities'.length) /
      1024;
    const itemPermissionsKiloBytesInUse =
      (JSON.stringify(bsh.browserSyncData.permissions, null, 0).length +
        'permissions'.length) /
      1024;
    const itemRelaysKiloBytesInUse =
      (JSON.stringify(bsh.browserSyncData.relays, null, 0).length +
        'relays'.length) /
      1024;

    this.syncUtilization = {
      kiloBytesInUse,
      quotaKiloBytes,
      quotaKiloBytesPerItem,
      utilizationBytes: (kiloBytesInUse / quotaKiloBytes) * 100,
      quotaItems: browserSyncUtilization.quotaItems,
      itemsInUse,
      utilizationItems: (itemsInUse / browserSyncUtilization.quotaItems) * 100,
      itemIdentitiesKiloBytesInUse,
      utilizationIdentities:
        (itemIdentitiesKiloBytesInUse / quotaKiloBytesPerItem) * 100,
      itemPermissionsKiloBytesInUse,
      utilizationPermissions:
        (itemPermissionsKiloBytesInUse / quotaKiloBytesPerItem) * 100,
      itemRelaysKiloBytesInUse,
      utilizationRelays:
        (itemRelaysKiloBytesInUse / quotaKiloBytesPerItem) * 100,
    };
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
