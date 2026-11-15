/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventTemplate, finalizeEvent, nip04, nip44, Event } from 'nostr-tools';
import browser from 'webextension-polyfill';
import { Nip07Method, Nip07MethodPolicy } from '../models/nostr';
import { NostrHelper } from '../helpers/nostr-helper';
import { CryptoHelper } from '../helpers/crypto-helper';
import { noteBackupActivity, backupFailureReason } from '../activity/log';
import type { ChangeReport } from '../backup/changes';
import { defaultBackupRelayIO } from '../backup/pool';
import { createQuietQueue, publishIfLocalWins } from '../backup/quiet';
import {
  BackupState,
  parseBackupRelays,
  stampPermissionLive,
  stampSite,
  stampSiteDeleted,
  backupKeysFromState,
} from '../backup/state';
import { identityPubkey } from '../identity/appearance';
import {
  BrowserSessionData,
  BrowserSyncData,
  Permission_ENCRYPTED,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
  Site_DECRYPTED,
  Site_ENCRYPTED,
} from '../services/storage/types';
import { isUnrememberedSign } from './permission-card';

export type PromptResponse =
  | 'reject'
  | 'reject-once'
  | 'approve'
  | 'approve-once';

export interface PromptResponseMessage {
  id: string;
  response: PromptResponse;
}

export type IndexPromptResponse = 'unlocked' | 'locked';
export interface IndexPromptResponseMessage {
  id: string;
  response: IndexPromptResponse;
}

export interface BackgroundRequestMessage {
  method: Nip07Method;
  params: any;
  host: string;
}

export abstract class BackgroundCommon {
  #vaultKeySalt?: string;
  #vaultKey?: Promise<CryptoKey>;
  readonly #kickQuiet = createQuietQueue(() => this.#runQuietBackup());

  abstract getBrowserSessionData(): Promise<BrowserSessionData | undefined>;
  abstract getBrowserSyncData(): Promise<BrowserSyncData | undefined>;
  abstract savePermissionsToBrowserSyncStorage(
    newPermissions: string[],
    newPermission: Permission_ENCRYPTED,
  ): Promise<void>;
  abstract storePermission(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Nip07Method,
    methodPolicy: Nip07MethodPolicy,
    kind?: number,
  ): Promise<void>;
  abstract getPosition(
    width: number,
    height: number,
  ): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;

  /**
   * Publish this browser's vault after a site or permission change.
   * The site call does not wait. A failure does not fail that call.
   * Skips the publish when the relay has rows this worker has not applied.
   */
  scheduleQuietBackup(): void {
    this.#kickQuiet();
  }

