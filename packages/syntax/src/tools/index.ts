import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { FileWatcher } from "../core/ports/FileWatcher.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import { registerAddImport } from "./addImport.js";
import { registerAnalyzeDeps } from "./analyzeDeps.js";
import { registerApplyEdits } from "./applyEdits.js";
import { registerBatchEditSymbols } from "./batchEditSymbols.js";
import { registerEditLines } from "./editLines.js";
import { registerEditSymbol } from "./editSymbol.js";
import { registerExtractFunction } from "./extractFunction.js";
import { registerFindDeadCode } from "./findDeadCode.js";
import { registerFindPaths } from "./findPaths.js";
import { registerFindReferences } from "./findReferences.js";
import { registerFindUnusedExports } from "./findUnusedExports.js";
import { registerGetCallees } from "./getCallees.js";
import { registerGetCallers } from "./getCallers.js";
import { registerGetExports } from "./getExports.js";
import { registerGetImports } from "./getImports.js";
import { registerInlineFunction } from "./inlineFunction.js";
import { registerListSymbols } from "./listSymbols.js";
import { registerMoveFile } from "./moveFile.js";
import { registerMoveSymbol } from "./moveSymbol.js";
import { registerOrganizeImports } from "./organizeImports.js";
import { registerReadSymbol } from "./readSymbol.js";
import { registerRemoveUnusedImports } from "./removeUnusedImports.js";
import { registerRenameSymbol } from "./renameSymbol.js";
import { registerSearchSymbols } from "./searchSymbols.js";
import { registerTrace } from "./trace.js";

export interface Services {
  syntax: SyntaxService;
  index: ProjectIndex;
  watcherFactory: () => FileWatcher;
}

export function registerAllTools(server: McpServer, services: Services): void {
  // File-level operations (SyntaxService)
  registerListSymbols(server, services.syntax);
  registerReadSymbol(server, services.syntax);
  registerEditSymbol(server, services.syntax);
  registerEditLines(server, services.syntax);
  registerGetImports(server, services.syntax);
  registerGetExports(server, services.syntax);

  // Import management (SyntaxService)
  registerAddImport(server, services.syntax);
  registerRemoveUnusedImports(server, services.syntax);
  registerOrganizeImports(server, services.syntax);

  // Project-level operations (ProjectIndex) - auto-indexed on startup
  registerSearchSymbols(server, services.index);
  registerFindReferences(server, services.index);
  registerGetCallers(server, services.index);
  registerGetCallees(server, services.index);
  registerAnalyzeDeps(server, services.index);

  // Cross-service operations
  registerRenameSymbol(server, services.index, services.syntax);
  registerMoveFile(server, services.index, services.syntax);
  registerMoveSymbol(server, services.index, services.syntax);
  registerFindUnusedExports(server, services.index, services.syntax);

  // Refactoring tools (SyntaxService only)
  registerExtractFunction(server, services.syntax);

  // Refactoring tools (requires both index and syntax)
  registerInlineFunction(server, services.index, services.syntax);

  // Multi-file operations (SyntaxService only)
  registerApplyEdits(server, services.syntax);
  registerBatchEditSymbols(server, services.syntax);

  // Call graph operations (ProjectIndex)
  registerTrace(server, services.index);
  registerFindPaths(server, services.index);
  registerFindDeadCode(server, services.index);
}

export * from "./types.js";
export * from "./schemas.js";
