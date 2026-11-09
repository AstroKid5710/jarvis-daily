# jarvis-daily

A personal JARVIS that phones you with a short briefing from your Notion tasks, and lets you
mark tasks done or reschedule them by voice.

## How it works
1. Vercel Cron hits `/api/daily-call` (default: 12:00 UTC, about 7am Detroit).
2. It pulls open tasks from your Notion database.
3. Claude decides whether anything is worth a call (overdue, due soon, needs a decision).
4. If yes, Vapi dials you, and Claude talks to you live.
5. Mid-call, JARVIS can call `/api/vapi-tools` to complete or reschedule a task in Notion.

## Setup
1. **Notion:** create an integration at notion.so/profile/integrations, copy the token, and share your
   task database with it. Put the token and database ID in your env vars. Check that the
   property names match (defaults: `Name`, `Status`, `Due`, done value `Done`).
2. **Vapi:** create an account, buy or import a phone number (note its phone number ID), and get your API key.
3. **ElevenLabs:** pick a British male voice and copy its voice ID. Add your ElevenLabs key in the Vapi dashboard under Provider Keys.
4. **Deploy:** push this folder to GitHub, import it in Vercel, and add every variable from `.env.example`.
   Set `PUBLIC_BASE_URL` to your Vercel URL.
5. **Test:** open this once your env vars are set. The `force=1` flag skips Claude's "is it worth calling" check:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-URL/api/daily-call?force=1"`

## Safety
- Both endpoints reject requests without the secrets.
- It only dials `MY_PHONE_NUMBER`.
- Tools can only mark tasks done or change due dates. Nothing is deleted or deployed.
- Vapi can end a call by itself after 5 minutes.

## Not tested live
The code is syntax-checked and the auth paths are exercised with mocks, but it has not
placed a real call. Vapi's request shape and model names change, so if a call fails, check the
Vapi dashboard logs first.

## Next ideas
Add a calendar source, an evening wrap-up call, quiet hours, a daily call cap, and a tool to deploy a
preview to Vercel after a spoken confirmation.
