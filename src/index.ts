#!/usr/bin/env node

import { Command } from 'commander';
import { loadEnv, loadStoredApiKey, saveApiKey, apiKeySchema } from './config.js';
import { handleError, NotFoundError, EXIT_CODES } from './errors.js';
import { createLinearClient, fetchIssueByIdentifier, listTeams, listTeamIssues, listTeamMembers, updateIssueStatus, searchIssues, createIssue, addComment } from './linear-client.js';

const program = new Command();

// Configure stderr for all error output
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(`Error: ${str}`),
});

program
  .name('linear')
  .description('CLI for fetching and updating Linear ticket data as JSON')
  .version('0.2.0')
  .argument('[args...]', 'Command arguments (see examples below)')
  .option('-k, --key <apiKey>', 'Set and store API key')
  .option('-s, --status <status>', 'Update issue status (use with issue identifier)')
  .option('--subtasks', 'Include full details of all subtasks when fetching an issue')
  .option('--created-after <date>', 'Filter issues created after date (ISO 8601 or YYYY-MM-DD)')
  .option('--created-before <date>', 'Filter issues created before date (ISO 8601 or YYYY-MM-DD)')
  .option('--updated-after <date>', 'Filter issues updated after date (ISO 8601 or YYYY-MM-DD)')
  .option('--updated-before <date>', 'Filter issues updated before date (ISO 8601 or YYYY-MM-DD)')
  .option('--completed-after <date>', 'Filter issues completed after date (ISO 8601 or YYYY-MM-DD)')
  .option('--completed-before <date>', 'Filter issues completed before date (ISO 8601 or YYYY-MM-DD)')
  .option('-t, --title <title>', 'Issue title (for create command)')
  .option('-d, --description <description>', 'Issue description (for create command)')
  .option('-a, --assignee <assignee>', 'Assignee name/email (for create command)')
  .option('-p, --priority <priority>', 'Issue priority: 1=Urgent, 2=High, 3=Normal, 4=Low (for create command)')
  .option('-l, --labels <labels>', 'Comma-separated labels (for create command)')
  .addHelpText('after', `
Commands:
  linear auth login             Authenticate by entering your API key interactively
  linear                        List all accessible teams
  linear members TEAM           List all members of a specific team
  linear search <keywords>      Search issues across all teams (e.g., "linear search auth bug")
  linear search <keywords> TEAM Search issues within a specific team
  linear TEAM                   List recent issues in a team (20 most recent)
  linear TEAM @username         Filter issues by assignee (matches name/email/displayName)
  linear TEAM @unassigned       List unassigned issues in a team
  linear TEAM-123               Fetch complete details for a specific issue
  linear TEAM-123 --subtasks    Fetch issue with full subtask details
  linear TEAM-123 --status STATUS
                                Update issue status (e.g., "In Progress", "Done")
  linear create TEAM            Create a new issue in the specified team
  linear comment TEAM-123       Add a comment to an issue

Examples:
  $ linear auth login            Authenticate interactively
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
  $ linear ENG-123 --subtasks   Show issue with full subtask details
  $ linear ENG-123 --status "In Progress"
                                Update issue status to "In Progress"
  $ linear ENG-123 --status "Done"
                                Update issue status to "Done"
  $ linear create ENG --title "Fix auth bug" --description "Details here"
                                Create a new issue in ENG team
  $ linear create ENG -t "Bug" -a "john" -p 2
                                Create issue with assignee and priority
  $ linear comment ENG-123 "This is a comment"
                                Add a comment to an issue
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
  API key priority: LINEAR_API_KEY env var > ~/.linear/credentials
  Get your key from: https://linear.app/settings/api
`)
  .action(async (args: string[] | undefined, options: {
    key?: string;
    status?: string;
    subtasks?: boolean;
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    completedAfter?: string;
    completedBefore?: string;
    title?: string;
    description?: string;
    assignee?: string;
    priority?: string;
    labels?: string;
  }) => {
    try {
      // "auth login" command: prompt for API key (handle before loading env)
      if (args && args.length >= 2 && args[0].toLowerCase() === 'auth' && args[1].toLowerCase() === 'login') {
        const existing = loadStoredApiKey();
        if (existing) {
          console.error('You are already authenticated. To re-authenticate, run this command again.\n');
        }

        console.error('Get your API key from: https://linear.app/settings/api\n');

        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
        const key = await new Promise<string>((resolve) => {
          rl.question('Enter your Linear API key: ', (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });

        const result = apiKeySchema.safeParse(key);
        if (!result.success) {
          console.error(`Invalid API key: ${result.error.errors[0].message}`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }

        saveApiKey(result.data);
        console.error('API key saved. You are now authenticated.\n');
        process.exit(EXIT_CODES.SUCCESS);
      }

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

      // "create TEAM" command: create a new issue
      if (firstArg.toLowerCase() === 'create' && secondArg) {
        if (!options.title) {
          console.error('Error: --title is required when creating an issue');
          console.error('Example: linear create TEAM --title "Fix bug"');
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }

        // Parse priority if provided
        let priority: number | undefined;
        if (options.priority) {
          const priorityNum = parseInt(options.priority, 10);
          if (isNaN(priorityNum) || priorityNum < 1 || priorityNum > 4) {
            console.error('Error: Priority must be a number between 1 and 4 (1=Urgent, 2=High, 3=Normal, 4=Low)');
            process.exit(EXIT_CODES.CONFIG_ERROR);
          }
          priority = priorityNum;
        }

        // Parse labels if provided
        const labels = options.labels ? options.labels.split(',').map((l: string) => l.trim()).filter(Boolean) : undefined;

        const newIssue = await createIssue(client, secondArg.toUpperCase(), {
          title: options.title,
          description: options.description,
          assignee: options.assignee,
          priority,
          status: options.status,
          labels,
        });
        console.log(JSON.stringify(newIssue, null, 2));
        process.exit(EXIT_CODES.SUCCESS);
      }

      // "comment TEAM-123" command: add a comment to an issue
      if (firstArg.toLowerCase() === 'comment' && secondArg) {
        // Collect all arguments after the identifier as the comment body
        const commentArgs = args.slice(2);
        const commentBody = commentArgs.join(' ');

        if (!commentBody) {
          console.error('Error: Comment body is required');
          console.error('Example: linear comment TEAM-123 "This is a comment"');
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }

        // Check if secondArg looks like an issue identifier
        if (!secondArg.includes('-')) {
          console.error(`Error: Invalid issue identifier: ${secondArg}. Expected format: TEAM-123`);
          process.exit(EXIT_CODES.CONFIG_ERROR);
        }

        const newComment = await addComment(client, secondArg.toUpperCase(), commentBody);
        console.log(JSON.stringify(newComment, null, 2));
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

        // Fetch issue details (with subtasks if flag is set)
        const issue = await fetchIssueByIdentifier(client, firstArg.toUpperCase(), options.subtasks);

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
