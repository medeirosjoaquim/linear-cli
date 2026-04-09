# Linear CLI

A command-line tool for fetching Linear ticket data as JSON. Built for automation workflows, scripting, and integration with other tools.

## Features

- **List teams** — See all accessible teams in your workspace
- **List team members** — See all members of a specific team
- **Search issues** — Find tickets by keywords across all teams or within a specific team
- **List issues** — Browse recent tickets in any team
- **Filter by assignee** — Filter issues by assignee or show unassigned issues
- **Filter by date** — Filter issues by created, updated, or completed date ranges
- **Fetch full details** — Get complete issue data including comments, relations, history
- **JSON output** — Pipe to `jq`, save to files, or process programmatically
- **Secure credentials** — API key stored safely in `~/.config/linear-cli/credentials`
- **Create issues** — Create new issues in any team
- **Add comments** — Add comments to existing issues

## Installation

```bash
# Clone the repository
git clone https://github.com/medeirosjoaquim/linear-cli.git
cd linear-cli

# Install dependencies
pnpm install

# Build
pnpm build

# Optional: link globally
pnpm link --global
```

Requires Node.js 22+.

## Quick Start

```bash
# Set your API key (one-time setup)
./bin/linear --key lin_api_your_key_here

# List all teams
./bin/linear

# List team members
./bin/linear members TEAM

# Search issues by keywords across all teams
./bin/linear search "auth bug"

# Search issues within a specific team
./bin/linear search "api error" TEAM

# List recent issues in a team
./bin/linear TEAM

# Filter issues by assignee
./bin/linear TEAM @username

# List unassigned issues
./bin/linear TEAM @unassigned

# Filter by date ranges
./bin/linear TEAM --created-after=2024-01-01
./bin/linear TEAM --updated-after=2024-12-01 --updated-before=2024-12-31

# Fetch full issue details
./bin/linear TEAM-123

# Update issue title and/or description
./bin/linear TEAM-123 --title "New title" --description "Updated details"
```

## Usage

```
Usage: linear [options] [args...]

Arguments:
  args                       Command arguments: [TEAM|TEAM-123|members TEAM|search <keywords>] [@assignee]

Options:
  -V, --version                    output the version number
  -k, --key <apiKey>               Set and store API key
  -s, --status <status>            Update issue status (use with issue identifier)
  --subtasks                       Include full details of all subtasks when fetching an issue
  --created-after <date>           Filter issues created after date (ISO 8601 or YYYY-MM-DD)
  --created-before <date>          Filter issues created before date (ISO 8601 or YYYY-MM-DD)
  --updated-after <date>           Filter issues updated after date (ISO 8601 or YYYY-MM-DD)
  --updated-before <date>          Filter issues updated before date (ISO 8601 or YYYY-MM-DD)
  --completed-after <date>         Filter issues completed after date (ISO 8601 or YYYY-MM-DD)
  --completed-before <date>        Filter issues completed before date (ISO 8601 or YYYY-MM-DD)
  -t, --title <title>              Issue title (for create or edit)
  -d, --description <description>  Issue description (for create or edit)
  -a, --assignee <assignee>        Assignee name/email (for create command)
  -p, --priority <priority>        Issue priority: 1=Urgent, 2=High, 3=Normal, 4=Low (for create command)
  -l, --labels <labels>            Comma-separated labels (for create command)
  -h, --help                       display help for command
```

### Examples

```bash
# List all accessible teams
linear
# Output: [{"id": "...", "key": "TEAM", "name": "Core Team"}, ...]

# List team members
linear members TEAM
# Output: [{"id": "...", "name": "John Doe", "email": "john@example.com", ...}, ...]

# Search issues by keywords across all teams
linear search "auth bug"
# Output: [{"id": "...", "identifier": "TEAM-123", "title": "Fix auth bug", ...}, ...]

# Search issues within a specific team
linear search "api error" ENG
# Output: [{"id": "...", "identifier": "ENG-456", "title": "API error handling", ...}, ...]

# List recent issues in a team (20 most recently updated)
linear TEAM
# Output: [{"id": "...", "identifier": "TEAM-123", "title": "...", ...}, ...]

# Filter issues by assignee (matches name, email, or displayName)
linear TEAM @john
# Output: Issues assigned to users matching "john"

# List unassigned issues
linear TEAM @unassigned
# Output: Issues with no assignee

# Filter by created date
linear TEAM --created-after=2024-01-01
# Output: Issues created after Jan 1, 2024

# Filter by date range
linear TEAM --updated-after=2024-12-01 --updated-before=2024-12-31
# Output: Issues updated in December 2024

# Combine filters
linear TEAM @john --completed-after=2024-01-01
# Output: John's completed issues since Jan 1, 2024

# Fetch complete issue details
linear TEAM-123
# Output: Full issue with comments, relations, parent/child, history

# Pipe to jq for filtering
linear TEAM-123 | jq '.comments'

# Save to file
linear TEAM-123 > issue.json
```

## Output Format

### Team List

