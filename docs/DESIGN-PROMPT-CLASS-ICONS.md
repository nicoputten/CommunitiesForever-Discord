# Design prompt: class icons for the bot (BOT-11)

Paste into Claude Design, canvas "Doombringers — wow.vestras.nl design", §12 "Discord bot".

---

Make **9 class icons** for the Doombringers Discord bot, one per World of Warcraft class: Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid. Discord can't colour text in an embed, so these icons stand next to each character name in the bot's answers ("[icon] **Mira Sunstrider** · Mage"); the class name stays written next to it.

- **Style:** "Night over Azeroth" (the site's design system): a round disc in the class colour with a simple glyph in the night colour (`--bg-night`) or gold line art, readable at **20 px** (Discord's inline emoji size). One clear shape per class (e.g. a shield, a hammer, a bow, daggers, a candle or halo, a totem, a flame or arcane star, a skull or fel flame, a leaf or paw). Our own drawings: no Blizzard icons or logos, no copied artwork.
- **Class colours** (the site's tokens): Warrior `#c69b6d`, Paladin `#f48cba`, Hunter `#aad372`, Rogue `#fff468`, Priest `#ffffff`, Shaman `#0070dd`, Mage `#3fc7eb`, Warlock `#8788ee`, Druid `#ff7c0a`. Make sure the glyph contrasts on the light fills (Priest, Rogue) and the dark one (Shaman).
- **Output:** a board with all 9 at 128 px and at 20 px on Discord's dark background (`#313338`) and light background (`#ffffff`), plus each icon as its own **128×128 PNG with a transparent background** (file names `warrior.png` … `druid.png`).
- An example line per size: "[icon] **Mira Sunstrider** · Mage · 38".
