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

### BOT-14 "Feat unlocked" posts
After web WEB-56. Every milestone becomes a feat. The event type stays `milestones`; the post becomes "Feat unlocked" as on `bot-doomsday-feats`.
- One feat: "Feat unlocked", the character, the feat text, a "First in the group" line when the site marks it, and the site's card image when there is one.
- Several feats from one upload: "Feats unlocked · 4", the character, one line per feat. The one card image is the most special feat's (the site says which).
- The existing kinds (`level`, `maxLevel`, `professionCap`, `newCharacter`) move to the feat look too.
- **The new kinds** (texts from web WEB-56):
  - `honorKills`: first ("First blood"), 100, 1,000, 5,000, 10,000
  - `pvpRank`: the official rank, then "a.k.a." our title; the site sends both. Below rank 6: "Cards start at rank 6, keep going."
  - `duelWins`, `bgFirstWin`, `deaths100`
  - `firstEpic`: the item name in epic purple, its slot, the level
  - `mount`, `epicMount`: with "the 3rd mount in the group"
  - `firstCatch`, `jackOfAllTrades`, `notableItem`
  - the flavour title on profession cap 300
- The recap card icons for WEB-57's new cards (PvP, death, fall, fire, epic, mount, night owl, early bird).
- Kinds the bot doesn't know are still skipped and acknowledged. Tests for each kind's formatting, one and several feats.

### BOT-15 The daily Doomsday board post
After web WEB-58 (events `doomsdayBoard` and `doomsdayBoardUpdate`), as on `bot-doomsday-daily`.
- At each reset the site sends `doomsdayBoard`; the bot posts it in the Doomsday channel (a site setting) and acknowledges it with the message id. The post shows:
  - "Doomsday · Tue 28 Oct"
  - the PvE dailies and PvP goals with their points
  - a row per friend with boxes per goal (green PvE, red PvP; the bot's own custom emoji)
  - "resets in …"
  - the "Open the board ↗" and "My goals" buttons
- Each `doomsdayBoardUpdate` for that day **edits the same message**, never a new one. A finished friend's name is struck through, the crown goes to the first, and progress shows ("3 / 5"). Rate-limit the edits: at most one per message per 30 s, keeping only the newest state.
- The final update (`final: true`) shows "final" and the day's summary: goals done, who won the Hunt race, the longest streak.
- Friends without the addon get no row ("Sanne: no addon, so no row"). PvP Virgin is shown next to the name.
- "My goals" answers like `/doomsday` (BOT-16), ephemeral.
- Custom emoji: the bot uses its own if they're uploaded to the server, else plain characters (✅, ▢). Document in `docs/DISCORD-SETUP.md` how to add them.
- Tests: formatting at 19:00 (fresh), midday and final; the edit throttle; a message that was deleted (post a new one and acknowledge that).

### BOT-16 Weekly ladder post, `/doomsday` and the recap section
After web WEB-58, as on `bot-doomsday-weekly` and `bot-recap-doomsday`.
- **Weekly ladder post:** on the site's `doomsdayLadder` event (Sunday at the reset). It shows:
  - "Doomsday ladder · week 44"
  - PvP top 5 and PvE top 5 with movement
  - the duel champion with rating, the most kills in one zone
  - the battleground block ("kept apart from the kills above")
  - the PvP Virgin of the week line, when the site sends one
  - the link to the all-time ladder on the site
- **`/doomsday`** (alias `/doom`), ephemeral, from the site's `doomsday` look-up:
  - your goals today with progress
  - this week and all time per track, your place on both ladders, the streak and best
  - "resets in …"
  
  With an optional `friend:` (a display name, with autocomplete from the site's friends), it shows that friend's day the same way. Not linked: the usual "Link your Discord first" reply. An older site (404) or no data: "Doomsday isn't available yet."
- **Recap section:** the recap's optional `doomsday` field renders as the Doomsday section on `bot-recap-doomsday`: Most devoted, Perfect week, and PvE and PvP points side by side.
- Register the command globally with the others. Tests for each view's formatting and the fallbacks.
