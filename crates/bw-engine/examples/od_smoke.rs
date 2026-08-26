//! od_smoke —— 验 Open Design 探活(命名管道/socket 握手 → loopback http url)。
//!
//! `cargo run -p bw-engine --example od_smoke`
//!
//! OD 没起 → 退出 1 + "NOT FOUND";起来了 → 退出 0 + 打印 `http://127.0.0.1:<port>`。
//! 不碰 claude、不碰网关,纯本机命名管道握手(设计 §13.3 读回手段)。

#[tokio::main]
async fn main() {
    match bw_engine::open_design::discover_web_url().await {
        Some(url) => {
            println!("OD FOUND: {url}");
        }
        None => {
            eprintln!(
                "OD NOT FOUND —— Open Design 没起,或没探到 web 端口(管道握手没拿到 loopback URL)"
            );
            std::process::exit(1);
        }
    }
}
