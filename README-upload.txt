LEAGUE OF LEGACY — 8 STADIUM BACKGROUNDS + HERO CONTINUITY FIX

Replace in repo root:
- index.html
- app.js
- styles.css

Add these 8 images to repo root:
- stadium-day-blue.webp
- stadium-day-red.webp
- stadium-day-white.webp
- stadium-day-mixed.webp
- stadium-night-blue.webp
- stadium-night-red.webp
- stadium-night-white.webp
- stadium-night-mixed.webp

Old stadium PNG files and old alternate CSS files are no longer needed.

Important fix:
The stadium is rendered once as the full-site body background. The hero is
explicitly transparent in every theme/division state so it cannot restart the
old stadium image inside a rounded hero panel.
