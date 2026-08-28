// Run with: node scripts/scan-secrets.test.mjs
//
// A scanner that has never been shown to catch anything is decoration. These
// cases plant realistic-shaped credentials and check the scanner blocks them,
// then plant the things that merely look like credentials and check it stays
// quiet - because the false-positive direction is the one that decides whether
// anyone leaves the hook installed.
//
// Every fixture is assembled from fragments at runtime. No literal that looks
// like a credential appears anywhere in this file, so the scanner does not
// flag its own test and nothing here resembles a real key to a reader.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fail = []
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`)
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`)
}

const dir = mkdtempSync(join(tmpdir(), 'scan-secrets-'))

// stderr must be piped, not inherited. execFileSync forwards a child's stderr
// to the parent by default, which meant every passing run printed the scanner's
// "rotate it" guidance into the push and CI logs - and a real warning is worth
// nothing once a clean run looks identical to a dirty one.
const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }

// Runs the scanner against one file and reports how it exited.
function scan(filename, contents) {
    const path = join(dir, filename)
    writeFileSync(path, contents)
    try {
        return { blocked: false, output: execFileSync('node', ['scripts/scan-secrets.mjs', path], opts) }
    } catch (err) {
        return { blocked: true, output: `${err.stdout || ''}${err.stderr || ''}` }
    }
}

// Fragments, so the assembled value never appears verbatim in the source.
const alnum = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7xC0fI'
const caps = 'ABCDEFGHIJKLMNOP'

const CAUGHT = [
    ['Meta access token', 'meta.js', `const t = "EAA${alnum.repeat(2)}"`],
    ['Google API key', 'yt.js', `const k = "AIza${(alnum + alnum).slice(0, 35)}"`],
    ['GitHub token', 'gh.js', `token = "ghp_${(alnum + alnum).slice(0, 36)}"`],
    ['AWS access key id', 'aws.js', `id = "AKIA${caps}"`],
    // Split so the header is not a literal here either. The scanner caught
    // this file on its first real commit when it was written out in full -
    // correctly, by its own rules. Assembling it keeps the claim above true
    // and avoids exempting this path, which would be a permanent blind spot
    // for anything genuinely pasted into it later.
    ['Private key block', 'key.js', `${'-----BEGIN '}RSA PRIVATE${' KEY-----'}`],
    ['opaque assignment', 'cfg.json', `{ "client_secret": "${alnum.slice(0, 28)}" }`],
]

for (const [label, filename, contents] of CAUGHT) {
    const { blocked, output } = scan(filename, contents)
    check(`blocks a ${label}`, blocked, blocked ? '' : 'scanner allowed it')
    if (blocked) {
        // The whole point of not printing the value.
        const leaked = contents.length > 40 && output.includes(contents.slice(10, 40))
        check(`  and does not print the ${label}`, !leaked, leaked ? 'value appeared in output' : '')
    }
}

// Filenames that should be refused whatever they contain.
for (const [label, filename] of [
    ['an environment file', '.env'],
    ['a credential dump', 'meta api.txt'],
    ['key material', 'server.pem'],
]) {
    const { blocked } = scan(filename, 'nothing sensitive in here at all\n')
    check(`blocks ${label} by name`, blocked, blocked ? '' : 'scanner allowed it')
}

// The quiet direction. Each of these is something the repo genuinely contains
// or plausibly would, and a hit on any of them is what gets the hook disabled.
const ALLOWED = [
    ['an elided token in documentation', 'doc.md', 'Set the key to AIza… and the token to EAA…'],
    ['an env var reference', 'server.js', 'const S = process.env.TIKTOK_CLIENT_SECRET;'],
    ['a placeholder', 'ex.md', 'password: your_password_here'],
    ['an angle-bracket stand-in', 'guide.md', 'IG_ACCESS_TOKEN=<page token>'],
    ['an empty assignment', 'env.example', 'TIKTOK_CLIENT_SECRET='],
    ['a capitalised variable name', 'code.js', 'client_secret: TIKTOK_CLIENT_SECRET,'],
    ['ordinary prose', 'readme.md', 'The access token is stored in the vault and never in the repo.'],
    ['a long lowercase identifier', 'a.js', 'const api_key = configurationValueForTheCurrentEnvironment'],
]

for (const [label, filename, contents] of ALLOWED) {
    const { blocked, output } = scan(filename, contents)
    check(`allows ${label}`, !blocked, blocked ? output.trim().split('\n').slice(0, 3).join(' / ') : '')
}

// The real repository must stay quiet, or the hook is unusable from day one.
{
    let clean = true
    let detail = ''
    try {
        execFileSync('node', ['scripts/scan-secrets.mjs'], opts)
    } catch (err) {
        clean = false
        detail = `${err.stdout || ''}${err.stderr || ''}`.trim().split('\n').slice(0, 4).join(' / ')
    }
    check('the tracked tree scans clean', clean, detail)
}

rmSync(dir, { recursive: true, force: true })

console.log(fail.length ? `\n${fail.length} failed:\n  ${fail.join('\n  ')}` : '\nAll passed.')
process.exit(fail.length ? 1 : 0)
