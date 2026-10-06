import assert from 'node:assert/strict';
import {
  resultOf,
  markupOf,
} from '../../../../maya-carrier-react/test/.bundle.mjs';
import { createLiveSubmission } from '../../../../maya-chat-shell/src/shell/intents.ts';
import {
  projectWidgetIntent,
  projectWidgetResolve,
  projectChat,
} from '../../../../maya-chat-shell/src/net/project.ts';
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const { baseUrl, token, submission, chatResponse } = JSON.parse(raw);
if (chatResponse) {
  const chat = projectChat(chatResponse, chatResponse.request_id);
  assert.ok(chat);
  assert.equal(chat.action_status, null);
  assert.equal(chat.resolution.receipt.widget_id, submission.widget_id);
}
const url = new URL(baseUrl);
if (url.hostname !== '127.0.0.1') throw new Error('proof requires loopback');
const post = async (path, body, project) => {
  const response = await fetch(`${baseUrl}/api/widgets/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  const value = project(json);
  if (!response.ok || !value)
    throw new Error(JSON.stringify({ status: response.status, json }));
  return { ok: true, value };
};
const page = await post(
  'resolve',
  { thread_page: { limit: 20 } },
  projectWidgetResolve,
);
const envelope = page.value.widgets.find(
  (w) => w.envelope.widget_id === submission.widget_id,
)?.envelope;
assert.ok(envelope);
const result = resultOf(envelope, new Date().toISOString());
assert.notEqual(result.mode, 'frozen_prose');
const html = markupOf({
  id: 'schedule-proof',
  result,
  display: 'live',
  pending: null,
  sentence: null,
});
assert.ok(html.includes('Подтвердить изменение графика'));
assert.ok(html.includes(envelope.body.diff[0].to.label));
const carrier = createLiveSubmission({
  widgetIntent: (b) => post('intent', b, projectWidgetIntent),
  resolveWidgets: (b) => post('resolve', b, projectWidgetResolve),
});
process.stdout.write(
  JSON.stringify(
    await carrier.submit(submission, new AbortController().signal),
  ),
);
