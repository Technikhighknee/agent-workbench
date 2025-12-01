/**
 * MCP tool registration for project package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectService } from "../core/ProjectService.js";

import { registerGetProjectInfo } from "./getProjectInfo.js";
import { registerGetScripts } from "./getScripts.js";
import { registerGetDependencies } from "./getDependencies.js";
import { registerFindConfigs } from "./findConfigs.js";
import { registerReadConfig } from "./readConfig.js";
import { registerGetSessionGuide } from "./getSessionGuide.js";
import { registerGetQuickstart } from "./getQuickstart.js";
import { registerGetTechStack } from "./getTechStack.js";
import { registerGetStructure } from "./getStructure.js";

/**
 * Register all project tools with an MCP server.
 */
export function registerTools(server: McpServer, projectRoot: string): void {
  const service = new ProjectService(projectRoot);

  // Session guide - call at start for tool usage guidance
  registerGetSessionGuide(server);

  registerGetProjectInfo(server, service);
  registerGetScripts(server, service);
  registerGetDependencies(server, service);
  registerFindConfigs(server, service);
  registerReadConfig(server, service);
  registerGetQuickstart(server, service);
  registerGetTechStack(server, service);
  registerGetStructure(server, service);
}

export * from "./types.js";
