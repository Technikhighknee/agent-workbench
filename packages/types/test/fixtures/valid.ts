/**
 * A valid TypeScript file with no errors.
 */
export interface User {
  id: number;
  name: string;
  email: string;
}

export function greet(user: User): string {
  return `Hello, ${user.name}!`;
}

export const defaultUser: User = {
  id: 1,
  name: "John",
  email: "john@example.com",
};
