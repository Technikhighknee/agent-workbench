import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProcessService } from "../core/services/ProcessService.js";
import type { ToolRegistrar } from "./types.js";

import { registerRunProcess } from "./runProcess.js";
import { registerSpawnProcess } from "./spawnProcess.js";
import { registerGetLogs } from "./getLogs.js";
import { registerStopProcess } from "./stopProcess.js";
import { registerWriteStdin } from "./writeStdin.js";
import { registerListProcesses } from "./listProcesses.js";
import { registerGetProcess } from "./getProcess.js";
import { registerRestartProcess } from "./restartProcess.js";
import { registerPurgeProcesses } from "./purgeProcesses.js";
import { registerStopAllProcesses } from "./stopAllProcesses.js";
import { registerSendSignal } from "./sendSignal.js";
import { registerSearchLogs } from "./searchLogs.js";
import { registerGetStats } from "./getStats.js";
import { registerWaitForPattern } from "./waitForPattern.js";

const allTools: ToolRegistrar[] = [
  registerRunProcess,
  registerSpawnProcess,
  registerGetLogs,
  registerStopProcess,
  registerWriteStdin,
  registerListProcesses,
  registerGetProcess,
  registerRestartProcess,
  registerPurgeProcesses,
  registerStopAllProcesses,
  registerSendSignal,
  registerSearchLogs,
  registerGetStats,
  registerWaitForPattern,
];

export function registerAllTools(server: McpServer, service: ProcessService): void {
  for (const register of allTools) {
    register(server, service);
  }
}

export * from "./types.js";
export * from "./schemas.js";
