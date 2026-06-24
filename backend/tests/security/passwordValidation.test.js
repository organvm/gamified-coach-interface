const express = require('express');
const request = require('supertest');
const { body, validationResult } = require('express-validator');
const { registerValidation, changePasswordValidation } = require('../../routes/auth');

// Mock app setup
const app = express();
app.use(express.json());

// Mock Route Handler
const mockHandler = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  res.status(200).json({ success: true });
};

// Define routes using the imported validation chains
app.post('/register', registerValidation, mockHandler);
app.put('/password', changePasswordValidation, mockHandler);

describe('Password Strength Validation', () => {

  describe('Registration', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'short',           // Too short
        'nodigits',        // No numbers
        'NO_LOWERCASE_1!', // No lowercase
        'no_uppercase_1!', // No uppercase
        'NoSpecialChar1'   // No symbols
      ];

      for (const password of weakPasswords) {
        const res = await request(app)
          .post('/register')
          .send({
            email: 'test@example.com',
            username: 'testuser',
            password
          });

        expect(res.status).toBe(400);
        // We expect at least one error related to password strength
        const passwordError = res.body.errors.find(e => e.path === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError.msg).toContain('Password must be at least 8 characters long');
      }
    });

    it('should accept strong passwords', async () => {
      const strongPassword = 'StrongPassword1!';
      const res = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: strongPassword
        });

      expect(res.status).toBe(200);
    });
  });

  describe('Change Password', () => {
    it('should reject weak new passwords', async () => {
      const weakPasswords = [
        'short',
        'nodigits',
        'NO_LOWERCASE_1!',
        'no_uppercase_1!',
        'NoSpecialChar1'
      ];

      for (const newPassword of weakPasswords) {
        const res = await request(app)
          .put('/password')
          .send({ newPassword });

        expect(res.status).toBe(400);
        const passwordError = res.body.errors.find(e => e.path === 'newPassword');
        expect(passwordError).toBeDefined();
        expect(passwordError.msg).toContain('New password must be at least 8 characters long');
      }
    });

    it('should accept strong new passwords', async () => {
      const strongPassword = 'StrongPassword1!';
      const res = await request(app)
        .put('/password')
        .send({ newPassword: strongPassword });

      expect(res.status).toBe(200);
    });
  });
});
