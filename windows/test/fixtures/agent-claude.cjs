'use strict';
const readline = require('node:readline');
const session_id = '3b044866-76c2-4a91-9342-cb23fe5dbad0';
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.type === 'control_request') send({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
  if (m.type === 'user') {
    send({ type: 'system', subtype: 'init', session_id, tools: ['Write'], model: 'fixture' });
    send({ type: 'control_request', request_id: 'permission-fixture', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'prova.txt', content: 'sintetico' }, tool_use_id: 'tool-fixture' } });
  }
  if (m.type === 'control_response' && m.response.request_id === 'permission-fixture') {
    const result = m.response.response.behavior;
    send({ type: 'result', subtype: 'success', is_error: false, result, session_id, duration_ms: 1, duration_api_ms: 0, num_turns: 1, total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [] });
  }
});
