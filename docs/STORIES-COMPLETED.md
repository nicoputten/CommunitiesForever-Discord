# Completed stories

Done (merged) stories, moved here from `docs/STORIES.md`, which holds only open stories. Kept for their decisions and acceptance criteria.

### BOT-01 Repo skeleton and CI
- Node 24 (`.nvmrc`), TypeScript, ESLint, Prettier, Vitest as in the web repo; `src/core`, `src/adapters`, `src/app` with an ESLint rule that `core` imports nothing from the others or from discord.js and Node.
- CI on every push and PR: lint, test, build, Docker image build (not pushed), gitleaks over the full history. Dependabot for npm and GitHub Actions (grouped minor and patch, weekly).
- `.env.example` with the four variables of `docs/ARCHITECTURE.md`, no values. `Dockerfile` (non-root, no secrets, `.dockerignore` as an allow-list).
- Done when: CI is green on an empty bot that starts, logs "no token" and exits cleanly without env.
- Done (PR #3). Built: `src/core/config.ts` (reads the four variables from an env argument; "no token", "incomplete" with the missing names, "bad site url"; logs names, never values), `src/adapters/log.ts`, `src/app/start.ts` and `main.ts`. Without `DISCORD_TOKEN` the bot logs "no token" and exits 0; with an incomplete configuration it exits 1. The ESLint rule also keeps `process`, timers, `fetch` and `Date.now` out of `src/core`. CI runs the image without env and checks the "no token" line and the non-root user. No discord.js yet (BOT-02).
