const { checkAchievements } = require('../controllers/gamificationController');
const { sequelize } = require('../config/database');
const User = require('../models/User');
const { trackEvent } = require('../services/analyticsService');

// Mock dependencies
jest.mock('../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    define: jest.fn().mockReturnValue(class MockModel {})
  }
}));

jest.mock('../models/User', () => ({
  findByPk: jest.fn()
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn()
}));

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('Gamification Controller Performance', () => {
  let mockUser;
  let mockAchievements;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = {
      id: 1,
      login_streak: 5,
      level: 1,
      addXP: jest.fn().mockResolvedValue({})
    };

    mockAchievements = [
      { id: 101, name: 'Ach 1', xp_reward: 100, requirements: { login_streak: 1 } },
      { id: 102, name: 'Ach 2', xp_reward: 200, requirements: { login_streak: 2 } },
      { id: 103, name: 'Ach 3', xp_reward: 300, requirements: { login_streak: 3 } }
    ];

    User.findByPk.mockResolvedValue(mockUser);
  });

  test('should call user.addXP once with total XP (after optimization)', async () => {
    // Mock sequential query responses
    sequelize.query
      // 1. Get user stats
      .mockResolvedValueOnce([[{
        login_streak: 10, // Satisfies all requirements
        level: 1
      }]])
      // 2. Get achievements to check
      .mockResolvedValueOnce([mockAchievements])
      // Subsequent calls are inserts, return success
      .mockResolvedValue([{}]);

    const req = { user: { id: 1 } };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await checkAchievements(req, res, next);

    expect(res.json).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(res.json.mock.calls[0][0].data.unlockedCount).toBe(3);

    // Optimized: calls addXP once with total sum (100+200+300 = 600)
    expect(mockUser.addXP).toHaveBeenCalledTimes(1);
    expect(mockUser.addXP).toHaveBeenCalledWith(600);
  });
});
