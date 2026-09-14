/* 由 tools/extract-overview.mjs 生成，别手改：docs/hifi/overview.html 的定稿脚本 */
(function () {
  "use strict";

  var WEEK_LABELS = ["2026-W32", "2026-W33", "2026-W34", "2026-W35", "2026-W36"];
  var DAY_LABELS = ["08-21", "08-22", "08-23", "08-24", "08-25", "08-26", "08-27", "08-28", "08-29", "08-30", "08-31", "09-01", "09-02", "09-03"];

  var VER = {
    v03: {
      state: { cls: "tag-warning", text: "进行中" },
      chip: "v0.3 · 本周",
      goalNote: true,
      goal: "把总览做成能看清目标、版本进度和代码仓过程的健康看板。",
      bar: { doing: 2, todo: 2, done: 0, review: 0 },
      progress: "",
      progressEmpty: "还没有周进展"
    },
    v02: {
      state: { cls: "tag-success", text: "已发 · tag v0.2" },
      chip: "v0.2",
      goalNote: false,
      goal: "",
      bar: null,
      progress: "",
      progressEmpty: "还没有周进展"
    }
  };

  var SCOPES = [
    {
      id: "overall",
      label: "主要",
      lags: [
        {
          id: "lag-projects",
          name: "纳入 workbench 管理的项目数",
          target: "≥3",
          targetN: 3,
          collect: "manual",
          weekValue: 7,
          dayValue: 7,
          week: [null, null, null, 7, null],
          day: [null, null, null, null, null, null, null, 7, null, null, null, null, null, null]
        },
        {
          id: "lag-demo",
          name: "注释 · 第二条滞后",
          note: true,
          target: "≥1",
          targetN: 1,
          collect: "script",
          weekValue: 3,
          dayValue: 1,
          week: [null, 1, 1, 2, 3],
          day: [null, null, null, null, null, null, 1, 1, 1, 2, 2, 2, 3, 1]
        }
      ],
      leads: [
        {
          id: "lead-closed",
          name: "每周闭环的 issue 数",
          leads: "纳入 workbench 管理的项目数",
          target: "≥1",
          targetN: 1,
          weekValue: 16,
          dayValue: 7,
          week: [0, 0, 0, 21, 16],
          day: [0, 0, 0, 0, 1, 4, 5, 0, 11, 0, 2, 3, 4, 7]
        },
        {
          id: "lead-unlinked",
          name: "注释 · 未写 leads 的引领",
          note: true,
          leads: "",
          target: "≥2",
          targetN: 2,
          weekValue: 4,
          dayValue: 1,
          week: [1, 1, 2, 3, 4],
          day: [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 1]
        },
        {
          id: "lead-demo",
          name: "注释 · 盯第二条滞后",
          note: true,
          leads: "注释 · 第二条滞后",
          target: "≥1",
          targetN: 1,
          weekValue: 5,
          dayValue: 2,
          week: [2, 2, 3, 4, 5],
          day: [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 2]
        }
      ]
    }
  ];

  var SDLC = {
    week: {
      labels: WEEK_LABELS,
      commits: [194, 51, 230, 244, 181],
      prs: [0, 0, 0, 17, 18],
      issues: [0, 0, 0, 11, 11],
      now: { commits: 181, prs: 18, issues: 11 }
    },
    day: {
      labels: DAY_LABELS,
      commits: [53, 9, 6, 21, 10, 54, 18, 32, 109, 0, 70, 61, 37, 13],
      prs: [0, 0, 0, 0, 1, 5, 2, 1, 8, 0, 4, 5, 5, 4],
      issues: [0, 0, 0, 0, 4, 9, 14, 17, 11, 11, 18, 16, 16, 11],
      now: { commits: 13, prs: 4, issues: 11 }
    }
  };

  var COLORS = {
    lag: "var(--color-accent-2)",
    lead: ["var(--color-accent)", "var(--color-success)", "var(--color-warning)"],
    commits: "var(--color-accent)",
    prs: "var(--color-accent-2)",
    issues: "var(--color-warning)"
  };

  var bizScope = "overall";
  var bizGrain = "week";
  var sdlcGrain = "week";
  var hidden = {};

  function toast(title, body) {
    var host = document.getElementById("toasts");
    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
      "<div><span class=\"toast-title\"></span><span class=\"toast-body\"></span></div>";
    el.querySelector(".toast-title").textContent = title;
    el.querySelector(".toast-body").textContent = body ? " · " + body : "";
    host.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-toast]");
    if (!t) return;
    ev.preventDefault();
    toast(t.getAttribute("data-toast"), "");
  });

  document.getElementById("btn-collect").addEventListener("click", function () {
    toast("演示：采集住 Workbench，codehub + GitHub 两臂，不铺进被管仓", "");
  });

  function renderVersion(key) {
    var v = VER[key];
    var tag = document.getElementById("ver-state-tag");
    var chip = document.getElementById("proj-ver-chip");
    tag.className = "tag " + v.state.cls;
    tag.textContent = v.state.text;
    chip.textContent = v.chip;

    var goal = document.getElementById("ver-goal");
    if (v.goal) {
      goal.innerHTML = (v.goalNote ? '<span class="tag tag-outline">注释</span> ' : "") + v.goal;
    } else {
      goal.innerHTML = "";
    }

    var note = document.getElementById("week-note");
    note.innerHTML = v.progress
      ? v.progress
      : '<div class="empty">' + v.progressEmpty + "</div>";

    var bar = document.getElementById("ver-bar");
    if (!v.bar) {
      bar.innerHTML = "";
      return;
    }
    var b = v.bar;
    bar.innerHTML =
      '<div class="prog" aria-label="版本进度">' +
        (b.done ? '<span class="prog-done" style="flex:' + b.done + '"></span>' : "") +
        (b.review ? '<span class="prog-review" style="flex:' + b.review + '"></span>' : "") +
        (b.doing ? '<span class="prog-doing" style="flex:' + b.doing + '"></span>' : "") +
        (b.todo ? '<span class="prog-todo" style="flex:' + b.todo + '"></span>' : "") +
      "</div>" +
      '<div class="counts">' +
        "<span>完成 <b>" + b.done + "</b></span>" +
        "<span>进行中 <b>" + b.doing + "</b></span>" +
        "<span>待办 <b>" + b.todo + "</b></span>" +
      "</div>";
  }

  function selectVer(key) {
    document.querySelectorAll("#ver-tabs .tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.getAttribute("data-ver") === key ? "true" : "false");
    });
    renderVersion(key);
  }

  document.querySelectorAll("#ver-tabs .tab").forEach(function (t) {
    t.addEventListener("click", function () {
      selectVer(t.getAttribute("data-ver"));
    });
  });

  function knownOf(values) {
    return values.filter(function (x) { return x !== null && x !== undefined; });
  }

  function yMaxOf(seriesList) {
    var k = [];
    seriesList.forEach(function (s) {
      k = k.concat(knownOf(s.values));
      if (s.target != null) k.push(s.target);
    });
    if (!k.length) return 1;
    return Math.max.apply(null, k.concat([1]));
  }

  function drawChart(host, opt) {
    host.innerHTML = "";
    var labels = opt.labels;
    var series = (opt.series || []).filter(function (s) { return s.on !== false; });
    var any = series.some(function (s) { return knownOf(s.values).length; });
    if (!any) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.style.height = "100%";
      empty.style.display = "flex";
      empty.style.alignItems = "center";
      empty.textContent = opt.empty || "点上面的系列，决定画哪几条";
      host.appendChild(empty);
      return;
    }

    var left = series.filter(function (s) { return s.axis !== "right"; });
    var right = series.filter(function (s) { return s.axis === "right"; });
    var yMaxL = yMaxOf(left.length ? left : series);
    var yMaxR = right.length ? yMaxOf(right) : yMaxL;
    var hasRight = right.length > 0;
    var vh = 148;

    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 640 " + vh);
    svg.setAttribute("role", "img");
    host.appendChild(svg);

    var tip = document.createElement("div");
    tip.className = "chart-tip hidden";
    host.appendChild(tip);

    var pad = { l: 32, r: hasRight ? 32 : 8, t: 10, b: 22 };
    var iw = 640 - pad.l - pad.r;
    var ih = vh - pad.t - pad.b;
    function xAt(i) { return pad.l + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1)); }
    function yAt(v, max) { return pad.t + ih - (v / max) * ih; }

    function el(name, attrs) {
      var n = document.createElementNS(svgNS, name);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      svg.appendChild(n);
      return n;
    }

    var ticks = 3;
    for (var g = 0; g <= ticks; g++) {
      var gy = pad.t + (ih * g) / ticks;
      el("line", {
        x1: pad.l, y1: gy, x2: 640 - pad.r, y2: gy,
        stroke: "var(--color-divider)", "stroke-width": "1"
      });
      if (g === 0 || g === ticks) {
        el("text", {
          x: pad.l - 6, y: gy + 3, fill: "var(--color-neutral-500)",
          "font-family": "var(--font-mono)", "font-size": "10", "text-anchor": "end"
        }).textContent = String(Math.round(yMaxL - (yMaxL * g) / ticks));
        if (hasRight) {
          el("text", {
            x: 640 - pad.r + 6, y: gy + 3, fill: "var(--color-neutral-500)",
            "font-family": "var(--font-mono)", "font-size": "10", "text-anchor": "start"
          }).textContent = String(Math.round(yMaxR - (yMaxR * g) / ticks));
        }
      }
    }

    series.forEach(function (s) {
      if (s.target == null) return;
      var max = s.axis === "right" ? yMaxR : yMaxL;
      el("line", {
        x1: pad.l, y1: yAt(s.target, max), x2: 640 - pad.r, y2: yAt(s.target, max),
        stroke: s.color, "stroke-width": "1", "stroke-dasharray": "3 3", opacity: "0.4"
      });
    });

    labels.forEach(function (w, i) {
      var step = labels.length > 10 ? 3 : 1;
      if (i % step !== 0 && i !== labels.length - 1) return;
      el("text", {
        x: xAt(i), y: vh - 6, fill: "var(--color-neutral-600)",
        "font-family": "var(--font-mono)", "font-size": "10", "text-anchor": "middle"
      }).textContent = String(w).replace("2026-", "");
    });

    function segments(values) {
      var segs = [];
      var cur = [];
      values.forEach(function (v, i) {
        if (v === null || v === undefined) {
          if (cur.length) { segs.push(cur); cur = []; }
        } else {
          cur.push([i, v]);
        }
      });
      if (cur.length) segs.push(cur);
      return segs;
    }

    var cross = el("line", {
      x1: 0, y1: pad.t, x2: 0, y2: pad.t + ih,
      stroke: "var(--color-neutral-500)", "stroke-width": "1", opacity: "0"
    });

    function showTip(i, cx, cy) {
      var rows = series.map(function (s) {
        var v = s.values[i];
        var shown = (v === null || v === undefined) ? "—" : v;
        return '<div class="vl">' + s.name + " · " + shown + "</div>";
      }).join("");
      tip.innerHTML = '<div class="wk">' + labels[i] + "</div>" + rows;
      tip.classList.remove("hidden");
      var rect = host.getBoundingClientRect();
      tip.style.left = ((cx / 640) * rect.width) + "px";
      tip.style.top = ((cy / vh) * rect.height) + "px";
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      cross.setAttribute("opacity", "0.35");
    }

    function hideTip() {
      tip.classList.add("hidden");
      cross.setAttribute("opacity", "0");
    }

    series.forEach(function (s, si) {
      var max = s.axis === "right" ? yMaxR : yMaxL;
      var segs = segments(s.values);
      if (s.fill) {
        segs.forEach(function (seg) {
          if (seg.length < 2) return;
          var d = seg.map(function (p, idx) {
            return (idx ? "L" : "M") + xAt(p[0]) + " " + yAt(p[1], max);
          }).join(" ");
          d += " L" + xAt(seg[seg.length - 1][0]) + " " + (pad.t + ih);
          d += " L" + xAt(seg[0][0]) + " " + (pad.t + ih) + " Z";
          el("path", { d: d, fill: s.color, opacity: "0.12", stroke: "none" });
        });
      }
      segs.forEach(function (seg) {
        if (seg.length < 2) return;
        var d = seg.map(function (p, idx) {
          return (idx ? "L" : "M") + xAt(p[0]) + " " + yAt(p[1], max);
        }).join(" ");
        el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": si === 0 ? "2" : "1.6", "stroke-linejoin": "round" });
      });
      s.values.forEach(function (v, i) {
        if (v === null || v === undefined) return;
        var cx = xAt(i);
        var cy = yAt(v, max);
        var hit = el("circle", { cx: cx, cy: cy, r: "9", fill: "transparent", style: "cursor:pointer" });
        var dot = el("circle", {
          cx: cx, cy: cy, r: s.fill ? "4.5" : "3.5",
          fill: "var(--color-card)", stroke: s.color, "stroke-width": "2"
        });
        hit.addEventListener("mouseenter", function () { showTip(i, cx, cy); });
        hit.addEventListener("mouseleave", hideTip);
        dot.addEventListener("mouseenter", function () { showTip(i, cx, cy); });
        dot.addEventListener("mouseleave", hideTip);
      });
    });
  }

  function currentScope() {
    return SCOPES.filter(function (s) { return s.id === bizScope; })[0] || SCOPES[0];
  }

  function groupPlots(scope) {
    var lags = scope.lags || [];
    var leads = scope.leads || [];
    if (!lags.length) return [];
    var first = lags[0].name;
    var by = {};
    lags.forEach(function (lag) {
      by[lag.name] = { lag: lag, leads: [] };
    });
    leads.forEach(function (lead) {
      var key = (lead.leads || "").trim();
      if (!key || !by[key]) key = first;
      by[key].leads.push(lead);
    });
    return lags.map(function (lag) { return by[lag.name]; });
  }

  function shownVal(m) {
    var v = bizGrain === "day" ? m.dayValue : m.weekValue;
    return (v === null || v === undefined) ? "—" : v;
  }

  function renderBiz() {
    var tabs = document.getElementById("biz-tabs");
    tabs.innerHTML = SCOPES.map(function (s) {
      return (
        '<button type="button" class="tab" role="tab" data-scope="' + s.id + '"' +
        (s.id === bizScope ? ' aria-selected="true"' : ' aria-selected="false"') + ">" +
        s.label + "</button>"
      );
    }).join("");
    tabs.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        bizScope = t.getAttribute("data-scope");
        renderBiz();
      });
    });

    var host = document.getElementById("biz-plots");
    host.innerHTML = "";
    var plots = groupPlots(currentScope());
    host.className = "plots" + (plots.length > 1 ? " is-multi" : "");
    host.setAttribute("data-count", String(plots.length));
    plots.forEach(function (plot, pi) {
      var wrap = document.createElement("div");
      wrap.className = "plot";
      var seriesList = [{ kind: "滞后", m: plot.lag, color: COLORS.lag, axis: "left", fill: true }].concat(
        plot.leads.map(function (l, i) {
          return { kind: "引领", m: l, color: COLORS.lead[i % COLORS.lead.length], axis: "right", fill: false };
        })
      );

      var list = document.createElement("div");
      list.className = "series";
      list.setAttribute("role", "list");
      seriesList.forEach(function (s) {
        var on = hidden[s.m.id] !== true;
        var row = document.createElement("div");
        row.className = "series-row";
        row.setAttribute("role", "listitem");
        row.style.setProperty("--swatch", s.color);
        var manual = (s.kind === "滞后" && s.m.collect === "manual")
          ? ('<span class="manual-slot">' +
              '<input class="input mono" id="lag-input-' + pi + '" type="text" inputmode="numeric" aria-label="手填 ' + s.m.name + '" value="' +
                (s.m.weekValue == null ? "" : s.m.weekValue) + '">' +
              '<button type="button" class="btn btn-ghost btn-sm" data-lag-save="' + pi + '">记下</button>' +
              '<span class="field-help">手填</span>' +
            "</span>")
          : "";
        row.innerHTML =
          '<label class="series-toggle">' +
            '<input type="checkbox"' + (on ? " checked" : "") + '>' +
            '<i class="swatch"></i>' +
            '<span class="name">' + s.m.name + "</span>" +
          "</label>" +
          manual +
          '<span class="kind">' + s.kind + "</span>" +
          '<span class="val">' + shownVal(s.m) + "</span>" +
          '<span class="tgt">' + s.m.target + "</span>";
        row.querySelector("input[type=checkbox]").addEventListener("change", function (ev) {
          hidden[s.m.id] = !ev.target.checked;
          renderBiz();
        });
        list.appendChild(row);
      });
      wrap.appendChild(list);

      var chart = document.createElement("div");
      chart.className = "chart-wrap";
      chart.setAttribute("aria-label", plot.lag.name);
      wrap.appendChild(chart);

      host.appendChild(wrap);

      var labels = bizGrain === "day" ? DAY_LABELS : WEEK_LABELS;
      drawChart(chart, {
        labels: labels,
        series: seriesList.map(function (s) {
          return {
            name: s.m.name,
            values: bizGrain === "day" ? s.m.day : s.m.week,
            color: s.color,
            axis: s.axis,
            fill: s.fill,
            target: s.m.targetN,
            on: hidden[s.m.id] !== true
          };
        })
      });
    });

    host.querySelectorAll("[data-lag-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = btn.getAttribute("data-lag-save");
        var plot = groupPlots(currentScope())[+i];
        var input = document.getElementById("lag-input-" + i);
        var v = input ? input.value.trim() : "";
        toast("记下「" + plot.lag.name + "」", v ? v + "（不写回仓）" : "空值未记");
      });
    });
  }

  function renderSdlc() {
    var pack = SDLC[sdlcGrain];
    document.getElementById("sdlc-commits").textContent = pack.now.commits;
    document.getElementById("sdlc-prs").textContent = pack.now.prs;
    document.getElementById("sdlc-issues").textContent = pack.now.issues;
    [
      ["chart-commits", "提交", pack.commits, COLORS.commits],
      ["chart-prs", "合入 PR", pack.prs, COLORS.prs],
      ["chart-issues", "未处理 issue", pack.issues, COLORS.issues]
    ].forEach(function (row) {
      drawChart(document.getElementById(row[0]), {
        labels: pack.labels,
        empty: "无观测",
        series: [{ name: row[1], values: row[2], color: row[3], axis: "left", fill: true, on: true }]
      });
    });
  }

  document.querySelectorAll('input[name="biz-grain"]').forEach(function (el) {
    el.addEventListener("change", function () {
      if (el.checked) { bizGrain = el.value; renderBiz(); }
    });
  });
  document.querySelectorAll('input[name="sdlc-grain"]').forEach(function (el) {
    el.addEventListener("change", function () {
      if (el.checked) { sdlcGrain = el.value; renderSdlc(); }
    });
  });

  selectVer("v03");
  renderBiz();
  renderSdlc();
})();
