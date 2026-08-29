// Run with: node server/test/diagnostics.test.mjs
//
// The decision lives in its own module precisely so both directions can be
// tested without standing up a server. The direction that matters is the
// negative one — an imported app must refuse — because that is the shape the
// production deployment actually takes: Vercel imports the Express app from
// api/index.js, so the process entry point is never server/index.js there.

import { diagnosticsEnabled, diagnosticsGuard } from '../diagnostics.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const SELF = 'C:/Workstation/cherry-shin-website/server/index.js';

// --- when the diagnostics are served -----------------------------------------

check('enabled when this file is the entry point',
    diagnosticsEnabled({ entryPoint: SELF, moduleFile: SELF, isServerless: false }) === true);

check('enabled regardless of how the path was spelled',
    diagnosticsEnabled({
        entryPoint: 'C:/Workstation/cherry-shin-website/server/../server/index.js',
        moduleFile: SELF,
        isServerless: false,
    }) === true);

// --- when they are not --------------------------------------------------------

// The production path. api/index.js is the entry point; this module is imported.
check('disabled when the app is imported rather than run',
    diagnosticsEnabled({
        entryPoint: 'C:/Workstation/cherry-shin-website/api/index.js',
        moduleFile: SELF,
        isServerless: false,
    }) === false);

// Belt and braces: even if a platform somehow invoked this file directly.
check('disabled on a serverless platform even when the entry point matches',
    diagnosticsEnabled({ entryPoint: SELF, moduleFile: SELF, isServerless: true }) === false);

check('disabled when there is no entry point at all',
    diagnosticsEnabled({ entryPoint: undefined, moduleFile: SELF, isServerless: false }) === false);

check('disabled when the module file is unknown',
    diagnosticsEnabled({ entryPoint: SELF, moduleFile: undefined, isServerless: false }) === false);

// --- the guard ----------------------------------------------------------------

const mockRes = () => {
    const res = { code: null, body: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

{
    const res = mockRes();
    let nexted = false;
    diagnosticsGuard(false)({}, res, () => { nexted = true; });
    check('a disabled guard answers 404', res.code === 404, `got ${res.code}`);
    check('a disabled guard does not name the route it is hiding',
        res.body && res.body.error === 'Not found' && !JSON.stringify(res.body).includes('cache'),
        `body ${JSON.stringify(res.body)}`);
    check('a disabled guard does not fall through to the handler', nexted === false);
}

{
    const res = mockRes();
    let nexted = false;
    diagnosticsGuard(true)({}, res, () => { nexted = true; });
    check('an enabled guard falls through to the handler', nexted === true);
    check('an enabled guard writes no response of its own',
        res.code === null && res.body === null, `code ${res.code}`);
}

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
