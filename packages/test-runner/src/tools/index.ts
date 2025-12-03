import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

import { registerRunTests } from "./runTests.js";
import { registerGetTestFailures } from "./getTestFailures.js";
import { registerListTestFiles } from "./listTestFiles.js";
import { registerRerunFailed } from "./rerunFailed.js";
import { registerFindTestsFor } from "./findTestsFor.js";
import { registerRunRelatedTests } from "./runRelatedTests.js";

export interface Services {
  testRunner: TestRunnerServiceImpl;
}

export function registerAllTools(server: McpServer, services: Services): void {
  const { testRunner } = services;

  registerRunTests(server, testRunner);
  registerGetTestFailures(server, testRunner);
  registerListTestFiles(server, testRunner);
  registerRerunFailed(server, testRunner);
  registerFindTestsFor(server, testRunner);
  registerRunRelatedTests(server, testRunner);
}
