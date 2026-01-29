import { LinearClient, LinearError, LinearDocument } from '@linear/sdk';
import type { Comment, IssueRelation, IssueHistory } from '@linear/sdk';
import { CLIError, AuthError, NotFoundError, EXIT_CODES } from './errors.js';
import type { CommentOutput, RelationOutput, IssueRef, HistoryEntry, CompleteIssueOutput, TeamOutput, IssueListItem, TeamMemberOutput } from './types.js';

/**
 * Regex for parsing issue identifiers (e.g., "TEAM-123", "DEV456")
 * Captures: [1] = team key, [2] = issue number
 */
const IDENTIFIER_REGEX = /^([A-Za-z]+)-?(\d+)$/;

/**
 * Create a new Linear API client
 */
export function createLinearClient(apiKey: string): LinearClient {
  return new LinearClient({ apiKey });
}

/**
 * Parse an issue identifier into its components
 * @param identifier - Issue identifier (e.g., "TEAM-123")
 * @returns Parsed components: teamKey and number
 * @throws CLIError if identifier format is invalid
 */
function parseIdentifier(identifier: string): { teamKey: string; number: number } {
  const match = identifier.match(IDENTIFIER_REGEX);
  if (!match) {
    throw new CLIError(
      `Invalid issue identifier: ${identifier}. Expected format: TEAM-123`,
      EXIT_CODES.CONFIG_ERROR
    );
  }
  return {
    teamKey: match[1].toUpperCase(),
    number: parseInt(match[2], 10),
  };
}

/**
 * Resolve comments with author information
 * @internal
 */
async function resolveComments(comments: Comment[]): Promise<CommentOutput[]> {
  return Promise.all(
    comments.map(async (comment) => {
      const user = await comment.user;
      return {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: user?.name ?? null,
      };
    })
  );
}

/**
 * Resolve relations including inverse (blocked-by)
 * @internal
 */
async function resolveRelations(
  relations: IssueRelation[],
  inverseRelations: IssueRelation[]
): Promise<RelationOutput[]> {
  const result: RelationOutput[] = [];

  // Outgoing relations: this issue blocks/relates-to/duplicates another
  for (const rel of relations) {
    // Filter out 'similar' relation type
    if (rel.type === 'similar') continue;
    const relatedIssue = await rel.relatedIssue;
    // Skip if related issue is undefined (shouldn't happen but SDK types allow it)
    if (!relatedIssue) continue;
    result.push({
      type: rel.type as 'blocks' | 'related' | 'duplicate',
      issue: {
        id: relatedIssue.id,
        identifier: relatedIssue.identifier,
        title: relatedIssue.title,
      },
    });
  }

  // Inverse relations: another issue blocks/relates-to this issue
  for (const rel of inverseRelations) {
    // Filter out 'similar' relation type
    if (rel.type === 'similar') continue;
    const sourceIssue = await rel.issue;
    // Skip if source issue is undefined (shouldn't happen but SDK types allow it)
    if (!sourceIssue) continue;
    // Map 'blocks' to 'blocked-by' for inverse relations
    const type = rel.type === 'blocks' ? 'blocked-by' : (rel.type as 'related' | 'duplicate');
    result.push({
      type,
      issue: {
        id: sourceIssue.id,
        identifier: sourceIssue.identifier,
        title: sourceIssue.title,
      },
    });
  }

  return result;
}

/**
 * Resolve history entries with actor and state information
 * @internal
 */
async function resolveHistory(entries: IssueHistory[]): Promise<HistoryEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const [actor, fromState, toState, fromAssignee, toAssignee] = await Promise.all([
        entry.actor,
        entry.fromState,
        entry.toState,
        entry.fromAssignee,
        entry.toAssignee,
      ]);

      return {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        actor: actor?.name ?? null,
        fromState: fromState?.name ?? null,
        toState: toState?.name ?? null,
        fromAssignee: fromAssignee?.name ?? null,
        toAssignee: toAssignee?.name ?? null,
        addedLabels: entry.addedLabels?.map((l) => l.name) ?? [],
        removedLabels: entry.removedLabels?.map((l) => l.name) ?? [],
      };
    })
  );
}

