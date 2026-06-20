jest.mock('axios', () => ({
  post: jest.fn(),
}));

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

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/analyticsService', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../utils/exportFormatter', () => ({
  normalizeWorkspace: jest.fn(workspace => ({
    ...workspace,
    data: typeof workspace.data === 'string' ? JSON.parse(workspace.data) : (workspace.data || {}),
  })),
  workspaceToMarkdown: jest.fn(() => '# Exported workspace'),
  streamWorkspacePdf: jest.fn(),
}));

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    get: jest.fn(),
    setEx: jest.fn(),
  })),
}));

const axios = require('axios');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { trackEvent } = require('../services/analyticsService');
const {
  normalizeWorkspace,
  workspaceToMarkdown,
  streamWorkspacePdf,
} = require('../utils/exportFormatter');
const strategyController = require('../controllers/strategyController');

const originalEnv = { ...process.env };

function mockReqResNext(overrides = {}) {
  const req = {
    user: { id: 'user-123' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();

  return { req, res, next };
}

function validHeroClassResponse() {
  return {
    targetAudience: 'Busy gamers ready to build consistent strength habits',
    demographics: {
      ageRange: '25-40',
      profession: 'Software and creative professionals',
      lifestyle: 'Sedentary but motivated by structured progression',
    },
    painPoints: [
      'Need a clear plan after years of inconsistent training',
      'Want accountability without generic gym culture',
    ],
    aspirations: [
      'Launch a durable daily movement routine',
      'Build confidence through measurable strength progression',
    ],
    recommendations: 'Create onboarding quests and prioritize weekly progress reviews.',
  };
}

describe('strategyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'gemini-test-model',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generateStrategy', () => {
    it('rejects an unsupported terminal type before doing external work', async () => {
      const { req, res, next } = mockReqResNext({
        body: {
          terminalType: 'not_real',
          userInput: { goal: 'Build a niche offer' },
        },
      });

      await strategyController.generateStrategy(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_TERMINAL',
        })
      );
      expect(sequelize.query).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects missing user input before querying history', async () => {
      const { req, res, next } = mockReqResNext({
        body: {
          terminalType: 'hero_class',
        },
      });

      await strategyController.generateStrategy(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'MISSING_INPUT',
        })
      );
      expect(sequelize.query).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('builds context, calls Gemini, persists a valid response, updates XP, and tracks analytics', async () => {
      const aiResponse = validHeroClassResponse();
      sequelize.query
        .mockResolvedValueOnce([
          [
            {
              terminal_type: 'loot_table',
              user_input: { offer: 'Founding cohort' },
              ai_response: { recommendations: 'Previous context' },
            },
          ],
        ])
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([[], {}]);
      axios.post.mockResolvedValue({
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(aiResponse) }],
              },
            },
          ],
        },
      });

      const { req, res, next } = mockReqResNext({
        body: {
          terminalType: 'hero_class',
          userInput: {
            niche: 'fitness for gamers',
            objective: 'Create a sharper avatar',
          },
          workspaceId: 'workspace-42',
        },
      });

      await strategyController.generateStrategy(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/models/gemini-test-model:generateContent?key=test-gemini-key'),
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: [
                expect.objectContaining({
                  text: expect.stringContaining('Previous loot_table input'),
                }),
              ],
            }),
            expect.objectContaining({
              role: 'user',
              parts: [
                expect.objectContaining({
                  text: expect.stringContaining('USER INPUT'),
                }),
              ],
            }),
          ]),
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
            responseSchema: expect.objectContaining({
              required: ['targetAudience', 'painPoints', 'aspirations'],
            }),
          }),
        }),
        expect.objectContaining({
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      expect(sequelize.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FROM strategy_sessions'),
        { replacements: { userId: 'user-123' } }
      );
      expect(sequelize.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO strategy_sessions'),
        {
          replacements: expect.objectContaining({
            userId: 'user-123',
            terminalType: 'hero_class',
            userInput: JSON.stringify(req.body.userInput),
            aiResponse: JSON.stringify(aiResponse),
            prompt: expect.stringContaining('PREVIOUS CONTEXT'),
            wasCached: false,
          }),
        }
      );
      expect(sequelize.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('UPDATE strategy_workspaces'),
        {
          replacements: expect.objectContaining({
            workspaceId: 'workspace-42',
            userId: 'user-123',
            terminalType: 'hero_class',
            aiResponse: JSON.stringify(aiResponse),
          }),
        }
      );
      expect(sequelize.query).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('UPDATE users'),
        { replacements: { userId: 'user-123' } }
      );
      expect(trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventType: 'strategy_generated',
          properties: expect.objectContaining({
            terminalType: 'hero_class',
            wasCached: false,
          }),
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          response: aiResponse,
          metadata: {
            terminalType: 'hero_class',
            responseTime: expect.any(Number),
            wasCached: false,
          },
        },
      });
    });

    it('rejects incomplete AI output without persisting or awarding XP', async () => {
      sequelize.query.mockResolvedValueOnce([[], {}]);
      axios.post.mockResolvedValue({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      targetAudience: 'Gamers who need coaching',
                    }),
                  },
                ],
              },
            },
          ],
        },
      });

      const { req, res, next } = mockReqResNext({
        body: {
          terminalType: 'hero_class',
          userInput: { niche: 'gamers' },
        },
      });

      await strategyController.generateStrategy(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        'AI response validation failed',
        expect.objectContaining({
          terminalType: 'hero_class',
          issues: expect.arrayContaining([
            expect.stringContaining('Missing required fields'),
          ]),
        })
      );
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          code: 'AI_RESPONSE_INVALID',
        })
      );
      expect(sequelize.query).toHaveBeenCalledTimes(1);
      expect(trackEvent).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('workspace and history handlers', () => {
    it('returns active strategy workspaces for the authenticated user', async () => {
      const workspaces = [{ id: 'w1', name: 'Avatar', is_active: true }];
      sequelize.query.mockResolvedValueOnce([workspaces, {}]);
      const { req, res, next } = mockReqResNext();

      await strategyController.getWorkspaces(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM strategy_workspaces'),
        { replacements: { userId: 'user-123' } }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { workspaces },
      });
    });

    it('creates a workspace with a default name when none is provided', async () => {
      const workspace = {
        id: 'w2',
        name: 'Untitled Strategy',
        terminal_type: 'mission_logs',
      };
      sequelize.query.mockResolvedValueOnce([[workspace], {}]);
      const { req, res, next } = mockReqResNext({
        body: {
          terminalType: 'mission_logs',
        },
      });

      await strategyController.createWorkspace(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO strategy_workspaces'),
        {
          replacements: {
            userId: 'user-123',
            name: 'Untitled Strategy',
            terminalType: 'mission_logs',
          },
        }
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { workspace },
      });
    });

    it('filters session history by terminal type and parses the requested limit', async () => {
      const sessions = [{ id: 's1', terminal_type: 'scriptorium' }];
      sequelize.query.mockResolvedValueOnce([sessions, {}]);
      const { req, res, next } = mockReqResNext({
        query: {
          terminalType: 'scriptorium',
          limit: '12',
        },
      });

      await strategyController.getHistory(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('AND terminal_type = :terminalType'),
        {
          replacements: {
            userId: 'user-123',
            terminalType: 'scriptorium',
            limit: 12,
          },
        }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: { sessions },
      });
    });
  });

  describe('exportWorkspace', () => {
    it('rejects unsupported export formats', async () => {
      const { req, res, next } = mockReqResNext({
        params: { id: 'w1' },
        query: { format: 'csv' },
      });

      await strategyController.exportWorkspace(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_FORMAT',
        })
      );
      expect(sequelize.query).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the workspace is missing', async () => {
      sequelize.query.mockResolvedValueOnce([[], {}]);
      const { req, res, next } = mockReqResNext({
        params: { id: 'missing' },
        query: { format: 'json' },
      });

      await strategyController.exportWorkspace(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
        })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('exports workspace data as JSON by default', async () => {
      const workspace = {
        id: 'w1',
        name: 'Avatar Lab',
        terminal_type: 'hero_class',
        data: '{"hero_class":{"targetAudience":"Gamers"}}',
      };
      sequelize.query.mockResolvedValueOnce([[workspace], {}]);
      const { req, res, next } = mockReqResNext({
        params: { id: 'w1' },
        query: {},
      });

      await strategyController.exportWorkspace(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(normalizeWorkspace).toHaveBeenCalledWith(workspace);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=workspace-w1.json'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          workspace: expect.objectContaining({
            id: 'w1',
            data: {
              hero_class: {
                targetAudience: 'Gamers',
              },
            },
            exported_at: expect.any(String),
          }),
        },
      });
    });

    it('exports workspace data as Markdown', async () => {
      const workspace = {
        id: 'w-md',
        name: 'Markdown Lab',
        terminal_type: 'guild_charter',
        data: { guild_charter: { missionStatement: 'Build the guild' } },
      };
      sequelize.query.mockResolvedValueOnce([[workspace], {}]);
      const { req, res, next } = mockReqResNext({
        params: { id: 'w-md' },
        query: { format: 'md' },
      });

      await strategyController.exportWorkspace(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/markdown');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=workspace-w-md.md'
      );
      expect(workspaceToMarkdown).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'w-md',
          exported_at: expect.any(String),
        })
      );
      expect(res.send).toHaveBeenCalledWith('# Exported workspace');
    });

    it('streams workspace data as PDF', async () => {
      const workspace = {
        id: 'w-pdf',
        name: 'PDF Lab',
        terminal_type: 'loot_table',
        data: { loot_table: { potion: { name: 'Starter Quest' } } },
      };
      sequelize.query.mockResolvedValueOnce([[workspace], {}]);
      const { req, res, next } = mockReqResNext({
        params: { id: 'w-pdf' },
        query: { format: 'pdf' },
      });

      await strategyController.exportWorkspace(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=workspace-w-pdf.pdf'
      );
      expect(streamWorkspacePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'w-pdf',
          exported_at: expect.any(String),
        }),
        res
      );
      expect(res.json).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  describe('offline handlers', () => {
    it('renders the no-JavaScript offline strategy form', () => {
      const { req, res } = mockReqResNext();

      strategyController.offlineForm(req, res);

      expect(res.type).toHaveBeenCalledWith('html');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<form method="post" action="offline">'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Offline Strategy Forge'));
    });

    it('returns JSON offline analysis when requested', async () => {
      const { req, res, next } = mockReqResNext({
        body: {
          targetAvatar: '  Desk-bound RPG players  ',
          transformationGoals: '  Build daily strength habits  ',
          uniqueMethod: '  Quest-based programming  ',
        },
        headers: {
          accept: 'application/json',
        },
      });

      await strategyController.offlineAnalysis(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          mode: 'offline_fallback',
          targetAvatar: 'Desk-bound RPG players',
          transformationGoals: 'Build daily strength habits',
          uniqueMethod: 'Quest-based programming',
          analysis: expect.stringContaining('STRATEGIC ANALYSIS // FALLBACK MODE'),
          generated_at: expect.any(String),
        }),
      });
    });

    it('returns plain text offline analysis by default', async () => {
      const { req, res, next } = mockReqResNext({
        body: {
          targetAvatar: 'Remote developers',
          transformationGoals: 'Create a sustainable movement routine',
        },
      });

      await strategyController.offlineAnalysis(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.type).toHaveBeenCalledWith('text/plain');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Remote developers'));
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('Create a sustainable movement routine')
      );
    });

    it('rejects offline analysis without required fields', async () => {
      const { req, res, next } = mockReqResNext({
        body: {
          targetAvatar: 'Gamers',
        },
      });

      await strategyController.offlineAnalysis(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'INVALID_INPUT',
        })
      );
      expect(res.json).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});
