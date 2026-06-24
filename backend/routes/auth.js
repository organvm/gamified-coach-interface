const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { PASSWORD_VALIDATION_OPTIONS } = require('../utils/validationConstants');

// Validation chains
const registerValidation = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password')
    .isStrongPassword(PASSWORD_VALIDATION_OPTIONS)
    .withMessage('Password must be at least 8 characters long and include at least one lowercase letter, one uppercase letter, one number, and one special character'),
  body('username')
    .trim()
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores')
];

const loginValidation = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').exists().withMessage('Password is required')
];

const changePasswordValidation = [
  body('newPassword')
    .isStrongPassword(PASSWORD_VALIDATION_OPTIONS)
    .withMessage('New password must be at least 8 characters long and include at least one lowercase letter, one uppercase letter, one number, and one special character')
];

// Public routes
router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/refresh', authController.refreshToken);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);
router.put('/password', authenticate, changePasswordValidation, authController.changePassword);

// Export router as default for backward compatibility with existing imports
module.exports = router;

// Export validation chains as named exports for testing
module.exports.registerValidation = registerValidation;
module.exports.changePasswordValidation = changePasswordValidation;
