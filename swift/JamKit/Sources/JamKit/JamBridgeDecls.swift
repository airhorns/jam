// Explicit Swift declarations for the Rust FFI functions.
// Swift's ClangImporter cannot import C identifiers containing '$',
// so we use @_silgen_name to map Swift functions directly to the linker symbols.

import CJamBridge

@_silgen_name("__swift_bridge__$JamEngine$_free")
func __swift_bridge__$JamEngine$_free(_ ptr: UnsafeMutableRawPointer)

@_silgen_name("__swift_bridge__$JamEngine$new")
func __swift_bridge__$JamEngine$new() -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$load_program")
func __swift_bridge__$JamEngine$load_program(_ ptr: UnsafeMutableRawPointer, _ name: RustStr, _ ts_source: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$load_program_files")
func __swift_bridge__$JamEngine$load_program_files(_ ptr: UnsafeMutableRawPointer, _ name: RustStr, _ files_json: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$remove_program")
func __swift_bridge__$JamEngine$remove_program(_ ptr: UnsafeMutableRawPointer, _ program_id: UInt64)

@_silgen_name("__swift_bridge__$JamEngine$assert_fact_json")
func __swift_bridge__$JamEngine$assert_fact_json(_ ptr: UnsafeMutableRawPointer, _ json: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$retract_fact_json")
func __swift_bridge__$JamEngine$retract_fact_json(_ ptr: UnsafeMutableRawPointer, _ json: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$step_json")
func __swift_bridge__$JamEngine$step_json(_ ptr: UnsafeMutableRawPointer) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$current_facts_json")
func __swift_bridge__$JamEngine$current_facts_json(_ ptr: UnsafeMutableRawPointer) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$fire_event")
func __swift_bridge__$JamEngine$fire_event(_ ptr: UnsafeMutableRawPointer, _ entity_id: RustStr, _ event_name: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$fire_event_with_data")
func __swift_bridge__$JamEngine$fire_event_with_data(_ ptr: UnsafeMutableRawPointer, _ entity_id: RustStr, _ event_name: RustStr, _ data: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$eval_js_ffi")
func __swift_bridge__$JamEngine$eval_js_ffi(_ ptr: UnsafeMutableRawPointer, _ code: RustStr) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$JamEngine$drain_async")
func __swift_bridge__$JamEngine$drain_async(_ ptr: UnsafeMutableRawPointer) -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$Vec_JamEngine$new")
func __swift_bridge__$Vec_JamEngine$new() -> UnsafeMutableRawPointer

@_silgen_name("__swift_bridge__$Vec_JamEngine$drop")
func __swift_bridge__$Vec_JamEngine$drop(_ vec_ptr: UnsafeMutableRawPointer)

@_silgen_name("__swift_bridge__$Vec_JamEngine$push")
func __swift_bridge__$Vec_JamEngine$push(_ vec_ptr: UnsafeMutableRawPointer, _ item_ptr: UnsafeMutableRawPointer)

@_silgen_name("__swift_bridge__$Vec_JamEngine$pop")
func __swift_bridge__$Vec_JamEngine$pop(_ vec_ptr: UnsafeMutableRawPointer) -> Optional<UnsafeMutableRawPointer>

@_silgen_name("__swift_bridge__$Vec_JamEngine$get")
func __swift_bridge__$Vec_JamEngine$get(_ vec_ptr: UnsafeMutableRawPointer, _ index: UInt) -> Optional<UnsafeMutableRawPointer>

@_silgen_name("__swift_bridge__$Vec_JamEngine$get_mut")
func __swift_bridge__$Vec_JamEngine$get_mut(_ vec_ptr: UnsafeMutableRawPointer, _ index: UInt) -> Optional<UnsafeMutableRawPointer>

@_silgen_name("__swift_bridge__$Vec_JamEngine$as_ptr")
func __swift_bridge__$Vec_JamEngine$as_ptr(_ vec_ptr: UnsafeMutableRawPointer) -> UnsafePointer<UnsafeMutableRawPointer>

@_silgen_name("__swift_bridge__$Vec_JamEngine$len")
func __swift_bridge__$Vec_JamEngine$len(_ vec_ptr: UnsafeMutableRawPointer) -> UInt
