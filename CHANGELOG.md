# Changelog

## Unreleased
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
