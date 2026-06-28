const calls = [];
globalThis.__LLM_CALLS__ = calls;

export async function streamLlm(options) {
  calls.push(options);
  options.onToken(`Generated ${options.action} output.`);
}
