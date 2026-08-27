# Cherry Shin - Influencer Website

A modern, responsive influencer website featuring an **endless reels** content feed that mixes media from multiple social media platforms (Instagram, TikTok, YouTube).

## Features

- **Endless Reels Feed** - Infinite scroll through mixed content from all platforms
- **Platform Integration** - Instagram, TikTok, and YouTube content in one unified feed
- **Responsive Design** - Works beautifully on desktop, tablet, and mobile
- **Dark Theme** - Modern dark UI with glassmorphism effects
- **Media Modal** - Click any card to view expanded content with YouTube embeds
- **Real-time Instagram API** - Backend proxy server fetches live Instagram posts
- **Skeleton Loading** - Smooth loading animations for media cards

## Project Structure

```
cherry-shin-website/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   │   └── hero.png               # Hero background image
│   ├── components/
│   │   ├── HeroSection.jsx        # Landing header with profile + stats
│   │   ├── EndlessReels.jsx       # Main endless scroll feed
│   │   ├── MediaCard.jsx          # Individual media card component
│   │   ├── MediaModal.jsx         # Modal for expanded media view
│   │   └── PlatformIcon.jsx       # Platform-specific icons
│   ├── hooks/
│   │   ├── useInfiniteScroll.js   # IntersectionObserver scroll trigger
│   │   └── useMediaFeed.js        # Paginated feed state (items, loadMore)
│   ├── services/
│   │   └── mediaApi.js            # API service for fetching mixed media
│   ├── App.jsx                    # Composes HeroSection + EndlessReels
│   ├── App.css
│   ├── main.jsx
│   └── index.css                  # Global styles, dark theme, skeletons
├── server/
│   ├── index.js                   # Express backend for Instagram API proxy
│   ├── package.json
│   └── .env.example               # Environment variables template
├── index.html
├── package.json
└── vite.config.js
```

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- (Optional) Meta Developer account for Instagram API access

### Quick Start (without Instagram API)

The website works out-of-the-box with mock data for all platforms:

```bash
# Install frontend dependencies
npm install

# Start the development server
npm run dev
```

The site will be available at `http://localhost:5173`.

### Full Setup (with Instagram API)

To fetch real Instagram posts:

1. **Set up Meta Developer credentials:**
   - Go to [Meta for Developers](https://developers.facebook.com/)
   - Create an app with Instagram Basic Display permissions
   - Get your `IG_ACCESS_TOKEN` and `IG_USER_ID`

2. **Configure the backend server:**
   ```bash
   cd server
   
   # Copy the environment template
   cp .env.example .env
   
   # Edit .env with your credentials
   #   IG_ACCESS_TOKEN=your_token_here
   #   IG_USER_ID=your_user_id_here
   ```

3. **Start the backend server:**
   ```bash
   npm install
   npm start
   ```

4. **Start the frontend (in a separate terminal):**
   ```bash
   npm run dev
   ```

## Deployment (Vercel)

The site deploys as a static frontend plus one serverless function.

* `api/[...path].js` delegates every `/api/*` request to the same Express app
  used in local development, so there is a single implementation.
* `server/index.js` exports that app and only binds a port when run directly,
  which is what keeps it usable in both places.
* `vercel.json` builds with Vite to `dist` and leaves `/api/*` to the function.

### Connecting the project

1. In Vercel, **Add New → Project** and import `modrev-ai/cherry-shin-website`.
   The settings in `vercel.json` are picked up automatically.
2. Add the environment variables under **Settings → Environment Variables**:

   | Variable | Needed for |
   | --- | --- |
   | `YOUTUBE_API_KEY` | live YouTube feed |
   | `YOUTUBE_CHANNEL_ID` | live YouTube feed |
   | `IG_ACCESS_TOKEN` | live Instagram feed (optional) |
   | `IG_USER_ID` | live Instagram feed (optional) |
   | `CACHE_TTL_MS` | optional, defaults to 10 minutes |

   Anything left unset falls back to sample content for that platform; the site
   still builds and runs.
3. Deploy. Pushes to `main` deploy automatically once the repo is connected.

### A caveat on caching

`server/cache.js` keeps its cache in memory, which on serverless lasts only for
the life of an instance. A cold start begins with an empty cache and calls
upstream again, so the request-to-upstream ratio is worse than it is locally.
At this traffic it stays far inside the free YouTube quota, but a shared cache
(Vercel KV or similar) would be the fix if that changes.

## Social Media Links

- **Instagram:** [@itscherryshin](https://www.instagram.com/itscherryshin/)
- **TikTok:** [@itscherryshin](https://www.tiktok.com/@itscherryshin)
- **YouTube:** [@cherryshin](https://www.youtube.com/@cherryshin)
- **Linktree:** [linktr.ee/itscherryshin](https://linktr.ee/itscherryshin)

## Technologies Used

- **Frontend:** React 19, Vite
- **Backend:** Node.js, Express
- **Styling:** Custom CSS with CSS Grid & Flexbox
- **APIs:** Instagram Graph API (live, via the Express proxy). TikTok and YouTube
  content is currently mock data defined in `src/services/mediaApi.js`.

## License

MIT