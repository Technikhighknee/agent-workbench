import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TestRunnerServiceImpl } from "./infrastructure/TestRunnerServiceImpl.js";
import { registerAllTools, Services } from "./tools/index.js";

interface ServerConfig {
  name: string;
  version: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "agent-workbench:test-runner",
  version: "0.1.0",
};

function createServices(): Services {
  return {
    testRunner: new TestRunnerServiceImpl(),
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

  const result = await services.testRunner.initialize(rootPath);
  if (result.ok) {
    console.error(`[test-runner] Initialized: ${result.value.framework} framework detected`);
    console.error(`[test-runner] Config: ${result.value.configFile}`);
  } else {
    console.error(`[test-runner] Warning: ${result.error.message}`);
    console.error(`[test-runner] Test runner will not be available until a supported framework is detected.`);
  }
}

async function main(): Promise<void> {
  const services = createServices();
  const server = createServer(services);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Auto-initialize the test runner
  await autoInitialize(services);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
