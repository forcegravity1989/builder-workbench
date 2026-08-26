//! welink_smoke —— 验 V4 WeLink 群 `send` 的**真 Rust 通路**。
//!
//! `bw_engine::tokio_cmd("welink-cli.cmd")` 在 Windows 上走 `cmd.exe /c
//! welink-cli.cmd im send-to-group …`,参数经 Rust `Command` 逐个传(bash
//! 一行命令复刻不了这条路径的参数引用,故必须用真 Rust 跑)。发出一条带
//! notify 风格特殊字符(【】·→bw://)的文本,既验通路、也验特殊字符没被
//! cmd.exe 吞。
//!
//! `cargo run -p bw --example welink_smoke -- <group-id> [text]`
//!
//! 成功(bash 退出 0)= welink-cli 返 `resultCode:0`;失败退 1,stderr 带原错。

use bw::chat::welink::WelinkChatGroup;
use bw::chat::{ChatGroup, ChatMessage};

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let gid = args
        .get(1)
        .cloned()
        .ok_or("usage: welink_smoke <group-id> [text]")?;
    // 默认文本带 notify 风格的特殊字符,顺带验 cmd.exe 参数引用没吞字。
    let text = args.get(2).cloned().unwrap_or_else(|| {
        "【评审中】#42 示例活标题 · MR !7 待合入 · Builder → bw://open?issue=42".into()
    });
    let g = WelinkChatGroup::new(&gid);
    match g
        .send(&ChatMessage {
            text,
            ..Default::default()
        })
        .await
    {
        Ok(()) => {
            println!("SEND OK → group {gid}(welink-cli 退出 0 = 发送即完成)");
            Ok(())
        }
        Err(e) => {
            eprintln!("SEND FAIL → group {gid}:{e}");
            std::process::exit(1);
        }
    }
}