  debug(message: string, type: 'log' | 'error' = 'log') {
    const dateString = new Date().toISOString();
    const line = `[Gooti - ${dateString}]: ${message}`;

    if (type === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  checkPermissions(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Nip07Method,
    params: any,
  ): boolean | undefined {
    const permissionIds = browserSessionData.permissions;
    const permissions: Permission_DECRYPTED[] = [];
    for (const permissionId of permissionIds) {
      const permission = browserSessionData[`permission_${permissionId}`];
      if (!permission) {
        continue;
      }

      if (
        permission.identityId === identity.id &&
        permission.host === host &&
        permission.method === method
      ) {
        permissions.push(permission);
      }
    }

    if (permissions.length === 0) {
      return undefined;
    }

    if (method === 'signEvent') {
      const kind = (params as { kind?: number } | undefined)?.kind;
      const denied = permissions.some(
        (x) =>
          x.methodPolicy === 'deny' &&
          (x.kind === kind || typeof x.kind === 'undefined'),
      );
      if (denied) {
        return false;
      }
      // A deletion or a vanish request is never covered by an earlier allow.
      if (isUnrememberedSign(method, params)) {
        return undefined;
      }
      if (
        permissions.some((x) => x.methodPolicy === 'allow' && x.kind === kind)
      ) {
        return true;
      }
      if (
        permissions.some(
          (x) => x.methodPolicy === 'allow' && typeof x.kind === 'undefined',
        )
      ) {
        return true;
      }
      return undefined;
    }

    if (permissions.some((x) => x.methodPolicy === 'deny')) {
      return false;
    }
    if (permissions.some((x) => x.methodPolicy === 'allow')) {
      return true;
    }
    return undefined;
  }

  signEvent(eventTemplate: EventTemplate, privkey: string): Event {
    return finalizeEvent(eventTemplate, NostrHelper.hex2bytes(privkey));
  }

  async nip04Encrypt(
    privkey: string,
    peerPubkey: string,
    plaintext: string,
  ): Promise<string> {
    return await nip04.encrypt(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
      plaintext,
    );
  }

  async nip44Encrypt(
    privkey: string,
    peerPubkey: string,
    plaintext: string,
  ): Promise<string> {
    const key = nip44.v2.utils.getConversationKey(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
    );
    return nip44.v2.encrypt(plaintext, key);
  }

  async nip04Decrypt(
    privkey: string,
    peerPubkey: string,
    ciphertext: string,
  ): Promise<string> {
    return await nip04.decrypt(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
      ciphertext,
    );
  }

  async nip44Decrypt(
    privkey: string,
    peerPubkey: string,
    ciphertext: string,
  ): Promise<string> {
    const key = nip44.v2.utils.getConversationKey(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
    );

    return nip44.v2.decrypt(ciphertext, key);
  }

  async encryptPermission(
    permission: Permission_DECRYPTED,
    password: string,
    salt: string,
  ): Promise<Permission_ENCRYPTED> {
    const key = await this.#vaultKeyFor(password, salt);
    const seal = (value: string) => CryptoHelper.seal(value, key);
    const encryptedPermission: Permission_ENCRYPTED = {
      id: await seal(permission.id),
      identityId: await seal(permission.identityId),
      host: await seal(permission.host),
      method: await seal(permission.method),
      methodPolicy: await seal(permission.methodPolicy),
    };

    if (typeof permission.kind !== 'undefined') {
      encryptedPermission.kind = await seal(permission.kind.toString());
    }

    return encryptedPermission;
  }

  /**
   * Bumps the permission stamp when backup is on.
   * Returns the sealed state for local storage, and updates the session object.
   */
  protected async stampStoredPermission(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    permission: {
      host: string;
      method: Nip07Method;
      methodPolicy: Nip07MethodPolicy;
      kind?: number;
    },
  ): Promise<string | undefined> {
    if (!browserSessionData.backupState || !browserSessionData.vaultPassword || !browserSessionData.salt) {
      return undefined;
    }
    browserSessionData.backupState = stampPermissionLive(
      browserSessionData.backupState,
      {
        identityPubkey: identity.pubkey,
        host: permission.host,
        method: permission.method,
        methodPolicy: permission.methodPolicy,
        ...(permission.kind !== undefined ? { kind: permission.kind } : {}),
      },
      Date.now(),
    );
    return this.sealBackupState(
      browserSessionData.backupState,
      browserSessionData.vaultPassword,
      browserSessionData.salt,
    );
  }

  /** Seals backup state with the same vault key as encryptPermission. */
  async sealBackupState(
    state: BackupState,
    password: string,
    salt: string,
  ): Promise<string> {
    const key = await this.#vaultKeyFor(password, salt);
    return CryptoHelper.seal(JSON.stringify(state), key);
  }

  async #vaultKeyFor(password: string, salt: string): Promise<CryptoKey> {
    if (this.#vaultKey && this.#vaultKeySalt === salt) {
      return this.#vaultKey;
    }
    this.#vaultKeySalt = salt;
    this.#vaultKey = CryptoHelper.v3Key(password, salt);
    return this.#vaultKey;
  }

  /**
   * Remembers which identity serves this host.
   * replace is false after a successful call: a live row stays.
   * replace is true when the user picks an identity for the site.
   * Reads storage again so an earlier call in the same burst is not overwritten.
   */
  async saveSiteBinding(
    host: string,
    identity: Identity_DECRYPTED,
    replace: boolean,
  ): Promise<void> {
    const session = await this.getBrowserSessionData();
    if (!session) {
      return;
    }
    const existing = siteForHost(session, host);
    const live = !!existing && !!session[`identity_${existing.identityId}`];
    if (existing && live && !replace) {
      return;
    }

    const site: Site_DECRYPTED = {
      id: existing?.id ?? crypto.randomUUID(),
      identityId: identity.id,
      host,
    };
    const removed: string[] = [];
    const kept = (session.sites ?? []).filter((id) => {
      const row = session[`site_${id}`];
      if (row?.host === host && id !== site.id) {
        removed.push(`site_${id}`);
        delete session[`site_${id}`];
        return false;
      }
      return true;
    });
    if (!kept.includes(site.id)) {
      kept.push(site.id);
    }
    session.sites = kept;
    session[`site_${site.id}`] = site;
    if (session.backupState) {
      session.backupState = stampSite(
        session.backupState,
        { host, identityPubkey: identity.pubkey },
        Date.now(),
      );
    }
    await this.#writeSite(session, site, removed);
    if (session.backupState?.autoBackup && session.vaultPassword && session.salt) {
      this.scheduleQuietBackup();
    }
  }

  async #writeSite(
    session: BrowserSessionData,
    site: Site_DECRYPTED,
    removed: string[],
  ): Promise<void> {
    const sessionUpdate: Record<string, unknown> = {
      sites: session.sites ?? [],
      [`site_${site.id}`]: site,
    };
    if (session.backupState) {
      sessionUpdate['backupState'] = session.backupState;
    }
    await browser.storage.session.set(sessionUpdate);
    if (removed.length > 0) {
      await browser.storage.session.remove(removed);
    }
    if (!session.vaultPassword || !session.salt) {
      return;
    }
    const vault = await this.getBrowserSyncData();
    if (!vault) {
      return;
    }
    const key = await this.#vaultKeyFor(session.vaultPassword, session.salt);
    let storedId: string | undefined;
    let storedHost: string | undefined;
    for (const encryptedId of vault.sites ?? []) {
      const row = vault[`site_${encryptedId}`];
      if (!row) {
        continue;
      }
      const opened = await CryptoHelper.open(row.id, key);
      if (opened === site.id) {
        storedId = row.id;
        storedHost = row.host;
        break;
      }
    }
    const encrypted: Site_ENCRYPTED = {
      id: storedId ?? (await CryptoHelper.seal(site.id, key)),
      identityId: await CryptoHelper.seal(site.identityId, key),
      host: storedHost ?? (await CryptoHelper.seal(site.host, key)),
    };
    const siteIds = storedId
      ? [...(vault.sites ?? [])]
      : [...(vault.sites ?? []), encrypted.id];
    const localUpdate: Record<string, unknown> = {
      sites: siteIds,
      [`site_${encrypted.id}`]: encrypted,
    };
    if (session.backupState) {
      localUpdate['backupState'] = await this.sealBackupState(
        session.backupState,
        session.vaultPassword,
        session.salt,
      );
    }
    await browser.storage.local.set(localUpdate);
  }

