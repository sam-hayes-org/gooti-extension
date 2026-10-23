import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GootiMetaData_VaultSnapshot,
  NavComponent,
  StartupService,
  StorageService,
} from '@common';
import browser from 'webextension-polyfill';
import { getNewStorageServiceConfig } from '../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-vault-import',
  imports: [FormsModule],
  templateUrl: './vault-import.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './vault-import.component.scss',
})
export class VaultImportComponent extends NavComponent implements OnInit {
  snapshots: GootiMetaData_VaultSnapshot[] = [];
  selectedSnapshot: GootiMetaData_VaultSnapshot | undefined;

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
      this.#startup.startOver(
        getNewStorageServiceConfig(),
        this.#startup.startupDetails,
      );
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async #loadData() {
    this.snapshots = (
      this.#storage.getGootiMetaHandler().gootiMetaData?.vaultSnapshots ?? []
    ).sortBy((x) => x.fileName, 'desc');
  }
}
