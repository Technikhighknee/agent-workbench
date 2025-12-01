import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SyntaxService } from "./core/services/SyntaxService.js";
import { ProjectIndex } from "./core/services/ProjectIndex.js";
import { TreeSitterParser } from "./infrastructure/parsers/TreeSitterParser.js";
import { NodeFileSystem } from "./infrastructure/filesystem/NodeFileSystem.js";
import { InMemoryCache } from "./infrastructure/cache/InMemoryCache.js";
import { NodeProjectScanner } from "./infrastructure/scanner/NodeProjectScanner.js";
import { registerAllTools, Services } from "./tools/index.js";

interface ServerConfig {
  name: string;
  version: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "agent-workbench:syntax",
  version: "0.3.0",
};

function createServices(): Services {
  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const scanner = new NodeProjectScanner();

  return {
    syntax: new SyntaxService(parser, fs, cache),
    index: new ProjectIndex(parser, fs, cache, scanner),
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

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
