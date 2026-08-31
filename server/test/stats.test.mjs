// Run with: node server/test/stats.test.mjs
//
// Both promises here have already failed once, so both are tested in the shape
// they failed in rather than as properties. The incident is also a
// specification of realistic input — see MRO-306.
//
// One: a partial answer is a real answer. An unreachable API used to propagate
// out and answer 502 for the whole endpoint, so the hero dropped every number
// it had, including the ones that had arrived fine.
//
// Two: unconfigured is not zero. A platform nobody asked must not appear as a
// measured zero.

import { collectStats, summariseStats, isTotalBlackout, sumField } from '../stats.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// Calls are wrapped so a mutation that makes one throw is reported rather than
// killing the run — a red that names nothing tells you a mutation was detected
// and nothing about what.
const safely = async (fn) => {
    try { return await fn(); } catch (err) { return `THREW ${err.constructor.name}`; }
};

const quiet = console.warn;
console.warn = () => {};   // collectStats logs every failure; that is the point of it

// --- promise one, in the shape it failed in ----------------------------------

{
    // The incident: one platform unreachable, three answering.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => ({ followers: 1200 })),
        collectStats('instagram', true, async () => { throw new Error('ECONNREFUSED'); }),
        collectStats('facebook', true, async () => ({ followers: 340 })),
        collectStats('tiktok', true, async () => ({ followers: 90 })),
    ]));

    check('one unreachable platform does not throw out of collection',
        Array.isArray(collected) && collected.length === 4,
        `got ${typeof collected === 'string' ? collected : typeof collected}`);
    if (!Array.isArray(collected)) throw new Error('collection did not survive; later cases skipped');

    const { platforms, asked, failed } = summariseStats(collected);

    check('the three that answered keep their figures — the original incident',
        Object.keys(platforms).sort().join() === 'facebook,tiktok,youtube',
        `kept ${Object.keys(platforms).sort().join()}`);
    check('the one that failed is counted as failed, not silently dropped',
        asked === 4 && failed === 1, `asked ${asked}, failed ${failed}`);
    check('one failure out of four is not a blackout',
        isTotalBlackout({ asked, failed }) === false);
    check('the surviving numbers still add up',
        sumField(platforms, 'followers') === 1630, `got ${sumField(platforms, 'followers')}`);
}

{
    // The only case that should 502.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => { throw new Error('down'); }),
        collectStats('instagram', true, async () => { throw new Error('down'); }),
    ]));
    const summary = summariseStats(collected);
    check('every configured platform failing IS a blackout',
        isTotalBlackout(summary) === true, JSON.stringify(summary));
}

{
    // Asking nobody is a legitimate state, not a broken one. A site with no
    // platforms configured yet must not 502.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', false, async () => ({ followers: 1 })),
        collectStats('instagram', false, async () => ({ followers: 1 })),
    ]));
    const summary = summariseStats(collected);
    check('no platforms configured is not a blackout',
        isTotalBlackout(summary) === false, `asked ${summary.asked}`);
}

{
    // A platform that answers with nothing usable is not a failure.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => null),
        collectStats('instagram', true, async () => ({ followers: 500 })),
    ]));
    const { platforms, silent, asked, failed } = summariseStats(collected);
    check('a platform with nothing to report is not a failure',
        failed === 0 && asked === 2 && Object.keys(platforms).join() === 'instagram',
        `failed ${failed}, kept ${Object.keys(platforms).join()}`);
    check('but it is named rather than vanishing — MRO-398',
        silent.join() === 'youtube', `silent ${JSON.stringify(silent)}`);
    check('one silent platform out of two is not a blackout',
        isTotalBlackout({ asked, failed, silent }) === false);
}

// --- MRO-398, asked-and-answered-nothing is its own state --------------------
//
// The defect: `asked` incremented, `failed` did not, and no platforms entry was
// written, so the platform was absent from the response in exactly the way an
// unconfigured one is. These cases are the distinction, and the blackout case is
// the one the old code could not reach at all.

