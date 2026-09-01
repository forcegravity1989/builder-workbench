// 给 bw-dev.exe 嵌 Windows 图标资源(任务栏 / 资源管理器 / 快捷方式都用它)。
// GNU 工具链走 windres,MSVC 走 rc;两端都自动。编不过只告警不阻断——
// 最坏情况是 exe 没图标(白图),不影响功能,不破坏 CI(ubuntu CI exclude
// app-shell,build.rs 不在那跑)。
fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("app.ico");
        match res.compile() {
            Ok(()) => {
                // winres 产的是静态库 libresource.a,靠 cargo:rustc-link-lib 拉。
                // 但 GNU 链接器只从静态库拉能解析未定义符号的成员,资源对象没
                // 导出符号 → 整个被跳过,图标进不了 exe(实测 .rsrc 只剩 mingw
                // crt 自带的 manifest)。GNU 下直接把 resource.o 喂给链接器
                // (对象文件一定被收入,不走库拉),图标才真嵌进去。
                #[cfg(target_env = "gnu")]
                {
                    let out = std::env::var("OUT_DIR").unwrap();
                    let obj = std::path::Path::new(&out).join("resource.o");
                    if obj.exists() {
                        println!("cargo:rustc-link-arg={}", obj.display());
                    } else {
                        eprintln!(
                            "cargo:warning=嵌图标:GNU 下未找到 winres 产物 resource.o,exe 可能没图标"
                        );
                    }
                }
            }
            Err(e) => eprintln!("cargo:warning=嵌图标失败(不影响编译,exe 只是没有图标):{e}"),
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = ();
}
