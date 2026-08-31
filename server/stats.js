// Aggregating audience figures across platforms, and the two promises in it.
//
// PROMISE ONE — A PARTIAL ANSWER IS A REAL ANSWER.
//
// One unreachable API used to propagate out of here and answer 502 for the
// endpoint as a whole, so the hero dropped every number it had — including the
// ones that had arrived perfectly well — and showed nothing at all. Each
// platform is now collected in isolation, and a platform that fails costs its
// own figures and nobody else's.
//
// It is one careless `await` from regressing to exactly that. The guarantee is
// the try/catch in collectStats plus the fact that nothing above it rethrows.
//
// PROMISE TWO — UNCONFIGURED IS NOT ZERO.
//
// A platform that is not set up is never asked, and a total with nothing behind
// it is null rather than 0. Reporting zero followers for a platform that simply
// has no credentials is the same dishonesty as the invented engagement counts
// already removed from the sample cards — a figure asserted about a real
// account that nobody measured.

// Three outcomes, not two, because "asked and got nothing" is its own state.
//
// null           - not configured, never asked, cannot be counted at all.
// failed: true   - asked, and the load threw.
// silent: true   - asked, and the load resolved without usable numbers.
//
// `silent` exists because every one of the four loaders has a `return null`
// path that does NOT throw, and each of those paths is an error it declined to
// raise: a Graph `data.error` body, a YouTube response with no `statistics`, a
// TikTok reply with no `user`. Before this, that produced neither a `failed`
// count nor a platforms entry, so a platform could drop out of the site's
// figures indefinitely and look exactly like one nobody had configured.
//
// Loaders still must not throw for it. The isolation in the catch below - one
// platform's failure costing nobody else's figures - is promise one, and it was
// regained from a real incident. This adds a state; it does not move the line.
export async function collectStats(name, configured, load) {
    if (!configured) return null;
    try {
        const stats = await load();
        return stats ? { name, stats } : { name, silent: true };
    } catch (error) {
        console.warn(`${name} stats unavailable:`, error.message);
        return { name, failed: true };
    }
}

// Folds what came back into the platforms that reported, plus the counts the
// blackout rule needs. A platform that answered without usable numbers is still
// not a `failure` - that distinction is kept - but it is now NAMED in `silent`
// rather than vanishing, and it leaves the others untouched either way.
//
// `silent` is a list of names rather than a count so the response can say WHICH
// platform went quiet. A number would have made the state observable in the
// aggregate and still unactionable.
//
// The branch reads collectStats' `silent` flag rather than re-deriving it from
// `!result.stats`. Both orderings behave identically, which is the problem: with
// the flag unread, removing it from collectStats was a mutation nothing could
// detect, and one of the two places deciding this was decorative. Deciding it
// once, where the load actually resolved, is what makes either half testable.
export function summariseStats(collected) {
    const platforms = {};
    const silent = [];
    let asked = 0;
    let failed = 0;

    for (const result of collected) {
        if (!result) continue;   // not configured, so never asked
        asked += 1;
        if (result.failed) {
            failed += 1;
        } else if (result.silent) {
            silent.push(result.name);
        } else {
            platforms[result.name] = result.stats;
        }
    }

    return { platforms, silent, asked, failed };
}

// Only a total blackout is worth a 502. Note that asking nothing is not a
// blackout: a site with no platforms configured yet is in a legitimate state,
// not a broken one.
//
// Silence counts toward it. A platform that threw and a platform that quietly
// returned null are different events with the same consequence - no numbers -
// and when EVERY platform asked did one or the other, the response carries no
// figures at all. That is the condition this rule exists to catch, and reading
// only `failed` meant the all-silent case answered 200 with an empty body and
// nothing logged anywhere.
//
// Strictly a widening: with no silent platforms this is the old predicate. It
// takes the whole summary rather than two fields, because the default below is
// otherwise a way for a call site to disable the rule by forgetting an argument
// and still get a plausible answer. The route test drives the real call site
// for exactly that reason.
export function isTotalBlackout({ asked, failed, silent = [] }) {
    return asked > 0 && failed + silent.length === asked;
}

// null rather than 0 when nothing numeric was reported. The distinction is the
// whole of promise two: 0 is a measurement, null is the absence of one, and a
// follower count is exactly the sort of figure nobody should invent.
export function sumField(platforms, field) {
    const values = Object.values(platforms)
        .map(p => p?.[field])
        .filter(v => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
