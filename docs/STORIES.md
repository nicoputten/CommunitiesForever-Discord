# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).

## Recap v2: PvP, danger, loot (decided with Nico, 2026-10-28)
The site adds new milestone kinds (web WEB-56) and recap cards (web WEB-57). The recap's texts come finished from the site, so new cards need no bot change beyond the icons. Designs: web `docs/DESIGN-PROMPT-RECAP-V2.md`, boards "· recap v2". A PvP ladder (`/ladder`) follows in its own story after the designs.

### BOT-14 New milestone posts and recap icons
After web WEB-56.
- Post the new `milestones` kinds as in the design (the full list and texts: web WEB-56, agreed with Nico 2026-10-28):
  - `honorKills`: first (playful "First blood" text), 100, 1,000, 5,000 and 10,000 honorable kills
  - `pvpRank`: a new highest rank (1 to 14), the official title with its faction insignia, "a.k.a." our title (the site sends both)
  - `duelWins` (10, 50, 100), `bgFirstWin` (per battleground), `deaths100` ("A spirit healer's best friend")
  - `firstEpic`: the item name in epic purple, its slot and the level it was looted at. No Wowhead link.
  - `mount` and `epicMount`, with the level and the place in the group ("the 3rd mount in the group")
  - `firstCatch`, `jackOfAllTrades` and `notableItem` (Arcanite Reaper, Arcanite transmute, Mooncloth, Devilsaur gear, Fishing Extravaganza joined and won)
  - the flavour title on the existing profession cap post at 300 (Head Chef, Field Medic, Fish Whisperer), when the site sends it
- A "First in the group" badge on a milestone when the site marks it so.
- No pings.
- They are grouped with other milestones from the same upload, as now (BOT-09).
- Use the site's card images once WEB-56 serves them (`honorKills` 10,000, `pvpRank` from rank 6 with a special 14, `firstEpic`, `epicMount`, `jackOfAllTrades`, each `notableItem`). Until then, post without an image.
- The new recap card icons from the design (PvP, death, fall, fire, epic, mount, night owl, early bird).
- Kinds the bot doesn't know are still skipped and acknowledged. Tests for each new kind's formatting.
