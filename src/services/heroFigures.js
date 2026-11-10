// What the hero is allowed to say about Cherry's audience, decided once.
//
// The hero's figures are the one place on the page that makes a claim about a
// real account, so the rules live here in a plain module with its own suite
// (src/services/heroFigures.test.mjs) rather than inside the component - the
// convention README "CI and hooks" sets for any decision a component grows.
//
// THREE STATES, matching the data /api/stats sends (server/stats.js):
//
//   no measurement yet   a total is null, or nothing has loaded. Shown as
//                        NOT_MEASURED, a non-numeric placeholder - NEVER 0,
//                        because 0 is a measurement and null is the absence
//                        of one (sumField, MRO-241).
//   measured             a number. Shown as exactly that number, compacted.
//   platform silent      asked and answered with nothing (MRO-398): named in
//                        `silent`, absent from `platforms`. Listed as not
//                        reporting, with no figures at all.
//
// There is deliberately no count-up. An animation that eases from zero, or
// overshoots and settles, displays figures nobody measured for as long as it
// runs (MKB "cherrystudio.art - hero motion", constraint one). The reveal moves
// the figure; it never changes the digits. The only text a figure ever renders
// is the value returned here.

import { platformLabel } from '../constants/platforms.js'

export const NOT_MEASURED = '—'

// Spoken in place of the dash, which a screen reader reads as "em dash".
export const NOT_MEASURED_LABEL = 'not measured yet'

const FIGURES = [
    { key: 'followers', label: 'Followers' },
    { key: 'posts', label: 'Posts' },
    { key: 'views', label: 'Views' },
]

// Truncates rather than rounds, so a compacted figure never reads higher than
// the count behind it: 1,999 followers is 1.9K, not 2K.
export function formatCompact(num) {
    if (typeof num !== 'number' || !Number.isFinite(num)) return null
    const truncate = (value) => Math.floor(value * 10) / 10
    if (num >= 1000000) return truncate(num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1000) return truncate(num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toLocaleString('en-US')
}

function figure({ key, label }, source) {
    const value = formatCompact(source?.[key])
    return value === null
        ? { key, label, value: NOT_MEASURED, measured: false }
        : { key, label, value, measured: true }
}

// The headline row. Always the same three slots, so the layout does not jump
// when the numbers arrive; an unmeasured slot holds the placeholder. `totals`
// is null until /api/stats answers, and stays null if it never does.
export function headlineFigures(totals) {
    return FIGURES.map(spec => figure(spec, totals))
}

// The per-platform breakdown behind the headline. A connected platform lists
// only the figures it reported - Instagram has no view count and Facebook no
// post count, and a dash for each would be noise rather than information. A
// silent platform is listed by name with no figures. A platform that was never
// configured is not listed at all: it is not part of the account's presence.
export function platformRows(stats) {
    if (!stats || typeof stats !== 'object') return []
    const platforms = stats.platforms && typeof stats.platforms === 'object' ? stats.platforms : {}
    const connected = Array.isArray(stats.connected) ? stats.connected : Object.keys(platforms)
    const silent = Array.isArray(stats.silent) ? stats.silent : []

    const rows = connected
        .filter(name => platforms[name])
        .map(name => ({
            platform: name,
            label: platformLabel(name),
            state: 'measured',
            figures: FIGURES.map(spec => figure(spec, platforms[name])).filter(f => f.measured),
        }))

    for (const name of silent) {
        if (rows.some(row => row.platform === name)) continue
        rows.push({ platform: name, label: platformLabel(name), state: 'silent', figures: [] })
    }

    return rows
}
