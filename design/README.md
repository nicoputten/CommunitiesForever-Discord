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

The site's Discord page (`BotAdmin`, with and without runs) is in the web repo's `design/boards/discord-settings*`. Where a `-runs` board and its original overlap, the `-runs` board is the newer design.

The map crop in `boards/bot-commands/assets/` is the site's map. Zone outlines: Syrio, Wikimedia Commons, CC BY-SA 4.0, adapted (see the web repo's `tools/map/README.md`).

The Doomsday boards (2026-10-28, from the web repo's `docs/DESIGN-PROMPT-DOOMSDAY.md`) belong to one feature across the addon, the site and the bot; its rules are the addon repo's `docs/DOOMSDAY.md`, which wins over the boards: the reset is **19:00** realm time (a site setting), not the boards' 09:00, and the weekly post comes on Sunday at that time; the crown gives no points. The feat card images are the site's (web `design/boards/doomsday-feat-cards`).

All names on the boards are made up.
