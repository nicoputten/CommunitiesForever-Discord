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