{
    // The discriminating pair: one asked and silent, one never configured. The
    // old response could not tell these apart — both were simply absent.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => null),
        collectStats('facebook', false, async () => ({ followers: 1 })),
        collectStats('instagram', true, async () => ({ followers: 500 })),
    ]));
    const { platforms, silent, asked } = summariseStats(collected);

    check('the silent platform and the unconfigured one are now distinguishable',
        silent.join() === 'youtube' && asked === 2,
        `silent ${JSON.stringify(silent)}, asked ${asked}`);
    check('the unconfigured platform is in neither list, not merely out of one',
        !silent.includes('facebook') && !Object.keys(platforms).includes('facebook'));
    check('a platform is in exactly one of connected and silent',
        Object.keys(platforms).filter(n => silent.includes(n)).length === 0,
        'overlap would make `connected` a lie rather than a partial truth');
}

{
    // The case the old predicate could not reach: nothing threw, so `failed` was
    // 0, so `failed === asked` was false, and the endpoint answered 200 with no
    // numbers in it and nothing logged.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => null),
        collectStats('instagram', true, async () => null),
    ]));
    const summary = summariseStats(collected);
    check('every configured platform answering with nothing IS a blackout',
        isTotalBlackout(summary) === true, JSON.stringify(summary));
    check('and it got there without a single failure recorded',
        summary.failed === 0 && summary.silent.length === 2,
        `failed ${summary.failed}, silent ${JSON.stringify(summary.silent)}`);
}

{
    // Mixed causes, same consequence. Neither count alone reaches `asked`.
    const collected = await safely(() => Promise.all([
        collectStats('youtube', true, async () => { throw new Error('down'); }),
        collectStats('instagram', true, async () => null),
    ]));
    const summary = summariseStats(collected);
    check('one that threw plus one that went quiet is still a blackout',
        isTotalBlackout(summary) === true,
        `failed ${summary.failed}, silent ${JSON.stringify(summary.silent)} — neither alone equals asked`);
}

{
    // The widening is strict: where there is no silence, the rule is unchanged.
    check('the old two-field predicate still answers the same for a real blackout',
        isTotalBlackout({ asked: 2, failed: 2 }) === true);
    check('and the same for a partial outage',
        isTotalBlackout({ asked: 3, failed: 1 }) === false);
    check('asking nobody is still not a blackout, however it is called',
        isTotalBlackout({ asked: 0, failed: 0, silent: [] }) === false);
}

// --- promise two, unconfigured is not zero -----------------------------------

{
    const ran = [];
    const collected = await safely(() => Promise.all([
        collectStats('youtube', false, async () => { ran.push('youtube'); return { followers: 0 }; }),
        collectStats('instagram', true, async () => { ran.push('instagram'); return { followers: 42 }; }),
    ]));
    check('an unconfigured platform is never even asked',
        ran.join() === 'instagram', `ran ${ran.join()}`);
    check('an unconfigured platform yields null rather than a record',
        collected[0] === null, `got ${JSON.stringify(collected[0])}`);

    const { platforms, asked } = summariseStats(collected);
    check('an unconfigured platform is not counted among those asked',
        asked === 1, `asked ${asked}`);
    check('and does not appear in the platforms reported',
        Object.keys(platforms).join() === 'instagram');
}

check('a total with nothing behind it is null, not zero',
    sumField({}, 'followers') === null,
    `got ${JSON.stringify(sumField({}, 'followers'))} — zero would be a figure nobody measured`);

check('a total is still null when every platform reports a non-number',
    sumField({ youtube: { followers: null }, instagram: { followers: undefined } }, 'followers') === null);

check('a real zero from a platform that answered is kept',
    sumField({ youtube: { followers: 0 } }, 'followers') === 0,
    'a measured zero is a fact; an unmeasured one is not');

check('non-numeric values are skipped rather than coerced',
    sumField({ a: { followers: 10 }, b: { followers: null }, c: { followers: 5 } }, 'followers') === 15);

check('a hidden count alongside real ones does not poison the total',
    sumField({ youtube: { followers: null }, instagram: { followers: 42 } }, 'followers') === 42,
    'YouTube hides subscriber counts for some channels');

console.warn = quiet;
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
