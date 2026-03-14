import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as readline from 'readline';

const CONFIG_DIR = join(homedir(), '.linear');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials');

/**
 * Zod schema for API key validation
 */
export const apiKeySchema = z.string()
  .min(1, 'API key cannot be empty')
  .regex(/^lin_api_/, 'API key must start with "lin_api_"');

/**
 * Type representing validated environment
 */
export type Env = {
  LINEAR_API_KEY: string;
};

/**
 * Prompt user for input
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Save API key to credentials file
 */
export function saveApiKey(apiKey: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CREDENTIALS_FILE, apiKey, { mode: 0o600 });
}

/**
 * Load API key from credentials file
 */
export function loadStoredApiKey(): string | null {
  if (!existsSync(CREDENTIALS_FILE)) {
    return null;
  }
  try {
    return readFileSync(CREDENTIALS_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Load API key with fallback chain:
 * 1. LINEAR_API_KEY env var
 * 2. ~/.config/linear-cli/credentials
 * 3. Prompt user and save
 */
export async function loadEnv(): Promise<Env> {
  // 1. Check env var first
  const envKey = process.env.LINEAR_API_KEY;
  if (envKey) {
    const result = apiKeySchema.safeParse(envKey);
    if (result.success) {
      return { LINEAR_API_KEY: result.data };
    }
    console.error(`Invalid LINEAR_API_KEY: ${result.error.errors[0].message}`);
    process.exit(1);
  }

  // 2. Check stored credentials
  const storedKey = loadStoredApiKey();
  if (storedKey) {
    const result = apiKeySchema.safeParse(storedKey);
    if (result.success) {
      return { LINEAR_API_KEY: result.data };
    }
    console.error(`Invalid stored API key: ${result.error.errors[0].message}`);
    console.error(`Remove ${CREDENTIALS_FILE} and try again.`);
    process.exit(1);
  }

  // 3. Prompt user
  console.log('No Linear API key found.\n');
  console.log('Get your API key from: https://linear.app/settings/api\n');

  const apiKey = await prompt('Enter your Linear API key: ');

  const result = apiKeySchema.safeParse(apiKey);
  if (!result.success) {
    console.error(`Invalid API key: ${result.error.errors[0].message}`);
    process.exit(1);
  }

  // Save for future use
  saveApiKey(result.data);
  console.log(`\nAPI key saved to ${CREDENTIALS_FILE}\n`);

  return { LINEAR_API_KEY: result.data };
}
