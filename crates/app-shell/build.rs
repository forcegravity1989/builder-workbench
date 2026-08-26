// 给 bw-dev.exe 嵌 Windows 图标资源(任务栏 / 资源管理器 / 快捷方式都用它)。
// GNU 工具链走 windres,MSVC 走 rc;两端都自动。编不过只告警不阻断——
// 最坏情况是 exe 没图标(白图),不影响功能,不破坏 CI(ubuntu CI exclude
// app-shell,build.rs 不在那跑)。
fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("app.ico");
        if let Err(e) = res.compile() {
            eprintln!("cargo:warning=嵌图标失败(不影响编译,exe 只是没有图标):{e}");
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = ();
}
