// Vapi calls this when a call ends. We read the transcript, work out what Xavi
// agreed to or asked for, and update Notion. Nothing is changed during the call itself.
// Works for outbound briefing calls and for calls Xavi makes in to the assistant.
// Also schedules callbacks when he asks JARVIS to phone him back later.
import { getOpenTasks, completeTask, setDueDate, createTask } from '../lib/notion.js';
import { startCall } from '../lib/vapi.js';

const SYSTEM = [
  'You read the transcript of a phone call between JARVIS (the assistant) and Xavi (the user).',
  'You are given his open tasks. List ONLY changes Xavi clearly agreed to or asked for himself.',
  'Ignore anything JARVIS only suggested that Xavi did not accept. If unsure, leave it out.',
  'Actions: complete an existing task, reschedule an existing task, create a brand new task he asked to add, or callback (he asked JARVIS to phone him back at a later time).',
  'Never create a task that duplicates an existing open task.',
  'Respond with ONLY a JSON object:',
  '{ "actions": [ { "action": "complete" or "reschedule" or "create" or "callback", "taskId": "existing task id (complete/reschedule only)", "title": "short task title (create only)", "dueDate": "YYYY-MM-DD (reschedule, or create if he gave a date)", "callAt": "ISO 8601 time WITH the America/Detroit UTC offset, e.g. 2026-11-11T20:00:00-05:00 (callback only; work it out from the Now line)", "reason": "short reason for the callback, or empty (callback only)" } ] }',
].join('\n');

async function askClaude(transcript, tasks) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Detroit', dateStyle: 'full', timeStyle: 'short' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 800,
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

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const secret = req.headers['x-vapi-secret'];
  const ok = secret && (secret === process.env.VAPI_WEBHOOK_SECRET || (process.env.INBOUND_SECRET && secret === process.env.INBOUND_SECRET));
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const msg = req.body && req.body.message;
  if (!msg || msg.type !== 'end-of-call-report') return res.json({ ok: true, ignored: (msg && msg.type) || null });

  try {
    const transcript = (msg.artifact && msg.artifact.transcript) || '';
    if (transcript.length < 40) return res.json({ ok: true, applied: [] });

    const tasks = await getOpenTasks(50);
    const ids = new Set(tasks.map((t) => t.id));
    const applied = [];
    for (const a of await askClaude(transcript, tasks)) {
      if (a.action === 'complete' && ids.has(a.taskId)) {
        await completeTask(a.taskId);
        applied.push(a);
      } else if (a.action === 'reschedule' && ids.has(a.taskId) && isDate(a.dueDate)) {
        await setDueDate(a.taskId, a.dueDate);
        applied.push(a);
      } else if (a.action === 'callback' && a.callAt) {
        const t = new Date(a.callAt).getTime();
        if (!isNaN(t) && t > Date.now() + 60 * 1000 && t < Date.now() + 30 * 24 * 3600 * 1000) {
          const reason = String(a.reason || '').slice(0, 200);
          const call = await startCall({
            firstMessage: reason ? 'Jarvis here, calling back as requested. ' + reason : 'Jarvis here, calling back as requested. What do you need?',
            context: 'Xavi asked you to call him back now.' + (reason ? ' Reason: ' + reason : ''),
            earliestAt: new Date(t).toISOString(),
          });
          a.callId = call.id;
          applied.push(a);
        }
      } else if (a.action === 'create' && a.title) {
        await createTask(String(a.title).slice(0, 200), isDate(a.dueDate) ? a.dueDate : null);
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
