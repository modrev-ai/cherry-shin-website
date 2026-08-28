// Run with: node server/test/cache.test.mjs
//
// No framework on purpose - one file, no dependency to install, runnable
// anywhere node is. Timings use short TTLs rather than a mocked clock, so
// the sleeps are real but measured in tens of milliseconds.
import { cached, getStats, clear } from '../cache.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// 1. TTL: a fresh entry is served without calling upstream again
clear();
let calls = 0;
const producer = async () => { calls++; return { n: calls }; };
await cached('k1', producer, { ttlMs: 5000 });
await cached('k1', producer, { ttlMs: 5000 });
check('TTL serves from store', calls === 1, `producer called ${calls}x`);

// 2. Coalescing: concurrent callers share one upstream call
clear();
calls = 0;
const slow = async () => { calls++; await sleep(80); return { n: calls }; };
await Promise.all(Array.from({ length: 10 }, () => cached('k2', slow, { ttlMs: 5000 })));
check('coalescing: 10 concurrent -> 1 upstream', calls === 1, `producer called ${calls}x`);

// 3. Stale-on-error: expired but within maxStaleMs is served when upstream fails
clear();
await cached('k3', async () => ({ v: 'good' }), { ttlMs: 20, maxStaleMs: 60000 });
await sleep(40); // now expired, well within maxStaleMs
const stale = await cached('k3', async () => { throw new Error('upstream down'); },
    { ttlMs: 20, maxStaleMs: 60000 });
check('stale-on-error serves the old copy', stale.value.v === 'good' && stale.source === 'stale',
    JSON.stringify({ source: stale.source, value: stale.value }));

// 4. Failure backoff: no cached copy, repeated callers do not each hit upstream
clear();
calls = 0;
const boom = async () => { calls++; throw new Error('nope'); };
for (let i = 0; i < 5; i++) {
    try { await cached('k4', boom, { ttlMs: 20, errorBackoffMs: 5000 }); } catch { /* expected */ }
}
check('failure backoff suppresses retries', calls === 1, `producer called ${calls}x`);

// 5. Sweep removes entries older than maxStaleMs
clear();
await cached('k5', async () => ({ v: 1 }), { ttlMs: 10, maxStaleMs: 30 });
check('entry present before sweep', getStats().entries.length === 1);
await sleep(60); // now older than maxStaleMs
await cached('other', async () => ({ v: 2 }), { ttlMs: 10, maxStaleMs: 30 }); // a miss triggers sweep
const keys = getStats().entries.map(e => e.key);
check('sweep drops entries past maxStaleMs', !keys.includes('k5'), `keys: ${keys}`);

// 6. Sweep respects a per-call maxStaleMs rather than the default
clear();
await cached('longlived', async () => ({ v: 1 }), { ttlMs: 10, maxStaleMs: 60000 });
await sleep(40);
await cached('trigger', async () => ({ v: 2 }), { ttlMs: 10, maxStaleMs: 30 });
check('sweep honours per-entry maxStaleMs',
    getStats().entries.map(e => e.key).includes('longlived'));

// 7. Elapsed failure entries are cleared, so upstream is retried afterwards
clear();
calls = 0;
try { await cached('k7', boom, { ttlMs: 10, errorBackoffMs: 30 }); } catch { /* expected */ }
await sleep(60);
try { await cached('k7', boom, { ttlMs: 10, errorBackoffMs: 30 }); } catch { /* expected */ }
check('failure backoff expires and retries', calls === 2, `producer called ${calls}x`);

// 8. Entry count never exceeds the ceiling
clear();
for (let i = 0; i < 620; i++) {
    await cached(`bulk:${i}`, async () => ({ i }), { ttlMs: 60000, maxStaleMs: 60000 });
}
const size = getStats().entries.length;
check('entry count capped at 500', size <= 500, `size ${size}`);

// 9. A hit does not change the store (no sweeping on the hit path)
clear();
await cached('h1', async () => ({ v: 1 }), { ttlMs: 60000, maxStaleMs: 60000 });
await cached('h2', async () => ({ v: 2 }), { ttlMs: 60000, maxStaleMs: 60000 });
const before = getStats().entries.length;
await cached('h1', async () => ({ v: 9 }), { ttlMs: 60000, maxStaleMs: 60000 });
check('hit path leaves the store untouched', getStats().entries.length === before,
    `${before} -> ${getStats().entries.length}`);

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');

process.exit(fail.length ? 1 : 0);
