import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";

import { registerListSymbols } from "./listSymbols.js";
import { registerReadSymbol } from "./readSymbol.js";
import { registerEditSymbol } from "./editSymbol.js";
import { registerEditLines } from "./editLines.js";
import { registerIndexProject } from "./indexProject.js";
import { registerSearchSymbols } from "./searchSymbols.js";
import { registerFindReferences } from "./findReferences.js";
import { registerRenameSymbol } from "./renameSymbol.js";

export interface Services {
  syntax: SyntaxService;
  index: ProjectIndex;
}

export function registerAllTools(server: McpServer, services: Services): void {
  // File-level operations (SyntaxService)
  registerListSymbols(server, services.syntax);
  registerReadSymbol(server, services.syntax);
  registerEditSymbol(server, services.syntax);
  registerEditLines(server, services.syntax);

  // Project-level operations (ProjectIndex)
  registerIndexProject(server, services.index);
  registerSearchSymbols(server, services.index);
  registerFindReferences(server, services.index);

  // Cross-service operations
  registerRenameSymbol(server, services.index, services.syntax);
}

export * from "./types.js";
export * from "./schemas.js";
