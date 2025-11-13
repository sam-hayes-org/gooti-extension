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

## Build Extension Packages

To create installable extension packages, first ensure you have built the extensions:

### Chrome Extension Package (.zip)

```bash
npm run build:chrome
cd dist/chrome
zip -r gooti-chrome-extension.zip .
```

**Install from package:**
1. Go to `chrome://extensions`
2. Enable "Developer mode" 
3. Click "Load unpacked" and select the `dist/chrome` folder, OR
4. Drag and drop the `.zip` file onto the extensions page

### Firefox Extension Package (.xpi)

```bash
npm run build:firefox
cd dist/firefox
zip -r gooti-firefox-extension.xpi .
```

**Install from package:**
1. Go to `about:addons`
2. Click the gear icon and select "Install Add-on From File..."
3. Select the `.xpi` file

**Note:** Firefox may require the extension to be signed for permanent installation. For development and testing, use the temporary installation method described above.

## Testing the Extension

### Development Mode with Live Reload

For active development with automatic rebuilding:

**Chrome:**
```bash
npm run watch:chrome
```

**Firefox:**
```bash
npm run watch:firefox
```

This will automatically rebuild the extension when you make changes to the source code.

### Manual Testing Steps

Once the extension is loaded in your browser:

#### 1. Initial Setup
1. Click the Gooti extension icon in your browser toolbar
2. Create a new vault or import an existing one
3. Create or import a Nostr identity

#### 2. Test Relay Management
1. Navigate to an identity's relay settings
2. Test adding relays with different formats:
   - `relay.example.com` (should auto-add `wss://` prefix)
   - `ws://relay.example.com` (should preserve `ws://` prefix)
   - `wss://relay.example.com` (should preserve `wss://` prefix)
   - URLs without trailing slash (should auto-add `/`)
3. Verify that the input field updates to show the complete URL after adding
4. Test read/write permissions for relays
5. Test removing relays

#### 3. Test NIP-07 Integration
Visit a Nostr web application (like [Snort](https://snort.social) or [Iris](https://iris.to)) and test:

1. **Public Key Access:**
   - The app should be able to request your public key
   - Gooti should prompt for permission
   - Verify the correct public key is returned

2. **Event Signing:**
   - Try posting a note or performing actions that require signing
   - Gooti should prompt to sign events
   - Verify events are properly signed

3. **Relay Information:**
   - Apps should be able to access your relay list
   - Verify the correct relays are returned with proper read/write flags

4. **Encryption/Decryption (NIP-04 & NIP-44):**
   - Test direct messaging features
   - Verify encryption and decryption work properly

#### 4. Test Identity Management
1. Create multiple identities
2. Switch between identities
3. Test that each identity has its own relay configuration
4. Test identity export/import functionality

#### 5. Test Vault Security
1. Lock the vault and verify it requires password to unlock
2. Test vault backup and restore
3. Verify that sensitive data is properly encrypted

### Automated Testing

Run the test suite:
```bash
npm test
```

Run linting:
```bash
npm run lint
```

### Browser-Specific Testing

#### Chrome-specific features:
- Test extension popup behavior
- Verify manifest v3 compatibility
- Test service worker functionality

#### Firefox-specific features:
- Test extension sidebar (if applicable)
- Verify manifest v2 compatibility
- Test background script functionality

### Performance Testing
1. Test with multiple identities (10+)
2. Test with many relays per identity (20+)
3. Monitor memory usage during extended use
4. Test extension startup time

### Security Testing
1. Verify that private keys are never exposed to web pages
2. Test that permissions are properly requested and enforced
3. Verify that vault encryption is working correctly
4. Test that the extension works properly in incognito/private browsing mode

---

LICENSE: Public Domain