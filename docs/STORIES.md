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
