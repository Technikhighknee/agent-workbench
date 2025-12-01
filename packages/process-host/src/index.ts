// Core domain
export * from "./core/model.js";
export * from "./core/ports/index.js";
export { ProcessService, type StartProcessParams, type StopProcessParams } from "./core/services/ProcessService.js";

// Infrastructure - SQLite
export { SQLiteProcessRepository } from "./infrastructure/sqlite/SQLiteProcessRepository.js";
export { SQLiteLogRepository } from "./infrastructure/sqlite/SQLiteLogRepository.js";
export { getDb, createDb, type DbConfig } from "./infrastructure/sqlite/SQLiteDb.js";

// Infrastructure - Memory (for testing)
export { InMemoryProcessRepository } from "./infrastructure/memory/InMemoryProcessRepository.js";
export { InMemoryLogRepository } from "./infrastructure/memory/InMemoryLogRepository.js";

// Infrastructure - Runner
export { NodeProcessSpawner } from "./infrastructure/runner/NodeProcessSpawner.js";

// Tools (MCP tool registration)
export { registerAllTools } from "./tools/index.js";
export * from "./tools/types.js";
export * from "./tools/schemas.js";
