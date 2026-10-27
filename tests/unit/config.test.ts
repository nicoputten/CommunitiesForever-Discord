import { describe, expect, it } from "vitest";
import { problemText, readConfig, siteUrl } from "../../src/core/config.js";
import { start } from "../../src/app/start.js";

// Made-up values only (CLAUDE.md rule 1).
const FULL = {
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_APP_ID: "100000000000000001",
  SITE_URL: "https://example.com/",
  BOT_API_TOKEN: "test-bot-api-token",
};

describe("readConfig", () => {
  it("reads all four variables, trimmed, the site URL without a trailing slash", () => {
    const result = readConfig({ ...FULL, DISCORD_TOKEN: "  test-discord-token \n" });
    expect(result).toEqual({
      ok: true,
      config: {
        discordToken: "test-discord-token",
        discordAppId: "100000000000000001",
        siteUrl: "https://example.com",
        botApiToken: "test-bot-api-token",
      },
    });
  });

  it("says no token without DISCORD_TOKEN, also when it is empty", () => {
    expect(readConfig({})).toMatchObject({ ok: false, reason: "no token" });
    expect(readConfig({ ...FULL, DISCORD_TOKEN: "   " })).toMatchObject({ ok: false, reason: "no token" });
  });

  it("names the missing variables when the token is set", () => {
    expect(readConfig({ DISCORD_TOKEN: "t", SITE_URL: "http://localhost:3000" })).toEqual({
      ok: false,
      reason: "incomplete",
      missing: ["DISCORD_APP_ID", "BOT_API_TOKEN"],
    });
  });

  it("refuses a site URL that is not http(s)", () => {
    expect(readConfig({ ...FULL, SITE_URL: "wow" })).toMatchObject({ ok: false, reason: "bad site url" });
    expect(readConfig({ ...FULL, SITE_URL: "ftp://example.com" })).toMatchObject({ reason: "bad site url" });
  });
});

describe("siteUrl", () => {
  it("keeps a path, drops trailing slashes, query and fragment", () => {
    expect(siteUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(siteUrl("https://example.com/wow//?x=1#y")).toBe("https://example.com/wow");
  });
});

describe("problemText", () => {
  it("names variables, never values", () => {
    const text = problemText({ ok: false, reason: "incomplete", missing: ["DISCORD_APP_ID", "BOT_API_TOKEN"] });
    expect(text).toBe("missing DISCORD_APP_ID, BOT_API_TOKEN (see .env.example); exiting");
  });
});

describe("start (the empty bot)", () => {
  function logger() {
    const lines: { level: string; text: string }[] = [];
    return {
      lines,
      log: {
        info: (text: string) => lines.push({ level: "info", text }),
        error: (text: string) => lines.push({ level: "error", text }),
      },
    };
  }

  it("logs no token and exits cleanly without env", () => {
    const { lines, log } = logger();
    expect(start({}, log)).toBe(0);
    expect(lines).toEqual([{ level: "info", text: "no token: set DISCORD_TOKEN (see .env.example); exiting" }]);
  });

  it("fails on an incomplete configuration, without logging any value", () => {
    const { lines, log } = logger();
    expect(start({ DISCORD_TOKEN: "test-discord-token" }, log)).toBe(1);
    expect(lines[0]?.level).toBe("error");
    expect(JSON.stringify(lines)).not.toContain("test-discord-token");
  });

  it("starts with a complete configuration, without logging tokens", () => {
    const { lines, log } = logger();
    expect(start(FULL, log)).toBe(0);
    expect(JSON.stringify(lines)).not.toContain("test-");
  });
});
