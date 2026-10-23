import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '../backup/state';
import {
  avatarCells,
  cellsForPrivkey,
  colorForPrivkey,
  colorFromPubkey,
  readIdentityColor,
} from './appearance';

describe('identity appearance', () => {
  const secret = generateSecretKey();
  const privkey = bytesToHex(secret);
  const pubkey = getPublicKey(secret);

  it('derives a stable color from the pubkey', () => {
    const color = colorFromPubkey(pubkey);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorFromPubkey(pubkey)).toBe(color);
    expect(colorForPrivkey(privkey)).toBe(color);
  });

  it('keeps a stored color and ignores anything else', () => {
    expect(readIdentityColor('#A1B2C3')).toBe('#a1b2c3');
    expect(readIdentityColor('red')).toBeUndefined();
    expect(colorForPrivkey(privkey, '#A1B2C3')).toBe('#a1b2c3');
    expect(colorForPrivkey(privkey, 'red')).toBe(colorFromPubkey(pubkey));
  });

  it('paints a symmetric identicon', () => {
    const cells = avatarCells(pubkey);
    expect(cells.length).toBeGreaterThan(0);
    expect(cellsForPrivkey(privkey)).toEqual(cells);
    for (const cell of cells) {
      const mirror = cells.some((other) => other.y === cell.y && other.x === 4 - cell.x);
      expect(mirror).toBeTrue();
    }
  });
});
