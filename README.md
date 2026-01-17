# Linear CLI

A command-line tool for fetching Linear ticket data as JSON. Built for automation workflows, scripting, and integration with other tools.

## Features

- **List teams** — See all accessible teams in your workspace
- **List issues** — Browse recent tickets in any team
- **Fetch full details** — Get complete issue data including comments, relations, history
- **JSON output** — Pipe to `jq`, save to files, or process programmatically
- **Secure credentials** — API key stored safely in `~/.config/linear-cli/credentials`
- **Read-only** — Cannot modify Linear data, safe for automation

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

# List recent issues in a team
./bin/linear TEAM

# Fetch full issue details
./bin/linear TEAM-123
```

## Usage

```
Usage: linear [options] [target]

Arguments:
  target              Team key (TEAM) or issue identifier (TEAM-123)

Options:
  -V, --version       output the version number
  -k, --key <apiKey>  Set and store API key
  -h, --help          display help for command
```

### Examples

```bash
# List all accessible teams
linear
# Output: [{"id": "...", "key": "TEAM", "name": "Core Team"}, ...]

# List recent issues in a team (20 most recently updated)
linear TEAM
# Output: [{"id": "...", "identifier": "TEAM-123", "title": "...", ...}, ...]

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
```

## Security

- **Read-only**: The CLI only performs read operations. It cannot create, update, or delete any Linear data.
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
