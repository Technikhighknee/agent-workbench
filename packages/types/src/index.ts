// New simplified TypeChecker
export { TypeChecker } from "./TypeChecker.js";
export type { Diagnostic, TypeInfo, Definition, QuickFix } from "./TypeChecker.js";

// Legacy exports (for backward compatibility)
export { TypeScriptService } from "./infrastructure/typescript/TypeScriptService.js";
export * from "./core/index.js";
export * from "./core/ports/index.js";
