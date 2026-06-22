jest.mock('../config/database', () => ({
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock('../middleware/errorHandler', () => {
  class AppError extends Error {
    constructor(message, statusCode, code = null) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.isOperational = true;
    }
  }

  return { AppError };
});

jest.mock('../models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn(),
}));

const { sequelize } = require('../config/database');
const User = require('../models/User');
const { trackEvent } = require('../services/analyticsService');
const gamificationController = require('../controllers/gamificationController');

function mockReqResNext(overrides = {}) {
  const req = {
    user: { id: 'user-123' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();

  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('gamificationController', () => {
  describe('getAllAchievements', () => {
    it('returns all achievements without a WHERE clause when no filters are set', async () => {
      const achievements = [{ id: 'a1' }, { id: 'a2' }];
      sequelize.query.mockResolvedValueOnce([achievements, {}]);
      const { req, res, next } = mockReqResNext();

      await gamificationController.getAllAchievements(req, res, next);

      expect(next).not.toHaveBeenCalled();
      const [query, options] = sequelize.query.mock.calls[0];
      expect(query).not.toContain('WHERE');
      expect(query).toContain('FROM achievements');
      expect(options).toEqual({ replacements: {} });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: { achievements },
      });
    });

    it('builds a filtered WHERE clause from query parameters', async () => {
      sequelize.query.mockResolvedValueOnce([[], {}]);
      const { req, res, next } = mockReqResNext({
        query: { category: 'combat', rarity: 'legendary', hideHidden: 'true' },
      });

      await gamificationController.getAllAchievements(req, res, next);

      const [query, options] = sequelize.query.mock.calls[0];
      expect(query).toContain('WHERE category = :category AND rarity = :rarity AND is_hidden = :is_hidden');
      expect(options).toEqual({
        replacements: { category: 'combat', rarity: 'legendary', is_hidden: false },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: { achievements: [] },
      });
    });

    it('forwards database errors to next', async () => {
      const dbError = new Error('db down');
      sequelize.query.mockRejectedValueOnce(dbError);
      const { req, res, next } = mockReqResNext();

      await gamificationController.getAllAchievements(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getUserAchievements', () => {
    it('computes completion stats for the requested user', async () => {
      const achievements = [
        { id: 'a1', is_completed: true },
        { id: 'a2', is_completed: false },
        { id: 'a3', is_completed: true },
        { id: 'a4', is_completed: false },
      ];
      sequelize.query.mockResolvedValueOnce([achievements, {}]);
      const { req, res, next } = mockReqResNext({ params: { userId: 'user-9' } });

      await gamificationController.getUserAchievements(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN user_achievements'),
        { replacements: { userId: 'user-9' } }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          achievements,
          stats: { completed: 2, total: 4, completionPercentage: 50 },
        },
      });
    });

    it('forwards errors to next', async () => {
      sequelize.query.mockRejectedValueOnce(new Error('boom'));
      const { req, res, next } = mockReqResNext({ params: { userId: 'user-9' } });

      await gamificationController.getUserAchievements(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('checkAchievements', () => {
    it('unlocks qualifying achievements, awards XP, notifies, and tracks events', async () => {
      const addXP = jest.fn().mockResolvedValue();
      User.findByPk.mockResolvedValueOnce({ login_streak: 7, level: 5, addXP });

      // 1) user stats query
      sequelize.query.mockResolvedValueOnce([
        [{ quests_completed: 10, posts_created: 3, workouts_logged: 20 }],
      ]);
      // 2) candidate achievements query
      sequelize.query.mockResolvedValueOnce([
        [
          {
            id: 'ach-pass',
            name: 'Quest Master',
            xp_reward: 500,
            requirements: { quests_completed: 5 },
          },
          {
            id: 'ach-fail',
            name: 'Marathoner',
            xp_reward: 999,
            requirements: { workouts_logged: 100 },
          },
        ],
      ]);
      // 3) INSERT user_achievements, 4) INSERT notification (resolve generically)
      sequelize.query.mockResolvedValue([[], {}]);

      const { req, res, next } = mockReqResNext();

      await gamificationController.checkAchievements(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(addXP).toHaveBeenCalledTimes(1);
      expect(addXP).toHaveBeenCalledWith(500);
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_achievements'),
        { replacements: { userId: 'user-123', achievementId: 'ach-pass' } }
      );
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventType: 'achievement_unlocked',
          properties: expect.objectContaining({ achievementId: 'ach-pass' }),
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          unlockedCount: 1,
          achievements: [expect.objectContaining({ id: 'ach-pass' })],
        },
      });
    });

    it('unlocks nothing when no requirements are met', async () => {
      const addXP = jest.fn().mockResolvedValue();
      User.findByPk.mockResolvedValueOnce({ login_streak: 1, level: 1, addXP });

      sequelize.query.mockResolvedValueOnce([[{ quests_completed: 0 }]]);
      sequelize.query.mockResolvedValueOnce([
        [{ id: 'ach', name: 'Hard', xp_reward: 100, requirements: { quests_completed: 50 } }],
      ]);

      const { req, res, next } = mockReqResNext();

      await gamificationController.checkAchievements(req, res, next);

      expect(addXP).not.toHaveBeenCalled();
      expect(trackEvent).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { unlockedCount: 0, achievements: [] },
      });
    });

    it('forwards errors to next', async () => {
      User.findByPk.mockRejectedValueOnce(new Error('no user'));
      const { req, res, next } = mockReqResNext();

      await gamificationController.checkAchievements(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getSkillTrees', () => {
    it('returns skill trees', async () => {
      const skillTrees = [{ id: 'st1', nodes: [] }];
      sequelize.query.mockResolvedValueOnce([skillTrees, {}]);
      const { req, res, next } = mockReqResNext();

      await gamificationController.getSkillTrees(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('FROM skill_trees'));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { skillTrees },
      });
    });

    it('forwards errors to next', async () => {
      sequelize.query.mockRejectedValueOnce(new Error('boom'));
      const { req, res, next } = mockReqResNext();

      await gamificationController.getSkillTrees(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getUserSkills', () => {
    it('returns the user skill progress keyed by tree', async () => {
      const skills = [{ tree_id: 'st1', nodes: [] }];
      sequelize.query.mockResolvedValueOnce([skills, {}]);
      const { req, res, next } = mockReqResNext({ params: { userId: 'user-7' } });

      await gamificationController.getUserSkills(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN user_skills'),
        { replacements: { userId: 'user-7' } }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { skills },
      });
    });
  });

  describe('unlockSkill', () => {
    it('returns 404 when the skill node does not exist', async () => {
      sequelize.query.mockResolvedValueOnce([[], {}]);
      const { req, res, next } = mockReqResNext({ body: { skillNodeId: 'missing' } });

      await gamificationController.unlockSkill(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, code: 'SKILL_NOT_FOUND' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects when the user lacks the required XP', async () => {
      sequelize.query.mockResolvedValueOnce([[{ id: 'sn1', xp_cost: 1000 }], {}]);
      User.findByPk.mockResolvedValueOnce({ current_xp: 100 });
      const { req, res, next } = mockReqResNext({ body: { skillNodeId: 'sn1' } });

      await gamificationController.unlockSkill(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INSUFFICIENT_XP' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects when a required parent node is not yet unlocked', async () => {
      sequelize.query.mockResolvedValueOnce([
        [{ id: 'sn2', xp_cost: 50, parent_node_id: 'sn1' }],
        {},
      ]);
      User.findByPk.mockResolvedValueOnce({ current_xp: 500, save: jest.fn() });
      // parent lookup returns not unlocked
      sequelize.query.mockResolvedValueOnce([[{ is_unlocked: false }], {}]);
      const { req, res, next } = mockReqResNext({ body: { skillNodeId: 'sn2' } });

      await gamificationController.unlockSkill(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'PARENT_REQUIRED' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('deducts XP, unlocks the skill, notifies, and tracks the event', async () => {
      const save = jest.fn().mockResolvedValue();
      const user = { current_xp: 500, save };
      sequelize.query.mockResolvedValueOnce([
        [{ id: 'sn3', name: 'Power Strike', xp_cost: 200, parent_node_id: null, benefits: {} }],
        {},
      ]);
      User.findByPk.mockResolvedValueOnce(user);
      // INSERT user_skills, INSERT notification
      sequelize.query.mockResolvedValue([[], {}]);

      const { req, res, next } = mockReqResNext({ body: { skillNodeId: 'sn3' } });

      await gamificationController.unlockSkill(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(user.current_xp).toBe(300);
      expect(save).toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_skills'),
        { replacements: { userId: 'user-123', skillNodeId: 'sn3' } }
      );
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'skill_unlocked' })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Skill unlocked successfully',
        data: {
          skill: expect.objectContaining({ id: 'sn3' }),
          remainingXP: 300,
        },
      });
    });
  });

  describe('saveOnboarding', () => {
    it('returns 404 when the user cannot be found', async () => {
      User.findByPk.mockResolvedValueOnce(null);
      const { req, res, next } = mockReqResNext({ body: { role: 'coach' } });

      await gamificationController.saveOnboarding(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, code: 'USER_NOT_FOUND' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('persists provided preferences and marks onboarding complete', async () => {
      const save = jest.fn().mockResolvedValue();
      const user = { id: 'user-123', save };
      User.findByPk.mockResolvedValueOnce(user);
      const { req, res, next } = mockReqResNext({
        body: {
          role: 'coach',
          gamificationStyle: 'competitive',
          gamificationTheme: 'military',
        },
      });

      await gamificationController.saveOnboarding(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(user.role).toBe('coach');
      expect(user.gamification_style).toBe('competitive');
      expect(user.gamification_theme).toBe('military');
      expect(user.onboarding_completed).toBe(true);
      expect(save).toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'onboarding_completed' })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Onboarding completed successfully',
        data: {
          user: {
            id: 'user-123',
            role: 'coach',
            gamificationStyle: 'competitive',
            gamificationTheme: 'military',
            onboardingCompleted: true,
          },
        },
      });
    });
  });

  describe('awardXP', () => {
    it('rejects a missing or non-positive XP amount', async () => {
      const { req, res, next } = mockReqResNext({ body: { xpAmount: 0 } });

      await gamificationController.awardXP(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, code: 'INVALID_XP' })
      );
      expect(User.findByPk).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('awards XP and only emits a level_up event when the level increases', async () => {
      let level = 4;
      const addXP = jest.fn().mockImplementation(() => {
        level = 5;
        return Promise.resolve();
      });
      const user = {
        get level() {
          return level;
        },
        addXP,
        current_xp: 120,
        total_xp: 1500,
        xp_to_next_level: 300,
        title: 'Captain',
      };
      User.findByPk.mockResolvedValueOnce(user);

      const { req, res, next } = mockReqResNext({
        body: { xpAmount: 250, reason: 'quest_complete' },
      });

      await gamificationController.awardXP(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(addXP).toHaveBeenCalledWith(250);
      const eventTypes = trackEvent.mock.calls.map(c => c[0].eventType);
      expect(eventTypes).toContain('xp_awarded');
      expect(eventTypes).toContain('level_up');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Awarded 250 XP',
        data: expect.objectContaining({
          xpAwarded: 250,
          level: 5,
          leveledUp: true,
          newTitle: 'Captain',
        }),
      });
    });

    it('does not emit a level_up event when the level is unchanged', async () => {
      const user = {
        level: 3,
        addXP: jest.fn().mockResolvedValue(),
        current_xp: 50,
        total_xp: 600,
        xp_to_next_level: 200,
        title: 'Recruit',
      };
      User.findByPk.mockResolvedValueOnce(user);

      const { req, res, next } = mockReqResNext({ body: { xpAmount: 10 } });

      await gamificationController.awardXP(req, res, next);

      const eventTypes = trackEvent.mock.calls.map(c => c[0].eventType);
      expect(eventTypes).toContain('xp_awarded');
      expect(eventTypes).not.toContain('level_up');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leveledUp: false }),
        })
      );
    });
  });

  describe('getXPHistory', () => {
    it('returns XP history with a parsed limit', async () => {
      const history = [{ event_type: 'xp_awarded' }];
      sequelize.query.mockResolvedValueOnce([history, {}]);
      const { req, res, next } = mockReqResNext({ query: { limit: '25' } });

      await gamificationController.getXPHistory(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM analytics_events'),
        { replacements: { userId: 'user-123', limit: 25 } }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { history },
      });
    });

    it('defaults the limit to 50 when none is provided', async () => {
      sequelize.query.mockResolvedValueOnce([[], {}]);
      const { req, res, next } = mockReqResNext();

      await gamificationController.getXPHistory(req, res, next);

      expect(sequelize.query).toHaveBeenCalledWith(
        expect.any(String),
        { replacements: { userId: 'user-123', limit: 50 } }
      );
    });

    it('forwards errors to next', async () => {
      sequelize.query.mockRejectedValueOnce(new Error('boom'));
      const { req, res, next } = mockReqResNext();

      await gamificationController.getXPHistory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
