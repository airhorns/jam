
public class JamEngine: JamEngineRefMut {
    var isOwned: Bool = true

    public override init(ptr: UnsafeMutableRawPointer) {
        super.init(ptr: ptr)
    }

    deinit {
        if isOwned {
            __swift_bridge__$JamEngine$_free(ptr)
        }
    }
}
extension JamEngine {
    public convenience init() {
        self.init(ptr: __swift_bridge__$JamEngine$new())
    }
}
public class JamEngineRefMut: JamEngineRef {
    public override init(ptr: UnsafeMutableRawPointer) {
        super.init(ptr: ptr)
    }
}
extension JamEngineRefMut {
    public func load_program<GenericToRustStr: ToRustStr>(_ name: GenericToRustStr, _ ts_source: GenericToRustStr) -> RustString {
        return ts_source.toRustStr({ ts_sourceAsRustStr in
            return name.toRustStr({ nameAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$load_program(ptr, nameAsRustStr, ts_sourceAsRustStr))
        })
        })
    }

    public func load_program_files<GenericToRustStr: ToRustStr>(_ name: GenericToRustStr, _ files_json: GenericToRustStr) -> RustString {
        return files_json.toRustStr({ files_jsonAsRustStr in
            return name.toRustStr({ nameAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$load_program_files(ptr, nameAsRustStr, files_jsonAsRustStr))
        })
        })
    }

    public func remove_program(_ program_id: UInt64) {
        __swift_bridge__$JamEngine$remove_program(ptr, program_id)
    }

    public func assert_fact_json<GenericToRustStr: ToRustStr>(_ json: GenericToRustStr) -> RustString {
        return json.toRustStr({ jsonAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$assert_fact_json(ptr, jsonAsRustStr))
        })
    }

    public func retract_fact_json<GenericToRustStr: ToRustStr>(_ json: GenericToRustStr) -> RustString {
        return json.toRustStr({ jsonAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$retract_fact_json(ptr, jsonAsRustStr))
        })
    }

    public func step_json() -> RustString {
        RustString(ptr: __swift_bridge__$JamEngine$step_json(ptr))
    }

    public func fire_event<GenericToRustStr: ToRustStr>(_ entity_id: GenericToRustStr, _ event_name: GenericToRustStr) -> RustString {
        return event_name.toRustStr({ event_nameAsRustStr in
            return entity_id.toRustStr({ entity_idAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$fire_event(ptr, entity_idAsRustStr, event_nameAsRustStr))
        })
        })
    }

    public func fire_event_with_data<GenericToRustStr: ToRustStr>(_ entity_id: GenericToRustStr, _ event_name: GenericToRustStr, _ data: GenericToRustStr) -> RustString {
        return data.toRustStr({ dataAsRustStr in
            return event_name.toRustStr({ event_nameAsRustStr in
            return entity_id.toRustStr({ entity_idAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$fire_event_with_data(ptr, entity_idAsRustStr, event_nameAsRustStr, dataAsRustStr))
        })
        })
        })
    }

    public func eval_js_ffi<GenericToRustStr: ToRustStr>(_ code: GenericToRustStr) -> RustString {
        return code.toRustStr({ codeAsRustStr in
            RustString(ptr: __swift_bridge__$JamEngine$eval_js_ffi(ptr, codeAsRustStr))
        })
    }

    public func drain_async() -> RustString {
        RustString(ptr: __swift_bridge__$JamEngine$drain_async(ptr))
    }
}
public class JamEngineRef {
    var ptr: UnsafeMutableRawPointer

    public init(ptr: UnsafeMutableRawPointer) {
        self.ptr = ptr
    }
}
extension JamEngineRef {
    public func current_facts_json() -> RustString {
        RustString(ptr: __swift_bridge__$JamEngine$current_facts_json(ptr))
    }
}
extension JamEngine: Vectorizable {
    public static func vecOfSelfNew() -> UnsafeMutableRawPointer {
        __swift_bridge__$Vec_JamEngine$new()
    }

    public static func vecOfSelfFree(vecPtr: UnsafeMutableRawPointer) {
        __swift_bridge__$Vec_JamEngine$drop(vecPtr)
    }

    public static func vecOfSelfPush(vecPtr: UnsafeMutableRawPointer, value: JamEngine) {
        __swift_bridge__$Vec_JamEngine$push(vecPtr, {value.isOwned = false; return value.ptr;}())
    }

    public static func vecOfSelfPop(vecPtr: UnsafeMutableRawPointer) -> Optional<Self> {
        let pointer = __swift_bridge__$Vec_JamEngine$pop(vecPtr)
        if pointer == nil {
            return nil
        } else {
            return (JamEngine(ptr: pointer!) as! Self)
        }
    }

    public static func vecOfSelfGet(vecPtr: UnsafeMutableRawPointer, index: UInt) -> Optional<JamEngineRef> {
        let pointer = __swift_bridge__$Vec_JamEngine$get(vecPtr, index)
        if pointer == nil {
            return nil
        } else {
            return JamEngineRef(ptr: pointer!)
        }
    }

    public static func vecOfSelfGetMut(vecPtr: UnsafeMutableRawPointer, index: UInt) -> Optional<JamEngineRefMut> {
        let pointer = __swift_bridge__$Vec_JamEngine$get_mut(vecPtr, index)
        if pointer == nil {
            return nil
        } else {
            return JamEngineRefMut(ptr: pointer!)
        }
    }

    public static func vecOfSelfAsPtr(vecPtr: UnsafeMutableRawPointer) -> UnsafePointer<JamEngineRef> {
        UnsafePointer<JamEngineRef>(OpaquePointer(__swift_bridge__$Vec_JamEngine$as_ptr(vecPtr)))
    }

    public static func vecOfSelfLen(vecPtr: UnsafeMutableRawPointer) -> UInt {
        __swift_bridge__$Vec_JamEngine$len(vecPtr)
    }
}



