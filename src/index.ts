#!/usr/bin/env node

import { Command } from 'commander';
import { loadEnv, saveApiKey, apiKeySchema } from './config.js';
import { handleError, NotFoundError, EXIT_CODES } from './errors.js';
import { createLinearClient, fetchIssueByIdentifier, listTeams, listTeamIssues } from './linear-client.js';

const program = new Command();

// Configure stderr for all error output
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(`Error: ${str}`),
});

program
  .name('linear')
  .description('CLI for fetching Linear ticket data as JSON')
  .version('0.1.0')
  .argument('[target]', 'Team key (TEAM) or issue identifier (TEAM-123)')
  .option('-k, --key <apiKey>', 'Set and store API key')
  .action(async (target: string | undefined, options: { key?: string }) => {
    try {
      let apiKey: string;

      // If --key provided, validate and save it
      if (options.key) {
        const result = apiKeySchema.safeParse(options.key);
        if (!result.success) {
          console.error(`Invalid API key: ${result.error.errors[0].message}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }
        saveApiKey(result.data);
        console.error('API key saved.\n');
        apiKey = result.data;
      } else {
        // Load from env or stored credentials
        const env = await loadEnv();
        apiKey = env.LINEAR_API_KEY;
      }

      const client = createLinearClient(apiKey);

      // No argument: list all teams
      if (!target) {
        const teams = await listTeams(client);
        console.log(JSON.stringify(teams, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // Has dash: fetch specific ticket (TEAM-123)
      if (target.includes('-')) {
        const issue = await fetchIssueByIdentifier(client, target.toUpperCase());

        if (!issue) {
          throw new NotFoundError(`Issue not found: ${target}`);
        }

        console.log(JSON.stringify(issue, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // No dash: list team issues (TEAM)
      const issues = await listTeamIssues(client, target);
      console.log(JSON.stringify(issues, null, 2));
      process.exit(EXIT_CODES.SUCCESS);

    } catch (error) {
      handleError(error);
    }
  });

program.parse();
