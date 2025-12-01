/**
 * Fixture file for testing semantic code graph.
 * Contains interconnected code to test call graphs, callers, callees.
 */

// --- Models ---

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
}

// --- Repository ---

export class UserRepository {
  private users: Map<number, User> = new Map();
  private nextId = 1;

  async findById(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: this.nextId++,
      name: input.name,
      email: input.email,
    };
    this.users.set(user.id, user);
    return user;
  }

  async delete(id: number): Promise<boolean> {
    return this.users.delete(id);
  }
}

// --- Validators ---

export function validateEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

export function validateName(name: string): boolean {
  return name.length >= 2 && name.length <= 100;
}

export function validateCreateUserInput(input: CreateUserInput): string[] {
  const errors: string[] = [];

  if (!validateName(input.name)) {
    errors.push("Invalid name");
  }

  if (!validateEmail(input.email)) {
    errors.push("Invalid email");
  }

  return errors;
}

// --- Service ---

export class UserService {
  constructor(private repository: UserRepository) {}

  async getUser(id: number): Promise<User | undefined> {
    return this.repository.findById(id);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    // Validate input
    const errors = validateCreateUserInput(input);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }

    // Check for duplicate email
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new Error("Email already exists");
    }

    // Create user
    return this.repository.create(input);
  }

  async deleteUser(id: number): Promise<boolean> {
    const user = await this.repository.findById(id);
    if (!user) {
      return false;
    }
    return this.repository.delete(id);
  }
}

// --- Handler ---

export async function handleCreateUser(
  service: UserService,
  name: string,
  email: string
): Promise<User> {
  return service.createUser({ name, email });
}

export async function handleGetUser(
  service: UserService,
  id: number
): Promise<User | undefined> {
  return service.getUser(id);
}

// --- Top-level function that calls multiple things ---

export async function processUserRegistration(
  service: UserService,
  name: string,
  email: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const user = await handleCreateUser(service, name, email);
    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
