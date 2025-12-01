/**
 * MCP tool registration for project package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectService } from "../core/ProjectService.js";

import { getProjectInfo, getProjectInfoSchema } from "./getProjectInfo.js";
import { getScripts, getScriptsSchema } from "./getScripts.js";
import {
  getDependencies,
  getDependenciesSchema,
} from "./getDependencies.js";
import { findConfigs, findConfigsSchema } from "./findConfigs.js";
import { readConfig, readConfigSchema } from "./readConfig.js";

/**
 * Register all project tools with an MCP server.
 */
export function registerTools(server: McpServer, projectRoot: string): void {
  const service = new ProjectService(projectRoot);

  server.tool(
    "get_project_info",
    "Get basic project information - name, type, version, available scripts",
    getProjectInfoSchema.shape,
    async () => {
      const result = await getProjectInfo(service);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "get_scripts",
    "Get available scripts/commands that can be run in this project",
    getScriptsSchema.shape,
    async () => {
      const result = await getScripts(service);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "get_dependencies",
    "Get project dependencies (production, development, or all)",
    getDependenciesSchema.shape,
    async (input) => {
      const result = await getDependencies(
        service,
        getDependenciesSchema.parse(input)
      );
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "find_configs",
    "Find configuration files in the project (tsconfig, eslint, prettier, etc.)",
    findConfigsSchema.shape,
    async () => {
      const result = await findConfigs(service);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "read_config",
    "Read content of a specific configuration file",
    readConfigSchema.shape,
    async (input) => {
      const result = await readConfig(service, readConfigSchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );
}
