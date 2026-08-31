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

// 3b. MRO-410. The SECOND request inside the same backoff window, which is where
//     the defect started. The case above stops at the first serve - the one case
//     whose label was already right - so it could never see this.
//
//     The error path used to implement its backoff by pushing `expiresAt`
//     forward, which made an expired entry satisfy the freshness test and report
//     itself as an ordinary hit. Measured before the fix: serve 1 source=stale,
//     serves 2 and 3 source=store with hits+1 and staleServes+0, so during an
//     outage /api/cache/stats counted roughly one stale serve per 30s and read
//     every other request as a healthy hit.
{
    const before = getStats();
    let upstreamAttempts = 0;
    const stillDown = async () => { upstreamAttempts++; throw new Error('upstream down'); };

    const second = await cached('k3', stillDown, { ttlMs: 20, maxStaleMs: 60000 });
    const third = await cached('k3', stillDown, { ttlMs: 20, maxStaleMs: 60000 });
    const after = getStats();

    check('a repeat serve inside the backoff window is stale, not a hit',
        second.source === 'stale' && third.source === 'stale',
        `sources: ${second.source}, ${third.source}`);
    check('and the counters say so too - staleServes +2, hits +0',
        after.staleServes - before.staleServes === 2 && after.hits === before.hits,
        `staleServes +${after.staleServes - before.staleServes}, hits +${after.hits - before.hits}`);
    check('the old copy is still what comes back',
        second.value.v === 'good' && third.value.v === 'good');
    // The point of the backoff is not calling upstream. If this fires, the label
    // was fixed by removing the behaviour rather than by describing it.
    check('and upstream was NOT called again - the backoff still holds',
        upstreamAttempts === 0, `upstream attempts: ${upstreamAttempts}`);
}

// 3c. The backoff window does not outrank maxStaleMs.
//
//     `retryAfter` is set to failureTime + errorBackoffMs, and the failure path
//     only sets it while the entry is still within maxStaleMs. So an entry can
//     cross maxStaleMs partway through a backoff window, and the read branch has
//     to re-check rather than trust that retryAfter implies servable.
//
//     Caught by mutation: removing the bound left every other case green,
//     because in ordinary settings the overshoot is 30s against a 24h ceiling.
//     It is load-bearing anyway - that ceiling exists because a cached payload
//     holds media URLs signed at fill time, and serving past it returns a
//     complete, correct-looking 200 whose images are all dead (MRO-317).
{
    clear();
    let attempts = 0;
    const OPTS = { ttlMs: 10, maxStaleMs: 40, errorBackoffMs: 5000 };
    const down = async () => { attempts++; throw new Error('upstream down'); };

    await cached('k3c', async () => ({ v: 'good' }), OPTS);
    await sleep(20);                     // expired, still inside maxStaleMs

    const served = await cached('k3c', down, OPTS);
    check('the first failure serves stale and opens a long backoff window',
        served.source === 'stale' && attempts === 1, `${served.source}, attempts ${attempts}`);

    await sleep(60);                     // now past maxStaleMs, still inside retryAfter

    let threw = false;
    try { await cached('k3c', down, OPTS); } catch { threw = true; }
    check('once past maxStaleMs it is NOT served, even mid-backoff',
        threw, 'an open backoff window must not outrank the staleness ceiling');
    check('and upstream was retried rather than the dead copy being handed out',
        attempts === 2, `upstream attempts: ${attempts}`);
}

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

// 10. The upstream budget caps fills per window. Clamping `limit` removes the
// cheap way to mint keys; this bounds what varying a cursor can still cost.
clear();
let budgetCalls = 0;
let refused = 0;
for (let i = 0; i < 45; i++) {
    try {
        await cached(`bud:${i}`, async () => { budgetCalls++; return { i }; },
            { ttlMs: 60000, maxStaleMs: 60000, budget: 'yt' });
    } catch (err) {
        if (err.name === 'BudgetExceededError') refused++;
    }
}
check('budget caps upstream fills at 40', budgetCalls === 40, `called ${budgetCalls}x`);
check('fills past the budget are refused', refused === 5, `refused ${refused}`);

// 11. A refused fill serves a stale copy where one exists. Slightly old content
// beats failing a platform whose only problem is our own throttle.
clear();
let staleN = 0;
await cached('s1', async () => ({ n: ++staleN }), { ttlMs: 20, maxStaleMs: 60000, budget: 'ig' });
await sleep(40);
for (let i = 0; i < 39; i++) {
    await cached(`pad:${i}`, async () => ({ i }), { ttlMs: 60000, maxStaleMs: 60000, budget: 'ig' });
}
const refusedResult = await cached('s1', async () => ({ n: ++staleN }),
    { ttlMs: 20, maxStaleMs: 60000, budget: 'ig' });
check('a refused fill serves stale rather than failing',
    refusedResult.source === 'stale' && refusedResult.value.n === 1,
    `source ${refusedResult.source}, n ${refusedResult.value.n}`);

// 12. Only a fill spends budget. A served hit must not, or a popular page would
// throttle itself.
clear();
let hitCalls = 0;
for (let i = 0; i < 50; i++) {
    await cached('same', async () => { hitCalls++; return { i }; },
        { ttlMs: 60000, maxStaleMs: 60000, budget: 'fb' });
}
check('cache hits do not spend budget', hitCalls === 1, `producer ran ${hitCalls}x`);

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');

process.exit(fail.length ? 1 : 0);
