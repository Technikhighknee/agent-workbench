import { LogChunk, LogStream, LogEntry } from "../model.js";

export interface LogRepository {
  append(sessionId: string, stream: LogStream, chunk: string): void;
  get(sessionId: string, lastLines?: number): LogChunk | null;
  getByStream(sessionId: string, stream: LogStream, lastLines?: number): LogChunk | null;
  getEntries(sessionId: string, lastEntries?: number): LogEntry[];
  delete(sessionId: string): void;
}