  /** Drops the identity bound to this host. Saved permissions stay. */
  async clearSiteBinding(host: string): Promise<void> {
    const session = await this.getBrowserSessionData();
    if (!session) {
      return;
    }
    const existing = siteForHost(session, host);
    if (!existing) {
      return;
    }
    const identity = session[`identity_${existing.identityId}`];
    let stamped = false;
    delete session[`site_${existing.id}`];
    session.sites = (session.sites ?? []).filter((id) => id !== existing.id);
    if (session.backupState && identity) {
      try {
        session.backupState = stampSiteDeleted(
          session.backupState,
          { host, identityPubkey: identityPubkey(identity) },
          Date.now(),
        );
        stamped = true;
      } catch {
        // A row whose identity is already gone still leaves this browser.
      }
    }
    const sessionUpdate: Record<string, unknown> = {
      sites: session.sites,
    };
    if (session.backupState) {
      sessionUpdate['backupState'] = session.backupState;
    }
    await browser.storage.session.set(sessionUpdate);
    await browser.storage.session.remove(`site_${existing.id}`);
    if (!session.vaultPassword || !session.salt) {
      return;
    }
    const vault = await this.getBrowserSyncData();
    if (!vault) {
      return;
    }
    const key = await this.#vaultKeyFor(session.vaultPassword, session.salt);
    const kept: string[] = [];
    const removed: string[] = [];
    for (const encryptedId of vault.sites ?? []) {
      const row = vault[`site_${encryptedId}`];
      if (!row) {
        continue;
      }
      const openedId = await CryptoHelper.open(row.id, key);
      const openedHost = await CryptoHelper.open(row.host, key);
      if (openedId === existing.id || openedHost === host) {
        removed.push(`site_${encryptedId}`);
        delete vault[`site_${encryptedId}`];
        continue;
      }
      kept.push(encryptedId);
    }
    vault.sites = kept;
    const localUpdate: Record<string, unknown> = { sites: kept };
    if (session.backupState) {
      localUpdate['backupState'] = await this.sealBackupState(
        session.backupState,
        session.vaultPassword,
        session.salt,
      );
    }
    await browser.storage.local.set(localUpdate);
    if (removed.length > 0) {
      await browser.storage.local.remove(removed);
    }
    if (stamped && session.backupState?.autoBackup) {
      this.scheduleQuietBackup();
    }
  }

  async #runQuietBackup(): Promise<void> {
    const session = await this.getBrowserSessionData();
    if (!session?.backupState?.autoBackup || !session.vaultPassword || !session.salt) {
      return;
    }
    try {
      await browser.runtime.getPlatformInfo();
    } catch {
      // One platform call keeps the worker alive while the relays answer.
    }
    let relays: string[];
    try {
      relays = parseBackupRelays(session.backupState.relays.join('\n'));
    } catch {
      return;
    }
    if (relays.length === 0) {
      return;
    }
    let published = false;
    let report: ChangeReport = { took: [], sent: [] };
    let failed = false;
    let failure: unknown;
    try {
      const outcome = await publishIfLocalWins(
        session.backupState.document,
        backupKeysFromState(session.backupState),
        relays,
        defaultBackupRelayIO(),
      );
      published = outcome.published;
      report = outcome.report;
    } catch (error: unknown) {
      failed = true;
      failure = error;
      const detail = error instanceof Error ? error.message : 'unknown';
      this.debug(`Backup did not finish: ${detail}`, 'error');
    }
    if (failed) {
      await noteBackupActivity({
        backup: 'auto',
        result: 'failed',
        reason: backupFailureReason(failure),
      });
      return;
    }
    if (published) {
      await noteBackupActivity({
        backup: 'auto',
        result: 'backedUp',
        took: report.took,
        sent: report.sent,
      });
    }
  }
}

function siteForHost(
  session: BrowserSessionData,
  host: string,
): Site_DECRYPTED | undefined {
  for (const id of session.sites ?? []) {
    const site = session[`site_${id}`];
    if (site?.host === host) {
      return site;
    }
  }
  return undefined;
}
