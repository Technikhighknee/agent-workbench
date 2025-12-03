import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PreviewService } from "../PreviewService.js";

import { registerPreviewEdit } from "./previewEdit.js";

export function registerAllTools(server: McpServer, service: PreviewService): void {
  registerPreviewEdit(server, service);
}
