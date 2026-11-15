# gooti-extension

Gooti: a Nostr signer and identity manager for Chrome and Firefox. Angular workspace with three projects:

- `projects/chrome` and `projects/firefox`: one app per browser.
- `projects/common`: shared library (`@common`): storage, sync, background logic, shared components.

The marketing site lives in `../gooti-website`. Its screenshots come from this extension's Chrome build.

## Chrome and Firefox are separate copies

Most components, templates and public pages exist twice, in `projects/chrome` and `projects/firefox`, and
are usually identical. **Any text or markup change must be made in both**, including `public/options.html`
and `public/prompt.html`. Only browser-specific details differ (for example the export file name).
Logic shared by both belongs in `projects/common`.

## Commands

```
npm run build:chrome      # output in dist/chrome
npm run build:firefox     # output in dist/firefox
npx ng test --watch=false # runs the chrome, firefox and common suites
npx ng lint
```

Run both builds and the tests after any change. `ng lint` already reports 52 errors that were there before;
compare the count and make sure a change adds none.

## Things that cost time before

- **Backup panel state is a signal.** In `backup-panel.component.ts`, `phase` is a signal and `canRestore` is a
  computed. The settings page reads `backupPanel()?.canRestore()`. When `phase` was a plain property, the
  "Use an existing backup" button was missing on the first visit to Settings after creating a vault
  (the parent rendered before the child set its state). Keep it reactive. There is a regression test in
  both `settings.component.spec.ts` files.
- **Font.** Inter is bundled with `@fontsource-variable/inter`, loaded in each `styles.scss`. The family is
  set through `--bs-body-font-family` in `projects/common/src/lib/styles/styles.scss`. No system font
  should be relied on. The popup body is 375px wide.
- **Options page.** `public/options.html` is one self-contained file that mirrors the website's look. Its
  script (`src/options.ts`) depends on the IDs `uploadSnapshotsButton`, `deleteSnapshotsButton`,
  `uploadSnapshotInput` and `snapshotsList` with `li > p.file` and `p.meta`. Keep those when restyling.
- **Error messages** are shown to users but not parsed by code. The one exception is
  `UNLOCK_DISMISSED` in `activity/log.ts`, which Activity reads; use the constant. Specs assert some
  messages, so update the specs when wording changes.

## Wording

- Sentence case for headings and buttons ("New identity", "Delete identity").
- Call the 12 words a **passphrase**, never "recovery phrase" or "phrase".
- Short confirmations: "Delete this identity?", "Lock Gooti?" (not "Do you really want to ...").
- **Backup** is what the passphrase opens on the relays: "Turn on backup", "Back up now", "Back up
  automatically", "Restore from backup", "Use an existing backup", "Backup size". Never "sync" or
  "vault" in text users see. One sentence explains the sharing, in words that name Gooti (not just
  any browser): "Enter the same passphrase in Gooti on another browser or in Gooti Desktop, and they share your identities."
- No noun for the local store: "Lock Gooti?", "Unlock Gooti", "Gooti password", "Set up Gooti". Where
  it matters, say "on this browser" or "on this desktop": each device has its own Gooti password.
- "Lock" and "Unlock", not "Sign in" and "Sign out".
- Say "relay", not "sync relay".
- Code uses the same words: `backup` (`lib/backup`, the backup panel and notice), `shared` (the record
  browsers and desktops read, `SharedDocument`). `vault` stays for the local store in code. "sync" in
  code means Chrome's own storage area (`chrome.storage.sync`, `BrowserSyncData`), nothing else.

## After UI or text changes

The website's screenshots show these screens. Tell the user which screens changed, so they can ask for
the screenshots in `../gooti-website` to be regenerated. See that repo's `CLAUDE.md`.

The user commits. Do not commit unless asked.
