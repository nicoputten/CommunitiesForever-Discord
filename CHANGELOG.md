# Changelog

## Unreleased

## v0.1.0 (2026-10-27)
- The bot reads the site's settings every 30 seconds instead of every 5 minutes, so a newly picked channel and a test post work at once.
- "Send a test post" on the site's Discord page now posts a test message in the posts channel.
- The bot tells the site the server's channels and mentionable roles, so the admin picks the posts channel and the run mention role from a list.
- Releases: a `v*` tag on `main` publishes the bot's image; the bot logs its version at start. The web repo's `deploy/compose.yaml` runs it next to the site.
- Milestones from uploads within 5 minutes of a post are added to that post, so friends logging off together give one post instead of several.
- Milestone posts: after an upload the bot posts its milestones (every 10 levels, level 60, a profession at its cap, a new character) in one message in the posts channel set on the site, each once, also after a restart.
- The bot connects to Discord (no privileged intents), registers its slash commands, reconnects by itself, checks its site token, stops gracefully on `docker stop`, and has a container health check. `docs/DISCORD-SETUP.md` explains setting up the Discord application and inviting the bot.
- The bot's skeleton: an empty bot that checks its configuration (and says "no token" without one), a Docker image running as a non-root user, CI with lint, tests, build, image build and the secret scan, and weekly Dependabot updates.
