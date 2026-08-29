// Run with: node server/test/credentials.test.mjs
//
// These guard a guarantee that has already failed once, which changes how they
// are written. A hypothetical failure justifies testing the property — "it
// requires both halves". A failure that has actually happened justifies testing
// the incident's own shape, and naming the case after it, so the next person
// deleting an `&&` sees what they are deleting rather than a generic assertion.
//
// The incident: IG_USER_ID once defaulted to a hardcoded account id, so setting
// a token without an id fetched a stranger's posts and presented them as
// Cherry's. Both of those states are tested below by name.

import { isPlaceholderToken, instagramConfigured } from '../credentials.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// Calls that may throw are reported rather than allowed to kill the run. A
// suite that dies on a stack trace still goes red and names nothing, which is
// exactly the failure mode `proving-tests` records — and removing an argument
// guard from either predicate is precisely the mutation that would do it here.
const safely = (fn) => {
    try { return fn(); } catch (err) { return `THREW ${err.constructor.name}`; }
};

// --- the guarantee, in the shape it actually failed in ------------------------

const REAL_TOKEN = 'EAAG9ZClonglivedpagetokenvalue';
const REAL_ID = '17841464542671418';

check('a token without an id is NOT configured — the original incident',
    safely(() => instagramConfigured({ token: REAL_TOKEN, userId: undefined })) === false,
    `got ${safely(() => instagramConfigured({ token: REAL_TOKEN, userId: undefined }))}`);

// How someone reaches that state today: copy .env.example, paste the token,
// never fill in the id. The template ships a placeholder, not an empty string,
// so this is the realistic path rather than the tidy one.
check('a token with the template placeholder id is NOT configured',
    safely(() => instagramConfigured({ token: REAL_TOKEN, userId: 'your_ig_user_id_here' })) === false);

check('an id without a token is NOT configured',
    safely(() => instagramConfigured({ token: undefined, userId: REAL_ID })) === false);

check('neither half is NOT configured',
    safely(() => instagramConfigured({ token: undefined, userId: undefined })) === false);

// The positive control. Without it a predicate hardwired to false would satisfy
// every case above, and the suite would be reassuring and worthless.
check('both halves present IS configured',
    safely(() => instagramConfigured({ token: REAL_TOKEN, userId: REAL_ID })) === true,
    `got ${safely(() => instagramConfigured({ token: REAL_TOKEN, userId: REAL_ID }))}`);

// --- the placeholder rule that the guarantee rests on -------------------------

check('a missing value is a placeholder',
    safely(() => isPlaceholderToken(undefined)) === true,
    `got ${safely(() => isPlaceholderToken(undefined))}`);
check('null is a placeholder',
    safely(() => isPlaceholderToken(null)) === true,
    `got ${safely(() => isPlaceholderToken(null))}`);
check('an empty string is a placeholder',
    safely(() => isPlaceholderToken('')) === true);
check('the shipped template value is a placeholder',
    safely(() => isPlaceholderToken('your_access_token_here')) === true);
check('a template value with stray whitespace is still a placeholder',
    safely(() => isPlaceholderToken('  your_access_token_here  ')) === true,
    'a pasted line often carries trailing spaces');

check('a real token is not a placeholder',
    safely(() => isPlaceholderToken(REAL_TOKEN)) === false);
check('a real numeric id is not a placeholder',
    safely(() => isPlaceholderToken(REAL_ID)) === false);

// Both anchors matter. Without them a real credential that merely contains the
// words would be discarded as a placeholder, which fails in the opposite and
// quieter direction — a working setup reporting itself unconfigured.
check('a value that only starts like the template is not a placeholder',
    safely(() => isPlaceholderToken('your_actual_token')) === false,
    'the trailing _here anchor');
// This value is chosen to discriminate. `token_goes_here` would not: it holds
// no `your_` at all, so it passes with or without the leading anchor, and a
// case named for an anchor it cannot detect is worse than no case — mutation
// testing caught exactly that here. `not_your_token_here` contains the pattern
// but does not begin with it, so only the `^` keeps it out.
check('a value merely containing the template pattern is not a placeholder',
    safely(() => isPlaceholderToken('not_your_token_here')) === false,
    'the leading your_ anchor');
check('an unrelated value ending in _here is not a placeholder',
    safely(() => isPlaceholderToken('token_goes_here')) === false);

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
