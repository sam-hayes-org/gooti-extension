# Store listings

The texts and images of Gooti's store pages, kept here so they can be checked against the extension and
pasted from. The stores do not read this file: a change here goes live only when it is entered on the store
site. When to check them: `CLAUDE.md`, "Store listings".

Each field says whether it is **live** (seen on the store) or **proposed** (written here, not yet confirmed on
the store). After entering a proposed text, mark it live with the date.

## Firefox Add-ons

https://addons.mozilla.org/en-US/firefox/addon/gooti/ (edit: Developer Hub → Gooti → Edit Product Page)

### Name (at most 50 characters)

- Live until at least 2026-11-20: `Gooti - Nostr Identity Manager and Signer`
- Proposed 2026-11-20:

  ```
  Gooti – Nostr Signer, Identities & Backup
  ```

### Summary (at most 250 characters, plain text)

- Live until at least 2026-11-20: `Manage and switch between multiple identities while interacting with Nostr apps`
- Proposed 2026-11-20:

  ```
  A Nostr signer (NIP-07) that gives every site its own identity, keeps all identities in one encrypted backup for every browser and desktop, and can keep keys off the browser on Gooti Desktop or a bunker.
  ```

### Description (limited Markdown, no headings)

Live until at least 2026-11-20: empty. Proposed 2026-11-20:

```
Gooti signs Nostr events for websites through NIP-07, without giving them your keys. You see which site asks, and you decide.

**A different identity for every site**

- Gooti remembers which identity answers each website: your everyday identity on one app, a pseudonym on another.
- Just trying a site? **New site-only identity** makes a fresh identity for that site alone. Delete it when you are done, or keep it.
- The Sites tab lists every site with its identity.

**One encrypted backup for every browser and desktop**

- No Firefox or Chrome account needed. Identities, permissions and site choices are encrypted on your device with AES-256-GCM and stored on relays you choose.
- Write down twelve words. Enter them in Gooti on another browser or in Gooti Desktop, and they share your identities.
- **Devices** lists every browser and desktop that uses your backup, and when each last backed up.
- Prefer no relays? Export to a file and import it in another browser.

**Keys in the browser, on Gooti Desktop, or on a bunker**

- Each identity can keep its private key in Gooti, on [Gooti Desktop](https://getgooti.com) (Linux and Windows), or on any NIP-46 bunker, such as an app on your phone.
- With Gooti Desktop there is no bunker link and no QR code: each browser asks once, you press **Allow**, and every NIP-07 site can use the key.
- With Gooti Desktop or a bunker, the private key never reaches the browser.

**Private by design**

- No account, no tracking, no analytics. Your Gooti password never leaves the device.
- Backups go to relay.getgooti.com by default, a relay that only accepts encrypted backups and bunker messages. Use your own relays whenever you like.

> Open source under the MIT License: [github.com/sam-hayes-org/gooti-extension](https://github.com/sam-hayes-org/gooti-extension) · Website: [getgooti.com](https://getgooti.com)

*[NIP-07]: The Nostr standard that lets websites ask a browser extension to sign
*[NIP-46]: Nostr remote signing ("bunker"): the key stays on another device
*[AES-256-GCM]: Authenticated encryption with a 256-bit key
```

The abbreviation lines at the end do not show; they explain the terms on hover.

### Screenshots (1280x800)

Live until at least 2026-11-20: one, "Gooti on getgooti.com" (the 1280x800 preview). Proposed 2026-11-20:
these five, in this order, and the old one removed. Rendered by `../gooti-website/tools/amo-screenshots.py`
into `release/` (not in git); the captions are in `release/amo-captions.txt`.

| # | File | Caption |
|---|---|---|
| 1 | `amo-1-choose-identity.png` | A new site asks: pick an identity, or make a site-only one |
| 2 | `amo-2-approve.png` | You approve every request and see which site asks |
| 3 | `amo-3-site-identity.png` | Every site keeps its own identity |
| 4 | `amo-4-backup.png` | One encrypted backup for every browser and Gooti Desktop |
| 5 | `amo-5-desktop-bunker.png` | Keep keys on Gooti Desktop or a NIP-46 bunker |

### Other fields

| Field | Should be | Live on 2026-11-20 |
|---|---|---|
| License | MIT | MPL-2.0 (wrong since 2.0.0) |
| Privacy policy | https://getgooti.com/privacy.html | none |
| Homepage, support site | https://getgooti.com | https://getgooti.com |
| Categories | Social & Communication, Privacy & Security | Social & Communication |
| Tags | from AMO's list, e.g. privacy, security | none |

### Release notes 2.1.0 (live 2026-11-20)

```
New
- Site-only identities: when a new site asks which identity to use, create a fresh identity just for that site. It gets its own group under Identities and can be kept as a regular identity later.
- Devices (Settings): see every browser and Gooti Desktop that uses your backup, and when each last backed up. Rename this browser or remove others from the list.
- Gooti Desktop: for identities the desktop holds, this browser now signs with a key of its own that never goes into the backup. You allow it once in Gooti Desktop, confirming a short code shown on both sides.

Changed
- Identities held by Gooti Desktop need Gooti Desktop 0.2.0 or later and one "Allow" for this browser before it can sign as them.

Fixed
- Activity shows the reason when a bunker refuses a request.
```

### Notes to reviewer (2.1.0)

Rebuild steps for the source zip: Node.js 26 (built with 26.13.0, npm 11.20.0), bash and jq; `npm ci`,
`npm run build:firefox`; `dist/firefox` matches the submitted zip file for file (checked for 2.1.0). Then
what the add-on does (NIP-07 signer; content script on all sites only for `window.nostr`; permissions
`storage` and `activeTab`; WebSocket only to the user's Nostr relays, everything end-to-end encrypted; no
data collection), the changes in the version, and how to test without an account.

## Chrome Web Store

https://chromewebstore.google.com/detail/gooti/cpcnmacmpalecmijkbcajanpdlcgjpgj

Chrome takes the name and summary from the manifest (`projects/chrome/public/manifest.json`), so they
change only with a new version's zip. Live with 2.1.0: `Gooti - Nostr Identity Manager & Signer`, summary
`Manage and switch between multiple identities while interacting with Nostr apps`. In the manifest for the
next release (summary at most 132 characters):

- Name: `Gooti – Nostr Signer, Identities & Backup`
- Summary: `Nostr signer (NIP-07): an identity per site, one encrypted backup for every device, keys on Gooti Desktop or a bunker.`

The Firefox manifest carries the same two texts; they show in Firefox's add-on list, while the AMO listing
name and summary are set on the store. Record the Chrome store's description and screenshots here.
