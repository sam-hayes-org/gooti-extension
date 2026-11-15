import { getPublicKey } from 'nostr-tools';
import { CryptoHelper, VAULT_CANARY } from '../../helpers/crypto-helper';
import { sealSharedDocument } from '../../backup/blob';
import { SharedDocument } from '../../backup/document';
import { buildBackupEvent } from '../../backup/event';
import { deriveSharedKeys } from '../../backup/phrase';
import {
  bytesToHex,
  hexToBytes,
  BackupState,
  parseBackupState,
  backupKeysFromState,
} from '../../backup/state';
import { BrowserSessionHandler } from './browser-session-handler';
import { GootiMetaHandler } from './gooti-meta-handler';
import { StorageService } from './storage.service';
import {
  BrowserSessionData,
  BrowserSyncData,
  GootiMetaData,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
} from './types';
import { VaultHandler } from './vault-handler';

class MemorySession extends BrowserSessionHandler {
  override async loadFullData(): Promise<Partial<BrowserSessionData>> {
    return this.browserSessionData ?? {};
  }

  override async saveFullData(data: BrowserSessionData): Promise<void> {
    this.setFullData(data);
  }

  override async removeKeys(keys: string[]): Promise<void> {
    const data = this.browserSessionData as Record<string, unknown> | undefined;
    if (!data) {
      return;
    }
    for (const key of keys) {
      delete data[key];
    }
  }

  override async clearData(): Promise<void> {
    return;
  }
}

class MemoryMeta extends GootiMetaHandler {
  override async loadFullData(): Promise<Partial<GootiMetaData>> {
    return {};
  }
  override async saveFullData(): Promise<void> {
    return;
  }
  override async clearData(): Promise<void> {
    return;
  }
}

class MemoryVault extends VaultHandler {
  store: Record<string, unknown> = {};
  fullSaves = 0;
  identityItemSaves = 0;
  identityListSaves = 0;

  override async retireAccountSync(): Promise<void> {
    return;
  }

  override async loadUnmigratedData(): Promise<Record<string, unknown>> {
    const data = { ...this.store };
    for (const property of this.ignoreProperties) {
      delete data[property];
    }
    return data;
  }

  override async saveAndSetFullData(data: BrowserSyncData): Promise<void> {
    this.fullSaves += 1;
    Object.assign(this.store, data);
    this.setFullData(data);
  }

  override async saveAndSetPartialData_Permission(data: {
    permission: Permission_ENCRYPTED;
  }): Promise<void> {
    this.store[`permission_${data.permission.id}`] = data.permission;
    this.setPartialData_Permission(data);
  }

  override async saveAndSetPartialData_Permissions(data: {
    permissions: string[];
  }): Promise<void> {
    this.store['permissions'] = data.permissions;
    this.setPartialData_Permissions(data);
  }

  override async deleteSaveAndUnsetPartialData_Permission(data: {
    permissionId: string;
  }): Promise<void> {
    delete this.store[`permission_${data.permissionId}`];
    this.unsetPartialData_Permission(data);
  }

  override async saveAndSetPartialData_Identity(data: {
    identity: Identity_ENCRYPTED;
  }): Promise<void> {
    this.identityItemSaves += 1;
    this.store[`identity_${data.identity.id}`] = data.identity;
    this.setPartialData_Identity(data);
  }

  override async saveAndSetPartialData_Identities(data: {
    identities: string[];
  }): Promise<void> {
    this.identityListSaves += 1;
    this.store['identities'] = data.identities;
    this.setPartialData_Identities(data);
  }

  override async deleteSaveAndUnsetPartialData_Identity(data: {
    identityId: string;
  }): Promise<void> {
    delete this.store[`identity_${data.identityId}`];
    this.unsetPartialData_Identity(data);
  }

  override async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    this.store['selectedIdentityId'] = data.selectedIdentityId;
    this.setPartialData_SelectedIdentityId(data);
  }

  override async removeKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      delete this.store[key];
    }
  }

  override async clearData(): Promise<void> {
    this.store = {};
  }
}

