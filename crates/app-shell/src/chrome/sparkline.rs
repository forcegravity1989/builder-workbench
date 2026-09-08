//! 总览折线 —— 内联 SVG,不引图表库。业务图和 SDLC 走同一套:
//! 从 0 起的纵轴、悬停读数、点断开不补 0。几何对齐 `docs/hifi/overview-36.html`。

use dioxus::prelude::*;

/// 一条走势线。
pub struct Series {
    /// 悬停提示里的名字。
    pub label: String,
    /// `(x 轴标签, 值)`,旧的在前。`None` = 那一格没采到,画的时候断开。
    pub points: Vec<(String, Option<f64>)>,
    /// CSS 变量名,如 `var(--color-accent)`。
    pub color: &'static str,
}

/// 总览合图上的一条线。左轴滞后、右轴引领。`on = false` 不画。
#[derive(Clone, PartialEq)]
pub struct MultiSeries {
    pub name: String,
    pub points: Vec<(String, Option<f64>)>,
    pub color: &'static str,
    pub right: bool,
    pub fill: bool,
    pub on: bool,
}

const VW: f64 = 640.0;
const VH: f64 = 148.0;
const PAD_T: f64 = 10.0;
const PAD_B: f64 = 22.0;
const PAD_L: f64 = 32.0;

pub fn trend_chart(s: &Series) -> Element {
    rsx! {
        TrendChart {
            series: vec![MultiSeries {
                name: s.label.clone(),
                points: s.points.clone(),
                color: s.color,
                right: false,
                fill: true,
                on: true,
            }]
        }
    }
}

/// 多系列双轴。没勾上或没数的线不画;一个已知点都没有就写「尚无观测」。
pub fn trend_chart_multi(series: &[MultiSeries]) -> Element {
    rsx! { TrendChart { series: series.to_vec() } }
}

