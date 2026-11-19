All notable changes to this project will be documented in this file.

## [2.1.0] - Unreleased

### Added

- Site-only identities. When a new site asks which identity to use, **New site-only identity** makes a fresh identity for that site alone, to try it without your regular identities. Identities lists them in their own group, "Site-only identities", below "Regular identities"; an info icon explains them. The identity the open site uses also appears in its group, marked "Used here", so you see which kind it is. On its own site a site-only identity has **Use**. Its page offers **Keep as a regular identity**, and removing its site in Sites offers to delete it too. Backup carries the site (`site` on the identity row), and Gooti Desktop shows the same group. Extension 2.0.0 and Gooti Desktop 0.1.4 may drop the mark when they write the backup; the identity then shows as a regular one.
- Devices in Settings: every Gooti that uses this backup, browsers and Gooti Desktops, with when each last backed up. Each device publishes a small sealed record after a backup, at most once an hour (kind 30078, `d` = `gooti-device:<id>`). **Rename** names this browser ("Firefox on Linux" until then). **Remove from list** takes another device off the list until its next backup; it does not lock that device out.
- A key of its own for Gooti Desktop. For identities that Gooti Desktop holds, this browser signs with a key of its own that never goes into the backup. It asks the desktop once, right after you open the popup or enter the passphrase, with a short code that both sides show ("Allow this browser in Gooti Desktop"). Settings → Devices shows this browser's code. When Gooti Desktop disconnects this browser, Identities says so the next time you open the popup, with **Connect again**. When a site's request fails because Gooti Desktop disconnected this browser or has not allowed it yet, a small window says so at once (at most every 5 minutes), names the site and the identity, and offers **Connect again**; sites such as Primal do not show that error themselves.

### Changed

- Identities that Gooti Desktop holds no longer use the key that every browser shared through the backup. Each browser needs one **Allow** in Gooti Desktop 0.2.0 before it signs as them. Until then, requests fail with "Allow this browser in Gooti Desktop first".

### Fixed

- Activity shows the reason when a bunker refuses a request.

## [2.0.0] - 2026-11-15

Version 2.0.0 is a rewrite. The entries below describe the difference to 1.0.0.

### Added

- Backup on Nostr relays, replacing the browser account sync. A 12-word passphrase turns it on and lets another browser or Gooti Desktop open the same backup. The vault password stays on this browser. Back up now publishes and merges a sealed vault. Back up automatically is a checkbox that starts off: when on, Gooti backs up when you open it and after a change on this browser. There is no background timer. The default relay is `wss://relay.getgooti.com`. The record uses the same names and keys as Gooti Desktop (`d` = `gooti-shared`). Identities are matched by public key. Settings shows the size of the sealed vault on a scale of 1 MB, the relay limit, and lists each relay and its reason when all of them fail.
- While the popup is open, a bar at the top shows a backup in progress. Afterwards, a panel lists what this browser took and what it sent, such as an identity or a permission added or removed.
- The first vault screen offers three choices: create a vault, import a file, or restore from a backup with a passphrase and relays ("Use an existing backup"). The password on that screen is only for this browser. Nothing is stored when the relays have no backup for that phrase.
- Bunker identities. Paste a `bunker://` link and the phone keeps the private key. Sites still use NIP-07. The public key answers immediately. Sign, encrypt, and decrypt requests go straight to the bunker, which decides on each one, so a site with a short timeout (Primal gives up after about 8 seconds) is not kept waiting. For other bunkers the browser still asks before every deletion (kind 5) or account erase (kind 62): an approval is never remembered, a refusal is. A new bunker identity is saved only after you confirm the key the bunker returned, and an optional Nostr address must match that key. Keys can ask the bunker for its relays. Disconnecting asks for confirmation. The conversation key and the bunker pointer travel inside the sealed backup.
- Gooti Desktop support. An identity whose key Gooti Desktop holds is backed up as a bunker pointer with a custody time (`custodyAt`). When one row has the private key and the other is such a pointer, the later custody time wins, so a browser's older copy of the key cannot undo a move to the desktop. Requests for such an identity ping the desktop first, wait up to 5 minutes for its approval, and name the site, which Gooti Desktop shows in its approval window and Activity. The desktop decides on deletions and account erases itself. The identity is marked as held by the desktop when its link carries `gooti=1` or when the backup has a custody time for it. The mark stays on this browser.
- When a bunker does not answer, a small window says so (at most once in 5 minutes), and Activity shows the reason. For Gooti Desktop: "Gooti Desktop did not answer. Open it and unlock your vault." For other bunkers: "Your bunker did not answer. Check that its app is open."
- Activity is a tab between Identities and Settings. It lists this browser's recent requests and each backup as Synced, Updated, Up to date, or Failed, with the same changes as the backup panel. It stays out of the vault and out of backup. It has a Clear button. Reset extension clears it. Sign out leaves it.
- A site uses only the identity chosen for it. A new site gets its own window that lists the identities and nothing else; closing it without a choice saves nothing. The choice is kept in the vault and backed up. Identities shows the site's identity, and Use binds the open site. The toolbar popup opens on Identities (the You screen is gone) and returns to the last screen when it is opened again within five minutes.
- A Sites tab lists every site that has an identity, with the identity it uses. Remove unlinks a site, so its next request asks for an identity again; its permissions stay with the identity. The removal reaches other browsers through backup.
- The identity list shows a generated pubkey avatar and a color. The current identity sits at the top, and the other identities have a Use button. Color is optional and is backed up with the identity. A missing color is derived from the pubkey.
- Settings can sign out of the vault. The sealed vault stays, and the password screen opens. The toolbar icon shows a lock while a vault exists and this browser is signed out.
- Info shows the license (MIT, linked to `LICENSE`) and opens the open-source licenses of everything the extension ships with.

