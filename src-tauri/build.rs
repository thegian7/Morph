fn main() {
    // cargo test binaries on Windows/MSVC need the Common Controls v6
    // manifest embedded or they abort at load with
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139). tauri-build only embeds a
    // manifest into the app executable, so do it for test targets here.
    // `rustc-link-arg-tests` applies to test binaries only.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-test-manifest.xml");
        println!("cargo:rerun-if-changed=windows-test-manifest.xml");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }

    tauri_build::build()
}
