# CommunitiesForever-Discord

**DoomBot**, a Discord bot for a small friend group playing World of Warcraft: Forever. Its data comes from the companion website ([CommunitiesForever-Web](https://github.com/nicoputten/CommunitiesForever-Web)), which reads uploads of the [CommunitiesForever](https://github.com/nicoputten/CommunitiesForever) addon. The site decides what happened; the bot formats it and posts it.

## What it does
- **Feats:** "Feat unlocked" posts after an upload: levels, level 60, profession caps, new characters, PvP ranks, honorable kills, the first epic, mounts and more, with the site's card images.
- **Doomsday:** the daily board of goals at each reset, edited as uploads come in; the weekly PvE and PvP ladder on Sunday; `/doomsday` (or `/doom`) for your own day or a friend's.
- **Planned runs and asks:** one post per run or ask that updates itself as friends answer with I'm in, Maybe or Can't; reminders; `/plan`, `/ask`, `/runs`, `/run edit`, `/run cancel`.
- **The weekly recap:** the site's recap of the week with its cards, awards, challenge and Doomsday section; `/recap` shows it again.
- **Look-ups:** `/whereis`, `/who`, `/whocancraft`, `/character`, `/alts` and `/me`. Answers are only for you; Share posts a copy.

Each kind of post has its own channel, set on the site's Discord page (the default channel otherwise). Posts never show BattleTags or Discord ids and never ping anyone.

## Docs
- `docs/ARCHITECTURE.md`: stack, layers, how the bot talks to the site and to Discord
- `docs/DISCORD-SETUP.md`: setting up the Discord application, the channels and the environment
- `docs/DESIGN-NOTES.md` and `design/README.md`: the design, its boards and the approved deviations
- `docs/STORIES.md` (open) and `docs/STORIES-COMPLETED.md` (done)
- `CHANGELOG.md`: what each release changed

## Development
Node 24 (`.nvmrc`).

```
npm ci
npm run lint      (ESLint, Prettier, tsc --noEmit)
npm test          (Vitest)
npm run build     (to dist/)
```

To run it against a site, copy `.env.example` to `.env` (git-ignored), fill in the four variables and run `node --env-file=.env dist/app/main.js`.

## Releasing
Only on Nico's go-ahead per tag: a tag is a deploy.
1. Merge `develop` into `main` (a PR).
2. On `main`, rename `## Unreleased` in `CHANGELOG.md` to `## vX.Y.Z (YYYY-MM-DD)` and start a new empty `## Unreleased` above it.
3. Tag that commit `vX.Y.Z` and push the tag. The Release workflow checks that the tag is on `main` and in `CHANGELOG.md`, runs lint and tests, and pushes `ghcr.io/nicoputten/communitiesforever-discord:vX.Y.Z` and `:latest`.
4. On TrueNAS set the `bot` service's `image:` to the new tag (web repo `deploy/README.md`, "The Discord bot"). The bot logs `version vX.Y.Z` at start.

Private fan project, not affiliated with Blizzard Entertainment or Discord. MIT licence.
