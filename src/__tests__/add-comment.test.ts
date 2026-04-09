import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addComment } from '../linear-client.js';
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

describe('addComment', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      issue: vi.fn(),
      createComment: vi.fn()
    };
  });

  it('should add a comment to an existing issue', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const mockUser = { name: 'John Doe' };
    const mockComment = {
      id: 'comment-456',
      body: 'This is a test comment',
      createdAt: new Date('2024-01-15T10:30:00Z'),
      user: Promise.resolve(mockUser)
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    const result = await addComment(mockClient as LinearClient, 'ENG-42', 'This is a test comment');

    expect(mockClient.createComment).toHaveBeenCalledWith({
      issueId: 'issue-123',
      body: 'This is a test comment'
    });

    expect(result).toEqual({
      id: 'comment-456',
      body: 'This is a test comment',
      createdAt: '2024-01-15T10:30:00.000Z',
      author: 'John Doe'
    });
  });

  it('should add a comment with markdown content', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const mockUser = { name: 'Jane Smith' };
    const markdownBody = `# Heading

- List item 1
- List item 2

**Bold text** and *italic text*`;

    const mockComment = {
      id: 'comment-789',
      body: markdownBody,
      createdAt: new Date('2024-01-15T12:00:00Z'),
      user: Promise.resolve(mockUser)
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    const result = await addComment(mockClient as LinearClient, 'ENG-42', markdownBody);

    expect(mockClient.createComment).toHaveBeenCalledWith({
      issueId: 'issue-123',
      body: markdownBody
    });

    expect(result.body).toBe(markdownBody);
    expect(result.author).toBe('Jane Smith');
  });

  it('should throw NotFoundError when issue does not exist', async () => {
    mockClient.issue.mockRejectedValue(new Error('Entity not found'));

    await expect(addComment(mockClient as LinearClient, 'ENG-999', 'Test comment'))
      .rejects
      .toThrow(NotFoundError);

    expect(mockClient.createComment).not.toHaveBeenCalled();
  });

  it('should handle comment with null author (system comment)', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const mockComment = {
      id: 'comment-101',
      body: 'System generated comment',
      createdAt: new Date('2024-01-15T14:00:00Z'),
      user: Promise.resolve(null)
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    const result = await addComment(mockClient as LinearClient, 'ENG-42', 'System generated comment');

    expect(result.author).toBeNull();
  });

  it('should handle case-insensitive issue identifier', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const mockComment = {
      id: 'comment-111',
      body: 'Test',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      user: Promise.resolve({ name: 'User' })
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    // Test lowercase identifier
    await addComment(mockClient as LinearClient, 'eng-42', 'Test');

    expect(mockClient.createComment).toHaveBeenCalled();
  });

  it('should throw error when createComment fails', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    mockClient.createComment.mockResolvedValue({
      success: false,
      comment: Promise.resolve(null)
    });

    await expect(addComment(mockClient as LinearClient, 'ENG-42', 'Test'))
      .rejects
      .toThrow('Failed to create comment');
  });

  it('should handle multi-line comment text', async () => {
    const mockIssue = {
      id: 'issue-123',
      identifier: 'ENG-42',
      title: 'Test Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const multiLineBody = `First line
Second line
Third line with some details here.

Final line.`;

    const mockComment = {
      id: 'comment-222',
      body: multiLineBody,
      createdAt: new Date('2024-01-15T16:00:00Z'),
      user: Promise.resolve({ name: 'Developer' })
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    const result = await addComment(mockClient as LinearClient, 'ENG-42', multiLineBody);

    expect(result.body).toBe(multiLineBody);
    expect(result.body.split('\n').length).toBe(5);
  });

  it('should use issue id from client.issue() for the comment', async () => {
    const mockIssue = {
      id: 'issue-222',
      identifier: 'DES-42',
      title: 'DES Issue'
    };

    mockClient.issue.mockResolvedValue(mockIssue);

    const mockComment = {
      id: 'comment-333',
      body: 'Comment on DES-42',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      user: Promise.resolve({ name: 'Tester' })
    };

    mockClient.createComment.mockResolvedValue({
      success: true,
      comment: Promise.resolve(mockComment)
    });

    await addComment(mockClient as LinearClient, 'DES-42', 'Comment on DES-42');

    // Should use the DES-42 issue id
    expect(mockClient.createComment).toHaveBeenCalledWith({
      issueId: 'issue-222',
      body: 'Comment on DES-42'
    });
  });
});
