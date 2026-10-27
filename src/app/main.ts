// Entry point (`npm start`, the Docker image's CMD). SIGTERM (docker stop) and SIGINT stop the bot gracefully;
// if that takes longer than 10 s, it exits anyway.
import { connectDiscord } from "../adapters/discord.js";
import { heartbeatFile } from "../adapters/heartbeat.js";
import { consoleLog } from "../adapters/log.js";
import { siteClient } from "../adapters/site.js";
import { start } from "./start.js";

const STOP_TIMEOUT_MS = 10_000;

const stop = new AbortController();
const onSignal = () => {
  stop.abort();
  setTimeout(() => process.exit(1), STOP_TIMEOUT_MS).unref();
};
process.once("SIGTERM", onSignal);
process.once("SIGINT", onSignal);

const code = await start(
  process.env,
  consoleLog,
  { discord: connectDiscord, site: siteClient, heartbeat: heartbeatFile(), now: Date.now },
  stop.signal,
);
process.exit(code);
