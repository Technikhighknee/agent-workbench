#!/usr/bin/env node
/**
 * MCP Server for semantic code graph.
 * Provides queryable knowledge base for agents.
 */

import { runServer } from "@agent-workbench/core";
import { GraphStore } from "./GraphStore.js";
import { Analyzer } from "./Analyzer.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:graph",
    version: "0.1.0",
  },
  createServices: () => ({
    store: new GraphStore(),
    analyzer: new Analyzer(),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    const rootPath = process.cwd();
    console.error(`[graph] Auto-initializing graph for workspace: ${rootPath}`);

    try {
      const { nodes, edges } = await services.analyzer.analyzeWorkspace(rootPath);
      services.store.add(nodes, edges);
      const stats = services.store.stats();
      console.error(
        `[graph] Initialized: ${stats.nodes} nodes, ${stats.edges} edges from ${stats.files} files`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[graph] Warning: Could not initialize graph: ${message}`);
      console.error(`[graph] Graph will not be available until manually initialized.`);
    }
  },
});
