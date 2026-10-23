// DOM acquisition inherits https://github.com/forcegravity1989/builder-workbench/issues/374; transport is native browser RPC.
export function meetingPageExpression(
  meetingId: string,
  action: string,
  args: Record<string, unknown> = {}
): string {
  return `(async () => {
    const input = ${JSON.stringify({ meetingId, action, ...args })};
    if (location.origin !== 'https://w3.huawei.com' || !location.hash.toUpperCase().includes('/AISUMMARY/' + input.meetingId + '/')) {
      return { error: 'meeting-login-required', message: '请在此原生浏览器页完成企业登录并打开指定会议，再使用返回的 --page 重试。' };
    }
    const text = (el) => (el?.innerText || '').trim();
    const findText = (value) => Array.from(document.body.querySelectorAll('*'))
      .filter((el) => text(el) === value)
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const fingerprint = (value) => {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
      return (hash >>> 0).toString(16);
    };
    const title = text(document.querySelector('.m-ai-left'));
    const notice = (document.body.innerText || '').match(/内容过短[^\\n]*|未检测到足够的有效内容[^\\n]*|未生成纪要/);
    if (notice) return { error: 'meeting-transcript-unavailable', message: notice[0] };
    const transcriptTab = findText('语音转文字');
    if (input.action === 'ready') return { ready: !!transcriptTab, title };
    if (input.action === 'inventory-open') {
      const trigger = Array.from(document.querySelectorAll('span'))
        .filter((el) => /录制-\\d+-\\d+/.test(text(el)))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (trigger) trigger.click();
      return { selector: !!trigger, title };
    }
    if (input.action === 'inventory') {
      return { recordings: Array.from(document.querySelectorAll('.m-ai-record-item')).map((el, index) => {
        const label = text(el);
        return { index: index + 1, name: label.match(/录制-\\d+-\\d+/)?.[0] || label.split('\\n')[0], label };
      }) };
    }
    if (input.action === 'pick') {
      const matches = Array.from(document.querySelectorAll('.m-ai-record-item')).filter((el) => text(el) === input.label);
      if (matches.length !== 1) return { error: 'meeting-recordings-unavailable', message: '录制选择器已变化，请重新列举。' };
      matches[0].click();
      return { picked: true };
    }
    if (input.action === 'transcript-tab') {
      // pageRendered: the meeting body (.m-ai-left title) is on screen, so a missing
      // 「语音转文字」tab means this recording has no transcript — not a cold page.
      if (!transcriptTab) return { clicked: false, title, pageRendered: !!title };
      transcriptTab.click();
      return { clicked: true, title };
    }
    if (input.action === 'topics') {
      const endpoint = '/emeeting/server/api/v1/meeting/' + input.meetingId + '/topic/list';
      try {
        const response = await fetch(endpoint, { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
        if (!response.ok) return { status: 'unavailable', endpoint, reason: 'HTTP ' + response.status };
        return { status: 'received', endpoint, data: await response.json() };
      } catch (error) { return { status: 'unavailable', endpoint, reason: String(error) }; }
    }
    const container = document.querySelector('[class*=overflow-auto]');
    const value = container?.innerText || '';
    if (!value.trim()) return { error: 'meeting-transcript-empty', message: '转写内容为空，请在保留的会议页检查转写是否完成。' };
    const meta = { ready: true, title, length: value.length, fingerprint: fingerprint(value) };
    if (input.action === 'chunk') {
      return { ...meta, text: value.slice(input.offset, input.offset + input.size) };
    }
    return meta;
  })()`
}
