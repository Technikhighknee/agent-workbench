/**
 * get_tech_stack tool - Detect frameworks, libraries, and tools used in the project.
 * Helps understand what technologies to expect in the codebase.
 */

import type { ToolRegistrar } from "./types.js";

interface TechCategory {
  name: string;
  items: { name: string; version?: string; confidence: "high" | "medium" }[];
}

// Known technology patterns to detect
const TECH_PATTERNS: Record<string, { category: string; detect: (deps: string[]) => boolean }> = {
  // Frontend Frameworks
  React: { category: "Frontend Framework", detect: (deps) => deps.some(d => d === "react") },
  Vue: { category: "Frontend Framework", detect: (deps) => deps.some(d => d === "vue") },
  Angular: { category: "Frontend Framework", detect: (deps) => deps.some(d => d.startsWith("@angular/")) },
  Svelte: { category: "Frontend Framework", detect: (deps) => deps.some(d => d === "svelte") },
  Solid: { category: "Frontend Framework", detect: (deps) => deps.some(d => d === "solid-js") },

  // Meta-frameworks
  "Next.js": { category: "Meta-Framework", detect: (deps) => deps.some(d => d === "next") },
  Nuxt: { category: "Meta-Framework", detect: (deps) => deps.some(d => d === "nuxt") },
  Remix: { category: "Meta-Framework", detect: (deps) => deps.some(d => d === "@remix-run/react") },
  Astro: { category: "Meta-Framework", detect: (deps) => deps.some(d => d === "astro") },
  SvelteKit: { category: "Meta-Framework", detect: (deps) => deps.some(d => d === "@sveltejs/kit") },

  // Backend Frameworks
  Express: { category: "Backend Framework", detect: (deps) => deps.some(d => d === "express") },
  Fastify: { category: "Backend Framework", detect: (deps) => deps.some(d => d === "fastify") },
  Hono: { category: "Backend Framework", detect: (deps) => deps.some(d => d === "hono") },
  NestJS: { category: "Backend Framework", detect: (deps) => deps.some(d => d === "@nestjs/core") },
  Koa: { category: "Backend Framework", detect: (deps) => deps.some(d => d === "koa") },

  // Testing
  Jest: { category: "Testing", detect: (deps) => deps.some(d => d === "jest") },
  Vitest: { category: "Testing", detect: (deps) => deps.some(d => d === "vitest") },
  Mocha: { category: "Testing", detect: (deps) => deps.some(d => d === "mocha") },
  Playwright: { category: "Testing", detect: (deps) => deps.some(d => d === "@playwright/test" || d === "playwright") },
  Cypress: { category: "Testing", detect: (deps) => deps.some(d => d === "cypress") },

  // Build Tools
  Vite: { category: "Build Tool", detect: (deps) => deps.some(d => d === "vite") },
  Webpack: { category: "Build Tool", detect: (deps) => deps.some(d => d === "webpack") },
  esbuild: { category: "Build Tool", detect: (deps) => deps.some(d => d === "esbuild") },
  tsup: { category: "Build Tool", detect: (deps) => deps.some(d => d === "tsup") },
  Rollup: { category: "Build Tool", detect: (deps) => deps.some(d => d === "rollup") },
  Turbopack: { category: "Build Tool", detect: (deps) => deps.some(d => d === "turbo") },

  // ORM / Database
  Prisma: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "prisma" || d === "@prisma/client") },
  Drizzle: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "drizzle-orm") },
  TypeORM: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "typeorm") },
  Mongoose: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "mongoose") },
  Sequelize: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "sequelize") },
  Knex: { category: "Database/ORM", detect: (deps) => deps.some(d => d === "knex") },

  // State Management
  Redux: { category: "State Management", detect: (deps) => deps.some(d => d === "redux" || d === "@reduxjs/toolkit") },
  Zustand: { category: "State Management", detect: (deps) => deps.some(d => d === "zustand") },
  Jotai: { category: "State Management", detect: (deps) => deps.some(d => d === "jotai") },
  MobX: { category: "State Management", detect: (deps) => deps.some(d => d === "mobx") },
  Pinia: { category: "State Management", detect: (deps) => deps.some(d => d === "pinia") },

  // Styling
  "Tailwind CSS": { category: "Styling", detect: (deps) => deps.some(d => d === "tailwindcss") },
  "Styled Components": { category: "Styling", detect: (deps) => deps.some(d => d === "styled-components") },
  Emotion: { category: "Styling", detect: (deps) => deps.some(d => d === "@emotion/react") },
  Sass: { category: "Styling", detect: (deps) => deps.some(d => d === "sass" || d === "node-sass") },

  // API / Communication
  tRPC: { category: "API", detect: (deps) => deps.some(d => d.startsWith("@trpc/")) },
  GraphQL: { category: "API", detect: (deps) => deps.some(d => d === "graphql" || d === "@apollo/client") },
  "React Query": { category: "Data Fetching", detect: (deps) => deps.some(d => d === "@tanstack/react-query") },
  SWR: { category: "Data Fetching", detect: (deps) => deps.some(d => d === "swr") },
  Axios: { category: "HTTP Client", detect: (deps) => deps.some(d => d === "axios") },

  // Validation
  Zod: { category: "Validation", detect: (deps) => deps.some(d => d === "zod") },
  Yup: { category: "Validation", detect: (deps) => deps.some(d => d === "yup") },
  Joi: { category: "Validation", detect: (deps) => deps.some(d => d === "joi") },

  // Auth
  "NextAuth.js": { category: "Authentication", detect: (deps) => deps.some(d => d === "next-auth") },
  Passport: { category: "Authentication", detect: (deps) => deps.some(d => d === "passport") },
  Lucia: { category: "Authentication", detect: (deps) => deps.some(d => d === "lucia") },

  // Language
  TypeScript: { category: "Language", detect: (deps) => deps.some(d => d === "typescript") },
};

