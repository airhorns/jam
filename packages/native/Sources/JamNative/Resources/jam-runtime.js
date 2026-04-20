var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  "use strict";
  if (typeof console === "undefined") {
    globalThis.console = {
      log: (..._args) => {
      },
      warn: (..._args) => {
      },
      error: (..._args) => {
      },
      info: (..._args) => {
      },
      debug: (..._args) => {
      }
    };
  }
  if (typeof setTimeout === "undefined") {
    let nextTimerId = 1;
    globalThis.setTimeout = (fn, _ms) => {
      const id = nextTimerId++;
      if (globalThis.__scheduleTimeout) {
        globalThis.__scheduleTimeout(id, _ms ?? 0, fn);
      } else {
        try {
          fn();
        } catch (_e) {
        }
      }
      return id;
    };
    globalThis.clearTimeout = (id) => {
      if (globalThis.__clearTimeout) {
        globalThis.__clearTimeout(id);
      }
    };
  }
  if (typeof setInterval === "undefined") {
    globalThis.setInterval = (_fn, _ms) => 0;
    globalThis.clearInterval = (_id) => {
    };
  }
  if (typeof queueMicrotask === "undefined") {
    globalThis.queueMicrotask = (fn) => {
      Promise.resolve().then(() => fn());
    };
  }
  if (typeof performance === "undefined") {
    const start = Date.now();
    globalThis.performance = {
      now: () => Date.now() - start
    };
  }
  function die(error) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }
    throw new Error(typeof error === "number" ? "[MobX] minified error nr: " + error + (args.length ? " " + args.map(String).join(",") : "") + ". Find the full error at: https://github.com/mobxjs/mobx/blob/main/packages/mobx/src/errors.ts" : "[MobX] " + error);
  }
  var mockGlobal = {};
  function getGlobal() {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
    if (typeof window !== "undefined") {
      return window;
    }
    if (typeof global !== "undefined") {
      return global;
    }
    if (typeof self !== "undefined") {
      return self;
    }
    return mockGlobal;
  }
  var assign = Object.assign;
  var getDescriptor = Object.getOwnPropertyDescriptor;
  var defineProperty = Object.defineProperty;
  var objectPrototype = Object.prototype;
  var EMPTY_ARRAY = [];
  Object.freeze(EMPTY_ARRAY);
  var EMPTY_OBJECT = {};
  Object.freeze(EMPTY_OBJECT);
  var hasProxy = typeof Proxy !== "undefined";
  var plainObjectString = /* @__PURE__ */ Object.toString();
  function assertProxies() {
    if (!hasProxy) {
      die("Proxy not available");
    }
  }
  function once(func) {
    var invoked = false;
    return function() {
      if (invoked) {
        return;
      }
      invoked = true;
      return func.apply(this, arguments);
    };
  }
  var noop = function noop2() {
  };
  function isFunction(fn) {
    return typeof fn === "function";
  }
  function isStringish(value) {
    var t = typeof value;
    switch (t) {
      case "string":
      case "symbol":
      case "number":
        return true;
    }
    return false;
  }
  function isObject(value) {
    return value !== null && typeof value === "object";
  }
  function isPlainObject(value) {
    if (!isObject(value)) {
      return false;
    }
    var proto = Object.getPrototypeOf(value);
    if (proto == null) {
      return true;
    }
    var protoConstructor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
    return typeof protoConstructor === "function" && protoConstructor.toString() === plainObjectString;
  }
  function isGenerator(obj) {
    var constructor = obj == null ? void 0 : obj.constructor;
    if (!constructor) {
      return false;
    }
    if ("GeneratorFunction" === constructor.name || "GeneratorFunction" === constructor.displayName) {
      return true;
    }
    return false;
  }
  function addHiddenProp(object2, propName, value) {
    defineProperty(object2, propName, {
      enumerable: false,
      writable: true,
      configurable: true,
      value
    });
  }
  function addHiddenFinalProp(object2, propName, value) {
    defineProperty(object2, propName, {
      enumerable: false,
      writable: false,
      configurable: true,
      value
    });
  }
  function createInstanceofPredicate(name, theClass) {
    var propName = "isMobX" + name;
    theClass.prototype[propName] = true;
    return function(x) {
      return isObject(x) && x[propName] === true;
    };
  }
  function isES6Map(thing) {
    return thing != null && Object.prototype.toString.call(thing) === "[object Map]";
  }
  function isPlainES6Map(thing) {
    var mapProto = Object.getPrototypeOf(thing);
    var objectProto = Object.getPrototypeOf(mapProto);
    var nullProto = Object.getPrototypeOf(objectProto);
    return nullProto === null;
  }
  function isES6Set(thing) {
    return thing != null && Object.prototype.toString.call(thing) === "[object Set]";
  }
  var hasGetOwnPropertySymbols = typeof Object.getOwnPropertySymbols !== "undefined";
  function getPlainObjectKeys(object2) {
    var keys2 = Object.keys(object2);
    if (!hasGetOwnPropertySymbols) {
      return keys2;
    }
    var symbols = Object.getOwnPropertySymbols(object2);
    if (!symbols.length) {
      return keys2;
    }
    return [].concat(keys2, symbols.filter(function(s) {
      return objectPrototype.propertyIsEnumerable.call(object2, s);
    }));
  }
  var ownKeys = typeof Reflect !== "undefined" && Reflect.ownKeys ? Reflect.ownKeys : hasGetOwnPropertySymbols ? function(obj) {
    return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
  } : (
    /* istanbul ignore next */
    Object.getOwnPropertyNames
  );
  function toPrimitive(value) {
    return value === null ? null : typeof value === "object" ? "" + value : value;
  }
  function hasProp(target, prop) {
    return objectPrototype.hasOwnProperty.call(target, prop);
  }
  var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors || function getOwnPropertyDescriptors2(target) {
    var res = {};
    ownKeys(target).forEach(function(key) {
      res[key] = getDescriptor(target, key);
    });
    return res;
  };
  function getFlag(flags, mask) {
    return !!(flags & mask);
  }
  function setFlag(flags, mask, newValue) {
    if (newValue) {
      flags |= mask;
    } else {
      flags &= ~mask;
    }
    return flags;
  }
  function _arrayLikeToArray(r, a) {
    (null == a || a > r.length) && (a = r.length);
    for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
    return n;
  }
  function _defineProperties(e, r) {
    for (var t = 0; t < r.length; t++) {
      var o = r[t];
      o.enumerable = o.enumerable || false, o.configurable = true, "value" in o && (o.writable = true), Object.defineProperty(e, _toPropertyKey(o.key), o);
    }
  }
  function _createClass(e, r, t) {
    return r && _defineProperties(e.prototype, r), Object.defineProperty(e, "prototype", {
      writable: false
    }), e;
  }
  function _createForOfIteratorHelperLoose(r, e) {
    var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
    if (t) return (t = t.call(r)).next.bind(t);
    if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
      t && (r = t);
      var o = 0;
      return function() {
        return o >= r.length ? {
          done: true
        } : {
          done: false,
          value: r[o++]
        };
      };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  function _extends() {
    return _extends = Object.assign ? Object.assign.bind() : function(n) {
      for (var e = 1; e < arguments.length; e++) {
        var t = arguments[e];
        for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
      }
      return n;
    }, _extends.apply(null, arguments);
  }
  function _inheritsLoose(t, o) {
    t.prototype = Object.create(o.prototype), t.prototype.constructor = t, _setPrototypeOf(t, o);
  }
  function _setPrototypeOf(t, e) {
    return _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(t2, e2) {
      return t2.__proto__ = e2, t2;
    }, _setPrototypeOf(t, e);
  }
  function _toPrimitive(t, r) {
    if ("object" != typeof t || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r);
      if ("object" != typeof i) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return String(t);
  }
  function _toPropertyKey(t) {
    var i = _toPrimitive(t, "string");
    return "symbol" == typeof i ? i : i + "";
  }
  function _unsupportedIterableToArray(r, a) {
    if (r) {
      if ("string" == typeof r) return _arrayLikeToArray(r, a);
      var t = {}.toString.call(r).slice(8, -1);
      return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
    }
  }
  var storedAnnotationsSymbol = /* @__PURE__ */ Symbol("mobx-stored-annotations");
  function createDecoratorAnnotation(annotation) {
    function decorator(target, property) {
      if (is20223Decorator(property)) {
        return annotation.decorate_20223_(target, property);
      } else {
        storeAnnotation(target, property, annotation);
      }
    }
    return Object.assign(decorator, annotation);
  }
  function storeAnnotation(prototype, key, annotation) {
    if (!hasProp(prototype, storedAnnotationsSymbol)) {
      addHiddenProp(prototype, storedAnnotationsSymbol, _extends({}, prototype[storedAnnotationsSymbol]));
    }
    if (!isOverride(annotation)) {
      prototype[storedAnnotationsSymbol][key] = annotation;
    }
  }
  function collectStoredAnnotations(target) {
    if (!hasProp(target, storedAnnotationsSymbol)) {
      addHiddenProp(target, storedAnnotationsSymbol, _extends({}, target[storedAnnotationsSymbol]));
    }
    return target[storedAnnotationsSymbol];
  }
  function is20223Decorator(context) {
    return typeof context == "object" && typeof context["kind"] == "string";
  }
  var $mobx = /* @__PURE__ */ Symbol("mobx administration");
  var Atom = /* @__PURE__ */ (function() {
    function Atom2(name_) {
      if (name_ === void 0) {
        name_ = "Atom";
      }
      this.name_ = void 0;
      this.flags_ = 0;
      this.observers_ = /* @__PURE__ */ new Set();
      this.lastAccessedBy_ = 0;
      this.lowestObserverState_ = IDerivationState_.NOT_TRACKING_;
      this.onBOL = void 0;
      this.onBUOL = void 0;
      this.name_ = name_;
    }
    var _proto = Atom2.prototype;
    _proto.onBO = function onBO() {
      if (this.onBOL) {
        this.onBOL.forEach(function(listener) {
          return listener();
        });
      }
    };
    _proto.onBUO = function onBUO() {
      if (this.onBUOL) {
        this.onBUOL.forEach(function(listener) {
          return listener();
        });
      }
    };
    _proto.reportObserved = function reportObserved$1() {
      return reportObserved(this);
    };
    _proto.reportChanged = function reportChanged() {
      startBatch();
      propagateChanged(this);
      endBatch();
    };
    _proto.toString = function toString2() {
      return this.name_;
    };
    return _createClass(Atom2, [{
      key: "isBeingObserved",
      get: function get4() {
        return getFlag(this.flags_, Atom2.isBeingObservedMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Atom2.isBeingObservedMask_, newValue);
      }
    }, {
      key: "isPendingUnobservation",
      get: function get4() {
        return getFlag(this.flags_, Atom2.isPendingUnobservationMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Atom2.isPendingUnobservationMask_, newValue);
      }
    }, {
      key: "diffValue",
      get: function get4() {
        return getFlag(this.flags_, Atom2.diffValueMask_) ? 1 : 0;
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Atom2.diffValueMask_, newValue === 1 ? true : false);
      }
    }]);
  })();
  Atom.isBeingObservedMask_ = 1;
  Atom.isPendingUnobservationMask_ = 2;
  Atom.diffValueMask_ = 4;
  var isAtom = /* @__PURE__ */ createInstanceofPredicate("Atom", Atom);
  function createAtom(name, onBecomeObservedHandler, onBecomeUnobservedHandler) {
    if (onBecomeObservedHandler === void 0) {
      onBecomeObservedHandler = noop;
    }
    if (onBecomeUnobservedHandler === void 0) {
      onBecomeUnobservedHandler = noop;
    }
    var atom = new Atom(name);
    if (onBecomeObservedHandler !== noop) {
      onBecomeObserved(atom, onBecomeObservedHandler);
    }
    if (onBecomeUnobservedHandler !== noop) {
      onBecomeUnobserved(atom, onBecomeUnobservedHandler);
    }
    return atom;
  }
  function structuralComparer(a, b) {
    return deepEqual(a, b);
  }
  function defaultComparer(a, b) {
    if (Object.is) {
      return Object.is(a, b);
    }
    return a === b ? a !== 0 || 1 / a === 1 / b : a !== a && b !== b;
  }
  var comparer = {
    structural: structuralComparer,
    "default": defaultComparer
  };
  function deepEnhancer(v, _14, name) {
    if (isObservable(v)) {
      return v;
    }
    if (Array.isArray(v)) {
      return observable.array(v, {
        name
      });
    }
    if (isPlainObject(v)) {
      return observable.object(v, void 0, {
        name
      });
    }
    if (isES6Map(v)) {
      return observable.map(v, {
        name
      });
    }
    if (isES6Set(v)) {
      return observable.set(v, {
        name
      });
    }
    if (typeof v === "function" && !isAction(v) && !isFlow(v)) {
      if (isGenerator(v)) {
        return flow(v);
      } else {
        return autoAction(name, v);
      }
    }
    return v;
  }
  function shallowEnhancer(v, _14, name) {
    if (v === void 0 || v === null) {
      return v;
    }
    if (isObservableObject(v) || isObservableArray(v) || isObservableMap(v) || isObservableSet(v)) {
      return v;
    }
    if (Array.isArray(v)) {
      return observable.array(v, {
        name,
        deep: false
      });
    }
    if (isPlainObject(v)) {
      return observable.object(v, void 0, {
        name,
        deep: false
      });
    }
    if (isES6Map(v)) {
      return observable.map(v, {
        name,
        deep: false
      });
    }
    if (isES6Set(v)) {
      return observable.set(v, {
        name,
        deep: false
      });
    }
  }
  function referenceEnhancer(newValue) {
    return newValue;
  }
  function refStructEnhancer(v, oldValue) {
    if (deepEqual(v, oldValue)) {
      return oldValue;
    }
    return v;
  }
  var OVERRIDE = "override";
  function isOverride(annotation) {
    return annotation.annotationType_ === OVERRIDE;
  }
  function createActionAnnotation(name, options) {
    return {
      annotationType_: name,
      options_: options,
      make_: make_$1,
      extend_: extend_$1,
      decorate_20223_: decorate_20223_$1
    };
  }
  function make_$1(adm, key, descriptor, source) {
    var _this$options_;
    if ((_this$options_ = this.options_) != null && _this$options_.bound) {
      return this.extend_(adm, key, descriptor, false) === null ? 0 : 1;
    }
    if (source === adm.target_) {
      return this.extend_(adm, key, descriptor, false) === null ? 0 : 2;
    }
    if (isAction(descriptor.value)) {
      return 1;
    }
    var actionDescriptor = createActionDescriptor(adm, this, key, descriptor, false);
    defineProperty(source, key, actionDescriptor);
    return 2;
  }
  function extend_$1(adm, key, descriptor, proxyTrap) {
    var actionDescriptor = createActionDescriptor(adm, this, key, descriptor);
    return adm.defineProperty_(key, actionDescriptor, proxyTrap);
  }
  function decorate_20223_$1(mthd, context) {
    var kind = context.kind, name = context.name, addInitializer = context.addInitializer;
    var ann = this;
    var _createAction = function _createAction2(m) {
      var _ann$options_$name, _ann$options_, _ann$options_$autoAct, _ann$options_2;
      return createAction((_ann$options_$name = (_ann$options_ = ann.options_) == null ? void 0 : _ann$options_.name) != null ? _ann$options_$name : name.toString(), m, (_ann$options_$autoAct = (_ann$options_2 = ann.options_) == null ? void 0 : _ann$options_2.autoAction) != null ? _ann$options_$autoAct : false);
    };
    if (kind == "field") {
      return function(initMthd) {
        var _ann$options_3;
        var mthd2 = initMthd;
        if (!isAction(mthd2)) {
          mthd2 = _createAction(mthd2);
        }
        if ((_ann$options_3 = ann.options_) != null && _ann$options_3.bound) {
          mthd2 = mthd2.bind(this);
          mthd2.isMobxAction = true;
        }
        return mthd2;
      };
    }
    if (kind == "method") {
      var _this$options_2;
      if (!isAction(mthd)) {
        mthd = _createAction(mthd);
      }
      if ((_this$options_2 = this.options_) != null && _this$options_2.bound) {
        addInitializer(function() {
          var self2 = this;
          var bound = self2[name].bind(self2);
          bound.isMobxAction = true;
          self2[name] = bound;
        });
      }
      return mthd;
    }
    die("Cannot apply '" + ann.annotationType_ + "' to '" + String(name) + "' (kind: " + kind + "):" + ("\n'" + ann.annotationType_ + "' can only be used on properties with a function value."));
  }
  function assertActionDescriptor(adm, _ref, key, _ref2) {
    _ref.annotationType_;
    _ref2.value;
  }
  function createActionDescriptor(adm, annotation, key, descriptor, safeDescriptors) {
    var _annotation$options_, _annotation$options_$, _annotation$options_2, _annotation$options_$2, _annotation$options_3, _annotation$options_4, _adm$proxy_2;
    if (safeDescriptors === void 0) {
      safeDescriptors = globalState.safeDescriptors;
    }
    assertActionDescriptor(adm, annotation, key, descriptor);
    var value = descriptor.value;
    if ((_annotation$options_ = annotation.options_) != null && _annotation$options_.bound) {
      var _adm$proxy_;
      value = value.bind((_adm$proxy_ = adm.proxy_) != null ? _adm$proxy_ : adm.target_);
    }
    return {
      value: createAction(
        (_annotation$options_$ = (_annotation$options_2 = annotation.options_) == null ? void 0 : _annotation$options_2.name) != null ? _annotation$options_$ : key.toString(),
        value,
        (_annotation$options_$2 = (_annotation$options_3 = annotation.options_) == null ? void 0 : _annotation$options_3.autoAction) != null ? _annotation$options_$2 : false,
        // https://github.com/mobxjs/mobx/discussions/3140
        (_annotation$options_4 = annotation.options_) != null && _annotation$options_4.bound ? (_adm$proxy_2 = adm.proxy_) != null ? _adm$proxy_2 : adm.target_ : void 0
      ),
      // Non-configurable for classes
      // prevents accidental field redefinition in subclass
      configurable: safeDescriptors ? adm.isPlainObject_ : true,
      // https://github.com/mobxjs/mobx/pull/2641#issuecomment-737292058
      enumerable: false,
      // Non-obsevable, therefore non-writable
      // Also prevents rewriting in subclass constructor
      writable: safeDescriptors ? false : true
    };
  }
  function createFlowAnnotation(name, options) {
    return {
      annotationType_: name,
      options_: options,
      make_: make_$2,
      extend_: extend_$2,
      decorate_20223_: decorate_20223_$2
    };
  }
  function make_$2(adm, key, descriptor, source) {
    var _this$options_;
    if (source === adm.target_) {
      return this.extend_(adm, key, descriptor, false) === null ? 0 : 2;
    }
    if ((_this$options_ = this.options_) != null && _this$options_.bound && (!hasProp(adm.target_, key) || !isFlow(adm.target_[key]))) {
      if (this.extend_(adm, key, descriptor, false) === null) {
        return 0;
      }
    }
    if (isFlow(descriptor.value)) {
      return 1;
    }
    var flowDescriptor = createFlowDescriptor(adm, this, key, descriptor, false, false);
    defineProperty(source, key, flowDescriptor);
    return 2;
  }
  function extend_$2(adm, key, descriptor, proxyTrap) {
    var _this$options_2;
    var flowDescriptor = createFlowDescriptor(adm, this, key, descriptor, (_this$options_2 = this.options_) == null ? void 0 : _this$options_2.bound);
    return adm.defineProperty_(key, flowDescriptor, proxyTrap);
  }
  function decorate_20223_$2(mthd, context) {
    var _this$options_3;
    var name = context.name, addInitializer = context.addInitializer;
    if (!isFlow(mthd)) {
      mthd = flow(mthd);
    }
    if ((_this$options_3 = this.options_) != null && _this$options_3.bound) {
      addInitializer(function() {
        var self2 = this;
        var bound = self2[name].bind(self2);
        bound.isMobXFlow = true;
        self2[name] = bound;
      });
    }
    return mthd;
  }
  function assertFlowDescriptor(adm, _ref, key, _ref2) {
    _ref.annotationType_;
    _ref2.value;
  }
  function createFlowDescriptor(adm, annotation, key, descriptor, bound, safeDescriptors) {
    if (safeDescriptors === void 0) {
      safeDescriptors = globalState.safeDescriptors;
    }
    assertFlowDescriptor(adm, annotation, key, descriptor);
    var value = descriptor.value;
    if (!isFlow(value)) {
      value = flow(value);
    }
    if (bound) {
      var _adm$proxy_;
      value = value.bind((_adm$proxy_ = adm.proxy_) != null ? _adm$proxy_ : adm.target_);
      value.isMobXFlow = true;
    }
    return {
      value,
      // Non-configurable for classes
      // prevents accidental field redefinition in subclass
      configurable: safeDescriptors ? adm.isPlainObject_ : true,
      // https://github.com/mobxjs/mobx/pull/2641#issuecomment-737292058
      enumerable: false,
      // Non-obsevable, therefore non-writable
      // Also prevents rewriting in subclass constructor
      writable: safeDescriptors ? false : true
    };
  }
  function createComputedAnnotation(name, options) {
    return {
      annotationType_: name,
      options_: options,
      make_: make_$3,
      extend_: extend_$3,
      decorate_20223_: decorate_20223_$3
    };
  }
  function make_$3(adm, key, descriptor) {
    return this.extend_(adm, key, descriptor, false) === null ? 0 : 1;
  }
  function extend_$3(adm, key, descriptor, proxyTrap) {
    assertComputedDescriptor(adm, this, key, descriptor);
    return adm.defineComputedProperty_(key, _extends({}, this.options_, {
      get: descriptor.get,
      set: descriptor.set
    }), proxyTrap);
  }
  function decorate_20223_$3(get4, context) {
    var ann = this;
    var key = context.name, addInitializer = context.addInitializer;
    addInitializer(function() {
      var adm = asObservableObject(this)[$mobx];
      var options = _extends({}, ann.options_, {
        get: get4,
        context: this
      });
      options.name || (options.name = "ObservableObject." + key.toString());
      adm.values_.set(key, new ComputedValue(options));
    });
    return function() {
      return this[$mobx].getObservablePropValue_(key);
    };
  }
  function assertComputedDescriptor(adm, _ref, key, _ref2) {
    _ref.annotationType_;
    _ref2.get;
  }
  function createObservableAnnotation(name, options) {
    return {
      annotationType_: name,
      options_: options,
      make_: make_$4,
      extend_: extend_$4,
      decorate_20223_: decorate_20223_$4
    };
  }
  function make_$4(adm, key, descriptor) {
    return this.extend_(adm, key, descriptor, false) === null ? 0 : 1;
  }
  function extend_$4(adm, key, descriptor, proxyTrap) {
    var _this$options_$enhanc, _this$options_;
    assertObservableDescriptor(adm, this);
    return adm.defineObservableProperty_(key, descriptor.value, (_this$options_$enhanc = (_this$options_ = this.options_) == null ? void 0 : _this$options_.enhancer) != null ? _this$options_$enhanc : deepEnhancer, proxyTrap);
  }
  function decorate_20223_$4(desc, context) {
    var ann = this;
    var kind = context.kind, name = context.name;
    var initializedObjects = /* @__PURE__ */ new WeakSet();
    function initializeObservable(target, value) {
      var _ann$options_$enhance, _ann$options_;
      var adm = asObservableObject(target)[$mobx];
      var observable2 = new ObservableValue(value, (_ann$options_$enhance = (_ann$options_ = ann.options_) == null ? void 0 : _ann$options_.enhancer) != null ? _ann$options_$enhance : deepEnhancer, "ObservableObject." + name.toString(), false);
      adm.values_.set(name, observable2);
      initializedObjects.add(target);
    }
    if (kind == "accessor") {
      return {
        get: function get4() {
          if (!initializedObjects.has(this)) {
            initializeObservable(this, desc.get.call(this));
          }
          return this[$mobx].getObservablePropValue_(name);
        },
        set: function set5(value) {
          if (!initializedObjects.has(this)) {
            initializeObservable(this, value);
          }
          return this[$mobx].setObservablePropValue_(name, value);
        },
        init: function init(value) {
          if (!initializedObjects.has(this)) {
            initializeObservable(this, value);
          }
          return value;
        }
      };
    }
    return;
  }
  function assertObservableDescriptor(adm, _ref, key, descriptor) {
    _ref.annotationType_;
  }
  var AUTO = "true";
  var autoAnnotation = /* @__PURE__ */ createAutoAnnotation();
  function createAutoAnnotation(options) {
    return {
      annotationType_: AUTO,
      options_: options,
      make_: make_$5,
      extend_: extend_$5,
      decorate_20223_: decorate_20223_$5
    };
  }
  function make_$5(adm, key, descriptor, source) {
    var _this$options_3, _this$options_4;
    if (descriptor.get) {
      return computed.make_(adm, key, descriptor, source);
    }
    if (descriptor.set) {
      var set5 = isAction(descriptor.set) ? descriptor.set : createAction(key.toString(), descriptor.set);
      if (source === adm.target_) {
        return adm.defineProperty_(key, {
          configurable: globalState.safeDescriptors ? adm.isPlainObject_ : true,
          set: set5
        }) === null ? 0 : 2;
      }
      defineProperty(source, key, {
        configurable: true,
        set: set5
      });
      return 2;
    }
    if (source !== adm.target_ && typeof descriptor.value === "function") {
      var _this$options_2;
      if (isGenerator(descriptor.value)) {
        var _this$options_;
        var flowAnnotation2 = (_this$options_ = this.options_) != null && _this$options_.autoBind ? flow.bound : flow;
        return flowAnnotation2.make_(adm, key, descriptor, source);
      }
      var actionAnnotation2 = (_this$options_2 = this.options_) != null && _this$options_2.autoBind ? autoAction.bound : autoAction;
      return actionAnnotation2.make_(adm, key, descriptor, source);
    }
    var observableAnnotation2 = ((_this$options_3 = this.options_) == null ? void 0 : _this$options_3.deep) === false ? observable.ref : observable;
    if (typeof descriptor.value === "function" && (_this$options_4 = this.options_) != null && _this$options_4.autoBind) {
      var _adm$proxy_;
      descriptor.value = descriptor.value.bind((_adm$proxy_ = adm.proxy_) != null ? _adm$proxy_ : adm.target_);
    }
    return observableAnnotation2.make_(adm, key, descriptor, source);
  }
  function extend_$5(adm, key, descriptor, proxyTrap) {
    var _this$options_5, _this$options_6;
    if (descriptor.get) {
      return computed.extend_(adm, key, descriptor, proxyTrap);
    }
    if (descriptor.set) {
      return adm.defineProperty_(key, {
        configurable: globalState.safeDescriptors ? adm.isPlainObject_ : true,
        set: createAction(key.toString(), descriptor.set)
      }, proxyTrap);
    }
    if (typeof descriptor.value === "function" && (_this$options_5 = this.options_) != null && _this$options_5.autoBind) {
      var _adm$proxy_2;
      descriptor.value = descriptor.value.bind((_adm$proxy_2 = adm.proxy_) != null ? _adm$proxy_2 : adm.target_);
    }
    var observableAnnotation2 = ((_this$options_6 = this.options_) == null ? void 0 : _this$options_6.deep) === false ? observable.ref : observable;
    return observableAnnotation2.extend_(adm, key, descriptor, proxyTrap);
  }
  function decorate_20223_$5(desc, context) {
    die("'" + this.annotationType_ + "' cannot be used as a decorator");
  }
  var OBSERVABLE = "observable";
  var OBSERVABLE_REF = "observable.ref";
  var OBSERVABLE_SHALLOW = "observable.shallow";
  var OBSERVABLE_STRUCT = "observable.struct";
  var defaultCreateObservableOptions = {
    deep: true,
    name: void 0,
    defaultDecorator: void 0,
    proxy: true
  };
  Object.freeze(defaultCreateObservableOptions);
  function asCreateObservableOptions(thing) {
    return thing || defaultCreateObservableOptions;
  }
  var observableAnnotation = /* @__PURE__ */ createObservableAnnotation(OBSERVABLE);
  var observableRefAnnotation = /* @__PURE__ */ createObservableAnnotation(OBSERVABLE_REF, {
    enhancer: referenceEnhancer
  });
  var observableShallowAnnotation = /* @__PURE__ */ createObservableAnnotation(OBSERVABLE_SHALLOW, {
    enhancer: shallowEnhancer
  });
  var observableStructAnnotation = /* @__PURE__ */ createObservableAnnotation(OBSERVABLE_STRUCT, {
    enhancer: refStructEnhancer
  });
  var observableDecoratorAnnotation = /* @__PURE__ */ createDecoratorAnnotation(observableAnnotation);
  function getEnhancerFromOptions(options) {
    return options.deep === true ? deepEnhancer : options.deep === false ? referenceEnhancer : getEnhancerFromAnnotation(options.defaultDecorator);
  }
  function getAnnotationFromOptions(options) {
    var _options$defaultDecor;
    return options ? (_options$defaultDecor = options.defaultDecorator) != null ? _options$defaultDecor : createAutoAnnotation(options) : void 0;
  }
  function getEnhancerFromAnnotation(annotation) {
    var _annotation$options_$, _annotation$options_;
    return !annotation ? deepEnhancer : (_annotation$options_$ = (_annotation$options_ = annotation.options_) == null ? void 0 : _annotation$options_.enhancer) != null ? _annotation$options_$ : deepEnhancer;
  }
  function createObservable(v, arg2, arg3) {
    if (is20223Decorator(arg2)) {
      return observableAnnotation.decorate_20223_(v, arg2);
    }
    if (isStringish(arg2)) {
      storeAnnotation(v, arg2, observableAnnotation);
      return;
    }
    if (isObservable(v)) {
      return v;
    }
    if (isPlainObject(v)) {
      return observable.object(v, arg2, arg3);
    }
    if (Array.isArray(v)) {
      return observable.array(v, arg2);
    }
    if (isES6Map(v)) {
      return observable.map(v, arg2);
    }
    if (isES6Set(v)) {
      return observable.set(v, arg2);
    }
    if (typeof v === "object" && v !== null) {
      return v;
    }
    return observable.box(v, arg2);
  }
  assign(createObservable, observableDecoratorAnnotation);
  var observableFactories = {
    box: function box(value, options) {
      var o = asCreateObservableOptions(options);
      return new ObservableValue(value, getEnhancerFromOptions(o), o.name, true, o.equals);
    },
    array: function array(initialValues, options) {
      var o = asCreateObservableOptions(options);
      return (globalState.useProxies === false || o.proxy === false ? createLegacyArray : createObservableArray)(initialValues, getEnhancerFromOptions(o), o.name);
    },
    map: function map(initialValues, options) {
      var o = asCreateObservableOptions(options);
      return new ObservableMap(initialValues, getEnhancerFromOptions(o), o.name);
    },
    set: function set(initialValues, options) {
      var o = asCreateObservableOptions(options);
      return new ObservableSet(initialValues, getEnhancerFromOptions(o), o.name);
    },
    object: function object(props, decorators, options) {
      return initObservable(function() {
        return extendObservable(globalState.useProxies === false || (options == null ? void 0 : options.proxy) === false ? asObservableObject({}, options) : asDynamicObservableObject({}, options), props, decorators);
      });
    },
    ref: /* @__PURE__ */ createDecoratorAnnotation(observableRefAnnotation),
    shallow: /* @__PURE__ */ createDecoratorAnnotation(observableShallowAnnotation),
    deep: observableDecoratorAnnotation,
    struct: /* @__PURE__ */ createDecoratorAnnotation(observableStructAnnotation)
  };
  var observable = /* @__PURE__ */ assign(createObservable, observableFactories);
  var COMPUTED = "computed";
  var COMPUTED_STRUCT = "computed.struct";
  var computedAnnotation = /* @__PURE__ */ createComputedAnnotation(COMPUTED);
  var computedStructAnnotation = /* @__PURE__ */ createComputedAnnotation(COMPUTED_STRUCT, {
    equals: comparer.structural
  });
  var computed = function computed2(arg1, arg2) {
    if (is20223Decorator(arg2)) {
      return computedAnnotation.decorate_20223_(arg1, arg2);
    }
    if (isStringish(arg2)) {
      return storeAnnotation(arg1, arg2, computedAnnotation);
    }
    if (isPlainObject(arg1)) {
      return createDecoratorAnnotation(createComputedAnnotation(COMPUTED, arg1));
    }
    var opts = isPlainObject(arg2) ? arg2 : {};
    opts.get = arg1;
    opts.name || (opts.name = arg1.name || "");
    return new ComputedValue(opts);
  };
  Object.assign(computed, computedAnnotation);
  computed.struct = /* @__PURE__ */ createDecoratorAnnotation(computedStructAnnotation);
  var _getDescriptor$config, _getDescriptor;
  var currentActionId = 0;
  var nextActionId = 1;
  var isFunctionNameConfigurable = (_getDescriptor$config = (_getDescriptor = /* @__PURE__ */ getDescriptor(function() {
  }, "name")) == null ? void 0 : _getDescriptor.configurable) != null ? _getDescriptor$config : false;
  var tmpNameDescriptor = {
    value: "action",
    configurable: true,
    writable: false,
    enumerable: false
  };
  function createAction(actionName, fn, autoAction2, ref) {
    if (autoAction2 === void 0) {
      autoAction2 = false;
    }
    function res() {
      return executeAction(actionName, autoAction2, fn, ref || this, arguments);
    }
    res.isMobxAction = true;
    res.toString = function() {
      return fn.toString();
    };
    if (isFunctionNameConfigurable) {
      tmpNameDescriptor.value = actionName;
      defineProperty(res, "name", tmpNameDescriptor);
    }
    return res;
  }
  function executeAction(actionName, canRunAsDerivation, fn, scope, args) {
    var runInfo = _startAction(actionName, canRunAsDerivation);
    try {
      return fn.apply(scope, args);
    } catch (err) {
      runInfo.error_ = err;
      throw err;
    } finally {
      _endAction(runInfo);
    }
  }
  function _startAction(actionName, canRunAsDerivation, scope, args) {
    var notifySpy_ = false;
    var startTime_ = 0;
    var prevDerivation_ = globalState.trackingDerivation;
    var runAsAction = !canRunAsDerivation || !prevDerivation_;
    startBatch();
    var prevAllowStateChanges_ = globalState.allowStateChanges;
    if (runAsAction) {
      untrackedStart();
      prevAllowStateChanges_ = allowStateChangesStart(true);
    }
    var prevAllowStateReads_ = allowStateReadsStart(true);
    var runInfo = {
      runAsAction_: runAsAction,
      prevDerivation_,
      prevAllowStateChanges_,
      prevAllowStateReads_,
      notifySpy_,
      startTime_,
      actionId_: nextActionId++,
      parentActionId_: currentActionId
    };
    currentActionId = runInfo.actionId_;
    return runInfo;
  }
  function _endAction(runInfo) {
    if (currentActionId !== runInfo.actionId_) {
      die(30);
    }
    currentActionId = runInfo.parentActionId_;
    if (runInfo.error_ !== void 0) {
      globalState.suppressReactionErrors = true;
    }
    allowStateChangesEnd(runInfo.prevAllowStateChanges_);
    allowStateReadsEnd(runInfo.prevAllowStateReads_);
    endBatch();
    if (runInfo.runAsAction_) {
      untrackedEnd(runInfo.prevDerivation_);
    }
    globalState.suppressReactionErrors = false;
  }
  function allowStateChanges(allowStateChanges2, func) {
    var prev = allowStateChangesStart(allowStateChanges2);
    try {
      return func();
    } finally {
      allowStateChangesEnd(prev);
    }
  }
  function allowStateChangesStart(allowStateChanges2) {
    var prev = globalState.allowStateChanges;
    globalState.allowStateChanges = allowStateChanges2;
    return prev;
  }
  function allowStateChangesEnd(prev) {
    globalState.allowStateChanges = prev;
  }
  var ObservableValue = /* @__PURE__ */ (function(_Atom) {
    function ObservableValue2(value, enhancer, name_, notifySpy, equals) {
      var _this;
      if (name_ === void 0) {
        name_ = "ObservableValue";
      }
      if (equals === void 0) {
        equals = comparer["default"];
      }
      _this = _Atom.call(this, name_) || this;
      _this.enhancer = void 0;
      _this.name_ = void 0;
      _this.equals = void 0;
      _this.hasUnreportedChange_ = false;
      _this.interceptors_ = void 0;
      _this.changeListeners_ = void 0;
      _this.value_ = void 0;
      _this.dehancer = void 0;
      _this.enhancer = enhancer;
      _this.name_ = name_;
      _this.equals = equals;
      _this.value_ = enhancer(value, void 0, name_);
      return _this;
    }
    _inheritsLoose(ObservableValue2, _Atom);
    var _proto = ObservableValue2.prototype;
    _proto.dehanceValue = function dehanceValue(value) {
      if (this.dehancer !== void 0) {
        return this.dehancer(value);
      }
      return value;
    };
    _proto.set = function set5(newValue) {
      this.value_;
      newValue = this.prepareNewValue_(newValue);
      if (newValue !== globalState.UNCHANGED) {
        this.setNewValue_(newValue);
      }
    };
    _proto.prepareNewValue_ = function prepareNewValue_(newValue) {
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          object: this,
          type: UPDATE,
          newValue
        });
        if (!change) {
          return globalState.UNCHANGED;
        }
        newValue = change.newValue;
      }
      newValue = this.enhancer(newValue, this.value_, this.name_);
      return this.equals(this.value_, newValue) ? globalState.UNCHANGED : newValue;
    };
    _proto.setNewValue_ = function setNewValue_(newValue) {
      var oldValue = this.value_;
      this.value_ = newValue;
      this.reportChanged();
      if (hasListeners(this)) {
        notifyListeners(this, {
          type: UPDATE,
          object: this,
          newValue,
          oldValue
        });
      }
    };
    _proto.get = function get4() {
      this.reportObserved();
      return this.dehanceValue(this.value_);
    };
    _proto.intercept_ = function intercept_(handler) {
      return registerInterceptor(this, handler);
    };
    _proto.observe_ = function observe_(listener, fireImmediately) {
      if (fireImmediately) {
        listener({
          observableKind: "value",
          debugObjectName: this.name_,
          object: this,
          type: UPDATE,
          newValue: this.value_,
          oldValue: void 0
        });
      }
      return registerListener(this, listener);
    };
    _proto.raw = function raw() {
      return this.value_;
    };
    _proto.toJSON = function toJSON2() {
      return this.get();
    };
    _proto.toString = function toString2() {
      return this.name_ + "[" + this.value_ + "]";
    };
    _proto.valueOf = function valueOf() {
      return toPrimitive(this.get());
    };
    _proto[Symbol.toPrimitive] = function() {
      return this.valueOf();
    };
    return ObservableValue2;
  })(Atom);
  var ComputedValue = /* @__PURE__ */ (function() {
    function ComputedValue2(options) {
      this.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
      this.observing_ = [];
      this.newObserving_ = null;
      this.observers_ = /* @__PURE__ */ new Set();
      this.runId_ = 0;
      this.lastAccessedBy_ = 0;
      this.lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
      this.unboundDepsCount_ = 0;
      this.value_ = new CaughtException(null);
      this.name_ = void 0;
      this.triggeredBy_ = void 0;
      this.flags_ = 0;
      this.derivation = void 0;
      this.setter_ = void 0;
      this.isTracing_ = TraceMode.NONE;
      this.scope_ = void 0;
      this.equals_ = void 0;
      this.requiresReaction_ = void 0;
      this.keepAlive_ = void 0;
      this.onBOL = void 0;
      this.onBUOL = void 0;
      if (!options.get) {
        die(31);
      }
      this.derivation = options.get;
      this.name_ = options.name || "ComputedValue";
      if (options.set) {
        this.setter_ = createAction("ComputedValue-setter", options.set);
      }
      this.equals_ = options.equals || (options.compareStructural || options.struct ? comparer.structural : comparer["default"]);
      this.scope_ = options.context;
      this.requiresReaction_ = options.requiresReaction;
      this.keepAlive_ = !!options.keepAlive;
    }
    var _proto = ComputedValue2.prototype;
    _proto.onBecomeStale_ = function onBecomeStale_() {
      propagateMaybeChanged(this);
    };
    _proto.onBO = function onBO() {
      if (this.onBOL) {
        this.onBOL.forEach(function(listener) {
          return listener();
        });
      }
    };
    _proto.onBUO = function onBUO() {
      if (this.onBUOL) {
        this.onBUOL.forEach(function(listener) {
          return listener();
        });
      }
    };
    _proto.get = function get4() {
      if (this.isComputing) {
        die(32, this.name_, this.derivation);
      }
      if (globalState.inBatch === 0 && // !globalState.trackingDerivatpion &&
      this.observers_.size === 0 && !this.keepAlive_) {
        if (shouldCompute(this)) {
          this.warnAboutUntrackedRead_();
          startBatch();
          this.value_ = this.computeValue_(false);
          endBatch();
        }
      } else {
        reportObserved(this);
        if (shouldCompute(this)) {
          var prevTrackingContext = globalState.trackingContext;
          if (this.keepAlive_ && !prevTrackingContext) {
            globalState.trackingContext = this;
          }
          if (this.trackAndCompute()) {
            propagateChangeConfirmed(this);
          }
          globalState.trackingContext = prevTrackingContext;
        }
      }
      var result = this.value_;
      if (isCaughtException(result)) {
        throw result.cause;
      }
      return result;
    };
    _proto.set = function set5(value) {
      if (this.setter_) {
        if (this.isRunningSetter) {
          die(33, this.name_);
        }
        this.isRunningSetter = true;
        try {
          this.setter_.call(this.scope_, value);
        } finally {
          this.isRunningSetter = false;
        }
      } else {
        die(34, this.name_);
      }
    };
    _proto.trackAndCompute = function trackAndCompute() {
      var oldValue = this.value_;
      var wasSuspended = (
        /* see #1208 */
        this.dependenciesState_ === IDerivationState_.NOT_TRACKING_
      );
      var newValue = this.computeValue_(true);
      var changed = wasSuspended || isCaughtException(oldValue) || isCaughtException(newValue) || !this.equals_(oldValue, newValue);
      if (changed) {
        this.value_ = newValue;
      }
      return changed;
    };
    _proto.computeValue_ = function computeValue_(track) {
      this.isComputing = true;
      var prev = allowStateChangesStart(false);
      var res;
      if (track) {
        res = trackDerivedFunction(this, this.derivation, this.scope_);
      } else {
        if (globalState.disableErrorBoundaries === true) {
          res = this.derivation.call(this.scope_);
        } else {
          try {
            res = this.derivation.call(this.scope_);
          } catch (e) {
            res = new CaughtException(e);
          }
        }
      }
      allowStateChangesEnd(prev);
      this.isComputing = false;
      return res;
    };
    _proto.suspend_ = function suspend_() {
      if (!this.keepAlive_) {
        clearObserving(this);
        this.value_ = void 0;
      }
    };
    _proto.observe_ = function observe_(listener, fireImmediately) {
      var _this = this;
      var firstTime = true;
      var prevValue = void 0;
      return autorun(function() {
        var newValue = _this.get();
        if (!firstTime || fireImmediately) {
          var prevU = untrackedStart();
          listener({
            observableKind: "computed",
            debugObjectName: _this.name_,
            type: UPDATE,
            object: _this,
            newValue,
            oldValue: prevValue
          });
          untrackedEnd(prevU);
        }
        firstTime = false;
        prevValue = newValue;
      });
    };
    _proto.warnAboutUntrackedRead_ = function warnAboutUntrackedRead_() {
      {
        return;
      }
    };
    _proto.toString = function toString2() {
      return this.name_ + "[" + this.derivation.toString() + "]";
    };
    _proto.valueOf = function valueOf() {
      return toPrimitive(this.get());
    };
    _proto[Symbol.toPrimitive] = function() {
      return this.valueOf();
    };
    return _createClass(ComputedValue2, [{
      key: "isComputing",
      get: function get4() {
        return getFlag(this.flags_, ComputedValue2.isComputingMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, ComputedValue2.isComputingMask_, newValue);
      }
    }, {
      key: "isRunningSetter",
      get: function get4() {
        return getFlag(this.flags_, ComputedValue2.isRunningSetterMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, ComputedValue2.isRunningSetterMask_, newValue);
      }
    }, {
      key: "isBeingObserved",
      get: function get4() {
        return getFlag(this.flags_, ComputedValue2.isBeingObservedMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, ComputedValue2.isBeingObservedMask_, newValue);
      }
    }, {
      key: "isPendingUnobservation",
      get: function get4() {
        return getFlag(this.flags_, ComputedValue2.isPendingUnobservationMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, ComputedValue2.isPendingUnobservationMask_, newValue);
      }
    }, {
      key: "diffValue",
      get: function get4() {
        return getFlag(this.flags_, ComputedValue2.diffValueMask_) ? 1 : 0;
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, ComputedValue2.diffValueMask_, newValue === 1 ? true : false);
      }
    }]);
  })();
  ComputedValue.isComputingMask_ = 1;
  ComputedValue.isRunningSetterMask_ = 2;
  ComputedValue.isBeingObservedMask_ = 4;
  ComputedValue.isPendingUnobservationMask_ = 8;
  ComputedValue.diffValueMask_ = 16;
  var isComputedValue = /* @__PURE__ */ createInstanceofPredicate("ComputedValue", ComputedValue);
  var IDerivationState_;
  (function(IDerivationState_2) {
    IDerivationState_2[IDerivationState_2["NOT_TRACKING_"] = -1] = "NOT_TRACKING_";
    IDerivationState_2[IDerivationState_2["UP_TO_DATE_"] = 0] = "UP_TO_DATE_";
    IDerivationState_2[IDerivationState_2["POSSIBLY_STALE_"] = 1] = "POSSIBLY_STALE_";
    IDerivationState_2[IDerivationState_2["STALE_"] = 2] = "STALE_";
  })(IDerivationState_ || (IDerivationState_ = {}));
  var TraceMode;
  (function(TraceMode2) {
    TraceMode2[TraceMode2["NONE"] = 0] = "NONE";
    TraceMode2[TraceMode2["LOG"] = 1] = "LOG";
    TraceMode2[TraceMode2["BREAK"] = 2] = "BREAK";
  })(TraceMode || (TraceMode = {}));
  var CaughtException = function CaughtException2(cause) {
    this.cause = void 0;
    this.cause = cause;
  };
  function isCaughtException(e) {
    return e instanceof CaughtException;
  }
  function shouldCompute(derivation) {
    switch (derivation.dependenciesState_) {
      case IDerivationState_.UP_TO_DATE_:
        return false;
      case IDerivationState_.NOT_TRACKING_:
      case IDerivationState_.STALE_:
        return true;
      case IDerivationState_.POSSIBLY_STALE_: {
        var prevAllowStateReads = allowStateReadsStart(true);
        var prevUntracked = untrackedStart();
        var obs = derivation.observing_, l = obs.length;
        for (var i = 0; i < l; i++) {
          var obj = obs[i];
          if (isComputedValue(obj)) {
            if (globalState.disableErrorBoundaries) {
              obj.get();
            } else {
              try {
                obj.get();
              } catch (e) {
                untrackedEnd(prevUntracked);
                allowStateReadsEnd(prevAllowStateReads);
                return true;
              }
            }
            if (derivation.dependenciesState_ === IDerivationState_.STALE_) {
              untrackedEnd(prevUntracked);
              allowStateReadsEnd(prevAllowStateReads);
              return true;
            }
          }
        }
        changeDependenciesStateTo0(derivation);
        untrackedEnd(prevUntracked);
        allowStateReadsEnd(prevAllowStateReads);
        return false;
      }
    }
  }
  function checkIfStateModificationsAreAllowed(atom) {
    {
      return;
    }
  }
  function trackDerivedFunction(derivation, f, context) {
    var prevAllowStateReads = allowStateReadsStart(true);
    changeDependenciesStateTo0(derivation);
    derivation.newObserving_ = new Array(
      // Reserve constant space for initial dependencies, dynamic space otherwise.
      // See https://github.com/mobxjs/mobx/pull/3833
      derivation.runId_ === 0 ? 100 : derivation.observing_.length
    );
    derivation.unboundDepsCount_ = 0;
    derivation.runId_ = ++globalState.runId;
    var prevTracking = globalState.trackingDerivation;
    globalState.trackingDerivation = derivation;
    globalState.inBatch++;
    var result;
    if (globalState.disableErrorBoundaries === true) {
      result = f.call(context);
    } else {
      try {
        result = f.call(context);
      } catch (e) {
        result = new CaughtException(e);
      }
    }
    globalState.inBatch--;
    globalState.trackingDerivation = prevTracking;
    bindDependencies(derivation);
    allowStateReadsEnd(prevAllowStateReads);
    return result;
  }
  function bindDependencies(derivation) {
    var prevObserving = derivation.observing_;
    var observing = derivation.observing_ = derivation.newObserving_;
    var lowestNewObservingDerivationState = IDerivationState_.UP_TO_DATE_;
    var i0 = 0, l = derivation.unboundDepsCount_;
    for (var i = 0; i < l; i++) {
      var dep = observing[i];
      if (dep.diffValue === 0) {
        dep.diffValue = 1;
        if (i0 !== i) {
          observing[i0] = dep;
        }
        i0++;
      }
      if (dep.dependenciesState_ > lowestNewObservingDerivationState) {
        lowestNewObservingDerivationState = dep.dependenciesState_;
      }
    }
    observing.length = i0;
    derivation.newObserving_ = null;
    l = prevObserving.length;
    while (l--) {
      var _dep = prevObserving[l];
      if (_dep.diffValue === 0) {
        removeObserver(_dep, derivation);
      }
      _dep.diffValue = 0;
    }
    while (i0--) {
      var _dep2 = observing[i0];
      if (_dep2.diffValue === 1) {
        _dep2.diffValue = 0;
        addObserver(_dep2, derivation);
      }
    }
    if (lowestNewObservingDerivationState !== IDerivationState_.UP_TO_DATE_) {
      derivation.dependenciesState_ = lowestNewObservingDerivationState;
      derivation.onBecomeStale_();
    }
  }
  function clearObserving(derivation) {
    var obs = derivation.observing_;
    derivation.observing_ = [];
    var i = obs.length;
    while (i--) {
      removeObserver(obs[i], derivation);
    }
    derivation.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
  }
  function untracked(action2) {
    var prev = untrackedStart();
    try {
      return action2();
    } finally {
      untrackedEnd(prev);
    }
  }
  function untrackedStart() {
    var prev = globalState.trackingDerivation;
    globalState.trackingDerivation = null;
    return prev;
  }
  function untrackedEnd(prev) {
    globalState.trackingDerivation = prev;
  }
  function allowStateReadsStart(allowStateReads) {
    var prev = globalState.allowStateReads;
    globalState.allowStateReads = allowStateReads;
    return prev;
  }
  function allowStateReadsEnd(prev) {
    globalState.allowStateReads = prev;
  }
  function changeDependenciesStateTo0(derivation) {
    if (derivation.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
      return;
    }
    derivation.dependenciesState_ = IDerivationState_.UP_TO_DATE_;
    var obs = derivation.observing_;
    var i = obs.length;
    while (i--) {
      obs[i].lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
    }
  }
  var MobXGlobals = function MobXGlobals2() {
    this.version = 6;
    this.UNCHANGED = {};
    this.trackingDerivation = null;
    this.trackingContext = null;
    this.runId = 0;
    this.mobxGuid = 0;
    this.inBatch = 0;
    this.pendingUnobservations = [];
    this.pendingReactions = [];
    this.isRunningReactions = false;
    this.allowStateChanges = false;
    this.allowStateReads = true;
    this.enforceActions = true;
    this.spyListeners = [];
    this.globalReactionErrorHandlers = [];
    this.computedRequiresReaction = false;
    this.reactionRequiresObservable = false;
    this.observableRequiresReaction = false;
    this.disableErrorBoundaries = false;
    this.suppressReactionErrors = false;
    this.useProxies = true;
    this.verifyProxies = false;
    this.safeDescriptors = true;
  };
  var canMergeGlobalState = true;
  var globalState = /* @__PURE__ */ (function() {
    var global2 = /* @__PURE__ */ getGlobal();
    if (global2.__mobxInstanceCount > 0 && !global2.__mobxGlobals) {
      canMergeGlobalState = false;
    }
    if (global2.__mobxGlobals && global2.__mobxGlobals.version !== new MobXGlobals().version) {
      canMergeGlobalState = false;
    }
    if (!canMergeGlobalState) {
      setTimeout(function() {
        {
          die(35);
        }
      }, 1);
      return new MobXGlobals();
    } else if (global2.__mobxGlobals) {
      global2.__mobxInstanceCount += 1;
      if (!global2.__mobxGlobals.UNCHANGED) {
        global2.__mobxGlobals.UNCHANGED = {};
      }
      return global2.__mobxGlobals;
    } else {
      global2.__mobxInstanceCount = 1;
      return global2.__mobxGlobals = /* @__PURE__ */ new MobXGlobals();
    }
  })();
  function addObserver(observable2, node) {
    observable2.observers_.add(node);
    if (observable2.lowestObserverState_ > node.dependenciesState_) {
      observable2.lowestObserverState_ = node.dependenciesState_;
    }
  }
  function removeObserver(observable2, node) {
    observable2.observers_["delete"](node);
    if (observable2.observers_.size === 0) {
      queueForUnobservation(observable2);
    }
  }
  function queueForUnobservation(observable2) {
    if (observable2.isPendingUnobservation === false) {
      observable2.isPendingUnobservation = true;
      globalState.pendingUnobservations.push(observable2);
    }
  }
  function startBatch() {
    globalState.inBatch++;
  }
  function endBatch() {
    if (--globalState.inBatch === 0) {
      runReactions();
      var list = globalState.pendingUnobservations;
      for (var i = 0; i < list.length; i++) {
        var observable2 = list[i];
        observable2.isPendingUnobservation = false;
        if (observable2.observers_.size === 0) {
          if (observable2.isBeingObserved) {
            observable2.isBeingObserved = false;
            observable2.onBUO();
          }
          if (observable2 instanceof ComputedValue) {
            observable2.suspend_();
          }
        }
      }
      globalState.pendingUnobservations = [];
    }
  }
  function reportObserved(observable2) {
    var derivation = globalState.trackingDerivation;
    if (derivation !== null) {
      if (derivation.runId_ !== observable2.lastAccessedBy_) {
        observable2.lastAccessedBy_ = derivation.runId_;
        derivation.newObserving_[derivation.unboundDepsCount_++] = observable2;
        if (!observable2.isBeingObserved && globalState.trackingContext) {
          observable2.isBeingObserved = true;
          observable2.onBO();
        }
      }
      return observable2.isBeingObserved;
    } else if (observable2.observers_.size === 0 && globalState.inBatch > 0) {
      queueForUnobservation(observable2);
    }
    return false;
  }
  function propagateChanged(observable2) {
    if (observable2.lowestObserverState_ === IDerivationState_.STALE_) {
      return;
    }
    observable2.lowestObserverState_ = IDerivationState_.STALE_;
    observable2.observers_.forEach(function(d) {
      if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
        d.onBecomeStale_();
      }
      d.dependenciesState_ = IDerivationState_.STALE_;
    });
  }
  function propagateChangeConfirmed(observable2) {
    if (observable2.lowestObserverState_ === IDerivationState_.STALE_) {
      return;
    }
    observable2.lowestObserverState_ = IDerivationState_.STALE_;
    observable2.observers_.forEach(function(d) {
      if (d.dependenciesState_ === IDerivationState_.POSSIBLY_STALE_) {
        d.dependenciesState_ = IDerivationState_.STALE_;
      } else if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
        observable2.lowestObserverState_ = IDerivationState_.UP_TO_DATE_;
      }
    });
  }
  function propagateMaybeChanged(observable2) {
    if (observable2.lowestObserverState_ !== IDerivationState_.UP_TO_DATE_) {
      return;
    }
    observable2.lowestObserverState_ = IDerivationState_.POSSIBLY_STALE_;
    observable2.observers_.forEach(function(d) {
      if (d.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
        d.dependenciesState_ = IDerivationState_.POSSIBLY_STALE_;
        d.onBecomeStale_();
      }
    });
  }
  var Reaction = /* @__PURE__ */ (function() {
    function Reaction2(name_, onInvalidate_, errorHandler_, requiresObservable_) {
      if (name_ === void 0) {
        name_ = "Reaction";
      }
      this.name_ = void 0;
      this.onInvalidate_ = void 0;
      this.errorHandler_ = void 0;
      this.requiresObservable_ = void 0;
      this.observing_ = [];
      this.newObserving_ = [];
      this.dependenciesState_ = IDerivationState_.NOT_TRACKING_;
      this.runId_ = 0;
      this.unboundDepsCount_ = 0;
      this.flags_ = 0;
      this.isTracing_ = TraceMode.NONE;
      this.name_ = name_;
      this.onInvalidate_ = onInvalidate_;
      this.errorHandler_ = errorHandler_;
      this.requiresObservable_ = requiresObservable_;
    }
    var _proto = Reaction2.prototype;
    _proto.onBecomeStale_ = function onBecomeStale_() {
      this.schedule_();
    };
    _proto.schedule_ = function schedule_() {
      if (!this.isScheduled) {
        this.isScheduled = true;
        globalState.pendingReactions.push(this);
        runReactions();
      }
    };
    _proto.runReaction_ = function runReaction_() {
      if (!this.isDisposed) {
        startBatch();
        this.isScheduled = false;
        var prev = globalState.trackingContext;
        globalState.trackingContext = this;
        if (shouldCompute(this)) {
          this.isTrackPending = true;
          try {
            this.onInvalidate_();
            if (false) ;
          } catch (e) {
            this.reportExceptionInDerivation_(e);
          }
        }
        globalState.trackingContext = prev;
        endBatch();
      }
    };
    _proto.track = function track(fn) {
      if (this.isDisposed) {
        return;
      }
      startBatch();
      this.isRunning = true;
      var prevReaction = globalState.trackingContext;
      globalState.trackingContext = this;
      var result = trackDerivedFunction(this, fn, void 0);
      globalState.trackingContext = prevReaction;
      this.isRunning = false;
      this.isTrackPending = false;
      if (this.isDisposed) {
        clearObserving(this);
      }
      if (isCaughtException(result)) {
        this.reportExceptionInDerivation_(result.cause);
      }
      endBatch();
    };
    _proto.reportExceptionInDerivation_ = function reportExceptionInDerivation_(error) {
      var _this = this;
      if (this.errorHandler_) {
        this.errorHandler_(error, this);
        return;
      }
      if (globalState.disableErrorBoundaries) {
        throw error;
      }
      var message = "[mobx] uncaught error in '" + this + "'";
      if (!globalState.suppressReactionErrors) {
        console.error(message, error);
      }
      globalState.globalReactionErrorHandlers.forEach(function(f) {
        return f(error, _this);
      });
    };
    _proto.dispose = function dispose() {
      if (!this.isDisposed) {
        this.isDisposed = true;
        if (!this.isRunning) {
          startBatch();
          clearObserving(this);
          endBatch();
        }
      }
    };
    _proto.getDisposer_ = function getDisposer_(abortSignal) {
      var _this2 = this;
      var dispose = function dispose2() {
        _this2.dispose();
        abortSignal == null || abortSignal.removeEventListener == null || abortSignal.removeEventListener("abort", dispose2);
      };
      abortSignal == null || abortSignal.addEventListener == null || abortSignal.addEventListener("abort", dispose);
      dispose[$mobx] = this;
      if ("dispose" in Symbol && typeof Symbol.dispose === "symbol") {
        dispose[Symbol.dispose] = dispose;
      }
      return dispose;
    };
    _proto.toString = function toString2() {
      return "Reaction[" + this.name_ + "]";
    };
    _proto.trace = function trace$1(enterBreakPoint) {
    };
    return _createClass(Reaction2, [{
      key: "isDisposed",
      get: function get4() {
        return getFlag(this.flags_, Reaction2.isDisposedMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Reaction2.isDisposedMask_, newValue);
      }
    }, {
      key: "isScheduled",
      get: function get4() {
        return getFlag(this.flags_, Reaction2.isScheduledMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Reaction2.isScheduledMask_, newValue);
      }
    }, {
      key: "isTrackPending",
      get: function get4() {
        return getFlag(this.flags_, Reaction2.isTrackPendingMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Reaction2.isTrackPendingMask_, newValue);
      }
    }, {
      key: "isRunning",
      get: function get4() {
        return getFlag(this.flags_, Reaction2.isRunningMask_);
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Reaction2.isRunningMask_, newValue);
      }
    }, {
      key: "diffValue",
      get: function get4() {
        return getFlag(this.flags_, Reaction2.diffValueMask_) ? 1 : 0;
      },
      set: function set5(newValue) {
        this.flags_ = setFlag(this.flags_, Reaction2.diffValueMask_, newValue === 1 ? true : false);
      }
    }]);
  })();
  Reaction.isDisposedMask_ = 1;
  Reaction.isScheduledMask_ = 2;
  Reaction.isTrackPendingMask_ = 4;
  Reaction.isRunningMask_ = 8;
  Reaction.diffValueMask_ = 16;
  var MAX_REACTION_ITERATIONS = 100;
  var reactionScheduler = function reactionScheduler2(f) {
    return f();
  };
  function runReactions() {
    if (globalState.inBatch > 0 || globalState.isRunningReactions) {
      return;
    }
    reactionScheduler(runReactionsHelper);
  }
  function runReactionsHelper() {
    globalState.isRunningReactions = true;
    var allReactions = globalState.pendingReactions;
    var iterations = 0;
    while (allReactions.length > 0) {
      if (++iterations === MAX_REACTION_ITERATIONS) {
        console.error("[mobx] cycle in reaction: " + allReactions[0]);
        allReactions.splice(0);
      }
      var remainingReactions = allReactions.splice(0);
      for (var i = 0, l = remainingReactions.length; i < l; i++) {
        remainingReactions[i].runReaction_();
      }
    }
    globalState.isRunningReactions = false;
  }
  var isReaction = /* @__PURE__ */ createInstanceofPredicate("Reaction", Reaction);
  function isSpyEnabled() {
    return false;
  }
  function spyReport(event) {
    {
      return;
    }
  }
  function spyReportStart(event) {
    {
      return;
    }
  }
  function spyReportEnd(change) {
    {
      return;
    }
  }
  function spy(listener) {
    {
      console.warn("[mobx.spy] Is a no-op in production builds");
      return function() {
      };
    }
  }
  var ACTION = "action";
  var ACTION_BOUND = "action.bound";
  var AUTOACTION = "autoAction";
  var AUTOACTION_BOUND = "autoAction.bound";
  var DEFAULT_ACTION_NAME = "<unnamed action>";
  var actionAnnotation = /* @__PURE__ */ createActionAnnotation(ACTION);
  var actionBoundAnnotation = /* @__PURE__ */ createActionAnnotation(ACTION_BOUND, {
    bound: true
  });
  var autoActionAnnotation = /* @__PURE__ */ createActionAnnotation(AUTOACTION, {
    autoAction: true
  });
  var autoActionBoundAnnotation = /* @__PURE__ */ createActionAnnotation(AUTOACTION_BOUND, {
    autoAction: true,
    bound: true
  });
  function createActionFactory(autoAction2) {
    var res = function action2(arg1, arg2) {
      if (isFunction(arg1)) {
        return createAction(arg1.name || DEFAULT_ACTION_NAME, arg1, autoAction2);
      }
      if (isFunction(arg2)) {
        return createAction(arg1, arg2, autoAction2);
      }
      if (is20223Decorator(arg2)) {
        return (autoAction2 ? autoActionAnnotation : actionAnnotation).decorate_20223_(arg1, arg2);
      }
      if (isStringish(arg2)) {
        return storeAnnotation(arg1, arg2, autoAction2 ? autoActionAnnotation : actionAnnotation);
      }
      if (isStringish(arg1)) {
        return createDecoratorAnnotation(createActionAnnotation(autoAction2 ? AUTOACTION : ACTION, {
          name: arg1,
          autoAction: autoAction2
        }));
      }
    };
    return res;
  }
  var action = /* @__PURE__ */ createActionFactory(false);
  Object.assign(action, actionAnnotation);
  var autoAction = /* @__PURE__ */ createActionFactory(true);
  Object.assign(autoAction, autoActionAnnotation);
  action.bound = /* @__PURE__ */ createDecoratorAnnotation(actionBoundAnnotation);
  autoAction.bound = /* @__PURE__ */ createDecoratorAnnotation(autoActionBoundAnnotation);
  function runInAction(fn) {
    return executeAction(fn.name || DEFAULT_ACTION_NAME, false, fn, this, void 0);
  }
  function isAction(thing) {
    return isFunction(thing) && thing.isMobxAction === true;
  }
  function autorun(view, opts) {
    var _opts$name, _opts, _opts2, _opts3;
    if (opts === void 0) {
      opts = EMPTY_OBJECT;
    }
    var name = (_opts$name = (_opts = opts) == null ? void 0 : _opts.name) != null ? _opts$name : "Autorun";
    var runSync = !opts.scheduler && !opts.delay;
    var reaction2;
    if (runSync) {
      reaction2 = new Reaction(name, function() {
        this.track(reactionRunner);
      }, opts.onError, opts.requiresObservable);
    } else {
      var scheduler = createSchedulerFromOptions(opts);
      var isScheduled = false;
      reaction2 = new Reaction(name, function() {
        if (!isScheduled) {
          isScheduled = true;
          scheduler(function() {
            isScheduled = false;
            if (!reaction2.isDisposed) {
              reaction2.track(reactionRunner);
            }
          });
        }
      }, opts.onError, opts.requiresObservable);
    }
    function reactionRunner() {
      view(reaction2);
    }
    if (!((_opts2 = opts) != null && (_opts2 = _opts2.signal) != null && _opts2.aborted)) {
      reaction2.schedule_();
    }
    return reaction2.getDisposer_((_opts3 = opts) == null ? void 0 : _opts3.signal);
  }
  var run = function run2(f) {
    return f();
  };
  function createSchedulerFromOptions(opts) {
    return opts.scheduler ? opts.scheduler : opts.delay ? function(f) {
      return setTimeout(f, opts.delay);
    } : run;
  }
  function reaction(expression, effect, opts) {
    var _opts$name2, _opts4, _opts5;
    if (opts === void 0) {
      opts = EMPTY_OBJECT;
    }
    var name = (_opts$name2 = opts.name) != null ? _opts$name2 : "Reaction";
    var effectAction = action(name, opts.onError ? wrapErrorHandler(opts.onError, effect) : effect);
    var runSync = !opts.scheduler && !opts.delay;
    var scheduler = createSchedulerFromOptions(opts);
    var firstTime = true;
    var isScheduled = false;
    var value;
    var equals = opts.compareStructural ? comparer.structural : opts.equals || comparer["default"];
    var r = new Reaction(name, function() {
      if (firstTime || runSync) {
        reactionRunner();
      } else if (!isScheduled) {
        isScheduled = true;
        scheduler(reactionRunner);
      }
    }, opts.onError, opts.requiresObservable);
    function reactionRunner() {
      isScheduled = false;
      if (r.isDisposed) {
        return;
      }
      var changed = false;
      var oldValue = value;
      r.track(function() {
        var nextValue = allowStateChanges(false, function() {
          return expression(r);
        });
        changed = firstTime || !equals(value, nextValue);
        value = nextValue;
      });
      if (firstTime && opts.fireImmediately) {
        effectAction(value, oldValue, r);
      } else if (!firstTime && changed) {
        effectAction(value, oldValue, r);
      }
      firstTime = false;
    }
    if (!((_opts4 = opts) != null && (_opts4 = _opts4.signal) != null && _opts4.aborted)) {
      r.schedule_();
    }
    return r.getDisposer_((_opts5 = opts) == null ? void 0 : _opts5.signal);
  }
  function wrapErrorHandler(errorHandler, baseFn) {
    return function() {
      try {
        return baseFn.apply(this, arguments);
      } catch (e) {
        errorHandler.call(this, e);
      }
    };
  }
  var ON_BECOME_OBSERVED = "onBO";
  var ON_BECOME_UNOBSERVED = "onBUO";
  function onBecomeObserved(thing, arg2, arg3) {
    return interceptHook(ON_BECOME_OBSERVED, thing, arg2, arg3);
  }
  function onBecomeUnobserved(thing, arg2, arg3) {
    return interceptHook(ON_BECOME_UNOBSERVED, thing, arg2, arg3);
  }
  function interceptHook(hook, thing, arg2, arg3) {
    var atom = getAtom(thing);
    var cb = isFunction(arg3) ? arg3 : arg2;
    var listenersKey = hook + "L";
    if (atom[listenersKey]) {
      atom[listenersKey].add(cb);
    } else {
      atom[listenersKey] = /* @__PURE__ */ new Set([cb]);
    }
    return function() {
      var hookListeners = atom[listenersKey];
      if (hookListeners) {
        hookListeners["delete"](cb);
        if (hookListeners.size === 0) {
          delete atom[listenersKey];
        }
      }
    };
  }
  function extendObservable(target, properties, annotations, options) {
    var descriptors = getOwnPropertyDescriptors(properties);
    initObservable(function() {
      var adm = asObservableObject(target, options)[$mobx];
      ownKeys(descriptors).forEach(function(key) {
        adm.extend_(
          key,
          descriptors[key],
          // must pass "undefined" for { key: undefined }
          !annotations ? true : key in annotations ? annotations[key] : true
        );
      });
    });
    return target;
  }
  var generatorId = 0;
  function FlowCancellationError() {
    this.message = "FLOW_CANCELLED";
  }
  FlowCancellationError.prototype = /* @__PURE__ */ Object.create(Error.prototype);
  var flowAnnotation = /* @__PURE__ */ createFlowAnnotation("flow");
  var flowBoundAnnotation = /* @__PURE__ */ createFlowAnnotation("flow.bound", {
    bound: true
  });
  var flow = /* @__PURE__ */ Object.assign(function flow2(arg1, arg2) {
    if (is20223Decorator(arg2)) {
      return flowAnnotation.decorate_20223_(arg1, arg2);
    }
    if (isStringish(arg2)) {
      return storeAnnotation(arg1, arg2, flowAnnotation);
    }
    var generator = arg1;
    var name = generator.name || "<unnamed flow>";
    var res = function res2() {
      var ctx = this;
      var args = arguments;
      var runId = ++generatorId;
      var gen = action(name + " - runid: " + runId + " - init", generator).apply(ctx, args);
      var rejector;
      var pendingPromise = void 0;
      var promise = new Promise(function(resolve, reject) {
        var stepId = 0;
        rejector = reject;
        function onFulfilled(res3) {
          pendingPromise = void 0;
          var ret;
          try {
            ret = action(name + " - runid: " + runId + " - yield " + stepId++, gen.next).call(gen, res3);
          } catch (e) {
            return reject(e);
          }
          next(ret);
        }
        function onRejected(err) {
          pendingPromise = void 0;
          var ret;
          try {
            ret = action(name + " - runid: " + runId + " - yield " + stepId++, gen["throw"]).call(gen, err);
          } catch (e) {
            return reject(e);
          }
          next(ret);
        }
        function next(ret) {
          if (isFunction(ret == null ? void 0 : ret.then)) {
            ret.then(next, reject);
            return;
          }
          if (ret.done) {
            return resolve(ret.value);
          }
          pendingPromise = Promise.resolve(ret.value);
          return pendingPromise.then(onFulfilled, onRejected);
        }
        onFulfilled(void 0);
      });
      promise.cancel = action(name + " - runid: " + runId + " - cancel", function() {
        try {
          if (pendingPromise) {
            cancelPromise(pendingPromise);
          }
          var _res = gen["return"](void 0);
          var yieldedPromise = Promise.resolve(_res.value);
          yieldedPromise.then(noop, noop);
          cancelPromise(yieldedPromise);
          rejector(new FlowCancellationError());
        } catch (e) {
          rejector(e);
        }
      });
      return promise;
    };
    res.isMobXFlow = true;
    return res;
  }, flowAnnotation);
  flow.bound = /* @__PURE__ */ createDecoratorAnnotation(flowBoundAnnotation);
  function cancelPromise(promise) {
    if (isFunction(promise.cancel)) {
      promise.cancel();
    }
  }
  function isFlow(fn) {
    return (fn == null ? void 0 : fn.isMobXFlow) === true;
  }
  function _isObservable(value, property) {
    if (!value) {
      return false;
    }
    return isObservableObject(value) || !!value[$mobx] || isAtom(value) || isReaction(value) || isComputedValue(value);
  }
  function isObservable(value) {
    return _isObservable(value);
  }
  function transaction$1(action2, thisArg) {
    if (thisArg === void 0) {
      thisArg = void 0;
    }
    startBatch();
    try {
      return action2.apply(thisArg);
    } finally {
      endBatch();
    }
  }
  function getAdm(target) {
    return target[$mobx];
  }
  var objectProxyTraps = {
    has: function has2(target, name) {
      return getAdm(target).has_(name);
    },
    get: function get2(target, name) {
      return getAdm(target).get_(name);
    },
    set: function set3(target, name, value) {
      var _getAdm$set_;
      if (!isStringish(name)) {
        return false;
      }
      return (_getAdm$set_ = getAdm(target).set_(name, value, true)) != null ? _getAdm$set_ : true;
    },
    deleteProperty: function deleteProperty(target, name) {
      var _getAdm$delete_;
      if (!isStringish(name)) {
        return false;
      }
      return (_getAdm$delete_ = getAdm(target).delete_(name, true)) != null ? _getAdm$delete_ : true;
    },
    defineProperty: function defineProperty2(target, name, descriptor) {
      var _getAdm$definePropert;
      return (_getAdm$definePropert = getAdm(target).defineProperty_(name, descriptor)) != null ? _getAdm$definePropert : true;
    },
    ownKeys: function ownKeys2(target) {
      return getAdm(target).ownKeys_();
    },
    preventExtensions: function preventExtensions(target) {
      die(13);
    }
  };
  function asDynamicObservableObject(target, options) {
    var _target$$mobx, _target$$mobx$proxy_;
    assertProxies();
    target = asObservableObject(target, options);
    return (_target$$mobx$proxy_ = (_target$$mobx = target[$mobx]).proxy_) != null ? _target$$mobx$proxy_ : _target$$mobx.proxy_ = new Proxy(target, objectProxyTraps);
  }
  function hasInterceptors(interceptable) {
    return interceptable.interceptors_ !== void 0 && interceptable.interceptors_.length > 0;
  }
  function registerInterceptor(interceptable, handler) {
    var interceptors = interceptable.interceptors_ || (interceptable.interceptors_ = []);
    interceptors.push(handler);
    return once(function() {
      var idx = interceptors.indexOf(handler);
      if (idx !== -1) {
        interceptors.splice(idx, 1);
      }
    });
  }
  function interceptChange(interceptable, change) {
    var prevU = untrackedStart();
    try {
      var interceptors = [].concat(interceptable.interceptors_ || []);
      for (var i = 0, l = interceptors.length; i < l; i++) {
        change = interceptors[i](change);
        if (change && !change.type) {
          die(14);
        }
        if (!change) {
          break;
        }
      }
      return change;
    } finally {
      untrackedEnd(prevU);
    }
  }
  function hasListeners(listenable) {
    return listenable.changeListeners_ !== void 0 && listenable.changeListeners_.length > 0;
  }
  function registerListener(listenable, handler) {
    var listeners2 = listenable.changeListeners_ || (listenable.changeListeners_ = []);
    listeners2.push(handler);
    return once(function() {
      var idx = listeners2.indexOf(handler);
      if (idx !== -1) {
        listeners2.splice(idx, 1);
      }
    });
  }
  function notifyListeners(listenable, change) {
    var prevU = untrackedStart();
    var listeners2 = listenable.changeListeners_;
    if (!listeners2) {
      return;
    }
    listeners2 = listeners2.slice();
    for (var i = 0, l = listeners2.length; i < l; i++) {
      listeners2[i](change);
    }
    untrackedEnd(prevU);
  }
  function makeObservable(target, annotations, options) {
    initObservable(function() {
      var _annotations;
      var adm = asObservableObject(target, options)[$mobx];
      if (false) ;
      (_annotations = annotations) != null ? _annotations : annotations = collectStoredAnnotations(target);
      ownKeys(annotations).forEach(function(key) {
        return adm.make_(key, annotations[key]);
      });
    });
    return target;
  }
  var SPLICE = "splice";
  var UPDATE = "update";
  var MAX_SPLICE_SIZE = 1e4;
  var arrayTraps = {
    get: function get3(target, name) {
      var adm = target[$mobx];
      if (name === $mobx) {
        return adm;
      }
      if (name === "length") {
        return adm.getArrayLength_();
      }
      if (typeof name === "string" && !isNaN(name)) {
        return adm.get_(parseInt(name));
      }
      if (hasProp(arrayExtensions, name)) {
        return arrayExtensions[name];
      }
      return target[name];
    },
    set: function set4(target, name, value) {
      var adm = target[$mobx];
      if (name === "length") {
        adm.setArrayLength_(value);
      }
      if (typeof name === "symbol" || isNaN(name)) {
        target[name] = value;
      } else {
        adm.set_(parseInt(name), value);
      }
      return true;
    },
    preventExtensions: function preventExtensions2() {
      die(15);
    }
  };
  var ObservableArrayAdministration = /* @__PURE__ */ (function() {
    function ObservableArrayAdministration2(name, enhancer, owned_, legacyMode_) {
      if (name === void 0) {
        name = "ObservableArray";
      }
      this.owned_ = void 0;
      this.legacyMode_ = void 0;
      this.atom_ = void 0;
      this.values_ = [];
      this.interceptors_ = void 0;
      this.changeListeners_ = void 0;
      this.enhancer_ = void 0;
      this.dehancer = void 0;
      this.proxy_ = void 0;
      this.lastKnownLength_ = 0;
      this.owned_ = owned_;
      this.legacyMode_ = legacyMode_;
      this.atom_ = new Atom(name);
      this.enhancer_ = function(newV, oldV) {
        return enhancer(newV, oldV, "ObservableArray[..]");
      };
    }
    var _proto = ObservableArrayAdministration2.prototype;
    _proto.dehanceValue_ = function dehanceValue_(value) {
      if (this.dehancer !== void 0) {
        return this.dehancer(value);
      }
      return value;
    };
    _proto.dehanceValues_ = function dehanceValues_(values2) {
      if (this.dehancer !== void 0 && values2.length > 0) {
        return values2.map(this.dehancer);
      }
      return values2;
    };
    _proto.intercept_ = function intercept_(handler) {
      return registerInterceptor(this, handler);
    };
    _proto.observe_ = function observe_(listener, fireImmediately) {
      if (fireImmediately === void 0) {
        fireImmediately = false;
      }
      if (fireImmediately) {
        listener({
          observableKind: "array",
          object: this.proxy_,
          debugObjectName: this.atom_.name_,
          type: "splice",
          index: 0,
          added: this.values_.slice(),
          addedCount: this.values_.length,
          removed: [],
          removedCount: 0
        });
      }
      return registerListener(this, listener);
    };
    _proto.getArrayLength_ = function getArrayLength_() {
      this.atom_.reportObserved();
      return this.values_.length;
    };
    _proto.setArrayLength_ = function setArrayLength_(newLength) {
      if (typeof newLength !== "number" || isNaN(newLength) || newLength < 0) {
        die("Out of range: " + newLength);
      }
      var currentLength = this.values_.length;
      if (newLength === currentLength) {
        return;
      } else if (newLength > currentLength) {
        var newItems = new Array(newLength - currentLength);
        for (var i = 0; i < newLength - currentLength; i++) {
          newItems[i] = void 0;
        }
        this.spliceWithArray_(currentLength, 0, newItems);
      } else {
        this.spliceWithArray_(newLength, currentLength - newLength);
      }
    };
    _proto.updateArrayLength_ = function updateArrayLength_(oldLength, delta) {
      if (oldLength !== this.lastKnownLength_) {
        die(16);
      }
      this.lastKnownLength_ += delta;
      if (this.legacyMode_ && delta > 0) {
        reserveArrayBuffer(oldLength + delta + 1);
      }
    };
    _proto.spliceWithArray_ = function spliceWithArray_(index, deleteCount, newItems) {
      var _this = this;
      checkIfStateModificationsAreAllowed(this.atom_);
      var length = this.values_.length;
      if (index === void 0) {
        index = 0;
      } else if (index > length) {
        index = length;
      } else if (index < 0) {
        index = Math.max(0, length + index);
      }
      if (arguments.length === 1) {
        deleteCount = length - index;
      } else if (deleteCount === void 0 || deleteCount === null) {
        deleteCount = 0;
      } else {
        deleteCount = Math.max(0, Math.min(deleteCount, length - index));
      }
      if (newItems === void 0) {
        newItems = EMPTY_ARRAY;
      }
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          object: this.proxy_,
          type: SPLICE,
          index,
          removedCount: deleteCount,
          added: newItems
        });
        if (!change) {
          return EMPTY_ARRAY;
        }
        deleteCount = change.removedCount;
        newItems = change.added;
      }
      newItems = newItems.length === 0 ? newItems : newItems.map(function(v) {
        return _this.enhancer_(v, void 0);
      });
      if (this.legacyMode_ || false) {
        var lengthDelta = newItems.length - deleteCount;
        this.updateArrayLength_(length, lengthDelta);
      }
      var res = this.spliceItemsIntoValues_(index, deleteCount, newItems);
      if (deleteCount !== 0 || newItems.length !== 0) {
        this.notifyArraySplice_(index, newItems, res);
      }
      return this.dehanceValues_(res);
    };
    _proto.spliceItemsIntoValues_ = function spliceItemsIntoValues_(index, deleteCount, newItems) {
      if (newItems.length < MAX_SPLICE_SIZE) {
        var _this$values_;
        return (_this$values_ = this.values_).splice.apply(_this$values_, [index, deleteCount].concat(newItems));
      } else {
        var res = this.values_.slice(index, index + deleteCount);
        var oldItems = this.values_.slice(index + deleteCount);
        this.values_.length += newItems.length - deleteCount;
        for (var i = 0; i < newItems.length; i++) {
          this.values_[index + i] = newItems[i];
        }
        for (var _i = 0; _i < oldItems.length; _i++) {
          this.values_[index + newItems.length + _i] = oldItems[_i];
        }
        return res;
      }
    };
    _proto.notifyArrayChildUpdate_ = function notifyArrayChildUpdate_(index, newValue, oldValue) {
      var notifySpy = !this.owned_ && isSpyEnabled();
      var notify = hasListeners(this);
      var change = notify || notifySpy ? {
        observableKind: "array",
        object: this.proxy_,
        type: UPDATE,
        debugObjectName: this.atom_.name_,
        index,
        newValue,
        oldValue
      } : null;
      this.atom_.reportChanged();
      if (notify) {
        notifyListeners(this, change);
      }
    };
    _proto.notifyArraySplice_ = function notifyArraySplice_(index, added, removed) {
      var notifySpy = !this.owned_ && isSpyEnabled();
      var notify = hasListeners(this);
      var change = notify || notifySpy ? {
        observableKind: "array",
        object: this.proxy_,
        debugObjectName: this.atom_.name_,
        type: SPLICE,
        index,
        removed,
        added,
        removedCount: removed.length,
        addedCount: added.length
      } : null;
      this.atom_.reportChanged();
      if (notify) {
        notifyListeners(this, change);
      }
    };
    _proto.get_ = function get_(index) {
      if (this.legacyMode_ && index >= this.values_.length) {
        console.warn("[mobx] Out of bounds read: " + index);
        return void 0;
      }
      this.atom_.reportObserved();
      return this.dehanceValue_(this.values_[index]);
    };
    _proto.set_ = function set_(index, newValue) {
      var values2 = this.values_;
      if (this.legacyMode_ && index > values2.length) {
        die(17, index, values2.length);
      }
      if (index < values2.length) {
        checkIfStateModificationsAreAllowed(this.atom_);
        var oldValue = values2[index];
        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            type: UPDATE,
            object: this.proxy_,
            // since "this" is the real array we need to pass its proxy
            index,
            newValue
          });
          if (!change) {
            return;
          }
          newValue = change.newValue;
        }
        newValue = this.enhancer_(newValue, oldValue);
        var changed = newValue !== oldValue;
        if (changed) {
          values2[index] = newValue;
          this.notifyArrayChildUpdate_(index, newValue, oldValue);
        }
      } else {
        var newItems = new Array(index + 1 - values2.length);
        for (var i = 0; i < newItems.length - 1; i++) {
          newItems[i] = void 0;
        }
        newItems[newItems.length - 1] = newValue;
        this.spliceWithArray_(values2.length, 0, newItems);
      }
    };
    return ObservableArrayAdministration2;
  })();
  function createObservableArray(initialValues, enhancer, name, owned) {
    if (name === void 0) {
      name = "ObservableArray";
    }
    if (owned === void 0) {
      owned = false;
    }
    assertProxies();
    return initObservable(function() {
      var adm = new ObservableArrayAdministration(name, enhancer, owned, false);
      addHiddenFinalProp(adm.values_, $mobx, adm);
      var proxy = new Proxy(adm.values_, arrayTraps);
      adm.proxy_ = proxy;
      if (initialValues && initialValues.length) {
        adm.spliceWithArray_(0, 0, initialValues);
      }
      return proxy;
    });
  }
  var arrayExtensions = {
    clear: function clear() {
      return this.splice(0);
    },
    replace: function replace2(newItems) {
      var adm = this[$mobx];
      return adm.spliceWithArray_(0, adm.values_.length, newItems);
    },
    // Used by JSON.stringify
    toJSON: function toJSON() {
      return this.slice();
    },
    /*
     * functions that do alter the internal structure of the array, (based on lib.es6.d.ts)
     * since these functions alter the inner structure of the array, the have side effects.
     * Because the have side effects, they should not be used in computed function,
     * and for that reason the do not call dependencyState.notifyObserved
     */
    splice: function splice(index, deleteCount) {
      for (var _len = arguments.length, newItems = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        newItems[_key - 2] = arguments[_key];
      }
      var adm = this[$mobx];
      switch (arguments.length) {
        case 0:
          return [];
        case 1:
          return adm.spliceWithArray_(index);
        case 2:
          return adm.spliceWithArray_(index, deleteCount);
      }
      return adm.spliceWithArray_(index, deleteCount, newItems);
    },
    spliceWithArray: function spliceWithArray(index, deleteCount, newItems) {
      return this[$mobx].spliceWithArray_(index, deleteCount, newItems);
    },
    push: function push() {
      var adm = this[$mobx];
      for (var _len2 = arguments.length, items = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        items[_key2] = arguments[_key2];
      }
      adm.spliceWithArray_(adm.values_.length, 0, items);
      return adm.values_.length;
    },
    pop: function pop() {
      return this.splice(Math.max(this[$mobx].values_.length - 1, 0), 1)[0];
    },
    shift: function shift() {
      return this.splice(0, 1)[0];
    },
    unshift: function unshift() {
      var adm = this[$mobx];
      for (var _len3 = arguments.length, items = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        items[_key3] = arguments[_key3];
      }
      adm.spliceWithArray_(0, 0, items);
      return adm.values_.length;
    },
    reverse: function reverse() {
      if (globalState.trackingDerivation) {
        die(37, "reverse");
      }
      this.replace(this.slice().reverse());
      return this;
    },
    sort: function sort() {
      if (globalState.trackingDerivation) {
        die(37, "sort");
      }
      var copy = this.slice();
      copy.sort.apply(copy, arguments);
      this.replace(copy);
      return this;
    },
    remove: function remove2(value) {
      var adm = this[$mobx];
      var idx = adm.dehanceValues_(adm.values_).indexOf(value);
      if (idx > -1) {
        this.splice(idx, 1);
        return true;
      }
      return false;
    }
  };
  addArrayExtension("at", simpleFunc);
  addArrayExtension("concat", simpleFunc);
  addArrayExtension("flat", simpleFunc);
  addArrayExtension("includes", simpleFunc);
  addArrayExtension("indexOf", simpleFunc);
  addArrayExtension("join", simpleFunc);
  addArrayExtension("lastIndexOf", simpleFunc);
  addArrayExtension("slice", simpleFunc);
  addArrayExtension("toString", simpleFunc);
  addArrayExtension("toLocaleString", simpleFunc);
  addArrayExtension("toSorted", simpleFunc);
  addArrayExtension("toSpliced", simpleFunc);
  addArrayExtension("with", simpleFunc);
  addArrayExtension("every", mapLikeFunc);
  addArrayExtension("filter", mapLikeFunc);
  addArrayExtension("find", mapLikeFunc);
  addArrayExtension("findIndex", mapLikeFunc);
  addArrayExtension("findLast", mapLikeFunc);
  addArrayExtension("findLastIndex", mapLikeFunc);
  addArrayExtension("flatMap", mapLikeFunc);
  addArrayExtension("forEach", mapLikeFunc);
  addArrayExtension("map", mapLikeFunc);
  addArrayExtension("some", mapLikeFunc);
  addArrayExtension("toReversed", mapLikeFunc);
  addArrayExtension("reduce", reduceLikeFunc);
  addArrayExtension("reduceRight", reduceLikeFunc);
  function addArrayExtension(funcName, funcFactory) {
    if (typeof Array.prototype[funcName] === "function") {
      arrayExtensions[funcName] = funcFactory(funcName);
    }
  }
  function simpleFunc(funcName) {
    return function() {
      var adm = this[$mobx];
      adm.atom_.reportObserved();
      var dehancedValues = adm.dehanceValues_(adm.values_);
      return dehancedValues[funcName].apply(dehancedValues, arguments);
    };
  }
  function mapLikeFunc(funcName) {
    return function(callback, thisArg) {
      var _this2 = this;
      var adm = this[$mobx];
      adm.atom_.reportObserved();
      var dehancedValues = adm.dehanceValues_(adm.values_);
      return dehancedValues[funcName](function(element, index) {
        return callback.call(thisArg, element, index, _this2);
      });
    };
  }
  function reduceLikeFunc(funcName) {
    return function() {
      var _this3 = this;
      var adm = this[$mobx];
      adm.atom_.reportObserved();
      var dehancedValues = adm.dehanceValues_(adm.values_);
      var callback = arguments[0];
      arguments[0] = function(accumulator, currentValue, index) {
        return callback(accumulator, currentValue, index, _this3);
      };
      return dehancedValues[funcName].apply(dehancedValues, arguments);
    };
  }
  var isObservableArrayAdministration = /* @__PURE__ */ createInstanceofPredicate("ObservableArrayAdministration", ObservableArrayAdministration);
  function isObservableArray(thing) {
    return isObject(thing) && isObservableArrayAdministration(thing[$mobx]);
  }
  var ObservableMapMarker = {};
  var ADD = "add";
  var DELETE = "delete";
  var ObservableMap = /* @__PURE__ */ (function() {
    function ObservableMap2(initialData, enhancer_, name_) {
      var _this = this;
      if (enhancer_ === void 0) {
        enhancer_ = deepEnhancer;
      }
      if (name_ === void 0) {
        name_ = "ObservableMap";
      }
      this.enhancer_ = void 0;
      this.name_ = void 0;
      this[$mobx] = ObservableMapMarker;
      this.data_ = void 0;
      this.hasMap_ = void 0;
      this.keysAtom_ = void 0;
      this.interceptors_ = void 0;
      this.changeListeners_ = void 0;
      this.dehancer = void 0;
      this.enhancer_ = enhancer_;
      this.name_ = name_;
      if (!isFunction(Map)) {
        die(18);
      }
      initObservable(function() {
        _this.keysAtom_ = createAtom(false ? _this.name_ + ".keys()" : "ObservableMap.keys()");
        _this.data_ = /* @__PURE__ */ new Map();
        _this.hasMap_ = /* @__PURE__ */ new Map();
        if (initialData) {
          _this.merge(initialData);
        }
      });
    }
    var _proto = ObservableMap2.prototype;
    _proto.has_ = function has_(key) {
      return this.data_.has(key);
    };
    _proto.has = function has3(key) {
      var _this2 = this;
      if (!globalState.trackingDerivation) {
        return this.has_(key);
      }
      var entry = this.hasMap_.get(key);
      if (!entry) {
        var newEntry = entry = new ObservableValue(this.has_(key), referenceEnhancer, "ObservableMap.key?", false);
        this.hasMap_.set(key, newEntry);
        onBecomeUnobserved(newEntry, function() {
          return _this2.hasMap_["delete"](key);
        });
      }
      return entry.get();
    };
    _proto.set = function set5(key, value) {
      var hasKey = this.has_(key);
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          type: hasKey ? UPDATE : ADD,
          object: this,
          newValue: value,
          name: key
        });
        if (!change) {
          return this;
        }
        value = change.newValue;
      }
      if (hasKey) {
        this.updateValue_(key, value);
      } else {
        this.addValue_(key, value);
      }
      return this;
    };
    _proto["delete"] = function _delete(key) {
      var _this3 = this;
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          type: DELETE,
          object: this,
          name: key
        });
        if (!change) {
          return false;
        }
      }
      if (this.has_(key)) {
        var notifySpy = isSpyEnabled();
        var notify = hasListeners(this);
        var _change = notify || notifySpy ? {
          observableKind: "map",
          debugObjectName: this.name_,
          type: DELETE,
          object: this,
          oldValue: this.data_.get(key).value_,
          name: key
        } : null;
        transaction$1(function() {
          var _this3$hasMap_$get;
          _this3.keysAtom_.reportChanged();
          (_this3$hasMap_$get = _this3.hasMap_.get(key)) == null || _this3$hasMap_$get.setNewValue_(false);
          var observable2 = _this3.data_.get(key);
          observable2.setNewValue_(void 0);
          _this3.data_["delete"](key);
        });
        if (notify) {
          notifyListeners(this, _change);
        }
        return true;
      }
      return false;
    };
    _proto.updateValue_ = function updateValue_(key, newValue) {
      var observable2 = this.data_.get(key);
      newValue = observable2.prepareNewValue_(newValue);
      if (newValue !== globalState.UNCHANGED) {
        var notifySpy = isSpyEnabled();
        var notify = hasListeners(this);
        var change = notify || notifySpy ? {
          observableKind: "map",
          debugObjectName: this.name_,
          type: UPDATE,
          object: this,
          oldValue: observable2.value_,
          name: key,
          newValue
        } : null;
        observable2.setNewValue_(newValue);
        if (notify) {
          notifyListeners(this, change);
        }
      }
    };
    _proto.addValue_ = function addValue_(key, newValue) {
      var _this4 = this;
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      transaction$1(function() {
        var _this4$hasMap_$get;
        var observable2 = new ObservableValue(newValue, _this4.enhancer_, "ObservableMap.key", false);
        _this4.data_.set(key, observable2);
        newValue = observable2.value_;
        (_this4$hasMap_$get = _this4.hasMap_.get(key)) == null || _this4$hasMap_$get.setNewValue_(true);
        _this4.keysAtom_.reportChanged();
      });
      var notifySpy = isSpyEnabled();
      var notify = hasListeners(this);
      var change = notify || notifySpy ? {
        observableKind: "map",
        debugObjectName: this.name_,
        type: ADD,
        object: this,
        name: key,
        newValue
      } : null;
      if (notify) {
        notifyListeners(this, change);
      }
    };
    _proto.get = function get4(key) {
      if (this.has(key)) {
        return this.dehanceValue_(this.data_.get(key).get());
      }
      return this.dehanceValue_(void 0);
    };
    _proto.dehanceValue_ = function dehanceValue_(value) {
      if (this.dehancer !== void 0) {
        return this.dehancer(value);
      }
      return value;
    };
    _proto.keys = function keys2() {
      this.keysAtom_.reportObserved();
      return this.data_.keys();
    };
    _proto.values = function values2() {
      var self2 = this;
      var keys2 = this.keys();
      return makeIterableForMap({
        next: function next() {
          var _keys$next = keys2.next(), done = _keys$next.done, value = _keys$next.value;
          return {
            done,
            value: done ? void 0 : self2.get(value)
          };
        }
      });
    };
    _proto.entries = function entries2() {
      var self2 = this;
      var keys2 = this.keys();
      return makeIterableForMap({
        next: function next() {
          var _keys$next2 = keys2.next(), done = _keys$next2.done, value = _keys$next2.value;
          return {
            done,
            value: done ? void 0 : [value, self2.get(value)]
          };
        }
      });
    };
    _proto[Symbol.iterator] = function() {
      return this.entries();
    };
    _proto.forEach = function forEach(callback, thisArg) {
      for (var _iterator = _createForOfIteratorHelperLoose(this), _step; !(_step = _iterator()).done; ) {
        var _step$value = _step.value, key = _step$value[0], value = _step$value[1];
        callback.call(thisArg, value, key, this);
      }
    };
    _proto.merge = function merge(other) {
      var _this5 = this;
      if (isObservableMap(other)) {
        other = new Map(other);
      }
      transaction$1(function() {
        if (isPlainObject(other)) {
          getPlainObjectKeys(other).forEach(function(key) {
            return _this5.set(key, other[key]);
          });
        } else if (Array.isArray(other)) {
          other.forEach(function(_ref) {
            var key = _ref[0], value = _ref[1];
            return _this5.set(key, value);
          });
        } else if (isES6Map(other)) {
          if (!isPlainES6Map(other)) {
            die(19, other);
          }
          other.forEach(function(value, key) {
            return _this5.set(key, value);
          });
        } else if (other !== null && other !== void 0) {
          die(20, other);
        }
      });
      return this;
    };
    _proto.clear = function clear2() {
      var _this6 = this;
      transaction$1(function() {
        untracked(function() {
          for (var _iterator2 = _createForOfIteratorHelperLoose(_this6.keys()), _step2; !(_step2 = _iterator2()).done; ) {
            var key = _step2.value;
            _this6["delete"](key);
          }
        });
      });
    };
    _proto.replace = function replace2(values2) {
      var _this7 = this;
      transaction$1(function() {
        var replacementMap = convertToMap(values2);
        var orderedData = /* @__PURE__ */ new Map();
        var keysReportChangedCalled = false;
        for (var _iterator3 = _createForOfIteratorHelperLoose(_this7.data_.keys()), _step3; !(_step3 = _iterator3()).done; ) {
          var key = _step3.value;
          if (!replacementMap.has(key)) {
            var deleted = _this7["delete"](key);
            if (deleted) {
              keysReportChangedCalled = true;
            } else {
              var value = _this7.data_.get(key);
              orderedData.set(key, value);
            }
          }
        }
        for (var _iterator4 = _createForOfIteratorHelperLoose(replacementMap.entries()), _step4; !(_step4 = _iterator4()).done; ) {
          var _step4$value = _step4.value, _key = _step4$value[0], _value = _step4$value[1];
          var keyExisted = _this7.data_.has(_key);
          _this7.set(_key, _value);
          if (_this7.data_.has(_key)) {
            var _value2 = _this7.data_.get(_key);
            orderedData.set(_key, _value2);
            if (!keyExisted) {
              keysReportChangedCalled = true;
            }
          }
        }
        if (!keysReportChangedCalled) {
          if (_this7.data_.size !== orderedData.size) {
            _this7.keysAtom_.reportChanged();
          } else {
            var iter1 = _this7.data_.keys();
            var iter2 = orderedData.keys();
            var next1 = iter1.next();
            var next2 = iter2.next();
            while (!next1.done) {
              if (next1.value !== next2.value) {
                _this7.keysAtom_.reportChanged();
                break;
              }
              next1 = iter1.next();
              next2 = iter2.next();
            }
          }
        }
        _this7.data_ = orderedData;
      });
      return this;
    };
    _proto.toString = function toString2() {
      return "[object ObservableMap]";
    };
    _proto.toJSON = function toJSON2() {
      return Array.from(this);
    };
    _proto.observe_ = function observe_(listener, fireImmediately) {
      return registerListener(this, listener);
    };
    _proto.intercept_ = function intercept_(handler) {
      return registerInterceptor(this, handler);
    };
    return _createClass(ObservableMap2, [{
      key: "size",
      get: function get4() {
        this.keysAtom_.reportObserved();
        return this.data_.size;
      }
    }, {
      key: Symbol.toStringTag,
      get: function get4() {
        return "Map";
      }
    }]);
  })();
  var isObservableMap = /* @__PURE__ */ createInstanceofPredicate("ObservableMap", ObservableMap);
  function makeIterableForMap(iterator) {
    iterator[Symbol.toStringTag] = "MapIterator";
    return makeIterable(iterator);
  }
  function convertToMap(dataStructure) {
    if (isES6Map(dataStructure) || isObservableMap(dataStructure)) {
      return dataStructure;
    } else if (Array.isArray(dataStructure)) {
      return new Map(dataStructure);
    } else if (isPlainObject(dataStructure)) {
      var map2 = /* @__PURE__ */ new Map();
      for (var key in dataStructure) {
        map2.set(key, dataStructure[key]);
      }
      return map2;
    } else {
      return die(21, dataStructure);
    }
  }
  var ObservableSetMarker = {};
  var ObservableSet = /* @__PURE__ */ (function() {
    function ObservableSet2(initialData, enhancer, name_) {
      var _this = this;
      if (enhancer === void 0) {
        enhancer = deepEnhancer;
      }
      if (name_ === void 0) {
        name_ = "ObservableSet";
      }
      this.name_ = void 0;
      this[$mobx] = ObservableSetMarker;
      this.data_ = /* @__PURE__ */ new Set();
      this.atom_ = void 0;
      this.changeListeners_ = void 0;
      this.interceptors_ = void 0;
      this.dehancer = void 0;
      this.enhancer_ = void 0;
      this.name_ = name_;
      if (!isFunction(Set)) {
        die(22);
      }
      this.enhancer_ = function(newV, oldV) {
        return enhancer(newV, oldV, name_);
      };
      initObservable(function() {
        _this.atom_ = createAtom(_this.name_);
        if (initialData) {
          _this.replace(initialData);
        }
      });
    }
    var _proto = ObservableSet2.prototype;
    _proto.dehanceValue_ = function dehanceValue_(value) {
      if (this.dehancer !== void 0) {
        return this.dehancer(value);
      }
      return value;
    };
    _proto.clear = function clear2() {
      var _this2 = this;
      transaction$1(function() {
        untracked(function() {
          for (var _iterator = _createForOfIteratorHelperLoose(_this2.data_.values()), _step; !(_step = _iterator()).done; ) {
            var value = _step.value;
            _this2["delete"](value);
          }
        });
      });
    };
    _proto.forEach = function forEach(callbackFn, thisArg) {
      for (var _iterator2 = _createForOfIteratorHelperLoose(this), _step2; !(_step2 = _iterator2()).done; ) {
        var value = _step2.value;
        callbackFn.call(thisArg, value, value, this);
      }
    };
    _proto.add = function add(value) {
      var _this3 = this;
      checkIfStateModificationsAreAllowed(this.atom_);
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          type: ADD,
          object: this,
          newValue: value
        });
        if (!change) {
          return this;
        }
        value = change.newValue;
      }
      if (!this.has(value)) {
        transaction$1(function() {
          _this3.data_.add(_this3.enhancer_(value, void 0));
          _this3.atom_.reportChanged();
        });
        var notifySpy = false;
        var notify = hasListeners(this);
        var _change = notify || notifySpy ? {
          observableKind: "set",
          debugObjectName: this.name_,
          type: ADD,
          object: this,
          newValue: value
        } : null;
        if (notify) {
          notifyListeners(this, _change);
        }
      }
      return this;
    };
    _proto["delete"] = function _delete(value) {
      var _this4 = this;
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          type: DELETE,
          object: this,
          oldValue: value
        });
        if (!change) {
          return false;
        }
      }
      if (this.has(value)) {
        var notifySpy = false;
        var notify = hasListeners(this);
        var _change2 = notify || notifySpy ? {
          observableKind: "set",
          debugObjectName: this.name_,
          type: DELETE,
          object: this,
          oldValue: value
        } : null;
        transaction$1(function() {
          _this4.atom_.reportChanged();
          _this4.data_["delete"](value);
        });
        if (notify) {
          notifyListeners(this, _change2);
        }
        return true;
      }
      return false;
    };
    _proto.has = function has3(value) {
      this.atom_.reportObserved();
      return this.data_.has(this.dehanceValue_(value));
    };
    _proto.entries = function entries2() {
      var values2 = this.values();
      return makeIterableForSet({
        next: function next() {
          var _values$next = values2.next(), value = _values$next.value, done = _values$next.done;
          return !done ? {
            value: [value, value],
            done
          } : {
            value: void 0,
            done
          };
        }
      });
    };
    _proto.keys = function keys2() {
      return this.values();
    };
    _proto.values = function values2() {
      this.atom_.reportObserved();
      var self2 = this;
      var values3 = this.data_.values();
      return makeIterableForSet({
        next: function next() {
          var _values$next2 = values3.next(), value = _values$next2.value, done = _values$next2.done;
          return !done ? {
            value: self2.dehanceValue_(value),
            done
          } : {
            value: void 0,
            done
          };
        }
      });
    };
    _proto.intersection = function intersection(otherSet) {
      if (isES6Set(otherSet) && !isObservableSet(otherSet)) {
        return otherSet.intersection(this);
      } else {
        var dehancedSet = new Set(this);
        return dehancedSet.intersection(otherSet);
      }
    };
    _proto.union = function union(otherSet) {
      if (isES6Set(otherSet) && !isObservableSet(otherSet)) {
        return otherSet.union(this);
      } else {
        var dehancedSet = new Set(this);
        return dehancedSet.union(otherSet);
      }
    };
    _proto.difference = function difference(otherSet) {
      return new Set(this).difference(otherSet);
    };
    _proto.symmetricDifference = function symmetricDifference(otherSet) {
      if (isES6Set(otherSet) && !isObservableSet(otherSet)) {
        return otherSet.symmetricDifference(this);
      } else {
        var dehancedSet = new Set(this);
        return dehancedSet.symmetricDifference(otherSet);
      }
    };
    _proto.isSubsetOf = function isSubsetOf(otherSet) {
      return new Set(this).isSubsetOf(otherSet);
    };
    _proto.isSupersetOf = function isSupersetOf(otherSet) {
      return new Set(this).isSupersetOf(otherSet);
    };
    _proto.isDisjointFrom = function isDisjointFrom(otherSet) {
      if (isES6Set(otherSet) && !isObservableSet(otherSet)) {
        return otherSet.isDisjointFrom(this);
      } else {
        var dehancedSet = new Set(this);
        return dehancedSet.isDisjointFrom(otherSet);
      }
    };
    _proto.replace = function replace2(other) {
      var _this5 = this;
      if (isObservableSet(other)) {
        other = new Set(other);
      }
      transaction$1(function() {
        if (Array.isArray(other)) {
          _this5.clear();
          other.forEach(function(value) {
            return _this5.add(value);
          });
        } else if (isES6Set(other)) {
          _this5.clear();
          other.forEach(function(value) {
            return _this5.add(value);
          });
        } else if (other !== null && other !== void 0) {
          die("Cannot initialize set from " + other);
        }
      });
      return this;
    };
    _proto.observe_ = function observe_(listener, fireImmediately) {
      return registerListener(this, listener);
    };
    _proto.intercept_ = function intercept_(handler) {
      return registerInterceptor(this, handler);
    };
    _proto.toJSON = function toJSON2() {
      return Array.from(this);
    };
    _proto.toString = function toString2() {
      return "[object ObservableSet]";
    };
    _proto[Symbol.iterator] = function() {
      return this.values();
    };
    return _createClass(ObservableSet2, [{
      key: "size",
      get: function get4() {
        this.atom_.reportObserved();
        return this.data_.size;
      }
    }, {
      key: Symbol.toStringTag,
      get: function get4() {
        return "Set";
      }
    }]);
  })();
  var isObservableSet = /* @__PURE__ */ createInstanceofPredicate("ObservableSet", ObservableSet);
  function makeIterableForSet(iterator) {
    iterator[Symbol.toStringTag] = "SetIterator";
    return makeIterable(iterator);
  }
  var descriptorCache = /* @__PURE__ */ Object.create(null);
  var REMOVE = "remove";
  var ObservableObjectAdministration = /* @__PURE__ */ (function() {
    function ObservableObjectAdministration2(target_, values_, name_, defaultAnnotation_) {
      if (values_ === void 0) {
        values_ = /* @__PURE__ */ new Map();
      }
      if (defaultAnnotation_ === void 0) {
        defaultAnnotation_ = autoAnnotation;
      }
      this.target_ = void 0;
      this.values_ = void 0;
      this.name_ = void 0;
      this.defaultAnnotation_ = void 0;
      this.keysAtom_ = void 0;
      this.changeListeners_ = void 0;
      this.interceptors_ = void 0;
      this.proxy_ = void 0;
      this.isPlainObject_ = void 0;
      this.appliedAnnotations_ = void 0;
      this.pendingKeys_ = void 0;
      this.target_ = target_;
      this.values_ = values_;
      this.name_ = name_;
      this.defaultAnnotation_ = defaultAnnotation_;
      this.keysAtom_ = new Atom("ObservableObject.keys");
      this.isPlainObject_ = isPlainObject(this.target_);
    }
    var _proto = ObservableObjectAdministration2.prototype;
    _proto.getObservablePropValue_ = function getObservablePropValue_(key) {
      return this.values_.get(key).get();
    };
    _proto.setObservablePropValue_ = function setObservablePropValue_(key, newValue) {
      var observable2 = this.values_.get(key);
      if (observable2 instanceof ComputedValue) {
        observable2.set(newValue);
        return true;
      }
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          type: UPDATE,
          object: this.proxy_ || this.target_,
          name: key,
          newValue
        });
        if (!change) {
          return null;
        }
        newValue = change.newValue;
      }
      newValue = observable2.prepareNewValue_(newValue);
      if (newValue !== globalState.UNCHANGED) {
        var notify = hasListeners(this);
        var notifySpy = false;
        var _change = notify || notifySpy ? {
          type: UPDATE,
          observableKind: "object",
          debugObjectName: this.name_,
          object: this.proxy_ || this.target_,
          oldValue: observable2.value_,
          name: key,
          newValue
        } : null;
        observable2.setNewValue_(newValue);
        if (notify) {
          notifyListeners(this, _change);
        }
      }
      return true;
    };
    _proto.get_ = function get_(key) {
      if (globalState.trackingDerivation && !hasProp(this.target_, key)) {
        this.has_(key);
      }
      return this.target_[key];
    };
    _proto.set_ = function set_(key, value, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      if (hasProp(this.target_, key)) {
        if (this.values_.has(key)) {
          return this.setObservablePropValue_(key, value);
        } else if (proxyTrap) {
          return Reflect.set(this.target_, key, value);
        } else {
          this.target_[key] = value;
          return true;
        }
      } else {
        return this.extend_(key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true
        }, this.defaultAnnotation_, proxyTrap);
      }
    };
    _proto.has_ = function has_(key) {
      if (!globalState.trackingDerivation) {
        return key in this.target_;
      }
      this.pendingKeys_ || (this.pendingKeys_ = /* @__PURE__ */ new Map());
      var entry = this.pendingKeys_.get(key);
      if (!entry) {
        entry = new ObservableValue(key in this.target_, referenceEnhancer, "ObservableObject.key?", false);
        this.pendingKeys_.set(key, entry);
      }
      return entry.get();
    };
    _proto.make_ = function make_2(key, annotation) {
      if (annotation === true) {
        annotation = this.defaultAnnotation_;
      }
      if (annotation === false) {
        return;
      }
      if (!(key in this.target_)) {
        var _this$target_$storedA;
        if ((_this$target_$storedA = this.target_[storedAnnotationsSymbol]) != null && _this$target_$storedA[key]) {
          return;
        } else {
          die(1, annotation.annotationType_, this.name_ + "." + key.toString());
        }
      }
      var source = this.target_;
      while (source && source !== objectPrototype) {
        var descriptor = getDescriptor(source, key);
        if (descriptor) {
          var outcome = annotation.make_(this, key, descriptor, source);
          if (outcome === 0) {
            return;
          }
          if (outcome === 1) {
            break;
          }
        }
        source = Object.getPrototypeOf(source);
      }
      recordAnnotationApplied(this, annotation, key);
    };
    _proto.extend_ = function extend_2(key, descriptor, annotation, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      if (annotation === true) {
        annotation = this.defaultAnnotation_;
      }
      if (annotation === false) {
        return this.defineProperty_(key, descriptor, proxyTrap);
      }
      var outcome = annotation.extend_(this, key, descriptor, proxyTrap);
      if (outcome) {
        recordAnnotationApplied(this, annotation, key);
      }
      return outcome;
    };
    _proto.defineProperty_ = function defineProperty_(key, descriptor, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      try {
        startBatch();
        var deleteOutcome = this.delete_(key);
        if (!deleteOutcome) {
          return deleteOutcome;
        }
        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this.proxy_ || this.target_,
            name: key,
            type: ADD,
            newValue: descriptor.value
          });
          if (!change) {
            return null;
          }
          var newValue = change.newValue;
          if (descriptor.value !== newValue) {
            descriptor = _extends({}, descriptor, {
              value: newValue
            });
          }
        }
        if (proxyTrap) {
          if (!Reflect.defineProperty(this.target_, key, descriptor)) {
            return false;
          }
        } else {
          defineProperty(this.target_, key, descriptor);
        }
        this.notifyPropertyAddition_(key, descriptor.value);
      } finally {
        endBatch();
      }
      return true;
    };
    _proto.defineObservableProperty_ = function defineObservableProperty_(key, value, enhancer, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      try {
        startBatch();
        var deleteOutcome = this.delete_(key);
        if (!deleteOutcome) {
          return deleteOutcome;
        }
        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this.proxy_ || this.target_,
            name: key,
            type: ADD,
            newValue: value
          });
          if (!change) {
            return null;
          }
          value = change.newValue;
        }
        var cachedDescriptor = getCachedObservablePropDescriptor(key);
        var descriptor = {
          configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
          enumerable: true,
          get: cachedDescriptor.get,
          set: cachedDescriptor.set
        };
        if (proxyTrap) {
          if (!Reflect.defineProperty(this.target_, key, descriptor)) {
            return false;
          }
        } else {
          defineProperty(this.target_, key, descriptor);
        }
        var observable2 = new ObservableValue(value, enhancer, false ? this.name_ + "." + key.toString() : "ObservableObject.key", false);
        this.values_.set(key, observable2);
        this.notifyPropertyAddition_(key, observable2.value_);
      } finally {
        endBatch();
      }
      return true;
    };
    _proto.defineComputedProperty_ = function defineComputedProperty_(key, options, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      try {
        startBatch();
        var deleteOutcome = this.delete_(key);
        if (!deleteOutcome) {
          return deleteOutcome;
        }
        if (hasInterceptors(this)) {
          var change = interceptChange(this, {
            object: this.proxy_ || this.target_,
            name: key,
            type: ADD,
            newValue: void 0
          });
          if (!change) {
            return null;
          }
        }
        options.name || (options.name = false ? this.name_ + "." + key.toString() : "ObservableObject.key");
        options.context = this.proxy_ || this.target_;
        var cachedDescriptor = getCachedObservablePropDescriptor(key);
        var descriptor = {
          configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
          enumerable: false,
          get: cachedDescriptor.get,
          set: cachedDescriptor.set
        };
        if (proxyTrap) {
          if (!Reflect.defineProperty(this.target_, key, descriptor)) {
            return false;
          }
        } else {
          defineProperty(this.target_, key, descriptor);
        }
        this.values_.set(key, new ComputedValue(options));
        this.notifyPropertyAddition_(key, void 0);
      } finally {
        endBatch();
      }
      return true;
    };
    _proto.delete_ = function delete_(key, proxyTrap) {
      if (proxyTrap === void 0) {
        proxyTrap = false;
      }
      checkIfStateModificationsAreAllowed(this.keysAtom_);
      if (!hasProp(this.target_, key)) {
        return true;
      }
      if (hasInterceptors(this)) {
        var change = interceptChange(this, {
          object: this.proxy_ || this.target_,
          name: key,
          type: REMOVE
        });
        if (!change) {
          return null;
        }
      }
      try {
        var _this$pendingKeys_;
        startBatch();
        var notify = hasListeners(this);
        var notifySpy = false;
        var observable2 = this.values_.get(key);
        var value = void 0;
        if (!observable2 && (notify || notifySpy)) {
          var _getDescriptor2;
          value = (_getDescriptor2 = getDescriptor(this.target_, key)) == null ? void 0 : _getDescriptor2.value;
        }
        if (proxyTrap) {
          if (!Reflect.deleteProperty(this.target_, key)) {
            return false;
          }
        } else {
          delete this.target_[key];
        }
        if (false) ;
        if (observable2) {
          this.values_["delete"](key);
          if (observable2 instanceof ObservableValue) {
            value = observable2.value_;
          }
          propagateChanged(observable2);
        }
        this.keysAtom_.reportChanged();
        (_this$pendingKeys_ = this.pendingKeys_) == null || (_this$pendingKeys_ = _this$pendingKeys_.get(key)) == null || _this$pendingKeys_.set(key in this.target_);
        if (notify || notifySpy) {
          var _change2 = {
            type: REMOVE,
            observableKind: "object",
            object: this.proxy_ || this.target_,
            debugObjectName: this.name_,
            oldValue: value,
            name: key
          };
          if (false) ;
          if (notify) {
            notifyListeners(this, _change2);
          }
          if (false) ;
        }
      } finally {
        endBatch();
      }
      return true;
    };
    _proto.observe_ = function observe_(callback, fireImmediately) {
      return registerListener(this, callback);
    };
    _proto.intercept_ = function intercept_(handler) {
      return registerInterceptor(this, handler);
    };
    _proto.notifyPropertyAddition_ = function notifyPropertyAddition_(key, value) {
      var _this$pendingKeys_2;
      var notify = hasListeners(this);
      var notifySpy = false;
      if (notify || notifySpy) {
        var change = notify || notifySpy ? {
          type: ADD,
          observableKind: "object",
          debugObjectName: this.name_,
          object: this.proxy_ || this.target_,
          name: key,
          newValue: value
        } : null;
        if (notify) {
          notifyListeners(this, change);
        }
      }
      (_this$pendingKeys_2 = this.pendingKeys_) == null || (_this$pendingKeys_2 = _this$pendingKeys_2.get(key)) == null || _this$pendingKeys_2.set(true);
      this.keysAtom_.reportChanged();
    };
    _proto.ownKeys_ = function ownKeys_() {
      this.keysAtom_.reportObserved();
      return ownKeys(this.target_);
    };
    _proto.keys_ = function keys_() {
      this.keysAtom_.reportObserved();
      return Object.keys(this.target_);
    };
    return ObservableObjectAdministration2;
  })();
  function asObservableObject(target, options) {
    var _options$name;
    if (hasProp(target, $mobx)) {
      return target;
    }
    var name = (_options$name = options == null ? void 0 : options.name) != null ? _options$name : "ObservableObject";
    var adm = new ObservableObjectAdministration(target, /* @__PURE__ */ new Map(), String(name), getAnnotationFromOptions(options));
    addHiddenProp(target, $mobx, adm);
    return target;
  }
  var isObservableObjectAdministration = /* @__PURE__ */ createInstanceofPredicate("ObservableObjectAdministration", ObservableObjectAdministration);
  function getCachedObservablePropDescriptor(key) {
    return descriptorCache[key] || (descriptorCache[key] = {
      get: function get4() {
        return this[$mobx].getObservablePropValue_(key);
      },
      set: function set5(value) {
        return this[$mobx].setObservablePropValue_(key, value);
      }
    });
  }
  function isObservableObject(thing) {
    if (isObject(thing)) {
      return isObservableObjectAdministration(thing[$mobx]);
    }
    return false;
  }
  function recordAnnotationApplied(adm, annotation, key) {
    var _adm$target_$storedAn;
    (_adm$target_$storedAn = adm.target_[storedAnnotationsSymbol]) == null || delete _adm$target_$storedAn[key];
  }
  var ENTRY_0 = /* @__PURE__ */ createArrayEntryDescriptor(0);
  var safariPrototypeSetterInheritanceBug = /* @__PURE__ */ (function() {
    var v = false;
    var p = {};
    Object.defineProperty(p, "0", {
      set: function set5() {
        v = true;
      }
    });
    Object.create(p)["0"] = 1;
    return v === false;
  })();
  var OBSERVABLE_ARRAY_BUFFER_SIZE = 0;
  var StubArray = function StubArray2() {
  };
  function inherit(ctor, proto) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(ctor.prototype, proto);
    } else if (ctor.prototype.__proto__ !== void 0) {
      ctor.prototype.__proto__ = proto;
    } else {
      ctor.prototype = proto;
    }
  }
  inherit(StubArray, Array.prototype);
  var LegacyObservableArray = /* @__PURE__ */ (function(_StubArray) {
    function LegacyObservableArray2(initialValues, enhancer, name, owned) {
      var _this;
      if (name === void 0) {
        name = "ObservableArray";
      }
      if (owned === void 0) {
        owned = false;
      }
      _this = _StubArray.call(this) || this;
      initObservable(function() {
        var adm = new ObservableArrayAdministration(name, enhancer, owned, true);
        adm.proxy_ = _this;
        addHiddenFinalProp(_this, $mobx, adm);
        if (initialValues && initialValues.length) {
          _this.spliceWithArray(0, 0, initialValues);
        }
        if (safariPrototypeSetterInheritanceBug) {
          Object.defineProperty(_this, "0", ENTRY_0);
        }
      });
      return _this;
    }
    _inheritsLoose(LegacyObservableArray2, _StubArray);
    var _proto = LegacyObservableArray2.prototype;
    _proto.concat = function concat() {
      this[$mobx].atom_.reportObserved();
      for (var _len = arguments.length, arrays = new Array(_len), _key = 0; _key < _len; _key++) {
        arrays[_key] = arguments[_key];
      }
      return Array.prototype.concat.apply(
        this.slice(),
        //@ts-ignore
        arrays.map(function(a) {
          return isObservableArray(a) ? a.slice() : a;
        })
      );
    };
    _proto[Symbol.iterator] = function() {
      var self2 = this;
      var nextIndex = 0;
      return makeIterable({
        next: function next() {
          return nextIndex < self2.length ? {
            value: self2[nextIndex++],
            done: false
          } : {
            done: true,
            value: void 0
          };
        }
      });
    };
    return _createClass(LegacyObservableArray2, [{
      key: "length",
      get: function get4() {
        return this[$mobx].getArrayLength_();
      },
      set: function set5(newLength) {
        this[$mobx].setArrayLength_(newLength);
      }
    }, {
      key: Symbol.toStringTag,
      get: function get4() {
        return "Array";
      }
    }]);
  })(StubArray);
  Object.entries(arrayExtensions).forEach(function(_ref) {
    var prop = _ref[0], fn = _ref[1];
    if (prop !== "concat") {
      addHiddenProp(LegacyObservableArray.prototype, prop, fn);
    }
  });
  function createArrayEntryDescriptor(index) {
    return {
      enumerable: false,
      configurable: true,
      get: function get4() {
        return this[$mobx].get_(index);
      },
      set: function set5(value) {
        this[$mobx].set_(index, value);
      }
    };
  }
  function createArrayBufferItem(index) {
    defineProperty(LegacyObservableArray.prototype, "" + index, createArrayEntryDescriptor(index));
  }
  function reserveArrayBuffer(max) {
    if (max > OBSERVABLE_ARRAY_BUFFER_SIZE) {
      for (var index = OBSERVABLE_ARRAY_BUFFER_SIZE; index < max + 100; index++) {
        createArrayBufferItem(index);
      }
      OBSERVABLE_ARRAY_BUFFER_SIZE = max;
    }
  }
  reserveArrayBuffer(1e3);
  function createLegacyArray(initialValues, enhancer, name) {
    return new LegacyObservableArray(initialValues, enhancer, name);
  }
  function getAtom(thing, property) {
    if (typeof thing === "object" && thing !== null) {
      if (isObservableArray(thing)) {
        if (property !== void 0) {
          die(23);
        }
        return thing[$mobx].atom_;
      }
      if (isObservableSet(thing)) {
        return thing.atom_;
      }
      if (isObservableMap(thing)) {
        if (property === void 0) {
          return thing.keysAtom_;
        }
        var observable2 = thing.data_.get(property) || thing.hasMap_.get(property);
        if (!observable2) {
          die(25, property, getDebugName(thing));
        }
        return observable2;
      }
      if (isObservableObject(thing)) {
        if (!property) {
          return die(26);
        }
        var _observable = thing[$mobx].values_.get(property);
        if (!_observable) {
          die(27, property, getDebugName(thing));
        }
        return _observable;
      }
      if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) {
        return thing;
      }
    } else if (isFunction(thing)) {
      if (isReaction(thing[$mobx])) {
        return thing[$mobx];
      }
    }
    die(28);
  }
  function getAdministration(thing, property) {
    if (!thing) {
      die(29);
    }
    if (isAtom(thing) || isComputedValue(thing) || isReaction(thing)) {
      return thing;
    }
    if (isObservableMap(thing) || isObservableSet(thing)) {
      return thing;
    }
    if (thing[$mobx]) {
      return thing[$mobx];
    }
    die(24, thing);
  }
  function getDebugName(thing, property) {
    var named;
    if (property !== void 0) {
      named = getAtom(thing, property);
    } else if (isAction(thing)) {
      return thing.name;
    } else if (isObservableObject(thing) || isObservableMap(thing) || isObservableSet(thing)) {
      named = getAdministration(thing);
    } else {
      named = getAtom(thing);
    }
    return named.name_;
  }
  function initObservable(cb) {
    var derivation = untrackedStart();
    var allowStateChanges2 = allowStateChangesStart(true);
    startBatch();
    try {
      return cb();
    } finally {
      endBatch();
      allowStateChangesEnd(allowStateChanges2);
      untrackedEnd(derivation);
    }
  }
  var toString = objectPrototype.toString;
  function deepEqual(a, b, depth) {
    if (depth === void 0) {
      depth = -1;
    }
    return eq(a, b, depth);
  }
  function eq(a, b, depth, aStack, bStack) {
    if (a === b) {
      return a !== 0 || 1 / a === 1 / b;
    }
    if (a == null || b == null) {
      return false;
    }
    if (a !== a) {
      return b !== b;
    }
    var type = typeof a;
    if (type !== "function" && type !== "object" && typeof b != "object") {
      return false;
    }
    var className = toString.call(a);
    if (className !== toString.call(b)) {
      return false;
    }
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case "[object RegExp]":
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case "[object String]":
        return "" + a === "" + b;
      case "[object Number]":
        if (+a !== +a) {
          return +b !== +b;
        }
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case "[object Date]":
      case "[object Boolean]":
        return +a === +b;
      case "[object Symbol]":
        return typeof Symbol !== "undefined" && Symbol.valueOf.call(a) === Symbol.valueOf.call(b);
      case "[object Map]":
      case "[object Set]":
        if (depth >= 0) {
          depth++;
        }
        break;
    }
    a = unwrap(a);
    b = unwrap(b);
    var areArrays = className === "[object Array]";
    if (!areArrays) {
      if (typeof a != "object" || typeof b != "object") {
        return false;
      }
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(isFunction(aCtor) && aCtor instanceof aCtor && isFunction(bCtor) && bCtor instanceof bCtor) && "constructor" in a && "constructor" in b) {
        return false;
      }
    }
    if (depth === 0) {
      return false;
    } else if (depth < 0) {
      depth = -1;
    }
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      if (aStack[length] === a) {
        return bStack[length] === b;
      }
    }
    aStack.push(a);
    bStack.push(b);
    if (areArrays) {
      length = a.length;
      if (length !== b.length) {
        return false;
      }
      while (length--) {
        if (!eq(a[length], b[length], depth - 1, aStack, bStack)) {
          return false;
        }
      }
    } else {
      var keys2 = Object.keys(a);
      var _length = keys2.length;
      if (Object.keys(b).length !== _length) {
        return false;
      }
      for (var i = 0; i < _length; i++) {
        var key = keys2[i];
        if (!(hasProp(b, key) && eq(a[key], b[key], depth - 1, aStack, bStack))) {
          return false;
        }
      }
    }
    aStack.pop();
    bStack.pop();
    return true;
  }
  function unwrap(a) {
    if (isObservableArray(a)) {
      return a.slice();
    }
    if (isES6Map(a) || isObservableMap(a)) {
      return Array.from(a.entries());
    }
    if (isES6Set(a) || isObservableSet(a)) {
      return Array.from(a.entries());
    }
    return a;
  }
  var _getGlobal$Iterator;
  var maybeIteratorPrototype = ((_getGlobal$Iterator = getGlobal().Iterator) == null ? void 0 : _getGlobal$Iterator.prototype) || {};
  function makeIterable(iterator) {
    iterator[Symbol.iterator] = getSelf;
    return Object.assign(Object.create(maybeIteratorPrototype), iterator);
  }
  function getSelf() {
    return this;
  }
  ["Symbol", "Map", "Set"].forEach(function(m) {
    var g = getGlobal();
    if (typeof g[m] === "undefined") {
      die("MobX requires global '" + m + "' to be available or polyfilled");
    }
  });
  if (typeof __MOBX_DEVTOOLS_GLOBAL_HOOK__ === "object") {
    __MOBX_DEVTOOLS_GLOBAL_HOOK__.injectMobx({
      spy,
      extras: {
        getDebugName
      },
      $mobx
    });
  }
  function parseSelector(input) {
    const segments = [];
    let i = 0;
    const len = input.length;
    function skipWs() {
      while (i < len && input[i] === " ") i++;
    }
    function readIdent() {
      const start = i;
      while (i < len && /[\w-]/.test(input[i])) i++;
      return input.slice(start, i);
    }
    while (i < len) {
      skipWs();
      if (i >= len) break;
      let combinator;
      if (segments.length > 0) {
        if (input[i] === ">") {
          combinator = ">";
          i++;
          skipWs();
        } else {
          combinator = " ";
        }
      }
      const simple = { classes: [], attrs: [] };
      while (i < len && input[i] !== " " && input[i] !== ">") {
        if (input[i] === ".") {
          i++;
          simple.classes.push(readIdent());
        } else if (input[i] === "#") {
          i++;
          simple.id = readIdent();
        } else if (input[i] === "[") {
          i++;
          const name = readIdent();
          let value = "";
          if (i < len && input[i] === "=") {
            i++;
            if (input[i] === '"' || input[i] === "'") {
              const quote = input[i];
              i++;
              const vstart = i;
              while (i < len && input[i] !== quote) i++;
              value = input.slice(vstart, i);
              i++;
            } else {
              value = readIdent();
            }
          }
          if (i < len && input[i] === "]") i++;
          simple.attrs.push({ name, value });
        } else if (/[\w-]/.test(input[i])) {
          simple.tag = readIdent();
        } else {
          break;
        }
      }
      segments.push({ simple, combinator });
    }
    return segments;
  }
  function buildVdomIndex() {
    const tags = /* @__PURE__ */ new Map();
    const classes = /* @__PURE__ */ new Map();
    const props = /* @__PURE__ */ new Map();
    const childEntries = /* @__PURE__ */ new Map();
    const parents = /* @__PURE__ */ new Map();
    for (const fact of db.facts.values()) {
      const entity = String(fact[0]);
      const attr = fact[1];
      if (attr === "tag") {
        tags.set(entity, String(fact[2]));
      } else if (attr === "class") {
        if (!classes.has(entity)) classes.set(entity, /* @__PURE__ */ new Set());
        classes.get(entity).add(String(fact[2]));
      } else if (attr === "prop") {
        if (!props.has(entity)) props.set(entity, /* @__PURE__ */ new Map());
        props.get(entity).set(String(fact[2]), fact[3]);
      } else if (attr === "child") {
        const parent = entity;
        const index = fact[2];
        const childId = String(fact[3]);
        if (!childEntries.has(parent)) childEntries.set(parent, []);
        childEntries.get(parent).push([index, childId]);
        parents.set(childId, parent);
      }
    }
    const children = /* @__PURE__ */ new Map();
    for (const [parent, entries] of childEntries) {
      entries.sort((a, b) => a[0] - b[0]);
      children.set(
        parent,
        entries.map(([, id]) => id)
      );
    }
    return { tags, classes, props, children, parents };
  }
  function matchesSimple(entityId, sel, idx) {
    if (sel.tag) {
      const tag = idx.tags.get(entityId);
      if (tag !== sel.tag) return false;
    }
    if (sel.id) {
      const elProps = idx.props.get(entityId);
      if (elProps?.get("id") !== sel.id) return false;
    }
    for (const cls of sel.classes) {
      const elClasses = idx.classes.get(entityId);
      if (!elClasses?.has(cls)) return false;
    }
    for (const attr of sel.attrs) {
      const elProps = idx.props.get(entityId);
      if (String(elProps?.get(attr.name) ?? "") !== attr.value) return false;
    }
    return true;
  }
  function isDescendantOf(entityId, ancestorId, idx) {
    let current = idx.parents.get(entityId);
    while (current) {
      if (current === ancestorId) return true;
      current = idx.parents.get(current);
    }
    return false;
  }
  function isChildOf(entityId, parentId, idx) {
    return idx.parents.get(entityId) === parentId;
  }
  function matchSelector(segments, idx) {
    if (segments.length === 0) return [];
    let candidates = [];
    for (const entityId of idx.tags.keys()) {
      if (matchesSimple(entityId, segments[0].simple, idx)) {
        candidates.push(entityId);
      }
    }
    for (let i = 1; i < segments.length; i++) {
      const { simple, combinator } = segments[i];
      const next = [];
      const matching = [];
      for (const entityId of idx.tags.keys()) {
        if (matchesSimple(entityId, simple, idx)) {
          matching.push(entityId);
        }
      }
      for (const entityId of matching) {
        for (const ancestor of candidates) {
          if (combinator === ">" && isChildOf(entityId, ancestor, idx)) {
            next.push(entityId);
            break;
          } else if (combinator === " " && isDescendantOf(entityId, ancestor, idx)) {
            next.push(entityId);
            break;
          }
        }
      }
      candidates = next;
    }
    return candidates;
  }
  function toVdomElement(entityId, idx) {
    return {
      id: entityId,
      tag: idx.tags.get(entityId) ?? "",
      classes: Array.from(idx.classes.get(entityId) ?? []).sort(),
      props: Object.fromEntries(idx.props.get(entityId) ?? [])
    };
  }
  const selectorCache = /* @__PURE__ */ new Map();
  function clearSelectCache() {
    selectorCache.clear();
  }
  function select(cssSelector) {
    let cached = selectorCache.get(cssSelector);
    if (!cached) {
      const segments = parseSelector(cssSelector);
      cached = computed(
        () => {
          const idx = buildVdomIndex();
          const entityIds = matchSelector(segments, idx);
          return entityIds.map((id) => toVdomElement(id, idx));
        },
        { equals: comparer.structural }
      );
      selectorCache.set(cssSelector, cached);
    }
    return cached.get();
  }
  const _ = Symbol("wildcard");
  const $ = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return void 0;
        return { __binding: true, name: prop };
      }
    }
  );
  function isBinding(x) {
    return x != null && typeof x === "object" && x.__binding === true;
  }
  function matchPattern(pattern, fact) {
    const len = pattern.length;
    if (len !== fact.length) return null;
    for (let i = 0; i < len; i++) {
      const p = pattern[i];
      if (p === _ || p !== null && typeof p === "object") continue;
      if (p !== fact[i]) return null;
    }
    let bindings = null;
    for (let i = 0; i < len; i++) {
      const p = pattern[i];
      if (p === _ || typeof p !== "object" || p === null) continue;
      const name = p.name;
      const f = fact[i];
      if (bindings === null) bindings = {};
      if (name in bindings) {
        if (bindings[name] !== f) return null;
      } else {
        bindings[name] = f;
      }
    }
    return bindings ?? {};
  }
  function mergeBindings(a, b) {
    for (const k in b) {
      if (k in a && a[k] !== b[k]) return null;
    }
    const merged = Object.assign({}, a);
    for (const k in b) {
      merged[k] = b[k];
    }
    return merged;
  }
  function couldMatch(pattern, fact) {
    if (pattern.length !== fact.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      if (p === _ || isBinding(p)) continue;
      if (p !== fact[i]) return false;
    }
    return true;
  }
  function patternsKey(patterns) {
    return JSON.stringify(
      patterns.map(
        (p) => p.map((t) => {
          if (t === _) return "__WILD__";
          if (isBinding(t)) return `__BIND__${t.name}`;
          return t;
        })
      )
    );
  }
  class FactDB {
    constructor() {
      /** All facts — app state, VDOM, decorations. One unified space. */
      __publicField(this, "facts", observable.map());
      /** Side-channel for non-serializable values (function refs for event handlers). */
      __publicField(this, "refs", /* @__PURE__ */ new Map());
      /** When non-null, insert() collects keys here (for tracking component-emitted facts). */
      __publicField(this, "emitCollector", null);
      /** Nested write collectors for tracking facts/refs created during scoped execution. */
      __publicField(this, "factCollectorStack", []);
      __publicField(this, "refCollectorStack", []);
      /** Implicit hierarchical ownership scopes for all writes. */
      __publicField(this, "rootOwner", "__root__");
      __publicField(this, "ownerStack", [this.rootOwner]);
      __publicField(this, "ownerFacts", /* @__PURE__ */ new Map());
      __publicField(this, "factOwners", /* @__PURE__ */ new Map());
      __publicField(this, "ownerRefs", /* @__PURE__ */ new Map());
      __publicField(this, "refOwners", /* @__PURE__ */ new Map());
      __publicField(this, "ownerParents", /* @__PURE__ */ new Map([
        [this.rootOwner, null]
      ]));
      __publicField(this, "ownerChildren", /* @__PURE__ */ new Map());
      __publicField(this, "ownerCounters", /* @__PURE__ */ new Map());
      /** Index of fact keys by first term, for fast querySingle when pattern has a literal first term. */
      __publicField(this, "factsByFirstTerm", /* @__PURE__ */ new Map());
      /** Plain (non-observable) mirror of facts for fast reads in query paths without MobX overhead. */
      __publicField(this, "factsPlain", /* @__PURE__ */ new Map());
      /**
       * Per-pattern-set version counters. Each registered pattern set gets
       * its own observable version. When a fact is written/removed, only
       * versions for patterns that could match it are bumped.
       */
      __publicField(this, "patternVersions", /* @__PURE__ */ new Map());
      /**
       * Index of pattern entries by their first literal term (for fast invalidation).
       * Patterns whose first term is a binding/wildcard go into the null bucket.
       */
      __publicField(this, "patternsByFirstTerm", /* @__PURE__ */ new Map());
      makeObservable(this, {
        assert: action,
        insert: action,
        drop: action,
        replace: action
      });
    }
    factKey(fact) {
      return JSON.stringify(fact);
    }
    currentOwner() {
      return this.ownerStack[this.ownerStack.length - 1] ?? this.rootOwner;
    }
    getCurrentOwnerId() {
      return this.currentOwner();
    }
    ensureOwner(ownerId, parentId = this.currentOwner()) {
      if (!this.ownerParents.has(ownerId)) {
        this.ownerParents.set(ownerId, parentId);
        if (parentId != null) {
          let children = this.ownerChildren.get(parentId);
          if (!children) {
            children = /* @__PURE__ */ new Set();
            this.ownerChildren.set(parentId, children);
          }
          children.add(ownerId);
        }
        return;
      }
      if (parentId != null) {
        const existingParent = this.ownerParents.get(ownerId);
        if (existingParent == null) {
          this.ownerParents.set(ownerId, parentId);
          let children = this.ownerChildren.get(parentId);
          if (!children) {
            children = /* @__PURE__ */ new Set();
            this.ownerChildren.set(parentId, children);
          }
          children.add(ownerId);
        }
      }
    }
    createChildOwner(parentId, label) {
      this.ensureOwner(
        parentId,
        this.ownerParents.get(parentId) ?? this.rootOwner
      );
      const counterKey = `${parentId}:${label}`;
      const next = (this.ownerCounters.get(counterKey) ?? 0) + 1;
      this.ownerCounters.set(counterKey, next);
      const ownerId = `${parentId}/${label}:${next}`;
      this.ensureOwner(ownerId, parentId);
      return ownerId;
    }
    withOwnerScope(ownerId, fn) {
      this.ensureOwner(ownerId);
      this.ownerStack.push(ownerId);
      try {
        return fn();
      } finally {
        this.ownerStack.pop();
      }
    }
    revokeOwner(ownerId) {
      const children = Array.from(this.ownerChildren.get(ownerId) ?? []);
      for (const childId of children) {
        this.revokeOwner(childId);
      }
      for (const key of Array.from(this.ownerFacts.get(ownerId) ?? [])) {
        this.detachFactOwner(key, ownerId);
      }
      for (const key of Array.from(this.ownerRefs.get(ownerId) ?? [])) {
        this.detachRefOwner(key, ownerId);
      }
      this.ownerFacts.delete(ownerId);
      this.ownerRefs.delete(ownerId);
      this.ownerChildren.delete(ownerId);
      const parentId = this.ownerParents.get(ownerId);
      if (parentId != null) {
        this.ownerChildren.get(parentId)?.delete(ownerId);
      }
      if (ownerId !== this.rootOwner) {
        this.ownerParents.delete(ownerId);
      }
    }
    attachFactOwner(key, ownerId) {
      let owners = this.factOwners.get(key);
      if (!owners) {
        owners = /* @__PURE__ */ new Set();
        this.factOwners.set(key, owners);
      }
      if (!owners.has(ownerId)) {
        owners.add(ownerId);
        let factKeys = this.ownerFacts.get(ownerId);
        if (!factKeys) {
          factKeys = /* @__PURE__ */ new Set();
          this.ownerFacts.set(ownerId, factKeys);
        }
        factKeys.add(key);
      }
    }
    deleteFactRecord(key, fact) {
      this.facts.delete(key);
      this.factsPlain.delete(key);
      this.factsByFirstTerm.get(fact[0])?.delete(key);
      this.invalidatePatterns(fact);
    }
    detachFactOwner(key, ownerId) {
      this.ownerFacts.get(ownerId)?.delete(key);
      const owners = this.factOwners.get(key);
      if (!owners) return;
      owners.delete(ownerId);
      if (owners.size === 0) {
        this.factOwners.delete(key);
        const fact = this.factsPlain.get(key);
        if (fact) this.deleteFactRecord(key, fact);
      }
    }
    attachRefOwner(key, ownerId) {
      let owners = this.refOwners.get(key);
      if (!owners) {
        owners = /* @__PURE__ */ new Set();
        this.refOwners.set(key, owners);
      }
      if (!owners.has(ownerId)) {
        owners.add(ownerId);
        let refKeys = this.ownerRefs.get(ownerId);
        if (!refKeys) {
          refKeys = /* @__PURE__ */ new Set();
          this.ownerRefs.set(ownerId, refKeys);
        }
        refKeys.add(key);
      }
    }
    detachRefOwner(key, ownerId) {
      this.ownerRefs.get(ownerId)?.delete(key);
      const owners = this.refOwners.get(key);
      if (!owners) return;
      owners.delete(ownerId);
      if (owners.size === 0) {
        this.refOwners.delete(key);
        this.refs.delete(key);
      }
    }
    /** Bump version counters for pattern sets that could match this fact. */
    invalidatePatterns(fact) {
      const firstTerm = fact[0];
      const exact = this.patternsByFirstTerm.get(firstTerm);
      if (exact) this.invalidateEntries(exact, fact);
      const wild = this.patternsByFirstTerm.get(null);
      if (wild) this.invalidateEntries(wild, fact);
    }
    invalidateEntries(keys, fact) {
      for (const key of keys) {
        const entry = this.patternVersions.get(key);
        if (!entry) continue;
        for (const pattern of entry.patterns) {
          if (couldMatch(pattern, fact)) {
            entry.version.set(entry.version.get() + 1);
            break;
          }
        }
      }
    }
    addFact(terms, ownerId) {
      const key = this.factKey(terms);
      this.ensureOwner(
        ownerId,
        ownerId === this.rootOwner ? null : this.currentOwner()
      );
      if (!this.facts.has(key)) {
        this.facts.set(key, terms);
        this.factsPlain.set(key, terms);
        if (this.emitCollector) this.emitCollector.add(key);
        for (const collector of this.factCollectorStack) collector.add(key);
        const first = terms[0];
        let bucket = this.factsByFirstTerm.get(first);
        if (!bucket) {
          bucket = /* @__PURE__ */ new Set();
          this.factsByFirstTerm.set(first, bucket);
        }
        bucket.add(key);
        this.invalidatePatterns(terms);
      }
      this.attachFactOwner(key, ownerId);
    }
    assert(...terms) {
      this.addFact(terms, this.currentOwner());
    }
    insert(...terms) {
      this.addFact(terms, this.rootOwner);
    }
    drop(...terms) {
      if (!terms.includes(_)) {
        const key = this.factKey(terms);
        const fact = this.factsPlain.get(key);
        if (fact) {
          for (const ownerId of Array.from(this.factOwners.get(key) ?? [])) {
            this.ownerFacts.get(ownerId)?.delete(key);
          }
          this.factOwners.delete(key);
          this.deleteFactRecord(key, fact);
        }
        return;
      }
      const toRemove = [];
      for (const [key, fact] of this.facts) {
        if (fact.length !== terms.length) continue;
        let matches = true;
        for (let i = 0; i < terms.length; i++) {
          if (terms[i] === _) continue;
          if (terms[i] !== fact[i]) {
            matches = false;
            break;
          }
        }
        if (matches) toRemove.push([key, fact]);
      }
      for (const [key, fact] of toRemove) {
        for (const ownerId of Array.from(this.factOwners.get(key) ?? [])) {
          this.ownerFacts.get(ownerId)?.delete(key);
        }
        this.factOwners.delete(key);
        this.deleteFactRecord(key, fact);
      }
    }
    replace(...terms) {
      if (terms.length < 2)
        throw new Error("replace() requires at least 2 terms");
      const pattern = [...terms.slice(0, terms.length - 1), _];
      this.drop(...pattern);
      this.insert(...terms);
    }
    /**
     * Create a per-pattern-insert computed index. Returns a computed that:
     * - Tracks only the version counter for these patterns (fine-grained)
     * - Re-evaluates (scans all facts) only when that counter bumps
     * - Uses structural comparison so observers only re-run on actual changes
     */
    index(...patterns) {
      const key = patternsKey(patterns);
      if (!this.patternVersions.has(key)) {
        this.patternVersions.set(key, { patterns, version: observable.box(0) });
        for (const pattern of patterns) {
          const first = pattern[0];
          const indexKey = first !== _ && !isBinding(first) ? first : null;
          let bucket = this.patternsByFirstTerm.get(indexKey);
          if (!bucket) {
            bucket = /* @__PURE__ */ new Set();
            this.patternsByFirstTerm.set(indexKey, bucket);
          }
          bucket.add(key);
        }
      }
      const entry = this.patternVersions.get(key);
      return computed(
        () => {
          entry.version.get();
          return untracked(() => this.query(...patterns));
        },
        { equals: comparer.structural }
      );
    }
    /** Return facts to scan for a pattern's first term. Uses the index for literals. */
    iterFacts(firstPatternTerm) {
      if (firstPatternTerm !== _ && !isBinding(firstPatternTerm)) {
        const bucket = this.factsByFirstTerm.get(firstPatternTerm);
        if (!bucket) return [];
        const facts = [];
        for (const key of bucket) {
          const fact = this.factsPlain.get(key);
          if (fact) facts.push(fact);
        }
        return facts;
      }
      return this.factsPlain.values();
    }
    /** Query all facts matching patterns (non-reactive, point-in-time). */
    query(...patterns) {
      if (patterns.length === 0) return [];
      if (patterns.length === 1) return this.querySingle(patterns[0]);
      return this.queryJoin(patterns);
    }
    querySingle(pattern) {
      const first = pattern[0];
      const results = [];
      if (first !== _ && !isBinding(first)) {
        const bucket = this.factsByFirstTerm.get(first);
        if (!bucket) return results;
        for (const key of bucket) {
          const fact = this.factsPlain.get(key);
          if (!fact) continue;
          const bindings = matchPattern(pattern, fact);
          if (bindings) results.push(bindings);
        }
      } else {
        for (const fact of this.factsPlain.values()) {
          const bindings = matchPattern(pattern, fact);
          if (bindings) results.push(bindings);
        }
      }
      return results;
    }
    /**
     * Pre-analyze a pattern into positions of literals, bindings, and wildcards.
     * Allows the join to skip matchPattern and do direct array access.
     */
    static compilePattern(pattern) {
      const literals = [];
      const bindings = [];
      for (let i = 0; i < pattern.length; i++) {
        const t = pattern[i];
        if (t === _) continue;
        if (isBinding(t)) bindings.push([i, t.name]);
        else literals.push([i, t]);
      }
      return { literals, bindings, length: pattern.length };
    }
    queryJoin(patterns) {
      let current = this.querySingle(patterns[0]);
      for (let i = 1; i < patterns.length; i++) {
        const pattern = patterns[i];
        const compiled = FactDB.compilePattern(pattern);
        const currentBindingNames = current.length > 0 ? Object.keys(current[0]) : [];
        let joinKey = null;
        let joinPos = -1;
        for (const [pos, name] of compiled.bindings) {
          if (currentBindingNames.includes(name)) {
            joinKey = name;
            joinPos = pos;
            break;
          }
        }
        if (joinKey !== null) {
          const index = /* @__PURE__ */ new Map();
          const first = pattern[0];
          const scanBucket = first !== _ && !isBinding(first) ? this.factsByFirstTerm.get(first) : null;
          const facts = scanBucket ? scanBucket : this.facts.keys();
          for (const keyOrFactKey of facts) {
            const fact = this.factsPlain.get(keyOrFactKey);
            if (!fact || fact.length !== compiled.length) continue;
            let matches = true;
            for (let li = 0; li < compiled.literals.length; li++) {
              const [pos, val] = compiled.literals[li];
              if (scanBucket && pos === 0) continue;
              if (fact[pos] !== val) {
                matches = false;
                break;
              }
            }
            if (!matches) continue;
            const joinVal = fact[joinPos];
            const bindings = {};
            for (const [pos, name] of compiled.bindings) {
              bindings[name] = fact[pos];
            }
            let bucket = index.get(joinVal);
            if (!bucket) {
              bucket = [];
              index.set(joinVal, bucket);
            }
            bucket.push(bindings);
          }
          const newNames = [];
          const otherSharedNames = [];
          for (const [, name] of compiled.bindings) {
            if (name === joinKey) continue;
            if (currentBindingNames.includes(name)) otherSharedNames.push(name);
            else newNames.push(name);
          }
          const next = [];
          for (const existing of current) {
            const key = existing[joinKey];
            const bucket = index.get(key);
            if (bucket) {
              for (const factBindings of bucket) {
                let conflict = false;
                for (const name of otherSharedNames) {
                  if (existing[name] !== factBindings[name]) {
                    conflict = true;
                    break;
                  }
                }
                if (conflict) continue;
                const merged = Object.assign({}, existing);
                for (const name of newNames) {
                  merged[name] = factBindings[name];
                }
                next.push(merged);
              }
            }
          }
          current = next;
        } else {
          const next = [];
          for (const existing of current) {
            for (const fact of this.iterFacts(pattern[0])) {
              const factBindings = matchPattern(pattern, fact);
              if (factBindings) {
                const merged = mergeBindings(existing, factBindings);
                if (merged) next.push(merged);
              }
            }
          }
          current = next;
        }
      }
      return current;
    }
    /** Delete a fact by its serialized key, maintaining all indexes. */
    deleteByKey(key) {
      const fact = this.factsPlain.get(key);
      if (fact) {
        this.facts.delete(key);
        this.factsPlain.delete(key);
        this.factsByFirstTerm.get(fact[0])?.delete(key);
      }
    }
    /** Clear all facts, pattern versions, and refs. */
    clear() {
      this.facts.clear();
      this.factsPlain.clear();
      this.factsByFirstTerm.clear();
      this.patternVersions.clear();
      this.patternsByFirstTerm.clear();
      this.refs.clear();
      clearSelectCache();
    }
    // --- Refs ---
    setRef(key, value) {
      this.refs.set(key, value);
    }
    getRef(key) {
      return this.refs.get(key);
    }
    deleteRef(key) {
      this.refs.delete(key);
    }
  }
  const db = new FactDB();
  const claim = action((...terms) => {
    db.assert(...terms);
  });
  const remember = action((...terms) => {
    db.insert(...terms);
  });
  const forget = action((...terms) => {
    db.drop(...terms);
  });
  const replace = action((...terms) => {
    db.replace(...terms);
  });
  function transaction(fn) {
    return runInAction(fn);
  }
  function when(...patterns) {
    return db.index(...patterns).get();
  }
  function whenever(patterns, body) {
    const idx = db.index(...patterns);
    const parentOwner = db.createChildOwner(db.getCurrentOwnerId(), "rule-parent");
    let currentRunOwner = null;
    const disposer = reaction(
      () => idx.get(),
      (matches) => {
        runInAction(() => {
          if (currentRunOwner) db.revokeOwner(currentRunOwner);
          currentRunOwner = db.createChildOwner(parentOwner, "run");
          db.withOwnerScope(currentRunOwner, () => {
            body(matches);
          });
        });
      },
      { fireImmediately: true, equals: comparer.structural }
    );
    return () => {
      disposer();
      runInAction(() => {
        if (currentRunOwner) db.revokeOwner(currentRunOwner);
        db.revokeOwner(parentOwner);
      });
    };
  }
  function h$1(tag, props, ...children) {
    return {
      __vnode: true,
      tag,
      props: props ?? {},
      children: children.flat(10)
    };
  }
  function Fragment(_props, ...children) {
    return {
      __vnode: true,
      tag: "__fragment",
      props: {},
      children: children.flat(10)
    };
  }
  function flattenChildren$1(children) {
    const result = [];
    for (const child of children) {
      if (child == null || typeof child === "boolean") continue;
      if (Array.isArray(child)) {
        result.push(...flattenChildren$1(child));
      } else if (typeof child === "object" && "__vnode" in child && child.tag === "__fragment") {
        result.push(...flattenChildren$1(child.children));
      } else {
        result.push(child);
      }
    }
    return result;
  }
  function computeEntityId$1(parentId, childIndex, props, inheritId) {
    if (props.id != null) return String(props.id);
    if (inheritId) return inheritId;
    if (props.key != null) return `${parentId}:k:${props.key}`;
    return `${parentId}:${childIndex}`;
  }
  function emitVdom$1(node, parentId, childIndex, inheritId) {
    if (node == null || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      const textId = inheritId ?? `${parentId}:${childIndex}`;
      db.assert(textId, "tag", "__text");
      db.assert(textId, "text", String(node));
      db.assert(parentId, "child", childIndex, textId);
      return;
    }
    if (Array.isArray(node)) {
      const flat2 = flattenChildren$1(node);
      for (let i = 0; i < flat2.length; i++) {
        emitVdom$1(flat2[i], parentId, childIndex + i);
      }
      return;
    }
    if (!node.__vnode) return;
    const vnode = node;
    if (typeof vnode.tag === "function") {
      const propsWithChildren = vnode.children.length > 0 ? {
        ...vnode.props,
        children: vnode.children.length === 1 ? vnode.children[0] : vnode.children
      } : vnode.props;
      const result = vnode.tag(propsWithChildren);
      if (result) {
        const componentId = computeEntityId$1(
          parentId,
          childIndex,
          vnode.props,
          inheritId
        );
        emitVdom$1(result, parentId, childIndex, componentId);
      }
      return;
    }
    if (vnode.tag === "__fragment") {
      const flat2 = flattenChildren$1(vnode.children);
      for (let i = 0; i < flat2.length; i++) {
        emitVdom$1(flat2[i], parentId, childIndex + i);
      }
      return;
    }
    const elId = computeEntityId$1(parentId, childIndex, vnode.props, inheritId);
    const tagName = vnode.props.__nativeTag ? String(vnode.props.__nativeTag) : vnode.tag;
    db.assert(elId, "tag", tagName);
    db.assert(parentId, "child", childIndex, elId);
    if (vnode.props.__nativeStyles) {
      for (const [prop, value] of Object.entries(
        vnode.props.__nativeStyles
      )) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          db.assert(elId, "style", prop, value);
        }
      }
    }
    for (const [key, value] of Object.entries(vnode.props)) {
      if (key === "key") continue;
      if (key === "__nativeStyles" || key === "__nativeTag" || key.startsWith("__native_"))
        continue;
      if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase();
        const refKey = `${elId}:handler:${eventName}`;
        db.setRef(refKey, value);
        db.assert(elId, "handler", eventName, refKey);
      } else if (key === "class" && typeof value === "string") {
        for (const cls of value.split(/\s+/).filter(Boolean)) {
          db.assert(elId, "class", cls);
        }
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        db.assert(elId, "prop", key, value);
      }
    }
    const flat = flattenChildren$1(vnode.children);
    for (let i = 0; i < flat.length; i++) {
      emitVdom$1(flat[i], elId, i);
    }
  }
  function injectVdom(parentId, startIndex, ...nodes) {
    const flat = flattenChildren$1(nodes);
    for (let i = 0; i < flat.length; i++) {
      emitVdom$1(flat[i], parentId, startIndex + i);
    }
  }
  function mount(rootVnode, container) {
    const mountOwner = db.createChildOwner(db.getCurrentOwnerId(), "mount");
    const emitDisposer = reaction(
      () => {
        let vnode = rootVnode;
        if (typeof rootVnode === "object" && rootVnode !== null && "__vnode" in rootVnode) {
          const rn = rootVnode;
          if (typeof rn.tag === "function") {
            vnode = rn.tag(rn.props);
          }
        }
        return vnode;
      },
      (vnode) => {
        runInAction(() => {
          db.revokeOwner(mountOwner);
          db.withOwnerScope(mountOwner, () => {
            db.emitCollector = /* @__PURE__ */ new Set();
            emitVdom$1(vnode, "dom", 0);
            db.emitCollector = null;
          });
        });
      },
      // Always fire effect when data function re-runs — VNodes are new objects
      // each time so reference equality would always trigger anyway.
      { fireImmediately: true, equals: () => false }
    );
    const managed = /* @__PURE__ */ new Map();
    const patchDisposer = autorun(() => {
      const allFacts = Array.from(db.facts.values());
      const tags = /* @__PURE__ */ new Map();
      const classes = /* @__PURE__ */ new Map();
      const props = /* @__PURE__ */ new Map();
      const texts = /* @__PURE__ */ new Map();
      const handlers = /* @__PURE__ */ new Map();
      const children = /* @__PURE__ */ new Map();
      for (const fact of allFacts) {
        const entity = String(fact[0]);
        const attr = fact[1];
        if (attr === "tag") {
          tags.set(entity, String(fact[2]));
        } else if (attr === "class") {
          if (!classes.has(entity)) classes.set(entity, /* @__PURE__ */ new Set());
          classes.get(entity).add(String(fact[2]));
        } else if (attr === "prop") {
          if (!props.has(entity)) props.set(entity, /* @__PURE__ */ new Map());
          props.get(entity).set(String(fact[2]), fact[3]);
        } else if (attr === "text") {
          texts.set(entity, String(fact[2]));
        } else if (attr === "handler") {
          if (!handlers.has(entity)) handlers.set(entity, /* @__PURE__ */ new Map());
          handlers.get(entity).set(String(fact[2]), String(fact[3]));
        } else if (attr === "child") {
          if (!children.has(entity)) children.set(entity, []);
          children.get(entity).push([fact[2], String(fact[3])]);
        }
      }
      for (const [, list] of children) list.sort((a, b) => a[0] - b[0]);
      const visited = /* @__PURE__ */ new Set();
      function reconcile(entityId) {
        const tag = tags.get(entityId);
        if (!tag || visited.has(entityId)) return null;
        visited.add(entityId);
        if (tag === "__text") {
          const text = texts.get(entityId) ?? "";
          let node = managed.get(entityId);
          if (node instanceof Text) {
            if (node.textContent !== text) node.textContent = text;
          } else {
            node = document.createTextNode(text);
            managed.set(entityId, node);
          }
          return node;
        }
        let el = managed.get(entityId);
        if (!(el instanceof HTMLElement) || el.tagName.toLowerCase() !== tag) {
          el = document.createElement(tag);
          managed.set(entityId, el);
        }
        const clsSet = classes.get(entityId);
        const clsStr = clsSet ? Array.from(clsSet).sort().join(" ") : "";
        if (el.getAttribute("class") !== clsStr) {
          if (clsStr) el.setAttribute("class", clsStr);
          else el.removeAttribute("class");
        }
        const elProps = props.get(entityId);
        const activeAttrs = /* @__PURE__ */ new Set();
        if (elProps) {
          for (const [key, value] of elProps) {
            activeAttrs.add(key);
            if (key === "checked" || key === "value" || key === "disabled") {
              if (el[key] !== value) el[key] = value;
            } else {
              const strVal = String(value);
              if (el.getAttribute(key) !== strVal) el.setAttribute(key, strVal);
            }
          }
        }
        for (let i = el.attributes.length - 1; i >= 0; i--) {
          const name = el.attributes[i].name;
          if (name === "class") continue;
          if (!activeAttrs.has(name)) el.removeAttribute(name);
        }
        const oldHandlers = el.__handlers ?? /* @__PURE__ */ new Map();
        for (const [event, listener] of oldHandlers) el.removeEventListener(event, listener);
        const newHandlers = /* @__PURE__ */ new Map();
        const elHandlers = handlers.get(entityId);
        if (elHandlers) {
          for (const [event, refKey] of elHandlers) {
            const fn = db.getRef(refKey);
            if (fn) {
              el.addEventListener(event, fn);
              newHandlers.set(event, fn);
            }
          }
        }
        el.__handlers = newHandlers;
        const childList = children.get(entityId) ?? [];
        const childNodes = [];
        for (const [, childId] of childList) {
          const node = reconcile(childId);
          if (node) childNodes.push(node);
        }
        for (let i = 0; i < childNodes.length; i++) {
          if (el.childNodes[i] !== childNodes[i]) {
            el.insertBefore(childNodes[i], el.childNodes[i] || null);
          }
        }
        while (el.childNodes.length > childNodes.length) {
          el.removeChild(el.lastChild);
        }
        return el;
      }
      const rootChildren = children.get("dom") ?? [];
      const rootNodes = [];
      for (const [, childId] of rootChildren) {
        const node = reconcile(childId);
        if (node) rootNodes.push(node);
      }
      for (let i = 0; i < rootNodes.length; i++) {
        if (container.childNodes[i] !== rootNodes[i]) {
          container.insertBefore(rootNodes[i], container.childNodes[i] || null);
        }
      }
      while (container.childNodes.length > rootNodes.length) {
        container.removeChild(container.lastChild);
      }
      for (const id of managed.keys()) {
        if (!visited.has(id)) managed.delete(id);
      }
    });
    return () => {
      emitDisposer();
      runInAction(() => {
        db.revokeOwner(mountOwner);
      });
      patchDisposer();
    };
  }
  const programRegistry = /* @__PURE__ */ new Map();
  function addDisposer(target, disposer) {
    if (typeof disposer === "function") target.add(disposer);
  }
  function createProgramAPI(extraApi = {}, disposers) {
    const autoDisposers = disposers ?? /* @__PURE__ */ new Set();
    const api = {
      db,
      $,
      _,
      claim: (...terms) => claim(...terms),
      remember: (...terms) => remember(...terms),
      replace: (...terms) => replace(...terms),
      forget: (...terms) => forget(...terms),
      when,
      whenever: (patterns, body) => {
        const disposer = whenever(patterns, body);
        autoDisposers.add(disposer);
        return disposer;
      },
      transaction,
      h: h$1,
      Fragment,
      injectVdom,
      mount: ((rootVnode, container) => {
        const disposer = mount(rootVnode, container);
        autoDisposers.add(disposer);
        return disposer;
      }),
      select,
      ...extraApi
    };
    return Object.freeze(api);
  }
  function registerProgram(id, runner, options = {}) {
    removeProgram(id);
    const disposers = /* @__PURE__ */ new Set();
    const api = createProgramAPI(options.api ?? {}, disposers);
    const ownerId = `program:${id}`;
    let result;
    try {
      result = db.withOwnerScope(ownerId, () => runner(api));
    } catch (error) {
      for (const disposer of Array.from(disposers).reverse()) {
        disposer();
      }
      db.revokeOwner(ownerId);
      throw error;
    }
    addDisposer(disposers, result);
    const dispose = () => {
      for (const disposer of Array.from(disposers).reverse()) {
        disposer();
      }
      db.revokeOwner(ownerId);
      programRegistry.delete(id);
    };
    programRegistry.set(id, { id, dispose });
    return dispose;
  }
  function removeProgram(id) {
    const record = programRegistry.get(id);
    if (!record) return;
    record.dispose();
  }
  function loadProgramSource(id, source, options = {}) {
    return registerProgram(
      id,
      (api) => {
        const fn = new Function("jam", `with(jam) { ${source} }`);
        return fn(api);
      },
      options
    );
  }
  function h(tag, props, ...children) {
    return {
      __vnode: true,
      tag,
      props: props ?? {},
      children: children.flat(10)
    };
  }
  function flattenChildren(children) {
    const result = [];
    for (const child of children) {
      if (child == null || typeof child === "boolean") continue;
      if (Array.isArray(child)) {
        result.push(...flattenChildren(child));
      } else if (typeof child === "object" && "__vnode" in child && child.tag === "__fragment") {
        result.push(...flattenChildren(child.children));
      } else {
        result.push(child);
      }
    }
    return result;
  }
  function computeEntityId(parentId, childIndex, props, inheritId) {
    if (props.id != null) return String(props.id);
    if (inheritId) return inheritId;
    if (props.key != null) return `${parentId}:k:${props.key}`;
    return `${parentId}:${childIndex}`;
  }
  function emitVdom(node, parentId, childIndex, inheritId) {
    if (node == null || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      const textId = inheritId ?? `${parentId}:${childIndex}`;
      db.assert(textId, "tag", "__text");
      db.assert(textId, "text", String(node));
      db.assert(parentId, "child", childIndex, textId);
      return;
    }
    if (Array.isArray(node)) {
      const flat2 = flattenChildren(node);
      for (let i = 0; i < flat2.length; i++) {
        emitVdom(flat2[i], parentId, childIndex + i);
      }
      return;
    }
    if (!node.__vnode) return;
    const vnode = node;
    if (typeof vnode.tag === "function") {
      const propsWithChildren = vnode.children.length > 0 ? {
        ...vnode.props,
        children: vnode.children.length === 1 ? vnode.children[0] : vnode.children
      } : vnode.props;
      const result = vnode.tag(propsWithChildren);
      if (result) {
        const componentId = computeEntityId(
          parentId,
          childIndex,
          vnode.props,
          inheritId
        );
        emitVdom(result, parentId, childIndex, componentId);
      }
      return;
    }
    if (vnode.tag === "__fragment") {
      const flat2 = flattenChildren(vnode.children);
      for (let i = 0; i < flat2.length; i++) {
        emitVdom(flat2[i], parentId, childIndex + i);
      }
      return;
    }
    const elId = computeEntityId(parentId, childIndex, vnode.props, inheritId);
    const tagName = vnode.props.__nativeTag ? String(vnode.props.__nativeTag) : vnode.tag;
    db.assert(elId, "tag", tagName);
    db.assert(parentId, "child", childIndex, elId);
    if (vnode.props.__nativeStyles) {
      for (const [prop, value] of Object.entries(
        vnode.props.__nativeStyles
      )) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          db.assert(elId, "style", prop, value);
        }
      }
    }
    for (const [key, value] of Object.entries(vnode.props)) {
      if (key === "key") continue;
      if (key === "__nativeStyles" || key === "__nativeTag" || key.startsWith("__native_"))
        continue;
      if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase();
        const refKey = `${elId}:handler:${eventName}`;
        db.setRef(refKey, value);
        db.assert(elId, "handler", eventName, refKey);
      } else if (key === "class" && typeof value === "string") {
        for (const cls of value.split(/\s+/).filter(Boolean)) {
          db.assert(elId, "class", cls);
        }
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        db.assert(elId, "prop", key, value);
      }
    }
    const flat = flattenChildren(vnode.children);
    for (let i = 0; i < flat.length; i++) {
      emitVdom(flat[i], elId, i);
    }
  }
  function createTokens(config) {
    for (const category of Object.keys(config)) {
      const values = config[category];
      if (!values) continue;
      for (const [key, value] of Object.entries(values)) {
        remember("token", category, key, value);
      }
    }
  }
  function getToken(category, key) {
    const results = when(["token", category, key, $.value]);
    return results.length > 0 ? results[0].value : void 0;
  }
  function resolveTokenValue(ref) {
    if (typeof ref === "number") return ref;
    if (typeof ref !== "string") return void 0;
    if (!ref.startsWith("$")) return ref;
    const dotIndex = ref.indexOf(".");
    if (dotIndex === -1) return void 0;
    const category = ref.slice(1, dotIndex);
    const key = ref.slice(dotIndex + 1);
    return getToken(category, key);
  }
  function isTokenRef(value) {
    return typeof value === "string" && value.startsWith("$") && value.includes(".");
  }
  function isThemeRef(value) {
    return typeof value === "string" && value.startsWith("$") && !value.includes(".");
  }
  function createThemes(themes) {
    for (const [name, values] of Object.entries(themes)) {
      for (const [key, value] of Object.entries(values)) {
        remember("theme", name, key, value);
      }
    }
  }
  function setTheme(name) {
    replace("ui", "theme", name);
  }
  function getActiveThemeName() {
    const results = when(["ui", "theme", $.name]);
    return results.length > 0 ? results[0].name : void 0;
  }
  function getThemeValues(name) {
    const results = when(["theme", name, $.key, $.value]);
    const values = {};
    for (const r of results) {
      values[r.key] = r.value;
    }
    return values;
  }
  function resolveThemeKey(themeName, key) {
    let current = themeName;
    while (current) {
      const results = when(["theme", current, key, $.value]);
      if (results.length > 0) return results[0].value;
      const lastUnderscore = current.lastIndexOf("_");
      current = lastUnderscore > 0 ? current.slice(0, lastUnderscore) : void 0;
    }
    return void 0;
  }
  function useTheme() {
    const activeTheme = getActiveThemeName();
    if (!activeTheme) return {};
    const allKeys = /* @__PURE__ */ new Set();
    let current = activeTheme;
    while (current) {
      const results = when(["theme", current, $.key, $.value]);
      for (const r of results) allKeys.add(r.key);
      const lastUnderscore = current.lastIndexOf("_");
      current = lastUnderscore > 0 ? current.slice(0, lastUnderscore) : void 0;
    }
    const resolved = {};
    for (const key of allKeys) {
      const value = resolveThemeKey(activeTheme, key);
      if (value !== void 0) resolved[key] = value;
    }
    return resolved;
  }
  function resolveThemeValue(ref) {
    const activeTheme = getActiveThemeName();
    if (!activeTheme) return void 0;
    const key = ref.slice(1);
    return resolveThemeKey(activeTheme, key);
  }
  function addTheme(name, values) {
    for (const [key, value] of Object.entries(values)) {
      remember("theme", name, key, value);
    }
  }
  function updateTheme(name, values) {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) continue;
      replace("theme", name, key, value);
    }
  }
  function injectThemeCSS() {
    if (typeof document === "undefined") return;
    let styleEl = document.getElementById("jam-ui-themes");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "jam-ui-themes";
      document.head.appendChild(styleEl);
    }
    const themeResults = when(["theme", $.name, $.key, $.value]);
    const themes = /* @__PURE__ */ new Map();
    for (const r of themeResults) {
      const name = r.name;
      if (!themes.has(name)) themes.set(name, /* @__PURE__ */ new Map());
      themes.get(name).set(r.key, r.value);
    }
    const rules = [];
    for (const [name, values] of themes) {
      const vars = Array.from(values.entries()).map(([key, value]) => `--${key}: ${value}`).join("; ");
      rules.push(`.t_${name} { ${vars} }`);
    }
    styleEl.textContent = rules.join("\n");
  }
  const listeners = [];
  function createMedia(config) {
    for (const cleanup of listeners) cleanup();
    listeners.length = 0;
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
      for (const name of Object.keys(config)) {
        replace("media", name, false);
      }
      return;
    }
    for (const [name, query] of Object.entries(config)) {
      const mediaQuery = buildMediaQuery(query);
      const mql = window.matchMedia(mediaQuery);
      replace("media", name, mql.matches);
      const handler = (e) => {
        replace("media", name, e.matches);
      };
      mql.addEventListener("change", handler);
      listeners.push(() => mql.removeEventListener("change", handler));
    }
  }
  function buildMediaQuery(config) {
    const conditions = [];
    if (config.minWidth != null) conditions.push(`(min-width: ${config.minWidth}px)`);
    if (config.maxWidth != null) conditions.push(`(max-width: ${config.maxWidth}px)`);
    if (config.minHeight != null) conditions.push(`(min-height: ${config.minHeight}px)`);
    if (config.maxHeight != null) conditions.push(`(max-height: ${config.maxHeight}px)`);
    return conditions.join(" and ") || "all";
  }
  function useMedia() {
    const results = when(["media", $.name, $.value]);
    const media = {};
    for (const r of results) {
      media[r.name] = r.value;
    }
    return media;
  }
  const defaultMediaConfig = {
    xs: { maxWidth: 660 },
    sm: { maxWidth: 860 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    gtXs: { minWidth: 661 },
    gtSm: { minWidth: 861 },
    gtMd: { minWidth: 1021 },
    gtLg: { minWidth: 1281 },
    short: { maxHeight: 820 }
  };
  function disposeMedia() {
    for (const cleanup of listeners) cleanup();
    listeners.length = 0;
  }
  function createFont(name, config) {
    remember("font", name, "family", config.family);
    for (const [key, value] of Object.entries(config.size)) {
      remember("font", name, "size", key, value);
    }
    const lineHeights = autoFill(config.size, config.lineHeight ?? {});
    for (const [key, value] of Object.entries(lineHeights)) {
      remember("font", name, "lineHeight", key, value);
    }
    const weights = autoFillString(config.size, config.weight ?? {});
    for (const [key, value] of Object.entries(weights)) {
      remember("font", name, "weight", key, value);
    }
    const letterSpacings = autoFill(config.size, config.letterSpacing ?? {});
    for (const [key, value] of Object.entries(letterSpacings)) {
      remember("font", name, "letterSpacing", key, value);
    }
    if (config.face) {
      for (const [weight, faces] of Object.entries(config.face)) {
        remember("font", name, "face", weight, faces.normal);
        if (faces.italic) {
          remember("font", name, "faceItalic", weight, faces.italic);
        }
      }
    }
  }
  function autoFill(sizeMap, partial) {
    const sizeKeys = Object.keys(sizeMap).sort((a, b) => Number(a) - Number(b));
    const definedKeys = Object.keys(partial).sort((a, b) => Number(a) - Number(b));
    if (definedKeys.length === 0) return {};
    const result = {};
    for (const key of sizeKeys) {
      if (key in partial) {
        result[key] = partial[key];
      } else {
        const keyNum = Number(key);
        let closest = definedKeys[0];
        let closestDist = Math.abs(Number(closest) - keyNum);
        for (const dk of definedKeys) {
          const dist = Math.abs(Number(dk) - keyNum);
          if (dist < closestDist) {
            closest = dk;
            closestDist = dist;
          }
        }
        result[key] = partial[closest];
      }
    }
    return result;
  }
  function autoFillString(sizeMap, partial) {
    const sizeKeys = Object.keys(sizeMap).sort((a, b) => Number(a) - Number(b));
    const definedKeys = Object.keys(partial).sort((a, b) => Number(a) - Number(b));
    if (definedKeys.length === 0) return {};
    const result = {};
    for (const key of sizeKeys) {
      if (key in partial) {
        result[key] = partial[key];
      } else {
        const keyNum = Number(key);
        let closest = definedKeys[0];
        let closestDist = Math.abs(Number(closest) - keyNum);
        for (const dk of definedKeys) {
          const dist = Math.abs(Number(dk) - keyNum);
          if (dist < closestDist) {
            closest = dk;
            closestDist = dist;
          }
        }
        result[key] = partial[closest];
      }
    }
    return result;
  }
  function getFontSized(fontName, sizeKey) {
    const familyResults = when(["font", fontName, "family", $.value]);
    const fontFamily = familyResults.length > 0 ? familyResults[0].value : "";
    const sizeResults = when(["font", fontName, "size", sizeKey, $.value]);
    const fontSize = sizeResults.length > 0 ? sizeResults[0].value : 14;
    const lhResults = when(["font", fontName, "lineHeight", sizeKey, $.value]);
    const lineHeight = lhResults.length > 0 ? lhResults[0].value : void 0;
    const weightResults = when(["font", fontName, "weight", sizeKey, $.value]);
    const fontWeight = weightResults.length > 0 ? weightResults[0].value : void 0;
    const lsResults = when(["font", fontName, "letterSpacing", sizeKey, $.value]);
    const letterSpacing = lsResults.length > 0 ? lsResults[0].value : void 0;
    return { fontFamily, fontSize, lineHeight, fontWeight, letterSpacing };
  }
  function createJamUI(config) {
    if (config.tokens) {
      createTokens(config.tokens);
    }
    if (config.themes) {
      createThemes(config.themes);
    }
    if (config.media) {
      createMedia(config.media);
    } else {
      createMedia(defaultMediaConfig);
    }
    if (config.fonts) {
      for (const [name, fontConfig] of Object.entries(config.fonts)) {
        createFont(name, fontConfig);
      }
    }
    if (config.defaultTheme) {
      setTheme(config.defaultTheme);
    }
    injectThemeCSS();
  }
  let _nativeMode = false;
  function setNativeMode(enabled) {
    _nativeMode = enabled;
  }
  function isNativeMode() {
    return _nativeMode;
  }
  const shorthandMap = {
    p: "padding",
    pt: "paddingTop",
    pr: "paddingRight",
    pb: "paddingBottom",
    pl: "paddingLeft",
    px: ["paddingLeft", "paddingRight"],
    py: ["paddingTop", "paddingBottom"],
    paddingHorizontal: ["paddingLeft", "paddingRight"],
    paddingVertical: ["paddingTop", "paddingBottom"],
    m: "margin",
    mt: "marginTop",
    mr: "marginRight",
    mb: "marginBottom",
    ml: "marginLeft",
    mx: ["marginLeft", "marginRight"],
    my: ["marginTop", "marginBottom"],
    marginHorizontal: ["marginLeft", "marginRight"],
    marginVertical: ["marginTop", "marginBottom"],
    bg: "backgroundColor",
    bc: "borderColor",
    br: "borderRadius",
    bw: "borderWidth",
    w: "width",
    h: "height",
    f: "flex",
    fd: "flexDirection",
    fw: "flexWrap",
    ai: "alignItems",
    ac: "alignContent",
    jc: "justifyContent",
    as: "alignSelf",
    ta: "textAlign",
    o: "opacity",
    pe: "pointerEvents",
    us: "userSelect"
  };
  const camelToKebabCache = /* @__PURE__ */ new Map();
  function camelToKebab(str) {
    let result = camelToKebabCache.get(str);
    if (result !== void 0) return result;
    result = str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    camelToKebabCache.set(str, result);
    return result;
  }
  const stylePropertyNames = /* @__PURE__ */ new Set([
    // Layout
    "display",
    "flex",
    "flexDirection",
    "flexWrap",
    "flexGrow",
    "flexShrink",
    "flexBasis",
    "alignItems",
    "alignSelf",
    "alignContent",
    "justifyContent",
    "gap",
    "rowGap",
    "columnGap",
    // Sizing
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    // Spacing
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "paddingHorizontal",
    "paddingVertical",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "marginHorizontal",
    "marginVertical",
    // Position
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "zIndex",
    // Border
    "borderWidth",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderStyle",
    "borderRadius",
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomLeftRadius",
    "borderBottomRightRadius",
    // Background
    "backgroundColor",
    "opacity",
    // Text
    "color",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textDecorationLine",
    "textTransform",
    "whiteSpace",
    "wordBreak",
    "textOverflow",
    // Overflow
    "overflow",
    "overflowX",
    "overflowY",
    // Shadow
    "boxShadow",
    // Cursor / interaction
    "cursor",
    "pointerEvents",
    "userSelect",
    // Transform
    "transform",
    "transformOrigin",
    "transition",
    // Outline
    "outlineColor",
    "outlineStyle",
    "outlineWidth",
    "outlineOffset"
  ]);
  const shorthandNames = new Set(Object.keys(shorthandMap));
  function expandShorthand(key, value) {
    const mapped = shorthandMap[key];
    if (!mapped) return [[key, value]];
    if (Array.isArray(mapped)) {
      return mapped.map((prop) => [prop, value]);
    }
    return [[mapped, value]];
  }
  function isStyleProp(key) {
    return stylePropertyNames.has(key) || shorthandNames.has(key);
  }
  function isPseudoProp(key) {
    return key === "hoverStyle" || key === "pressStyle" || key === "focusStyle" || key === "focusVisibleStyle" || key === "disabledStyle";
  }
  function isMediaProp(key) {
    return key.startsWith("$") && key.length > 1;
  }
  function formatCSSValue(property, value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") {
      const unitless = /* @__PURE__ */ new Set([
        "flex",
        "flexGrow",
        "flexShrink",
        "opacity",
        "zIndex",
        "fontWeight",
        "lineHeight",
        "order"
      ]);
      if (unitless.has(property)) return String(value);
      return value === 0 ? "0" : `${value}px`;
    }
    return String(value);
  }
  const injectedClasses = /* @__PURE__ */ new Set();
  let styleElement = null;
  function getStyleElement() {
    if (typeof document === "undefined") return null;
    if (styleElement) return styleElement;
    styleElement = document.createElement("style");
    styleElement.id = "jam-ui-styles";
    document.head.appendChild(styleElement);
    return styleElement;
  }
  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i) | 0;
    }
    return (hash >>> 0).toString(36);
  }
  function generateClassName(styles) {
    const sorted = Object.entries(styles).sort(([a], [b]) => a.localeCompare(b));
    const key = sorted.map(([k, v]) => `${k}:${v}`).join(";");
    return `_jui_${hashString(key)}`;
  }
  function stylesToCSS(styles) {
    const css = {};
    for (const [prop, value] of Object.entries(styles)) {
      if (value == null || value === void 0) continue;
      const cssValue = formatCSSValue(prop, value);
      if (cssValue === "") continue;
      css[camelToKebab(prop)] = cssValue;
    }
    return css;
  }
  function injectStyleRule(className, cssProperties) {
    if (injectedClasses.has(className)) return;
    injectedClasses.add(className);
    const el = getStyleElement();
    if (!el) return;
    const declarations = Object.entries(cssProperties).map(([k, v]) => `${k}: ${v}`).join("; ");
    el.sheet?.insertRule(`.${className} { ${declarations} }`, el.sheet.cssRules.length);
  }
  function injectPseudoRule(className, pseudo, cssProperties) {
    const key = `${className}:${pseudo}`;
    if (injectedClasses.has(key)) return;
    injectedClasses.add(key);
    const el = getStyleElement();
    if (!el) return;
    const declarations = Object.entries(cssProperties).map(([k, v]) => `${k}: ${v}`).join("; ");
    el.sheet?.insertRule(
      `.${className}:${pseudo} { ${declarations} }`,
      el.sheet.cssRules.length
    );
  }
  function clearInjectedStyles() {
    injectedClasses.clear();
    if (styleElement) {
      styleElement.remove();
      styleElement = null;
    }
  }
  function resolveValue(prop, value) {
    if (typeof value !== "string") return value;
    if (isTokenRef(value)) {
      const resolved = resolveTokenValue(value);
      return resolved !== void 0 ? resolved : value;
    }
    if (isThemeRef(value)) {
      const resolved = resolveThemeValue(value);
      return resolved !== void 0 ? resolved : value;
    }
    return value;
  }
  function processStyles(styles) {
    const result = {};
    for (const [key, value] of Object.entries(styles)) {
      if (value == null) continue;
      const expanded = expandShorthand(key, value);
      for (const [prop, val] of expanded) {
        result[prop] = resolveValue(prop, val);
      }
    }
    return result;
  }
  const pseudoToCSSMap = {
    hoverStyle: "hover",
    pressStyle: "active",
    focusStyle: "focus",
    focusVisibleStyle: "focus-visible",
    disabledStyle: "disabled"
  };
  function styled(base, config = {}) {
    const component = (props) => {
      const styleAccum = {};
      const pseudoAccum = {};
      const passthrough = {};
      const children = [];
      if (config.defaultProps) {
        for (const [key, value] of Object.entries(config.defaultProps)) {
          if (isStyleProp(key)) {
            const expanded = expandShorthand(key, value);
            for (const [prop, val] of expanded) {
              styleAccum[prop] = val;
            }
          } else if (isPseudoProp(key)) {
            pseudoAccum[key] = value;
          } else {
            passthrough[key] = value;
          }
        }
      }
      if (config.variants) {
        for (const [variantName, variantOptions] of Object.entries(config.variants)) {
          const variantValue = props[variantName] ?? config.defaultVariants?.[variantName];
          if (variantValue != null && variantOptions[variantValue]) {
            const variantStyles = variantOptions[variantValue];
            for (const [key, value] of Object.entries(variantStyles)) {
              if (isStyleProp(key)) {
                const expanded = expandShorthand(key, value);
                for (const [prop, val] of expanded) {
                  styleAccum[prop] = val;
                }
              } else if (isPseudoProp(key)) {
                pseudoAccum[key] = {
                  ...pseudoAccum[key] || {},
                  ...value
                };
              } else {
                passthrough[key] = value;
              }
            }
          }
        }
      }
      const media = useMedia();
      for (const [key, value] of Object.entries(props)) {
        if (key === "children") {
          if (Array.isArray(value)) {
            children.push(...value);
          } else {
            children.push(value);
          }
        } else if (isMediaProp(key)) {
          const breakpoint = key.slice(1);
          if (media[breakpoint]) {
            const mediaStyles = value;
            for (const [mk, mv] of Object.entries(mediaStyles)) {
              if (isStyleProp(mk)) {
                const expanded = expandShorthand(mk, mv);
                for (const [prop, val] of expanded) {
                  styleAccum[prop] = val;
                }
              }
            }
          }
        } else if (isPseudoProp(key)) {
          pseudoAccum[key] = {
            ...pseudoAccum[key] || {},
            ...value
          };
        } else if (isStyleProp(key)) {
          const expanded = expandShorthand(key, value);
          for (const [prop, val] of expanded) {
            styleAccum[prop] = val;
          }
        } else if (config.variants && key in config.variants) ;
        else {
          passthrough[key] = value;
        }
      }
      const resolvedStyles = processStyles(styleAccum);
      if (isNativeMode()) {
        passthrough.__nativeStyles = resolvedStyles;
        passthrough.__nativeTag = component.displayName || (typeof base === "string" ? base : "View");
        for (const [pseudoKey, pseudoStyles] of Object.entries(pseudoAccum)) {
          if (pseudoStyles) {
            passthrough[`__native_${pseudoKey}`] = processStyles(pseudoStyles);
          }
        }
        if (typeof base === "string") {
          return h(base, passthrough, ...children);
        } else {
          return base({ ...passthrough, children: children.length === 1 ? children[0] : children });
        }
      }
      const cssProps = stylesToCSS(resolvedStyles);
      let classNames = [];
      if (Object.keys(cssProps).length > 0) {
        const className = generateClassName(cssProps);
        injectStyleRule(className, cssProps);
        classNames.push(className);
      }
      const baseClassName = classNames[0];
      for (const [pseudoKey, pseudoStyles] of Object.entries(pseudoAccum)) {
        const cssPseudo = pseudoToCSSMap[pseudoKey];
        if (!cssPseudo || !pseudoStyles) continue;
        const resolvedPseudo = processStyles(pseudoStyles);
        const pseudoCSSProps = stylesToCSS(resolvedPseudo);
        if (Object.keys(pseudoCSSProps).length > 0) {
          const pseudoBaseClass = baseClassName || generateClassName({
            __pseudo_anchor: "true"
          });
          if (!baseClassName) {
            injectStyleRule(pseudoBaseClass, {});
            classNames.push(pseudoBaseClass);
          }
          injectPseudoRule(pseudoBaseClass, cssPseudo, pseudoCSSProps);
        }
      }
      if (passthrough.class) {
        classNames = [String(passthrough.class), ...classNames];
        delete passthrough.class;
      }
      if (classNames.length > 0) {
        passthrough.class = classNames.join(" ");
      }
      if (typeof base === "string") {
        return h(base, passthrough, ...children);
      } else {
        return base({ ...passthrough, children: children.length === 1 ? children[0] : children });
      }
    };
    component.displayName = config.name || (typeof base === "string" ? `Styled(${base})` : `Styled(${base.displayName || "Component"})`);
    return component;
  }
  const Stack = styled("div", {
    name: "Stack",
    defaultProps: {
      display: "flex"
    }
  });
  const XStack = styled("div", {
    name: "XStack",
    defaultProps: {
      display: "flex",
      flexDirection: "row"
    }
  });
  const YStack = styled("div", {
    name: "YStack",
    defaultProps: {
      display: "flex",
      flexDirection: "column"
    }
  });
  const ZStack = styled("div", {
    name: "ZStack",
    defaultProps: {
      display: "flex",
      position: "relative"
    }
  });
  const Spacer = styled("div", {
    name: "Spacer",
    defaultProps: {
      flex: 1,
      alignSelf: "stretch"
    },
    variants: {
      size: {
        "1": { flex: 0, width: 5, height: 5 },
        "2": { flex: 0, width: 10, height: 10 },
        "3": { flex: 0, width: 15, height: 15 },
        "4": { flex: 0, width: 20, height: 20 },
        "5": { flex: 0, width: 25, height: 25 },
        "6": { flex: 0, width: 30, height: 30 },
        "7": { flex: 0, width: 35, height: 35 },
        "8": { flex: 0, width: 40, height: 40 }
      }
    }
  });
  const Separator = styled("div", {
    name: "Separator",
    defaultProps: {
      borderColor: "$borderColor",
      borderBottomWidth: 1,
      borderStyle: "solid",
      alignSelf: "stretch",
      flexShrink: 0,
      width: "100%",
      height: 0
    },
    variants: {
      vertical: {
        true: {
          width: 0,
          height: "auto",
          borderBottomWidth: 0,
          borderRightWidth: 1,
          alignSelf: "stretch"
        }
      }
    }
  });
  const ScrollView = styled("div", {
    name: "ScrollView",
    defaultProps: {
      overflow: "auto",
      display: "flex",
      flexDirection: "column"
    },
    variants: {
      horizontal: {
        true: {
          flexDirection: "row",
          overflowX: "auto",
          overflowY: "hidden"
        }
      }
    }
  });
  const Group = styled("div", {
    name: "Group",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      overflow: "hidden"
    },
    variants: {
      orientation: {
        horizontal: { flexDirection: "row" },
        vertical: { flexDirection: "column" }
      },
      size: {
        "1": { borderRadius: "$radius.1" },
        "2": { borderRadius: "$radius.2" },
        "3": { borderRadius: "$radius.3" },
        "4": { borderRadius: "$radius.4" }
      }
    },
    defaultVariants: {
      orientation: "horizontal"
    }
  });
  const XGroup = styled("div", {
    name: "XGroup",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      overflow: "hidden"
    }
  });
  const YGroup = styled("div", {
    name: "YGroup",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  });
  const Text$1 = styled("span", {
    name: "Text"
  });
  function SizableText(props) {
    const { size, fontFamily: fontFamilyProp, children, ...rest } = props;
    const sizeKey = size != null ? String(size) : "4";
    const fontName = fontFamilyProp?.startsWith("$") ? fontFamilyProp.slice(1) : "body";
    const fontStyles = getFontSized(fontName, sizeKey);
    const mergedProps = { ...rest };
    if (fontStyles.fontFamily) mergedProps.fontFamily = fontStyles.fontFamily;
    if (fontStyles.fontSize) mergedProps.fontSize = fontStyles.fontSize;
    if (fontStyles.lineHeight) mergedProps.lineHeight = fontStyles.lineHeight;
    if (fontStyles.fontWeight) mergedProps.fontWeight = fontStyles.fontWeight;
    if (fontStyles.letterSpacing) mergedProps.letterSpacing = fontStyles.letterSpacing;
    if (props.fontSize != null) mergedProps.fontSize = props.fontSize;
    if (props.fontWeight != null) mergedProps.fontWeight = props.fontWeight;
    if (props.lineHeight != null) mergedProps.lineHeight = props.lineHeight;
    if (props.letterSpacing != null) mergedProps.letterSpacing = props.letterSpacing;
    mergedProps.children = children;
    return Text$1(mergedProps);
  }
  SizableText.displayName = "SizableText";
  const Paragraph = styled("p", {
    name: "Paragraph"
  });
  const Heading = styled("h2", {
    name: "Heading",
    defaultProps: {
      fontWeight: "700"
    }
  });
  const H1 = styled("h1", { name: "H1", defaultProps: { fontWeight: "700" } });
  const H2 = styled("h2", { name: "H2", defaultProps: { fontWeight: "700" } });
  const H3 = styled("h3", { name: "H3", defaultProps: { fontWeight: "600" } });
  const H4 = styled("h4", { name: "H4", defaultProps: { fontWeight: "600" } });
  const H5 = styled("h5", { name: "H5", defaultProps: { fontWeight: "500" } });
  const H6 = styled("h6", { name: "H6", defaultProps: { fontWeight: "500" } });
  const Square = styled("div", {
    name: "Square",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    variants: {
      size: {
        "1": { width: 20, height: 20 },
        "2": { width: 30, height: 30 },
        "3": { width: 40, height: 40 },
        "4": { width: 50, height: 50 },
        "5": { width: 60, height: 60 },
        "6": { width: 80, height: 80 },
        "7": { width: 100, height: 100 },
        "8": { width: 120, height: 120 }
      }
    }
  });
  const Circle = styled("div", {
    name: "Circle",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 1e5
    },
    variants: {
      size: {
        "1": { width: 20, height: 20 },
        "2": { width: 30, height: 30 },
        "3": { width: 40, height: 40 },
        "4": { width: 50, height: 50 },
        "5": { width: 60, height: 60 },
        "6": { width: 80, height: 80 },
        "7": { width: 100, height: 100 },
        "8": { width: 120, height: 120 }
      }
    }
  });
  const Button = styled("button", {
    name: "Button",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      cursor: "pointer",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      backgroundColor: "$background",
      color: "$color",
      borderRadius: "$radius.3",
      fontWeight: "600",
      userSelect: "none",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      },
      pressStyle: {
        backgroundColor: "$backgroundPress"
      },
      focusVisibleStyle: {
        outlineWidth: 2,
        outlineStyle: "solid",
        outlineColor: "$outlineColor",
        outlineOffset: 2
      },
      disabledStyle: {
        opacity: 0.5,
        cursor: "not-allowed"
      }
    },
    variants: {
      size: {
        "1": { paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, height: 28 },
        "2": { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, height: 32 },
        "3": { paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, height: 36 },
        "4": { paddingHorizontal: 20, paddingVertical: 10, fontSize: 16, height: 44 },
        "5": { paddingHorizontal: 24, paddingVertical: 12, fontSize: 18, height: 52 }
      },
      variant: {
        outlined: {
          backgroundColor: "transparent",
          borderWidth: 1,
          hoverStyle: { backgroundColor: "$backgroundHover" }
        },
        ghost: {
          backgroundColor: "transparent",
          borderWidth: 0,
          hoverStyle: { backgroundColor: "$backgroundHover" }
        }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  Button.Text = styled("span", {
    name: "ButtonText",
    defaultProps: {
      color: "$color"
    }
  });
  Button.Icon = styled("span", {
    name: "ButtonIcon",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });
  const Input = styled("input", {
    name: "Input",
    defaultProps: {
      display: "flex",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      backgroundColor: "$background",
      color: "$color",
      borderRadius: "$radius.3",
      fontFamily: "inherit",
      width: "100%",
      focusStyle: {
        borderColor: "$borderColorFocus",
        outlineWidth: 2,
        outlineStyle: "solid",
        outlineColor: "$outlineColor",
        outlineOffset: -1
      },
      disabledStyle: {
        opacity: 0.5,
        cursor: "not-allowed"
      }
    },
    variants: {
      size: {
        "1": { paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, height: 28 },
        "2": { paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, height: 32 },
        "3": { paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, height: 36 },
        "4": { paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, height: 44 }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  const TextArea = styled("textarea", {
    name: "TextArea",
    defaultProps: {
      display: "flex",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      backgroundColor: "$background",
      color: "$color",
      borderRadius: "$radius.3",
      fontFamily: "inherit",
      width: "100%",
      minHeight: 80,
      focusStyle: {
        borderColor: "$borderColorFocus",
        outlineWidth: 2,
        outlineStyle: "solid",
        outlineColor: "$outlineColor",
        outlineOffset: -1
      },
      disabledStyle: {
        opacity: 0.5,
        cursor: "not-allowed"
      }
    },
    variants: {
      size: {
        "1": { padding: 6, fontSize: 12 },
        "2": { padding: 8, fontSize: 13 },
        "3": { padding: 12, fontSize: 14 },
        "4": { padding: 16, fontSize: 16 }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  function Checkbox(props) {
    const {
      checked,
      onCheckedChange,
      disabled = false,
      size = "3",
      children,
      ...rest
    } = props;
    const sizeMap = {
      "1": 16,
      "2": 20,
      "3": 24,
      "4": 28,
      "5": 32
    };
    const dim = sizeMap[size] ?? 24;
    return CheckboxFrame({
      ...rest,
      role: "checkbox",
      "aria-checked": checked ? "true" : "false",
      "aria-disabled": disabled ? "true" : void 0,
      width: dim,
      height: dim,
      onClick: disabled ? void 0 : () => onCheckedChange?.(!checked),
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      children: checked ? children : void 0
    });
  }
  Checkbox.displayName = "Checkbox";
  const CheckboxFrame = styled("div", {
    name: "CheckboxFrame",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.2",
      backgroundColor: "$background",
      userSelect: "none",
      hoverStyle: {
        borderColor: "$borderColorHover"
      }
    }
  });
  Checkbox.Indicator = styled("span", {
    name: "CheckboxIndicator",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "$color"
    }
  });
  function Switch(props) {
    const {
      checked = false,
      onCheckedChange,
      disabled = false,
      size = "3",
      children,
      ...rest
    } = props;
    const sizeMap = {
      "1": { w: 28, h: 16, thumb: 12 },
      "2": { w: 36, h: 20, thumb: 16 },
      "3": { w: 44, h: 24, thumb: 20 },
      "4": { w: 52, h: 28, thumb: 24 },
      "5": { w: 60, h: 32, thumb: 28 }
    };
    const dims = sizeMap[size] ?? sizeMap["3"];
    return SwitchFrame({
      ...rest,
      role: "switch",
      "aria-checked": checked ? "true" : "false",
      "aria-disabled": disabled ? "true" : void 0,
      width: dims.w,
      height: dims.h,
      backgroundColor: checked ? "$backgroundFocus" : "$borderColor",
      onClick: disabled ? void 0 : () => onCheckedChange?.(!checked),
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      children: children ?? h(Switch.Thumb, {
        width: dims.thumb,
        height: dims.thumb,
        transform: `translateX(${checked ? dims.w - dims.thumb - 4 : 2}px)`,
        transition: "transform 0.15s ease"
      })
    });
  }
  Switch.displayName = "Switch";
  const SwitchFrame = styled("div", {
    name: "SwitchFrame",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      borderRadius: 1e5,
      position: "relative",
      padding: 2,
      userSelect: "none",
      transition: "background-color 0.15s ease"
    }
  });
  Switch.Thumb = styled("div", {
    name: "SwitchThumb",
    defaultProps: {
      borderRadius: 1e5,
      backgroundColor: "white"
    }
  });
  function RadioGroup(props) {
    const {
      value,
      onValueChange,
      orientation = "vertical",
      disabled = false,
      children,
      ...rest
    } = props;
    return RadioGroupFrame({
      ...rest,
      role: "radiogroup",
      "aria-orientation": orientation,
      flexDirection: orientation === "horizontal" ? "row" : "column",
      children,
      // Pass context via data attributes (since we don't have React context)
      "data-value": value,
      "data-disabled": disabled ? "true" : void 0
    });
  }
  RadioGroup.displayName = "RadioGroup";
  const RadioGroupFrame = styled("div", {
    name: "RadioGroupFrame",
    defaultProps: {
      display: "flex",
      gap: 8
    }
  });
  const RadioGroupItem = function RadioGroupItem2(props) {
    const { value, disabled = false, children, onSelect, checked = false, ...rest } = props;
    return RadioItemFrame({
      ...rest,
      role: "radio",
      "aria-checked": checked ? "true" : "false",
      "aria-disabled": disabled ? "true" : void 0,
      onClick: disabled ? void 0 : () => onSelect?.(),
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      children
    });
  };
  RadioGroupItem.displayName = "RadioGroupItem";
  RadioGroup.Item = RadioGroupItem;
  const RadioItemFrame = styled("div", {
    name: "RadioItemFrame",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: 1e5,
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "$borderColor",
      backgroundColor: "$background",
      userSelect: "none",
      hoverStyle: {
        borderColor: "$borderColorHover"
      }
    }
  });
  RadioGroup.Indicator = styled("div", {
    name: "RadioGroupIndicator",
    defaultProps: {
      width: 10,
      height: 10,
      borderRadius: 1e5,
      backgroundColor: "$color"
    }
  });
  function Slider(props) {
    const {
      value = [0],
      min = 0,
      max = 100,
      step = 1,
      orientation = "horizontal",
      onValueChange,
      disabled = false,
      size = "3",
      children,
      ...rest
    } = props;
    return SliderFrame({
      ...rest,
      role: "slider",
      "aria-valuemin": String(min),
      "aria-valuemax": String(max),
      "aria-valuenow": String(value[0]),
      "aria-orientation": orientation,
      "aria-disabled": disabled ? "true" : void 0,
      "data-orientation": orientation,
      flexDirection: orientation === "horizontal" ? "row" : "column",
      children
    });
  }
  Slider.displayName = "Slider";
  const SliderFrame = styled("div", {
    name: "SliderFrame",
    defaultProps: {
      display: "flex",
      position: "relative",
      alignItems: "center",
      width: "100%",
      userSelect: "none"
    }
  });
  Slider.Track = styled("div", {
    name: "SliderTrack",
    defaultProps: {
      display: "flex",
      position: "relative",
      flexGrow: 1,
      height: 4,
      borderRadius: 1e5,
      backgroundColor: "$borderColor",
      overflow: "hidden"
    }
  });
  Slider.TrackActive = styled("div", {
    name: "SliderTrackActive",
    defaultProps: {
      position: "absolute",
      top: 0,
      left: 0,
      height: "100%",
      backgroundColor: "$color",
      borderRadius: 1e5
    }
  });
  Slider.Thumb = styled("div", {
    name: "SliderThumb",
    defaultProps: {
      display: "flex",
      position: "absolute",
      width: 20,
      height: 20,
      borderRadius: 1e5,
      backgroundColor: "$background",
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "$color",
      cursor: "pointer",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  function Select(props) {
    const { value, onValueChange, disabled, children, ...rest } = props;
    return SelectFrame({
      ...rest,
      "data-value": value,
      "data-disabled": disabled ? "true" : void 0,
      children
    });
  }
  Select.displayName = "Select";
  const SelectFrame = styled("div", {
    name: "SelectFrame",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      position: "relative"
    }
  });
  Select.Trigger = styled("button", {
    name: "SelectTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      backgroundColor: "$background",
      color: "$color",
      cursor: "pointer",
      fontSize: 14,
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Select.Value = styled("span", {
    name: "SelectValue",
    defaultProps: {
      color: "$color"
    }
  });
  Select.Content = styled("div", {
    name: "SelectContent",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      marginTop: 4,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      backgroundColor: "$background",
      overflow: "hidden",
      zIndex: 50,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
    }
  });
  Select.Viewport = styled("div", {
    name: "SelectViewport",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      overflow: "auto",
      maxHeight: 300
    }
  });
  Select.Item = styled("div", {
    name: "SelectItem",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      cursor: "pointer",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Select.ItemText = styled("span", {
    name: "SelectItemText",
    defaultProps: {
      color: "$color",
      fontSize: 14
    }
  });
  Select.ItemIndicator = styled("span", {
    name: "SelectItemIndicator",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 16
    }
  });
  Select.Group = styled("div", {
    name: "SelectGroup",
    defaultProps: {
      display: "flex",
      flexDirection: "column"
    }
  });
  Select.Label = styled("span", {
    name: "SelectLabel",
    defaultProps: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      fontSize: 12,
      fontWeight: "600",
      color: "$color",
      opacity: 0.6
    }
  });
  const Label = styled("label", {
    name: "Label",
    defaultProps: {
      color: "$color",
      fontSize: 14,
      fontWeight: "500",
      cursor: "default",
      userSelect: "none"
    },
    variants: {
      size: {
        "1": { fontSize: 11 },
        "2": { fontSize: 12 },
        "3": { fontSize: 14 },
        "4": { fontSize: 16 },
        "5": { fontSize: 18 }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  const Form = styled("form", {
    name: "Form",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  });
  Form.Trigger = styled("button", {
    name: "FormTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: "$radius.3",
      backgroundColor: "$background",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: 14,
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  function ToggleGroup(props) {
    const {
      type = "single",
      orientation = "horizontal",
      disabled,
      children,
      ...rest
    } = props;
    return ToggleGroupFrame({
      ...rest,
      role: "group",
      "data-orientation": orientation,
      "data-disabled": disabled ? "true" : void 0,
      flexDirection: orientation === "horizontal" ? "row" : "column",
      children
    });
  }
  ToggleGroup.displayName = "ToggleGroup";
  const ToggleGroupFrame = styled("div", {
    name: "ToggleGroupFrame",
    defaultProps: {
      display: "flex",
      borderRadius: "$radius.3",
      overflow: "hidden",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor"
    }
  });
  ToggleGroup.Item = styled("button", {
    name: "ToggleGroupItem",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: "$background",
      color: "$color",
      cursor: "pointer",
      borderWidth: 0,
      fontSize: 14,
      fontWeight: "500",
      userSelect: "none",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      },
      pressStyle: {
        backgroundColor: "$backgroundPress"
      }
    }
  });
  function Portal(props) {
    const { container, children, ...rest } = props;
    if (typeof document === "undefined") {
      return children ?? null;
    }
    return h("div", {
      ...rest,
      "data-portal": "true",
      style: "display:none"
    });
  }
  Portal.displayName = "Portal";
  function Dialog(props) {
    const { open = false, onOpenChange, modal = true, children, ...rest } = props;
    return DialogFrame({
      ...rest,
      "data-state": open ? "open" : "closed",
      children
    });
  }
  Dialog.displayName = "Dialog";
  const DialogFrame = styled("div", {
    name: "DialogFrame",
    defaultProps: {
      display: "contents"
    }
  });
  Dialog.Trigger = styled("button", {
    name: "DialogTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "$background",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: "500",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  const DialogPortal = function DialogPortal2(props) {
    return h("div", { "data-dialog-portal": "true" }, ...Array.isArray(props.children) ? props.children : props.children ? [props.children] : []);
  };
  DialogPortal.displayName = "DialogPortal";
  Dialog.Portal = DialogPortal;
  Dialog.Overlay = styled("div", {
    name: "DialogOverlay",
    defaultProps: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 50
    }
  });
  Dialog.Content = styled("div", {
    name: "DialogContent",
    defaultProps: {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: 24,
      backgroundColor: "$background",
      borderRadius: "$radius.4",
      boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
      zIndex: 51,
      maxWidth: "90vw",
      maxHeight: "85vh",
      overflow: "auto"
    }
  });
  Dialog.Title = styled("h2", {
    name: "DialogTitle",
    defaultProps: {
      fontSize: 18,
      fontWeight: "600",
      color: "$color",
      margin: 0
    }
  });
  Dialog.Description = styled("p", {
    name: "DialogDescription",
    defaultProps: {
      fontSize: 14,
      color: "$color",
      opacity: 0.7,
      margin: 0,
      lineHeight: 1.5
    }
  });
  Dialog.Close = styled("button", {
    name: "DialogClose",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "transparent",
      borderWidth: 0,
      color: "$color",
      padding: 4,
      borderRadius: "$radius.2",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  function Sheet(props) {
    const {
      open = false,
      onOpenChange,
      modal,
      snapPoints,
      position,
      onPositionChange,
      dismissOnSnapToBottom,
      children,
      ...rest
    } = props;
    if (!open) return null;
    return SheetFrame({
      ...rest,
      "data-state": open ? "open" : "closed",
      children
    });
  }
  Sheet.displayName = "Sheet";
  const SheetFrame = styled("div", {
    name: "SheetFrame",
    defaultProps: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end"
    }
  });
  Sheet.Overlay = styled("div", {
    name: "SheetOverlay",
    defaultProps: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 50
    }
  });
  Sheet.Frame = styled("div", {
    name: "SheetFrameContent",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      position: "relative",
      backgroundColor: "$background",
      borderTopLeftRadius: "$radius.5",
      borderTopRightRadius: "$radius.5",
      zIndex: 51,
      maxHeight: "85vh",
      overflow: "auto",
      padding: 16,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.15)"
    }
  });
  Sheet.Handle = styled("div", {
    name: "SheetHandle",
    defaultProps: {
      width: 40,
      height: 4,
      borderRadius: 1e5,
      backgroundColor: "$borderColor",
      alignSelf: "center",
      marginBottom: 8,
      opacity: 0.5
    }
  });
  Sheet.ScrollView = styled("div", {
    name: "SheetScrollView",
    defaultProps: {
      overflow: "auto",
      display: "flex",
      flexDirection: "column",
      flex: 1
    }
  });
  function AlertDialog(props) {
    const { open = false, onOpenChange, children, ...rest } = props;
    return AlertDialogFrame({
      ...rest,
      "data-state": open ? "open" : "closed",
      role: "alertdialog",
      children
    });
  }
  AlertDialog.displayName = "AlertDialog";
  const AlertDialogFrame = styled("div", {
    name: "AlertDialogFrame",
    defaultProps: {
      display: "contents"
    }
  });
  AlertDialog.Trigger = styled("button", {
    name: "AlertDialogTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "$background",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: "500",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  const AlertDialogPortal = function AlertDialogPortal2(props) {
    return h("div", { "data-alertdialog-portal": "true" }, ...Array.isArray(props.children) ? props.children : props.children ? [props.children] : []);
  };
  AlertDialogPortal.displayName = "AlertDialogPortal";
  AlertDialog.Portal = AlertDialogPortal;
  AlertDialog.Overlay = styled("div", {
    name: "AlertDialogOverlay",
    defaultProps: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 50
    }
  });
  AlertDialog.Content = styled("div", {
    name: "AlertDialogContent",
    defaultProps: {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: 24,
      backgroundColor: "$background",
      borderRadius: "$radius.4",
      boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
      zIndex: 51,
      maxWidth: 500
    }
  });
  AlertDialog.Title = styled("h2", {
    name: "AlertDialogTitle",
    defaultProps: {
      fontSize: 18,
      fontWeight: "600",
      color: "$color",
      margin: 0
    }
  });
  AlertDialog.Description = styled("p", {
    name: "AlertDialogDescription",
    defaultProps: {
      fontSize: 14,
      color: "$color",
      opacity: 0.7,
      margin: 0,
      lineHeight: 1.5
    }
  });
  AlertDialog.Cancel = styled("button", {
    name: "AlertDialogCancel",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "transparent",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: "500",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  AlertDialog.Action = styled("button", {
    name: "AlertDialogAction",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "$background",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      paddingHorizontal: 16,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: "600",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  function Popover(props) {
    const { open = false, onOpenChange, placement = "bottom", children, ...rest } = props;
    return PopoverFrame({
      ...rest,
      "data-state": open ? "open" : "closed",
      "data-placement": placement,
      children
    });
  }
  Popover.displayName = "Popover";
  const PopoverFrame = styled("div", {
    name: "PopoverFrame",
    defaultProps: {
      display: "inline-flex",
      position: "relative"
    }
  });
  Popover.Trigger = styled("button", {
    name: "PopoverTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "$background",
      color: "$color",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Popover.Content = styled("div", {
    name: "PopoverContent",
    defaultProps: {
      position: "absolute",
      top: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      marginTop: 8,
      display: "flex",
      flexDirection: "column",
      padding: 12,
      backgroundColor: "$background",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: 50,
      minWidth: 200
    }
  });
  Popover.Arrow = styled("div", {
    name: "PopoverArrow",
    defaultProps: {
      width: 10,
      height: 10,
      backgroundColor: "$background",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderBottomWidth: 0,
      borderRightWidth: 0,
      transform: "rotate(45deg)",
      position: "absolute",
      top: -6,
      left: "50%",
      marginLeft: -5
    }
  });
  Popover.Anchor = styled("div", {
    name: "PopoverAnchor",
    defaultProps: {
      display: "inline-flex"
    }
  });
  Popover.Close = styled("button", {
    name: "PopoverClose",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      backgroundColor: "transparent",
      borderWidth: 0,
      color: "$color",
      padding: 4,
      borderRadius: "$radius.2",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  const Card = styled("div", {
    name: "Card",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      backgroundColor: "$background",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.4"
    },
    variants: {
      size: {
        "1": { padding: 8 },
        "2": { padding: 12 },
        "3": { padding: 16 },
        "4": { padding: 20 },
        "5": { padding: 24 }
      },
      bordered: {
        false: { borderWidth: 0 }
      },
      elevated: {
        true: { boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  Card.Header = styled("div", {
    name: "CardHeader",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: 16
    }
  });
  Card.Footer = styled("div", {
    name: "CardFooter",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      gap: 8,
      padding: 16,
      justifyContent: "flex-end"
    }
  });
  Card.Background = styled("div", {
    name: "CardBackground",
    defaultProps: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 0,
      overflow: "hidden",
      borderRadius: "inherit"
    }
  });
  const Avatar = styled("div", {
    name: "Avatar",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: 1e5,
      backgroundColor: "$borderColor",
      userSelect: "none"
    },
    variants: {
      size: {
        "1": { width: 20, height: 20 },
        "2": { width: 28, height: 28 },
        "3": { width: 36, height: 36 },
        "4": { width: 44, height: 44 },
        "5": { width: 52, height: 52 },
        "6": { width: 64, height: 64 },
        "7": { width: 80, height: 80 },
        "8": { width: 100, height: 100 }
      }
    },
    defaultVariants: {
      size: "4"
    }
  });
  Avatar.Image = styled("img", {
    name: "AvatarImage",
    defaultProps: {
      width: "100%",
      height: "100%"
    }
  });
  Avatar.Fallback = styled("span", {
    name: "AvatarFallback",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      color: "$color",
      fontSize: 14,
      fontWeight: "500"
    }
  });
  const Image = styled("img", {
    name: "Image",
    defaultProps: {
      display: "block",
      maxWidth: "100%"
    },
    variants: {
      objectFit: {
        cover: {},
        contain: {},
        fill: {},
        none: {},
        "scale-down": {}
      }
    }
  });
  const ListItem = styled("div", {
    name: "ListItem",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: "$background",
      cursor: "pointer",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      },
      pressStyle: {
        backgroundColor: "$backgroundPress"
      }
    },
    variants: {
      size: {
        "1": { paddingVertical: 6, paddingHorizontal: 8, gap: 6, fontSize: 12 },
        "2": { paddingVertical: 8, paddingHorizontal: 12, gap: 8, fontSize: 13 },
        "3": { paddingVertical: 12, paddingHorizontal: 16, gap: 12, fontSize: 14 },
        "4": { paddingVertical: 16, paddingHorizontal: 20, gap: 16, fontSize: 16 }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  ListItem.Text = styled("span", {
    name: "ListItemText",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      gap: 2
    }
  });
  ListItem.Title = styled("span", {
    name: "ListItemTitle",
    defaultProps: {
      color: "$color",
      fontWeight: "500"
    }
  });
  ListItem.Subtitle = styled("span", {
    name: "ListItemSubtitle",
    defaultProps: {
      color: "$color",
      opacity: 0.6,
      fontSize: 12
    }
  });
  ListItem.Icon = styled("span", {
    name: "ListItemIcon",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });
  function Progress(props) {
    const { value = 0, max = 100, children, ...rest } = props;
    return ProgressFrame({
      ...rest,
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(max),
      "aria-valuenow": String(value),
      "data-value": String(value),
      "data-max": String(max),
      children
    });
  }
  Progress.displayName = "Progress";
  const ProgressFrame = styled("div", {
    name: "ProgressFrame",
    defaultProps: {
      display: "flex",
      position: "relative",
      overflow: "hidden",
      width: "100%",
      height: 8,
      borderRadius: 1e5,
      backgroundColor: "$borderColor"
    },
    variants: {
      size: {
        "1": { height: 4 },
        "2": { height: 6 },
        "3": { height: 8 },
        "4": { height: 12 },
        "5": { height: 16 }
      }
    },
    defaultVariants: {
      size: "3"
    }
  });
  Progress.Indicator = styled("div", {
    name: "ProgressIndicator",
    defaultProps: {
      height: "100%",
      backgroundColor: "$color",
      borderRadius: 1e5,
      transition: "width 0.3s ease"
    }
  });
  let spinnerKeyframesInjected = false;
  function injectSpinnerKeyframes() {
    if (spinnerKeyframesInjected || typeof document === "undefined") return;
    spinnerKeyframesInjected = true;
    const style = document.createElement("style");
    style.textContent = `@keyframes _jui_spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
  function Spinner(props) {
    injectSpinnerKeyframes();
    const { size = "3", color, ...rest } = props;
    const sizeMap = {
      "1": 16,
      "2": 20,
      "3": 24,
      "4": 32,
      "5": 40
    };
    const dim = sizeMap[size] ?? 24;
    return SpinnerFrame({
      ...rest,
      width: dim,
      height: dim,
      borderWidth: 2,
      borderColor: color || "$borderColor",
      borderTopColor: color || "$color"
    });
  }
  Spinner.displayName = "Spinner";
  const SpinnerFrame = styled("div", {
    name: "SpinnerFrame",
    defaultProps: {
      display: "inline-flex",
      borderRadius: 1e5,
      borderStyle: "solid"
      // Animation applied via inline style since we can't easily remember animation through the token system
    }
  });
  function Accordion(props) {
    const { type = "single", value, collapsible, disabled, children, ...rest } = props;
    return AccordionFrame({
      ...rest,
      "data-type": type,
      "data-disabled": disabled ? "true" : void 0,
      children
    });
  }
  Accordion.displayName = "Accordion";
  const AccordionFrame = styled("div", {
    name: "AccordionFrame",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      overflow: "hidden"
    }
  });
  Accordion.Item = styled("div", {
    name: "AccordionItem",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      borderBottomWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor"
    }
  });
  Accordion.Trigger = styled("button", {
    name: "AccordionTrigger",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      padding: 16,
      backgroundColor: "transparent",
      color: "$color",
      borderWidth: 0,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: "500",
      textAlign: "left",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Accordion.Content = styled("div", {
    name: "AccordionContent",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      padding: 16,
      paddingTop: 0,
      overflow: "hidden"
    }
  });
  function Tabs(props) {
    const { value, orientation = "horizontal", children, ...rest } = props;
    return TabsFrame({
      ...rest,
      "data-orientation": orientation,
      "data-value": value,
      children
    });
  }
  Tabs.displayName = "Tabs";
  const TabsFrame = styled("div", {
    name: "TabsFrame",
    defaultProps: {
      display: "flex",
      flexDirection: "column"
    }
  });
  Tabs.List = styled("div", {
    name: "TabsList",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      gap: 0,
      borderBottomWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor"
    }
  });
  Tabs.Tab = styled("button", {
    name: "TabsTab",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: "transparent",
      color: "$color",
      borderWidth: 0,
      borderBottomWidth: 2,
      borderStyle: "solid",
      borderColor: "transparent",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: "500",
      userSelect: "none",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Tabs.Content = styled("div", {
    name: "TabsContent",
    defaultProps: {
      display: "flex",
      flexDirection: "column",
      padding: 16
    }
  });
  function Toast(props) {
    const { open = false, onOpenChange, duration = 5e3, children, ...rest } = props;
    if (!open) return null;
    return ToastFrame({
      ...rest,
      role: "status",
      "aria-live": "polite",
      "data-state": "open",
      children
    });
  }
  Toast.displayName = "Toast";
  const ToastFrame = styled("div", {
    name: "ToastFrame",
    defaultProps: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      backgroundColor: "$background",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.3",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      minWidth: 200
    }
  });
  const ToastProvider = function ToastProvider2(props) {
    return h("div", { "data-toast-provider": "true" }, ...Array.isArray(props.children) ? props.children : props.children ? [props.children] : []);
  };
  ToastProvider.displayName = "ToastProvider";
  Toast.Provider = ToastProvider;
  Toast.Viewport = styled("div", {
    name: "ToastViewport",
    defaultProps: {
      position: "fixed",
      bottom: 16,
      right: 16,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 100,
      maxWidth: 400,
      pointerEvents: "none"
    }
  });
  Toast.Title = styled("span", {
    name: "ToastTitle",
    defaultProps: {
      fontWeight: "600",
      color: "$color",
      fontSize: 14
    }
  });
  Toast.Description = styled("span", {
    name: "ToastDescription",
    defaultProps: {
      color: "$color",
      opacity: 0.7,
      fontSize: 13
    }
  });
  Toast.Action = styled("button", {
    name: "ToastAction",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "$borderColor",
      borderRadius: "$radius.2",
      color: "$color",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: "500",
      hoverStyle: {
        backgroundColor: "$backgroundHover"
      }
    }
  });
  Toast.Close = styled("button", {
    name: "ToastClose",
    defaultProps: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
      borderWidth: 0,
      color: "$color",
      cursor: "pointer",
      padding: 4,
      marginLeft: "auto",
      borderRadius: "$radius.2",
      opacity: 0.5,
      hoverStyle: {
        opacity: 1
      }
    }
  });
  function Tooltip(props) {
    const { children, ...rest } = props;
    return TooltipFrame({
      ...rest,
      children
    });
  }
  Tooltip.displayName = "Tooltip";
  const TooltipFrame = styled("div", {
    name: "TooltipFrame",
    defaultProps: {
      display: "inline-flex",
      position: "relative"
    }
  });
  Tooltip.Trigger = styled("span", {
    name: "TooltipTrigger",
    defaultProps: {
      display: "inline-flex",
      cursor: "default"
    }
  });
  Tooltip.Content = styled("div", {
    name: "TooltipContent",
    defaultProps: {
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      marginBottom: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: "$color",
      color: "$background",
      borderRadius: "$radius.2",
      fontSize: 12,
      fontWeight: "500",
      whiteSpace: "nowrap",
      zIndex: 100,
      pointerEvents: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
    }
  });
  Tooltip.Arrow = styled("div", {
    name: "TooltipArrow",
    defaultProps: {
      width: 8,
      height: 8,
      backgroundColor: "$color",
      transform: "rotate(45deg)",
      position: "absolute",
      bottom: -4,
      left: "50%",
      marginLeft: -4
    }
  });
  const VisuallyHidden = styled("span", {
    name: "VisuallyHidden",
    defaultProps: {
      position: "absolute",
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: "hidden"
    }
  });
  const ui = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    Accordion,
    AlertDialog,
    Avatar,
    Button,
    Card,
    Checkbox,
    Circle,
    Dialog,
    Form,
    Group,
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
    Heading,
    Image,
    Input,
    Label,
    ListItem,
    Paragraph,
    Popover,
    Portal,
    Progress,
    RadioGroup,
    ScrollView,
    Select,
    Separator,
    Sheet,
    SizableText,
    Slider,
    Spacer,
    Spinner,
    Square,
    Stack,
    Switch,
    Tabs,
    Text: Text$1,
    TextArea,
    Toast,
    ToggleGroup,
    Tooltip,
    VisuallyHidden,
    XGroup,
    XStack,
    YGroup,
    YStack,
    ZStack,
    addTheme,
    camelToKebab,
    clearInjectedStyles,
    createFont,
    createJamUI,
    createMedia,
    createThemes,
    createTokens,
    defaultMediaConfig,
    disposeMedia,
    expandShorthand,
    formatCSSValue,
    generateClassName,
    getActiveThemeName,
    getFontSized,
    getThemeValues,
    getToken,
    injectThemeCSS,
    isMediaProp,
    isNativeMode,
    isPseudoProp,
    isStyleProp,
    isThemeRef,
    isTokenRef,
    resolveThemeValue,
    resolveTokenValue,
    setNativeMode,
    setTheme,
    styled,
    stylesToCSS,
    updateTheme,
    useMedia,
    useTheme
  }, Symbol.toStringTag, { value: "Module" }));
  setNativeMode(true);
  let factsChangedCallback = null;
  let observeDisposer = null;
  function startObserving() {
    if (observeDisposer) return;
    observeDisposer = autorun(() => {
      const allFacts = Array.from(db.facts.values());
      if (factsChangedCallback) {
        factsChangedCallback(JSON.stringify(allFacts));
      }
    });
  }
  function nativeMount(rootVnode, rootId = "dom") {
    const mountOwner = db.createChildOwner(db.getCurrentOwnerId(), "native-mount");
    const emitDisposer = reaction(
      () => {
        let vnode = rootVnode;
        if (typeof rootVnode === "object" && rootVnode !== null && "__vnode" in rootVnode) {
          const rn = rootVnode;
          if (typeof rn.tag === "function") {
            const propsWithChildren = rn.children.length > 0 ? { ...rn.props, children: rn.children.length === 1 ? rn.children[0] : rn.children } : rn.props;
            vnode = rn.tag(propsWithChildren);
          }
        }
        return vnode;
      },
      (vnode) => {
        runInAction(() => {
          db.revokeOwner(mountOwner);
          db.withOwnerScope(mountOwner, () => {
            db.emitCollector = /* @__PURE__ */ new Set();
            emitVdom(vnode, rootId, 0);
            db.emitCollector = null;
          });
        });
      },
      { fireImmediately: true, equals: () => false }
    );
    return () => {
      emitDisposer();
      runInAction(() => {
        db.revokeOwner(mountOwner);
      });
    };
  }
  function callNative(action2, params) {
    const nativeFn = globalThis.__callNative;
    if (!nativeFn) {
      console.warn(`callNative("${action2}"): __callNative not registered by Swift`);
      return void 0;
    }
    const paramsJson = params ? JSON.stringify(params) : void 0;
    const resultJson = nativeFn(action2, paramsJson);
    if (resultJson && typeof resultJson === "string") {
      try {
        return JSON.parse(resultJson);
      } catch {
        return resultJson;
      }
    }
    return resultJson;
  }
  const nativeProgramApi = {
    // Native bridge
    callNative,
    // All UI exports (createJamUI, styled, components, etc.)
    ...ui
  };
  globalThis.JamNative = {
    /**
     * Register the Swift callback for fact changes.
     * Swift calls this once on init, passing a function that receives JSON.
     */
    onFactsChanged(callback) {
      factsChangedCallback = callback;
      startObserving();
    },
    /**
     * Load and execute a Jam program (imperative style).
     * The program source has access to all Jam APIs via `with(jam)`.
     * Use this for programs that call remember/whenever directly.
     */
    loadProgram(id, source) {
      try {
        loadProgramSource(id, source, { api: nativeProgramApi });
        return "ok";
      } catch (e) {
        return `error: ${e.message}`;
      }
    },
    /**
     * Mount a program that returns a component tree (declarative style).
     * The source is executed as a program body. The last expression should be a
     * VNode or component function — use `loadProgram` for the setup code,
     * then `mountProgram` with just the final component expression.
     *
     * For multi-statement programs, use loadProgram() for setup and pass
     * just the component expression to mountProgram().
     */
    mountProgram(id, source, rootId) {
      try {
        registerProgram(id, (api) => {
          let result;
          try {
            const fn = new Function("jam", `with(jam) { return (${source}); }`);
            result = fn(api);
          } catch {
            const lines = source.trim().split("\n");
            const lastLine = lines.pop();
            const setup = lines.join("\n");
            const fn = new Function("jam", `with(jam) { ${setup}
 return (${lastLine}); }`);
            result = fn(api);
          }
          if (result && typeof result === "object" && "__vnode" in result) {
            return nativeMount(result, rootId || "dom");
          }
          if (typeof result === "function") {
            return nativeMount(h(result, {}), rootId || "dom");
          }
          return void 0;
        }, { api: nativeProgramApi });
        return "ok";
      } catch (e) {
        return `error: ${e.message}`;
      }
    },
    /**
     * Dispose a loaded program and forget its emitted facts.
     */
    disposeProgram(id) {
      removeProgram(id);
    },
    /**
     * Fire an event handler on an entity.
     * Called by Swift when user interacts with a rendered element.
     */
    fireEvent(entityId, eventName, data) {
      try {
        const refKey = `${entityId}:handler:${eventName}`;
        const handler = db.getRef(refKey);
        if (handler) {
          if (data !== void 0) {
            handler({ target: { value: data }, data });
          } else {
            handler({});
          }
          return "ok";
        }
        return "error: no handler found";
      } catch (e) {
        return `error: ${e.message}`;
      }
    },
    /**
     * Get current facts snapshot as JSON.
     */
    getCurrentFacts() {
      return JSON.stringify(Array.from(db.facts.values()));
    },
    /**
     * Assert a fact from Swift side.
     * @param termsJson — JSON array of terms, e.g. '["counter", "count", 0]'
     */
    assertFact(termsJson) {
      const terms = JSON.parse(termsJson);
      runInAction(() => remember(...terms));
    },
    /**
     * Retract a fact from Swift side.
     */
    removeFact(termsJson) {
      const terms = JSON.parse(termsJson);
      runInAction(() => forget(...terms));
    },
    /**
     * Replace the durable value for a fact prefix from Swift side.
     */
    setFact(termsJson) {
      const terms = JSON.parse(termsJson);
      runInAction(() => replace(...terms));
    }
  };
})();
