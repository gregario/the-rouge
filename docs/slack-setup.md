# Slack Setup -- 5 Steps

## 1. Create a Slack workspace

Go to [slack.com/create](https://slack.com/create) and create a new workspace.
(Skip if you already have one.)

## 2. Create the app from manifest

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From a manifest**
3. Select your workspace
4. Paste the contents of `src/slack/manifest.yaml`
5. Click **Create**

## 3. Install to workspace

1. In the app settings, go to **Install App**
2. Click **Install to Workspace** > **Allow**
3. Copy the **Bot User OAuth Token** (`xoxb-...`)

## 4. Get tokens

You need 3 tokens in your `.env`:

| Token | Where to find it |
|-------|-----------------|
| `SLACK_BOT_TOKEN` | Install App > Bot User OAuth Token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Basic Information > App-Level Tokens > Generate (`xapp-...`, scope: `connections:write`) |
| `ROUGE_SLACK_WEBHOOK` | Incoming Webhooks > Add New > select channel (`https://hooks.slack.com/...`) |

## 5. Start the bot

```bash
cd src/slack
export $(grep -v '^#' ../../.env | grep -v '^$' | xargs)
node bot.js
```

The bot will:
- Connect via Socket Mode
- Auto-create `#rouge-feed` and `#rouge-alerts` channels (if they don't exist)
- Pin welcome messages
- Start listening for `/rouge` commands and @mentions

## Using Rouge

- `/rouge new my-app` -- start seeding a new product
- `/rouge status` -- check all projects (only you see this)
- `/rouge start my-app` -- begin autonomous building
- `/rouge pause my-app` -- pause any time
- `/rouge resume my-app` -- continue from checkpoint
