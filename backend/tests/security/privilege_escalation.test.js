
const { AppError } = require('../../middleware/errorHandler');

// Mocks must be declared before requiring the controller
jest.mock('../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    authenticate: jest.fn(),
    define: jest.fn().mockReturnValue({
        prototype: {}
    }),
  }
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  stream: { write: jest.fn() }
}));

jest.mock('../../services/analyticsService', () => ({
  trackEvent: jest.fn()
}));

jest.mock('../../models/User', () => {
    return {
        findByPk: jest.fn()
    }
});

const gamificationController = require('../../controllers/gamificationController');
const User = require('../../models/User');

describe('Gamification Controller Security', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: 1 },
      body: {}
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('saveOnboarding Privilege Escalation', () => {
    it('should NOT allow privilege escalation via role parameter', async () => {
      // Arrange
      req.body = {
        role: 'admin',
        gamificationStyle: 'rpg',
        gamificationTheme: 'cyberpunk'
      };

      const mockUser = {
        id: 1,
        role: 'member',
        gamification_style: 'sports',
        gamification_theme: 'basic',
        onboarding_completed: false,
        save: jest.fn().mockResolvedValue(true)
      };

      User.findByPk.mockResolvedValue(mockUser);

      // Act
      await gamificationController.saveOnboarding(req, res, next);

      // Assert
      // 1. Verify response success
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));

      // 2. Verify legitimate fields were updated
      expect(mockUser.gamification_style).toBe('rpg');
      expect(mockUser.gamification_theme).toBe('cyberpunk');
      expect(mockUser.onboarding_completed).toBe(true);

      // 3. SECURITY CHECK: Verify role was NOT updated
      // This is the assertion that will fail if the vulnerability exists
      expect(mockUser.role).toBe('member');
    });
  });
});
