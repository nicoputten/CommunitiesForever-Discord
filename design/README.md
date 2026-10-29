# Design boards

Exports from the Claude Design canvas "Doombringers — wow.vestras.nl design", §12 "Discord bot". Binding for the bot (CLAUDE.md rules 7 and 8); a visual reference only, never copied. Serve a folder (`python -m http.server`) and open its `.dc.html`.

| Folder | Board | Shows |
|---|---|---|
| `boards/bot-posts/` | BotPosts | Milestones (level 60 card, grouped milestones) and a group ask with buttons |
| `boards/bot-recap/` | BotRecap | The weekly recap, the 48-card catalogue, rotation rules and 10 example weeks |
| `boards/bot-commands/` | BotCommands | `/whereis`, `/whocancraft`, `/who`, `/character`, `/alts`, `/me`, the not-linked card and the command table |
| `boards/bot-posts-runs/` | BotPosts · runs | Planned runs in #doombringers-runs: the run post in every state, Pick my character, reminder, starting now, a ping from the game, ask now from the game (a copy of `bot-posts`; milestones there are unchanged) |
| `boards/bot-commands-runs/` | BotCommands · runs | The commands with `/plan`, `/ask` (a run that starts now), `/runs`, `/run edit`, `/run cancel`, full character names (a copy of `bot-commands`) |
| `boards/runs-flow/` | RunsFlow | Planned runs across game, uploader, site and Discord: where a /reload is needed and the delays |
| `boards/bot-doomsday-daily/` | DD09DiscordDaily | The daily Doomsday board post: fresh at the reset, edited at midday, final at the end of the day; names struck through, the crown (BOT-15) |
| `boards/bot-doomsday-weekly/` | DD10DiscordWeekly | The weekly Doomsday ladder post (PvP and PvE top 5, duel champion, battlegrounds apart, PvP Virgin of the week) and the ephemeral `/doomsday` reply (BOT-16) |
| `boards/bot-doomsday-feats/` | DD11DiscordFeats | "Feat unlocked" posts: one feat with a card, four feats from one upload with First in the group, a feat without a card; and the recap's Doomsday section (BOT-14, BOT-16) |
| `boards/bot-recap-doomsday/` | BotRecap · Doomsday | A copy of `bot-recap` with the Doomsday section added (BOT-16) |
| `boards/bot-recap-v2/` | BotRecap · recap v2 | The weekly recap with the recap v2 cards: the full PvP-week sample ("Blood in Stranglethorn", Warmonger, Bloodbath zone with map crop, Rank race, Duel rivals, Fell to their death, the Tarren Mill challenge) and the 65-card list (17 new, 4 changed); the Doomsday section unchanged (a copy of `bot-recap-doomsday`) (web WEB-57) |
| `boards/bot-recap-v2-danger/` | Recap v2 · danger & loot week | The second sample week ("A week of spirit healers": Loot goblin, Deadliest zone, Revenge, Purple rain, Died by fire) with why each card was picked and a rules check (WEB-57) |
| `boards/bot-recap-v2-cards/` | Recap v2 · every new card | Every new award, card, headline and challenge as it sits in the embed, with a "Shows when" rule under each (WEB-57) |
| `boards/bot-recap-v2-icons/` | Recap v2 · card icons | The 12 recap card icons as bot emoji (crossed swords, skull, falling figure, flame, purple gem, horse, moon, sun, banner, hourglass, shield, two figures), in the class-icon style (BOT-14's recap icons) |

The site's Discord page (`BotAdmin`, with and without runs) is in the web repo's `design/boards/discord-settings*`. Where a board and its newer copy overlap, the newer one is the design: `bot-posts-runs` and `bot-commands-runs` over `bot-posts` and `bot-commands`; `bot-doomsday-feats` over the milestones of `bot-posts`; `bot-recap-v2` (with `bot-recap-doomsday` for the Doomsday section) over `bot-recap`.

The map crop in `boards/bot-commands/assets/` is the site's map. Zone outlines: Syrio, Wikimedia Commons, CC BY-SA 4.0, adapted (see the web repo's `tools/map/README.md`).

The Doomsday boards (2026-10-28, from the web repo's `docs/DESIGN-PROMPT-DOOMSDAY.md`) belong to one feature across the addon, the site and the bot; its rules are the addon repo's `docs/DOOMSDAY.md`, which wins over the boards: the reset is **19:00** realm time (a site setting), not the boards' 09:00, and the weekly post comes on Sunday at that time; the crown gives no points. The feat card images are the site's (web `design/boards/doomsday-feat-cards`).

The recap v2 boards (2026-10-29, from the web repo's `docs/DESIGN-PROMPT-RECAP-V2.md` section 2) design web WEB-57's cards and the bot's card icons. The thresholds under "Shows when" are the designer's proposals; WEB-57 in the web repo's `docs/STORIES.md` says which ones apply. Social butterfly (A7) is redefined as "grouped with the most different friends" and replaces the old meaning. The 128 px PNG exports of the icons are in `assets/recap-icons/`; the bot uploads them as its own emoji at start (BOT-14).

All names on the boards are made up.
