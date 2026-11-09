// Asks Claude to look at your tasks and decide: is this worth a phone call?
// Returns { shouldCall, firstMessage, context }.

const SYSTEM = `You are JARVIS, a dry-witted, concise personal assistant calling your user, Xavi, on the phone.
You are given his open tasks. Decide whether a call is worthwhile today.
Call only if something is overdue, due within 48 hours, or the list needs a priority decision.
Otherwise do not call.

Respond with ONLY a JSON object:
{
  "shouldCall": boolean,
  "firstMessage": string,   // what you say when he picks up. Max 2 sentences, spoken style, no lists.
  "context": string         // private notes for the live call: the key tasks with their ids, and what to suggest
}`;

export async function composeBriefing(tasks, now = new Date()) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 800,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Now: ${now.toISOString()} (America/Detroit)\nOpen tasks:\n${JSON.stringify(tasks, null, 2)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.map((b) => b.text || '').join('') || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Could not parse briefing: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  return {
    shouldCall: Boolean(parsed.shouldCall),
    firstMessage: String(parsed.firstMessage || ''),
    context: String(parsed.context || ''),
  };
}
