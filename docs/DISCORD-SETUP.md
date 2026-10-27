# Discord setup

For Nico: making the bot's Discord application, inviting it, and where its token goes (BOT-02). Done once. Tokens only ever go into the TrueNAS app's environment: never into this repo, a chat or a screenshot.

Discord's API calls a server a **guild**. That has nothing to do with WoW guilds; below it is "server".

## 1. The application
1. Open the [Discord developer portal](https://discord.com/developers/applications) → **New Application**.
2. **General Information:** name and avatar as the designer decides (the bot shows in Discord under this name). Copy the **Application ID**: it is `DISCORD_APP_ID`. It isn't secret, but it stays out of the repo like every Discord id.

## 2. The bot
1. **Bot** in the left menu.
2. **Public Bot: off**, so only you can add it to a server.
3. **Privileged Gateway Intents: all three off** (Presence, Server Members, Message Content). The bot uses only the non-privileged `Guilds` intent: slash commands and buttons reach it as interactions. If one of these is needed later, its story says so.
4. **Reset Token** → copy it straight into the TrueNAS app's environment as `DISCORD_TOKEN` (step 4). Discord shows it once; if it leaks, reset it here and update the environment.

## 3. Inviting it
Open this link (replace `<APPLICATION_ID>`), pick your server and authorise:

```
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=117760
```

- Scopes: `bot` and `applications.commands` (slash commands).
- Permissions `117760`: View Channels, Send Messages, Embed Links, Attach Files, Read Message History. Read Message History lets the bot find its own posts after a restart, so nothing is posted twice.
- The bot needs no "Mention Everyone": for the run mention role (later), make that role mentionable in the server settings.
- One server only. In a second server it still works but logs a warning.

## 4. The environment
In the TrueNAS app (the web repo's `deploy/compose.yaml`, the bot's container), the four variables of `.env.example`:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | the bot token from step 2 |
| `DISCORD_APP_ID` | the Application ID from step 1 |
| `SITE_URL` | `https://wow.vestras.nl` |
| `BOT_API_TOKEN` | the site's bot token (web repo `docs/BOT-API.md` "Token") |

## 5. Check
- The bot shows as online in the server's member list.
- The container is **healthy** (it writes a heartbeat while connected; the health check reads it).
- The log shows, without any token or id:
  ```
  discord: connecting
  site: https://wow.vestras.nl answers as Doombringers
  discord: ready in 1 server
  discord: registered 0 slash commands
  ```
- `discord: the token was refused` → `DISCORD_TOKEN` is wrong or was reset. `asked for an intent the portal doesn't allow` → a privileged intent is needed but off (step 2). `refuses BOT_API_TOKEN` → make a new bot token on the site, put it in `BOT_API_TOKEN` and restart the container. The bot stays connected to Discord meanwhile and asks the site again every 5 minutes.
- `docker stop` stops it within a few seconds with `stopping` and `stopped` in the log.
