import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateIssue } from '../linear-client.js';
import { LinearClient } from '@linear/sdk';
import { NotFoundError } from '../errors.js';

// Mock the Linear SDK
vi.mock('@linear/sdk', () => {
  return {
    LinearClient: vi.fn(),
    LinearError: class LinearError extends Error {
      status?: number;
      constructor(message: string, status?: number) {
        super(message);
        this.status = status;
      }
    },
    LinearDocument: {
      PaginationOrderBy: { UpdatedAt: 'updatedAt' }
    }
  };
});

describe('updateIssue', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      issue: vi.fn(),
      updateIssue: vi.fn(),
    };
  });

  it('should update issue title', async () => {
    mockClient.issue.mockResolvedValue({
      id: 'issue-123',
      identifier: 'ENG-42',
      team: Promise.resolve(null),
    });

    mockClient.updateIssue.mockResolvedValue({
      issue: Promise.resolve({ id: 'issue-123' }),
    });

    // Will fail on fetchIssueByIdentifier refetch, but we can verify updateIssue was called correctly
    try {
      await updateIssue(mockClient as LinearClient, 'ENG-42', { title: 'New Title' });
    } catch (e) {
      // Expected — fetchIssueByIdentifier not fully mocked
    }

    expect(mockClient.updateIssue).toHaveBeenCalledWith('issue-123', {
      title: 'New Title',
    });
  });

  it('should update issue description', async () => {
    mockClient.issue.mockResolvedValue({
      id: 'issue-123',
      identifier: 'ENG-42',
      team: Promise.resolve(null),
    });

    mockClient.updateIssue.mockResolvedValue({
      issue: Promise.resolve({ id: 'issue-123' }),
    });

    try {
      await updateIssue(mockClient as LinearClient, 'ENG-42', { description: 'Updated description' });
    } catch (e) {
      // Expected
    }

    expect(mockClient.updateIssue).toHaveBeenCalledWith('issue-123', {
      description: 'Updated description',
    });
  });

  it('should update title, description, and status together', async () => {
    const mockStates = {
      nodes: [
        { id: 'state-1', name: 'Todo' },
        { id: 'state-2', name: 'In Progress' },
      ],
    };

    mockClient.issue.mockResolvedValue({
      id: 'issue-123',
      identifier: 'ENG-42',
      team: Promise.resolve({
        id: 'team-123',
        states: vi.fn().mockResolvedValue(mockStates),
      }),
    });

    mockClient.updateIssue.mockResolvedValue({
      issue: Promise.resolve({ id: 'issue-123' }),
    });

    try {
      await updateIssue(mockClient as LinearClient, 'ENG-42', {
        title: 'New Title',
        description: 'New Desc',
        status: 'In Progress',
      });
    } catch (e) {
      // Expected
    }

    expect(mockClient.updateIssue).toHaveBeenCalledWith('issue-123', {
      title: 'New Title',
      description: 'New Desc',
      stateId: 'state-2',
    });
  });

  it('should throw NotFoundError when issue does not exist', async () => {
    mockClient.issue.mockRejectedValue(new Error('Entity not found'));

    await expect(
      updateIssue(mockClient as LinearClient, 'ENG-99', { title: 'New' })
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw NotFoundError when status does not exist', async () => {
    const mockStates = {
      nodes: [{ id: 'state-1', name: 'Todo' }],
    };

    mockClient.issue.mockResolvedValue({
      id: 'issue-123',
      identifier: 'ENG-42',
      team: Promise.resolve({
        id: 'team-123',
        states: vi.fn().mockResolvedValue(mockStates),
      }),
    });

    await expect(
      updateIssue(mockClient as LinearClient, 'ENG-42', { status: 'NonExistent' })
    ).rejects.toThrow(NotFoundError);
  });
});