### Fixed

- A saved deny wins over an allow for the same site and method. A kind deny wins over an allow-all.
- Editing a nick name is stored on the identity, not only in the session.
- A failure to open the unlock or permission window is reported instead of waiting forever. The windows stay on the visible screen, and a browser window position that Chrome rejects no longer blocks the prompt.
- Calls that arrive while the vault is locked share one unlock window, and closing it without an identity fails those calls. Repeated calls for the same permission, and repeated sign requests of the same event kind, share one prompt window; closing it denies those calls once.
- In the unlock window, choosing an identity selects it and closes the window. The window fills the real window, and the toolbar popup stays 375 by 600.
- A backup row for a deleted identity may carry no key and no bunker pointer; it merges by its revision, with no custody rule. Gooti Desktop 0.1.3 reads such rows too. A deleted identity leaves no private key in the backup.
- Firefox: the page script is exposed to HTTPS and localhost only, matching Chrome (it was exposed to every URL). The match list puts no port in the host, since `http://localhost/*` already covers every port, so the temporary add-on loads.

### Changed

- The vault is format v3. Each vault has a random salt, PBKDF2-SHA-256 uses 600,000 iterations, every value has its own IV, and the password is checked with a canary instead of a stored hash. Older vaults upgrade when they are unlocked.
- New words, the same in Gooti Desktop: the **backup** (Turn on backup, Back up now, Back up automatically, Restore from backup, Backup size), and "Gooti" for the local store (Unlock Gooti, Lock Gooti?, Gooti password, Set up Gooti, Import from a file). Settings explains that Gooti on another browser or in Gooti Desktop shares your identities when you enter the same passphrase there.
- A permission request is a decision panel: the action is the title, the note sits in its own block, and the site identity is on the card. Approve and Reject remember; Only this time does not. A site that asks for several signatures sees one card, and each line says what will happen. Approve remembers an ordinary kind, but a deletion or a request to erase the account is not covered by an earlier Approve. Deleting a note shows the event id and the reason in separate fields, and the original note text is not part of the request.
- Permissions groups each site on its own card. Clear all removes that site's saved permissions for this identity after confirmation. The site binding stays.
- The locked vault window and the identity choice window use the same panel as the sign window: the site is on its own line, and closing the window stops that site's request.
- The first vault screens use one layout: the small Gooti mark, a title, the action, and Back. Creating a vault asks for the password on the next screen. An empty identity list shows one card, "No identity yet", with how to create or restore one.
- The options page is a wide page: a top bar, a large title, and the snapshot tools beside the explanation. A snapshot shows the file name, then the vault version and how many identities it holds. Export explains that the vault file stays protected by the vault password, and downloads when you choose OK.
- Settings groups Vault, Sync, and the danger zone, with the danger zone further below. Sync now is the blue action, and saving the relay list is Save relays.
- The screens share one look: the same field and type as Settings, quiet blue text links and chips, one soft red error line, and one 10px button shape. On Keys, NPUB, NSEC, and HEX share one label width. On Keys and Permissions, the header chevron returns to that identity's menu.
- Firefox does not declare a `windows` permission. `browser.windows` needs none, and Firefox warns on that value.
- License: Gooti extension is now under the MIT License (1.0.0 was released under the Unlicense). Every build carries `LICENSE` and the licenses of the bootstrap-icons and Inter fonts in `licenses/`, next to `3rdpartylicenses.txt`.

### Removed

- Browser account sync (Chrome sync and Firefox sync). The vault stays in local extension storage. An existing synced vault is copied to local storage once, then removed from the browser account.
- `window.nostr.getRelays` and the per-identity relay list. Websites use their own relays, or a kind 10002 relay list. Sync relays and a bunker's connection relays stay.


## [1.0.0] - 2026-01-16

### Fixed

- Auto fix simple mistakes when adding a new relay.

### Added

- This CHANGELOG file.
- Every time a web page triggers a NIP-07 method and the vault is locked or no identity is selected, the extension is immediately opened.
- Allow editing the nick name on any identity.
- Show utilization info in the settings view when SYNC is turned on.

### Changed

- Refactor the vault data structure to optimize sync storage utilization.
- The vault password to unlock the vault can now also be applied by pressing ENTER.
- The vault password to create a vault can now also be applied by pressing ENTER.
- Upgrade from Angular 19 to Angular 21.
- Upgrade from Angular 21 to Angular 22. The Angular 22 compiler requires TypeScript 6.0.

## [chrome-0.0.4] - 2025-02-15

## [firefox-0.0.4] - 2025-02-15

## [firefox-0.0.3] - 2025-02-07

## [chrome-0.0.3] - 2025-02-12

## [chrome-0.0.2] - 2025-02-04

## [chrome-0.0.1] - 2025-02-01

[chrome-0.0.4]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.3...chrome-0.0.4
[chrome-0.0.3]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.2...chrome-0.0.3
[chrome-0.0.2]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.1...chrome-0.0.2
[chrome-0.0.1]: https://github.com/sam-hayes-org/gooti-extension/releases/tag/chrome-0.0.1
[firefox-0.0.4]: https://github.com/sam-hayes-org/gooti-extension/compare/firefox-0.0.3...firefox-0.0.4
[firefox-0.0.3]: https://github.com/sam-hayes-org/gooti-extension/releases/tag/firefox-0.0.3
