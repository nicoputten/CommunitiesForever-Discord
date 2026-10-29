# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Open: BOT-20 (2026-10-29). BOT-19 shipped in v0.3.1.

### BOT-20 Visual posts
Nico's brief, 2026-10-29: the web repo's `docs/DESIGN-BRIEF-LIVE-TEST.md` part 5, with the boards `bot-visual-recap`, `bot-visual-daily` and `bot-visual-feats` (web `design/boards/`). The site renders the images and sends their ids and texts (web WEB-66). Only what Discord renders: embeds, inline fields, an author line with an icon, a thumbnail, one image per embed, link buttons. No designer notes or legends in posts.
- **Weekly recap** (`BV1Recap`): one message, 8 embeds:
  - header (gold, six inline numbers)
  - award (class colour, the award header image)
  - stat card (with its zone map and credit when it has one)
  - progress, social and fun cards (the recap icon's colour and the icon as thumbnail)
  - Doomsday (PvE and PvP top 3 as two inline fields, "Most devoted" in the footer)
  - challenge (grey `#4E5058`)
  - the link buttons "The full week ↗" and "Doomsday ladder ↗"
  - Without images, the same embeds without them.
- **Daily board** (`BV2Daily`): one embed with the site's 800 × 560 image and the site's one line of news.
  - The text is edited at most every 30 s. The image is re-attached at most every 5 minutes, and only when the site's image changed. The final edit at the reset always gets a fresh image; then the new day's message.
  - The emoji table and the "Columns" legend go. Without an image, the old text table, without the legend.
- **Feats** (`BV3Feats`): each post starts with the character (the class icon, attached, in the author line; the bar in the class colour), then what happened (the site's title and line), then one card (big or strip, chosen by the site).
  - Several feats: one message grouped by character, one card for the most special feat, and the footer "N feats from one upload".
  - New characters are not feats: one line "+3 new characters: Grosh Bonechewer 60, …", without a card.
- The footer "Test post from the site's Discord page · not real" only on test posts.
- Decided with Nico (2026-10-29):
  - The board's text keeps the 30 s pace, the image 5 minutes.
  - The class icon in the author line is the bot's own PNG, attached.
  - The recap cards' colours and thumbnails come from the bot's icon table and PNGs.
  - It is built now against fixtures, and each post switches to the visual layout by itself when the site sends the new fields (rule 10); without them it stays as it is, minus the legend.
- Tests: each post with and without images, the 5-minute image throttle on the board, the grouping of feats and new characters, no test footer on real posts.
- Manual (Nico, in the test channel): the test recap, board and feat from the Discord page's buttons look like the boards, on Discord desktop and on a phone.
