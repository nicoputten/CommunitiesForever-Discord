# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40 and WEB-43), BOT-05 (recap, WEB-41), BOT-08 (channels and roles, after the web's guild channels and roles story).

### BOT-04 Planned runs
Decided with Nico, 2026-10-27 (the web repo's E7 has the whole flow; board `runs-flow`). Boards: `bot-posts-runs`, `bot-commands-runs`. Needs the web's WEB-38 (run events and actions), WEB-39 (time zones, settings) and WEB-40.
- **The run post** in the runs channel: organiser on their character, dungeon, Discord timestamp (each reader's own time and "in 3 hours"), level range, note, five role slots, "N in · N maybe · N open", who could fill an open slot, buttons I'm in / Maybe / Can't, Pick my character (a select menu of the asker's characters in range; the reply "You're in as Lia Thornwhisper (healer)" is ephemeral), Open run. **One message per run**, edited in every state: open, full (Maybe is next in line), starting soon, started (buttons removed but Open run), done ("Ran it · 3 of 5 signed-up came"), didn't happen, cancelled (by the organiser, or removed by the admin; sign-ups get a quiet notice).
- **Reminder** (the site's reminder time, default 30 min) and **Starting now** as new messages, mentioning only those who answered I'm in or Maybe; Starting now is always posted. A **ping from the game** ("Hey Jorrit, these people are waiting for you") when the organiser sends it (it arrives after their `/reload`).
- **Ask now from the game** (only when "Also post on Discord" was ticked): the post with "asked from the game · via /reload", answers in game and on Discord, expires 10 minutes after it was asked in game (buttons removed, "Expired").
- **Commands:** `/plan` (dungeon with autocomplete showing ranges and who it fits, day: Today, Tomorrow or a weekday in the next 7 days, time 24-hour, note; read in the asker's time zone from the site; confirmation with the Discord timestamp and "Lead with another character"; the time-passed reply with "Tomorrow" and "Ask now instead"), `/ask` (a run that starts now, expires after 10 min; says it can't whisper anyone in game), `/runs` (upcoming runs this week with your answers, only for you), `/run edit` and `/run cancel` (autocomplete lists only your own runs, the admin's lists all; "This run isn't yours" with Answer Can't). `/who`'s button becomes "Plan a run with them".
- Every answer and action goes to the site; posts are rebuilt from the site's state (rules 2 and 9).
- Tests: the post in every state, the select menu, the time-passed and not-yours replies, edits instead of new posts, no double reminder after a restart.

### BOT-05 Weekly recap
- Needs the site's recap (web story: catalogue, rotation, card images).
- Posts the recap at the site's recap time (Sunday 13:00, Nico's time zone) as on the `bot-recap` board, text exactly as the site wrote it; `/recap` shows the last one to the asker only. A missed time (bot down) posts once when back, never twice.

### BOT-06 Look-up commands
- Needs the site's lookup endpoints and Discord linking (web stories).
- `/whereis`, `/who`, `/whocancraft`, `/character` (autocomplete), `/alts`, `/me` as on the `bot-commands-runs` board (full character names); ephemeral with Share; "Link your Discord first" for unlinked users.

### BOT-08 Report the server's channels and roles
- Once the web's channels and roles story has its endpoint in `docs/BOT-API.md`: the bot reports the server's text channels and roles (ids and names) to the site at start and when they change, so the admin picks the posts channel, runs channel and mention role from a list instead of typing ids.
- Uses the `Guilds` intent BOT-02 already has; no new permission.
- Only what the endpoint documents (CLAUDE.md rule 10); logs counts, never names or ids.
