# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).

### BOT-04 Planned runs
Decided with Nico, 2026-10-27 (the web repo's E7 has the whole flow; board `runs-flow`). Boards: `bot-posts-runs`, `bot-commands-runs`. Needs the web's WEB-38 (run events and actions), WEB-39 (time zones, settings) and WEB-40.
- **The run post** in the runs channel: organiser on their character, dungeon, Discord timestamp (each reader's own time and "in 3 hours"), level range, note, five role slots, "N in · N maybe · N open", who could fill an open slot, buttons I'm in / Maybe / Can't, Pick my character (a select menu of the asker's characters in range; the reply "You're in as Lia Thornwhisper (healer)" is ephemeral), Open run. **One message per run**, edited in every state: open, full (Maybe is next in line), starting soon, started (buttons removed but Open run), done ("Ran it · 3 of 5 signed-up came"), didn't happen, cancelled (by the organiser, or removed by the admin; sign-ups get a quiet notice).
- **Reminder** (the site's reminder time, default 30 min) and **Starting now** as new messages, mentioning only those who answered I'm in or Maybe; Starting now is always posted. A **ping from the game** ("Hey Jorrit, these people are waiting for you") when the organiser sends it (it arrives after their `/reload`).
- **Ask now from the game** (only when "Also post on Discord" was ticked): the post with "asked from the game · via /reload", answers in game and on Discord, expires 10 minutes after it was asked in game (buttons removed, "Expired").
- **Commands:** `/plan` (dungeon with autocomplete showing ranges and who it fits, day: Today, Tomorrow or a weekday in the next 7 days, time 24-hour, note; read in the asker's time zone from the site; confirmation with the Discord timestamp and "Lead with another character"; the time-passed reply with "Tomorrow" and "Ask now instead"), `/ask` (a run that starts now, expires after 10 min; says it can't whisper anyone in game), `/runs` (upcoming runs this week with your answers, only for you), `/run edit` and `/run cancel` (autocomplete lists only your own runs, the admin's lists all; "This run isn't yours" with Answer Can't). `/who`'s button becomes "Plan a run with them".
- Every answer and action goes to the site; posts are rebuilt from the site's state (rules 2 and 9).
- **Runs v2** (Nico, 2026-10-27; the web repo's WEB-47 and boards `runs-v2-*`): any character can join and the role is picked apart from it. Pick my character becomes character and role: a select of all the asker's characters with the fit tag ("fits", "+3 over", "carry · +21", "4 below"; a character 6+ below can only answer Maybe), then the roles the class can play. The post shows each sign-up's chosen role, marks carries "carry", and lists reserves (I'm in for a full role). An organiser's move (another role, reserve, removed) reaches the moved person as a quiet notice, never a channel ping. All from the site's optional fields in `docs/BOT-API.md` (WEB-47).
- Tests: the post in every state, the select menu, the time-passed and not-yours replies, edits instead of new posts, no double reminder after a restart.

### BOT-06 Look-up commands
- Needs the site's lookup endpoints and Discord linking (web stories).
- `/whereis`, `/who`, `/whocancraft`, `/character` (autocomplete), `/alts`, `/me` as on the `bot-commands-runs` board (full character names); ephemeral with Share; "Link your Discord first" for unlinked users.

### BOT-11 Class icons
Decided with Nico (2026-10-28): Discord can't colour text in an embed, so every character name in the bot's answers and posts gets a class icon before it, and the class written after it ("[icon] **Mira Sunstrider** · Mage"). The icons come from Claude Design (`docs/DESIGN-PROMPT-CLASS-ICONS.md`); the story waits for the 9 PNGs.
- The 9 icons (128×128 PNG) in `assets/class-icons/`, and their board in `design/boards/class-icons/`.
- The bot owns them as **application emoji** (uploaded by the bot itself at start when missing or changed, so no server emoji slots and no manual upload), named `cf_warrior` … `cf_druid`.
- Used wherever a character name shows: look-ups (BOT-06), milestones (BOT-03), runs (BOT-04), recap (BOT-05). Without the emoji (upload failed) the name shows without icon, never a broken one.
- Tests: the class to emoji mapping for all 9, the fallback without emoji, the start-up sync (missing, changed, unchanged).
