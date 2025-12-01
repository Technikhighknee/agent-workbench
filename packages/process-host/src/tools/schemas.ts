import * as z from "zod/v4";

export const ProcessStatusSchema = z.enum([
  "starting",
  "running",
  "exited",
  "failed",
  "stopped",
  "timeout",
]);

export const SignalSchema = z.enum(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"]);

export const StreamSchema = z.enum(["stdout", "stderr"]);

export const ProcessSummarySchema = z.object({
  id: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  label: z.string().optional(),
  status: ProcessStatusSchema,
  pid: z.number().nullable(),
  startedAt: z.string(),
});

export const ProcessDetailsSchema = ProcessSummarySchema.extend({
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  exitCode: z.number().nullable(),
  timeoutMs: z.number().optional(),
  endedAt: z.string().nullable(),
});

export const ProcessListItemSchema = z.object({
  id: z.string(),
  command: z.string(),
  label: z.string().optional(),
  status: ProcessStatusSchema,
  pid: z.number().nullable(),
  exitCode: z.number().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});

export const LogsOutputSchema = z.object({
  id: z.string(),
  status: ProcessStatusSchema.or(z.literal("unknown")),
  exitCode: z.number().nullable(),
  logs: z.string(),
});

export const StopResultSchema = z.object({
  id: z.string(),
  status: ProcessStatusSchema,
  endedAt: z.string().nullable(),
});
