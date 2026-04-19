// Native mode flag — when enabled, styled() emits resolved style values
// as facts instead of generating CSS classes. This allows a native renderer
// (e.g. SwiftUI) to read style properties directly from the fact database.

let _nativeMode = false;

export function setNativeMode(enabled: boolean): void {
  _nativeMode = enabled;
}

export function isNativeMode(): boolean {
  return _nativeMode;
}
