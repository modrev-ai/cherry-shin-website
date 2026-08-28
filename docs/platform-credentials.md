# Platform credentials

Everything needed to connect a platform to the feed, what each value is for, and where it lives.

Nothing here contains a secret. Real values live in three places only:

| Where | What | Notes |
| --- | --- | --- |
| `server/.env` | local development | gitignored; never committed |
| Vercel → Settings → Environment Variables | production | set per environment |
| Keywee vault | the record of truth | items prefixed `Meta - Cherry Shin - …` |

> **Every platform below requires admin access to the account being mirrored.** There is no
> compliant way to mirror someone else's posts; scraping breaches all of these platforms' terms.

---

## Current state

| Platform | State | Variables |
| --- | --- | --- |
| YouTube | Live | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` |
| Instagram | Live | `IG_ACCESS_TOKEN`, `IG_USER_ID` |
| Facebook | Live | `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` |
| TikTok | Needs post URLs | `TIKTOK_POST_URLS` |
| X | Not connected | needs a paid API tier |

A platform with no credentials falls back to sample content for that platform alone. The feed never
breaks because something is unset — but sample posts carry invented engagement numbers, so anything
not marked Live above is placeholder.

---

## YouTube

**What you need:** an API key and a channel ID. No OAuth — the channel's uploads are public.

1. **https://console.cloud.google.com** → create a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials** → **Create credentials → API key**.
4. **Restrict the key** (Edit key → API restrictions → YouTube Data API v3). An unrestricted key
   works anywhere, which is why it is worth narrowing.
5. Channel ID: **YouTube Studio → Settings → Channel → Advanced**.

```
YOUTUBE_API_KEY=AIza…
YOUTUBE_CHANNEL_ID=UC…
```

**Quota:** `playlistItems.list` costs 1 unit, `videos.list` 1 more, so about **288 units/day**
against a 10,000 free allowance — independent of traffic, because of the cache. Avoid
`search.list`; it costs 100 per call.

---

## Instagram and Facebook — one Meta app, one token

These two share everything. The **Page access token** is used as `IG_ACCESS_TOKEN` *and*
`FB_PAGE_ACCESS_TOKEN`. Do them in one sitting.

### Prerequisites — where most setups fail

1. The Instagram account must be **Business or Creator**, not personal.
   Instagram app → Settings → Account type and tools → Switch to professional account.
2. It must be **linked to a Facebook Page**, and you must be an admin of that Page.
   Instagram app → Settings → Business tools and controls → Connect a Facebook Page.

The Instagram Basic Display API was **shut down in December 2024**. Any guide referring to it is
out of date; this uses the Instagram Graph API.

### 1. Create the app

**https://developers.facebook.com/apps** → Create app → use case **Other** → type **Business**.

Note the **App ID** and **App Secret** from Settings → Basic.

App Review is not required to read your own Page and Instagram while your account has a role on
the app.

### 2. Get a user token

**https://developers.facebook.com/tools/explorer**

Select your app, add the permissions below, **then** click *Generate Access Token*.

```
pages_show_list
pages_read_engagement
instagram_basic
business_management
pages_read_user_content    ← optional; see "Facebook engagement counts"
```

> **Order matters.** Generating first and adding permissions after returns a token carrying the
> *previous* scopes. If a permission appears in neither the granted nor the declined list
> afterwards, it was never requested — regenerate.

### 3. Read the IDs and the Page token

Still in the Explorer, `GET`:

```
me/accounts?fields=id,name,access_token,instagram_business_account{id,username}
```

```json
{ "data": [ {
    "id": "878492548671489",            ← FB_PAGE_ID
    "access_token": "EAA…",              ← FB_PAGE_ACCESS_TOKEN and IG_ACCESS_TOKEN
    "instagram_business_account": {
      "id": "17841464542671418"          ← IG_USER_ID
} } ] }
```

A missing `instagram_business_account` means the Instagram account is not properly linked to the
Page — go back to the prerequisites.

### 4. Make the token permanent

The token from step 2 lasts about an hour. Exchange it **once**:

```
https://graph.facebook.com/v18.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=APP_ID
  &client_secret=APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN
