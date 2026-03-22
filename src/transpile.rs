use std::path::Path;

use oxc::allocator::Allocator;
use oxc::codegen::Codegen;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{TransformOptions, Transformer};

/// Transpile TypeScript source to JavaScript by stripping type annotations.
/// This is type-erasure only (like tsc --isolatedModules) — no type checking.
pub fn transpile_ts_to_js(source: &str, filename: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename)
        .unwrap_or_default()
        .with_typescript(true);

    let parsed = Parser::new(&allocator, source, source_type).parse();

    if parsed.panicked {
        return Err("Parser panicked".to_string());
    }

    if !parsed.errors.is_empty() {
        let errors: Vec<String> = parsed.errors.iter().map(|e| e.to_string()).collect();
        return Err(format!("Parse errors: {}", errors.join(", ")));
    }

    let mut program = parsed.program;

    // Build semantic analysis (required by transformer for scoping)
    let semantic = SemanticBuilder::new()
        .build(&program)
        .semantic;
    let scoping = semantic.into_scoping();

    let path = Path::new(filename);
    let transform_options = TransformOptions::default();
    let result = Transformer::new(&allocator, path, &transform_options)
        .build_with_scoping(scoping, &mut program);

    if !result.errors.is_empty() {
        let errors: Vec<String> = result.errors.iter().map(|e| e.to_string()).collect();
        return Err(format!("Transform errors: {}", errors.join(", ")));
    }

    let js = Codegen::new().build(&program).code;
    Ok(js)
}

/// Strip import declarations from transpiled JS.
/// The jam runtime is loaded as globals, so imports are unnecessary.
pub fn strip_imports(js: &str) -> String {
    js.lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with("import ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_transpile() {
        let ts = r#"
            const x: string = "hello";
            const n: number = 42;
            function add(a: number, b: number): number {
                return a + b;
            }
        "#;
        let js = transpile_ts_to_js(ts, "test.ts").unwrap();
        assert!(js.contains(r#"const x = "hello""#));
        assert!(js.contains("const n = 42"));
        assert!(js.contains("function add(a, b)"));
        assert!(!js.contains(": string"));
        assert!(!js.contains(": number"));
    }

    #[test]
    fn test_interface_stripped() {
        let ts = r#"
            interface Foo { bar: string; }
            type Baz = { qux: number; };
            const x = 1;
        "#;
        let js = transpile_ts_to_js(ts, "test.ts").unwrap();
        assert!(!js.contains("interface"));
        assert!(js.contains("const x = 1"));
    }

    #[test]
    fn test_as_const_stripped() {
        let ts = r#"
            const pattern = [1, "is", "cool"] as const;
        "#;
        let js = transpile_ts_to_js(ts, "test.ts").unwrap();
        assert!(!js.contains("as const"));
    }

    #[test]
    fn test_jam_script_transpile() {
        let ts = r#"
            import { $, _, when, claim } from "./jam";
            import type { Expect, Equal } from "./helpers";

            type MyType = string;

            claim("omar", "is", "cool");

            when([1, "is", "cool"], ({ x }: { x: string }) => {
                claim(x, "is", "awesome");
            });
        "#;
        let js = transpile_ts_to_js(ts, "test.ts").unwrap();
        assert!(js.contains(r#"claim("omar", "is", "cool")"#));
        assert!(js.contains("when("));
        assert!(!js.contains("type MyType"));
    }

    #[test]
    fn test_strip_imports() {
        let js = r#"import { $, when } from "./jam";
import "./skeletons";
const x = 1;
claim("hello");"#;
        let stripped = strip_imports(js);
        assert!(!stripped.contains("import"));
        assert!(stripped.contains("const x = 1"));
        assert!(stripped.contains(r#"claim("hello")"#));
    }
}
