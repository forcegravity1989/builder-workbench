/// 比较目标与读数；None 表示无法判断，Some(true) 表示未达目标。
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

/// 提取首个数字，忽略单位后缀；无法解析时返回 None。
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
