#!/usr/bin/env node
/**
 * MCP server for syntax operations.
 */

import { runServer } from "@agent-workbench/core";
import { SyntaxService } from "./core/services/SyntaxService.js";
import { ProjectIndex } from "./core/services/ProjectIndex.js";
import { TreeSitterParser } from "./infrastructure/parsers/TreeSitterParser.js";
import { NodeFileSystem } from "./infrastructure/filesystem/NodeFileSystem.js";
import { InMemoryCache } from "./infrastructure/cache/InMemoryCache.js";
import { NodeProjectScanner } from "./infrastructure/scanner/NodeProjectScanner.js";
import { NodeFileWatcher } from "./infrastructure/watcher/NodeFileWatcher.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:syntax",
    version: "0.3.0",
  },
  createServices: () => {
    const parser = new TreeSitterParser();
    const fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    const scanner = new NodeProjectScanner();

    return {
      syntax: new SyntaxService(parser, fs, cache),
      index: new ProjectIndex(parser, fs, cache, scanner),
      watcherFactory: () => new NodeFileWatcher(scanner),
    };
  },
  registerTools: registerAllTools,
  onStartup: async (services) => {
    const rootPath = process.cwd();
    const result = await services.index.index(rootPath);

    if (result.ok) {
      // Start watching for changes
      const watcher = services.watcherFactory();
      services.index.startWatching(watcher);
    }
  },
  onShutdown: (services) => {
    services.index.stopWatching();
  },
});
