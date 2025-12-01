import { LogRepository } from "../../core/ports/LogRepository.js";
import { LogChunk, LogStream, LogEntry } from "../../core/model.js";

interface StoredEntry {
  stream: LogStream;
  chunk: string;
  timestamp: string;
}

export class InMemoryLogRepository implements LogRepository {
  private readonly logs = new Map<string, StoredEntry[]>();
  private readonly maxChunks: number;

  constructor(maxChunks = 500) {
    this.maxChunks = maxChunks;
  }

  append(sessionId: string, stream: LogStream, chunk: string): void {
    let entries = this.logs.get(sessionId);
    if (!entries) {
      entries = [];
      this.logs.set(sessionId, entries);
    }

    entries.push({
      stream,
      chunk,
      timestamp: new Date().toISOString(),
    });

    if (entries.length > this.maxChunks) {
      entries.splice(0, entries.length - this.maxChunks);
    }
  }

  get(sessionId: string, lastLines = 100): LogChunk | null {
    const entries = this.logs.get(sessionId);
    if (!entries || entries.length === 0) return null;

    const recent = entries.slice(-lastLines);
    return {
      sessionId,
      logs: recent.map((e) => e.chunk).join(""),
    };
  }

  getByStream(sessionId: string, stream: LogStream, lastLines = 100): LogChunk | null {
    const entries = this.logs.get(sessionId);
    if (!entries) return null;

    const filtered = entries.filter((e) => e.stream === stream).slice(-lastLines);
    if (filtered.length === 0) return null;

    return {
      sessionId,
      logs: filtered.map((e) => e.chunk).join(""),
    };
  }

  getEntries(sessionId: string, lastEntries = 100): LogEntry[] {
    const entries = this.logs.get(sessionId);
    if (!entries) return [];

    return entries.slice(-lastEntries).map((e) => ({
      sessionId,
      stream: e.stream,
      chunk: e.chunk,
      timestamp: e.timestamp,
    }));
  }

  delete(sessionId: string): void {
    this.logs.delete(sessionId);
  }

  clear(): void {
    this.logs.clear();
  }
}
