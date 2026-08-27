// Points git at the tracked .githooks directory, so the pre-push hook is shared
// through the repo rather than living only in someone's .git/hooks.
//
// Run automatically by npm's "prepare" lifecycle after `npm install`. Failure
// here must never break an install, so every problem is a warning.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.CI) {
    // CI checks out fresh and runs the same commands directly; hooks are moot.
    process.exit(0)
}

if (!existsSync('.git')) {
    // e.g. installed as a dependency, or a tarball checkout
    process.exit(0)
}

try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' })
    console.log('Git hooks installed (core.hooksPath -> .githooks)')
} catch (err) {
    console.warn('Could not install git hooks:', err.message)
}
