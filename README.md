# Gooti

## Nostr Identity Manager & Signer

Gooti is a browser extension for managing multiple [Nostr](https://github.com/nostr-protocol/nostr) identities and for signing events on web apps without having to give them your keys.

It implements these mandatory [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) methods:

```typescript
async window.nostr.getPublicKey(): string
async window.nostr.signEvent(event: { created_at: number, kind: number, tags: string[][], content: string }): Event
```

It also implements these optional methods:

```typescript
async window.nostr.getRelays(): { [url: string]: {read: boolean, write: boolean} }
async window.nostr.nip04.encrypt(pubkey, plaintext): string
async window.nostr.nip04.decrypt(pubkey, ciphertext): string
async window.nostr.nip44.encrypt(pubkey, plaintext): string
async window.nostr.nip44.decrypt(pubkey, ciphertext): string
```

The repository is configured as monorepo to hold the extensions for Chrome and Firefox. 

[Get the Firefox extension here!](https://addons.mozilla.org/en-US/firefox/addon/gooti/)

[Get the Chrome extension here!](https://chromewebstore.google.com/detail/gooti/cpcnmacmpalecmijkbcajanpdlcgjpgj)

## Develop Chrome Extension

To build and run the Chrome extension from this code:

```
git clone https://github.com/sam-hayes-org/gooti-extension
cd gooti-extension
npm ci
npm run build:chrome
```

then

1. within Chrome go to `chrome://extensions`
2. ensure "developer mode" is enabled on the top right
3. click on "Load unpackaged"
4. select the `dist/chrome` folder

## Develop Firefox Extension

To build and run the Firefox extension from this code:

```
git clone https://github.com/sam-hayes-org/gooti-extension
cd gooti-extension
npm ci
npm run build:firefox
```

then

1. within Firefox go to `about://debugging`
2. click "This Firefox" on the left
3. click on "Load Temporary Add-on..."
4. select the `dist/firefox` folder

---

LICENSE: Public Domain