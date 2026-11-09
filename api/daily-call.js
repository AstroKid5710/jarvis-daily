// Runs on a schedule (Vercel Cron) or by hand: GET /api/daily-call?force=1
import { getOpenTasks } from '../lib/notion.js';
import { composeBriefing } from '../lib/briefing.js';
import { startCall } from '../lib/vapi.js';

export default async function handler(req, res) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Reject everyone else.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const tasks = await getOpenTasks();
    if (tasks.length === 0) return res.json({ called: false, reason: 'no open tasks' });

    const briefing = await composeBriefing(tasks);
    if (!briefing.shouldCall && req.query?.force !== '1') {
      return res.json({ called: false, reason: 'nothing worth a call today' });
    }

    const call = await startCall(briefing);
    return res.json({ called: true, callId: call.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
