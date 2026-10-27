# Architecture

## Overview

```
addon ──upload──▶ website (wow.vestras.nl) ◀──bot API (HTTPS, Bearer)── bot ◀──gateway (WebSocket)──▶ Discord
                  data, milestones, asks,                                formats and posts
                  recap, card images, links
```

- **The site owns everything:** game data, which milestones an upload produced, group asks and their answers, the weekly recap (cards and rotation), generated card images, Discord links (Discord user ↔ BattleTag) and the bot settings (channel, post types, recap time, mention role). Its admin page edits the settings.
- **The bot** keeps one gateway connection to Discord, polls the site for new events, posts them, handles slash commands and button presses by asking the site, and acknowledges what it posted. It needs no inbound port and no volume.
- Why this split: the data has two readers already (addon and web); a third would drift. Recap rotation must be repeatable, and a re-run must give the same recap: one place computes it.

## Stack (proposal approved 2026-10-27)

| Part | Choice |
|---|---|
| Runtime | Node 24 (LTS), TypeScript ~6.0, ES modules |
| Discord | `discord.js` v14 (gateway, slash commands, buttons, embeds, attachments) |
| Tests | Vitest (core fully unit tested; adapters with fakes) |
| Lint and format | ESLint 9 + typescript-eslint, Prettier (same configs as the web repo) |
| Container | Docker image `ghcr.io/nicoputten/communitiesforever-discord` (public, no secrets inside) |
| CI | GitHub Actions: lint, test, build, image build, gitleaks secret scan |
| Updates | Dependabot for npm and GitHub Actions, as in the web repo (WEB-37) |

Dependencies beyond this list: ask first (CLAUDE.md rule 12).

## Layers

```
src/
  core/        pure TypeScript: site data → message content (embeds, components, text), ask state → message, command options → site query
  adapters/    discord.ts (gateway, commands, buttons), site.ts (bot API client), clock.ts (scheduler)
  app/         wiring: config from env, the poll loop, command and button routing, graceful shutdown
```

## Talking to the site

The contract lives in the web repo (`docs/BOT-API.md`, made by WEB-38). Shape as proposed:

- `Authorization: Bearer <BOT_API_TOKEN>`: one bot token, set on the site by the admin and in the bot's env.
- `GET /api/bot/v1/settings`: channel, enabled post types, mention role, recap time.
- `GET /api/bot/v1/events?after=<cursor>`: new milestones, asks, ask updates and recaps, oldest first, each with an id. `POST /api/bot/v1/events/<id>/posted` with the Discord message id acknowledges one (rule 9).
- `GET /api/bot/v1/lookup/...`: answers for the commands, for a Discord user id (the site checks the link).
- `POST /api/bot/v1/asks`, `POST /api/bot/v1/asks/<id>/answers`: `/ask` and the ask buttons.
- `GET /api/bot/v1/cards/<id>.png`: generated card images (level 60, recap header, map crops), rendered by the site.

Polling every 30 s with backoff is enough for a friend group and needs no public endpoint on the bot.

## Configuration (env, documented in `.env.example` without values)

| Variable | What |
|---|---|
| `DISCORD_TOKEN` | the bot token from the Discord developer portal |
| `DISCORD_APP_ID` | the application id, to register slash commands |
| `SITE_URL` | `https://wow.vestras.nl` (or `http://localhost:3000` in development) |
| `BOT_API_TOKEN` | the site's bot token |

Nico creates the Discord application and its token himself; secrets only go into the TrueNAS app's environment, never into chat or the repo.

## Hosting

A second container in the same TrueNAS Custom App as the website (`deploy/compose.yaml` in the web repo), reaching the site over the internal network or its public URL. It restarts on failure; on start it registers the slash commands and resumes from the site's cursor.

## Privacy

Posts never show BattleTags or Discord IDs (CLAUDE.md rule 5). Logs contain event ids and counts, not message content, tokens or Discord user ids.
