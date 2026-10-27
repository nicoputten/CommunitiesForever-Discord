// The slash commands the bot registers at start (BOT-02), as Discord's JSON. Registering replaces the whole set, so
// commands removed here also disappear in Discord. `/recap` (BOT-05); BOT-06 adds the look-up commands.

export interface CommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  options?: CommandOption[];
}

export const COMMANDS: readonly CommandDefinition[] = [
  // Answers anyone in the server, only to them, without the linked check: only friends can read the recap channel
  // anyway (Nico, 2026-10-28, DESIGN-NOTES "Decisions").
  { name: "recap", description: "The last weekly recap, again, only for you" },
];
