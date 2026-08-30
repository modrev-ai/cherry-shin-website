// Run with: node scripts/commit-trailer.test.mjs
//
// No framework, as everywhere else here.
//
// The case that matters most is the NEGATIVE one: the raw session UUID must
// never reach the message. This repo is public, and a published commit cannot
// be unpublished, so that assertion is the reason the hook exists in the shape
// it does (MRO-346).
//
// Runs the hook against throwaway files rather than in the working tree. The
// hook reads environment and writes files; exercising it in place would make
// results depend on the developer's own shell.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' - ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const REAL_ID = 'aba1e0ed-b6d7-45cf-8434-2ee235d38fc9';

// Returns the message after the hook has run, or a THREW marker.
function runHook(env, body = 'Some commit\n', source = 'message') {
    const dir = mkdtempSync(join(tmpdir(), 'trailer-'));
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, body);
    try {
        execFileSync('sh', ['.githooks/prepare-commit-msg', file, source], {
            env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', CLAUDE_SESSION_TRAILER: '', ...env },
            stdio: 'ignore',
        });
        return readFileSync(file, 'utf8');
    } catch (err) {
        return `THREW ${err.message}`;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const trailerOf = (msg) => (msg.match(/^Claude-Session: (.+)$/m) || [])[1];

// --- the negative case, which is why the hook is shaped this way -------------

{
    const out = runHook({ CLAUDE_CODE_SESSION_ID: REAL_ID });
    check('the RAW session UUID never reaches the message',
        !out.includes(REAL_ID), out.trim());
    check('a scoped trailer is written instead',
        /^cs-[0-9a-f]{8}$/.test(trailerOf(out) || ''), `got ${trailerOf(out)}`);
}

// --- the positive control ----------------------------------------------------

{
    const a = trailerOf(runHook({ CLAUDE_CODE_SESSION_ID: REAL_ID }));
    const b = trailerOf(runHook({ CLAUDE_CODE_SESSION_ID: REAL_ID }));
    const c = trailerOf(runHook({ CLAUDE_CODE_SESSION_ID: '11111111-2222-3333-4444-555555555555' }));
    check('the same session yields the same value, so commits can be grouped',
        a === b && !!a, `${a} vs ${b}`);
    check('a DIFFERENT session yields a different value - the whole point',
        a !== c && !!c,
        'without this a hook returning one constant would satisfy every other case');
}

// --- writing nothing is a real outcome, not a failure ------------------------

{
    const out = runHook({});
    check('no session id means NO trailer, because a person’s commit is not a session’s',
        trailerOf(out) === undefined, out.trim());
}

// --- an explicit value is its own consent ------------------------------------

check('CLAUDE_SESSION_TRAILER is used verbatim when set',
    trailerOf(runHook({ CLAUDE_SESSION_TRAILER: 'cherry-50', CLAUDE_CODE_SESSION_ID: REAL_ID })) === 'cherry-50');

// --- never restate someone else's attribution as ours ------------------------

{
    const out = runHook({ CLAUDE_CODE_SESSION_ID: REAL_ID }, 'Peer commit\n\nClaude-Session: cs-deadbeef\n');
    check('an existing trailer is not overwritten',
        trailerOf(out) === 'cs-deadbeef', `got ${trailerOf(out)}`);
    check('and no second trailer is appended beside it',
        (out.match(/^Claude-Session:/gm) || []).length === 1,
        `${(out.match(/^Claude-Session:/gm) || []).length} trailers`);
}

for (const source of ['merge', 'squash']) {
    check(`a ${source} message is left alone`,
        trailerOf(runHook({ CLAUDE_CODE_SESSION_ID: REAL_ID }, 'Merge branch x\n', source)) === undefined);
}

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
