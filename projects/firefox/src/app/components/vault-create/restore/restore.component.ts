import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DEFAULT_SYNC_RELAYS, NavComponent, StorageService, defaultNostrSyncRelayIO } from '@common';

@Component({
  selector: 'app-restore',
  imports: [FormsModule],
  templateUrl: './restore.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './restore.component.scss',
})
export class RestoreComponent extends NavComponent {
  readonly #router = inject(Router);
  readonly #storage = inject(StorageService);
  readonly #changes = inject(ChangeDetectorRef);
  protected phrase = '';
  protected relays = DEFAULT_SYNC_RELAYS.join('\n');
  protected password = '';
  protected minPasswordLength = 4;
  protected busy = false;
  protected error = '';

  protected get canRestore(): boolean {
    return (
      !this.busy &&
      this.phrase.trim().length > 0 &&
      this.password.length >= this.minPasswordLength
    );
  }

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async restore(): Promise<void> {
    if (!this.canRestore) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.#changes.detectChanges();
    try {
      await this.#storage.restoreNewVault(
        this.password,
        this.phrase,
        this.relays,
        defaultNostrSyncRelayIO(),
      );
      await this.#router.navigateByUrl('/home/identities');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Restore failed.';
    } finally {
      this.busy = false;
      this.#changes.detectChanges();
    }
  }

  back(): void {
    if (this.busy) {
      return;
    }
    void this.#router.navigateByUrl('/vault-create/home');
  }
}
