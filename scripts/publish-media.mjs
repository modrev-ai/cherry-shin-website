#!/usr/bin/env node
// Puts the media library's web copies on Vercel Blob and writes the public
// manifest the live site's /gallery reads (TH-756). Only web copies go up -
// webp images and video posters; the originals never leave this machine. How
// and why: scripts/mediaPublish.js.
//
//   npm run media:publish -- --dry-run    counts and total bytes, nothing sent
//   npm run media:publish                 the real upload (operator only)
//   node scripts/publish-media.mjs [--dry-run] [--manifest <file>] [--out <file>]
//
//   --manifest  the import's manifest. Default: MEDIA_LIBRARY_FILE, else
//               server/generated/media-library.json (npm run media:import).
//   --out       where the public manifest goes. Default:
//               public/media-library.json, served at /media-library.json and
//               committed, so the deploy that carries it is the one that shows it.
//
// The token. Like any Vercel project, the upload reads BLOB_READ_WRITE_TOKEN
// from the environment that runs it - for the operator, after
// `vercel env pull .env.local`, by loading that file for this one command. This
// script only checks that the variable is set; @vercel/blob reads it. It is
// never printed, logged or written anywhere, and without it nothing is sent.
//
// Re-runs are cheap: every blob is named by asset id and the web copy's
// sha256, and one that already exists is skipped, not re-uploaded.
//
// Exit status: 0 done, 1 some web copies could not be read (the rest are
// published and named in the manifest), 2 nothing done (no token, no manifest).

import { readFile, mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resolveInside } from '../server/mediaLibrary.js';
import { buildPublicManifest, publishAssets } from './mediaPublish.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(repoRoot, 'server', 'generated', 'media-library.json');
const DEFAULT_OUT = join(repoRoot, 'public', 'media-library.json');

function readArgs(argv) {
    const args = { dryRun: false, manifest: null, out: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') args.dryRun = true;
        else if (arg === '--manifest') args.manifest = argv[++i];
        else if (arg === '--out') args.out = argv[++i];
        else throw new Error(`unknown argument ${arg}`);
    }
    return args;
}

const mb = bytes => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

async function main() {
    let args;
    try {
        args = readArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`media:publish: ${err.message}`);
        return 2;
    }

    // Before anything is read: without the token there is nothing to do.
    if (!args.dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('media:publish: BLOB_READ_WRITE_TOKEN is not set, so nothing was uploaded.\n'
            + '  The operator runs this with the project\'s Blob token in the environment, e.g. after\n'
            + '  `vercel env pull .env.local`: node --env-file=.env.local scripts/publish-media.mjs\n'
            + '  To see what would go up without it: npm run media:publish -- --dry-run');
        return 2;
    }

    const manifestFile = resolve(args.manifest || process.env.MEDIA_LIBRARY_FILE || DEFAULT_MANIFEST);
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestFile, 'utf-8'));
    } catch (err) {
        console.error(`media:publish: cannot read the import's manifest ${manifestFile}: ${err.message}\n`
            + '  Run npm run media:import first.');
        return 2;
    }
    if (!Array.isArray(manifest?.assets)) {
        console.error(`media:publish: ${manifestFile} has no assets array`);
        return 2;
    }
    const mediaDir = process.env.CHERRY_MEDIA_DIR || manifest.source_dir;

    const readWeb = async asset => {
        const path = mediaDir ? resolveInside(mediaDir, asset.web?.src) : null;
        if (!path) throw new Error(`path outside the media folder: ${asset.web?.src}`);
        return readFile(path);
    };

    let blob = null;
    if (!args.dryRun) {
        // Loaded only for the real upload, so a dry run needs nothing installed
        // and cannot reach the network.
        const { head, put } = await import('@vercel/blob');
        blob = { head: pathname => head(pathname), put: (pathname, body, options) => put(pathname, body, options) };
    }

    const { summary, entries } = await publishAssets({
        assets: manifest.assets,
        readWeb,
        blob,
        dryRun: args.dryRun,
        log: line => console.log(line),
    });

    const sendable = summary.images + summary.posters;
    if (args.dryRun) {
        console.log(`media:publish (dry run, nothing sent): ${sendable} web copies of ${summary.assets} assets`
            + ` (${summary.images} images, ${summary.posters} video posters), ${summary.bytes} bytes (${mb(summary.bytes)})`);
    } else {
        const out = resolve(args.out || DEFAULT_OUT);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, JSON.stringify(buildPublicManifest(entries), null, 1) + '\n');
        console.log(`media:publish: ${summary.uploaded} uploaded (${mb(summary.uploadedBytes)}), ${summary.skipped} already there,`
            + ` ${sendable} web copies in all (${mb(summary.bytes)})`);
        console.log(`  public manifest: ${out} - commit it to put the gallery on the live site`);
    }

    if (summary.failed.length) {
        console.error(`media:publish: ${summary.failed.length} web cop${summary.failed.length === 1 ? 'y' : 'ies'} skipped:`);
        for (const problem of summary.failed) console.error(`  ${problem.id}: ${problem.reason}`);
        return 1;
    }
    return 0;
}

process.exitCode = await main();
