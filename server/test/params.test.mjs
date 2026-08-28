// Run with: node server/test/params.test.mjs
//
// Both values these helpers guard end up in a cache key, and a key that misses
// costs a real upstream call against a metered quota. So these are not
// input-tidiness cases: each one is a way a caller could have minted another
// cache key, and therefore another call.

import { readLimit, readAfter, MAX_LIMIT, DEFAULT_LIMIT } from '../params.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// The value that was actually served in production before this existed.
check('an absurd limit is clamped, not passed on',
    readLimit('999999') === MAX_LIMIT, `got ${readLimit('999999')}`);

check('a negative limit becomes the floor',
    readLimit('-1') === 1, `got ${readLimit('-1')}`);
check('zero becomes the floor',
    readLimit('0') === 1, `got ${readLimit('0')}`);
check('a fractional limit is truncated into range',
    readLimit('1.9') === 1, `got ${readLimit('1.9')}`);
check('a non-numeric limit falls back to the default',
    readLimit('abc') === DEFAULT_LIMIT, `got ${readLimit('abc')}`);
check('an absent limit falls back to the default',
    readLimit(undefined) === DEFAULT_LIMIT, `got ${readLimit(undefined)}`);
check('an empty limit falls back to the default',
    readLimit('') === DEFAULT_LIMIT, `got ${readLimit('')}`);
check('Infinity falls back to the default',
    readLimit('Infinity') === DEFAULT_LIMIT, `got ${readLimit('Infinity')}`);
// A repeated ?limit=1&limit=2 arrives as an array.
check('a repeated limit falls back to the default',
    readLimit(['1', '2']) === DEFAULT_LIMIT, `got ${readLimit(['1', '2'])}`);
check('a legitimate limit is untouched',
    readLimit('25') === 25, `got ${readLimit('25')}`);

// Every distinct limit that survives is a distinct cache key, and every key
// that misses is an upstream call. The property that matters is that the set is
// *bounded* - at most MAX_LIMIT keys exist now, against an unbounded set
// before. An earlier version of this case asserted "at most two", which was a
// number I had picked rather than anything the code promises.
const junk = ['999999', '-1', '0', 'abc', '', 'Infinity', '1e9', 'NaN', '  ', '12abc'];
const mapped = junk.map(readLimit);
check('every junk limit lands inside the allowed range',
    mapped.every(v => Number.isInteger(v) && v >= 1 && v <= MAX_LIMIT),
    `got ${mapped.join(', ')}`);
check('junk limits collapse onto a handful of keys',
    new Set(mapped).size <= 3, `produced ${[...new Set(mapped)].join(', ')}`);

// Cursors
check('an absent cursor means the first page',
    readAfter(undefined).ok === true && readAfter(undefined).value === null);
check('an empty cursor means the first page',
    readAfter('').ok === true && readAfter('').value === null);

const real = 'QVFIUmxfLXNhbXBsZS1jdXJzb3I9PQ';
check('a realistic cursor is accepted',
    readAfter(real).ok === true && readAfter(real).value === real);

check('an over-long cursor is rejected',
    readAfter('a'.repeat(513)).ok === false);
check('a cursor with a quote is rejected',
    readAfter("abc'def").ok === false);
check('a cursor with a space is rejected',
    readAfter('abc def').ok === false);
check('a cursor with a newline is rejected',
    readAfter('abc\ndef').ok === false);
check('a repeated cursor is rejected',
    readAfter(['a', 'b']).ok === false);

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
