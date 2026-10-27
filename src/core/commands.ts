// The slash commands the bot registers at start (BOT-02), as Discord's JSON. Registering replaces the whole set, so
// commands removed here also disappear in Discord. `/recap` (BOT-05); BOT-06 adds the look-up commands.

/** Discord's option types (application command option type). */
export const STRING = 3;
export const BOOLEAN = 5;

export interface CommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
  choices?: { name: string; value: string }[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
}

const CLASSES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

// The look-ups (BOT-06, board `bot-commands-runs`) answer anyone in the server, only `/me` needs a link; `/recap`
// (BOT-05) answers anyone too: only friends are in the server (Nico, 2026-10-28, DESIGN-NOTES "Decisions").
export const COMMANDS: readonly CommandDefinition[] = [
  {
    name: "whereis",
    description: "Where a friend's characters, or one character, were last seen",
    options: [
      { type: STRING, name: "friend", description: "A friend", autocomplete: true },
      { type: STRING, name: "character", description: "A character", autocomplete: true },
    ],
  },
  {
    name: "who",
    description: "Characters by level, role or class",
    options: [
      { type: STRING, name: "level", description: "A level or a range, like 30-40" },
      {
        type: STRING,
        name: "role",
        description: "Tank, healer or damage",
        choices: [
          { name: "Tank", value: "tank" },
          { name: "Healer", value: "healer" },
          { name: "Damage", value: "damage" },
        ],
      },
      {
        type: STRING,
        name: "class",
        description: "A class",
        choices: CLASSES.map((c) => ({ name: c, value: c.toUpperCase() })),
      },
      { type: BOOLEAN, name: "recent", description: "Only those seen in the last 24 hours" },
    ],
  },
  {
    name: "whocancraft",
    description: "Who has a profession, best first",
    options: [{ type: STRING, name: "profession", description: "A profession", required: true, autocomplete: true }],
  },
  {
    name: "character",
    description: "A character's card: level, gear, talents, professions, last seen",
    options: [{ type: STRING, name: "name", description: "The character", required: true, autocomplete: true }],
  },
  {
    name: "alts",
    description: "All characters of a friend",
    options: [{ type: STRING, name: "friend", description: "A friend", required: true, autocomplete: true }],
  },
  { name: "me", description: "Your characters and your week" },
  { name: "recap", description: "The last weekly recap, again, only for you" },
];
