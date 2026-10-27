import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/core/commands.js";
import { backoffSeconds, isConnected, isHealthy, stateText } from "../../src/core/connection.js";
import { readSettings, settingsText } from "../../src/core/settings.js";

describe("stateText", () => {
  it("names each state with counts and codes only", () => {
    expect(stateText({ kind: "connecting" })).toBe("discord: connecting");
    expect(stateText({ kind: "ready", servers: 1 })).toBe("discord: ready in 1 server");
    expect(stateText({ kind: "disconnected", code: 1006 })).toBe("discord: disconnected (close code 1006)");
    expect(stateText({ kind: "reconnecting" })).toBe("discord: reconnecting");
    expect(stateText({ kind: "resumed" })).toBe("discord: resumed");
    expect(stateText({ kind: "left", servers: 0 })).toBe("discord: removed from a server, now in 0 servers");
  });

  it("warns when the bot is in more than one server", () => {
    expect(stateText({ kind: "ready", servers: 2 })).toContain("warning: the bot is meant for one server");
    expect(stateText({ kind: "joined", servers: 2 })).toContain("warning");
    expect(stateText({ kind: "joined", servers: 1 })).not.toContain("warning");
  });

  it("points at the setup guide when Discord refuses the bot", () => {
    expect(stateText({ kind: "failed", reason: "invalid token" })).toContain("DISCORD_TOKEN");
    expect(stateText({ kind: "failed", reason: "disallowed intents" })).toContain("intent");
    expect(stateText({ kind: "failed", reason: "other" })).toBe("discord: could not connect; exiting");
  });
});

describe("isConnected", () => {
  it("is true after ready and resumed, false after a disconnect, unchanged otherwise", () => {
    expect(isConnected({ kind: "ready", servers: 1 })).toBe(true);
    expect(isConnected({ kind: "resumed" })).toBe(true);
    expect(isConnected({ kind: "disconnected", code: 1000 })).toBe(false);
    expect(isConnected({ kind: "reconnecting" })).toBe(false);
    expect(isConnected({ kind: "joined", servers: 1 })).toBeUndefined();
  });
});

describe("backoffSeconds", () => {
  it("doubles from 5 s up to 5 minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffSeconds)).toEqual([5, 10, 20, 40, 80, 160, 300, 300]);
  });
});

describe("isHealthy", () => {
  const now = 1_793_112_000_000;
  it("needs a heartbeat younger than a minute", () => {
    expect(isHealthy(now - 15_000, now)).toBe(true);
    expect(isHealthy(now - 60_000, now)).toBe(false);
    expect(isHealthy(undefined, now)).toBe(false);
    expect(isHealthy(now + 5_000, now)).toBe(false);
  });
});

describe("readSettings", () => {
  it("reads the site name, milestones switch and posts channel, tolerating missing or odd fields", () => {
    expect(
      readSettings({
        apiVersion: 1,
        siteName: " Doombringers ",
        posts: { milestones: false },
        channels: { posts: "100000000000000002" },
      }),
    ).toEqual({ apiVersion: 1, siteName: "Doombringers", milestones: false, postsChannel: "100000000000000002" });
    expect(readSettings({ channels: { posts: null } }).postsChannel).toBeNull();
    expect(readSettings({ siteName: 3, channels: { posts: "#general" } })).toEqual({
      siteName: undefined,
      apiVersion: undefined,
      milestones: undefined,
      postsChannel: undefined,
    });
    expect(readSettings(null)).toEqual({});
    expect(settingsText("https://example.com", {})).toBe(
      "site: https://example.com answers as (no name); posts channel not set",
    );
  });
});

describe("COMMANDS", () => {
  it("is empty until BOT-06", () => {
    expect(COMMANDS).toEqual([]);
  });
});
