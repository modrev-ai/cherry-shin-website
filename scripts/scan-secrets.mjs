// Blocks credentials from reaching the repo, which is public - so a secret that
// lands here is scraped within minutes, survives in forks and GitHub's cache,
// and cannot be unpublished. Rotation is the only real remedy, which is why it
// is worth catching one commit earlier.
//
//   node scripts/scan-secrets.mjs            scan every tracked file
//   node scripts/scan-secrets.mjs --staged   scan what is about to be committed
//   node scripts/scan-secrets.mjs FILE...    scan these files on disk
//
// The third form checks a file before it is added, and is what the tests drive
// so they never have to stage a fake credential into the index to prove the
// scanner works.
//
// Run staged by .githooks/pre-commit, and over the whole tree by CI.
//
// The governing constraint is that a noisy scanner is worse than none at all:
// the first false positive teaches everyone to reach for --no-verify, and then
// it never fires again on the day it would have mattered. So every pattern here
// is either provider-prefixed or structurally distinctive, generic matches are
// filtered hard, and .example files are exempt by design.
//
// Findings never include the matched text. A build log is not a safe place to
// print a secret either.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const staged = process.argv.includes('--staged')
const explicit = process.argv.slice(2).filter(a => !a.startsWith('--'))

const git = (args) =>
    execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 })

// Provider-prefixed tokens. The lengths are deliberate: a real Google key is
// exactly 35 characters after the prefix, so the `AIza…` written in the docs
// does not match, while an actual key does.
const RULES = [
    { name: 'Meta access token', rx: /EAA[A-Za-z0-9]{50,}/g },
    { name: 'Google API key', rx: /AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
    { name: 'GitHub token', rx: /gh[pousr]_[A-Za-z0-9]{36}/g },
    { name: 'Slack token', rx: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
    { name: 'OpenAI key', rx: /sk-(?:proj-)?[A-Za-z0-9]{32,}/g },
    { name: 'Anthropic key', rx: /sk-ant-[A-Za-z0-9_-]{20,}/g },
    { name: 'AWS access key id', rx: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private key block', rx: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
]

// A long opaque value assigned to a secret-sounding name. This is the rule that
// catches a credential with no recognisable prefix - a Vercel or TikTok secret,
// say - and also the one that would generate every false positive, so its
// matches go through REJECT below before counting.
const ASSIGNMENT =
    /\b(access_token|refresh_token|api_key|apikey|client_secret|app_secret|secret_key|password|token)\b["']?\s*[=:]\s*["']?([A-Za-z0-9_\-.]{24,})["']?/gi

// Things that look like a secret by shape but are not one.
const REJECT = [
    /^process\.env\./,          // a reference, not a value
    /^import\.meta\./,
    /^[A-Z][A-Z0-9_]{6,}$/,     // a variable name in caps, e.g. TIKTOK_CLIENT_SECRET
    /your[_-]?/i,               // your_token_here
    /placeholder|example|dummy|sample|redacted|changeme|xxxxx/i,
    /^\.{3}|…/,                 // elided in documentation
    /^[<{]/,                    // <page token>, {{ TOKEN }}
    /^(true|false|null|undefined)$/i,
]

// Paths that legitimately carry secret-shaped text.
const EXEMPT_PATH = [
    /\.example$/,               // server/.env.example
    /^scripts\/scan-secrets\.mjs$/, // this file: the patterns above are not secrets
    /^package-lock\.json$/,     // integrity hashes, huge and noisy
    /^(node_modules|dist)\//,
]

// Filenames that should not be committed whatever their contents. Narrow on
// purpose - a broad rule like *credential* would block docs/platform-
// credentials.md, which is a setup guide and belongs in the repo.
const FORBIDDEN_NAME = [
    { rx: /(^|\/)\.env(\.[A-Za-z0-9]+)?$/, why: 'environment file' },
    { rx: /\.(pem|p12|pfx|jks|keystore)$/i, why: 'key material' },
    { rx: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, why: 'private SSH key' },
    { rx: /(api|token|secret)[^/]*\.txt$/i, why: 'credential dump' },
]

// git always reports forward slashes; a path typed on the command line on
// Windows does not, and every pattern here is written with forward slashes.
const norm = (path) => path.split('\\').join('/')

const isExempt = (path) => EXEMPT_PATH.some(rx => rx.test(norm(path)))

function filesToScan() {
    if (explicit.length) return explicit
    if (!staged) {
        return git(['ls-files']).toString('utf8').split('\n').filter(Boolean)
    }
    // Added, copied or modified - a deletion has no content to inspect.
    return git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
        .toString('utf8').split('\n').filter(Boolean)
}

// The staged version, which is what is about to be committed, and is not
// necessarily what is on disk.
const contentOf = (path) =>
    explicit.length ? readFileSync(path)
        : staged ? git(['show', `:${path}`])
            : git(['show', `HEAD:${path}`])

const findings = []

for (const path of filesToScan()) {
    for (const { rx, why } of FORBIDDEN_NAME) {
        if (rx.test(norm(path)) && !/\.example$/.test(path)) {
            findings.push({ path, line: 0, rule: `${why} should never be committed` })
        }
    }

    if (isExempt(path)) continue

    let buf
    try {
        buf = contentOf(path)
    } catch {
        continue // staged-only path that git cannot show, or a fresh file at HEAD
    }
    if (buf.includes(0)) continue // binary

    const text = buf.toString('utf8')
    const lines = text.split('\n')

    lines.forEach((line, i) => {
        for (const { name, rx } of RULES) {
            rx.lastIndex = 0
            if (rx.test(line)) findings.push({ path, line: i + 1, rule: name })
        }

        ASSIGNMENT.lastIndex = 0
        let m
        while ((m = ASSIGNMENT.exec(line)) !== null) {
            const value = m[2]
            if (REJECT.some(rx => rx.test(value))) continue
            // Credentials are opaque: they carry digits among their letters.
            // Mixed case alone is not enough of a signal - camelCase is what
            // ordinary identifiers look like, and treating that as entropy
            // flagged `configurationValueForTheCurrentEnvironment`. Requiring a
            // digit costs a hypothetical all-alphabetic secret and buys silence
            // on identifiers and prose, which is the trade that keeps the hook
            // installed rather than bypassed.
            const opaque = /[0-9]/.test(value) && /[A-Za-z]/.test(value)
            if (!opaque) continue
            findings.push({
                path,
                line: i + 1,
                rule: `${m[1].toLowerCase()} assigned a ${value.length}-character opaque value`,
            })
        }
    })
}

if (!findings.length) {
    const what = explicit.length ? `${explicit.length} file(s)`
        : staged ? 'staged changes' : 'tracked files'
    console.log(`scan-secrets: clean (${what})`)
    process.exit(0)
}

// Deliberately no matched text, only where to look.
console.error(`\nscan-secrets: ${findings.length} possible credential(s):\n`)
for (const f of findings) {
    console.error(`  ${f.path}${f.line ? `:${f.line}` : ''}  — ${f.rule}`)
}
console.error(`
The value itself is not printed; open the file to check.

If this is a real credential: remove it, and rotate it - assume anything that
reached a commit is already public.

If it is a false positive, the fix is to make the pattern smarter in
scripts/scan-secrets.mjs rather than to bypass the check, because a scanner
everyone bypasses stops working entirely.
`)
process.exit(1)
