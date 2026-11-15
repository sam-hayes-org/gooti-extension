import { Component, inject, ChangeDetectionStrategy, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  DateHelper,
  NavComponent,
  BackupPanelComponent,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from '../../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-settings',
  imports: [ConfirmComponent, BackupPanelComponent],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings.component.scss',
})
export class SettingsComponent extends NavComponent {
  readonly backupPanel = viewChild(BackupPanelComponent);
  readonly #storage = inject(StorageService);
  readonly #startup = inject(StartupService);
  readonly #router = inject(Router);

  async onSignOut() {
    await this.#storage.signOut();
    await this.#router.navigateByUrl('/vault-login', { replaceUrl: true });
  }

  async onResetExtension() {
    try {
      await this.#storage.resetExtension();
      this.#startup.startOver(
        getNewStorageServiceConfig(),
        this.#startup.startupDetails,
      );
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async onClickExportVault() {
    const jsonVault = this.#storage.exportVault();

    const dateTimeString = DateHelper.dateToISOLikeButLocal(new Date());
    const fileName = `Gooti Chrome - Export - ${dateTimeString}.json`;

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
