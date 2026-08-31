//! 目标门槛的判读 —— 纯函数,「指标见红」判据的唯一比对点。
//!
//! 目标是人手写的迷你门槛(`≥5` `≤24h` `≥80%`),读数是脚本或人原样给的值
//! (`12`、`87%`、`3.2h`)。这里只做两件事:认出方向、从两边各挑出第一个数。
//! **认不出就是「判不了」,不是「没越线」也不是「越线」** —— 调用方把判不了
//! 的当不参与,绝不猜。

/// 目标与读数比出「越线没有」。
///
/// - `None` = 判不了:目标空、认不出方向、两边任一边挑不出数。
/// - `Some(true)` = 越线;`Some(false)` = 达标。
///
/// 认五种方向:`≥`(别名 `>=`)、`≤`(别名 `<=`)、严格的 `>` 与 `<`、
/// 恰等的 `=`(偏差即越线)。前缀长的先试,免得 `>=` 被拆成 `>` + `=80`。
pub fn breach(target: &str, value: &str) -> Option<bool> {
    #[derive(Clone, Copy)]
    enum Dir {
        AtLeast,
        AtMost,
        Above,
        Below,
        Exactly,
    }
    const OPS: &[(&str, Dir)] = &[
        ("≥", Dir::AtLeast),
        (">=", Dir::AtLeast),
        ("≤", Dir::AtMost),
        ("<=", Dir::AtMost),
        (">", Dir::Above),
        ("<", Dir::Below),
        ("=", Dir::Exactly),
    ];
    let t = target.trim();
    let (dir, rest) = OPS
        .iter()
        .find_map(|(p, d)| t.strip_prefix(p).map(|r| (*d, r)))?;
    let bound = first_number(rest)?;
    let v = first_number(value)?;
    Some(match dir {
        Dir::AtLeast => v < bound,
        Dir::AtMost => v > bound,
        Dir::Above => v <= bound,
        Dir::Below => v >= bound,
        Dir::Exactly => (v - bound).abs() > f64::EPSILON,
    })
}

/// 从一段人写的文本里挑出第一个数:`24h` → 24,`87%` → 87,`3.2h` → 3.2,
/// `-2` → -2。挑不出给 `None`,不猜。
pub fn first_number(s: &str) -> Option<f64> {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i].is_ascii_digit() {
            let start = if i > 0 && b[i - 1] == b'-' { i - 1 } else { i };
            let mut end = i;
            let mut seen_dot = false;
            while end < b.len() && (b[end].is_ascii_digit() || (b[end] == b'.' && !seen_dot)) {
                if b[end] == b'.' {
                    seen_dot = true;
                }
                end += 1;
            }
            // `3.` 结尾的孤点丢掉,`3.2` 留下 —— parse 自己会拒 `3.`,这里
            // 把结尾的点剥掉再交给它。
            let mut piece = &s[start..end];
            if piece.ends_with('.') {
                piece = &piece[..piece.len() - 1];
            }
            return piece.parse::<f64>().ok();
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_and_percent_are_leniently_parsed() {
        assert_eq!(breach("≥80%", "87%"), Some(false));
        assert_eq!(breach("≥80%", "62%"), Some(true));
        assert_eq!(breach("≤24h", "3.2h"), Some(false));
        assert_eq!(breach("≤24h", "36h"), Some(true));
        assert_eq!(breach(">=5", "5"), Some(false));
        assert_eq!(breach(">5", "5"), Some(true), "严格 > 不含边界");
    }

    #[test]
    fn unparseable_means_no_verdict_not_red() {
        assert_eq!(breach("", "12"), None, "目标未设 = 永不参与");
        assert_eq!(breach("清零", "12"), None, "认不出方向就是判不了");
        assert_eq!(breach("≥5", "还没采到"), None, "读数无数就是判不了");
    }
}
