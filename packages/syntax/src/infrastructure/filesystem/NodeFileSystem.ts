import fs from "node:fs";
import path from "node:path";
import { FileSystem, FileStats } from "../../core/ports/FileSystem.js";
import { type Result, Ok, Err } from "@agent-workbench/core";

/**
 * Node.js implementation of the FileSystem port.
 */
export class NodeFileSystem implements FileSystem {
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.basePath, filePath);
  }

  read(filePath: string): Result<string, Error> {
    try {
      const resolved = this.resolvePath(filePath);
      const content = fs.readFileSync(resolved, "utf-8");
      return Ok(content);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  write(filePath: string, content: string): Result<void, Error> {
    try {
      const resolved = this.resolvePath(filePath);
      fs.writeFileSync(resolved, content, "utf-8");
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  exists(filePath: string): boolean {
    try {
      const resolved = this.resolvePath(filePath);
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  }

  stats(filePath: string): Result<FileStats, Error> {
    try {
      const resolved = this.resolvePath(filePath);
      const stat = fs.statSync(resolved);
      return Ok({
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