```

Then **re-run step 3 using the long-lived token**. This is the step that matters: a Page token
derived from a long-lived user token **does not expire**. Skipping it leaves you re-authorising
every 60 days.

> Meta returns `500 An unexpected error has occurred` if you exchange the same token more than
> once. That is not a transient fault — mint a fresh token and exchange it a single time.

### 5. Verify before using

**https://developers.facebook.com/tools/debug/accesstoken** — paste the Page token and check:

- **Type** is `Page`
- **Expires** is `Never`
- Scopes include `instagram_basic` and `pages_read_engagement`

```
IG_ACCESS_TOKEN=<page token>
IG_USER_ID=<instagram_business_account.id>
FB_PAGE_ID=<page id>
FB_PAGE_ACCESS_TOKEN=<same page token>
```

### Facebook engagement counts

Like and comment counts need **`pages_read_user_content`**, beyond `pages_read_engagement`.
Requesting those fields without it fails the **whole** request with error code 10 — not just those
fields.

The server asks for them and falls back once if refused, so granting the scope later restores the
counts with no code change. Without it, Facebook posts show share counts only. Share counts are
themselves absent when a post has no shares.

### Facebook posts that will not embed

Facebook refuses to embed posts whose audio it judges to be someone else's — most reels with
music. No API field reports this, so the server probes the embed page once per cache window and
falls back to the still plus a watch button. On the current Page roughly half the posts are
affected. Nothing to configure; it is automatic.

### Instagram is deliberately not embedded

Reels return no `media_url`, so a native player is impossible, and every embed variant (`/embed/`,
`?cr=1`, `/embed/captioned/`) renders the full post chrome — avatar, username, Follow button.
Instagram posts therefore show their still plus a watch button.

---

## TikTok

Two routes, both implemented. The server prefers the Display API when its three
variables are set and falls back to oEmbed otherwise; an `X-TikTok-Source` response header says
which answered.

### oEmbed route

**No credentials at all.** TikTok's public oEmbed endpoint needs no key, no OAuth and no app
review. The Display API would discover posts automatically but requires all three, and works only
with the developer's own account until it passes review.

The tradeoff: **oEmbed resolves one post at a time and cannot list a profile**, so the posts to
mirror are named explicitly.

### Display API route

Client key and secret alone are not enough: they authenticate the *app*, not the account. Reading
Cherry's videos needs a **refresh token**, which only comes from her authorising the app once.

1. Create the app at **https://developers.tiktok.com**. Note the client key and secret. Sandbox and
   production are separate apps with separate keys, redirect URIs and settings.
2. Register the redirect URI on the app you intend to use:
   `https://cherrystudio.art/tiktok/callback` — exact match, no trailing slash.
3. **Sandbox only: add the account as a target user.** Sandbox apps authorise nobody by default.
   Add `itscherryshin` under the sandbox's Target users, and have that account **accept the
   invitation** — an unaccepted invite fails the same way as no invite at all.
4. Open the authorisation URL signed in as that account:

```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key=CLIENT_KEY
  &scope=user.info.basic,user.info.stats,video.list
  &response_type=code
  &redirect_uri=https://cherrystudio.art/tiktok/callback
  &state=RANDOM
```

5. You land on `/tiktok/callback`, which shows the authorisation code masked, with copy and reveal
   controls. It is masked because that page is filmed for the Login Kit part of the app review, and
   a code should not appear in an uploaded video.
6. Exchange the code **server-side** — it needs the client secret — for the refresh token, then set
   `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and `TIKTOK_REFRESH_TOKEN`.

Codes are single-use and expire in about ten minutes.

#### Errors and what they mean

| Error | Cause |
| --- | --- |
| `non_sandbox_target` | The signed-in account is not a registered sandbox target, or the invitation was never accepted. Check which account the browser is signed into — the error is about that account, not the intended one. |
| redirect mismatch | The URI in the request differs from the registered one, including trailing slash, or was registered on the other app (sandbox vs production). |
| scope not authorised | A requested scope has not been approved for the app. |

Production authorises any account with no target list, so once app review approves, the sandbox
target dance is unnecessary.

### Getting the post URLs

1. Open the profile: **https://www.tiktok.com/@itscherryshin**
2. Click a video. The address bar shows:
   `https://www.tiktok.com/@itscherryshin/video/7412345678901234567`
3. Copy that URL. Or use the video's **Share → Copy link** — a `vt.tiktok.com/…` short link also
   resolves, but the full form is clearer to read later.
4. Repeat for each post you want in the feed.

Set them separated by commas, spaces or newlines:

```
TIKTOK_POST_URLS=https://www.tiktok.com/@itscherryshin/video/7412…, https://www.tiktok.com/@itscherryshin/video/7398…
```

**What this means in practice:** new posts do not appear until their URL is added. Adding one is a
one-line change to an environment variable — no deploy needed beyond Vercel picking up the new
value.

A URL that cannot be resolved (deleted, private, mistyped) is skipped and logged, costing one card
rather than the whole feed. oEmbed carries no engagement figures and no publish date, so TikTok
cards show neither rather than inventing them.

---

## X

Reading a user timeline is **not available on the free tier**, which is write-oriented. The options
are to pay for a tier that allows it, leave X on sample content, or drop the platform. Nothing to
configure until that is decided.

---

## Where secrets live, and rotating them

### The vault is the record of truth

Items in the keywee vault, reachable through its MCP server:

| Item | Holds |
| --- | --- |
| `Meta - Cherry Shin - page access token (Cherry and Jong)` | the live Page token — the credential the site runs on |
| `Meta - Cherry Shin - user access token` | a user token; only used to re-derive the Page token |
| `Meta - Cherry Shin - app secret` | app secret, for the exchange in step 4 |

Rotate with the vault MCP's `update_secret`, which edits in place:

```
update_secret(name="Meta - Cherry Shin - page access token (Cherry and Jong)",
              password="<new token>")
```

Only non-empty arguments are applied, so a password can be rotated without resupplying notes. A
name matching more than one item is an error rather than a guess — pass `item_id` instead.

> The vault MCP runs from a hand-deployed copy of `vault_mcp.py` on the Oracle VM. It does **not**
> update itself from the repo; changes must be copied across.

### After rotating any credential

1. `server/.env` — for local development.
2. **Vercel → Settings → Environment Variables** — production reads only from here.
3. The vault item — so the next person finds the current value.
4. Redeploy, or push any commit, so the running functions pick up the new environment.

### Checking what is live

```
GET /api/stats          which platforms are connected, and the audience totals
GET /api/cache/stats    cache hit rate and upstream call counts
```

The server also prints each platform's state on startup.
