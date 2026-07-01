const calls = [];
globalThis.__LLM_CALLS__ = calls;

export async function streamLlm(options) {
  calls.push(options);
  if (options.action === 'tailor') {
    // The structured tailor path expects a JSON reword/reorder patch. Reword role 0's bullet (no new
    // number, no foreign tech → passes the grounding guard) and leave the summary to the source, so
    // the review surfaces a real change the G3-persistence test can restore/re-persist.
    options.onToken(
      '{"experience":[{"ref":0,"bullets":["Built and maintained SQL pipelines for analytics reporting."]}]}',
    );
  } else {
    options.onToken(`Generated ${options.action} output.`);
  }
}
