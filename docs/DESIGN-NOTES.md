# Design notes

The bot follows the web's "Night over Azeroth" design system: tokens, class colours and the data age scale come from the web repo's `docs/DESIGN.md` (§3, §4). The bot's screens are the boards in `design/boards/` (index: `design/README.md`); the design canvas's §12 "Discord bot" is summarised here. This file holds what is specific to the bot.

## From the design (§12)

**Look:** rich embeds with the gold border (`#D4AF6A`, class colour where a post is about one character), the bot named after the community ("Doombringers", from the site's data, never hardcoded) with the BOT tag, generated card images for big moments and map crops. Every post links to the website.

**Automatic posts** (each kind in its own channel, set on the site; the default channel otherwise)
- *Feats* (board `bot-doomsday-feats`, BOT-14; before it the milestones of `bot-posts`): "Feat unlocked" after an upload, one per feat or "Feats unlocked · N" for several, "First in the group", one card image per post. Uploads within 5 minutes are added to the post.
- *Planned runs and asks* (boards `bot-posts-runs`, `bot-commands-runs`, `runs-flow`): one post per run or ask that edits itself as friends answer (I'm in, Maybe, Can't), reminders that mention only those in, quiet notices by direct message. Asks made in the game reach Discord after the next save and upload.
- *Doomsday* (boards `bot-doomsday-daily`, `bot-doomsday-weekly`; rules in the addon repo's `docs/DOOMSDAY.md`): the daily board at the reset, edited as uploads come in (at most every 30 s) until its final version; the weekly PvE and PvP ladder on Sunday at the reset.
- *Weekly recap* (boards `bot-recap-v2`, `bot-recap-doomsday`; Sunday 13:00 in the admin's time zone, see Deviations): headline · 4 core numbers · Doombringer of the week · 4 rotating cards with their icons · the Doomsday section · weekly challenge. Header image: the week's busiest zone or the award winner's portrait.

**Recap rotation:** a card is eligible only if its threshold is met and it wasn't used in the last 4 weeks; highest interest score per slot; ties broken with the week number as seed, so re-runs are identical; at most one card per friend; quiet weeks get a short recap. The catalogue (65 cards since recap v2, web WEB-57) is on the `bot-recap` and `bot-recap-v2` boards. The site computes the recap (ARCHITECTURE.md), the bot posts it.

**Commands** (boards `bot-commands-runs`, `bot-doomsday-weekly`; answers only for the asker, with Share; anyone in the server, Nico 2026-10-28): `/whereis`, `/who`, `/whocancraft`, `/character`, `/alts`, `/me` (needs the asker's Discord linked), `/plan`, `/ask`, `/runs`, `/run edit`, `/run cancel`, `/recap`, `/doomsday` and `/doom`. Not linked where a link is needed: the "Link your Discord first" card with a link to the site.

**Site** (web stories, not this repo): a "Discord" page with your link status (link and unlink); for the admin: a box per kind of post with its switch, channel and test button, the recap time, the mention role, the Doomsday reset and the list of linked friends. Posts never show BattleTags.

## Open questions (to settle in the stories)

- **Data the addon may not record yet:** each recap card or field without data is left out by the site or waits for an addon story (web `docs/RECAP.md`).
- ~~Group asks from the game.~~ Settled: the addon stores asks, plans, answers and pings for the site (addon CF-47, CF-48; web WEB-43).
- ~~No board for the site's Discord page.~~ Exported: the web repo's `discord-settings` and `discord-settings-runs`.
- **Map crops and card images** are rendered by the site; the map art is CC BY-SA 4.0 (Syrio, Wikimedia Commons, adapted), so images that show it need the attribution.

## Decisions

- Repo, stack, data flow and hosting: the proposals of 2026-10-27, approved by Nico (see `docs/ARCHITECTURE.md`).
- Recap text (Nico, 2026-10-27): the site writes it from templates, several phrasings per card, headline and challenge; a phrasing isn't used again until all of that card's phrasings were used. No pronouns anywhere. Details in the web repo's WEB-41.
- Milestones from uploads within 5 minutes of a post are added to that post by editing it, up to 10 per post (Nico, 2026-10-27, BOT-09): a group session that ends together gives one post, not one per friend. Discord marks the post "(edited)".
- Weekly recap (Nico, 2026-10-28, BOT-05): posted in the recap channel set on the site (the posts channel when none is set), texts exactly as the site wrote them, the header image on top and the Zone of the week map with that card. `/recap` answers anyone in the server, only to them, without the linked check, now and after WEB-39b: only friends can read that channel, so linking doesn't matter for it.
- Look-ups (Nico, 2026-10-28, BOT-06): the commands answer anyone in the server, because only friends are in it (as for `/recap`); only `/me` needs the asker's Discord linked, to know whose characters to show, and shows "Link your Discord first" otherwise. `/whereis` takes a friend or a character; `/who` takes a level or range, role, class and "seen today"; `/me` adds a line for the week from the site's history when the friend shares their activity; Share posts a copy in the channel with "Shared by <display name>", never a mention.
- Milestone card images (Nico, 2026-10-28, BOT-05): level 60, a new character at 60 and a profession at 300 get their own embed with the site's card image. When a later upload is added to the post by editing (BOT-09), the earlier images stay; the added milestones go without one.
- Planned runs replace the group ask of `bot-posts` (Nico, 2026-10-27): boards `bot-posts-runs`, `bot-commands-runs`, `runs-flow` (from `docs/DESIGN-PROMPT-PLANNED-RUNS.md`). A separate runs channel; one message per run, edited per state; reminders mention only I'm in and Maybe; `/plan` times in the asker's time zone from the site; `/ask` can't whisper in game. One admin: the boards' "Admins: Nico, Mira" (web) is not built.

- Planned runs (Nico, 2026-10-28, BOT-04): asks from the game are posted without answer buttons until the site keeps asks (`/ask` follows with them); I'm in and Pick my character open a picker only for the presser (the character select with fit tags, then the roles of the class); one character answers at once; the run post is found again by its marker. A new start time sends sign-ups a quiet notice, as `/run edit`'s reply on the board says.
- Class icons (Nico, 2026-10-28, BOT-11): the bot's own application emoji, named `cf_<class>_<hash of the picture>`, uploaded by the bot at start when missing or changed; without them the name shows without icon.

## Deviations

Approved departures from the boards (CLAUDE.md rule 8). Only Nico approves one; add it here in the PR that builds it.

| Date | What | Why | Approved |
|---|---|---|---|
| 2026-10-27 | Weekly recap on Sunday 13:00 in the admin's time zone (stored in UTC), not the board's Sunday 20:00 | Nico's choice | Nico |
| 2026-10-27 | Milestone posts show only what the site's event carries (name, owner, level, class, profession and rank); the board's extra lines ("The first Doombringer at max level", "Took 5 weeks · 3rd character to 40+", "Mount time. Scarlet Monastery now fits …", "Next step: an Artisan trainer", "first seen in Durotar") wait until the site sends them | The bot computes no game facts (CLAUDE.md rule 2) | Nico |
| 2026-10-27 | No Discord mention of the owner under a milestone ("Mira · @mira" is "Mira") | The event has no Discord id, and posts carry none (rule 5) | Nico |
| 2026-10-27 | The bot is called **DoomBot** (set in the developer portal), not the community's name | Nico's choice | Nico |
| 2026-10-27 | No pronouns in any text: "Somebody pay a visit." instead of the board's "Somebody visit her." | We never infer pronouns | Nico |
| 2026-10-28 | Look-up answers (BOT-06): names in bold, not in their class colour, with the class written next to every name (e.g. "**Ves Doombringer** 39 Warlock"); the embed's border takes the class colour where the answer is about one character | Discord can't colour text inside an embed | Nico |
| 2026-10-28 | `/who` has no "Plan a run with them" button yet | It needs `/plan` (BOT-04), which adds it | Nico |
| 2026-10-28 | ~~Asks from the game (`bot-posts-runs` 4) have no answer buttons and no "Expired" edit; `/ask` and the time-passed reply's "Ask now instead" are not built yet~~ Lifted by BOT-12 (asks have buttons, "Expired" and `/ask`); "Ask now instead" on `/plan`'s time-passed reply is still not there | Answering an ask from Discord needed the site to keep asks first (web WEB-51) | Nico |
| 2026-10-28 | ~~The run post's five slots are inline embed fields, which Discord shows three to a row, not the board's one row of five~~ Since BOT-13 the slots are one line each in the embed ("Tank · [icon] Vesgar Bloodhoof 27 · Vestras", "Healer · needed", "Damage · open") | Discord embeds have no grid; inline fields (3 + 2) didn't line up | Nico |
| 2026-10-28 | BOT-13: no "Pick my character" button on the run and ask posts: I'm in opens the picker (character with fit tag, the best one preselected, then the role); every character may say I'm in, also 6+ below with "tough" (web WEB-52) | Nico, after testing v0.2.0: one way to answer I'm in, and "recommend, never restrict" | Nico |
| 2026-10-28 | A full run names its reserves as next in line, not the board's "Grom Ashfeller can still answer Maybe"; I'm in on a full run stays clickable and makes a reserve | Runs v2 (web WEB-47): I'm in on a full role is a reserve | Nico |
| 2026-10-28 | No class icon where a name is only in an embed title or author line (the run post's "Nico on Ves Doombringer (39 Warlock)", a milestone card's title, `/character`'s title): the icon goes before the next line instead where there is one | Discord shows custom emoji as text there | Nico |
| 2026-10-28 | BOT-14: feat posts leave out the board's lines the site doesn't send ("First Doombringer to reach rank 6.", "mostly 'near your level'…", which also has a pronoun); "First in the group" is a bold line, not a pill | The bot computes no game facts (rule 2); no pronouns | Nico |
| 2026-10-28 | BOT-14: the first epic's name is bold, not epic purple; the post's border is epic purple (`#C27BFF`) when its card is a first epic | Discord can't colour text inside an embed | Nico |
| 2026-10-28 | BOT-14: feats from uploads within 5 minutes stay one post (BOT-09), a block per character and upload; "had a big upload." only when one character has them all; one card, the first upload's | The board shows one upload; the grouping keeps a session ending together in one post | Nico |
| 2026-10-28 | ~~BOT-14: no recap card icons for WEB-57's new cards~~ Lifted 2026-10-29: the designer drew them (`bot-recap-v2-icons`) | ~~The recap shows the site's card texts; the boards draw no icons per card~~ | Nico |
| 2026-10-29 | BOT-14: a recap card's icon starts its first line ("[skull] **12 deaths**"), and an award's its description, not the card's header as on `bot-recap-v2-cards` | Discord shows custom emoji as text in field names and titles (as for the class icons) | Nico |
| 2026-10-28 | BOT-15: the daily board's rows are lines of text ("~~**Mira**~~ 👑 boxes · all dailies 19:30 · PvE 15 · PvP 11"), not the board's columns; a friend with nothing done shows "—" instead of the board's joke; friends without data are one line ("No Doomsday data yet: Sanne."); "Yesterday's crown" shows only once the site sends it; times are Discord timestamps in each reader's zone; the board's "edited 13:10" is Discord's own "(edited)" | Discord embeds have no grid; the bot writes no jokes about friends and shows only what the site sends (rule 2) | Nico |
| 2026-10-28 | BOT-16: the ladder's intro is "Week 44 is done. Proud of the grind." (no "sorry about the deaths"); without the site's `label` the title is "Doomsday ladder" and the text names the week by its start date; several PvP Virgins share one line ("Still pure.") | Fixed texts state no facts the site didn't send (rule 2); the contract's `week` is not the board's week of the year | Nico |
| 2026-10-28 | BOT-16: the recap's "Crowns this week" shows only once the site sends `crowns`; "Full ladder" links to the site's Doomsday page instead of "/doomsday" | `/doomsday` shows one friend's day, not the ladder | Nico |
| 2026-10-28 | BOT-16: `/doomsday` also lists this week's goals and today's duels (the board shows today's goals only), with Share and "Open on site ↗" like every look-up | The look-up sends them; commands share like the others (rule 6) | Nico |
