
const communityController = require('../../controllers/communityController');
const { AppError } = require('../../middleware/errorHandler');

// Mock dependencies
jest.mock('../../config/database', () => ({
  sequelize: {
    query: jest.fn()
  }
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/analyticsService', () => ({
  trackEvent: jest.fn()
}));

describe('Community Controller Security - Input Validation', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: 'user-123' },
      body: {},
      params: {}
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();

    // Default mock for DB to avoid crashes on valid flows
    const { sequelize } = require('../../config/database');
    sequelize.query.mockResolvedValue([[{ id: 'item-123' }]]);
  });

  describe('createPost', () => {
    it('should throw error if content is not a string', async () => {
      req.body = {
        title: 'Valid Title',
        content: { hack: 'object' },
        guildId: 'guild-123'
      };

      await communityController.createPost(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toMatch(/content must be/i);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should throw error if title is too long', async () => {
        req.body = {
          title: 'A'.repeat(201), // 201 chars
          content: 'Valid content string here.',
          guildId: 'guild-123'
        };

        await communityController.createPost(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(next.mock.calls[0][0].message).toMatch(/Title/i);
    });

    it('should throw error if content is too long', async () => {
      req.body = {
        title: 'Valid Title',
        content: 'a'.repeat(5001), // 5001 chars
        guildId: 'guild-123'
      };

      await communityController.createPost(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toMatch(/content must be/i);
    });
  });

  describe('addComment', () => {
    it('should throw error if comment is too long', async () => {
      req.params = { postId: 'post-123' };
      req.body = {
        content: 'a'.repeat(2001) // 2001 chars
      };

      await communityController.addComment(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toMatch(/Comment/i);
    });
  });
});
