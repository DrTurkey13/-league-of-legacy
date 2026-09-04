# Fantasy League HQ

Static responsive fantasy-football league website connected to Sleeper league `1312063787448139776`.

## Run locally
Open `index.html` in a browser. For best results, use a simple local web server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy
This is a static site. You can deploy the entire folder to Vercel, Netlify, GitHub Pages, Cloudflare Pages, or any static host.

## Current features
- Live league name, team count, standings and roster-owner mapping from Sleeper
- Rankings sorted by wins, then losses, then points-for
- Completed trade history with player/pick/FAAB assets
- Waiver and free-agent activity with FAAB bids
- Full Rules page
- Waitlist page
- Mobile-responsive design

## Easy edits
- League ID: `app.js` -> `LEAGUE_ID`
- Waitlist: `index.html` -> `page-waitlist`
- Rules: `index.html` -> `page-rules`
- Styling: `styles.css`


## Season shame leaderboard
The home page now counts each completed week's lowest-scoring manager and builds a season-long “You Suck” leaderboard. Exact weekly ties award one You Suck to each tied manager.