export const registerGetTechStack: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_tech_stack",
    {
      title: "Get tech stack",
      description:
        "Detect frameworks, libraries, and tools used in this project. " +
        "Helps understand what technologies to expect when reading the code.",
      inputSchema: {},
    },
    async () => {
      const infoResult = await service.getProjectInfo();
      if (!infoResult.ok) {
        return { content: [{ type: "text", text: `Error: ${infoResult.error}` }] };
      }

      const info = infoResult.value;

      // Get all dependency names
      const depNames = info.dependencies.map(d => d.name);

      // Detect technologies
      const detected: Map<string, TechCategory> = new Map();

      for (const [techName, { category, detect }] of Object.entries(TECH_PATTERNS)) {
        if (detect(depNames)) {
          const dep = info.dependencies.find(d => {
            // Find the matching dependency for version
            const lowerName = d.name.toLowerCase();
            const lowerTech = techName.toLowerCase();
            return lowerName.includes(lowerTech) ||
                   lowerTech.includes(lowerName) ||
                   d.name === techName.toLowerCase();
          });

          if (!detected.has(category)) {
            detected.set(category, { name: category, items: [] });
          }

          detected.get(category)!.items.push({
            name: techName,
            version: dep?.version,
            confidence: "high",
          });
        }
      }

      // Build output
      const output: string[] = [
        `# Tech Stack: ${info.name}`,
        "",
      ];

      if (detected.size === 0) {
        output.push("No common frameworks or libraries detected.");
        output.push("");
        output.push("This might be a vanilla JavaScript project or use less common technologies.");
      } else {
        // Sort categories for consistent output
        const categoryOrder = [
          "Language",
          "Frontend Framework",
          "Meta-Framework",
          "Backend Framework",
          "Build Tool",
          "Testing",
          "Database/ORM",
          "State Management",
          "Styling",
          "API",
          "Data Fetching",
          "HTTP Client",
          "Validation",
          "Authentication",
        ];

        const sortedCategories = [...detected.entries()].sort((a, b) => {
          const aIndex = categoryOrder.indexOf(a[0]);
          const bIndex = categoryOrder.indexOf(b[0]);
          if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        for (const [, category] of sortedCategories) {
          output.push(`## ${category.name}`);
          output.push("");
          for (const item of category.items) {
            const version = item.version ? ` (${item.version})` : "";
            output.push(`- **${item.name}**${version}`);
          }
          output.push("");
        }
      }

      // Add summary of total dependencies
      const prodDeps = info.dependencies.filter(d => d.type === "production").length;
      const devDeps = info.dependencies.filter(d => d.type === "development").length;

      output.push("## Dependency Summary");
      output.push("");
      output.push(`- Production dependencies: ${prodDeps}`);
      output.push(`- Development dependencies: ${devDeps}`);
      output.push("");

      // Contextual tips based on detected tech
      output.push("---");
      output.push("**Related MCP tools:**");

      const hasTypeScript = info.dependencies.some(d => d.name === "typescript");
      if (hasTypeScript) {
        output.push("- TypeScript detected: Use `mcp__types__get_diagnostics` for type checking");
      }

      const hasTestFramework = info.dependencies.some(d =>
        ["vitest", "jest", "mocha"].includes(d.name)
      );
      if (hasTestFramework) {
        output.push("- Test framework detected: Use `mcp__test-runner__run_tests` for structured results");
      }

      output.push("- Call `get_session_guide` for full MCP tool guidance");

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
