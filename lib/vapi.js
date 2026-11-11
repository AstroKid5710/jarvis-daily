// Starts an outbound phone call through Vapi with a one-off ("transient") assistant.
// No task changes happen during the call. When it ends, Vapi posts the transcript
// to /api/call-ended, which updates Notion.

const PROMPT = [
  "You are JARVIS, Xavi's dry-witted personal assistant, on a phone call with him.",
  'Speak in short, natural sentences. No lists, no markdown. Be brief; he is busy.',
  'You cannot change his tasks during the call. When he says a task is done or should move to another day, just confirm out loud what you have noted. His tasks are updated automatically after the call.',
  'End the call once the priorities are settled.',
].join('\n');

export async function startCall({ firstMessage, context }) {
  const baseUrl = process.env.PUBLIC_BASE_URL;
  const res = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.VAPI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: process.env.MY_PHONE_NUMBER },
      assistant: {
        firstMessage,
        model: {
          provider: 'anthropic',
          maxTokens: 150,
          model: process.env.VAPI_MODEL || 'claude-sonnet-5',
          messages: [{ role: 'system', content: PROMPT + '\n\nCall notes (private):\n' + context }],
        },
        voice: { provider: '11labs', model: 'eleven_flash_v2_5', voiceId: process.env.ELEVENLABS_VOICE_ID },
        server: { url: baseUrl + '/api/call-ended', secret: process.env.VAPI_WEBHOOK_SECRET },
        serverMessages: ['end-of-call-report'],
        endCallPhrases: ['goodbye', 'talk later'],
        backgroundSound: 'off',
        startSpeakingPlan: { waitSeconds: 0.3 },
        maxDurationSeconds: 300,
      },
    }),
  });
  if (!res.ok) throw new Error('Vapi ' + res.status + ': ' + (await res.text()));
  return res.json();
}
