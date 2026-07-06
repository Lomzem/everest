fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set");
    let target = std::env::var("TARGET").expect("TARGET is set");
    let extension = if target.contains("windows") { ".exe" } else { "" };
    let parser_path = std::path::Path::new(&manifest_dir)
        .join("binaries")
        .join(format!("rdl-parser-{target}{extension}"));

    if !parser_path.exists() {
        panic!(
            "missing RDL parser sidecar at {}. Run `bun run sidecar:build` before building Tauri.",
            parser_path.display()
        );
    }

    println!("cargo:rerun-if-changed={}", parser_path.display());
    println!(
        "cargo:rustc-env=RDL_PARSER_SIDECAR_PATH={}",
        parser_path.display()
    );
    println!("cargo:rustc-env=RDL_PARSER_TARGET={target}");

    tauri_build::build()
}
