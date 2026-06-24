const { sequelize } = require('../config/database');
const User = require('../models/User');
const { trackEvent } = require('../services/analyticsService');
const gamificationController = require('../controllers/gamificationController');

// Mock dependencies
jest.mock('../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    define: jest.fn(),
  }
}));

jest.mock('../models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn(),
}));

describe('Gamification Controller Performance', () => {
  let req, res, next;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 'user-123' },
      body: {}
    };
    res = {
      json: jest.fn()
    };
    next = jest.fn();

    mockUser = {
      id: 'user-123',
      login_streak: 5,
      level: 4,
      current_xp: 0,
      xp_to_next_level: 1000,
      addXP: jest.fn().mockResolvedValue({ leveledUp: false }),
      save: jest.fn(),
    };

    User.findByPk.mockResolvedValue(mockUser);
  });

  it('should call addXP exactly once with total XP (after optimization)', async () => {
    // 1. Mock stats query
    const mockStats = [{
      quests_completed: 10,
      posts_created: 5,
      workouts_logged: 20,
      guilds_created: 1,
      likes_received: 50,
      login_streak: 5,
      level: 4
    }];

    // 2. Mock achievements query
    const mockAchievements = [
      {
        id: 'ach_1',
        name: 'Achievement 1',
        requirements: { quests_completed: 10 },
        xp_reward: 100
      },
      {
        id: 'ach_2',
        name: 'Achievement 2',
        requirements: { workouts_logged: 20 },
        xp_reward: 200
      }
    ];

    sequelize.query
      .mockResolvedValueOnce([mockStats]) // 1. Stats
      .mockResolvedValueOnce([mockAchievements]) // 2. Achievements
      // Concurrent inserts - order doesn't matter for mock values since they are parallel
      // We need enough mocks for the inserts (2 achievements * 2 inserts = 4 calls)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await gamificationController.checkAchievements(req, res, next);

    // Verify results
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.data.unlockedCount).toBe(2);

    // Optimized behavior: addXP called EXACTLY ONCE with total XP
    expect(mockUser.addXP).toHaveBeenCalledTimes(1);
    expect(mockUser.addXP).toHaveBeenCalledWith(300);
  });
});
