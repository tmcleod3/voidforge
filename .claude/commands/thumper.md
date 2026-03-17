Plant the thumper. Ride the worm. Command Claude Code from anywhere via Telegram.

## If `$ARGUMENTS` is `setup`:

Guide the user through Telegram bot setup conversationally — do NOT run the interactive `scan.sh` (it requires stdin which doesn't work in Claude Code).

### Step 1 — Get the bot token

Tell the user:

> To set up the Telegram bridge, you need a bot token from Telegram:
>
> 1. Open Telegram and search for **@BotFather**
> 2. Send `/newbot`
> 3. Choose a name (e.g., "VoidForge Bridge")
> 4. Choose a username ending in `bot` (e.g., `myforge_bot`)
> 5. BotFather will reply with a token — paste it here

Wait for the user to paste their bot token.

### Step 2 — Validate and detect chat ID

Once the user provides the token:

1. Validate it: `curl -s "https://api.telegram.org/bot<TOKEN>/getMe"` — check for `"ok":true`
2. Tell the user: "Token validated! Now **send any message to your bot** on Telegram (just type 'hello') and tell me when done."
3. When they confirm, detect the chat ID: `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates?limit=10"` — extract the first private chat ID
4. If no chat found, ask them to try again

### Step 3 — Run scan.sh non-interactive

Once you have both token and chat ID:

```bash
bash scripts/thumper/scan.sh --token "<TOKEN>" --chat-id "<CHAT_ID>"
```

Report the output. The sietch vault is sealed.

### Step 4 — Offer to start

Ask: "Thumper is configured. Want me to start the bridge now? (`/thumper on`)"

---

## For all other arguments (`on`, `off`, `status`, or no args):

Run the shell script directly:

```bash
bash scripts/thumper/thumper.sh $ARGUMENTS
```

Report the output exactly as returned.
