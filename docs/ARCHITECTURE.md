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
- Run actions (BOT-04, BOT-API.md "Run actions"): `GET plan` (the asker's time zone, `/plan`'s days in their calendar and who they would lead as), `GET`/`POST runs`, `GET`/`PATCH runs/<id>`, `POST runs/<id>/cancel`, `POST runs/<id>/answers`, `GET runs/<id>/characters`. The bot passes the Discord user on; the site checks every right and answers refusals with an `error` code the bot turns into words. Run posts are found again by the `#r<id>` marker on their link; the time-passed reply's "Tomorrow" button keeps its plan in memory for 15 minutes (at most 100).
- Doomsday (BOT-15, BOT-16, BOT-API.md "Doomsday"): events `doomsdayBoard` (posted in the Doomsday channel) and `doomsdayBoardUpdate` (an edit of that post, at most one per 30 s; only the newest waits), `doomsdayLadder`, and the look-up `doomsday` for "My goals" and `/doomsday`. The board's post is found again by the `#e<board event>` marker on its title link.
- Asks (BOT-12, web WEB-51, BOT-API.md "Asks"): `POST asks` (`/ask`), `GET asks/<id>`, `POST asks/<id>/answers`, `GET asks/<id>/characters`; events `askNow`, `askChanged` and `askExpired`. An ask's post is found again by the `#a<id>` marker on its link.
- `GET /api/bot/v1/cards/<id>.png`: generated card images (level 60, recap header, map crops), rendered by the site. The bot fetches each with its token and attaches it to the post (Discord can't fetch a URL that needs the token); a post goes out without an image the site can't give (BOT-05).
- `GET /api/bot/v1/recap/latest`: the last weekly recap, for `/recap` (BOT-05).
- `GET /api/bot/v1/lookup/<what>`: the look-up commands' data (BOT-06, web WEB-39b); `names` and `professions` feed the autocomplete. Answered for anyone in the server; only `me` needs the asker linked, and `doomsday` (BOT-16, `/doomsday` and `/doom`) when asked without a friend. Share keeps an answer in memory for 15 minutes (at most 100), then the button does nothing.

Polling every 30 s with backoff is enough for a friend group and needs no public endpoint on the bot.

## Class icons (BOT-11), Doomsday boxes (BOT-15) and recap card icons (BOT-14)

The class icons in `assets/class-icons/` (copied into the image) are the bot's own application emoji: at start it reads them (`GET /applications/<id>/emojis`), uploads each icon whose `cf_<class>_<hash>` name is missing and deletes its older `cf_` emoji after. Discord can't replace an emoji's picture, so the hash in the name is how a changed icon is noticed. Since BOT-15 the Doomsday board's three boxes (`box-pve`, `box-pvp`, `box-open`) are synced the same way, and the recap card icons in `assets/recap-icons/` (copied into the image too), mapped from the site's card ids. Until that is done, or when it fails, names show without icon and the board uses ✅ and ▢. The sync lives in `src/core/emoji.ts` and `src/app/emoji.ts` and logs `emoji: N of 24 ready`.

## Configuration (env, documented in `.env.example` without values)

| Variable | What |
|---|---|
| `DISCORD_TOKEN` | the bot token from the Discord developer portal |
| `DISCORD_APP_ID` | the application id, to register slash commands |
| `SITE_URL` | `https://wow.vestras.nl` (or `http://localhost:3000` in development) |
| `BOT_API_TOKEN` | the site's bot token |

Nico creates the Discord application and its token himself; secrets only go into the TrueNAS app's environment, never into chat or the repo.

## Hosting

A second container in the same TrueNAS Custom App as the website (`deploy/compose.yaml` in the web repo), reaching the site over the internal network or its public URL. It restarts on failure; on start it registers the slash commands (globally: one server, and the site's settings name none) and resumes from the site's cursor. It connects with the non-privileged `Guilds` intent only. Its health check needs no port: while connected the bot writes a heartbeat file every 15 s, and `node dist/app/health.js` calls it healthy when that is under a minute old. SIGTERM stops it gracefully (at most 10 s). Setting up the Discord application: `docs/DISCORD-SETUP.md`. Releases: a `v*` tag on `main` pushes the image (`.github/workflows/release.yml`, README "Releasing"); in the app it is the `bot` service, with `SITE_URL` the public URL because post links are built from it, and it logs its version at start.

## Privacy

Posts never show BattleTags or Discord IDs (CLAUDE.md rule 5). Logs contain event ids and counts, not message content, tokens or Discord user ids.
