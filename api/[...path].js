// Vercel catch-all for /api/*.
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
export { default } from '../server/index.js'
