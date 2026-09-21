// 外部代码评审状态的唯一机读查询处；github-summary（CI Summary）与 publish-review（验证 Review 正文）共用。
// 口径：只认当前提交带 `<!-- bw-code-review:SHA -->` 标记的 claude[bot] 结论；未召唤如实返回 none（显灰），
// 查询失败返回 unknown 并带原因——Unknown 不装绿，也不装已评审。
import { execFileSync } from 'node:child_process';

export const reviewMarker = headSha => `<!-- bw-code-review:${headSha} -->`;

export function externalReviewState({ repo, prNumber, headSha, runCommand = execFileSync }) {
  if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { state: 'unknown', reason: '仓库标识不可用' };
  if (!/^[1-9][0-9]*$/.test(String(prNumber))) return { state: 'unknown', reason: 'PR 号不可用' };
  if (!/^[0-9a-f]{40}$/.test(String(headSha))) return { state: 'unknown', reason: '提交 SHA 不可用' };
  try {
    const pages = JSON.parse(runCommand('gh', ['api', `repos/${repo}/issues/${prNumber}/comments`, '--paginate', '--slurp'], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }));
    const marker = reviewMarker(headSha);
    const found = pages.flat().filter(comment => comment.user?.login === 'claude[bot]' && comment.body?.trimStart().startsWith(marker)).at(-1);
    return found ? { state: 'reviewed', url: found.html_url } : { state: 'none' };
  } catch (error) {
    return { state: 'unknown', reason: error.message };
  }
}

export function reviewStateLine(state) {
  if (state.state === 'reviewed') return `外部代码评审：[当前提交的评审结论](${state.url})（claude[bot]，机读回执）`;
  if (state.state === 'none') return '外部代码评审：未召唤（灰）——当前提交没有外部评审结论。这不是失败，也不代表默认已评审；需要时在 PR 评论单独一行发 `/code-review` 召唤。';
  return `外部代码评审：状态读取失败（灰）——${state.reason}`;
}
