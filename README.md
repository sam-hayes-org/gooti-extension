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
```

The repository is configured to hold the extensions for Chrome and Firefox. While the Chrome extension is yet already available, the Firefox extension will follow later.

[Chrome Extension](https://chromewebstore.google.com/detail/cgikhnoggbhdblnckhcahgkipmiiohbk)

Firefox Extension (yet to come)

## Develop Chrome Extension

To run the Chrome extension from this code:

```
git clone https://github.com/sam-hayes-org/gooti-extension
cd gooti-extension
npm i
npm run watch:chrome
```

then

1. within Chrome go to `chrome://extensions`
2. ensure "developer mode" is enabled on the top right
3. click on "Load unpackaged"
4. select the `dist/chrome` folder of this repository

---

LICENSE: Public Domain