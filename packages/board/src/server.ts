#!/usr/bin/env node
/**
 * Board MCP server.
 * A simple task board for AI agents.
 */

import { runServer } from "@agent-workbench/core";
import { BoardService } from "./core/BoardService.js";
import { registerBoardTools } from "./tools/registerTools.js";

interface Services {
  board: BoardService;
}

runServer<Services>({
  config: {
    name: "agent-workbench:board",
    version: "0.1.0",
  },
  createServices: () => ({
    board: new BoardService(process.cwd()),
  }),
  registerTools: (server, services) => {
    registerBoardTools(server, services.board);
  },
});
