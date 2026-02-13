import { z } from 'zod';

/**
 * Schema for validating issue identifiers (e.g., "TEAM-123", "DEV-456")
 * Supports optional dash between team key and number
 */
export const IdentifierSchema = z
  .string()
  .regex(/^[A-Za-z]+-?\d+$/, 'Invalid identifier format. Expected: TEAM-123');

/**
 * Enum for all possible Linear issue statuses
 * These statuses represent the workflow states for issues
 */
export enum IssueStatus {
  Todo = 'Todo',
  InProgress = 'In Progress',
  QATesting = 'QA Testing',
  StagingPreProDeployed = 'Staging/ Pre-Pro Deployed',
  ReadyForProduction = 'Ready For Production',
  Duplicate = 'Duplicate',
}

/**
 * Zod schema for validating issue status values
 */
export const IssueStatusSchema = z.enum([
  'Todo',
  'In Progress',
  'QA Testing',
  'Staging/ Pre-Pro Deployed',
  'Ready For Production',
  'Duplicate',
]);

/**
 * Schema for issue output data
 * Represents the standardized output format for Linear issues
 */
export const IssueOutputSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string().nullable(),
  assignee: z.string().nullable(),
  priority: z.number(), // 0=No priority, 1=Urgent, 2=High, 3=Normal, 4=Low
  labels: z.array(z.string()),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(), // ISO date string
});

/**
 * Type representing a Linear issue in output format
 */
export type IssueOutput = z.infer<typeof IssueOutputSchema>;

/**
 * Schema for comment output data
 */
export const CommentOutputSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(), // ISO date string
  author: z.string().nullable(),
});

/**
 * Schema for issue relation output data
 */
export const RelationOutputSchema = z.object({
  type: z.enum(['blocks', 'blocked-by', 'related', 'duplicate']),
  issue: z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
  }),
});

/**
 * Schema for issue reference (parent/children)
 */
export const IssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string(),
});

/**
 * Schema for subtask output data (full details)
 */
export const SubtaskOutputSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string().nullable(),
  assignee: z.string().nullable(),
  priority: z.number(),
  labels: z.array(z.string()),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(), // ISO date string
});

/**
 * Schema for history entry output data
 */
export const HistoryEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(), // ISO date string
  actor: z.string().nullable(),
  fromState: z.string().nullable(),
  toState: z.string().nullable(),
  fromAssignee: z.string().nullable(),
  toAssignee: z.string().nullable(),
  addedLabels: z.array(z.string()),
  removedLabels: z.array(z.string()),
});

/**
 * Schema for complete issue output with all nested data
 * Extends IssueOutputSchema with comments, relations, parent/child, and history
 */
export const CompleteIssueOutputSchema = IssueOutputSchema.extend({
  comments: z.array(CommentOutputSchema),
  relations: z.array(RelationOutputSchema),
  parent: IssueRefSchema.nullable(),
  children: z.array(IssueRefSchema),
  subtasks: z.array(SubtaskOutputSchema).optional(), // Full subtask details when --subtasks flag is used
  history: z.array(HistoryEntrySchema),
});

/**
 * Type representing a comment in output format
 */
export type CommentOutput = z.infer<typeof CommentOutputSchema>;

/**
 * Type representing an issue relation in output format
 */
export type RelationOutput = z.infer<typeof RelationOutputSchema>;

/**
 * Type representing an issue reference (for parent/children)
 */
export type IssueRef = z.infer<typeof IssueRefSchema>;

/**
 * Type representing a subtask with full details
 */
export type SubtaskOutput = z.infer<typeof SubtaskOutputSchema>;

/**
 * Type representing a history entry in output format
 */
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/**
 * Type representing a complete issue with all nested data
 */
export type CompleteIssueOutput = z.infer<typeof CompleteIssueOutputSchema>;

/**
 * Schema for team output data
 * Represents a team in the organization
 */
export const TeamOutputSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

/**
 * Type representing a team in output format
 */
export type TeamOutput = z.infer<typeof TeamOutputSchema>;

/**
 * Schema for issue list item output data
 * Represents a summarized issue for listing purposes
 */
export const IssueListItemSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  status: z.string().nullable(),
  assignee: z.string().nullable(),
  updatedAt: z.string(), // ISO date string
});

/**
 * Type representing an issue list item in output format
 */
export type IssueListItem = z.infer<typeof IssueListItemSchema>;

/**
 * Schema for team member output data
 * Represents a user who is a member of a team
 */
export const TeamMemberOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isActive: z.boolean(),
});

/**
 * Type representing a team member in output format
 */
export type TeamMemberOutput = z.infer<typeof TeamMemberOutputSchema>;

/**
 * Schema for issue search result output data
 * Represents a search result with relevance scoring
 */
export const IssueSearchOutputSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string().nullable(),
  assignee: z.string().nullable(),
  priority: z.number(),
  createdAt: z.string(), // ISO date string
  updatedAt: z.string(), // ISO date string
});

/**
 * Type representing an issue search result in output format
 */
export type IssueSearchOutput = z.infer<typeof IssueSearchOutputSchema>;
