# Completed stories

Done (merged) stories, moved here from `docs/STORIES.md`, which holds only open stories. Kept for their decisions and acceptance criteria.

### BOT-01 Repo skeleton and CI
- Node 24 (`.nvmrc`), TypeScript, ESLint, Prettier, Vitest as in the web repo; `src/core`, `src/adapters`, `src/app` with an ESLint rule that `core` imports nothing from the others or from discord.js and Node.
- CI on every push and PR: lint, test, build, Docker image build (not pushed), gitleaks over the full history. Dependabot for npm and GitHub Actions (grouped minor and patch, weekly).
- `.env.example` with the four variables of `docs/ARCHITECTURE.md`, no values. `Dockerfile` (non-root, no secrets, `.dockerignore` as an allow-list).
- Done when: CI is green on an empty bot that starts, logs "no token" and exits cleanly without env.
- Done (PR #3). Built: `src/core/config.ts` (reads the four variables from an env argument; "no token", "incomplete" with the missing names, "bad site url"; logs names, never values), `src/adapters/log.ts`, `src/app/start.ts` and `main.ts`. Without `DISCORD_TOKEN` the bot logs "no token" and exits 0; with an incomplete configuration it exits 1. The ESLint rule also keeps `process`, timers, `fetch` and `Date.now` out of `src/core`. CI runs the image without env and checks the "no token" line and the non-root user. No discord.js yet (BOT-02).

### BOT-02 Discord application and connection
- A guide in `docs/DISCORD-SETUP.md` for Nico: create the application and bot in the Discord developer portal, which intents (none privileged if possible) and permissions (send messages, embed links, attach files, use application commands), the invite link, where the token goes (TrueNAS env only).
- The bot connects, registers the slash commands for the guild set on the site (or globally), reconnects on failures and shuts down gracefully on SIGTERM.
- Health: a log line per state change; the container's health check shows connected or not.
- Manual: Nico invites the bot to a test server and sees it online.
- Done (PR #5). Built: `src/adapters/discord.ts` (discord.js client with the `Guilds` intent only, state changes as events, global command registration over REST), `src/adapters/site.ts` (`GET settings`), `src/adapters/heartbeat.ts`; `src/core/connection.ts` (log lines per state, backoff 5 s to 5 min, health rule), `src/core/commands.ts` (empty until BOT-06), `src/core/settings.ts`; `src/app/start.ts` (connect, register once per start, heartbeat while connected, site check with backoff and never fatal, graceful stop), `main.ts` (SIGTERM/SIGINT, 10 s limit), `health.js` (Docker `HEALTHCHECK`). A refused token or disallowed intent exits 1. Decisions (Nico, 2026-10-27): no privileged intents, permissions `117760`, commands global, health via a heartbeat file (no port), channels and roles reporting in BOT-08. Name and avatar: from the designer.

### BOT-03 Milestone posts
- Needs WEB-38 (bot API, events) and the site's milestone events.
- Polls `events`, posts milestones as on the `bot-posts` board (part 1): one message per upload with all its milestones, level 60 with the generated card, "Open character" link. Acknowledges each event (rule 9); no double posts after a restart.
- Respects the site's settings (channel, milestones on or off, mention role).
- Tests: core formatting for every milestone kind and the grouped message; the poll loop with a fake site and a fake Discord (restart, outage, ack failure).
- Done (PR #6). Built: `src/core/milestones.ts` (one message per upload: level 60 as its own embed in the class colour, the rest in one gold embed with owner, at most 10 then "and N more"; names escaped, no mentions; the marker `#e<id>` on the first character link), `src/core/events.ts` (feed and milestones read defensively, `decide`: post, acknowledge only, or leave), `src/core/settings.ts` (posts channel and milestones switch), `src/adapters/site.ts` (settings, events long poll, posted), `src/adapters/discord.ts` (post and the bot's last 50 posts, over REST), `src/app/poster.ts` (settings every 5 min, markers read per channel, backoff 5 s to 5 min, cursor back to 0 after a failure). Decisions (Nico, 2026-10-27): no card image yet (the image list goes to the designer), only what the event carries, no owner mention, milestones mention nobody, unknown types and milestones off are left to expire, the bot is DoomBot (DESIGN-NOTES "Deviations").

### BOT-09 Group milestones from uploads close together
- After a group session several friends log off at about the same time; their uploads' milestones go into one post instead of one each (Nico, 2026-10-27).
- The first milestone posts at once. Milestones from uploads within 5 minutes of that post are added to it by editing it, as long as it holds at most 10 milestones; after that a new post starts. Each event is acknowledged with the post's message id (web `docs/BOT-API.md` "Acknowledging", web PR #58).
- Each upload in a post has its own marker, so a restart between an edit and its acknowledgement only acknowledges. A post that can't be edited (deleted) gets a new post instead.
- Done (PR #7). Built: `groupedMessage` and `joinsPost` in `src/core/milestones.ts` (level 60s of any upload on top, at most 9 of them as embeds, the rest in the gold list), `edit` in `src/adapters/discord.ts`, the open post in `src/app/poster.ts` (bounded by 10 milestones, forgotten on a channel change or restart).

### BOT-07 Release and deploy
- Release workflow: a `v*` tag on `main` pushes `ghcr.io/nicoputten/communitiesforever-discord` (public). `CHANGELOG.md` section per release.
- The web repo's `deploy/compose.yaml` and `deploy/README.md` get the bot container (env without values).
- Manual: Nico adds the env in TrueNAS and sees the bot online in the real server.
- Done (PR #8, web PR #65). Built: `.github/workflows/release.yml` (a copy of the web's: the tag must be `v*` and on `main`; plus a check that `CHANGELOG.md` has `## <tag>`, and lint and tests before the image; pushes `:<tag>` and `:latest`, `linux/amd64`, `APP_VERSION` from the tag; a manual run rebuilds a tag), the version line at start, README "Releasing". Web: the `bot` service in `deploy/compose.yaml` (no ports, no volume, the image's own user, `stop_grace_period: 15s`, `SITE_URL` the public URL) and "The Discord bot" in `deploy/README.md`. Decisions (Nico, 2026-10-27): as proposed; no GitHub Release page, the image is the release; first tag `v0.1.0` only on Nico's go.

### BOT-08 Report the server's channels and roles
- Once the web's channels and roles story has its endpoint in `docs/BOT-API.md`: the bot reports the server's text channels and roles (ids and names) to the site at start and when they change, so the admin picks the posts channel, runs channel and mention role from a list instead of typing ids.
- Uses the `Guilds` intent BOT-02 already has; no new permission.
- Only what the endpoint documents (CLAUDE.md rule 10); logs counts, never names or ids.
- Done (PR #9). Built against web WEB-46 (`POST /api/bot/v1/guild`, BOT-API.md "Guild"): `src/core/guild.ts` (text and announcement channels the bot can view, send and embed in, in Discord's order; mentionable roles without @everyone and managed roles, highest first; the site's limits and clean names), `guild()` and `onGuildChange` in `src/adapters/discord.ts` (channel, role and server events of the `Guilds` intent), `src/app/guildReporter.ts` (on ready, resume and every change, bundled within 5 s; a `404` from an older site logged once and not retried until the next change; other failures with backoff). Decisions (Nico, 2026-10-27): as proposed. Known limit: a role given to the bot itself isn't seen until the next change or restart (GUILD_MEMBER_UPDATE needs the privileged members intent).

### BOT-10 The site's test post
- The admin's "Send a test post" on the site's Discord page (web WEB-39, BOT-API.md "test", `data.kind` `posts`) posts a short test message in the posts channel and acknowledges it like any event; also when milestones are off.
- Done (PR #10). Built: `testMessage` in `src/core/milestones.ts` (a gold "Test post" embed linking to the site's Discord page with the `#e<id>` marker, so a restart doesn't post it twice; markers now count on any link to the site), the `send` action in `decide`, posted on its own in `src/app/poster.ts` (never added to an open milestone post). Tests for other channels (`kind` other than `posts`) are left until their stories.
- Follow-up (Nico, 2026-10-27): the settings are read every 30 s instead of every 5 min, so a newly picked channel and the test post work at once (a test post waited up to 5 minutes).

### BOT-05 Weekly recap
- Needs the site's recap (web story: catalogue, rotation, card images).
- Posts the recap at the site's recap time (Sunday 13:00, Nico's time zone) as on the `bot-recap` board, text exactly as the site wrote it; `/recap` shows the last one to the asker only. A missed time (bot down) posts once when back, never twice.
- Decided with Nico (2026-10-28): the recap channel, else the posts channel; one message as on the board; the card images fetched with the bot token and attached; `/recap` for anyone in the server, ephemeral, no linked check; milestone card images (level 60, new character at 60, profession 300); a missed time needs nothing extra (the site keeps the event, the marker prevents a second post).
- Done (PR #18): `src/core/recap.ts` (`readRecap`, `recapMessage`, `recapFiles`), the `recap` event in `core/events.ts` and the poster (recap channel, images, markers read there too), `/recap` (`core/commands.ts`, `app/commands.ts`, `onCommand` in the Discord adapter, answers deferred ephemerally), `site.image` and `site.recapLatest`, milestone images (`hasCard`, `milestoneFiles`).

### BOT-06 Look-up commands
- Needs the site's lookup endpoints and Discord linking (web stories).
- `/whereis`, `/who`, `/whocancraft`, `/character` (autocomplete), `/alts`, `/me` as on the `bot-commands-runs` board (full character names); ephemeral with Share; "Link your Discord first" for unlinked users.
- Decided with Nico (2026-10-28): anyone in the server, only `/me` linked; the options and Share as in DESIGN-NOTES "Decisions"; "Plan a run with them" waits for BOT-04.
- Done (PR #19): `core/commands.ts` (seven commands with options and choices), `core/lookups.ts` (the answers as embeds), `app/lookups.ts` (the look-ups, autocomplete, Share with `SharedAnswers`), the Discord adapter's options, autocomplete and buttons, `site.lookup`. CLAUDE.md rule 6 now says commands answer anyone in the server, only `/me` needs a link.

### BOT-04 Planned runs
Decided with Nico, 2026-10-27 (the web repo's E7 has the whole flow; board `runs-flow`). Boards: `bot-posts-runs`, `bot-commands-runs`. Needs the web's WEB-38 (run events and actions), WEB-39 (time zones, settings) and WEB-40.
- **The run post** in the runs channel: organiser on their character, dungeon, Discord timestamp (each reader's own time and "in 3 hours"), level range, note, five role slots, "N in · N maybe · N open", who could fill an open slot, buttons I'm in / Maybe / Can't, Pick my character (a select menu of the asker's characters in range; the reply "You're in as Lia Thornwhisper (healer)" is ephemeral), Open run. **One message per run**, edited in every state: open, full (Maybe is next in line), starting soon, started (buttons removed but Open run), done ("Ran it · 3 of 5 signed-up came"), didn't happen, cancelled (by the organiser, or removed by the admin; sign-ups get a quiet notice).
- **Reminder** (the site's reminder time, default 30 min) and **Starting now** as new messages, mentioning only those who answered I'm in or Maybe; Starting now is always posted. A **ping from the game** ("Hey Jorrit, these people are waiting for you") when the organiser sends it (it arrives after their `/reload`).
- **Ask now from the game** (only when "Also post on Discord" was ticked): the post with "asked from the game · via /reload", answers in game and on Discord, expires 10 minutes after it was asked in game (buttons removed, "Expired").
- **Commands:** `/plan` (dungeon with autocomplete showing ranges and who it fits, day: Today, Tomorrow or a weekday in the next 7 days, time 24-hour, note; read in the asker's time zone from the site; confirmation with the Discord timestamp and "Lead with another character"; the time-passed reply with "Tomorrow" and "Ask now instead"), `/ask` (a run that starts now, expires after 10 min; says it can't whisper anyone in game), `/runs` (upcoming runs this week with your answers, only for you), `/run edit` and `/run cancel` (autocomplete lists only your own runs, the admin's lists all; "This run isn't yours" with Answer Can't). `/who`'s button becomes "Plan a run with them".
- Every answer and action goes to the site; posts are rebuilt from the site's state (rules 2 and 9).
- **Runs v2** (Nico, 2026-10-27; the web repo's WEB-47 and boards `runs-v2-*`): any character can join and the role is picked apart from it. Pick my character becomes character and role: a select of all the asker's characters with the fit tag ("fits", "+3 over", "carry · +21", "4 below"; a character 6+ below can only answer Maybe), then the roles the class can play. The post shows each sign-up's chosen role, marks carries "carry", and lists reserves (I'm in for a full role). An organiser's move (another role, reserve, removed) reaches the moved person as a quiet notice, never a channel ping. All from the site's optional fields in `docs/BOT-API.md` (WEB-47).
- Tests: the post in every state, the select menu, the time-passed and not-yours replies, edits instead of new posts, no double reminder after a restart.
- Decided with Nico (2026-10-28): asks from the game are posted without answer buttons (`/ask` and Discord answers follow with a web story); "Could fill" comes from a small web addition (`couldFill`, web PR #80); I'm in (and Pick my character) opens an ephemeral picker: the character select with fit tags (6+ below only Maybe), then the roles the class can play; one character answers at once; Maybe and Can't answer at once; the run's message is found by a marker in the post and an in-memory map rebuilt from the runs channel after a restart.
- Done (PR #22, web PR #80): `src/core/runs.ts` (the run read defensively, the post in every state: open, full, starting soon from the reminder time, started, done, didn't happen, cancelled by the organiser or removed by an admin; the reminder, Starting now, the ping, the ask from the game; the quiet notices for moved up, moved, a new time and cancelled), `src/core/runReplies.ts` (`/plan`'s confirmation and time-passed reply, "This run isn't yours", the picker, what an answer did, `/runs`, refusals in words, autocomplete choices), `src/app/runPosts.ts` (one message per run, edited; new messages marked with their event id; notices as direct messages), `src/app/runActions.ts` (`/plan`, `/runs`, `/run edit`, `/run cancel`, autocomplete, the buttons and the picker), the runs settings (`posts.runs`, `channels.runs`, `mentionRole`, `runs.reminderMinutes`), the site client's run calls with error codes, and the Discord adapter's direct messages, select menus, sub-commands and ephemeral replies to buttons. Web PR #80 adds `couldFill`, levels, classes and `outcome` to the run payload, `dayOffset` and `GET /api/bot/v1/plan`.
- Deviations approved by Nico (2026-10-28): slots three to a row (inline fields), reserves named as next in line on a full run. Runs go out in the runs channel also when no posts channel is set.
- Follow-ups: `/ask` and answering asks from Discord (a web story giving asks a model, then the bot); `/who`'s "Plan a run with them" (the look-ups, BOT-06's area).
- Manual (Nico, in Discord): pick the runs channel and the mention role on the site's Discord page; run `/plan` (the dungeon list shows who you would lead as, the days are in your calendar), see the post with the role mention, press I'm in on another account (picker, roles), Maybe and Can't; `/run edit` a time (the post updates, sign-ups get a notice), `/run cancel`; wait for the reminder and Starting now; "Send a test post" for runs.

### BOT-11 Class icons
Decided with Nico (2026-10-28): Discord can't colour text in an embed, so every character name in the bot's answers and posts gets a class icon before it, and the class written after it ("[icon] **Mira Sunstrider** · Mage"). The icons come from Claude Design (`docs/DESIGN-PROMPT-CLASS-ICONS.md`, canvas board "Discord bot · class icons") and are in `assets/class-icons/` (128×128 PNG with transparent background, SVG sources in `svg/`): a disc in the class colour with one glyph (Warrior shield, Paladin hammer, Hunter bow, Rogue daggers, Priest candle, Shaman totem, Mage arcane star, Warlock skull, Druid paw) and a thin night-blue ring that keeps Priest and Rogue visible on Discord's light theme.
- The bot owns them as **application emoji** (uploaded by the bot itself at start when missing or changed, so no server emoji slots and no manual upload), named `cf_warrior` … `cf_druid`.
- Used wherever a character name shows: look-ups (BOT-06), milestones (BOT-03), runs (BOT-04), recap (BOT-05). Without the emoji (upload failed) the name shows without icon, never a broken one.
- Tests: the class to emoji mapping for all 9, the fallback without emoji, the start-up sync (missing, changed, unchanged).
- Decided with Nico (2026-10-28): each emoji's name carries the first 6 hex of its picture's SHA-256 (`cf_mage_3fa9c1`), so a changed icon is uploaded again (the old one deleted after) and an unchanged one never; names only in an embed title or author line stay without icon, since Discord shows no custom emoji there.
- Done (PR #24): `src/core/classIcons.ts` (the nine classes and their files, `emojiName`, `syncPlan`, `icon`, `optionEmoji`), `src/app/classIcons.ts` (hashes the PNGs, reads the bot's application emoji, uploads what is missing or changed, deletes the older ones; never fatal), the Discord adapter's `emojis`, `createEmoji` and `deleteEmoji`, the icon before names in the look-ups, milestone lines and card embeds, the run post's slots, could fill, reserves, reminder, Starting now and ping, and the picker's options (the option's emoji). The image copies `assets/class-icons/*.png`.
- Not covered: the weekly recap's names are text the site wrote, without classes; icons there need the site to send the class per card (a web addition).
- Manual (Nico): after the deploy, the bot logs "class icons: 9 of 9 ready (9 uploaded)" once, and "(0 uploaded)" at later starts; the developer portal's Emojis page shows the nine `cf_` emoji; `/who` and a run post show the icons.

### BOT-12 /ask and answering asks
Needs the web's WEB-51 (asks on the site). Split from BOT-04 (Nico, 2026-10-28). Board `bot-posts-runs` (ask now) and `bot-commands-runs` (`/ask`).
- `/ask`: a run that starts now (dungeon with autocomplete, note); the asker's character and role as for `/plan`; says it can't whisper anyone in game. Posted in the runs channel like an ask from the game.
- The ask post (from the game or `/ask`) gets the answer buttons and Pick my character (character and role, BOT-04's picker), edited as answers come in, buttons removed and "Expired" after 10 minutes.
- Tests: `/ask`, answers before and after expiry, the expiry edit after a restart.
- Decided with Nico (2026-10-28, web WEB-51): an ask has no slots and no reserve; I'm in is in.
- Done (PR #25, web PR #83): `/ask` (dungeon with the `/plan` autocomplete, note; the asker on the site's suggested character), the ask post (`askMessage` in `src/core/runs.ts`: In, Maybe and Can't lists, the answer buttons and Pick my character while open, "Expired" without buttons after; the `#a<id>` marker), `askChanged` and `askExpired` (edits of the ask's post, found again after a restart), and the answer buttons and picker for asks (`ask:<id>:…`, BOT-04's replies through `askAsRun`). A site from before WEB-51 still gets the post without buttons.
- Manual (Nico, in Discord): `/ask` The Deadmines, answer from a second account with I'm in and Pick my character, see the post update, and after 10 minutes "Expired" without buttons.

### BOT-13 Run post layout and I'm in as the picker
- Nico (2026-10-28, after testing v0.2.0): the slots as lines in the embed, one per slot, instead of inline fields (3 + 2 didn't line up), keeping Could fill and the footer; I'm in opens the Pick my character flow (character with its fit tag, then the role) with the best fitting character preselected, the separate Pick my character button goes; Maybe and Can't stay one click; any level may say I'm in (web WEB-52, "recommend, never restrict").
- Done (PR #28, web PR #90): `runMessage` (slot lines), the run and ask posts without Pick my character, `pickerMessage` (the select with the site's first character preselected and its role buttons; another pick swaps them; a one-role class answers at once; "tough" for low and 6+ below). Posts from before keep their Pick my character button, which opens the same picker.

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
- Recap card icons, 2026-10-29 (board `bot-recap-v2-icons`, PR #41): the designer's 12 icons in `assets/recap-icons/`, synced as application emoji with the class icons (`RECAP_ICONS`), and `RECAP_CARD_ICONS` maps each new or changed card id of web WEB-57 to its icon (Big spender: the horse). The icon starts the card's first line (Nico); a card without one, or unknown, shows none. Manual: after the bot starts, the developer portal lists 24 emoji; the first recap with a WEB-57 card shows its icon.
- Kinds the bot doesn't know are still skipped and acknowledged. Tests for each kind's formatting, one and several feats.
- Decided with Nico (2026-10-28): the bot words each kind it knows from the fields, with the board's bold, and posts a kind it doesn't know with the site's `text` (skipped without one); the 5-minute grouping of BOT-09 stays, with a block per character and upload and one card per post (the first upload's `card`); the board's lines the site doesn't send ("First Doombringer to reach rank 6.", the joke under 1,000 kills) are left out; the epic item is bold and the border epic purple, since Discord can't colour text; the "recap card icons" are dropped (the recap shows the site's card texts, with no icons on the board either). See DESIGN-NOTES "Deviations".
- Done (PR #35): `src/core/feats.ts` (the sentence of one feat and the short line of several, per kind), `groupedMessage` in `src/core/milestones.ts` ("Feat unlocked" or "Feats unlocked · N", "had a big upload." for one character, the badge, the one card and its colour) and `readMilestones` (the new kinds, `text`, `firstInGroup`, `card`, the event's `card`). The contract says `firstEpic.item.level` is the level it was looted at, so the post says "looted at level 58" where the board says "item level 66".
- Manual (Nico, in Discord, once the site has WEB-56): an upload with one feat (e.g. a duel win milestone) gives "Feat unlocked" with its sentence; an upload with several gives "Feats unlocked · N" with one card; a second upload within 5 minutes is added to that post.

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
- Decided with Nico (2026-10-28): the boxes are the bot's own application emoji, uploaded at start with the class icons (✅ and ▢ until then); the site is asked for `yesterdayCrown` (shown when sent), a friend with nothing done gets "—" instead of the board's joke, and `withoutData` is "No Doomsday data yet: Sanne."; "My goals" answers with the `/doomsday` reply, built here, and BOT-16 adds the command.
- Done (PR #36): `src/core/doomsday.ts` (`readBoard`, `boardMessage`: the goals per track, a row per friend with a box per goal, the strike-through, the crown, "n / 5" and the points per track, the notes, "resets <t:…:R>", the buttons; the final with its summary and no buttons; `readLookup` and `doomsdayReply` for "My goals"), `src/app/doomsdayPosts.ts` (post, edit, the 30 s throttle with only the newest waiting update, posting again when the message is gone; "My goals"), the Doomsday settings and channel in the poster, and the box emoji in the icon sync. The board's marker is on its title link (`/doomsday#e<board event>`), so a restart finds it.
- Manual (Nico, in Discord, once the site has WEB-58): pick a Doomsday channel on the site; at the reset the board appears with open boxes; after an upload it is edited (at most every 30 s), with ~~struck~~ names and the crown; My goals answers only you; delete the post and upload again: a new post comes; the next reset edits it to "final".

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
- Decided with Nico (2026-10-28): the title takes the site's `label` ("week 44", asked of the site), else "Doomsday ladder" with "The week of <date>" in the text; the intro and the PvP Virgin line are fixed texts without facts ("Week 44 is done. Proud of the grind.", "Still pure. The Night Elves of Ashenvale send their thanks."); the recap section's crowns come once the site sends `crowns`, and "Full ladder" links to the site's Doomsday page, not `/doomsday`.
- Done (PR #37): `src/core/ladder.ts` (`readLadder`, `ladderMessage`, `readRecapDoomsday`, `recapDoomsdayField`), the `doomsdayLadder` event in the poster (the Doomsday channel, marked like any post), `/doomsday` and `/doom` (one command under two names, Discord has no aliases) in `src/app/lookups.ts` with BOT-15's `doomsdayReply`, Share and the friend autocomplete, and the section in `recapMessage` before the challenge.
- Manual (Nico, in Discord, once the site has WEB-58): `/doomsday` and `/doom` answer only you, `/doomsday friend:` fills in names and shows that friend's day, Share posts it; on Sunday at the reset the ladder post comes in the Doomsday channel; the next recap has the Doomsday section.

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
- Done (PR #39): `featsChannel` in `src/core/settings.ts`; the poster posts and groups feats in it and reads every other channel (recap, runs, Doomsday, feats) for markers in one loop; `src/core/samples.ts` (`testSample` per kind, from the real formatting with made-up data); `decide` answers `sample` for `feats`, `recap` and `doomsday`, and the plain test for any other kind.
- Manual (Nico, in Discord, once the site has WEB-58 part 2): pick a feats channel and press each test button on the Discord page; each sample appears once in its channel, titled "Test ·"; an upload's feats go to the feats channel.
