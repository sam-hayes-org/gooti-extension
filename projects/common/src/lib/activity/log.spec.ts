import {
  ACTIVITY_LIMIT,
  ActivityEntry,
  ActivityStore,
  activityOutcome,
  appendActivity,
  formatActivityTime,
  parseActivity,
  recordActivity,
  recordSyncActivity,
  syncFailureReason,
} from './log';

describe('activity log', () => {
  const entry = (at: number, host = 'primal.net'): ActivityEntry => ({
    at,
    host,
    identity: 'Pter',
    method: 'signEvent',
    kind: 1,
    outcome: 'allowed',
  });

  it('keeps the newest call first and drops past the limit', () => {
    const existing = Array.from({ length: ACTIVITY_LIMIT }, (_, index) => entry(index));

    const next = appendActivity(existing, entry(ACTIVITY_LIMIT, 'iris.to'));

    expect(next.length).toBe(ACTIVITY_LIMIT);
    const newest = next[0];
    if ('sync' in newest) {
      fail('expected a site row');
      return;
    }
    expect(newest.host).toBe('iris.to');
    expect(next[next.length - 1].at).toBe(ACTIVITY_LIMIT - 2);
  });

  it('reads only complete rows', () => {
    expect(
      parseActivity([
        entry(2),
        { at: 1, host: 'nos.lol', method: 'getPublicKey', outcome: 'denied' },
        { host: 'nos.lol', method: 'getPublicKey', outcome: 'denied' },
        { at: 1, host: 'nos.lol', method: 'getPublicKey', outcome: 'maybe' },
        'nope',
      ]),
    ).toEqual([
      entry(2),
      { at: 1, host: 'nos.lol', method: 'getPublicKey', outcome: 'denied' },
    ]);
  });

  it('names a closed window and a refusal, and treats other errors as failed', () => {
    expect(activityOutcome(new Error('Vault unlock was dismissed.'))).toBe('dismissed');
    expect(activityOutcome(new Error('Permission denied'))).toBe('denied');
    expect(activityOutcome(new Error('Vault is locked.'))).toBe('failed');
  });

  it('writes the new row ahead of the stored ones', async () => {
    const saved: unknown[] = [];
    const store: ActivityStore = {
      async get() {
        return saved;
      },
      async set(entries) {
        saved.splice(0, saved.length, ...entries);
      },
    };

    await recordActivity(store, { host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' }, 10);
    await recordActivity(store, { host: 'primal.net', method: 'signEvent', kind: 1, outcome: 'once' }, 11);

    expect(saved).toEqual([
      { at: 11, host: 'primal.net', method: 'signEvent', kind: 1, outcome: 'once' },
      { at: 10, host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' },
    ]);
  });

  it('keeps a sync row beside a site row and drops a bad sync result', () => {
    expect(
      parseActivity([
        { at: 3, sync: 'now', result: 'failed', reason: '  No sync relay accepted the vault.  ' },
        { at: 2, sync: 'auto', result: 'synced', reason: 'should drop' },
        entry(1),
        { at: 4, sync: 'later', result: 'synced', host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' },
        { at: 5, sync: 'now', result: 'nope' },
      ]),
    ).toEqual([
      { at: 3, sync: 'now', result: 'failed', reason: 'No sync relay accepted the vault.' },
      { at: 2, sync: 'auto', result: 'synced' },
      entry(1),
    ]);
  });

  it('writes a sync row ahead of site rows and keeps a reason only when it failed', async () => {
    const saved: unknown[] = [];
    const store: ActivityStore = {
      async get() {
        return saved;
      },
      async set(entries) {
        saved.splice(0, saved.length, ...entries);
      },
    };

    await recordActivity(store, { host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' }, 10);
    await recordSyncActivity(store, { sync: 'now', result: 'current', reason: 'nope' }, 20);
    await recordSyncActivity(
      store,
      { sync: 'auto', result: 'failed', reason: 'No sync relay could be reached.' },
      21,
    );
    await recordSyncActivity(store, { sync: 'now', result: 'failed', reason: '   ' }, 22);

    expect(saved).toEqual([
      { at: 22, sync: 'now', result: 'failed' },
      { at: 21, sync: 'auto', result: 'failed', reason: 'No sync relay could be reached.' },
      { at: 20, sync: 'now', result: 'current' },
      { at: 10, host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' },
    ]);
  });

  it('keeps a short failure reason and falls back when the error has none', () => {
    expect(syncFailureReason(new Error('  No sync relay accepted the vault.  '))).toBe(
      'No sync relay accepted the vault.',
    );
    expect(syncFailureReason('nope')).toBe('Sync failed.');
    expect(syncFailureReason(new Error('   '))).toBe('Sync failed.');
    const long = 'x'.repeat(200);
    const capped = syncFailureReason(new Error(long));
    expect(capped.length).toBe(180);
    expect(capped.endsWith('…')).toBeTrue();
    expect(capped.startsWith('x'.repeat(179))).toBeTrue();
  });

  it('shows the clock for today and the date for an older row', () => {
    const now = new Date(2026, 10, 2, 15, 4, 0).getTime();
    const earlier = new Date(2026, 10, 1, 9, 5, 0).getTime();

    expect(formatActivityTime(now, now)).toBe('15:04');
    expect(formatActivityTime(earlier, now)).toBe('11/1 09:05');
  });
});
