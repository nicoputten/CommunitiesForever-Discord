# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Open: BOT-19 (2026-10-29, for v0.3.1).

### BOT-19 Test posts use the channel just picked
Agreed with Nico, 2026-10-29: a bug fix for v0.3.1.
- **What Nico saw:** on the site's Discord page he changed the Feats channel, then clicked "Send a test feat". The test landed in the old channel.
- **Cause:** the poster reads the settings again only every 30 s (`SETTINGS_EVERY_MS` in `src/app/poster.ts`), while the test event arrives at once.
- **Fix:**
  - Before handling a `test` event (every kind: posts, feats, recap, doomsday, and any other kind), the poster reads the settings from the site again, then posts.
  - When a channel changed, the round starts again, so the new channel is read for the bot's markers before anything is posted there (rule 9). The test comes again, since it isn't acknowledged yet.
  - If the read fails, the poster uses the settings it has and logs it.
  - Other events keep the 30 s refresh.
- **Tests:**
  - a test right after a channel change posts in the new channel
  - a failed read falls back to the settings it had, with a log line
  - other events cause no extra read
- **Manual (Nico, in Discord):** change the Feats channel on the site, press "Send a test feat" at once, and the sample lands in the new channel.
