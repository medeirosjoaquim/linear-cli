import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIssue, CreateIssueInput } from '../linear-client.js';
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

describe('createIssue', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock client
    mockClient = {
      teams: vi.fn(),
      users: vi.fn(),
      createIssue: vi.fn()
    };
  });

  it('should create a basic issue with just title and team', async () => {
    // Setup mocks
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { title: 'Test Issue' };
    
    // We need to mock fetchIssueByIdentifier which is called after create
    // For dry-run test, we'll just verify the createIssue was called with correct params
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected to fail on fetchIssueByIdentifier since it's not mocked
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue'
    });
  });

  it('should throw NotFoundError when team does not exist', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });

    const input: CreateIssueInput = { title: 'Test Issue' };
    
    await expect(createIssue(mockClient as LinearClient, 'NONEXISTENT', input))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should create issue with description', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      description: 'This is a detailed description'
    };
    
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue',
      description: 'This is a detailed description'
    });
  });

  it('should resolve assignee by name', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.users.mockResolvedValue({
      nodes: [{
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        displayName: 'John'
      }]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      assignee: 'John'
    };
    
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue',
      assigneeId: 'user-123'
    });
  });

  it('should throw NotFoundError when assignee does not exist', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.users.mockResolvedValue({
      nodes: []
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      assignee: 'NonExistentUser'
    };
    
    await expect(createIssue(mockClient as LinearClient, 'ENG', input))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should create issue with priority', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      priority: 1  // Urgent
    };
    
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue',
      priority: 1
    });
  });

  it('should resolve status by name', async () => {
    const mockStates = {
      nodes: [
        { id: 'state-1', name: 'Todo' },
        { id: 'state-2', name: 'In Progress' },
        { id: 'state-3', name: 'Done' }
      ]
    };

    mockClient.teams.mockResolvedValue({
      nodes: [{ 
        id: 'team-123', 
        key: 'ENG', 
        name: 'Engineering',
        states: vi.fn().mockResolvedValue(mockStates),
        labels: vi.fn().mockResolvedValue({ nodes: [] })
      }]
    });
    
    // Override to return team with states method
    const teamWithStates = {
      id: 'team-123',
      key: 'ENG',
      name: 'Engineering',
      states: vi.fn().mockResolvedValue(mockStates),
      labels: vi.fn().mockResolvedValue({ nodes: [] })
    };
    
    mockClient.teams.mockResolvedValue({
      nodes: [teamWithStates]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      status: 'In Progress'
    };
    
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue',
      stateId: 'state-2'
    });
  });

  it('should throw NotFoundError when status does not exist', async () => {
    const mockStates = {
      nodes: [
        { id: 'state-1', name: 'Todo' },
        { id: 'state-2', name: 'Done' }
      ]
    };

    const teamWithStates = {
      id: 'team-123',
      key: 'ENG',
      name: 'Engineering',
      states: vi.fn().mockResolvedValue(mockStates),
      labels: vi.fn().mockResolvedValue({ nodes: [] })
    };
    
    mockClient.teams.mockResolvedValue({
      nodes: [teamWithStates]
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      status: 'NonExistentStatus'
    };
    
    await expect(createIssue(mockClient as LinearClient, 'ENG', input))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should resolve labels by name', async () => {
    const mockStates = {
      nodes: [{ id: 'state-1', name: 'Todo' }]
    };
    
    const mockLabels = {
      nodes: [
        { id: 'label-1', name: 'bug' },
        { id: 'label-2', name: 'feature' },
        { id: 'label-3', name: 'critical' }
      ]
    };

    const teamWithStatesAndLabels = {
      id: 'team-123',
      key: 'ENG',
      name: 'Engineering',
      states: vi.fn().mockResolvedValue(mockStates),
      labels: vi.fn().mockResolvedValue(mockLabels)
    };
    
    mockClient.teams.mockResolvedValue({
      nodes: [teamWithStatesAndLabels]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      labels: ['bug', 'critical']
    };
    
    try {
      await createIssue(mockClient as LinearClient, 'ENG', input);
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue',
      labelIds: ['label-1', 'label-3']
    });
  });

  it('should throw NotFoundError when label does not exist', async () => {
    const mockStates = {
      nodes: [{ id: 'state-1', name: 'Todo' }]
    };
    
    const mockLabels = {
      nodes: [
        { id: 'label-1', name: 'bug' }
      ]
    };

    const teamWithStatesAndLabels = {
      id: 'team-123',
      key: 'ENG',
      name: 'Engineering',
      states: vi.fn().mockResolvedValue(mockStates),
      labels: vi.fn().mockResolvedValue(mockLabels)
    };
    
    mockClient.teams.mockResolvedValue({
      nodes: [teamWithStatesAndLabels]
    });

    const input: CreateIssueInput = { 
      title: 'Test Issue',
      labels: ['nonexistent-label']
    };
    
    await expect(createIssue(mockClient as LinearClient, 'ENG', input))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should handle case-insensitive team key matching', async () => {
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }]
    });
    
    mockClient.createIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: 'issue-123',
        identifier: 'ENG-42',
        title: 'Test Issue'
      })
    });

    const input: CreateIssueInput = { title: 'Test Issue' };
    
    try {
      await createIssue(mockClient as LinearClient, 'eng', input);  // lowercase
    } catch (e) {
      // Expected
    }

    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-123',
      title: 'Test Issue'
    });
  });
});
