# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Everything up to BOT-22 is done.

### BOT-23 The class icon per name in the recap
With web WEB-72 (web PR #146), 2026-11-02. BOT-11 left the recap's names without class icons, because the site didn't send the class. Now the award and each card may carry `classes`, `{ "<name>": "<classFile>" }`, for every character and friend the card names, keyed exactly as written (`docs/BOT-API.md` "Recap").
- The class icon goes before each of those names in the card's title and text, in the award and in the cards; inside a "Who am I?" spoiler too.
- Longest names first, so a character "Mira Sunstrider" wins over a friend "Mira"; whole names only ("Mira" not in "Miranda").
- A name whose class has no emoji, and a card without `classes` (an older site), show as now.
- Built: `withClassIcons` and `classes` in `src/core/recap.ts`, used by the post, `/recap` and the test recap; tests in `recap.test.ts`.
- Manual (Nico, after WEB-72 is live): the test recap from the site's Discord page shows the Warlock icon before "Testy McTestface"; the next real recap and `/recap` show icons before the names.

### BOT-24 Every page of the Doomsday board
With web WEB-87 (web PR #182), Nico 2026-11-06: the board shows everyone, as several pictures in one post. The site splits the board's picture into pages of 8 rows and sends `images` on `doomsdayBoard` and `doomsdayBoardUpdate` (`docs/BOT-API.md` "Doomsday board"): 1 to 10 ids in page order, the first is `image`, page n is `<image>-<n>`.
- `images` is read like `image` (ids `[a-z0-9-]` only, no repeats, at most 10); missing, or not starting with `image` (an older site): `[image]`.
- The post attaches every page: page 1 in the board's embed as before, each further page in an embed of its own with only the picture and the gold border, so they stack full size (no shared embed `url`, which would make a cropping gallery).
- The pages are swapped together, when page 1's id changes, at most every 5 minutes (`final` never waits); the edit replaces all old attachments, so the page count may change.
- A later page the site can't give is left out (logged); without page 1 the post is the text board, as now.
- A board refused in a WoW-linked channel (20062) is skipped after 3 tries, as every post (v0.5.1).
- Built: `readBoard` (`images`) and `boardMessage` in `src/core/doomsday.ts`, `pictures` in `src/app/doomsdayPosts.ts`; tests in `doomsday.test.ts`.
- Manual (Nico, once WEB-87 is live and with more than 8 friends with Doomsday data): the board post shows all pages under each other at full width, on Discord desktop and on a phone; when a page is added during the day, the post has the new page after at most 5 minutes; the final board has every page.
