// Starts an outbound phone call through Vapi with a one-off ("transient") assistant.

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a task as done in Notion. Only after the user clearly says it is done.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string', description: 'Notion page id from the call notes' } },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_task',
      description: 'Move a task to a new due date after the user agrees.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          dueDate: { type: 'string', description: 'ISO date, e.g. 2026-11-12' },
        },
        required: ['taskId', 'dueDate'],
      },
    },
  },
];

export async function startCall({ firstMessage, context }) {
  const baseUrl = process.env.PUBLIC_BASE_URL; // e.g. https://jarvis-daily.vercel.app
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: process.env.MY_PHONE_NUMBER }, // E.164, e.g. +12485551234
      assistant: {
        firstMessage,
        model: {
          provider: 'anthropic',
          model: process.env.VAPI_MODEL || 'claude-sonnet-4-5',
          messages: [
            {
              role: 'system',
              content: `You are JARVIS, Xavi's dry-witted personal assistant, on a phone call with him.
Speak in short, natural sentences. No lists, no markdown. Be brief; he is busy.
Only change his tasks after he clearly agrees, then use your tools.
End the call once the priorities are settled.

Call notes (private):
${context}`,
            },
          ],
          tools: TOOLS.map((t) => ({
            ...t,
            server: { url: `${baseUrl}/api/vapi-tools`, secret: process.env.VAPI_WEBHOOK_SECRET },
          })),
        },
        voice: {
          provider: '11labs',
          voiceId: process.env.ELEVENLABS_VOICE_ID, // pick a British male voice
        },
        endCallPhrases: ['goodbye', 'talk later'],
        maxDurationSeconds: 300,
      },
    }),
  });
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${await res.text()}`);
  return res.json();
}
