import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ProcessService } from "./core/services/ProcessService.js";
import { SQLiteProcessRepository } from "./infrastructure/sqlite/SQLiteProcessRepository.js";
import { SQLiteLogRepository } from "./infrastructure/sqlite/SQLiteLogRepository.js";
import { NodeProcessSpawner } from "./infrastructure/runner/NodeProcessSpawner.js";
import { getDb } from "./infrastructure/sqlite/SQLiteDb.js";
import { registerAllTools } from "./tools/index.js";

interface ServerConfig {
  name: string;
  version: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "agent-workbench:process-host",
  version: "0.3.0",
};

function createService(): ProcessService {
  const db = getDb();
  return new ProcessService(
    new SQLiteProcessRepository(db),
    new SQLiteLogRepository(db),
    new NodeProcessSpawner()
  );
}

function createServer(service: ProcessService, config: ServerConfig = DEFAULT_CONFIG): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerAllTools(server, service);

  return server;
}

async function main(): Promise<void> {
  const service = createService();
  const server = createServer(service);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
