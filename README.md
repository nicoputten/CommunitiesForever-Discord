# CommunitiesForever-Discord

A Discord bot for a small friend group playing World of Warcraft: Forever. It posts milestones, group asks and a weekly recap, and answers look-up commands such as `/whereis` and `/whocancraft`. Its data comes from the companion website ([CommunitiesForever-Web](https://github.com/nicoputten/CommunitiesForever-Web)), which reads uploads of the [CommunitiesForever](https://github.com/nicoputten/CommunitiesForever) addon.

Work in progress: see `docs/STORIES.md`.

## Releasing
Only on Nico's go-ahead per tag: a tag is a deploy.
1. Merge `develop` into `main` (a PR).
2. On `main`, rename `## Unreleased` in `CHANGELOG.md` to `## vX.Y.Z (YYYY-MM-DD)` and start a new empty `## Unreleased` above it.
3. Tag that commit `vX.Y.Z` and push the tag. The Release workflow checks that the tag is on `main` and in `CHANGELOG.md`, runs lint and tests, and pushes `ghcr.io/nicoputten/communitiesforever-discord:vX.Y.Z` and `:latest`.
4. After the first release only: make the GHCR package public (github.com → Packages → `communitiesforever-discord` → Package settings → Change visibility).
5. On TrueNAS set the `bot` service's `image:` to the new tag (web repo `deploy/README.md`, "The Discord bot"). The bot logs `version vX.Y.Z` at start.

Setting up the Discord application: `docs/DISCORD-SETUP.md`.

Private fan project, not affiliated with Blizzard Entertainment or Discord. MIT licence.
