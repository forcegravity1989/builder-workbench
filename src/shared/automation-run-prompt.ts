/**
 * A manual run may carry one-shot context (e.g. BW material problems) that must
 * reach the session exactly once, in order, together with the saved prompt.
 * Combining happens at dispatch so the automation record is never rewritten and
 * no second delivery channel can race the saved prompt.
 */
export function combineAutomationRunPrompt(prompt: string, oneShotPrompt?: string | null): string {
  const extra = oneShotPrompt?.trim()
  return extra ? `${prompt}\n\n${extra}` : prompt
}
