import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TypeScriptService } from "./infrastructure/typescript/TypeScriptService.js";
import { registerAllTools, Services } from "./tools/index.js";

interface ServerConfig {
  name: string;
  version: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "agent-workbench:types",
  version: "0.1.0",
};

function createServices(): Services {
  return {
    types: new TypeScriptService(),
  };
}

function createServer(services: Services, config: ServerConfig = DEFAULT_CONFIG): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerAllTools(server, services);

  return server;
}

async function autoInitialize(services: Services): Promise<void> {
  const rootPath = process.cwd();

  const result = await services.types.initialize(rootPath);
  if (result.ok) {
    console.error(`[types] Initialized TypeScript project: ${result.value.configPath}`);
    console.error(`[types] Files: ${result.value.fileCount}, Target: ${result.value.compilerOptions.target}`);
  } else {
    console.error(`[types] Warning: Could not initialize TypeScript project: ${result.error.message}`);
    console.error(`[types] Type checking will not be available until a tsconfig.json is found.`);
  }
}

async function main(): Promise<void> {
  const services = createServices();
  const server = createServer(services);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    services.types.dispose();
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Auto-initialize the TypeScript project
  await autoInitialize(services);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
