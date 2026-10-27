# Claude Design prompt: planned runs and group asks across the ecosystem

Paste everything below the line into the Doombringers canvas.

---

We're adding **planned runs** to Doombringers and reworking **group asks** so they work together across the four parts of the ecosystem: the **in-game addon**, the **website** (wow.vestras.nl), the **Discord bot** and the **Windows uploader**. The in-game calendar is gone from the flow: it's flaky, and addons can't create events in it.

**Important: don't change any existing board.** For every board you build on, **duplicate it first** and work in the copy, named "<original name> · runs" (for example "Discord bot · milestones & group asks · runs"). New screens get new boards. The old boards stay as they are, so we can compare the old and new UX side by side.

Use the existing design system everywhere (Night over Azeroth: tokens, Marcellus SC / Marcellus / Inter, gold trim, class colours, data age scale, 44 px touch targets, reduced motion). In-game screens use the addon's widget kit and "what WoW supports" board. Discord screens use Discord's real UI (dark theme, embeds, buttons, select menus), as on the existing bot boards.

## The idea in one paragraph

There are two kinds of group. **Ask now** is live and happens in the game: "who's up for Shadowfang Keep right now?", answered within minutes, ending in a party invite. A **planned run** is set for later ("tonight 20:30", "Saturday 15:00"). It is owned by the website, discussed and signed up for in Discord, reminded about in Discord and in the game, and ends with an invite in the game at the start time. After the run, the next upload shows it was done.

## Decisions (binding)

1. **Ask now** stays in the game, sent over Battle.net to friends online who fit the dungeon. It gets an option **"Also post on Discord"**. Addons can't reach the internet, so this needs a `/reload`: the addon asks for it ("Reload now to post on Discord"). After the reload, the uploader uploads the save file and the site pushes the ask to Discord, **in well under 30 seconds** (reload a few s, uploader settles 5 s, upload and push a few s). Friends who answer on Discord appear in the game after their own next upload or sync. Show that honestly: an "answered on Discord" state.
2. **Planned runs** can be created on the **website** (a dungeon's page, a new "Runs" page), in **Discord** (`/plan`; `/ask` creates a run that starts "now") and in the **game** (Dungeons tab → "Plan a run", which reaches the site after a `/reload`, same as above).
3. **Any linked friend can create a run.** A friend can edit and delete only their own runs; the admin can delete any run.
4. **Sign-ups:** five role slots (tank, healer, 3 damage), filled from the roles the addon knows per character (guessed from talents, or set by the player). Answers are **I'm in / Maybe / Can't** plus **Pick my character** (a character of yours that fits the level range). Sign up in Discord or on the website. The game shows the sign-ups.
5. **Reminders** 30 minutes before, **in Discord** (mentioning only the friends who signed up) **and in the game** (a toast for friends who are online and signed up). "Starting now" at the start time, in both places.
6. **In the game at the start time:** the organiser gets **Invite all** (who signed up and is online); everyone else who signed up gets **Request invite**. Late, offline and "maybe" friends are shown as such.
7. **Plans reach the game** through the uploader: it fetches upcoming runs from the site and writes them where the addon loads them at login or `/reload`. Friends without the uploader get them from friends who have it, over the addon's sync. So the game shows **"Runs updated at 21:04 · /reload for newer"**, never pretending to be live.
8. **Time:** stored in UTC. Every screen shows the viewer's **local time** (Discord's own timestamp format in Discord; the browser's time zone on the site; the PC's clock in game). Friends are not all in the same time zone: where it matters, show the organiser's time too ("20:30 your time · 21:30 for Nico").
9. **Privacy:** Discord posts never show BattleTags or Discord IDs. Friends by display name, characters by full name (never only the first name). All example names are made up.
10. **After the run:** when an upload shows the dungeon was run, the run is marked done ("Ran it · 3 of 5 signed-up came"), and it feeds the weekly recap.

## Screens to make

### Discord (copy "Discord bot · milestones & group asks", "Discord bot · look-up commands")
- **Planned run post:** dungeon, local time with Discord timestamp ("tonight 20:30 · in 3 hours"), level range, organiser on their character, five role slots, "N in · N maybe", suggested friends who fit and aren't signed up yet, the buttons and Pick my character (open select menu). States: open, full, starting soon, started, done, cancelled (by organiser or admin).
- **Ask now posted from the game:** "asked from the game · via /reload", answered live in the game and on Discord, expires after 10 minutes.
- **`/plan` command:** options (dungeon with autocomplete, day, time), the ephemeral confirmation, and the error for a time in the past.
- **Reminder 30 min before** (mentions only sign-ups) and **"Starting now"** (with "invites go out in game").
- **Cancel and edit:** only the organiser sees them (and the admin); show the "not yours" ephemeral reply.

### Website (copy the dungeon/character, roster and "Website · Discord settings & account linking" boards as needed)
- **Runs page** (new): upcoming runs (this week, later), past runs (done / didn't happen), filter "runs I can join". Desktop and phone.
- **Run detail:** slots, sign-ups with their characters and roles, suggestions who fits, your answer buttons, edit and delete (own runs or admin), times in local time with the organiser's time.
- **Create run** form (dungeon, date, time, note), with time-zone help.
- **"Plan a run" entry points** on a dungeon and on the map/roster where a dungeon band shows.
- **Discord settings page additions:** the runs channel, reminders on or off, the reminder time (default 30 min).
- Empty, loading and error states.

### In game (copy "Addon · Dungeons tab" and the widget kit)
- **Dungeons tab with runs instead of calendar events:** each dungeon shows its upcoming runs and who signed up; "Runs updated at 21:04 · /reload for newer".
- **Ask now** with the "Also post on Discord" checkbox, and the **reload prompt** after sending ("Reload now to post on Discord" / "Later").
- **Plan a run** dialog (dungeon preselected, day, time) with the same reload prompt.
- **Sign-up in game** for a run (I'm in / Maybe / Can't + character), marked "reaches Discord after /reload".
- **Reminder toast** 30 min before, and the **start-time panel**: Invite all (organiser), Request invite (others), with each friend's state (online, offline, maybe, answered on Discord).
- Chat lines for all of the above, in the addon's chat style.

### Uploader (copy "Uploader · main window")
- A small line in the main window: "3 upcoming runs sent to the game · 21:04", and the "/reload to see them" hint while the game is running.

## Also show (one overview board)
A **flow board** "Runs · how it travels": the four parts as lanes (game, uploader, site, Discord) with the path of (a) a run created on the site, (b) an ask now with "Also post on Discord" from the game, (c) a sign-up on Discord reaching the game. Mark where a `/reload` is needed and the typical delay at each step.
