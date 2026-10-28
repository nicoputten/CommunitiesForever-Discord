# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).
Doomsday (2026-10-28): BOT-14 after web WEB-56, then BOT-15 and BOT-16 after web WEB-58.

## Doomsday (decided with Nico, 2026-10-28)
Daily and weekly goals with points per track (PvE and PvP, never added together), a streak, a crown, feats and a ladder. **The rules are in the addon repo's `docs/DOOMSDAY.md`**; the site computes everything (web E8, WEB-56 and WEB-58), and the bot formats and posts. It replaces the workshop stories for milestones, `/ladder` and dailies (their PRs were closed unmerged).

Boards (`design/README.md`):
- `bot-doomsday-daily`
- `bot-doomsday-weekly`
- `bot-doomsday-feats`
- `bot-recap-doomsday`

The feat card images are the site's (web `design/boards/doomsday-feat-cards`). Where a board and `DOOMSDAY.md` disagree, `DOOMSDAY.md` wins: the day resets at **19:00** realm time (a setting on the site), not 09:00, and the weekly post comes on Sunday at that time. The crown gives no points.

**Rules:**
- No pings.
- No BattleTags or Discord IDs in posts.
- Gold never as an amount.
- "PvE" and "PvP" points are never summed.

Order:
1. BOT-14 after web WEB-56.
2. BOT-15 and BOT-16 after web WEB-58. The formatting can be built earlier from the API contract in the web repo's `docs/BOT-API.md` and fixtures.
