// Run with: node src/services/heroFigures.test.mjs
//
// No framework, matching mediaApi.test.mjs. Pins the three states the hero's
// figures may be in, and the rule that a displayed figure never reads higher
// than the measurement behind it (MRO-241, MRO-574 criteria 2 and 4).

import {
    NOT_MEASURED,
    formatCompact,
    headlineFigures,
    platformRows,
} from './heroFigures.js'

const fail = []
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`)
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`)
}

// Reads a compacted figure back into the smallest count it could stand for.
const readBack = (text) => {
    const n = parseFloat(text.replace(/,/g, ''))
    if (text.endsWith('M')) return n * 1000000
    if (text.endsWith('K')) return n * 1000
    return n
}

// --- no measurement yet ----------------------------------------------------

{
    const before = headlineFigures(null)
    check('before /api/stats answers, all three slots are present',
        before.length === 3, `got ${before.length}`)
    check('before /api/stats answers, no slot shows a number',
        before.every(f => f.value === NOT_MEASURED && !f.measured),
        JSON.stringify(before))
}

{
    const allNull = headlineFigures({ followers: null, posts: null, views: null })
    check('every total null renders the placeholder, never 0',
        allNull.every(f => f.value === NOT_MEASURED && f.value !== '0'),
        JSON.stringify(allNull))
}

{
    const strings = headlineFigures({ followers: '1200', posts: undefined, views: NaN })
    check('a non-number total is not a measurement',
        strings.every(f => !f.measured), JSON.stringify(strings))
}

// --- measured --------------------------------------------------------------

{
    const zero = headlineFigures({ followers: 0, posts: null, views: null })
    check('a measured 0 is shown as 0, not as the placeholder',
        zero[0].value === '0' && zero[0].measured, JSON.stringify(zero[0]))
}

{
    const figures = headlineFigures({ followers: 12345, posts: 448, views: 2500000 })
    check('measured totals render compacted',
        figures.map(f => f.value).join(' ') === '12.3K 448 2.5M',
        figures.map(f => f.value).join(' '))
}

{
    // The rule a count-up would break, checked here for the compaction that
    // replaced it: across a sweep of real-looking counts, the figure read back
    // off the page is never more than what was measured.
    const samples = [0, 1, 999, 1000, 1049, 1050, 1099, 1949, 1950, 1999, 9999,
        99950, 99999, 999949, 999950, 999999, 1000000, 1049999, 1950000, 1999999, 123456789]
    const over = samples.filter(n => readBack(formatCompact(n)) > n)
    check('no compacted figure reads higher than its measured count',
        over.length === 0,
        over.map(n => `${n} -> ${formatCompact(n)}`).join(', '))
}

// --- platform silent, and the breakdown --------------------------------------

{
    const rows = platformRows({
        platforms: {
            youtube: { followers: 5000, posts: 120, views: 900000 },
            instagram: { followers: 30000, posts: 410, views: null, avatar: 'x' },
        },
        connected: ['youtube', 'instagram'],
        silent: ['facebook'],
    })
    check('connected platforms come first, in the order the API sent',
        rows.map(r => r.platform).join(',') === 'youtube,instagram,facebook',
        rows.map(r => r.platform).join(','))
    check('a platform lists only the figures it reported',
        rows[1].figures.map(f => f.key).join(',') === 'followers,posts',
        rows[1].figures.map(f => f.key).join(','))
    check('a silent platform is listed with no figures',
        rows[2].state === 'silent' && rows[2].figures.length === 0,
        JSON.stringify(rows[2]))
    check('platform names use the shared labels',
        rows.map(r => r.label).join(',') === 'YouTube,Instagram,Facebook')
}

{
    const rows = platformRows({ platforms: {}, connected: [], silent: [] })
    check('a never-configured platform is not listed', rows.length === 0, JSON.stringify(rows))
    check('no stats at all lists nothing', platformRows(null).length === 0)
}

{
    const rows = platformRows({ platforms: { facebook: { followers: 10 } }, silent: ['facebook'] })
    check('a platform is never listed twice', rows.length === 1, JSON.stringify(rows))
}

if (fail.length) {
    console.log(`\n${fail.length} failed`)
    process.exit(1)
}
console.log('\nall passed')
