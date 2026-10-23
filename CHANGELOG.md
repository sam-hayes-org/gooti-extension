All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- A Sites tab lists every site that has an identity, with the identity it uses. Remove unlinks a site, so its next request asks for an identity again; its permissions stay with the identity. The removal reaches other browsers through backup. The site card on Identities says Remove too (was Clear), and asks first as well.
- Activity has a Clear button. After "Clear activity?" it deletes the activity log on this browser; other browsers keep theirs.

### Fixed

- A Gooti Desktop identity no longer shows the browser's window before a deletion when backup is off on this browser. The identity itself now records that Gooti Desktop holds its key: Gooti Desktop links carry `gooti=1`, and a pointer from the backup with a custody time counts too. Such identities also send the site's name to the desktop. The mark stays on this browser and is not backed up.
- A vault sent right after reading the relay vault is no longer lost. Its event is always at least one second later than the event it replaces. A relay keeps only one vault event per second, and not always the newer one.
- A bunker identity synced to another browser stays linked. The conversation key travels in the sealed vault. A browser that already has its own key keeps that key.
- A site binding is stored in the synced vault. It was left out of the sealed blob, so every sync reported it as sent again.

### Changed

- The backup has new relay names and keys, the same in Gooti Desktop: the record on the relays is `d` = `gooti-shared` (was `gooti-vault`), and its keys come from the salt `gooti-backup-v1` with the labels `gooti-shared-sign-v1` and `gooti-shared-encrypt-v1`. relay.getgooti.com accepts only the new tag. A browser that had backup on starts with backup off; turn it on again with the same passphrase. The code says backup too: `lib/backup`, the backup panel and notice, `SharedDocument`. Activity entries written before keep showing.
- New words, the same in Gooti Desktop. What the passphrase opens on the relays is the **backup**: "Turn on backup", "Back up now", "Back up automatically", "Restore from backup", "Use an existing backup", "Backup size". Settings explains that Gooti on another browser or in Gooti Desktop shares your identities when you enter the same passphrase there. The local store has no name any more: "Unlock Gooti", "Lock Gooti?", "Gooti password", "Set up Gooti", and "Import from a file" for an exported snapshot. Error messages follow, such as "Gooti is locked." and "No backup found for this passphrase on these relays."
- A bunker identity sends sign, encrypt, and decrypt requests straight to its bunker, which decides on each one. Linking a site to the identity is the site question, so the browser no longer asks it a second time, and a site with a short timeout (Primal gives up after about 8 seconds) is not kept waiting. For other bunkers the browser still asks before every deletion (kind 5) or account erase (kind 62); an approval is never remembered, a refusal is. A Gooti Desktop identity leaves those to the desktop, which sees the site and asks itself. The "Sites and the bunker" choice is gone. Its synced value (`askSite`) is kept unchanged for older versions.
- The default sync relay is wss://relay.getgooti.com.
- Settings shows the sealed vault size on a scale of 1 MB, the relay limit.
- On a linked bunker, Keys can ask the bunker for its relays. The saved list changes only when the answer is different. A sign request does not ask.
- An activity sync row lists the same vault changes as the sync panel, under On this browser and Sent.
- The toolbar icon shows a lock while a vault exists and this browser is signed out.
- Editing a nick name is stored on the identity, not only in the session.
- A saved deny wins over an allow for the same site and method. A kind deny wins over an allow-all.
- A failure to open the unlock or permission window is reported instead of waiting forever.
- The unlock and permission windows stay on the visible screen. A browser window position that Chrome rejects no longer blocks the prompt.
- Calls that arrive while the vault is locked share one unlock window. Closing that window without an identity fails those calls instead of opening another window.
- In the unlock window, choosing an identity selects it and closes the window. The select control is no longer hidden until hover.
- Repeated calls for the same permission share one prompt window. Closing that window denies those calls once. Repeated sign requests of the same event kind share that window too.
- The unlock window fills the real window. The toolbar popup stays 375 by 600.
- Firefox does not declare a `windows` permission. `browser.windows` needs none, and Firefox warns on that value. The page script is exposed to HTTPS and localhost, matching Chrome.
- Firefox can load the temporary add-on. The page-script match list no longer puts a port in the host (`http://localhost/*` already covers every port).

