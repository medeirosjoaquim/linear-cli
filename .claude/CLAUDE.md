# Linear CLI

A command-line tool for fetching and updating Linear ticket data as JSON. Located at `/home/asari/dojo/linear-cli/bin/linear`.

## Key Characteristics

- All output is JSON to stdout, errors to stderr
- Exit codes: 0=success, 1=config error, 2=auth error, 3=not found
- API key priority: `LINEAR_API_KEY` env var > `~/.linear/credentials`
- Get your key from: https://linear.app/settings/api

## Commands

### Authentication
```bash
linear auth login               # Interactive login (prompts for API key)
linear --key lin_api_xxx        # Store API key directly
```

### Teams
```bash
linear                          # List all accessible teams
linear members TEAM             # List all members of a specific team
```

### Search
```bash
linear search <keywords>        # Search issues across all teams
linear search <keywords> TEAM   # Search issues within a specific team
```

### Team Issues
```bash
linear TEAM                     # List recent issues in a team (20 most recent)
linear TEAM @username           # Filter issues by assignee
linear TEAM @unassigned         # List unassigned issues
```

### Date Filtering
```bash
linear TEAM --created-after=YYYY-MM-DD
linear TEAM --created-before=YYYY-MM-DD
linear TEAM --updated-after=YYYY-MM-DD
linear TEAM --updated-before=YYYY-MM-DD
linear TEAM --completed-after=YYYY-MM-DD
linear TEAM --completed-before=YYYY-MM-DD

# Combined with assignee filter
linear TEAM @john --completed-after=2024-01-01
```

### Single Issue
```bash
linear TEAM-123                 # Fetch complete details for a specific issue
linear TEAM-123 --subtasks      # Fetch issue with full subtask details
linear TEAM-123 --status "Done" # Update issue status
```

### Create Issue
```bash
linear create TEAM --title "Fix bug"                          # Create issue (title required)
linear create TEAM -t "Fix bug" -d "Details here"             # With description
linear create TEAM -t "Fix bug" -a "john" -p 2                # With assignee and priority
linear create TEAM -t "Fix bug" -l "bug,frontend"             # With labels
linear create TEAM -t "Fix bug" --status "In Progress"        # With initial status
```

### Add Comment
```bash
linear comment TEAM-123 "This is a comment"                   # Add comment to issue
```

## Options Reference

| Option | Description |
|--------|-------------|
| `-k, --key <apiKey>` | Set and store API key |
| `-s, --status <status>` | Update issue status (use with issue identifier) |
| `--subtasks` | Include full details of all subtasks when fetching an issue |
| `--created-after <date>` | Filter issues created after date (ISO 8601 or YYYY-MM-DD) |
| `--created-before <date>` | Filter issues created before date |
| `--updated-after <date>` | Filter issues updated after date |
| `--updated-before <date>` | Filter issues updated before date |
| `--completed-after <date>` | Filter issues completed after date |
| `--completed-before <date>` | Filter issues completed before date |
| `-t, --title <title>` | Issue title (required for create command) |
| `-d, --description <desc>` | Issue description (for create command) |
| `-a, --assignee <assignee>` | Assignee name/email (for create command) |
| `-p, --priority <priority>` | Priority: 1=Urgent, 2=High, 3=Normal, 4=Low (for create command) |
| `-l, --labels <labels>` | Comma-separated labels (for create command) |

## JSON Output Schemas

### Single Issue (`linear TEAM-123`)
```json
{
  "id": "uuid",
  "identifier": "TEAM-123",
  "title": "string",
  "description": "string",
  "status": "string",
  "assignee": "string",
  "priority": 1,
  "labels": ["string"],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "comments": [{"id": "uuid", "body": "string", "createdAt": "ISO-8601", "author": "string"}],
  "relations": [{"type": "blocks|blocked-by|related|duplicate", "issue": {"id": "uuid", "identifier": "TEAM-456", "title": "string"}}],
  "parent": {"id": "uuid", "identifier": "TEAM-100"},
  "children": [{"id": "uuid", "identifier": "TEAM-124"}],
  "subtasks": [
    {
      "id": "uuid",
      "identifier": "TEAM-124",
      "title": "string",
      "description": "string",
      "status": "string",
      "assignee": "string",
      "priority": 1,
      "labels": ["string"],
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "history": [{"id": "uuid", "createdAt": "ISO-8601", "actor": "string", "fromState": "string", "toState": "string"}]
}
```

**Notes:**
- `subtasks` field is only present when using `--subtasks` flag
- `children` always contains basic refs {id, identifier}
- `status`, `assignee`, and `labels[]` are flat strings, NOT objects

### Team Issues List (`linear TEAM`)
```json
[
  {
    "id": "uuid",
    "identifier": "TEAM-123",
    "title": "string",
    "status": "string",
    "assignee": "string",
    "updatedAt": "ISO-8601"
  }
]
```

### Search Results (`linear search "keywords"`)
```json
[
  {
    "id": "uuid",
    "identifier": "TEAM-123",
    "title": "string",
    "description": "string",
    "status": "string",
    "assignee": "string",
    "priority": 1,
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
]
```

### Team Members (`linear members TEAM`)
```json
[
  {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "displayName": "string",
    "avatarUrl": "string|null",
    "isActive": true
  }
]
```

### Created Issue (`linear create TEAM ...`)
Returns the same full issue object as `linear TEAM-123`.

### Comment (`linear comment TEAM-123 "text"`)
```json
{"id": "uuid", "body": "string", "createdAt": "ISO-8601", "author": "string"}
```

## Common Usage Patterns

```bash
# Pretty-print with jq
linear ENG-123 | jq

# Count issues
linear ENG | jq 'length'

# Extract specific fields
linear ENG | jq '.[] | {id: .identifier, title: .title, assignee: .assignee}'

# Get issue details
linear ENG-123 | jq '{identifier, title, status, description}'

# Get comments from an issue
linear ENG-123 | jq '.comments[] | {author, body}'

# Get subtasks with full details
linear ENG-123 --subtasks | jq '.subtasks[] | {identifier, title, status, assignee}'

# Filter search results
linear search "critical" | jq '[.[] | select(.status == "In Progress")]'

# Count search results
linear search "bug" | jq 'length'

# Create issue and get identifier
linear create ENG -t "Fix auth bug" -d "Details" | jq '.identifier'
```

## Status Values

Common status values (case-insensitive when updating):
- `Todo`
- `In Progress`
- `QA Testing`
- `Staging/ Pre-Pro Deployed`
- `Ready For Production`
- `Duplicate`

## When to Use

- Searching for issues by keywords across all teams or within a specific team
- Checking issue status and details
- Finding issues assigned to specific team members
- Tracking unassigned work in a team
- Filtering issues by creation/update/completion dates
- Getting structured data about Linear tickets for analysis or reporting
- Updating issue status as part of workflow automation
- Fetching subtask details with parent issue in a single command
- Creating new issues with title, description, assignee, priority, labels, and initial status
- Adding comments to existing issues
