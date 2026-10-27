// The container's health check (Dockerfile HEALTHCHECK): exit 0 when the bot is connected to Discord, judged by
// the heartbeat file it writes while connected.
import { readHeartbeat } from "../adapters/heartbeat.js";
import { isHealthy } from "../core/connection.js";

process.exitCode = isHealthy(readHeartbeat(), Date.now()) ? 0 : 1;
