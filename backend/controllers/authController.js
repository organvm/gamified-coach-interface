const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { AppError } = require('../middleware/errorHandler');
const User = require('../models/User');
const logger = require('../utils/logger');
const { trackEvent } = require('../services/analyticsService');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      subscriptionTier: user.subscription_tier
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      throw new AppError(errorMessages, 400, 'VALIDATION_ERROR');
    }

    const { email, password, username, firstName, lastName } = req.body;

    // Validation
    if (!email || !password || !username) {
      throw new AppError('Please provide email, password, and username', 400, 'MISSING_FIELDS');
    }

    // Check if user exists
    const existingUser = await User.findOne({
      where: {
        [sequelize.Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      throw new AppError('User already exists', 400, 'USER_EXISTS');
    }

    // Create user
    const user = await User.create({
      email,
      password_hash: password,
      username,
      first_name: firstName,
      last_name: lastName
    });

    // Track registration event
    await trackEvent({
      userId: user.id,
      eventType: 'user_registered',
      properties: {
        method: 'email'
      }
    });

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user,
        token,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      throw new AppError(errorMessages, 400, 'VALIDATION_ERROR');
    }

    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      throw new AppError('Please provide email and password', 400, 'MISSING_CREDENTIALS');
    }

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'active') {
      throw new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE');
    }

    // Update login tracking
    const today = new Date().setHours(0, 0, 0, 0);
    const lastLogin = user.last_login ? new Date(user.last_login).setHours(0, 0, 0, 0) : null;
    const daysDifference = lastLogin ? Math.floor((today - lastLogin) / (1000 * 60 * 60 * 24)) : null;

    if (daysDifference === 1) {
      // Consecutive day login
      user.login_streak += 1;
      if (user.login_streak > user.longest_streak) {
        user.longest_streak = user.login_streak;
      }
      // Award XP for login streak
      if (user.login_streak % 7 === 0) {
        await user.addXP(50); // Bonus for weekly streak
      }
    } else if (daysDifference > 1) {
      // Streak broken
      user.login_streak = 1;
    }

    user.last_login = new Date();
    await user.save();

    // Track login event
    await trackEvent({
      userId: user.id,
      eventType: 'login',
      properties: {
        streak: user.login_streak
      }
    });

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token,
        refreshToken,
        loginStreak: user.login_streak
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: ['achievements', 'activeQuests', 'guilds']
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400, 'NO_REFRESH_TOKEN');
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Generate new access token
    const newToken = generateToken(user);

    res.json({
      success: true,
      data: { token: newToken }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    // Track logout event
    await trackEvent({
      userId: req.user.id,
      eventType: 'logout'
    });

    logger.info(`User logged out: ${req.user.id}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/v1/auth/password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      throw new AppError(errorMessages, 400, 'VALIDATION_ERROR');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Please provide current and new password', 400, 'MISSING_FIELDS');
    }

    const user = await User.findByPk(req.user.id);

    if (!(await user.comparePassword(currentPassword))) {
      throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
    }

    user.password_hash = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};
