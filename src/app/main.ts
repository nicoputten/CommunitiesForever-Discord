// Entry point (`npm start`, the Docker image's CMD).
import { consoleLog } from "../adapters/log.js";
import { start } from "./start.js";

process.exitCode = start(process.env, consoleLog);
