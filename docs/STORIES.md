# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order: BOT-01, BOT-02, then per feature once its web story is merged: BOT-03 (milestones), BOT-06 (commands), BOT-04 (asks), BOT-05 (recap), then BOT-07.

### BOT-01 Repo skeleton and CI
- Node 24 (`.nvmrc`), TypeScript, ESLint, Prettier, Vitest as in the web repo; `src/core`, `src/adapters`, `src/app` with an ESLint rule that `core` imports nothing from the others or from discord.js and Node.
- CI on every push and PR: lint, test, build, Docker image build (not pushed), gitleaks over the full history. Dependabot for npm and GitHub Actions (grouped minor and patch, weekly).
- `.env.example` with the four variables of `docs/ARCHITECTURE.md`, no values. `Dockerfile` (non-root, no secrets, `.dockerignore` as an allow-list).
- Done when: CI is green on an empty bot that starts, logs "no token" and exits cleanly without env.

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

### BOT-04 Group asks
- Needs the site's asks (web story) and, for asks from the game, the addon story.
- Posts an ask as on the `bot-posts` board (part 2), updates it on every answer, buttons I'm in / Maybe / Can't tonight / Pick my character (a select menu of the friend's characters that fit), `/ask` (dungeon with autocomplete, time).
- Answers go to the site, which keeps the state; the message is rebuilt from the site's state.
- Open: roles per character (see `docs/DESIGN-NOTES.md`).

### BOT-05 Weekly recap
- Needs the site's recap (web story: catalogue, rotation, card images).
- Posts the recap at the site's recap time as on the `bot-recap` board; `/recap` shows the last one to the asker only. A missed time (bot down) posts once when back, never twice.

### BOT-06 Look-up commands
- Needs the site's lookup endpoints and Discord linking (web stories).
- `/whereis`, `/who`, `/whocancraft`, `/character` (autocomplete), `/alts`, `/me` as on the `bot-commands` board; ephemeral with Share; "Link your Discord first" for unlinked users.

### BOT-07 Release and deploy
- Release workflow: a `v*` tag on `main` pushes `ghcr.io/nicoputten/communitiesforever-discord` (public). `CHANGELOG.md` section per release.
- The web repo's `deploy/compose.yaml` and `deploy/README.md` get the bot container (env without values).
- Manual: Nico adds the env in TrueNAS and sees the bot online in the real server.
