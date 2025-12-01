import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeService } from "../core/ports/TypeService.js";

import { registerGetDiagnostics } from "./getDiagnostics.js";
import { registerGetTypeAtPosition } from "./getTypeAtPosition.js";
import { registerGoToDefinition } from "./goToDefinition.js";
import { registerFindReferences } from "./findReferences.js";
import { registerGetQuickFixes } from "./getQuickFixes.js";
import { registerNotifyFileChanged } from "./notifyFileChanged.js";
import { registerReload } from "./reload.js";

export interface Services {
  types: TypeService;
}

export function registerAllTools(server: McpServer, services: Services): void {
  const { types } = services;

  // Core type operations
  registerGetDiagnostics(server, types);
  registerGetTypeAtPosition(server, types);
  registerGoToDefinition(server, types);
  registerFindReferences(server, types);
  registerGetQuickFixes(server, types);
  registerNotifyFileChanged(server, types);
  registerReload(server, types);
}

export * from "./types.js";
export * from "./schemas.js";