function wired(vault: MemoryVault): StorageService {
  const storage = new StorageService();
  storage.initialize({
    browserSessionHandler: new MemorySession(),
    vaultHandler: vault,
    gootiMetaHandler: new MemoryMeta(),
  });
  return storage;
}

describe('vault format v3', () => {
  it('sign out drops the unlocked session and keeps the sealed vault', async () => {
    const vault = new MemoryVault();
    vault.store = { version: 3, salt: 's', canary: 'c' };
    const storage = wired(vault);
    storage.getBrowserSessionHandler().setFullData({
      iv: '',
      permissions: [],
      identities: [],
      selectedIdentityId: null,
      vaultPassword: 'secret',
      salt: 's',
    });

    await storage.signOut();

    expect(storage.getBrowserSessionHandler().browserSessionData).toBeUndefined();
    expect(vault.store['version']).toBe(3);
    expect(vault.store['canary']).toBe('c');
  });

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 120_000;
  });

  it('leaves a v2 vault at version 2 until the password is available', async () => {
    const vault = new MemoryVault();
    vault.store = {
      version: 2,
      iv: 'iv',
      vaultHash: 'hash',
      identities: [],
      permissions: [],
      relays: [],
      selectedIdentityId: null,
    };
    const storage = wired(vault);

    const loaded = await storage.loadAndMigrateBrowserSyncData();

    expect(loaded?.version).toBe(2);
    expect(loaded?.vaultHash).toBe('hash');
    expect(vault.fullSaves).toBe(0);
  });

  it('rewrites a v2 vault as v3 on unlock and rejects a wrong password', async () => {
    const password = 'test-password';
    const iv = CryptoHelper.generateIV();
    const seal = (value: string) => CryptoHelper.encrypt(value, iv, password);
    const id = 'identity-1';
    const encryptedId = await seal(id);
    const encryptedIdentity: Identity_ENCRYPTED = {
      id: encryptedId,
      nick: await seal('Ada'),
      createdAt: await seal('2020-01-01T00:00:00.000Z'),
      privkey: await seal('ab'.repeat(32)),
    };
    const v2: BrowserSyncData = {
      version: 2,
      iv,
      vaultHash: await CryptoHelper.hash(password),
      identities: [encryptedId],
      permissions: [],
      relays: [],
      selectedIdentityId: null,
    };
    v2[`identity_${encryptedId}`] = encryptedIdentity;

    const vault = new MemoryVault();
    vault.store = { ...v2 };
    vault.setFullData(v2);
    const storage = wired(vault);

    await storage.unlockVault(password);

    const upgraded = storage.getVaultHandler().browserSyncData;
    expect(upgraded?.version).toBe(3);
    expect(upgraded?.vaultHash).toBeUndefined();
    expect(vault.store['vaultHash']).toBeUndefined();
    expect(vault.store['iv']).toBeUndefined();
    expect(typeof upgraded?.salt).toBe('string');
    expect(typeof upgraded?.canary).toBe('string');
    expect(
      storage.getBrowserSessionHandler().browserSessionData?.[
        'identity_identity-1'
      ]?.nick,
    ).toBe('Ada');

    const saved = JSON.parse(JSON.stringify(upgraded)) as BrowserSyncData;
    const locked = new MemoryVault();
    locked.store = { ...saved };
    locked.setFullData(saved);
    const again = wired(locked);

    let rejected = false;
    try {
      await again.unlockVault('wrong-password');
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid password.';
    }
    expect(rejected).toBeTrue();
    expect(again.getBrowserSessionHandler().browserSessionData).toBeUndefined();

    await again.unlockVault(password);
    expect(
      again.getBrowserSessionHandler().browserSessionData?.[`identity_${id}`]
        ?.nick,
    ).toBe('Ada');
    const key = await CryptoHelper.v3Key(password, saved.salt as string);
    expect(await CryptoHelper.open(saved.canary as string, key)).toBe(
      VAULT_CANARY,
    );
  });

  it('persists an edited nick on the identity item', async () => {
    const vault = new MemoryVault();
    const storage = wired(vault);
    await storage.createNewVault('nick-password');
    await storage.addIdentity({
      nick: 'Ada',
      privkeyString: 'ab'.repeat(32),
    });

    const session = storage.getBrowserSessionHandler().browserSessionData;
    const identityId = session?.identities[0];
    expect(identityId).toBeTruthy();

    const listSaves = vault.identityListSaves;
    const itemSaves = vault.identityItemSaves;
    const encryptedId = storage.getVaultHandler().browserSyncData?.identities[0];

    await storage.editNick(identityId as string, 'Ada Lovelace');

    expect(vault.identityItemSaves).toBe(itemSaves + 1);
    expect(vault.identityListSaves).toBe(listSaves);
    const stored = storage.getVaultHandler().browserSyncData?.[
      `identity_${encryptedId}`
    ];
    expect(stored?.id).toBe(encryptedId);
    expect(await storage.decrypt(stored?.nick as string, 'string')).toBe(
      'Ada Lovelace',
    );
    expect(session?.[`identity_${identityId}`]?.nick).toBe('Ada Lovelace');
  });

  it('seals sync state into the vault and keeps it across a later persist', async () => {
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const privkey = 'cd'.repeat(32);
    const vault = new MemoryVault();
    const storage = wired(vault);
    await storage.createNewVault('sync-password');
    await storage.addIdentity({ nick: 'Ada', privkeyString: 'ab'.repeat(32) });
    const adaId = storage.getBrowserSessionHandler().browserSessionData?.identities[0];

    await storage.holdPendingPassphrase(phrase);
    expect(storage.getBrowserSessionHandler().browserSessionData?.pendingPassphrase).toBe(phrase);

    await storage.enableBackup(phrase, 'wss://relay.damus.io\nwss://nos.lol\nwss://relay.nostr.band');
    const enrolled = storage.getBrowserSessionHandler().browserSessionData?.backupState;
    expect(storage.getBrowserSessionHandler().browserSessionData?.pendingPassphrase).toBeUndefined();
    const signingKeyHex = enrolled?.signingKeyHex ?? '';
    expect(enrolled?.relays).toEqual([
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band',
    ]);
    expect(JSON.stringify(vault.store)).not.toContain('ab'.repeat(32));
    expect(JSON.stringify(enrolled?.document)).not.toContain(adaId as string);

    const keys = backupKeysFromState(enrolled as BackupState);
    const remote: SharedDocument = {
      v: 2,
      identities: [
        {
          pubkey: getPublicKey(hexToBytes(privkey)),
          privkey,
          nick: 'Bob',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: 5,
        },
      ],
      permissions: [],
      relays: [],
    };
    const synced = await storage.backUpNow({
      async publish() {
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        const payload = await sealSharedDocument(remote, keys.encryptionKey);
        return buildBackupEvent(keys.signingKey, payload, 20);
      },
    });

    expect(synced.published).toBeTrue();
    expect(synced.changed).toBeTrue();
    const session = storage.getBrowserSessionHandler().browserSessionData;
    expect(session?.identities).toContain(adaId as string);
    expect(session?.[`identity_${adaId}`]?.nick).toBe('Ada');
    const bob = session?.identities
      .map((id) => session[`identity_${id}`])
      .find((identity) => identity?.privkey === privkey);
    expect(bob?.nick).toBe('Bob');
    expect(session?.selectedIdentityId).toBe(adaId);
    expect(session?.backupState?.document.identities.map((identity) => identity.privkey)).toEqual([
      'ab'.repeat(32),
      privkey,
    ]);

    const saved = JSON.parse(JSON.stringify(vault.store)) as BrowserSyncData;
    const locked = new MemoryVault();
    locked.store = { ...saved };
    locked.setFullData(saved);
    const again = wired(locked);
    await again.unlockVault('sync-password');
    expect(again.getBrowserSessionHandler().browserSessionData?.backupState?.signingKeyHex).toBe(
      signingKeyHex,
    );

    await again.persistVaultV3();
    const salt = again.getVaultHandler().browserSyncData?.salt as string;
    const sealed = again.getVaultHandler().browserSyncData?.backupState as string;
    const opened = parseBackupState(
      await CryptoHelper.open(sealed, await CryptoHelper.v3Key('sync-password', salt)),
    );
    expect(opened.signingKeyHex).toBe(signingKeyHex);
    expect(opened.document.identities.some((identity) => identity.privkey === privkey)).toBeTrue();
  });

  it('restores a remote vault onto an empty browser without publishing an unchanged blob', async () => {
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const privkey = 'cd'.repeat(32);
    const keys = await deriveSharedKeys(phrase);
    const remote: SharedDocument = {
      v: 2,
      identities: [
        {
          pubkey: getPublicKey(hexToBytes(privkey)),
          privkey,
          nick: 'Bob',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: 5,
        },
      ],
      permissions: [],
      relays: [],
      sites: [],
    };
    const event = buildBackupEvent(
      keys.signingKey,
      await sealSharedDocument(remote, keys.encryptionKey),
      20,
    );
    let publishes = 0;
    const vault = new MemoryVault();
    const storage = wired(vault);

    await storage.restoreNewVault('browser-password', phrase, 'wss://relay.damus.io', {
      async publish() {
        publishes += 1;
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        return event;
      },
    });

    expect(publishes).toBe(0);
    const session = storage.getBrowserSessionHandler().browserSessionData;
    const bob = session?.identities
      .map((id) => session[`identity_${id}`])
      .find((identity) => identity?.privkey === privkey);
    expect(bob?.nick).toBe('Bob');
    expect(session?.selectedIdentityId).toBe(bob?.id);
    expect(session?.backupState?.relays).toEqual(['wss://relay.damus.io']);
    expect(vault.store['version']).toBe(3);

    const saved = JSON.parse(JSON.stringify(vault.store)) as BrowserSyncData;
    const locked = new MemoryVault();
    locked.store = { ...saved };
    locked.setFullData(saved);
    const again = wired(locked);
    await again.unlockVault('browser-password');
    expect(again.getBrowserSessionHandler().browserSessionData?.backupState?.signingKeyHex).toBe(
      bytesToHex(keys.signingKey),
    );
  });

  it('writes nothing when the phrase has no remote vault', async () => {
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const vault = new MemoryVault();
    const storage = wired(vault);
    let rejected = '';
    try {
      await storage.restoreNewVault('browser-password', phrase, 'wss://relay.damus.io', {
        async publish() {
          return [];
        },
        async fetchNewest() {
          return null;
        },
      });
    } catch (error) {
      rejected = error instanceof Error ? error.message : '';
    }

    expect(rejected).toBe('No backup found for this passphrase on these relays.');
    expect(vault.store).toEqual({});
    expect(storage.getBrowserSessionHandler().browserSessionData).toBeUndefined();
  });

  it('writes nothing when a vault is already stored', async () => {
    const vault = new MemoryVault();
    vault.setFullData({
      version: 3,
      salt: 's',
      canary: 'c',
      identities: [],
      permissions: [],
      selectedIdentityId: null,
    });
    const storage = wired(vault);
    let fetches = 0;
    let rejected = '';
    try {
      await storage.restoreNewVault('browser-password', 'not a phrase', 'wss://relay.damus.io', {
        async publish() {
          return [];
        },
        async fetchNewest() {
          fetches += 1;
          return null;
        },
      });
    } catch (error) {
      rejected = error instanceof Error ? error.message : '';
    }

    expect(rejected).toBe('Gooti is already set up on this browser.');
    expect(fetches).toBe(0);
    expect(vault.store).toEqual({});
  });
});
