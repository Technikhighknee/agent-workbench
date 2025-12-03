/**
 * Monorepo workspace detection.
 * Identifies which workspace test files belong to.
 */

import fs from "fs";
import path from "path";

/**
 * Workspace info for targeted test runs.
 */
export interface WorkspaceInfo {
  workspaceName: string;
  workspacePath: string;
  relativeFiles: string[];
}

/**
 * Detect which workspace a set of files belongs to in a monorepo.
 * Returns workspace info if all files are in the same workspace, null otherwise.
 */
export function detectWorkspaceForFiles(
  projectPath: string,
  files: string[]
): WorkspaceInfo | null {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  let pkg: { workspaces?: string[] };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }

  // Not a monorepo
  if (!pkg.workspaces?.length) return null;

  // Resolve workspace paths
  const workspaceDirs = resolveWorkspaceDirs(projectPath, pkg.workspaces);

  // Find which workspace each file belongs to
  let matchedWorkspace: { name: string; path: string } | null = null;
  const relativeFiles: string[] = [];

  for (const file of files) {
    const absoluteFile = path.isAbsolute(file) ? file : path.join(projectPath, file);

    for (const ws of workspaceDirs) {
      if (absoluteFile.startsWith(ws.path + path.sep)) {
        if (matchedWorkspace && matchedWorkspace.name !== ws.name) {
          // Files span multiple workspaces, can't optimize
          return null;
        }
        matchedWorkspace = ws;
        relativeFiles.push(path.relative(ws.path, absoluteFile));
        break;
      }
    }
  }

  if (!matchedWorkspace) return null;

  return {
    workspaceName: matchedWorkspace.name,
    workspacePath: matchedWorkspace.path,
    relativeFiles,
  };
}

/**
 * Resolve workspace glob patterns to actual directories.
 */
function resolveWorkspaceDirs(
  projectPath: string,
  workspaces: string[]
): Array<{ name: string; path: string }> {
  const dirs: Array<{ name: string; path: string }> = [];

  for (const ws of workspaces) {
    // Handle glob patterns like "packages/*"
    const wsPath = path.join(projectPath, ws.replace("/*", ""));
    if (!fs.existsSync(wsPath) || !fs.statSync(wsPath).isDirectory()) {
      continue;
    }

    // List subdirectories
    const subdirs = fs.readdirSync(wsPath);
    for (const subdir of subdirs) {
      const fullPath = path.join(wsPath, subdir);
      const pkgJsonPath = path.join(fullPath, "package.json");

      if (fs.existsSync(pkgJsonPath)) {
        try {
          const wsPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
          if (wsPkg.name) {
            dirs.push({ name: wsPkg.name, path: fullPath });
          }
        } catch {
          // Skip invalid package.json
        }
      }
    }
  }

  return dirs;
}
