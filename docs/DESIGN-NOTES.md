# Design notes

The bot follows the web's "Night over Azeroth" design system: tokens, class colours and the data age scale come from the web repo's `docs/DESIGN.md` (§3, §4). The bot's screens are the boards in `design/boards/` (index: `design/README.md`); the design canvas's §12 "Discord bot" is summarised here. This file holds what is specific to the bot.

## From the design (§12)

**Look:** rich embeds with the gold border (`#D4AF6A`, class colour where a post is about one character), the bot named after the community ("Doombringers", from the site's data, never hardcoded) with the BOT tag, generated card images for big moments and map crops. Every post links to the website.

**Automatic posts** (one channel, set on the site)
- *Milestones* (board `bot-posts`, part 1): every 10 levels, level 60 (with a generated card), a profession at its cap, a new character. Several from one upload are grouped into one message. They arrive after an upload.
- *Group asks* (board `bot-posts`, part 2): from the addon ("Ask who's up for it"), the site or `/ask`. Dungeon, time, level range, five role slots, "N in · N maybe" and healers in range; buttons I'm in / Maybe / Can't tonight / Pick my character. The message updates itself. Asks made in the game reach Discord after the next save and upload; answers reach the game after the friend's next upload or sync.
- *Weekly recap* (board `bot-recap`, Sunday 13:00 in the admin's time zone, see Deviations): headline (10 templates) · 4 core numbers · Doombringer of the week · 4 rotating cards (one stat, one progress, one social, one fun) · weekly challenge (12 templates). Header image: the week's busiest zone or the award winner's portrait.

**Recap rotation:** a card is eligible only if its threshold is met and it wasn't used in the last 4 weeks; highest interest score per slot; ties broken with the week number as seed, so re-runs are identical; at most one card per friend; quiet weeks get a short recap. The catalogue of 48 cards (A1–A10 awards, S1–S12 stats, P1–P13 progress, F1–F13 social and fun) is on the `bot-recap` board. The site computes the recap (ARCHITECTURE.md), the bot posts it.

**Commands** (board `bot-commands`; only for friends who linked Discord on the site; answers ephemeral with a Share button): `/whereis` (friend or character: last known zones, map crop, age), `/who` (level range, role, class, online recently; button to start a group ask), `/whocancraft` (profession, later item: who, skill, best crafter starred), `/character` (name with autocomplete: card with stats, professions, last seen), `/alts` (a friend's characters), `/me` (your characters and your week), `/ask` (dungeon, time), `/recap` (last recap again, only for you). Not linked: the "Link your Discord first" card with a link to the site.

**Site** (web stories, not this repo): a "Discord" page with your link status (link and unlink); for the admin: toggles per post type, channel, recap time, mention role, test post, recap preview and the list of linked friends. Posts never show BattleTags.

## Open questions (to settle in the stories)

- **Data the addon may not record yet:** roles are recorded (addon CF-18: from talents, or set by the player); dungeon runs and "evenings together" for the recap, shared quests, "online recently". Each card or field without data is left out or waits for an addon story; to be checked against the addon's `docs/ARCHITECTURE.md` per story.
- ~~Group asks from the game.~~ Settled: the addon stores asks, plans, answers and pings for the site (addon CF-47, CF-48; web WEB-43).
- ~~No board for the site's Discord page.~~ Exported: the web repo's `discord-settings` and `discord-settings-runs`.
- **Map crops and card images** are rendered by the site; the map art is CC BY-SA 4.0 (Syrio, Wikimedia Commons, adapted), so images that show it need the attribution.

## Decisions

- Repo, stack, data flow and hosting: the proposals of 2026-10-27, approved by Nico (see `docs/ARCHITECTURE.md`).
- Recap text (Nico, 2026-10-27): the site writes it from templates, several phrasings per card, headline and challenge; a phrasing isn't used again until all of that card's phrasings were used. No pronouns anywhere. Details in the web repo's WEB-41.
- Milestones from uploads within 5 minutes of a post are added to that post by editing it, up to 10 per post (Nico, 2026-10-27, BOT-09): a group session that ends together gives one post, not one per friend. Discord marks the post "(edited)".
- Weekly recap (Nico, 2026-10-28, BOT-05): posted in the recap channel set on the site (the posts channel when none is set), texts exactly as the site wrote them, the header image on top and the Zone of the week map with that card. `/recap` answers anyone in the server, only to them, without the linked check, now and after WEB-39b: only friends can read that channel, so linking doesn't matter for it.
- Milestone card images (Nico, 2026-10-28, BOT-05): level 60, a new character at 60 and a profession at 300 get their own embed with the site's card image. When a later upload is added to the post by editing (BOT-09), the earlier images stay; the added milestones go without one.
- Planned runs replace the group ask of `bot-posts` (Nico, 2026-10-27): boards `bot-posts-runs`, `bot-commands-runs`, `runs-flow` (from `docs/DESIGN-PROMPT-PLANNED-RUNS.md`). A separate runs channel; one message per run, edited per state; reminders mention only I'm in and Maybe; `/plan` times in the asker's time zone from the site; `/ask` can't whisper in game. One admin: the boards' "Admins: Nico, Mira" (web) is not built.

## Deviations

Approved departures from the boards (CLAUDE.md rule 8). Only Nico approves one; add it here in the PR that builds it.

| Date | What | Why | Approved |
|---|---|---|---|
| 2026-10-27 | Weekly recap on Sunday 13:00 in the admin's time zone (stored in UTC), not the board's Sunday 20:00 | Nico's choice | Nico |
| 2026-10-27 | Milestone posts show only what the site's event carries (name, owner, level, class, profession and rank); the board's extra lines ("The first Doombringer at max level", "Took 5 weeks · 3rd character to 40+", "Mount time. Scarlet Monastery now fits …", "Next step: an Artisan trainer", "first seen in Durotar") wait until the site sends them | The bot computes no game facts (CLAUDE.md rule 2) | Nico |
| 2026-10-27 | No Discord mention of the owner under a milestone ("Mira · @mira" is "Mira") | The event has no Discord id, and posts carry none (rule 5) | Nico |
| 2026-10-27 | The bot is called **DoomBot** (set in the developer portal), not the community's name | Nico's choice | Nico |
| 2026-10-27 | No pronouns in any text: "Somebody pay a visit." instead of the board's "Somebody visit her." | We never infer pronouns | Nico |
