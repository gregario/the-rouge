# Slack Setup Guide

Connect Rouge to Slack so you can seed products via conversation, monitor autonomous builds, and control everything with slash commands.

## Prerequisites

- A Slack workspace where you have admin permissions
- Rouge installed (`npm install -g the-rouge` or cloned locally)

---

## Step 1: Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From an app manifest**
3. Select your workspace
4. Switch the format selector to **YAML**
5. Paste the contents of [`src/slack/manifest.yaml`](../src/slack/manifest.yaml) (the full manifest is included in the Rouge repo)
6. Click **Next** > Review the summary > **Create**

This configures the bot user, slash commands, event subscriptions, and all required OAuth scopes in one step.

## Step 2: Install to Workspace

1. You should land on the **Basic Information** page after creation
2. Scroll to **Install your app** > Click **Install to Workspace**
3. Review the requested permissions > Click **Allow**

## Step 3: Enable Socket Mode

Socket Mode lets the bot receive events over a WebSocket instead of requiring a public URL.

1. In the left sidebar: **Settings** > **Socket Mode**
2. Toggle **Enable Socket Mode** to on
3. You will be prompted to create an App-Level Token:
   - **Token Name:** `rouge-socket`
   - **Scope:** `connections:write` (add it if not pre-selected)
4. Click **Generate**
5. Copy the token (starts with `xapp-`) -- you will need this in Step 6

## Step 4: Get the Bot Token

1. In the left sidebar: **Features** > **OAuth & Permissions**
2. Find the **Bot User OAuth Token** (starts with `xoxb-`)
3. Copy it -- you will need this in Step 6

## Step 5: Get the Webhook URL

1. In the left sidebar: **Features** > **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to on
3. Click **Add New Webhook to Workspace**
4. Select the channel where Rouge should post (e.g., `#rouge-feed`)
5. Click **Allow**
6. Copy the webhook URL (starts with `https://hooks.slack.com/`)

## Step 6: Store Tokens in Rouge

Run the interactive setup command:

```bash
rouge setup slack
```

This prompts for three values:
- `ROUGE_SLACK_WEBHOOK` -- the webhook URL from Step 5
- `SLACK_BOT_TOKEN` -- the `xoxb-` token from Step 4
- `SLACK_APP_TOKEN` -- the `xapp-` token from Step 3

Tokens are stored in Rouge's encrypted credential store, not in `.env` files.

## Step 7: Start the Bot

```bash
rouge slack start
```

The bot will:
- Connect via Socket Mode
- Auto-create `#rouge-feed` and `#rouge-alerts` channels (if they don't exist)
- Pin welcome messages
- Start listening for `/rouge` commands and @mentions

## Step 8: Verify

```bash
rouge slack test
```

This sends a test message to your webhook channel. If you see it appear in Slack, everything is working.

---

## Using Rouge from Slack

| Command | What it does |
|---------|-------------|
| `/rouge new my-app` | Start seeding a new product |
| `/rouge status` | Check all projects (ephemeral, only you see it) |
| `/rouge start my-app` | Begin autonomous building |
| `/rouge pause my-app` | Pause the loop |
| `/rouge resume my-app` | Continue from checkpoint |
| `/rouge ship my-app` | Trigger shipping workflow |
| `/rouge feedback my-app` | Submit feedback on a build |

---

## Troubleshooting

### Bot does not respond to commands or mentions

- **Check Socket Mode is enabled.** Settings > Socket Mode must show "Enabled."
- **Check the bot token type.** The bot token must start with `xoxb-`, not `xoxp-` (which is a user token). Go to OAuth & Permissions and copy the *Bot* User OAuth Token.
- **Check the app token.** The app token must start with `xapp-`. If you accidentally used the bot token for both, Socket Mode will fail silently.
- **Reinstall the app.** If you changed scopes after the initial install, you need to reinstall: Install App > Reinstall to Workspace.

### Webhook test fails

- The webhook URL must start with `https://hooks.slack.com/`. If it does not, you copied the wrong URL.
- Webhooks can be revoked. Go to Incoming Webhooks and check the URL is still listed. If not, add a new one.
- Check that the target channel still exists and the app has access to it.

### Permission denied errors

- After adding new OAuth scopes, you must reinstall the app to your workspace. Scopes are locked at install time.
- Go to **Install App** > **Reinstall to Workspace** > **Allow**.

### Connection closed or drops repeatedly

- The App-Level Token must have the `connections:write` scope. Go to **Basic Information** > **App-Level Tokens**, check the token's scopes, and regenerate if needed.
- If you have multiple instances of the bot running, only one Socket Mode connection is allowed per token. Stop other instances first.
