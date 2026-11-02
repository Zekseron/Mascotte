'use strict';
const readline = require('node:readline');
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
let approval, question, method;
readline.createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: {} });
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    method = m.method; send({ id: m.id, result: { thread: { id: m.params.threadId || 'session-fixture' } } });
  }
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: 'turn-fixture' } } });
    send({ method: 'item/started', params: { item: { type: 'fileChange', changes: [{ path: 'prova.txt', diff: '+ciao' }] } } });
    send({ id: 'approve-1', method: 'item/commandExecution/requestApproval', params: { command: 'echo prova', cwd: process.cwd() } });
  }
  if (m.id === 'approve-1') {
    approval = m.result.decision;
    send({ id: 'question-1', method: 'item/tool/requestUserInput', params: { questions: [{ id: 'name', question: 'Nome del file?', options: [] }] } });
  }
  if (m.id === 'question-1') {
    question = m.result.answers.name.answers[0];
    send({ method: 'item/completed', params: { item: { type: 'agentMessage', text: JSON.stringify({ approval, question, method }) } } });
    send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'completed' } } });
  }
});
