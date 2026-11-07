// `/craft <item>` (BOT-25, board `bot-recipes` = RC08; web BOT-API.md "Look-ups craftable and craft"): who can make an
// item, with the reagents, or where it is learned. Answers in the channel where it was typed, for everyone there
// (RC08, recipes handoff D2; DESIGN-NOTES "Deviations"), so it has no Share button. The site has the data (rule 2).
import type { Autocomplete, SlashCommand } from "../adapters/discord.js";
import type { Site } from "../adapters/site.js";
import { nothingMessage, readNames } from "../core/lookups.js";
import { craftCard, noRecipeMessage, readCraft } from "../core/recipes.js";

export interface CraftDeps {
  siteUrl: string;
  site: Site;
}

export async function answerCraft(deps: CraftDeps, command: SlashCommand, signal: AbortSignal): Promise<void> {
  const item = typeof command.options.item === "string" ? command.options.item.trim() : "";
  if (item === "") {
    await command.reply(noRecipeMessage());
    return;
  }
  const answer = await deps.site.lookup("craft", { item }, signal);
  if (!answer.ok) {
    // 404: no recipe makes it; an older site without the look-up answers 404 too.
    await command.reply(
      answer.status === 404 || answer.status === 400
        ? noRecipeMessage()
        : nothingMessage("The site isn't answering", "Try again in a moment."),
    );
    return;
  }
  const craft = readCraft(answer.body);
  await command.reply(craft !== undefined ? craftCard(craft, deps.siteUrl) : noRecipeMessage());
}

/** `/craft`'s autocomplete: what recipes make, from the site. */
export async function answerCraftAutocomplete(deps: CraftDeps, request: Autocomplete, signal: AbortSignal) {
  const answer = await deps.site.lookup("craftable", { q: request.value }, signal);
  await request.respond(answer.ok ? readNames(answer.body) : []);
}
