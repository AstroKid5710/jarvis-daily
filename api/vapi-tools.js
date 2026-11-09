// Vapi calls this when JARVIS uses a tool mid-conversation.
import { completeTask, setDueDate } from '../lib/notion.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-vapi-secret'] !== process.env.VAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const message = req.body?.message;
  if (message?.type !== 'tool-calls') return res.json({}); // ignore other event types

  const results = [];
  for (const call of message.toolCallList || []) {
    const name = call.function?.name;
    let args = call.function?.arguments || {};
    if (typeof args === 'string') args = JSON.parse(args);
    try {
      if (name === 'complete_task') {
        await completeTask(args.taskId);
        results.push({ toolCallId: call.id, result: 'Task marked as done.' });
      } else if (name === 'reschedule_task') {
        if (!ISO_DATE.test(args.dueDate || '')) throw new Error('dueDate must be YYYY-MM-DD');
        await setDueDate(args.taskId, args.dueDate);
        results.push({ toolCallId: call.id, result: `Task moved to ${args.dueDate}.` });
      } else {
        results.push({ toolCallId: call.id, result: 'Unknown tool.' });
      }
    } catch (err) {
      console.error(err);
      results.push({ toolCallId: call.id, result: `Failed: ${err.message}` });
    }
  }
  return res.json({ results });
}
