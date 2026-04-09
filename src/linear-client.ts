import { LinearClient, LinearError, LinearDocument } from '@linear/sdk';
import type { Comment, Issue, IssueRelation, IssueHistory, IssueSearchResult, Team } from '@linear/sdk';
import { CLIError, AuthError, NotFoundError, EXIT_CODES } from './errors.js';
import type { CommentOutput, RelationOutput, IssueRef, HistoryEntry, CompleteIssueOutput, TeamOutput, IssueListItem, TeamMemberOutput, IssueSearchOutput, SubtaskOutput } from './types.js';

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
 * Resolve children with full details for subtasks
 * @internal
 */
async function resolveSubtasks(children: Issue[]): Promise<SubtaskOutput[]> {
  return Promise.all(
    children.map(async (child) => {
      const [state, assignee, labelsConnection] = await Promise.all([
        child.state,
        child.assignee,
        child.labels(),
      ]);

      return {
        id: child.id,
        identifier: child.identifier,
        title: child.title,
        description: child.description ?? null,
        status: state?.name ?? null,
        assignee: assignee?.name ?? null,
        priority: child.priority,
        labels: labelsConnection.nodes.map((l: { name: string }) => l.name),
        createdAt: child.createdAt.toISOString(),
        updatedAt: child.updatedAt.toISOString(),
      };
    })
  );
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
  identifier: string,
  includeSubtasks: boolean = false
): Promise<CompleteIssueOutput | null> {
  parseIdentifier(identifier); // validate format

  try {
    // Linear API accepts identifier strings (e.g., "MKTG-48") directly
    const issue = await client.issue(identifier);

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

    // Resolve full subtask details if requested
    const subtasks = includeSubtasks ? await resolveSubtasks(childrenConnection.nodes) : undefined;

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
      subtasks,
      history,
    };
  } catch (error) {
    // Handle Linear SDK errors
    if (error instanceof LinearError) {
      if (error.status === 401) {
        throw new AuthError('Invalid API key');
      }
      // Treat 404 / "not found" as null return
      if (error.status === 404 || error.message?.toLowerCase().includes('not found')) {
        return null;
      }
      throw new CLIError(`Linear API error: ${error.message}`, EXIT_CODES.API_ERROR);
    }

    // Entity not found errors from the SDK (e.g., "Entity not found")
    if (error instanceof Error && error.message?.toLowerCase().includes('entity not found')) {
      return null;
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
 * Input options for creating a new issue
 */
export interface CreateIssueInput {
  title: string;
  description?: string;
  assignee?: string;
  priority?: number;
  status?: string;
  labels?: string[];
}

/**
 * Create a new Linear issue
 *
 * @param client - Linear API client
 * @param teamKey - Team key (e.g., "TEAM")
 * @param input - Issue creation input
 * @returns Created issue data
 * @throws NotFoundError if team or assignee is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function createIssue(
  client: LinearClient,
  teamKey: string,
  input: CreateIssueInput
): Promise<CompleteIssueOutput> {
  try {
    const team = await findTeamByKey(client, teamKey);

    // Build the create input
    const createInput: Record<string, unknown> = {
      teamId: team.id,
      title: input.title,
    };

    if (input.description) {
      createInput.description = input.description;
    }

    if (input.priority !== undefined) {
      createInput.priority = input.priority;
    }

    // Resolve assignee if provided
    if (input.assignee) {
      const users = await client.users();
      const user = users.nodes.find(
        (u) =>
          u.name.toLowerCase().includes(input.assignee!.toLowerCase()) ||
          u.email.toLowerCase().includes(input.assignee!.toLowerCase()) ||
          u.displayName.toLowerCase().includes(input.assignee!.toLowerCase())
      );

      if (!user) {
        throw new NotFoundError(`User not found: ${input.assignee}`);
      }
      createInput.assigneeId = user.id;
    }

    // Resolve status if provided
    if (input.status) {
      const states = await team.states();
      const targetState = states.nodes.find(
        (state) => state.name.toLowerCase() === input.status!.toLowerCase()
      );

      if (!targetState) {
        const availableStates = states.nodes.map((s) => s.name).join(', ');
        throw new NotFoundError(
          `Status not found: "${input.status}". Available statuses: ${availableStates}`
        );
      }
      createInput.stateId = targetState.id;
    }

    // Resolve labels if provided
    if (input.labels && input.labels.length > 0) {
      const teamLabels = await team.labels();
      const labelIds: string[] = [];

      for (const labelName of input.labels) {
        const label = teamLabels.nodes.find(
          (l) => l.name.toLowerCase() === labelName.toLowerCase()
        );
        if (!label) {
          const availableLabels = teamLabels.nodes.map((l) => l.name).join(', ');
          throw new NotFoundError(
            `Label not found: "${labelName}". Available labels: ${availableLabels}`
          );
        }
        labelIds.push(label.id);
      }
      createInput.labelIds = labelIds;
    }

    // Create the issue
    const payload = await client.createIssue(createInput as { teamId: string; title: string });

    if (!payload.success) {
      throw new CLIError('Failed to create issue', EXIT_CODES.UNEXPECTED);
    }

    const createdIssue = await payload.issue;
    if (!createdIssue) {
      throw new CLIError('Failed to fetch created issue', EXIT_CODES.UNEXPECTED);
    }

    // Fetch complete issue data
    const fullIssue = await fetchIssueByIdentifier(client, createdIssue.identifier);
    if (!fullIssue) {
      throw new CLIError('Failed to fetch complete issue data', EXIT_CODES.UNEXPECTED);
    }

    return fullIssue;
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

/**
 * Add a comment to a Linear issue
 *
 * @param client - Linear API client
 * @param identifier - Issue identifier (e.g., "TEAM-123")
 * @param body - Comment body text (markdown supported)
 * @returns Created comment data
 * @throws NotFoundError if issue is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function addComment(
  client: LinearClient,
  identifier: string,
  body: string
): Promise<CommentOutput> {
  parseIdentifier(identifier); // validate format

  try {
    // Fetch the issue directly by identifier
    let targetIssue;
    try {
      targetIssue = await client.issue(identifier);
    } catch {
      throw new NotFoundError(`Issue not found: ${identifier}`);
    }

    // Create the comment
    const payload = await client.createComment({
      issueId: targetIssue.id,
      body,
    });

    if (!payload.success) {
      throw new CLIError('Failed to create comment', EXIT_CODES.UNEXPECTED);
    }

    const createdComment = await payload.comment;
    if (!createdComment) {
      throw new CLIError('Failed to fetch created comment', EXIT_CODES.UNEXPECTED);
    }

    // Resolve author
    const user = await createdComment.user;

    return {
      id: createdComment.id,
      body: createdComment.body,
      createdAt: createdComment.createdAt.toISOString(),
      author: user?.name ?? null,
    };
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
 * Find a team by its key using a filtered query.
 * Uses filter parameter to find teams even when the viewer isn't a member.
 * @internal
 */
async function findTeamByKey(client: LinearClient, teamKey: string): Promise<Team> {
  const teams = await client.teams({
    filter: { key: { eq: teamKey.toUpperCase() } },
  });
  const team = teams.nodes[0];
  if (!team) {
    throw new NotFoundError(`Team not found: ${teamKey}`);
  }
  return team;
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
    const team = await findTeamByKey(client, teamKey);

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
    // Validate team exists and is accessible
    const team = await findTeamByKey(client, teamKey);

    // Build filter using team ID
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
 * Search issues using natural language query
 *
 * @param client - Linear API client
 * @param term - Search term/keywords
 * @param teamKey - Optional team key to restrict search to
 * @param limit - Maximum number of results (default 20)
 * @returns Array of IssueSearchOutput objects
 * @throws NotFoundError if team is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function searchIssues(
  client: LinearClient,
  term: string,
  teamKey?: string,
  limit: number = 20
): Promise<IssueSearchOutput[]> {
  try {
    let teamId: string | undefined;

    // If team key provided, resolve it to team ID
    if (teamKey) {
      const team = await findTeamByKey(client, teamKey);
      teamId = team.id;
    }

    // Perform search
    const searchPayload = await client.searchIssues(term, {
      teamId,
      first: limit,
    });

    // Resolve lazy-loaded fields for each result
    const results = await Promise.all(
      searchPayload.nodes.map(async (result: IssueSearchResult) => {
        const [state, assignee] = await Promise.all([
          result.state,
          result.assignee,
        ]);

        return {
          id: result.id,
          identifier: result.identifier,
          title: result.title,
          description: result.description ?? null,
          status: state?.name ?? null,
          assignee: assignee?.name ?? null,
          priority: result.priority,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString(),
        };
      })
    );

    return results;
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
 * Input options for updating an existing issue
 */
export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: string;
}

/**
 * Update a Linear issue's title, description, and/or status
 *
 * @param client - Linear API client
 * @param identifier - Issue identifier (e.g., "TEAM-123")
 * @param input - Fields to update (title, description, status)
 * @returns Updated issue data
 * @throws NotFoundError if issue or status is not found
 * @throws AuthError if authentication fails (401)
 * @throws CLIError for other API errors
 */
export async function updateIssue(
  client: LinearClient,
  identifier: string,
  input: UpdateIssueInput
): Promise<CompleteIssueOutput> {
  parseIdentifier(identifier); // validate format

  try {
    // Fetch the issue directly by identifier
    let targetIssue;
    try {
      targetIssue = await client.issue(identifier);
    } catch {
      throw new NotFoundError(`Issue not found: ${identifier}`);
    }

    const updateFields: Record<string, unknown> = {};

    if (input.title !== undefined) {
      updateFields.title = input.title;
    }

    if (input.description !== undefined) {
      updateFields.description = input.description;
    }

    // Resolve status name to state ID if provided
    if (input.status) {
      const team = await targetIssue.team;
      if (!team) {
        throw new CLIError(`Cannot determine team for issue: ${identifier}`, EXIT_CODES.UNEXPECTED);
      }

      const states = await team.states();
      const targetState = states.nodes.find(
        (state) => state.name.toLowerCase() === input.status!.toLowerCase()
      );

      if (!targetState) {
        const availableStates = states.nodes.map((s) => s.name).join(', ');
        throw new NotFoundError(
          `Status not found: "${input.status}". Available statuses: ${availableStates}`
        );
      }

      updateFields.stateId = targetState.id;
    }

    // Update the issue
    const updatePayload = await client.updateIssue(targetIssue.id, updateFields);

    const updateResult = await updatePayload.issue;
    if (!updateResult) {
      throw new CLIError('Failed to update issue', EXIT_CODES.UNEXPECTED);
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

