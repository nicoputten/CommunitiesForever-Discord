# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order: BOT-02, then per feature once its web story is merged: BOT-03 (milestones, WEB-38), BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40 and WEB-43), BOT-05 (recap, WEB-41), then BOT-07.

### BOT-02 Discord application and connection
- A guide in `docs/DISCORD-SETUP.md` for Nico: create the application and bot in the Discord developer portal, which intents (none privileged if possible) and permissions (send messages, embed links, attach files, use application commands), the invite link, where the token goes (TrueNAS env only).
- The bot connects, registers the slash commands for the guild set on the site (or globally), reconnects on failures and shuts down gracefully on SIGTERM.
- Health: a log line per state change; the container's health check shows connected or not.
- Manual: Nico invites the bot to a test server and sees it online.

### BOT-03 Milestone posts
- Needs WEB-38 (bot API, events) and the site's milestone events.
- Polls `events`, posts milestones as on the `bot-posts` board (part 1): one message per upload with all its milestones, level 60 with the generated card, "Open character" link. Acknowledges each event (rule 9); no double posts after a restart.
- Respects the site's settings (channel, milestones on or off, mention role).
- Tests: core formatting for every milestone kind and the grouped message; the poll loop with a fake site and a fake Discord (restart, outage, ack failure).

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

### BOT-07 Release and deploy
- Release workflow: a `v*` tag on `main` pushes `ghcr.io/nicoputten/communitiesforever-discord` (public). `CHANGELOG.md` section per release.
- The web repo's `deploy/compose.yaml` and `deploy/README.md` get the bot container (env without values).
- Manual: Nico adds the env in TrueNAS and sees the bot online in the real server.
