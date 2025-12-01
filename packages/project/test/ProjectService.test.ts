import { describe, it, expect } from "vitest";
import { ProjectService } from "../src/core/ProjectService.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("ProjectService", () => {
  describe("getProjectInfo", () => {
    it("reads project info from package.json", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("test-project");
      expect(result.value.version).toBe("1.0.0");
      expect(result.value.type).toBe("npm");
      expect(result.value.description).toBe("A test project");
    });

    it("returns unknown type for non-existent directory", async () => {
      const service = new ProjectService("/non/existent/path");
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.type).toBe("unknown");
    });

    it("extracts npm scripts", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scriptNames = result.value.scripts.map((s) => s.name);
      expect(scriptNames).toContain("build");
      expect(scriptNames).toContain("test");
      expect(scriptNames).toContain("lint");
    });

    it("includes script commands", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const buildScript = result.value.scripts.find((s) => s.name === "build");
      expect(buildScript?.command).toBe("tsc");
    });

    it("extracts production dependencies", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const prodDeps = result.value.dependencies.filter(
        (d) => d.type === "production"
      );
      const names = prodDeps.map((d) => d.name);
      expect(names).toContain("express");
      expect(names).toContain("lodash");
      expect(names).not.toContain("typescript");
    });

    it("extracts dev dependencies", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const devDeps = result.value.dependencies.filter(
        (d) => d.type === "development"
      );
      const names = devDeps.map((d) => d.name);
      expect(names).toContain("typescript");
      expect(names).toContain("vitest");
      expect(names).not.toContain("express");
    });

    it("extracts all dependencies", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const names = result.value.dependencies.map((d) => d.name);
      expect(names).toContain("express");
      expect(names).toContain("typescript");
    });

    it("includes version specifiers", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const express = result.value.dependencies.find(
        (d) => d.name === "express"
      );
      expect(express?.version).toBe("^4.18.0");
    });
  });

  describe("findConfigs", () => {
    it("finds package.json in fixtures", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.findConfigs();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const types = result.value.map((c) => c.type);
      expect(types).toContain("npm");
    });
  });

  describe("detectType", () => {
    it("detects npm project type", async () => {
      const service = new ProjectService(FIXTURES);
      const type = await service.detectType();
      expect(type).toBe("npm");
    });
  });

  describe("project root detection", () => {
    it("finds root from subdirectory", async () => {
      // Test with actual monorepo structure
      const service = new ProjectService(join(__dirname, ".."));
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("@agent-workbench/project");
    });

    it("returns project root path", async () => {
      const service = new ProjectService(FIXTURES);
      const rootPath = await service.getProjectRoot();
      expect(rootPath).toBe(FIXTURES);
    });
  });

  describe("readConfig", () => {
    it("reads package.json config content", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.readConfig(
        join(FIXTURES, "package.json")
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain("test-project");
    });
  });

  describe("tech stack detection", () => {
    it("detects Express as backend framework", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const depNames = result.value.dependencies.map((d) => d.name);
      expect(depNames).toContain("express");
    });

    it("detects TypeScript as language", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const depNames = result.value.dependencies.map((d) => d.name);
      expect(depNames).toContain("typescript");
    });

    it("detects Vitest as testing framework", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const depNames = result.value.dependencies.map((d) => d.name);
      expect(depNames).toContain("vitest");
    });
  });

  describe("quickstart commands", () => {
    it("has build script", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scriptNames = result.value.scripts.map((s) => s.name);
      expect(scriptNames).toContain("build");
    });

    it("has test script", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scriptNames = result.value.scripts.map((s) => s.name);
      expect(scriptNames).toContain("test");
    });

    it("has lint script", async () => {
      const service = new ProjectService(FIXTURES);
      const result = await service.getProjectInfo();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const scriptNames = result.value.scripts.map((s) => s.name);
      expect(scriptNames).toContain("lint");
    });

    it("returns project root for structure", async () => {
      const service = new ProjectService(FIXTURES);
      const root = await service.getProjectRoot();

      expect(root).toBe(FIXTURES);
    });
  });
});
