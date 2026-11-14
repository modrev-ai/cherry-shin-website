#!/usr/bin/env node
// Brings Cherry's media library into the site (TH-756). Reads the index the
// asset pull wrote (TH-909), checks every entry and its files, and writes the
// manifest the server serves from. Nothing is copied: the files stay where the
// pull put them, and the source folder is only ever read.
//
//   npm run media:import
//   node scripts/import-media.mjs [--source <dir>] [--out <file>] [--no-hash]
//
//   --source   the media folder holding index.json. Default: CHERRY_MEDIA_DIR,
//              else C:/Workstation/mkb-data/sources/media/cherry.
//   --out      where the manifest goes. Default: MEDIA_LIBRARY_FILE, else
//              server/generated/media-library.json (ignored by git).
//   --no-hash  skip the sha256 check (existence is still checked). The full
//              check reads every original, ~1.8 GB.
//
// Exit status: 0 when every entry imported, 1 when any entry was dropped (the
// manifest is still written with the ones that passed, and every dropped one is
// named), 2 when the index itself could not be read.

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MEDIA_DIR, buildManifest } from '../server/mediaLibrary.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(repoRoot, 'server', 'generated', 'media-library.json');

function readArgs(argv) {
    const args = { source: null, out: null, hash: true };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--source') args.source = argv[++i];
        else if (arg === '--out') args.out = argv[++i];
        else if (arg === '--no-hash') args.hash = false;
        else throw new Error(`unknown argument ${arg}`);
    }
    return args;
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const source = resolve(args.source || process.env.CHERRY_MEDIA_DIR || DEFAULT_MEDIA_DIR);
    const out = resolve(args.out || process.env.MEDIA_LIBRARY_FILE || DEFAULT_MANIFEST);

    let indexText;
    try {
        indexText = await readFile(join(source, 'index.json'), 'utf-8');
    } catch (err) {
        console.error(`media:import: cannot read ${join(source, 'index.json')}: ${err.message}`);
        return 2;
    }

    let result;
    try {
        result = await buildManifest({ indexText, mediaDir: source, hash: args.hash });
    } catch (err) {
        console.error(`media:import: ${err.message}`);
        return 2;
    }

    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(result.manifest, null, 1) + '\n');

    const { listed, imported, dropped } = result.summary;
    const byPlatform = {};
    for (const asset of result.manifest.assets) {
        const key = `${asset.platform} ${asset.kind}`;
        byPlatform[key] = (byPlatform[key] || 0) + 1;
    }
    console.log(`media:import: ${imported} of ${listed} imported from ${source}`
        + `${args.hash ? ', sha256 checked' : ', sha256 NOT checked (--no-hash)'}`);
    for (const [key, n] of Object.entries(byPlatform).sort()) console.log(`  ${key}: ${n}`);
    console.log(`  manifest: ${out}`);

    if (result.problems.length) {
        console.error(`media:import: ${result.problems.length} problem(s), ${dropped} entr${dropped === 1 ? 'y' : 'ies'} dropped:`);
        for (const problem of result.problems) {
            console.error(`  ${problem.id ?? '(index)'}: ${problem.reason}`);
        }
        return 1;
    }
    return 0;
}

process.exitCode = await main();
