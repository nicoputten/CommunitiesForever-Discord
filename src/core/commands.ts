// The slash commands the bot registers at start (BOT-02), as Discord's JSON. Registering replaces the whole set, so
// commands removed here also disappear in Discord. Empty until BOT-06 adds the look-up commands.

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

export const COMMANDS: readonly CommandDefinition[] = [];