### Added

- Gooti Desktop support. An identity whose key Gooti Desktop holds syncs as a bunker pointer with a custody time (`custodyAt`). When one synced row has the private key and the other is such a pointer, the later custody time wins, so a browser's older copy of the key cannot undo a move to the desktop. Requests for such an identity ping the desktop first, wait up to 5 minutes for its approval, and name the site, which Gooti Desktop shows in its approval window and Activity.
- When a bunker does not answer, a small window says so (at most once in 5 minutes), and Activity shows the reason. For Gooti Desktop: "Gooti Desktop did not answer. Open it and unlock your vault." For other bunkers: "Your bunker did not answer. Check that its app is open."
- The first vault screen can restore a vault from a passphrase and relays. The password on that screen is only for this browser. Nothing is stored when the relays have no vault for that phrase.
- Activity is a tab between Identities and Settings. It lists this browser's recent requests and stays out of the vault and out of sync. Reset extension clears it. Sign out leaves it.
- A site stays with the identity that answered it. The toolbar popup shows that, and Use for this site switches it. The choice is kept in the vault and syncs.
- Manual Nostr sync on the settings screen. A 12-word phrase enrolls another device. The vault password stays on this browser. Sync now publishes and merges a sealed vault. The default relay is relay.getgooti.com.
- A bunker identity. Paste a `bunker://` link and the phone keeps the private key. Sites still use NIP-07. The public key answers immediately. Signing waits for the bunker, then the connection closes. The conversation key syncs inside the sealed vault. Sync matches identities by public key and carries the bunker pointer. An older sync blob is replaced.
- The identity list shows a generated pubkey avatar and a color. The current identity sits at the top of that list and on the You screen. Other identities have a Use button. Color is optional and syncs with the identity. A missing color is derived from the pubkey.

### Removed

- Browser account sync (Chrome sync and Firefox sync). The vault stays in local extension storage. An existing synced vault is copied to local storage once, then removed from the browser account.
- The NIP-46 bunker that listened for remote apps. This extension does not host a bunker. It can connect to one.
- `window.nostr.getRelays` and the per-identity relay list. Websites use their own relays, or a kind 10002 relay list. Sync relays and a bunker's connection relays stay.

### Changed

