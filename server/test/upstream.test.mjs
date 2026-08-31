// Run with: node server/test/upstream.test.mjs
//
// No framework, same as every other suite here.
//
// This guards a defect that shipped and was found on production, so the cases
// are written in the shape it failed in rather than as properties. MRO-338: a
// well-formed cursor that Instagram never issued answered 502 with a hint
// blaming the access token.
//
// The case that matters most is the POSITIVE CONTROL - a genuine outage must
// still be a 502. A classifier that answered 400 to everything would satisfy
// the headline case and silently break the one the site actually depends on.

import { classifyUpstream, describeUpstreamFailure, withUpstreamCode } from '../upstream.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};
const safely = (fn) => {
    try { return fn(); } catch (err) { return `THREW ${err.constructor.name}`; }
};

const upstream = (status) => Object.assign(new Error('boom'), { status, isUpstream: true });

// --- the incident, in the shape it failed in --------------------------------

{
    // Graph answers 400 for a cursor it did not issue.
    const c = safely(() => classifyUpstream(upstream(400)));
    check('a cursor upstream refuses is 400, not 502 — the original incident',
        c && c.status === 400 && c.kind === 'rejected', JSON.stringify(c));

    // sentCursor: true because that IS the incident's shape - the caller passed
    // an ?after= Instagram never issued. Since MRO-357 the cursor hint is only
    // attached when a cursor was actually sent, so stating it here is what keeps
    // this case a faithful reproduction rather than a weaker one.
    const body = safely(() => describeUpstreamFailure(
        'Instagram', c.kind, 'An unknown error has occurred.', { sentCursor: true }));
    check('and its body does NOT blame the token',
        body && body.hint !== undefined && !/token/i.test(body.hint),
        JSON.stringify(body));
    check('it names the cursor instead, which is the only caller-controlled part',
        /cursor/i.test(body.hint), body.hint);
}

// --- the positive control, which is the one that must not regress -----------

check('a genuine upstream 500 is still 502',
    safely(() => classifyUpstream(upstream(500))).status === 502);
check('a 503 is still 502',
    safely(() => classifyUpstream(upstream(503))).status === 502);
check('an error with NO status at all — socket, DNS, timeout — is still 502',
    safely(() => classifyUpstream(new Error('ECONNREFUSED'))).status === 502,
    'this is the shape a real outage arrives in');
check('an unreachable body carries no hint, because we do not know why',
    safely(() => describeUpstreamFailure('YouTube', 'unreachable', 'x')).hint === undefined);

// --- auth is the one case where blaming the credential is justified ---------

check('401 is 502 and classified auth, not rejected',
    safely(() => classifyUpstream(upstream(401))).kind === 'auth' &&
    classifyUpstream(upstream(401)).status === 502);
check('403 is auth too',
    safely(() => classifyUpstream(upstream(403))).kind === 'auth');
check('and only the auth body mentions the token',
    /token/i.test(safely(() => describeUpstreamFailure('Instagram', 'auth', 'x')).hint));

// --- edges that would otherwise be guessed ----------------------------------

check('404 is a refusal, not an outage',
    safely(() => classifyUpstream(upstream(404))).status === 400);
check('429 is a refusal — upstream declined this request',
    safely(() => classifyUpstream(upstream(429))).status === 400);
check('a 2xx carrying an error body stays 502, the conservative pre-existing answer',
    safely(() => classifyUpstream(upstream(200))).status === 502,
    'we cannot tell what happened, so do not invent a verdict');
check('a non-numeric status is treated as absent rather than compared',
    safely(() => classifyUpstream({ status: '400' })).status === 502);
check('null input does not throw',
    safely(() => classifyUpstream(null)).status === 502);

check('the platform name reaches the body',
    safely(() => describeUpstreamFailure('Facebook', 'rejected', 'x')).error === 'Facebook rejected the request');
check('the upstream message is passed through rather than replaced',
    safely(() => describeUpstreamFailure('Facebook', 'unreachable', 'the real words')).message === 'the real words');

// --- upstream's own code, passed through rather than invented ---------------

check("a body gains upstream's code when there is one",
    safely(() => withUpstreamCode({ error: 'x' }, { upstreamCode: 100 })).code === 100);
// Asserting `.code === undefined` here would NOT discriminate: spreading an
// absent value gives `{ code: undefined }`, whose key JSON.stringify drops, so
// the response is identical either way and the check can never fail. Mutation
// testing caught exactly that. What matters is that the key is genuinely not
// there, so that is what is asserted.
check('and the key is absent entirely when upstream sent no code',
    !('code' in safely(() => withUpstreamCode({ error: 'x' }, new Error('no code')))),
    'a present-but-undefined key is a different object, even if it serialises the same today');
check('a null code is dropped too, because null would render as a code of its own',
    !('code' in safely(() => withUpstreamCode({ error: 'x' }, { upstreamCode: null }))),
    JSON.stringify(safely(() => withUpstreamCode({ error: 'x' }, { upstreamCode: null }))));
check('code 0 survives, because 0 is a code and not an absence',
    safely(() => withUpstreamCode({ error: 'x' }, { upstreamCode: 0 })).code === 0);
check('the original body is not mutated',
    (() => { const b = { error: 'x' }; withUpstreamCode(b, { upstreamCode: 1 }); return b.code === undefined; })());
