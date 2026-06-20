
// Mock User model outside because jest.mock hoisting
const mockUserInstance = {
  id: 1,
  role: 'member',
  gamification_style: 'rpg',
  gamification_theme: 'cyberpunk',
  onboarding_completed: false,
  save: jest.fn().mockResolvedValue(true)
};

// Mock dependencies
jest.mock('../../models/User', () => ({
  findByPk: jest.fn().mockResolvedValue(mockUserInstance)
}));

jest.mock('../../services/analyticsService', () => ({
  trackEvent: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock database config to avoid actual connection
jest.mock('../../config/database', () => {
  return {
    sequelize: {
      query: jest.fn(),
      define: jest.fn().mockReturnValue({
        findByPk: jest.fn(),
        findOne: jest.fn()
      }),
      Op: { or: 'or' } // Mock Op
    }
  };
});

const { saveOnboarding } = require('../../controllers/gamificationController');

describe('Privilege Escalation Vulnerability', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mock user state
    mockUserInstance.role = 'member';
    mockUserInstance.gamification_style = 'rpg';
    mockUserInstance.gamification_theme = 'cyberpunk';
    mockUserInstance.save.mockClear();

    req = {
      user: { id: 1 },
      body: {
        role: 'admin',
        gamificationStyle: 'sports',
        gamificationTheme: 'retro'
      }
    };

    res = {
      json: jest.fn()
    };

    next = jest.fn();
  });

  it('should NOT allow user to change role to admin', async () => {
    await saveOnboarding(req, res, next);

    expect(mockUserInstance.save).toHaveBeenCalled();

    // VULNERABILITY CHECK:
    // If the code is vulnerable, role becomes 'admin'
    // We expect this assertion to FAIL currently
    expect(mockUserInstance.role).toBe('member');

    // Other fields should still update
    expect(mockUserInstance.gamification_style).toBe('sports');
  });
});
