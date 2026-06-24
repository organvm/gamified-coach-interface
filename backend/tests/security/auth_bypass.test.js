
const authController = require('../../controllers/authController');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { AppError } = require('../../middleware/errorHandler');

// Mock User model
jest.mock('../../models/User');

// Mock jwt
jest.mock('jsonwebtoken');

// Mock express-validator
jest.mock('express-validator');

// Mock sequelize and database config which is required by User.js
jest.mock('../../config/database', () => ({
  sequelize: {
    define: jest.fn(() => ({
      belongsToMany: jest.fn(),
      hasMany: jest.fn(),
      prototype: {}
    })),
    Op: {
        or: 'or'
    }
  }
}));

// Mock logger to avoid clutter
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn()
}));

// Mock analytics service
jest.mock('../../services/analyticsService', () => ({
    trackEvent: jest.fn()
}));

describe('Security: Auth Authorization Bypass & Controller Crash', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {},
            user: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('refreshToken', () => {
        it('should BLOCK suspended users from refreshing token (FIX VERIFICATION)', async () => {
            // Setup
            req.body.refreshToken = 'valid-refresh-token';

            // Mock jwt verify to return a valid payload
            jwt.verify.mockReturnValue({ userId: 'suspended-user-id' });

            // Mock User.findByPk to return a suspended user
            const mockUser = {
                id: 'suspended-user-id',
                email: 'bad@actor.com',
                username: 'badactor',
                role: 'member',
                status: 'suspended', // Suspended user
                save: jest.fn(),
                toJSON: jest.fn().mockReturnValue({})
            };
            User.findByPk = jest.fn().mockResolvedValue(mockUser);

            // Execute
            await authController.refreshToken(req, res, next);

            // Verify FIX:
            // It should NOT succeed (res.json not called)
            expect(res.json).not.toHaveBeenCalled();

            // It SHOULD call next with an error
            expect(next).toHaveBeenCalled();
            const error = next.mock.calls[0][0];
            expect(error).toBeDefined();
            expect(error.message).toBe('Account is not active');
            expect(error.statusCode).toBe(403);
        });
    });

    describe('register', () => {
        it('should NOT crash with ReferenceError (FIX VERIFICATION)', async () => {
            // Setup
            req.body = {
                email: 'test@example.com',
                password: 'password123',
                username: 'tester',
                firstName: 'Test',
                lastName: 'User'
            };

            // Mock validation result
            validationResult.mockReturnValue({
                isEmpty: () => true,
                array: () => []
            });

            // Mock User.findOne to NOT find existing user (proceed to create)
            User.findOne = jest.fn().mockResolvedValue(null);
            User.create = jest.fn().mockResolvedValue({
                id: 'new-user',
                email: 'test@example.com',
                save: jest.fn()
            });

            // Execute
            await authController.register(req, res, next);

            // Verify FIX:
            // Should NOT call next with ReferenceError
            if (next.mock.calls.length > 0) {
                const error = next.mock.calls[0][0];
                expect(error).not.toBeInstanceOf(ReferenceError);
            }

            // Should succeed
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true
            }));
        });
    });
});
