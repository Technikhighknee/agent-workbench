/**
 * A simple calculator class for testing TypeScript service.
 */
export class Calculator {
  private value: number;

  constructor(initialValue: number = 0) {
    this.value = initialValue;
  }

  add(x: number): Calculator {
    this.value += x;
    return this;
  }

  subtract(x: number): Calculator {
    this.value -= x;
    return this;
  }

  getValue(): number {
    return this.value;
  }
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export const VERSION = "1.0.0";

// This line has a type error intentionally
export const hasError: string = 123;