- While the popup is open, a bar at the top shows a sync in progress on every screen. Afterward, a panel lists what this browser took and what it sent, such as an identity or a permission added or removed.
- Activity lists each Sync now as Synced, Updated, Up to date, or Failed. An automatic sync is listed when it sends a vault, when the merge changes this browser, or when it fails. Updated means this browser took the remote change and did not send a new vault.
- Automatic sync is a checkbox on the Sync screen and starts off. When it is on, Gooti syncs when you open it and after a change on this browser. Sync now does the same at once. There is no background timer.
- The danger zone sits further below the sync controls.
- Create passphrase opens a dialog for the 12 words. The button stays until the passphrase is applied.
- Restore vault with passphrase stays in place while its dialog is open. It leaves after the vault is restored.
- Restore vault with passphrase opens a dialog for the relays and the 12 words.
- Restore vault with passphrase sits in the Vault section, above Sign out. The empty identity card no longer mentions relays.
- An empty identity list hides the website hint and shows one card: "No identity yet", plus how to create or restore one.
- The permissions screen starts with the same kind of label as Public Key.
- On Keys and Permissions, the header chevron returns to that identity's menu. On the menu it leaves the identity. The extra Back line is gone.
- New Identity, Keys, and the nick editor use the same field as the vault screens. Text actions on those screens are quiet blue links. Keys and Permissions go back to the identity menu with Back. Errors use one soft red line. Info is left aligned, and Delete Identity spans the row.
- Export explains that the vault file stays protected by the vault password. The file downloads when you choose OK.
- A snapshot on the options page shows the file name, then the vault version and how many identities it holds.
- The options page is a wide page: a top bar, a large title, and the snapshot tools beside the explanation.
- Create, import, and restore use the same screen: the small Gooti mark, a title, the action, and Back.
- On the first vault screen, the ring around the bird matches the page, and the name is smaller than the headline.
- The first vault screen lists create, import, and restore as three choices. Each line says how that path starts.
- Creating a vault uses the same layout as unlocking one. The first screen offers a new vault or an import. The next screen asks for the password.
- The plus on Create a new vault lines up with the label.
- Info, New identity, Import vault, the vault password screen, and the short notes on Identities, Permissions, and Activity use the same type as Settings.
- On Keys, the section labels and explanations use the same type as Settings.
- A new bunker identity is saved only after you confirm the key the bunker returned. An optional Nostr address must match that key. Replacing a bunker link is unchanged.
- Permissions groups each site on its own card. Clear all removes that site's saved permissions for this identity after confirmation. The site binding stays.
- On Identities, the site line sits under the site card, and Clear and Use are quiet blue chips.
- When every sync relay fails, the sync window lists each relay and the reason it sent.
- On Keys, NPUB, NSEC, and HEX share one label width, so the fields start on the same line.
- The remaining action buttons use the same 10px shape as Settings. Text links and icon buttons stay as they are.
- Settings groups Vault, Sync, and the danger zone. Sync now is the blue action. Saving the relay list is Save relays.
- The locked vault window uses the same panel. The site is on its own line. Closing it stops that site's request. The red banner is gone.
- The identity choice window uses the same panel as the sign window. The host is on its own line, and clicking a row still selects it.
- Deleting a note shows the event id and the reason in separate fields. The original note text is not part of the request.
- The permission window is a decision panel. The action is the title, the note sits in its own block, and the site identity is on the card. Approve and Reject remember. Only this time does not.
- The site identity card has Clear. It drops only that site, so the next request asks for an identity again. The identity and its saved permissions stay.
- A new site gets its own choice window. It lists the identities and nothing else: no New button, no tabs, and no unlock warning. Click a row and that site uses it.
- A site uses only the identity chosen for it. Identities shows that site identity, and Use binds the open site. A new site picks an identity before it can sign. Closing that window without a choice saves nothing. The You screen is gone. The toolbar popup opens on Identities.
- A linked bunker asks which site may sign, encrypt, or decrypt. That is the default. The first time, this browser asks. After Allow, the phone approves the content. Deleting a note and erasing the account always ask here. The Keys screen can send requests straight to the bunker instead. The phone still cannot see which site asked. Reading the public key still asks in the browser.
- A site that asks for several signatures sees one card. Each line says what will happen, and the note text is on the card. Approve still remembers an ordinary kind. A deletion or a request to erase the account is not covered by an earlier Approve.
- The toolbar popup returns to the last screen when it is opened again within five minutes. After that it opens on You. The website unlock window still starts on identity choice.
- Disconnecting a bunker asks for confirmation. Linking this browser again means pasting a new bunker:// link.
- Settings can sign out of the vault. The sealed vault stays, and the password screen opens.
- A connected bunker shows a different permission window for signing, encrypting, and decrypting. It asks whether to send that request to the phone. Approve still remembers the site and the action. The public key keeps its own window.
- Vault format v3. Each vault has a random salt, PBKDF2-SHA-256 uses 600,000 iterations, every value has its own IV, and the password is checked with a canary instead of a stored hash. Older vaults upgrade when they are unlocked.


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


[1.0.0]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.4...chrome-1.0.0
[chrome-0.0.4]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.3...chrome-0.0.4
[chrome-0.0.3]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.2...chrome-0.0.3
[chrome-0.0.2]: https://github.com/sam-hayes-org/gooti-extension/compare/chrome-0.0.1...chrome-0.0.2
[chrome-0.0.1]: https://github.com/sam-hayes-org/gooti-extension/releases/tag/chrome-0.0.1
[firefox-0.0.4]: https://github.com/sam-hayes-org/gooti-extension/compare/firefox-0.0.3...firefox-0.0.4
[firefox-0.0.3]: https://github.com/sam-hayes-org/gooti-extension/releases/tag/firefox-0.0.3
