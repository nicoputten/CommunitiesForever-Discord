# Stories

Open stories in build order. A done story moves to `docs/STORIES-COMPLETED.md` with a "Done (PR #n)" line. The bot depends on web stories (in the web repo's `docs/STORIES.md`): the bot API (WEB-38) first, then the site's parts of each feature.

Build order (2026-10-27): per feature once its web story is merged: BOT-06 (commands, WEB-39), BOT-04 (runs, WEB-40, WEB-47 and WEB-43), BOT-05 (recap, WEB-41).

### BOT-11 Class icons
Decided with Nico (2026-10-28): Discord can't colour text in an embed, so every character name in the bot's answers and posts gets a class icon before it, and the class written after it ("[icon] **Mira Sunstrider** · Mage"). The icons come from Claude Design (`docs/DESIGN-PROMPT-CLASS-ICONS.md`, canvas board "Discord bot · class icons") and are in `assets/class-icons/` (128×128 PNG with transparent background, SVG sources in `svg/`): a disc in the class colour with one glyph (Warrior shield, Paladin hammer, Hunter bow, Rogue daggers, Priest candle, Shaman totem, Mage arcane star, Warlock skull, Druid paw) and a thin night-blue ring that keeps Priest and Rogue visible on Discord's light theme.
- The bot owns them as **application emoji** (uploaded by the bot itself at start when missing or changed, so no server emoji slots and no manual upload), named `cf_warrior` … `cf_druid`.
- Used wherever a character name shows: look-ups (BOT-06), milestones (BOT-03), runs (BOT-04), recap (BOT-05). Without the emoji (upload failed) the name shows without icon, never a broken one.
- Tests: the class to emoji mapping for all 9, the fallback without emoji, the start-up sync (missing, changed, unchanged).
