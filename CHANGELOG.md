# Changelog

## Unreleased
- The bot connects to Discord (no privileged intents), registers its slash commands, reconnects by itself, checks its site token, stops gracefully on `docker stop`, and has a container health check. `docs/DISCORD-SETUP.md` explains setting up the Discord application and inviting the bot.
- The bot's skeleton: an empty bot that checks its configuration (and says "no token" without one), a Docker image running as a non-root user, CI with lint, tests, build, image build and the secret scan, and weekly Dependabot updates.
