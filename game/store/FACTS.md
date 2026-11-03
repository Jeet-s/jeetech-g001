# Path Painter — store facts (one line per player-facing system; every store claim must be backed here)

- Levels: 60 handcrafted roller-paint puzzles in 6 chapters of 10 (Basics, Switches & Gates, Color Sequencing, Crumble Hazards, Turn Pads, Master Mazes) — src/game/levels.ts
- Core rule: swipe and the brush rolls until a wall, painting every tile it crosses; paint every tile to win — src/game/PathEngine.ts
- Mechanics: key switches open the door of the same colour (up to 4 colours A–D), cracked tiles crumble after one pass, arrow turn pads bend the rolling brush (from chapter 5) — src/game/PathEngine.ts, src/game/levels.ts
- Timed levels: only 2 of 60 (levels 53 and 58 in Master Mazes), each with a generous 120-second clock; every other level is untimed — src/game/levels.ts timeLimitSeconds, src/screens/GameScreen.tsx
- Stars: par is the fewest swipes possible (solver-optimal); 3 stars at par, 2 within par+2, 1 otherwise; 180 stars total; "Perfect par!" ribbon on the win card when you match par — src/game/PathEngine.ts starsForMoves, src/screens/GameScreen.tsx
- Coins: 10 + 10 per star for each clear; hints cost 40 coins (or an opt-in rewarded ad) — src/screens/GameScreen.tsx
- Undo (unlimited, free) and Reset in every level — src/screens/GameScreen.tsx
- Gallery (meta loop): each chapter is a painting split into one piece per level; painting a level reveals its piece; 6 paintings to collect — src/screens/LevelsScreen.tsx, assets/art/painting_*.jpg
- Six themed chapter worlds (Spring Meadow, Dawn Lake, Lavender Fields, Autumn Canyon, Twilight Woods, Aurora Peaks), each with its own brush colour — src/game/theme.ts CHAPTER_THEMES, assets/art/world_*.jpg
- Daily Paint: after 3 painted levels, one painted level returns each day; its first clear that day pays a 50-coin bonus — src/game/daily.ts, src/screens/HomeScreen.tsx
- Shop: Remove Ads + 2 coin packs (Pile of Coins 500, Chest of Coins 3000) listed from monetization.json; real store prices from iap.items(), otherwise "Store unavailable" (no invented price) with a retry message; Restore purchases with a visible result; opt-in "Watch a video for 50 coins" — src/screens/ShopScreen.tsx, src/modules/storeConnect.ts
- Brushes (cosmetic paint colours, bought with coins, fixed prices, no random items): World Colours (free, default), Coral 150, Mint 250, Sunflower 350, Grape 450, Rainbow 600 (a new colour in every world); equipped brush recolours the paint on the board, Home hero and buttons (Classic palette; colourblind/high-contrast keep their safe paint) — src/game/cosmetics.ts, src/game/theme.ts makeColors, src/screens/ShopScreen.tsx
- Inbox (Home → gift button, badge = rewards ready): daily gift 25 coins once per local day; 100 coins per completed chapter; 50 coins at every 15 stars; Claim counts the coins up, claimed rows show ✓ — src/game/rewards.ts, src/screens/InboxScreen.tsx
- Settings: sound, haptics, 4 colour palettes (incl. 3 colourblind-safe), high-contrast mode — src/screens/SettingsModal.tsx
- Help: Settings → "How to play" (roll, paint every tile, switches & gates, crumble tiles, turn pads, timed levels, stars & par) and "Replay tutorial" (coached Level 1 again) — src/screens/SettingsModal.tsx, src/screens/GameScreen.tsx GameScreen()
- Fully offline, no account — src/modules/store.ts
