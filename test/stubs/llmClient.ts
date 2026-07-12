const calls = [];
globalThis.__LLM_CALLS__ = calls;

export async function streamLlm(options) {
  calls.push(options);
  if (options.action === 'tailor') {
    // One complete self-audited editorial plan. The app still performs authoritative provenance,
    // truth, exact-width, and full-page validation before it saves this result.
    const defaultPlan = JSON.stringify({
      summaryCandidates: [
        { rank: 1, text: 'Builds reliable data pipelines.' },
        { rank: 2, text: 'Builds reliable data pipelines.' },
      ],
      experience: [{
        ref: 0,
        claims: [{
          sourceRefs: ['experience:0:bullet:0'],
          candidates: [
            { rank: 1, text: 'Built and maintained SQL pipelines for analytics reporting.' },
            { rank: 2, text: 'Built SQL pipelines that cut report latency.' },
          ],
        }],
      }],
      omissions: [],
      audit: {
        completeResumeReviewed: true,
        narrativeAndSectionBalanceChecked: true,
        everyClaimIndependent: true,
        actionImpactKeptTogether: true,
        sourceCoverageChecked: true,
        exactMetricsChecked: true,
        truthfulnessChecked: true,
        candidateLineFitChecked: true,
        omissionsExplicit: true,
      },
    });
    options.onToken(globalThis.__TAILOR_LLM_RESPONSE__ ?? defaultPlan);
  } else {
    options.onToken(`Generated ${options.action} output.`);
  }
}
