// Run with: node server/test/origins.test.mjs
//
// No framework, as everywhere else here.
//
// The case that must not regress is the EMPTY one: with nothing configured the
// site is same-origin and must keep working, which means sending no
// Access-Control-Allow-Origin rather than sending a permissive one. A module
// that returned `{origin:'*'}` on empty input would satisfy every other case
// below and reintroduce exactly the defect MRO-342 removes.

import { readAllowedOrigins, corsOptionsFor } from '../origins.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' - ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};
const safely = (fn) => { try { return fn(); } catch (e) { return `THREW ${e.constructor.name}`; } };

// --- the default, which is the whole point --------------------------------

check('nothing configured yields no allowed origins',
    JSON.stringify(safely(() => readAllowedOrigins(undefined))) === '[]');
check('an empty string is the same as unset',
    JSON.stringify(safely(() => readAllowedOrigins(''))) === '[]');
check('unset means origin:false - NO header, not a wildcard - the original defect',
    safely(() => corsOptionsFor(undefined)).origin === false,
    JSON.stringify(safely(() => corsOptionsFor(undefined))));
check('and specifically never a wildcard',
    safely(() => corsOptionsFor('')).origin !== '*');

// --- the positive control -------------------------------------------------

check('a configured origin IS allowed',
    JSON.stringify(safely(() => corsOptionsFor('https://cherrystudio.art').origin)) === '["https://cherrystudio.art"]',
    'without this a module hardwired to false would pass everything above');

// --- parsing, in the shape a .env actually arrives -------------------------

check('comma separated',
    safely(() => readAllowedOrigins('https://a.com,https://b.com')).length === 2);
check('space separated',
    safely(() => readAllowedOrigins('https://a.com https://b.com')).length === 2);
check('newline separated, as a pasted block arrives',
    safely(() => readAllowedOrigins('https://a.com\nhttps://b.com')).length === 2);
check('surrounding whitespace does not create an entry',
    safely(() => readAllowedOrigins('  https://a.com  ')).length === 1);
check('http is accepted, for local development',
    safely(() => readAllowedOrigins('http://localhost:5173')).length === 1);

// --- values that would silently never match --------------------------------

check('an origin with a path is dropped rather than kept and never matched',
    safely(() => readAllowedOrigins('https://a.com/feed')).length === 0,
    'a path here is a misunderstanding; keeping it fails at request time instead');
check('a bare hostname is dropped',
    safely(() => readAllowedOrigins('cherrystudio.art')).length === 0);
check('a wildcard string is not a valid origin and is dropped',
    safely(() => readAllowedOrigins('*')).length === 0,
    'so ALLOWED_ORIGINS=* cannot smuggle the defect back in');
check('a non-http scheme is dropped',
    safely(() => readAllowedOrigins('ftp://a.com')).length === 0);
check('junk mixed with a good value keeps only the good one',
    JSON.stringify(safely(() => readAllowedOrigins('nope, https://a.com, */*'))) === '["https://a.com"]');

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