/**
 * Fetch a Linear issue by its identifier
 *
 * @param client - Linear API client
 * @param identifier - Issue identifier (e.g., "TEAM-123")
 * @returns CompleteIssueOutput if found, null if not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function fetchIssueByIdentifier(
  client: LinearClient,
  identifier: string
): Promise<CompleteIssueOutput | null> {
  const { number } = parseIdentifier(identifier);

  try {
    // Query issues by number (identifier filter not directly supported)
    const issues = await client.issues({
      filter: { number: { eq: number } },
      first: 10, // Multiple teams may have same issue number
    });

    // Find exact identifier match (case-insensitive)
    for (const issue of issues.nodes) {
      if (issue.identifier.toUpperCase() === identifier.toUpperCase()) {
        // Fetch all nested data in parallel (core fields + complete data)
        const [
          state,
          assignee,
          labelsConnection,
          commentsConnection,
          relationsConnection,
          inverseRelationsConnection,
          childrenConnection,
          parent,
          historyConnection,
        ] = await Promise.all([
          issue.state,
          issue.assignee,
          issue.labels(),
          issue.comments(),
          issue.relations(),
          issue.inverseRelations(),
          issue.children(),
          issue.parent,
          issue.history(),
        ]);

        // Resolve nested data (comments, relations, history) in parallel
        const [comments, relations, history] = await Promise.all([
          resolveComments(commentsConnection.nodes),
          resolveRelations(relationsConnection.nodes, inverseRelationsConnection.nodes),
          resolveHistory(historyConnection.nodes),
        ]);

        const labels = labelsConnection.nodes.map((l) => l.name);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? null,
          status: state?.name ?? null,
          assignee: assignee?.name ?? null,
          priority: issue.priority,
          labels,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
          comments,
          relations,
          parent: parent ? { id: parent.id, identifier: parent.identifier } : null,
          children: childrenConnection.nodes.map((c) => ({ id: c.id, identifier: c.identifier })),
          history,
        };
      }
    }

    // No matching issue found
    return null;
  } catch (error) {
    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Re-throw CLIError (e.g., from parseIdentifier)
    if (error instanceof CLIError) {
      throw error;
    }

    // Unexpected error
    throw new CLIError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.UNEXPECTED
    );
  }
}

/**
 * List all accessible teams in the organization
 *
 * @param client - Linear API client
 * @returns Array of TeamOutput objects
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function listTeams(client: LinearClient): Promise<TeamOutput[]> {
  try {
    const teams = await client.teams();

    return teams.nodes.map((team) => ({
      id: team.id,
      key: team.key,
      name: team.name,
    }));
  } catch (error) {
    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Unexpected error
    throw new CLIError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.UNEXPECTED
    );
  }
}

/**
 * List all members of a team
 *
 * @param client - Linear API client
 * @param teamKey - Team key (e.g., "TEAM")
 * @returns Array of TeamMemberOutput objects
 * @throws NotFoundError if team is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function listTeamMembers(
  client: LinearClient,
  teamKey: string
): Promise<TeamMemberOutput[]> {
  try {
    // First find the team by key (case-insensitive)
    const teams = await client.teams();
    const team = teams.nodes.find(
      (t) => t.key.toUpperCase() === teamKey.toUpperCase()
    );

    if (!team) {
      throw new NotFoundError(`Team not found: ${teamKey}`);
    }

    // Fetch team members
    const membersConnection = await team.members();

    return membersConnection.nodes.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      isActive: user.active,
    }));
  } catch (error) {
    // Re-throw NotFoundError as-is
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Unexpected error
    throw new CLIError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.UNEXPECTED
    );
  }
}

/**
 * Date filters for issue queries
 */
export interface DateFilters {
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
}

/**
 * Parse and validate a date string
 * @param dateStr - Date string in ISO 8601 or YYYY-MM-DD format
 * @returns ISO 8601 date string
 * @throws CLIError if date is invalid
 */
function parseDate(dateStr: string, fieldName: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new CLIError(
      `Invalid date for ${fieldName}: ${dateStr}. Use ISO 8601 or YYYY-MM-DD format.`,
      EXIT_CODES.CONFIG_ERROR
    );
  }
  return date.toISOString();
}

