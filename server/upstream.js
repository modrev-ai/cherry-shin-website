// Telling apart the two ways an upstream call fails, because they have
// different owners and the site has been answering as though they were one.
//
// THE INCIDENT (MRO-338): a caller-supplied `?after=` cursor that passes the
// character guard but was never issued by the platform came back as
//
//     502  { error: "Instagram API error",
//            hint:  "Token may be expired. ... refresh it." }
//
// Both halves are wrong. 502 is the code MRO-306 reserves for a total
// blackout - every configured platform down - and here one query parameter
// produced it. The hint names a cause the server had no evidence for, and
// following it means rotating a working Meta credential across .env, Vercel
// and the vault (MRO-249): a real, risky operation performed for nothing.
//
// The information to tell them apart was always present - `response.status`
// is in scope at every throw site - and was simply dropped. `err.isUpstream`
// was already being set in six places and read in none; this finishes that
// thought rather than adding a parallel one.

// A refusal is upstream saying "not this request". Unreachable is upstream
// not answering, or answering with its own failure. Auth is separated out
// because it is the one case where blaming the credential is justified.
// Meta answers 400 for every token failure and never 401 or 403. Measured
// against the Graph API directly: a malformed token, a plausible-looking wrong
// one, and an empty one all came back 400, carrying code 190 or 2500 and
// type OAuthException.
//
// So the status rule below can never reach `auth` for Meta, and an expired Page
// token - the single failure whose correct answer is "rotate the credential" -
// was being reported as a bad cursor (MRO-357). That is MRO-338's defect with
// the arrows reversed, and the more expensive direction of the two.
//
// Codes, not the OAuthException type, because that type also covers permission
// errors like code 10 (the pages_read_user_content scope). Those need a scope
// granted, not a credential rotated, and must not be told to rotate a token
// that is working perfectly well.
const AUTH_CODES = new Set([
    102,   // session invalid
    190,   // invalid or expired access token
    463,   // expired
    467,   // invalid
    2500,  // an active access token must be used
]);

export function classifyUpstream(error) {
    const status = typeof error?.status === 'number' ? error.status : null;

    // No status: we never got a reply we could read - DNS, socket, timeout,
    // unparseable body. Genuinely "cannot reach", and 502 is honest.
    if (status === null) return { status: 502, kind: 'unreachable' };

    // The only case where the credential is a defensible thing to blame.
    if (status === 401 || status === 403) return { status: 502, kind: 'auth' };

    // Upstream naming a token failure in its own error code. This is not a
    // guess about the cause - it is upstream stating it, which is the same
    // standard withUpstreamCode already holds.
    if (AUTH_CODES.has(error?.upstreamCode)) return { status: 502, kind: 'auth' };

    // Upstream refused what we asked for. That is our request being wrong,
    // and on these routes the only caller-controlled part is the cursor.
    if (status >= 400 && status < 500) return { status: 400, kind: 'rejected' };

    // Includes the 2xx-with-an-error-body case. We cannot tell what happened,
    // so keep the pre-existing conservative answer rather than guessing.
    return { status: 502, kind: 'unreachable' };
}

// The body is built here too, so no route can classify correctly and then
// attach the wrong hint anyway.
export function describeUpstreamFailure(platform, kind, message, { sentCursor = false } = {}) {
    if (kind === 'rejected') {
        const body = {
            error: `${platform} rejected the request`,
            message,
        };
        // Only blame the cursor when there was one. A request that sent no
        // ?after= cannot possibly have sent a bad one, so the hint would be
        // impossible rather than merely unlikely - and pointing a reader at an
        // input they never supplied costs them the time they had for the real
        // cause. When no cursor was sent, upstream's own message and code are
        // all we honestly have, and they are already in the body.
        if (sentCursor) {
            body.hint = `Usually a cursor ${platform} did not issue. Retry without ?after= to start from the first page.`;
        }
        return body;
    }
    if (kind === 'auth') {
        return {
            error: `${platform} API error`,
            message,
            hint: 'Token may be expired. Visit https://developers.facebook.com/tools/explorer/ to refresh it.',
        };
    }
    // Unreachable. Deliberately carries NO hint: the server does not know why,
    // and inventing a cause is the defect this module exists for.
    return { error: `${platform} API error`, message };
}

// Upstream's own error code, passed through the same way its message already
// is. The routes were discarding the single most useful field for diagnosis:
// Instagram answers a bad cursor with "An unknown error has occurred." and a
// code, and only the code says which failure it was. Surfacing what upstream
// told us is the opposite of inventing a cause - see MRO-338.
export function withUpstreamCode(body, error) {
    const code = error?.upstreamCode;
    if (code === undefined || code === null) return body;
    return { ...body, code };
}
