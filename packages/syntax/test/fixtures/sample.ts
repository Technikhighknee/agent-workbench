/**
 * Sample TypeScript file for testing.
 */

import { readFile } from "fs/promises";
import type { Result } from "./types";

export const VERSION = "1.0.0";

/**
 * A simple calculator class.
 */
export class Calculator {
  private value: number;

  constructor(initial: number = 0) {
    this.value = initial;
  }

  /**
   * Add a number to the current value.
   */
  add(x: number): number {
    this.value += x;
    return this.value;
  }

  /**
   * Subtract a number from the current value.
   */
  subtract(x: number): number {
    this.value -= x;
    return this.value;
  }

  getValue(): number {
    return this.value;
  }
}

/**
 * Multiply two numbers.
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

export async function fetchData(url: string): Promise<string> {
  return "data";
}

interface User {
  id: number;
  name: string;
}

type Status = "active" | "inactive";
