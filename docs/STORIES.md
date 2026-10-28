# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).

## Recap v2: PvP, danger, loot (decided with Nico, 2026-10-28)
The site adds new milestone kinds (web WEB-56) and recap cards (web WEB-57). The recap's texts come finished from the site, so new cards need no bot change beyond the icons. Designs: web `docs/DESIGN-PROMPT-RECAP-V2.md`, boards "· recap v2". The PvP ladder (`/ladder`) is BOT-15 below.

### BOT-14 New milestone posts and recap icons
After web WEB-56.
- Post the new `milestones` kinds as in the design:
  - `honorKills`: first, 100, 1,000 and 5,000 honorable kills
  - `pvpRank`: the rank title with its faction insignia
  - `firstEpic`: the item name in epic purple
  - `mount` and `epicMount`
- They are grouped with other milestones from the same upload, as now (BOT-09).
- Use the site's card images for `pvpRank`, `firstEpic` and `epicMount` once WEB-56 serves them. Until then, post without an image.
- The new recap card icons from the design (PvP, death, fall, fire, epic, mount, night owl, early bird).
- Kinds the bot doesn't know are still skipped and acknowledged. Tests for each new kind's formatting.

## PvP ladder (decided with Nico, 2026-10-28)
The ladder's rules are in the addon repo, `docs/LADDER.md`. The site computes everything (web WEB-58), and the bot only formats it. Designs: web `docs/DESIGN-PROMPT-RECAP-V2.md`, section 3.

### BOT-15 `/ladder`
After web WEB-58 and the designs.
- `/ladder` with an optional `view`: `week` (default), `lastweek`, `lifetime`, `duels` or `battlegrounds`. It is answered from the site's look-up `ladder` (`docs/BOT-API.md` in the web repo).
- An ephemeral embed as in the design:
  - the top 5 friends with DoomPoints PvP (or kills for lifetime), with the PvE number beside it where the design shows it ("DoomPoints · PvE 34 · PvP 1,210"; never summed) and movement since last week
  - the asker's own place when outside the top 5 (needs a linked Discord; without one, no own place)
  - today's Hunt and the week's bounty
  - for `duels`: the head-to-head and the duel rating
- **PvP Virgin** and "no ladder data yet" as the site gives them.
- An older site (404) or no data yet: "The ladder isn't available yet." The recap's "Ladder of the week" line comes finished from the site (WEB-58) and needs no bot change beyond the icon.
- The design's icons (ladder, Hunt, bounty, duels, spree, PvP Virgin). Tests for each view's formatting and the fallbacks.
