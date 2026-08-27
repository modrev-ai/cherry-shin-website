// Vercel entry point for /api/*.
//
// vercel.json rewrites every /api/* request here rather than relying on a
// catch-all filename, which was only matching a single path segment: /api/stats
// resolved but /api/youtube/videos did not.
//
// Rather than reimplementing the routes as separate serverless handlers, this
// delegates to the same Express app used in local development, so there is one
// implementation and no chance of the two drifting.
//
// Note on caching: server/cache.js holds state in memory, which on serverless
// lives only for the life of an instance. A cold start begins with an empty
// cache, so upstream is called again. That is still bounded and far below the
// free quota at this traffic, but it is weaker than the long-lived process
// locally.
import app from '../server/index.js'

export default function handler(req, res) {
    // A rewrite should preserve the original path, but if it ever arrives
    // rewritten the Express routes would not match and every request would
    // 404. Restore it from the header Vercel sends alongside.
    const original = req.headers['x-vercel-original-path']
    if (original && !req.url.startsWith('/api/')) {
        req.url = original
    }
    return app(req, res)
}
