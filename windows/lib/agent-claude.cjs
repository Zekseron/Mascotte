'use strict';
const { spawnAgent, stopProcess } = require('./agent-process.cjs');

function runClaude({ command, cwd, prompt, image, sessionId, onSession, onEvent, ask, loadSDK = () => import('@anthropic-ai/claude-agent-sdk') }) {
  const abortController = new AbortController();
  let query, child, stopped = false;
  const promise = (async () => {
    const sdk = await loadSDK();
    if (stopped) throw new Error('Attività interrotta.');
    const content = [{ type: 'text', text: prompt }];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
    async function* input() { yield { type: 'user', session_id: sessionId || '', message: { role: 'user', content }, parent_tool_use_id: null }; }
    query = sdk.query({ prompt: input(), options: {
      cwd, abortController, ...(sessionId ? { resume: sessionId } : {}), persistSession: true,
      pathToClaudeCodeExecutable: command.file, permissionMode: 'default', settingSources: [],
      includePartialMessages: true, maxTurns: 100,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Sei l’agente di Mascotte. Lavora nella cartella scelta. Pubblicazioni, invii a terzi e operazioni distruttive richiedono una richiesta esplicita dell’utente. Rispondi nella sua lingua.' },
      spawnClaudeCodeProcess(options) {
        // Il SDK costruisce il protocollo; il processo resta la CLI installata scelta da Mascotte.
        child = spawnAgent(command, options.args, cwd, options.env); return child;
      },
      async canUseTool(toolName, input) {
        if (toolName === 'AskUserQuestion') {
          const questions = (input.questions || []).map((q, i) => ({ id: String(i), question: q.question, options: q.options }));
          const answers = await ask({ kind: 'questions', title: 'Claude chiede un chiarimento', questions });
          if (!answers) return { behavior: 'deny', message: 'Richiesta annullata.' };
          return { behavior: 'allow', updatedInput: { ...input, answers: Object.fromEntries(questions.map(q => [q.question, answers[q.id]])) } };
        }
        const approved = await ask({ kind: 'approval', title: 'Consentire a Claude: ' + toolName + '?', detail: JSON.stringify(input, null, 2) });
        return approved ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'Operazione rifiutata dall’utente.' };
      }
    } });
    let text = '', completed = false;
    try {
      for await (const message of query) {
        if (message.session_id) onSession(message.session_id);
        if (message.type === 'assistant') {
          for (const item of message.message?.content || []) {
            if (item.type === 'text') { text = item.text; onEvent({ liveText: text }); }
            if (item.type === 'tool_use') onEvent({ title: item.name, detail: JSON.stringify(item.input, null, 2) });
          }
        }
        if (message.type === 'stream_event' && message.event?.type === 'content_block_delta' && message.event.delta?.type === 'text_delta') onEvent({ delta: message.event.delta.text });
        if (message.type === 'result') {
          if (message.is_error || message.subtype !== 'success') throw new Error((message.errors || []).join('\n') || message.result || 'Claude non ha completato il turno.');
          text = message.result || text; completed = true;
        }
      }
      if (!completed) throw new Error('Claude si è chiuso prima della fine del turno.');
      return text || 'Attività completata.';
    } finally { stopProcess(child); query.close(); }
  })();
  return { promise, stop() { if (stopped) return; stopped = true; stopProcess(child); abortController.abort(); query?.close(); } };
}
module.exports = { runClaude };
