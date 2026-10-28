# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).
Doomsday (2026-10-28): BOT-14 after web WEB-56, then BOT-15 and BOT-16 after web WEB-58, then BOT-17 with web WEB-58 part 2.

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

### BOT-17 Feats channel and test posts per kind
With web WEB-58 part 2 (the reorganised Discord page; contract in web `docs/BOT-API.md`, "Settings" and "`test`"). Decided with Nico, 2026-10-28.
- **Feats channel:**
  - Settings `channels.feats` is the channel for feats (the `milestones` event). `null` or missing means the posts channel, as now.
  - The BOT-09 grouping and the markers work in that channel. After a restart the bot reads it for markers like the other channels.
- **Test posts per kind:** the `test` event's `kind` may be `posts`, `feats`, `recap` or `doomsday`.
  - `feats`, `recap` and `doomsday` get a made-up sample of that kind, posted in that kind's channel (each falls back to the posts channel when unset):
    - `feats`: a "Feat unlocked" post
    - `recap`: a short recap
    - `doomsday`: a daily board
  - The samples use names no friend has: the character "Testy McTestface", the friends "Test Friend" and "Another Test".
  - The samples have no card images. The title starts with "Test ·" and the footer says "Test post from the site's Discord page · not real".
  - The board sample has only "Open the board ↗" and is never edited.
  - `posts` stays the plain test message. A kind the bot doesn't know gets the plain test message in the posts channel (today the bot leaves it).
  - Each test is acknowledged like any event and posted once (marker).
- Tests: the feats channel (posting, grouping, marker scan, fallback); each test kind, its channel, its marks, and the unknown kind.
