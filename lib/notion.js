// Minimal Notion helpers (no SDK, just fetch).
// Assumes a task database with a title, a status (or select), and a date property.
// Property names are configurable through env vars.

const NOTION = 'https://api.notion.com/v1';

const cfg = () => ({
  token: process.env.NOTION_TOKEN,
  db: process.env.NOTION_DATABASE_ID,
  title: process.env.NOTION_TITLE_PROP || 'Name',
  status: process.env.NOTION_STATUS_PROP || 'Status',
  statusType: process.env.NOTION_STATUS_TYPE || 'status', // 'status' or 'select'
  due: process.env.NOTION_DUE_PROP || 'Due',
  done: process.env.NOTION_DONE_VALUE || 'Done',
});

async function notion(path, body, method = 'POST') {
  const { token } = cfg();
  const res = await fetch(`${NOTION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
  return res.json();
}

// Open tasks, soonest due first.
export async function getOpenTasks(limit = 25) {
  const c = cfg();
  const data = await notion(`/databases/${c.db}/query`, {
    page_size: limit,
    filter: { property: c.status, [c.statusType]: { does_not_equal: c.done } },
    sorts: [{ property: c.due, direction: 'ascending' }],
  });
  return data.results.map((p) => ({
    id: p.id,
    title: (p.properties[c.title]?.title || []).map((t) => t.plain_text).join('') || '(untitled)',
    due: p.properties[c.due]?.date?.start || null,
  }));
}

export async function completeTask(id) {
  const c = cfg();
  await notion(
    `/pages/${id}`,
    { properties: { [c.status]: { [c.statusType]: { name: c.done } } } },
    'PATCH'
  );
}

export async function setDueDate(id, isoDate) {
  const c = cfg();
  await notion(`/pages/${id}`, { properties: { [c.due]: { date: { start: isoDate } } } }, 'PATCH');
}
