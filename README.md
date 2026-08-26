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
├── src/
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── Hero.jsx
│   │   ├── EndlessReels.jsx       # Main endless scroll feed
│   │   ├── MediaCard.jsx          # Individual media card component
│   │   ├── MediaModal.jsx         # Modal for expanded media view
│   │   ├── PlatformIcon.jsx       # Platform-specific icons
│   │   ├── About.jsx
│   │   └── Footer.jsx
│   ├── hooks/
│   │   └── useInfiniteScroll.js   # Custom infinite scroll hook
│   ├── services/
│   │   └── mediaApi.js            # API service for fetching mixed media
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── server/
│   ├── index.js                   # Express backend for Instagram API proxy
│   ├── package.json
│   └── .env.example               # Environment variables template
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
   - Get your `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID`

2. **Configure the backend server:**
   ```bash
   cd server
   
   # Copy the environment template
   cp .env.example .env
   
   # Edit .env with your credentials
   #   INSTAGRAM_ACCESS_TOKEN=your_token_here
   #   INSTAGRAM_USER_ID=your_user_id_here
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

## Social Media Links

- **Instagram:** [@itscherryshin](https://www.instagram.com/itscherryshin/)
- **TikTok:** [@itscherryshin](https://www.tiktok.com/@itscherryshin)
- **YouTube:** [@cherryshin](https://www.youtube.com/@cherryshin)
- **Linktree:** [linktr.ee/itscherryshin](https://linktr.ee/itscherryshin)

## Technologies Used

- **Frontend:** React 19, Vite
- **Backend:** Node.js, Express
- **Styling:** Custom CSS with CSS Grid & Flexbox
- **APIs:** Instagram Graph API, YouTube Data API

## License

MIT