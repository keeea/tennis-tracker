# Tennis Point Tracker PWA

## Overview
A mobile-first PWA for tracking tennis match points in real-time. Deployed as a static site (Vercel-ready). All data stored client-side in IndexedDB.

## Data Model
Match → Set → Game → Point

- Match: two player names, date, match format (best of 3 sets)
- Set: collection of games, tiebreak at 6-6
- Game: collection of points, server indicated
- Point: all per-point data below

## UI Flow

### Match Setup
- Enter two player names
- Start match button

### Live Scoring Screen (top)
- Current score display: Sets won, Games in current set, Points in current game
- Tennis scoring: 0 / 15 / 30 / 40 / Deuce / Ad
- Current server indicator
- Server alternates automatically each game
- Tiebreak at 6-6 (first to 7, win by 2; serve alternates every 2 points after first)

### Point Entry (3-4 taps max)
For each point, record:
1. **Serve result:** 1st serve in / 2nd serve in / Ace / Double Fault
2. **Point outcome:** Winner / Unforced Error / Forced Error (skip if Ace or DF)
3. **Shot type** (for outcome): Forehand / Backhand / Volley / Overhead / Drop shot
4. **Who won the point** (auto-assigned for Ace→server, DF→returner)
5. **Optional flag:** Net approach (yes/no)
6. **Optional flag:** Return winner (yes/no)

UI should be large tap targets, mobile-optimized. Minimal taps to log a point.

### Navigation / History
- Browse by set → game → point
- Edit/correct any previously logged point
- Delete a point (with confirmation)
- Go back and forth between games freely

### Stats Dashboard
Auto-calculated, per player, per set and overall match:
- 1st serve % / 2nd serve %
- 1st serve points won % / 2nd serve points won %
- Aces / Double faults
- Winners (broken down by FH/BH/Volley/Overhead/Drop)
- Unforced errors (broken down by FH/BH)
- Forced errors
- Net points won / Net points played
- Return winners
- Break points converted / Break points saved
- Total points won

### Data Export
- Export match as JSON
- Export match as CSV
- Share via Web Share API (if available)

## Technical Requirements
- Pure static PWA (HTML/CSS/JS) — no server/backend
- Service worker for offline support
- Web App Manifest for installability
- IndexedDB for persistent storage (use idb or Dexie.js)
- Responsive, mobile-first design (works on phones)
- Tailwind CSS (via CDN) for styling
- Single-page app (vanilla JS or lightweight framework like Preact)
- Vercel-compatible (just static files)

## Tennis Rules to Implement
- Game scoring: 0, 15, 30, 40, Deuce (40-40), Advantage
- Game won when leading by 2 from deuce
- Set won at 6 games with 2-game lead, or via tiebreak at 6-6
- Tiebreak: first to 7 points, win by 2. Serve: first server serves 1 point, then alternate every 2.
- Match: best of 3 sets
- Server alternates every game. In tiebreak, server of next set is the one who would have served next.

## Design
- Dark theme preferred (easy on eyes outdoors)
- Large buttons (thumb-friendly for courtside use)
- High contrast score display
- Minimal chrome — focus on speed of input