```json
[
  {
    "id": "team-uuid",
    "key": "TEAM",
    "name": "Core Team"
  }
]
```

### Team Members

```json
[
  {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://...",
    "isActive": true
  }
]
```

### Issue List

```json
[
  {
    "id": "issue-uuid",
    "identifier": "TEAM-123",
    "title": "Issue title",
    "status": "In Progress",
    "assignee": "John Doe",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

### Full Issue Details

```json
{
  "id": "issue-uuid",
  "identifier": "TEAM-123",
  "title": "Issue title",
  "description": "Full description...",
  "status": "In Progress",
  "assignee": "John Doe",
  "priority": 2,
  "labels": ["bug", "frontend"],
  "createdAt": "2024-01-10T08:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "comments": [
    {
      "id": "comment-uuid",
      "body": "Comment text",
      "author": "Jane Doe",
      "createdAt": "2024-01-12T14:00:00.000Z"
    }
  ],
  "relations": [
    {
      "type": "blocks",
      "identifier": "TEAM-456",
      "title": "Related issue"
    }
  ],
  "parent": {
    "id": "parent-uuid",
    "identifier": "TEAM-100",
    "title": "Parent issue"
  },
  "children": [],
  "history": [
    {
      "type": "state",
      "createdAt": "2024-01-11T09:00:00.000Z",
      "actor": "John Doe",
      "fromState": "Backlog",
      "toState": "In Progress"
    }
  ]
}
```

## Authentication

### Option 1: Store API key (recommended)

```bash
linear --key lin_api_your_key_here
```

The key is saved to `~/.config/linear-cli/credentials` with chmod 600 (readable only by you).

### Option 2: Environment variable

```bash
export LINEAR_API_KEY=lin_api_your_key_here
linear TEAM-123
```

### Option 3: Interactive prompt

If no key is found, the CLI will prompt you:

```
No Linear API key found.

Get your API key from: https://linear.app/settings/api

Enter your Linear API key:
```

### Precedence

1. `LINEAR_API_KEY` environment variable (for CI/scripts)
2. `~/.config/linear-cli/credentials` file
3. Interactive prompt (saves key for future use)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Configuration error (missing/invalid API key, invalid input) |
| 2 | Authentication error (invalid API key) |
| 3 | Not found (team or issue doesn't exist) |

## Use Cases

### CI/CD Integration

```bash
# Check if an issue is deployed
STATUS=$(linear TEAM-123 | jq -r '.status')
if [ "$STATUS" != "Production Deployed" ]; then
  echo "Issue TEAM-123 not yet deployed"
  exit 1
fi
```

### Filter by Assignee

```bash
# Get all issues assigned to a specific user
linear TEAM @john

# Get all unassigned issues
linear TEAM @unassigned

# Count unassigned issues
linear TEAM @unassigned | jq 'length'

# Get email addresses of all team members
linear members TEAM | jq -r '.[].email'
```

### Search Issues

```bash
# Search for issues matching keywords across all teams
linear search "auth bug"

# Search within a specific team
linear search "api error" ENG

# Search and filter results with jq
linear search "performance" | jq '[.[] | select(.status == "In Progress")]'

# Count search results
linear search "critical" | jq 'length'
```

### Filter by Date

```bash
# Get issues created in the last month
linear TEAM --created-after=2024-12-01

# Get issues updated this year
linear TEAM --updated-after=2024-01-01

# Get issues completed in a specific date range
linear TEAM --completed-after=2024-11-01 --completed-before=2024-11-30

# Combine date and assignee filters
linear TEAM @john --created-after=2024-01-01

# Get recently updated unassigned issues
linear TEAM @unassigned --updated-after=2024-12-01

# Count issues completed this month
linear TEAM --completed-after=2024-12-01 | jq 'length'
```

### Filter by Status

```bash
# Get issues ready for QA
linear TEAM | jq '[.[] | select(.status == "Ready for QA")]'

# Get issues with open PRs
linear TEAM | jq '[.[] | select(.status | contains("PR"))]'
```

### Export Issues

```bash
# Export all recent issues from a team
linear TEAM > team-issues.json
```

### Watch for Updates

```bash
# Get latest update time
linear TEAM-123 | jq -r '.updatedAt'
```

## Development

```bash
# Run in development mode
pnpm dev TEAM-123

# Type check
pnpm typecheck

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Testing

Tests use Vitest with mocked Linear SDK to avoid making real API calls. All write operations (createIssue, addComment, updateIssue) are tested with dry-run mocks.

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage
```

## Security

- **Secure storage**: API keys are stored with chmod 600 (owner read/write only)
- **No telemetry**: No data is sent anywhere except Linear's API
- **Open source**: Full source code available for audit

## Getting Your API Key

1. Go to [Linear Settings > API](https://linear.app/settings/api)
2. Click "Create key"
3. Give it a name (e.g., "CLI")
4. Copy the key (starts with `lin_api_`)

## License

ISC

## Contributing

Issues and pull requests welcome at [github.com/medeirosjoaquim/linear-cli](https://github.com/medeirosjoaquim/linear-cli).
