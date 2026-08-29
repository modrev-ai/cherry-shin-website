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

// Returns null for a platform that is not configured, which means it was never
// asked and cannot be counted. A platform that is configured but throws returns
// `failed`, which is a different thing from having nothing to say.
export async function collectStats(name, configured, load) {
    if (!configured) return null;
    try {
        return { name, stats: await load() };
    } catch (error) {
        console.warn(`${name} stats unavailable:`, error.message);
        return { name, failed: true };
    }
}

// Folds what came back into the platforms that reported, plus the counts the
// blackout rule needs. A platform that answered without usable numbers is not a
// failure — it is a platform with nothing to report, and it leaves the others
// untouched.
export function summariseStats(collected) {
    const platforms = {};
    let asked = 0;
    let failed = 0;

    for (const result of collected) {
        if (!result) continue;   // not configured, so never asked
        asked += 1;
        if (result.failed) {
            failed += 1;
        } else if (result.stats) {
            platforms[result.name] = result.stats;
        }
    }

    return { platforms, asked, failed };
}

// Only a total blackout is worth a 502. Note that asking nothing is not a
// blackout: a site with no platforms configured yet is in a legitimate state,
// not a broken one.
export function isTotalBlackout({ asked, failed }) {
    return asked > 0 && failed === asked;
}

// null rather than 0 when nothing numeric was reported. The distinction is the
// whole of promise two: 0 is a measurement, null is the absence of one, and a
// follower count is exactly the sort of figure nobody should invent.
export function sumField(platforms, field) {
    const values = Object.values(platforms)
        .map(p => p[field])
        .filter(v => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
