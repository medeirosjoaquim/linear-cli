/**
 * Exit codes for the CLI
 * Following standard conventions for CLI applications
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  CONFIG_ERROR: 1,    // Missing/invalid configuration
  AUTH_ERROR: 2,      // Authentication failed
  NOT_FOUND: 3,       // Resource not found (for future use)
  API_ERROR: 4,       // Other API errors (for future use)
  UNEXPECTED: 5,      // Unexpected errors
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Base error class for CLI errors
 * All CLI-specific errors should extend this class
 */
export class CLIError extends Error {
  public readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT_CODES.UNEXPECTED) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
  }
}

/**
 * Error for configuration issues (missing env vars, invalid config)
 */
export class ConfigError extends CLIError {
  constructor(message: string) {
    super(message, EXIT_CODES.CONFIG_ERROR);
    this.name = 'ConfigError';
  }
}

/**
 * Error for authentication failures (invalid API key)
 */
export class AuthError extends CLIError {
  constructor(message: string) {
    super(message, EXIT_CODES.AUTH_ERROR);
    this.name = 'AuthError';
  }
}

/**
 * Error for resource not found (issue doesn't exist)
 */
export class NotFoundError extends CLIError {
  constructor(message: string) {
    super(message, EXIT_CODES.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Global error handler for the CLI
 * Writes error message to stderr and exits with appropriate code
 */
export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  // Unexpected error
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unexpected error: ${message}`);
  process.exit(EXIT_CODES.UNEXPECTED);
}
