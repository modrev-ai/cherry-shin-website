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

    const body = safely(() => describeUpstreamFailure('Instagram', c.kind, 'An unknown error has occurred.'));
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

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
