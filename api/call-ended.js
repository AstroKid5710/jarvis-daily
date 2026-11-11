// Vapi calls this when a call ends. We read the transcript, work out what Xavi
// agreed to, and update Notion. Nothing is changed during the call itself.
import { getOpenTasks, completeTask, setDueDate } from '../lib/notion.js';

const SYSTEM = [
  'You read the transcript of a phone call between JARVIS (the assistant) and Xavi (the user).',
  'You are given his open tasks. List ONLY changes Xavi clearly agreed to or asked for himself.',
  'Ignore anything JARVIS only suggested that Xavi did not accept. If unsure, leave it out.',
  'Respond with ONLY a JSON object:',
  '{ "actions": [ { "taskId": string, "action": "complete" or "reschedule", "dueDate": "YYYY-MM-DD, reschedule only" } ] }',
].join('\n');

async function askClaude(transcript, tasks) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Detroit', dateStyle: 'full', timeStyle: 'short' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Now: ' + now + ' (America/Detroit)\n\nOpen tasks:\n' + JSON.stringify(tasks) + '\n\nTranscript:\n' + transcript }],
    }),
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]).actions || [] : [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.headers['x-vapi-secret'] !== process.env.VAPI_WEBHOOK_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const msg = req.body && req.body.message;
  if (!msg || msg.type !== 'end-of-call-report') return res.json({ ok: true, ignored: (msg && msg.type) || null });

  try {
    const transcript = (msg.artifact && msg.artifact.transcript) || '';
    if (transcript.length < 40) return res.json({ ok: true, applied: [] });

    const tasks = await getOpenTasks(50);
    const ids = new Set(tasks.map((t) => t.id));
    const applied = [];
    for (const a of await askClaude(transcript, tasks)) {
      if (!ids.has(a.taskId)) continue;
      if (a.action === 'complete') {
        await completeTask(a.taskId);
        applied.push(a);
      } else if (a.action === 'reschedule' && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate || '')) {
        await setDueDate(a.taskId, a.dueDate);
        applied.push(a);
      }
    }
    console.log('call-ended applied', JSON.stringify(applied));
    return res.json({ ok: true, applied });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
