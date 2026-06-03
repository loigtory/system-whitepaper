/**
 * @cursor/sdk uses explicit resource management (using / Symbol.dispose).
 * Node < 22 does not define these symbols; install a minimal polyfill before SDK import.
 */
function ensureDisposeSymbols() {
  if (typeof Symbol.dispose === "undefined") {
    Object.defineProperty(Symbol, "dispose", {
      value: Symbol("Symbol.dispose"),
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  if (typeof Symbol.asyncDispose === "undefined") {
    Object.defineProperty(Symbol, "asyncDispose", {
      value: Symbol("Symbol.asyncDispose"),
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
}

function assertCursorSdkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] || 0);
  if (major < 18) {
    throw new Error(
      `Node ${process.versions.node} is too old for @cursor/sdk. Use Node 18+ (recommended 22+).`,
    );
  }
  if (major < 22) {
    ensureDisposeSymbols();
  }
}

module.exports = {
  assertCursorSdkNodeVersion,
  ensureDisposeSymbols,
};
