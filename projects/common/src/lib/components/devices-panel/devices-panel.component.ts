import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getPublicKey } from 'nostr-tools';
import { DeviceRecord, browserCode } from '../../backup/device';
import { hexToBytes } from '../../backup/state';
import { defaultBackupRelayIO } from '../../backup/pool';
import { daysAgo } from '../../sites/site-identity';
import { StorageService } from '../../services/storage/storage.service';
import { deviceName } from '../../services/storage/related/devices';
import { ConfirmComponent } from '../confirm/confirm.component';

/** One row in "Devices". `here` is this browser. */
export interface DeviceRow {
  id: string;
  name: string;
  app: DeviceRecord['app'];
  here: boolean;
  /** Absent for this browser before its first device record. */
  backedUpAt?: number;
}

/**
 * "Devices" in Settings: every Gooti that uses this backup, from their device records on the
 * relays. Removing one only takes it off the list; it comes back when it backs up.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-devices-panel',
  imports: [ConfirmComponent, FormsModule],
  templateUrl: './devices-panel.component.html',
  styleUrl: './devices-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesPanelComponent {
  /** Backup is on and unlocked. The list loads when this turns true. */
  readonly ready = input(false);

  readonly #storage = inject(StorageService);
  private readonly confirm = viewChild<ConfirmComponent>('confirm');

  readonly rows = signal<DeviceRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly renaming = signal(false);
  readonly busy = signal(false);
  nameDraft = '';

  constructor() {
    effect(() => {
      if (this.ready()) {
        void this.load();
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const { devices, thisId } = await this.#storage.listDevices(defaultBackupRelayIO());
      this.rows.set(deviceRows(devices, thisId, this.#localName()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read the relays.');
      // This browser is known without the relays.
      const id = this.#storage.getBrowserSessionHandler().browserSessionData?.backupState?.device?.id;
      if (this.rows().length === 0 && id) {
        this.rows.set([{ id, name: this.#localName(), app: 'browser', here: true }]);
      }
    } finally {
      this.loading.set(false);
    }
  }

  note(row: DeviceRow): string {
    const backedUp =
      row.backedUpAt === undefined ? 'Shows up here after its next backup' : `Backed up ${daysAgo(row.backedUpAt)}`;
    const code = row.here ? this.#thisCode() : undefined;
    return code ? `${backedUp} · Code ${code}` : backedUp;
  }

  /** This browser's code for Gooti Desktop, once it has its own key. */
  #thisCode(): string | undefined {
    const key = this.#storage.getBrowserSessionHandler().browserSessionData?.backupState?.device?.browserKey;
    return key ? browserCode(getPublicKey(hexToBytes(key))) : undefined;
  }

  onRename(row: DeviceRow): void {
    this.nameDraft = row.name;
    this.renaming.set(true);
  }

  onCancelRename(): void {
    this.renaming.set(false);
  }

  async onSaveName(): Promise<void> {
    await this.#run(async () => {
      await this.#storage.renameThisDevice(this.nameDraft, defaultBackupRelayIO());
      this.renaming.set(false);
      await this.load();
    });
  }

  onRemove(row: DeviceRow): void {
    this.confirm()?.show(removeMessage(row), () =>
      this.#run(async () => {
        await this.#storage.removeDeviceFromList(row.id, defaultBackupRelayIO());
        this.rows.update((rows) => rows.filter((item) => item.id !== row.id));
      }),
    );
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }

  #localName(): string {
    const device = this.#storage.getBrowserSessionHandler().browserSessionData?.backupState?.device;
    return device ? deviceName(device) : deviceName({ id: '' });
  }
}

/** This browser first, then the others, newest backup first. */
export function deviceRows(devices: readonly DeviceRecord[], thisId: string, localName: string): DeviceRow[] {
  const rows: DeviceRow[] = devices.map((device) => ({
    id: device.id,
    name: device.name,
    app: device.app,
    here: device.id === thisId,
    backedUpAt: device.backedUpAt,
  }));
  const here = rows.find((row) => row.here);
  const others = rows.filter((row) => !row.here);
  return [here ?? { id: thisId, name: localName, app: 'browser', here: true }, ...others];
}

/**
 * Removing only tidies the list. For a browser, the message names what does stop it: Disconnect
 * in Gooti Desktop.
 */
export function removeMessage(row: Pick<DeviceRow, 'name' | 'app'>): string {
  const base = `Remove "${row.name}" from the list? It shows up again if it backs up.`;
  return row.app === 'browser'
    ? `${base} To stop a lost browser from signing through Gooti Desktop, disconnect it there under Connections.`
    : base;
}
