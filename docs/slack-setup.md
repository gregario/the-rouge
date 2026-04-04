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

---

## How to Use Rouge via Slack

### Three ways to interact

**@Rouge in a channel** — mention the bot for seeding conversations and commands. Messages are visible to everyone in the channel. During an active seeding session, just talk naturally — messages relay to Claude.

**/rouge slash command** — same commands, but only you see the response. Use this for quick status checks that don't need to clutter the channel.

**Direct Message** — DM the bot for private seeding conversations. Same behaviour as @Rouge mentions, but in a private 1:1 chat.

All three modes support the same commands. The difference is visibility.

### Commands

| Command | What it does |
|---------|-------------|
| `status` | All projects at a glance — milestones, stories, cost |
| `status <project>` | Detailed view: milestone progress, staging URL, cost |
| `new <name>` | Create a project and start an interactive seeding session |
| `seed <name>` | Resume a paused seeding session |
| `start <project>` | Start the autonomous build loop |
| `pause <project>` | Pause an active build |
| `resume <project>` | Resume after providing feedback |
| `ship <project>` | Approve a product in final-review for production deploy |
| `feedback <project> <text>` | Send guidance to a stuck project |

### What notifications mean

| Icon | Phase | Action needed? |
|------|-------|---------------|
| 🏗️ | Building foundation | No — schema, auth, deploy pipeline being set up |
| 🔨 | Building a story | No — writing code with TDD |
| 📋 | Evaluating milestone | No — browser QA and code review running |
| 🧠 | Analysing | No — deciding whether to promote, fix, or escalate |
| 🚀 | Shipping | No — deploying to production |
| ⏸️ | **Escalation** | **Yes — read the message and provide feedback** |
| ✅ | Complete | No — celebrate |
| 📸 | Screenshot | No — a milestone just passed evaluation. The screenshot shows what was built |
| 🟡 | Cost alert (50%) | Awareness — half the budget used |
| 🔴 | Cost alert (80%) | Awareness — most of the budget used, will escalate at 100% |
| 🚫 | Deploy failed | Awareness — staging deploy failed, project will escalate |

### When Rouge escalates

Rouge escalates when it hits something it can't resolve autonomously. The escalation message will tell you:

1. **What happened** — which phase was running and what went wrong
2. **Why it escalated** — the specific reason (3 failures, budget cap, vision drift, etc.)
3. **Context** — milestone, story, health score, confidence, cost so far
4. **What to do** — how to provide feedback and resume

**To respond:**
1. Read the escalation message
2. Either reply in the Slack thread with your guidance, or create a `feedback.json` file in the project directory:
   ```json
   {
     "resolved": true,
     "resolution": "Skip the map integration for now, use a simple list view instead"
   }
   ```
3. Click the **Resume** button in the Slack message, or run `resume <project>`

### Tips

- **Check status from your phone.** The whole point is that you walk away. Use `/rouge status` for a quick check.
- **Set a budget cap.** Add `"budget_cap_usd": 50` to `rouge.config.json` so Rouge alerts you before costs get high.
- **Seeding is conversational.** During `new` or `seed`, just talk naturally. Rouge relays your messages to Claude and sends back the response.
- **Screenshots are automatic.** After every milestone evaluation that passes, Rouge captures the key screens and sends them to Slack as images.
