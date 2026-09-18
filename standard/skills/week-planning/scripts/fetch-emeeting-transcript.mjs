#!/usr/bin/env node
// fetch-emeeting-transcript.mjs
// 抓取华为 eMeeting「语音转文字」转写稿（经 #219 真实会议验证：90 分钟 / 52,556 字符，两次抓取一致）。
// 依赖：web-access 的 CDP proxy（先 `node check-deps.mjs --browser chrome` 起好，监听 localhost:3456）
//       + 本机 Chrome 已登录华为域。两者任一缺失即失败退出，不产出部分文件。
//
// 用法：
//   node fetch-emeeting-transcript.mjs <会议aiSummary完整URL或meetingId> [输出文件]
// 例：
//   node fetch-emeeting-transcript.mjs "https://w3.huawei.com/emeeting/#/aiSummary/871992DE200E3C37DF89417CCD4023C8/4"
//
// 异常分支（均以非零退出码 + stderr 中文原因结束，由 planning.py 记入 meeting 任务 failed.error）：
//   - CDP proxy 未启动：连接 localhost:3456 被拒绝
//   - Chrome 未登录华为域 / 页面结构变化：找不到「语音转文字」标签
//   - 会议无转写数据 / 未加载完成：容器 innerText 为空

const PROXY = "http://localhost:3456";

function usage() {
  console.error("用法: node fetch-emeeting-transcript.mjs <URL或meetingId> [输出文件]");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) usage();
const url = arg.startsWith("http")
  ? arg
  : `https://w3.huawei.com/emeeting/#/aiSummary/${arg}/4`;
const outFile = process.argv[3] ||
  `emeeting_transcript_${Date.now()}.txt`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function proxy(path, init) {
  let r;
  try {
    r = await fetch(`${PROXY}${path}`, init);
  } catch (e) {
    if (e.code === "ECONNREFUSED" || /fetch failed/i.test(e.message)) {
      throw new Error(`CDP proxy 未启动（${PROXY} 连接被拒）：请先运行 web-access 的 check-deps.mjs --browser chrome 启动代理`);
    }
    throw e;
  }
  return r;
}

async function newTab(targetUrl) {
  const r = await proxy("/new", { method: "POST", body: targetUrl });
  const j = await r.json();
  return j.targetId;
}
async function info(id) {
  const r = await proxy(`/info?target=${id}`);
  return r.json();
}
async function evalJs(id, expr) {
  const r = await proxy(`/eval?target=${id}`, { method: "POST", body: expr });
  const j = await r.json();
  if (j.error) throw new Error("eval error: " + j.error);
  return j.value;
}
async function closeTab(id) {
  await proxy(`/close?target=${id}`);
}

const wait = async (id, ms) => {
  for (let i = 0; i < ms / 500; i++) {
    const inf = await info(id);
    if (inf.ready === "complete") return;
    await sleep(500);
  }
};

async function main() {
  const id = await newTab(url);
  console.error("[fetch] tab opened:", id);
  try {
    await sleep(2500);
    await wait(id, 15000);

    // 切到「语音转文字」标签：按 innerText 匹配，不依赖坐标
    const clickRes = await evalJs(
      id,
      `(function(){
        const all = document.body.getElementsByTagName('*');
        let best = null;
        for (const e of all) {
          const t = (e.innerText || '').trim();
          if (t === '语音转文字' && (!best || e.textContent.length <= best.textContent.length)) best = e;
        }
        if (!best) return 'TAB_NOT_FOUND';
        best.click();
        return 'clicked:' + best.tagName + '.' + (best.className || '').slice(0, 30);
      })()`
    );
    console.error("[fetch] switch tab:", clickRes);
    if (clickRes === "TAB_NOT_FOUND") throw new Error("找不到「语音转文字」标签（页面未登录或结构变了）");
    await sleep(2500);

    // 取转写容器全文（分片，避免单次返回过大）
    const CHUNK = 27000;
    const lenRes = await evalJs(
      id,
      `(function(){
        const c = document.querySelector('[class*=overflow-auto]');
        const t = c ? c.innerText : '';
        return JSON.stringify({len: t.length, head: t.slice(0, 80)});
      })()`
    );
    const meta = JSON.parse(lenRes);
    console.error("[fetch] transcript length:", meta.len, "head:", JSON.stringify(meta.head));
    const total = meta.len;
    if (!total) throw new Error("转写内容为空：会议可能没有语音转写数据，或页面尚未加载完成；确认会议已结束且生成了转写");

    let full = "";
    for (let i = 0; i < total; i += CHUNK) {
      const expr = `(function(){const c=document.querySelector('[class*=overflow-auto]');const t=c?c.innerText:'';return t.slice(${i},${i + CHUNK});})()`;
      full += await evalJs(id, expr);
      process.stderr.write(`  got ${full.length}/${total}\n`);
    }

    const { writeFileSync } = await import("node:fs");
    writeFileSync(outFile, full, "utf8");
    console.error(`[fetch] done -> ${outFile} (${full.length} chars)`);
  } finally {
    await closeTab(id).catch(() => {});
  }
}

main().catch((e) => {
  console.error("[fetch] FAILED:", e.message);
  process.exit(1);
});
