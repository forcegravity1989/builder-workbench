/**
 * Rewrite a draft so it can use the planning assistant's unsent launch.
 * Windows PowerShell splits an ASCII " out of Claude --prefill and submits the leftover text.
 * Fullwidth quotes and a single line keep the whole draft in that one argument.
 */
export function rewritePromptForPlanningDraft(prompt: string): string {
  return prompt.replaceAll('"', '＂').replace(/\r\n|\r|\n/g, '⏎')
}
