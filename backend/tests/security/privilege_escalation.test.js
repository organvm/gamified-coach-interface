
const { saveOnboarding } = require('../../controllers/gamificationController');

// Mock dependencies
const mockReq = (body = {}, user = {}) => ({
  body,
  user: { id: 1, ...user },
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

// Mock User Model
jest.mock('../../models/User', () => {
  const mockUserInstance = {
    id: 1,
    role: 'member',
    save: jest.fn().mockResolvedValue(true),
  };
  return {
    findByPk: jest.fn().mockResolvedValue(mockUserInstance),
    mockInstance: mockUserInstance // Export for test assertion
  };
});

const User = require('../../models/User');

// Mock Analytics Service
jest.mock('../../services/analyticsService', () => ({
  trackEvent: jest.fn().mockResolvedValue(true),
}));

describe('Security: Privilege Escalation in Gamification Controller', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.mockInstance.role = 'member'; // Reset role
  });

  it('should NOT allow a user to escalate privileges to admin via mass assignment', async () => {
    const req = mockReq({
      role: 'admin',
      gamificationStyle: 'rpg',
      gamificationTheme: 'dark'
    });
    const res = mockRes();

    await saveOnboarding(req, res, mockNext);

    // Assert that save was called
    expect(User.mockInstance.save).toHaveBeenCalled();

    // SECURITY FIX VERIFICATION: User role should REMAIN 'member'
    expect(User.mockInstance.role).toBe('member');

    // Response should reflect the unchanged role
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        user: expect.objectContaining({
          role: 'member'
        })
      })
    }));
  });
});
