# CommunitiesForever-Discord

A Discord bot for a small friend group playing **World of Warcraft: Forever**. It posts milestones, group asks and a weekly recap into the group's Discord channel, and answers look-up commands (`/whereis`, `/who`, `/whocancraft`, ...). All data comes from the companion website [CommunitiesForever-Web](https://github.com/nicoputten/CommunitiesForever-Web) (`wow.vestras.nl`), which gets it from uploads of the [CommunitiesForever](https://github.com/nicoputten/CommunitiesForever) addon. **This repo is public.**

## Read first
- `docs/ARCHITECTURE.md`: stack, layering, how the bot talks to the site and to Discord
- `docs/STORIES.md`: open stories with acceptance criteria, in build order (done ones: `docs/STORIES-COMPLETED.md`)
- `docs/DESIGN-NOTES.md`: the bot's design (posts, asks, recap, commands), decisions and deviations
- `design/boards/`: the design boards (index: `design/README.md`). Binding, see rules 7 and 8.
- The web repo's `docs/DESIGN.md` (tokens, data age scale) and `docs/BOT-API.md` (the contract with the site, made in the web repo)

## Hard rules
1. **Nothing private, ever. This repo is public.** Treat everything committed as public forever, history included: code, docs, fixtures, screenshots, commit messages, PR texts. Never commit secrets (Discord bot token, the site's bot token, keys, passwords, `.env` files, webhook URLs), real BattleTags, Discord IDs (users, guilds, channels, roles) or usernames, real uploads or site answers, names of real people beyond what Nico agreed to, IP addresses, NAS details or local paths with user names. Configuration via environment variables, documented in `.env.example` without values. Tests and docs use made-up values (`Name#1234`, `Ada#1001`, IDs like `100000000000000001`). When in doubt, ask Nico before committing. If something private lands anyway, stop and tell Nico; rewriting history is his call. CI scans every push for secrets (gitleaks).
2. **The site is the only source of data.** The bot reads everything through the site's bot API (`/api/bot/v1/`) and stores no game data. It never reads SavedVariables or the site's database, and never computes game facts itself (who fits a dungeon, recap cards, milestones): the site decides, the bot formats and posts.
3. `src/core/*` is pure TypeScript: no discord.js, no Node APIs, no network, no clock. All input via function arguments (the time too). It turns site data into message content (embeds, buttons, text) and is fully unit tested with Vitest.
4. `src/adapters/*` (Discord gateway, site client, scheduler) are thin, with no business logic.
5. **Posts never show BattleTags** or Discord IDs. Friends appear by display name and characters by full name. GUID is the character key; never parse or split character names (only exception: initials on a class disc, as on the site).
6. **Commands answer only linked friends** (the site maps a Discord user to a BattleTag) and answer only to the asker (ephemeral), unless the asker presses Share. Everyone else gets the "Link your Discord first" card.
7. **Always follow the design.** Posts, cards and commands match their board in `design/boards/` and use the web's tokens (gold `#D4AF6A` embed border, class colours, data age scale). The boards are a visual reference only: never copy their markup or runtime.
8. **Deviating from the design only when Nico says so.** Ask first; an approved deviation goes into `docs/DESIGN-NOTES.md` "Deviations" (what, why, date) in the same PR.
9. **Every event is posted once.** Milestones, asks and recaps have an id from the site; the bot acknowledges each one to the site after posting and survives restarts and Discord outages without double or lost posts.
10. **Backwards compatible with the site's bot API.** Use only `/api/bot/v1/` fields documented in the web repo's `docs/BOT-API.md`; code reading site answers handles missing fields (undefined) everywhere, because the site and the bot update on different days.
11. English strings, hardcoded. No localization system.
12. No dependencies beyond those listed in `docs/ARCHITECTURE.md` without asking.

## Commands
Node 24 (`.nvmrc`). `npm ci` installs; `npm run lint` (ESLint, Prettier, `tsc --noEmit`), `npm test` (Vitest), `npm run build` (to `dist/`), `npm start` runs the built bot (env from `.env.example`), `npm run format` fixes formatting.

## Branches
Gitflow: `feature/bot-XX-<slug>` off `develop`, PRs into `develop`. `main` receives releases.

## Releases
A tag `v*` on `main` builds and pushes the image `ghcr.io/nicoputten/communitiesforever-discord`. Pushing a tag is public: only on Nico's explicit go-ahead per tag. `CHANGELOG.md` has an `## Unreleased` section that every user-facing PR updates.

## Definition of done (per story)
- All acceptance criteria met
- Lint, tests and build pass in CI, including the secret scan
- Manual steps (in Discord) written in the story for Nico to run

## Working with Nico
- Experienced software developer. Be technical and concise.
- Ask clarifying questions before assuming anything ambiguous. He strongly prefers questions over rework.
- One story per branch and PR. Conventional commits.
- Never ask Nico to paste a token or secret into chat.
