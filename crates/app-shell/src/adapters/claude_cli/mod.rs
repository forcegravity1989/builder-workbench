pub const REQUIRES: &[&str] = &["本机已装 claude", "一个真实的工作区路径", "能连上模型网关"];

pub fn detect() -> Option<String> {
    bw_engine::resolve_claude_binary(None)
}
