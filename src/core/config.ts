// The bot's configuration from its environment (docs/ARCHITECTURE.md "Configuration"). Pure: the environment
// comes in as an argument, so it is tested without touching process.env.

export interface Config {
  discordToken: string;
  discordAppId: string;
  siteUrl: string;
  botApiToken: string;
}

export type Env = Readonly<Record<string, string | undefined>>;

export type ConfigResult =
  { ok: true; config: Config } | { ok: false; reason: "no token" | "incomplete" | "bad site url"; missing: string[] };

// The variables, in the order .env.example lists them.
export const VARIABLES = ["DISCORD_TOKEN", "DISCORD_APP_ID", "SITE_URL", "BOT_API_TOKEN"] as const;

function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

// SITE_URL without a trailing slash, http or https only; undefined when it is not such a URL.
export function siteUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/**
 * Reads the configuration. Without DISCORD_TOKEN the bot has nothing to do ("no token"); with it, every other
 * variable is needed too ("incomplete", missing names them). Values are trimmed; empty counts as missing.
 */
export function readConfig(env: Env): ConfigResult {
  const missing = VARIABLES.filter((name) => value(env, name) === undefined);
  if (missing.includes("DISCORD_TOKEN")) return { ok: false, reason: "no token", missing };
  if (missing.length > 0) return { ok: false, reason: "incomplete", missing };
  const url = siteUrl(value(env, "SITE_URL") as string);
  if (!url) return { ok: false, reason: "bad site url", missing: [] };
  return {
    ok: true,
    config: {
      discordToken: value(env, "DISCORD_TOKEN") as string,
      discordAppId: value(env, "DISCORD_APP_ID") as string,
      siteUrl: url,
      botApiToken: value(env, "BOT_API_TOKEN") as string,
    },
  };
}

/** The log line for a configuration problem: names variables, never values (docs/ARCHITECTURE.md "Privacy"). */
export function problemText(result: Extract<ConfigResult, { ok: false }>): string {
  if (result.reason === "no token") return "no token: set DISCORD_TOKEN (see .env.example); exiting";
  if (result.reason === "bad site url") return "SITE_URL is not an http(s) URL; exiting";
  return `missing ${result.missing.join(", ")} (see .env.example); exiting`;
}