check('a null error does not throw',
    safely(() => withUpstreamCode({ error: 'x' }, null)).error === 'x');


// --- MRO-357: Meta reports auth failures as 400, never 401/403 --------------
//
// Measured against the Graph API directly. A malformed token, a plausible-
// looking wrong one and an empty one all answered 400 with code 190 or 2500.
// So the 401/403 rule can never fire for Meta, and every token failure was
// landing in `rejected` - the bucket that means "your request was wrong".

const withCode = (status, upstreamCode) =>
    Object.assign(new Error('boom'), { status, upstreamCode, isUpstream: true });

check('an invalid token (400 + code 190) is auth, not a rejected request',
    classifyUpstream(withCode(400, 190)).kind === 'auth',
    `got ${classifyUpstream(withCode(400, 190)).kind}`);
check('and it answers 502, so it is not read as caller error',
    classifyUpstream(withCode(400, 190)).status === 502);
check('code 2500 - no active token - is auth too',
    classifyUpstream(withCode(400, 2500)).kind === 'auth');
check('code 102 - session invalid - is auth too',
    classifyUpstream(withCode(400, 102)).kind === 'auth');

// THE REGRESSION GUARD. MRO-338 is the reason this module exists; if fixing
// 357 turned a bad cursor back into a token accusation, the fix is a net loss.
check('a bad cursor (400, code 100) is STILL rejected, not auth',
    classifyUpstream(withCode(400, 100)).kind === 'rejected',
    `got ${classifyUpstream(withCode(400, 100)).kind} - MRO-338 regressed`);
check('and still answers 400',
    classifyUpstream(withCode(400, 100)).status === 400);

// Permission errors are NOT credential errors. Code 10 is the missing
// pages_read_user_content scope: it needs a scope granted, not a working
// token rotated across .env, Vercel and the vault.
check('code 10 - a missing scope - is not called an auth failure',
    classifyUpstream(withCode(400, 10)).kind === 'rejected');

// The positive control, again: a real outage must stay a 502 unreachable.
check('a 5xx carrying an ordinary code is still unreachable',
    classifyUpstream(withCode(500, 1)).kind === 'unreachable',
    'a code must not turn an outage into something a caller can fix');
check('no status at all is still unreachable',
    classifyUpstream(withCode(null, 190)).kind === 'unreachable');

// --- MRO-357: never blame a cursor the caller did not send ------------------

const noCursor = describeUpstreamFailure('Facebook', 'rejected', 'Invalid OAuth access token');
const withCursor = describeUpstreamFailure('Facebook', 'rejected', 'Invalid cursor', { sentCursor: true });

check('a request that sent no cursor gets no cursor hint',
    !('hint' in noCursor),
    `hint was: ${noCursor.hint}`);
check('but it still carries the message upstream sent',
    noCursor.message === 'Invalid OAuth access token');
check('a request that DID send a cursor still gets the hint',
    typeof withCursor.hint === 'string' && withCursor.hint.includes('?after='),
    `hint was: ${withCursor.hint}`);
check('the default is no hint, so a forgotten argument under-claims rather than over-claims',
    !('hint' in describeUpstreamFailure('Instagram', 'rejected', 'x')));
check('the auth body still names the token, which is now reachable for Meta',
    describeUpstreamFailure('Facebook', 'auth', 'x').hint.includes('expired'));
check('unreachable still carries no hint at all',
    !('hint' in describeUpstreamFailure('Facebook', 'unreachable', 'x')));

// --- MRO-409: the auth hint is per-platform, and every routed platform is checked

// Every platform index.js passes to describeUpstreamFailure. TikTok is absent on
// purpose - its posts route is unauthenticated oEmbed and never reaches here.
const ROUTED = ['Instagram', 'YouTube', 'Facebook'];
const META = new Set(['Instagram', 'Facebook']);

for (const platform of ROUTED) {
    const body = describeUpstreamFailure(platform, 'auth', 'x');

    check(`${platform}: an auth failure gets a hint at all`,
        typeof body.hint === 'string' && body.hint.length > 0,
        JSON.stringify(body));

    // The assertion that would have caught the original defect, stated as the
    // general property rather than as three platform-specific strings: a hint
    // may name Meta's console only for a Meta platform. Before MRO-409 the same
    // Facebook URL came back for YouTube, and no test looked - because every
    // auth-hint assertion in this file passed 'Instagram'.
    check(`${platform}: the hint does not send the reader to another vendor's console`,
        /facebook[.]com/i.test(body.hint || '') === META.has(platform),
        `${platform} hint: ${body.hint}`);
}

check('YouTube names quota, because a 403 there is more often quota than a bad key',
    /quota/i.test(describeUpstreamFailure('YouTube', 'auth', 'x').hint),
    describeUpstreamFailure('YouTube', 'auth', 'x').hint);

check('YouTube is NOT told its token expired, which would be a guess and usually wrong',
    !/token may be expired/i.test(describeUpstreamFailure('YouTube', 'auth', 'x').hint));

// Same principle as the cursor hint's default: silence under-claims, a wrong
// hint over-claims, and a platform nobody has written a hint for is the case
// where the server has least business guessing.
check('a platform with no justified hint gets none, rather than inheriting one',
    !('hint' in describeUpstreamFailure('TikTok', 'auth', 'x')),
    JSON.stringify(describeUpstreamFailure('TikTok', 'auth', 'x')));

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
