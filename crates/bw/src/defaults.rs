//! 产品编译默认:开工工具、workflow。节律在 Orca,不写进被管仓。
//!
//! 本机 `settings.toml` 的工具覆盖工具默认;
//! 旧仓里残留的 `.bw/issue-policy.toml` 只在 settings 还没记过该类时当回退。

use crate::model::{Category, StageKind};

/// 该类活没在本机设置、也没有残留映射时用的开工工具。
pub fn default_tool(cat: Category) -> &'static str {
    match cat {
        StageKind::Prototype => "open_design",
        _ => "claude_cli",
    }
}

/// 该类活没残留映射时用的 workflow。原型 / 运营推广默认空着。
pub fn default_workflow(cat: Category) -> &'static str {
    match cat {
        StageKind::Build | StageKind::Optimize | StageKind::Ops => "mattpocock-skills",
        _ => "",
    }
}
