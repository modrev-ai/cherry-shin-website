// Whether a platform counts as configured, and the guarantee underneath it.
//
// THE GUARANTEE: the site fails rather than lies about whose posts it is showing.
//
// `IG_USER_ID` has no fallback, deliberately. It once defaulted to a hardcoded
// account id left over from the original code, which meant that setting a token
// without also setting the id would have quietly fetched a stranger's posts and
// presented them as Cherry's, rather than failing. A token identifies who is
// asking; it does not say whose media to read. Both halves, or nothing.
//
// That is not a correctness bug if it regresses. It is a credibility one, on a
// site named after the person whose posts it claims to be showing, and it would
// ship looking perfectly fine.
//
// The second job here is the `configured: false` contract. A platform with no
// credentials falls back to sample content; a platform that is configured but
// whose upstream is failing contributes nothing instead, rather than being
// papered over with invented posts under a real account's name. The client side
// of that contract is tested in src/services/mediaApi.test.mjs. This is the
// server side, which decides which of the two states a platform is actually in.

// The shipped `.env.example` uses `your_*_here` placeholders. Treat them as
// unset, so a half-filled template reports "not configured" rather than sending
// a bogus value to the Graph API — and, more importantly, rather than looking
// configured enough to start fetching.
export function isPlaceholderToken(value) {
    if (!value) return true;
    return /^your_.*_here$/.test(value.trim());
}

// Both halves or nothing. The `&&` is the guarantee.
export function instagramConfigured({ token, userId }) {
    return !isPlaceholderToken(token) && !isPlaceholderToken(userId);
}
