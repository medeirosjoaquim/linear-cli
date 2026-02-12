#!/usr/bin/env node

import { Command } from 'commander';
import { loadEnv, saveApiKey, apiKeySchema } from './config.js';
import { handleError, NotFoundError, EXIT_CODES } from './errors.js';
import { createLinearClient, fetchIssueByIdentifier, listTeams, listTeamIssues, listTeamMembers, updateIssueStatus, searchIssues } from './linear-client.js';

const program = new Command();

// Configure stderr for all error output
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(`Error: ${str}`),
});

program
  .name('linear')
  .description('CLI for fetching and updating Linear ticket data as JSON')
  .version('0.1.0')
  .argument('[args...]', 'Command arguments (see examples below)')
  .option('-k, --key <apiKey>', 'Set and store API key')
  .option('-s, --status <status>', 'Update issue status (use with issue identifier)')
  .option('--created-after <date>', 'Filter issues created after date (ISO 8601 or YYYY-MM-DD)')
  .option('--created-before <date>', 'Filter issues created before date (ISO 8601 or YYYY-MM-DD)')
  .option('--updated-after <date>', 'Filter issues updated after date (ISO 8601 or YYYY-MM-DD)')
  .option('--updated-before <date>', 'Filter issues updated before date (ISO 8601 or YYYY-MM-DD)')
  .option('--completed-after <date>', 'Filter issues completed after date (ISO 8601 or YYYY-MM-DD)')
  .option('--completed-before <date>', 'Filter issues completed before date (ISO 8601 or YYYY-MM-DD)')
  .addHelpText('after', `
Commands:
  linear                        List all accessible teams
  linear members TEAM           List all members of a specific team
  linear search <keywords>      Search issues across all teams (e.g., "linear search auth bug")
  linear search <keywords> TEAM Search issues within a specific team
  linear TEAM                   List recent issues in a team (20 most recent)
  linear TEAM @username         Filter issues by assignee (matches name/email/displayName)
  linear TEAM @unassigned       List unassigned issues in a team
  linear TEAM-123               Fetch complete details for a specific issue
  linear TEAM-123 --status STATUS
                                Update issue status (e.g., "In Progress", "Done")

Examples:
  $ linear --key lin_api_xxx    Store your Linear API key
  $ linear                      Show all teams you have access to
  $ linear members ENG          Show all members of the ENG team
  $ linear search "auth bug"    Search for issues matching "auth bug"
  $ linear search "api error" ENG
                                Search ENG team issues matching "api error"
  $ linear ENG                  Show 20 most recent issues in ENG team
  $ linear ENG @john            Show ENG issues assigned to users matching "john"
  $ linear ENG @unassigned      Show unassigned ENG issues
  $ linear ENG-123              Show complete details for issue ENG-123
  $ linear ENG-123 --status "In Progress"
                                Update issue status to "In Progress"
  $ linear ENG-123 --status "Done"
                                Update issue status to "Done"
  $ linear ENG-123 | jq         Pretty-print issue details with jq
  $ linear ENG | jq 'length'    Count recent issues in ENG team
  $ linear ENG --created-after=2024-01-01
                                Show issues created after Jan 1, 2024
  $ linear ENG --updated-after=2024-12-01 --updated-before=2024-12-31
                                Show issues updated in December 2024
  $ linear ENG @john --completed-after=2024-01-01
                                Show John's completed issues since Jan 1, 2024

Output:
  All data is output as JSON to stdout. Errors go to stderr.
  Exit codes: 0=success, 1=config error, 2=auth error, 3=not found

Authentication:
  API key priority: LINEAR_API_KEY env var > ~/.config/linear-cli/credentials
  Get your key from: https://linear.app/settings/api
`)
  .action(async (args: string[] | undefined, options: {
    key?: string;
    status?: string;
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    completedAfter?: string;
    completedBefore?: string;
  }) => {
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

      // No arguments: list all teams
      if (!args || args.length === 0) {
        const teams = await listTeams(client);
        console.log(JSON.stringify(teams, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      const [firstArg, secondArg] = args;

      // "members TEAM" command: list team members
      if (firstArg.toLowerCase() === 'members' && secondArg) {
        const members = await listTeamMembers(client, secondArg);
        console.log(JSON.stringify(members, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // "search" command: search issues by keywords
      if (firstArg.toLowerCase() === 'search' && secondArg) {
        // Combine all arguments after "search" as the search term
        const searchArgs = args.slice(1);
        
        // Check if last argument is a team key (no spaces, not starting with @, and doesn't look like a multi-word query)
        const lastArg = searchArgs[searchArgs.length - 1];
        const isTeamKey = lastArg && !lastArg.includes(' ') && !lastArg.startsWith('@') && /^[A-Za-z]+$/.test(lastArg);
        
        let teamKey: string | undefined;
        let searchTerm: string;
        
        if (isTeamKey && searchArgs.length > 1) {
          // Last arg is a team key
          teamKey = lastArg;
          searchTerm = searchArgs.slice(0, -1).join(' ');
        } else {
          // No team key provided
          searchTerm = searchArgs.join(' ');
        }
        
        const results = await searchIssues(client, searchTerm, teamKey, 20);
        console.log(JSON.stringify(results, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // Has dash: fetch specific ticket (TEAM-123) or update status
      if (firstArg.includes('-')) {
        // Check if --status option is provided
        if (options.status) {
          // Update issue status
          const updatedIssue = await updateIssueStatus(client, firstArg.toUpperCase(), options.status);
          console.log(JSON.stringify(updatedIssue, null, 2));
          process.exit(EXIT_CODES.SUCCESS);
        }

        // Fetch issue details
        const issue = await fetchIssueByIdentifier(client, firstArg.toUpperCase());

        if (!issue) {
          throw new NotFoundError(`Issue not found: ${firstArg}`);
        }

        console.log(JSON.stringify(issue, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // Check for assignee filter (@username or @unassigned)
      let assigneeFilter: string | undefined;
      if (secondArg && secondArg.startsWith('@')) {
        assigneeFilter = secondArg.slice(1); // Remove @ prefix
      }

      // Build date filters object
      const dateFilters = {
        createdAfter: options.createdAfter,
        createdBefore: options.createdBefore,
        updatedAfter: options.updatedAfter,
        updatedBefore: options.updatedBefore,
        completedAfter: options.completedAfter,
        completedBefore: options.completedBefore,
      };

      // List team issues (with optional assignee and date filters)
      const issues = await listTeamIssues(client, firstArg, 20, assigneeFilter, dateFilters);
      console.log(JSON.stringify(issues, null, 2));
      process.exit(EXIT_CODES.SUCCESS);

    } catch (error) {
      handleError(error);
    }
  });

program.parse();
