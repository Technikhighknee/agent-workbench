/**
 * MCP tool registration for project package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectService } from "../core/ProjectService.js";

import { registerGetProjectInfo } from "./getProjectInfo.js";
import { registerGetScripts } from "./getScripts.js";
import { registerGetSessionGuide } from "./getSessionGuide.js";
import { registerGetQuickstart } from "./getQuickstart.js";
import { registerGetTechStack } from "./getTechStack.js";
import { registerGetStructure } from "./getStructure.js";

export interface Services {
  project: ProjectService;
}

/**
 * Register all project tools with an MCP server.
 */
export function registerAllTools(server: McpServer, services: Services): void {
  const { project } = services;

  // Session guide - call at start for tool usage guidance
  registerGetSessionGuide(server);

  // Project metadata operations
  registerGetProjectInfo(server, project);
  registerGetScripts(server, project);
  registerGetQuickstart(server, project);
  registerGetTechStack(server, project);
  registerGetStructure(server, project);
}

export * from "./types.js";
