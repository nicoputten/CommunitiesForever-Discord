# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).

### BOT-16 Dailies in the weekly recap
After web WEB-62 (dailies and weeklies, decided with Nico on 2026-10-28). No live posts and no new milestone kinds: the dailies show only in the weekly recap.
- The award **A15 Daily devotee** and the fun card **F23 Perfect week** come through the recap API like every card and render as they do now. Check that nothing card-specific is missing.
- The new recap icons from the design (`DESIGN-PROMPT-DAILIES.md` in the web repo): the dailies scroll for A15 and the streak mark for F23.
- "DoomPoints PvE" is written exactly like that. Never show it summed with DoomPoints PvP (the ladder, BOT-15).
- Tests: a recap fixture with A15 and F23 formats as in the design.