/**
 * List recent issues for a team
 *
 * @param client - Linear API client
 * @param teamKey - Team key (e.g., "TEAM")
 * @param limit - Maximum number of issues to return (default 20)
 * @param assigneeFilter - Optional assignee filter (username/email/displayName or "unassigned")
 * @param dateFilters - Optional date range filters
 * @returns Array of IssueListItem objects
 * @throws NotFoundError if team is not found or assignee not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function listTeamIssues(
  client: LinearClient,
  teamKey: string,
  limit: number = 20,
  assigneeFilter?: string,
  dateFilters?: DateFilters
): Promise<IssueListItem[]> {
  try {
    // First find the team by key (case-insensitive)
    const teams = await client.teams();
    const team = teams.nodes.find(
      (t) => t.key.toUpperCase() === teamKey.toUpperCase()
    );

    if (!team) {
      throw new NotFoundError(`Team not found: ${teamKey}`);
    }

    // Build filter object
    const filter: any = { team: { id: { eq: team.id } } };

    // Add assignee filter if provided
    if (assigneeFilter) {
      if (assigneeFilter.toLowerCase() === 'unassigned') {
        // Filter for issues with no assignee
        filter.assignee = { null: true };
      } else {
        // Find user by name, email, or displayName
        const users = await client.users();
        const user = users.nodes.find(
          (u) =>
            u.name.toLowerCase().includes(assigneeFilter.toLowerCase()) ||
            u.email.toLowerCase().includes(assigneeFilter.toLowerCase()) ||
            u.displayName.toLowerCase().includes(assigneeFilter.toLowerCase())
        );

        if (!user) {
          throw new NotFoundError(`User not found: ${assigneeFilter}`);
        }

        filter.assignee = { id: { eq: user.id } };
      }
    }

    // Add date filters if provided
    if (dateFilters) {
      if (dateFilters.createdAfter) {
        filter.createdAt = filter.createdAt || {};
        filter.createdAt.gte = parseDate(dateFilters.createdAfter, 'created-after');
      }
      if (dateFilters.createdBefore) {
        filter.createdAt = filter.createdAt || {};
        filter.createdAt.lte = parseDate(dateFilters.createdBefore, 'created-before');
      }
      if (dateFilters.updatedAfter) {
        filter.updatedAt = filter.updatedAt || {};
        filter.updatedAt.gte = parseDate(dateFilters.updatedAfter, 'updated-after');
      }
      if (dateFilters.updatedBefore) {
        filter.updatedAt = filter.updatedAt || {};
        filter.updatedAt.lte = parseDate(dateFilters.updatedBefore, 'updated-before');
      }
      if (dateFilters.completedAfter) {
        filter.completedAt = filter.completedAt || {};
        filter.completedAt.gte = parseDate(dateFilters.completedAfter, 'completed-after');
      }
      if (dateFilters.completedBefore) {
        filter.completedAt = filter.completedAt || {};
        filter.completedAt.lte = parseDate(dateFilters.completedBefore, 'completed-before');
      }
    }

    // Fetch issues for this team, ordered by updated
    const issues = await client.issues({
      filter,
      first: limit,
      orderBy: LinearDocument.PaginationOrderBy.UpdatedAt,
    });

    // Resolve lazy-loaded fields (state, assignee) in parallel
    return Promise.all(
      issues.nodes.map(async (issue) => {
        const [state, assignee] = await Promise.all([
          issue.state,
          issue.assignee,
        ]);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          status: state?.name ?? null,
          assignee: assignee?.name ?? null,
          updatedAt: issue.updatedAt.toISOString(),
        };
      })
    );
  } catch (error) {
    // Re-throw NotFoundError as-is
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Unexpected error
    throw new CLIError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.UNEXPECTED
    );
  }
}

/**
 * Update the status of a Linear issue
 *
 * @param client - Linear API client
 * @param identifier - Issue identifier (e.g., "TEAM-123")
 * @param statusName - New status name (e.g., "In Progress")
 * @returns Updated issue data
 * @throws NotFoundError if issue or status is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function updateIssueStatus(
  client: LinearClient,
  identifier: string,
  statusName: string
): Promise<CompleteIssueOutput> {
  const { number } = parseIdentifier(identifier);

  try {
    // First, find the issue
    const issues = await client.issues({
      filter: { number: { eq: number } },
      first: 10,
    });

    let targetIssue = null;
    for (const issue of issues.nodes) {
      if (issue.identifier.toUpperCase() === identifier.toUpperCase()) {
        targetIssue = issue;
        break;
      }
    }

    if (!targetIssue) {
      throw new NotFoundError(`Issue not found: ${identifier}`);
    }

    // Get the team to find available workflow states
    const team = await targetIssue.team;
    if (!team) {
      throw new CLIError(`Cannot determine team for issue: ${identifier}`, EXIT_CODES.UNEXPECTED);
    }

    const states = await team.states();
    const targetState = states.nodes.find(
      (state) => state.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!targetState) {
      const availableStates = states.nodes.map((s) => s.name).join(', ');
      throw new NotFoundError(
        `Status not found: "${statusName}". Available statuses: ${availableStates}`
      );
    }

    // Update the issue status
    const updatePayload = await client.updateIssue(targetIssue.id, {
      stateId: targetState.id,
    });

    const updateResult = await updatePayload.issue;
    if (!updateResult) {
      throw new CLIError('Failed to update issue status', EXIT_CODES.UNEXPECTED);
    }

    // Fetch complete updated issue data
    const updatedIssue = await fetchIssueByIdentifier(client, identifier);
    if (!updatedIssue) {
      throw new CLIError('Failed to fetch updated issue', EXIT_CODES.UNEXPECTED);
    }

    return updatedIssue;
  } catch (error) {
    // Re-throw known error types
    if (error instanceof NotFoundError || error instanceof CLIError) {
      throw error;
    }

    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Unexpected error
    throw new CLIError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.UNEXPECTED
    );
  }
}

