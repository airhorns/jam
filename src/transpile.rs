use std::path::Path;

use oxc::allocator::Allocator;
use oxc::codegen::Codegen;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{JsxOptions, JsxRuntime, TransformOptions, Transformer};

/// Transpile TypeScript source to JavaScript by stripping type annotations.
/// This is type-erasure only (like tsc --isolatedModules) — no type checking.
/// If the filename ends with .tsx, JSX is transformed using the classic runtime
/// with `h` as the factory function and `Fragment` as the fragment factory.
pub fn transpile_ts_to_js(source: &str, filename: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename)
        .unwrap_or_default()
        .with_typescript(true)
        .with_jsx(filename.ends_with(".tsx") || filename.ends_with(".jsx"));

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
    let semantic = SemanticBuilder::new().build(&program).semantic;
    let scoping = semantic.into_scoping();

    let path = Path::new(filename);
    let mut transform_options = TransformOptions::default();

    // Configure JSX transform: classic runtime with h() factory
    if source_type.is_jsx() {
        transform_options.jsx = JsxOptions {
            jsx_plugin: true,
            runtime: JsxRuntime::Classic,
            pragma: Some("h".to_string()),
            pragma_frag: Some("Fragment".to_string()),
            pure: false,
            ..JsxOptions::disable()
        };
    }

    let result = Transformer::new(&allocator, path, &transform_options)
        .build_with_scoping(scoping, &mut program);

    if !result.errors.is_empty() {
        let errors: Vec<String> = result.errors.iter().map(|e| e.to_string()).collect();
        return Err(format!("Transform errors: {}", errors.join(", ")));
    }

    let js = Codegen::new().build(&program).code;
    Ok(js)
}

/// Strip import declarations and export keywords from transpiled JS.
/// Used for the runtime module (concatenated from multiple files).
pub fn strip_imports(js: &str) -> String {
    js.lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with("import ")
        })
        .map(|line| {
            if line.trim_start().starts_with("export ") {
                line.replacen("export ", "", 1)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip import declarations only, keeping exports intact.
/// Used for the runtime module source where exports are needed for ES module interface.
pub fn strip_only_imports(js: &str) -> String {
    js.lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with("import ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip relative import declarations (./foo, ../foo) but keep package imports (@jam/types).
/// Used for concatenated files where relative imports are resolved by concatenation.
pub fn strip_relative_imports(js: &str) -> String {
    js.lines()
        .filter(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with("import ") {
                return true; // not an import
            }
            // Keep imports from packages (contain @), strip relative imports (contain ./)
            !trimmed.contains("\"./") && !trimmed.contains("\"../")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip export keywords from transpiled JS but keep imports.
/// Used for user programs evaluated as ES modules — imports resolve
/// to the built-in @jam/types module, but top-level exports are unnecessary.
pub fn strip_exports(js: &str) -> String {
    js.lines()
        .map(|line| {
            if line.trim_start().starts_with("export ") {
                line.replacen("export ", "", 1)
            } else {
                line.to_string()
            }
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
    fn test_jsx_transpile() {
        let tsx = r#"
            const el = <VStack spacing={20}>
                <Text font="title">Hello</Text>
            </VStack>;
        "#;
        let js = transpile_ts_to_js(tsx, "test.tsx").unwrap();
        assert!(js.contains("h(VStack"), "should use h() factory: {js}");
        assert!(js.contains("spacing: 20"), "should have spacing prop: {js}");
        assert!(
            js.contains("h(Text"),
            "should transpile nested elements: {js}"
        );
    }

    #[test]
    fn test_jsx_fragment() {
        let tsx = r#"
            const el = <>
                <Text>A</Text>
                <Text>B</Text>
            </>;
        "#;
        let js = transpile_ts_to_js(tsx, "test.tsx").unwrap();
        assert!(js.contains("Fragment"), "should use Fragment for <>: {js}");
    }

    #[test]
    fn test_jsx_with_expressions() {
        let tsx = r#"
            const name = "world";
            const el = <Text>{`Hello ${name}`}</Text>;
        "#;
        let js = transpile_ts_to_js(tsx, "test.tsx").unwrap();
        assert!(js.contains("h(Text"), "should transpile JSX: {js}");
    }

    #[test]
    fn test_tsx_with_types() {
        let tsx = r#"
            interface Props { label: string; }
            function MyComponent(props: Props) {
                return <Text>{props.label}</Text>;
            }
            const el = <MyComponent label="hi" />;
        "#;
        let js = transpile_ts_to_js(tsx, "test.tsx").unwrap();
        assert!(!js.contains("interface"), "should strip interface: {js}");
        assert!(
            js.contains("h(MyComponent"),
            "should transpile custom component: {js}"
        );
    }

    #[test]
    fn test_ts_file_no_jsx() {
        // .ts files should NOT have JSX enabled
        let ts = r#"
            const x = 1;
        "#;
        let js = transpile_ts_to_js(ts, "test.ts").unwrap();
        assert!(js.contains("const x = 1"));
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