#[component]
fn TrendChart(series: Vec<MultiSeries>) -> Element {
    let mut hover = use_signal(|| None::<usize>);
    let on: Vec<&MultiSeries> = series.iter().filter(|s| s.on).collect();
    let n = on.iter().map(|s| s.points.len()).max().unwrap_or(0);
    let labels: Vec<String> = on
        .iter()
        .find(|s| !s.points.is_empty())
        .map(|s| s.points.iter().map(|(l, _)| l.clone()).collect())
        .unwrap_or_default();
    let left_known: Vec<f64> = on
        .iter()
        .filter(|s| !s.right)
        .flat_map(|s| s.points.iter().filter_map(|(_, v)| *v))
        .collect();
    let right_known: Vec<f64> = on
        .iter()
        .filter(|s| s.right)
        .flat_map(|s| s.points.iter().filter_map(|(_, v)| *v))
        .collect();

    if left_known.is_empty() && right_known.is_empty() {
        return rsx! {
            div { class: "ov-chart",
                div { class: "empty", "尚无观测" }
            }
        };
    }

    let has_right = !right_known.is_empty();
    let pad_r = if has_right { 32.0 } else { 8.0 };
    let y_max_l = scale_max(&left_known);
    let y_max_r = if has_right {
        scale_max(&right_known)
    } else {
        y_max_l
    };
    let plot_w = VW - PAD_L - pad_r;
    let plot_h = VH - PAD_T - PAD_B;
    let x_at = |i: usize| -> f64 {
        if n <= 1 {
            PAD_L + plot_w / 2.0
        } else {
            PAD_L + (i as f64 / (n - 1) as f64) * plot_w
        }
    };
    let y_at = |v: f64, max: f64| -> f64 { PAD_T + plot_h - (v / max) * plot_h };
    let plot_bottom = PAD_T + plot_h;
    let skip_label = n > 10;
    let label_step = if n > 10 { 3 } else { 1 };
    let drawn: Vec<DrawnLine> = on
        .iter()
        .enumerate()
        .map(|(si, s)| {
            let max = if s.right { y_max_r } else { y_max_l };
            draw_line(s, n, &x_at, |v| y_at(v, max), si)
        })
        .collect();
    let mut hits = Vec::new();
    for s in &on {
        let max = if s.right { y_max_r } else { y_max_l };
        for (i, (_, v)) in s.points.iter().take(n).enumerate() {
            if let Some(v) = *v {
                hits.push((i, x_at(i), y_at(v, max)));
            }
        }
    }
    let tip = hover().and_then(|i| tip_at(i, &on, &labels, &x_at, y_at, y_max_l, y_max_r));

    rsx! {
        div { class: "ov-chart",
            svg {
                width: "100%",
                height: "100%",
                view_box: "0 0 {VW} {VH}",
                preserve_aspect_ratio: "xMidYMid meet",
                for g in 0..=3 {
                    {
                        let gy = PAD_T + (plot_h * g as f64) / 3.0;
                        let frac = 1.0 - (g as f64) / 3.0;
                        rsx! {
                            g { key: "g{g}",
                                line {
                                    x1: "{PAD_L}", y1: "{gy:.1}", x2: "{VW - pad_r}", y2: "{gy:.1}",
                                    stroke: "var(--color-divider)", stroke_width: "1",
                                }
                                if g == 0 || g == 3 {
                                    text {
                                        x: "{PAD_L - 6.0}", y: "{gy + 3.0:.1}", text_anchor: "end",
                                        class: "chart-tick",
                                        "{fmt_tick(y_max_l * frac)}"
                                    }
                                    if has_right {
                                        text {
                                            x: "{VW - pad_r + 6.0}", y: "{gy + 3.0:.1}", text_anchor: "start",
                                            class: "chart-tick",
                                            "{fmt_tick(y_max_r * frac)}"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                for line in drawn.iter() {
                    g { key: "{line.key}",
                        if line.fill && !line.fill_d.is_empty() {
                            path {
                                d: "{line.fill_d}", fill: "{line.color}",
                                fill_opacity: "0.12", stroke: "none",
                            }
                        }
                        path {
                            d: "{line.d}", fill: "none", stroke: "{line.color}",
                            stroke_width: "2", stroke_linejoin: "round", stroke_linecap: "round",
                        }
                        for (i, (x, y)) in line.dots.iter().enumerate() {
                            circle {
                                key: "c{i}",
                                cx: "{x:.1}", cy: "{y:.1}", r: "3.5",
                                fill: "var(--color-card)", stroke: "{line.color}", stroke_width: "2",
                            }
                        }
                    }
                }
                for (i, label) in labels.iter().enumerate() {
                    if !skip_label || i % label_step == 0 || i + 1 == n {
                        text {
                            key: "xl{i}",
                            x: "{x_at(i):.1}",
                            y: "{plot_bottom + 14.0:.1}",
                            text_anchor: "middle",
                            class: "chart-tick",
                            "{label}"
                        }
                    }
                }
                for (hi, (i, x, y)) in hits.iter().enumerate() {
                    circle {
                        key: "h{hi}",
                        cx: "{x:.1}", cy: "{y:.1}", r: "10",
                        fill: "transparent",
                        class: "chart-hit",
                        onmouseenter: {
                            let i = *i;
                            move |_| hover.set(Some(i))
                        },
                        onmouseleave: move |_| hover.set(None),
                    }
                }
            }
            if let Some(t) = tip {
                div {
                    class: "chart-tip",
                    style: "left:{t.left:.1}%;top:{t.top:.1}%;",
                    div { class: "wk", "{t.label}" }
                    for row in t.rows.iter() {
                        div { class: "vl", "{row}" }
                    }
                }
            }
        }
    }
}

struct Tip {
    label: String,
    rows: Vec<String>,
    left: f64,
    top: f64,
}

fn tip_at(
    i: usize,
    on: &[&MultiSeries],
    labels: &[String],
    x_at: &impl Fn(usize) -> f64,
    y_at: impl Fn(f64, f64) -> f64,
    y_max_l: f64,
    y_max_r: f64,
) -> Option<Tip> {
    let label = labels.get(i)?.clone();
    let rows: Vec<String> = on
        .iter()
        .map(|s| {
            let shown = s
                .points
                .get(i)
                .and_then(|(_, v)| v.map(fmt_tick))
                .unwrap_or_else(|| "—".into());
            format!("{} · {}", s.name, shown)
        })
        .collect();
    let (cx, cy) = on
        .iter()
        .find_map(|s| {
            s.points.get(i).and_then(|(_, v)| {
                v.map(|v| {
                    let max = if s.right { y_max_r } else { y_max_l };
                    (x_at(i), y_at(v, max))
                })
            })
        })
        .unwrap_or((x_at(i), PAD_T + 8.0));
    Some(Tip {
        label,
        rows,
        left: (cx / VW) * 100.0,
        top: (cy / VH) * 100.0,
    })
}

struct DrawnLine {
    key: String,
    color: &'static str,
    d: String,
    fill_d: String,
    fill: bool,
    dots: Vec<(f64, f64)>,
}

fn draw_line(
    s: &MultiSeries,
    n: usize,
    x_at: &impl Fn(usize) -> f64,
    y_at: impl Fn(f64) -> f64,
    si: usize,
) -> DrawnLine {
    let mut d = String::new();
    let mut fill_d = String::new();
    let mut dots = Vec::new();
    let mut pen_down = false;
    let mut first_xy: Option<(f64, f64)> = None;
    let mut last_xy: Option<(f64, f64)> = None;
    let plot_bottom = PAD_T + (VH - PAD_T - PAD_B);
    let close_fill = |fill_d: &mut String, first: Option<(f64, f64)>, last: Option<(f64, f64)>| {
        if let (Some((fx, _)), Some((lx, _))) = (first, last) {
            fill_d.push_str(&format!(
                " L{lx:.1} {plot_bottom:.1} L{fx:.1} {plot_bottom:.1} Z"
            ));
        }
    };
    for (i, (_, v)) in s.points.iter().take(n).enumerate() {
        match v {
            None => {
                if s.fill {
                    close_fill(&mut fill_d, first_xy, last_xy);
                }
                pen_down = false;
                first_xy = None;
                last_xy = None;
            }
            Some(v) => {
                let (x, y) = (x_at(i), y_at(*v));
                dots.push((x, y));
                if pen_down {
                    d.push_str(&format!(" L{x:.1} {y:.1}"));
                    if s.fill {
                        fill_d.push_str(&format!(" L{x:.1} {y:.1}"));
                    }
                } else {
                    d.push_str(&format!(" M{x:.1} {y:.1}"));
                    if s.fill {
                        fill_d.push_str(&format!(" M{x:.1} {y:.1}"));
                    }
                    first_xy = Some((x, y));
                    pen_down = true;
                }
                last_xy = Some((x, y));
            }
        }
    }
    if s.fill {
        close_fill(&mut fill_d, first_xy, last_xy);
    }
    DrawnLine {
        key: format!("ms{si}"),
        color: s.color,
        d,
        fill_d,
        fill: s.fill,
        dots,
    }
}

fn scale_max(known: &[f64]) -> f64 {
    known.iter().copied().fold(0.0_f64, f64::max).max(1.0)
}

fn fmt_tick(v: f64) -> String {
    if (v - v.round()).abs() < 0.05 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}")
    }
}
