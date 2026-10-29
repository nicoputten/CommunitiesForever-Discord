# Changelog

## Unreleased

## v0.4.1 (2026-10-30)
- Test posts from the site's Discord page show the site's sample images, as the real posts do: the Doomsday board picture, the feat card, and the recap's award picture and zone map. They still say "Test" and "not real". An older site still gets the text board.
- A note a friend adds to an answer in the game ("Late, start without me") shows next to that answer in the run or ask post.

## v0.4.0 (2026-10-29)
- **Visual posts** (the site renders the images; until it does, posts keep their current look):
  - The weekly recap is one message of 8 cards: the numbers, the award with its picture, the stat card with its map, three cards with their icon, the Doomsday top 3 and the challenge, with "The full week ↗" and "Doomsday ladder ↗" buttons.
  - The daily Doomsday board is one picture of the day with one line of news, updated during the day (the picture at most every 5 minutes).
  - Feat posts start with the character, then what happened, then one card. New characters get one line instead of a feat.
  - The emoji table and its legend are gone from the board, and the "not real" footer shows only on test posts.

## v0.3.1 (2026-10-29)
- A test post from the site's Discord page now goes to the channel you just picked, also when you press the button right after changing it.

## v0.3.0 (2026-10-29)
- **Doomsday:** daily and weekly goals with points for PvE and PvP, always shown side by side and never added together.
  - The daily board: at each reset (19:00 realm time, set on the site) the bot posts the day's goals in the Doomsday channel, with a row of boxes per friend. It edits that one post as uploads come in: names are struck through when the dailies are done, the first to finish gets the crown, and the points per track show. A final version with the day's summary closes the day.
  - "My goals" on the board, and `/doomsday` (or `/doom`), show your goals today and this week, your points, your place on both ladders and your streak, only to you. `friend:` shows a friend's day.
  - The weekly ladder on Sunday at the reset: the PvP and PvE top 5 with movement, the duel champion, the most kills in one zone, the battlegrounds and the PvP Virgin of the week.
  - The weekly recap gets a Doomsday section: most devoted, perfect week and the top points per track.
- **Feats:** milestone posts become "Feat unlocked" posts ("Feats unlocked · 4" for several), with "First in the group" and one card image per post.
  - New feats: honorable kills, PvP ranks with their "a.k.a." titles, duel wins, first battleground wins, 100 deaths, the first epic, mounts, the first catch, Jack of all trades and notable items (Arcanite Reaper, Mooncloth, the Fishing Extravaganza, ...).
  - Feats from a newer site are posted with the site's own text.
- **Recap card icons:** cards about PvP, deaths, loot, mounts, battlegrounds, late nights and early mornings show a small icon.
- **Channels:** feats can have their own channel now, like the recap, runs and Doomsday; the default channel takes the rest. The site's test buttons for feats, the recap and Doomsday post a made-up sample in that channel, marked as a test.
- The bot's own emoji (class icons, Doomsday boxes, recap icons) are uploaded at start; the log now says `emoji: 24 of 24 ready`.
- Maintenance: eslint 10 and gitleaks-action 3, and a code clean-up with no change in behaviour.

## v0.2.1 (2026-10-28)
- Run posts list the slots one per line ("Tank · Vesgar Bloodhoof 27 · Vestras", "Healer · needed"), so they line up. I'm in opens the character picker with your best fitting character already chosen; pick a role, or another character. Any character may say I'm in, also one far below the dungeon ("tough"). The separate Pick my character button is gone.

## v0.2.0 (2026-10-28)
- Asks: `/ask` asks who's up for a dungeon right now, and asks (from the game or `/ask`) can be answered on Discord with I'm in, Maybe, Can't or Pick my character. The post shows who answered, updates itself, and says "Expired" without buttons after 10 minutes.
- Class icons: every character name in the bot's answers and posts (look-ups, milestones, runs, the character picker) has its class icon before it. The bot uploads the icons as its own emoji at start, and again only when one changes.
- Planned runs: a run planned on the site, with `/plan` or in the game gets one post in the runs channel that updates itself as people answer, until it is done, didn't happen or was cancelled. I'm in, Maybe, Can't and Pick my character answer from the post (pick a character and its role, only you see it). A reminder and Starting now mention only those in and maybe; pings and asks from the game are posted too. Moves, a new time and a cancelled run reach sign-ups as a quiet direct message. `/plan` (in your own time zone), `/runs`, `/run edit` and `/run cancel`.
- Look-up commands: `/whereis` (a friend's characters or one character, where and how long ago, with the map card), `/who` (by level, role, class or seen today), `/whocancraft` (who has a profession, the best starred), `/character` (the character card), `/alts` (a friend's characters) and `/me` (your characters and your week). Names fill in as you type. Answers are only for you; Share posts a copy in the channel.
- The weekly recap: every week at the recap time set on the site (Sunday 13:00 by default) the bot posts the site's recap of the week in the recap channel (the posts channel when none is set), with its header image and the Zone of the week map. A recap missed while the bot was away is posted once it is back, never twice.
- `/recap` shows the last weekly recap again, only to you.
- Level 60, a new character at 60 and a profession at 300 get the site's card image in their milestone post.

## v0.1.0 (2026-10-27)
- The bot reads the site's settings every 30 seconds instead of every 5 minutes, so a newly picked channel and a test post work at once.
- "Send a test post" on the site's Discord page now posts a test message in the posts channel.
- The bot tells the site the server's channels and mentionable roles, so the admin picks the posts channel and the run mention role from a list.
- Releases: a `v*` tag on `main` publishes the bot's image; the bot logs its version at start. The web repo's `deploy/compose.yaml` runs it next to the site.
- Milestones from uploads within 5 minutes of a post are added to that post, so friends logging off together give one post instead of several.
- Milestone posts: after an upload the bot posts its milestones (every 10 levels, level 60, a profession at its cap, a new character) in one message in the posts channel set on the site, each once, also after a restart.
- The bot connects to Discord (no privileged intents), registers its slash commands, reconnects by itself, checks its site token, stops gracefully on `docker stop`, and has a container health check. `docs/DISCORD-SETUP.md` explains setting up the Discord application and inviting the bot.
- The bot's skeleton: an empty bot that checks its configuration (and says "no token" without one), a Docker image running as a non-root user, CI with lint, tests, build, image build and the secret scan, and weekly Dependabot updates.
