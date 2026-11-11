// Runs on a schedule (Vercel Cron) or by hand: GET /api/daily-call?force=1
import { getOpenTasks } from '../lib/notion.js';
import { composeBriefing } from '../lib/briefing.js';
import { startCall } from '../lib/vapi.js';

export default async function handler(req, res) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Reject everyone else.
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    console.log('daily-call: unauthorized request');
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const tasks = await getOpenTasks();
    console.log('daily-call: open tasks = ' + tasks.length);
    if (tasks.length === 0) return res.json({ called: false, reason: 'no open tasks' });

    const briefing = await composeBriefing(tasks);
    const forced = (req.query && req.query.force === '1') || process.env.FORCE_CALL === '1';
    console.log('daily-call: shouldCall = ' + briefing.shouldCall + ', forced = ' + forced);
    if (!briefing.shouldCall && !forced) {
      return res.json({ called: false, reason: 'nothing worth a call today' });
    }

    const call = await startCall(briefing);
    console.log('daily-call: call started ' + call.id);
    return res.json({ called: true, callId: call.id });
  } catch (err) {
    console.error('daily-call: failed', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
