const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const { sequelize } = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const questRoutes = require('./routes/quests');
const achievementRoutes = require('./routes/achievements');
const skillRoutes = require('./routes/skills');
const communityRoutes = require('./routes/community');
const strategyRoutes = require('./routes/strategy');
const fitnessRoutes = require('./routes/fitness');
const contentRoutes = require('./routes/content');
const paymentRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const leaderboardRoutes = require('./routes/leaderboards');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time features
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true
  }
});

// Store io instance for use in controllers
app.set('io', io);

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'RATE LIMIT EXCEEDED - Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ============================================
// ROUTES
// ============================================

const API_VERSION = process.env.API_VERSION || 'v1';

// Health check endpoint
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch (error) {
    // dbStatus remains disconnected
  }

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: dbStatus
  });
});

// API routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/quests`, questRoutes);
app.use(`/api/${API_VERSION}/achievements`, achievementRoutes);
app.use(`/api/${API_VERSION}/skills`, skillRoutes);
app.use(`/api/${API_VERSION}/community`, communityRoutes);
app.use(`/api/${API_VERSION}/strategy`, strategyRoutes);
app.use(`/api/${API_VERSION}/fitness`, fitnessRoutes);
app.use(`/api/${API_VERSION}/content`, contentRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);
app.use(`/api/${API_VERSION}/analytics`, analyticsRoutes);
app.use(`/api/${API_VERSION}/leaderboards`, leaderboardRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'ENDPOINT_NOT_FOUND',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

// Global error handler
app.use(errorHandler);

// ============================================
// SOCKET.IO REAL-TIME FEATURES
// ============================================

const authenticateSocket = require('./middleware/socketAuth');

io.use(authenticateSocket);

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.user.id}`);

  // Join user's personal room
  socket.join(`user:${socket.user.id}`);

  // Join guild rooms if member
  if (socket.user.guilds) {
    socket.user.guilds.forEach(guildId => {
      socket.join(`guild:${guildId}`);
    });
  }

  // Handle direct messages
  socket.on('send_message', async (data) => {
    try {
      const { recipientId, message } = data;

      // Validate input
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('INVALID_MESSAGE');
      }

      if (message.length > 1000) {
        throw new Error('MESSAGE_TOO_LONG');
      }

      // Save message to database
      // Emit to recipient
      io.to(`user:${recipientId}`).emit('new_message', {
        senderId: socket.user.id,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      const errorMessage = error.message === 'MESSAGE_TOO_LONG'
        ? 'Message too long (max 1000 characters)'
        : 'Invalid message format';
      socket.emit('error', { message: errorMessage });
    }
  });

  // Handle guild chat
  socket.on('guild_message', async (data) => {
    try {
      const { guildId, message } = data;

      // Validate input
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('INVALID_MESSAGE');
      }

      if (message.length > 2000) {
        throw new Error('MESSAGE_TOO_LONG');
      }

      // Verify user is member of guild
      if (!socket.user?.guilds || !socket.user.guilds.includes(guildId)) {
        throw new Error('NOT_AUTHORIZED_GUILD');
      }

      // Save message
      // Broadcast to guild
      io.to(`guild:${guildId}`).emit('new_guild_message', {
        senderId: socket.user.id,
        username: socket.user.username,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      let errorMessage = 'Failed to send guild message';

      if (error.message === 'NOT_AUTHORIZED_GUILD') {
        errorMessage = 'You are not a member of this guild';
      } else if (error.message === 'MESSAGE_TOO_LONG') {
        errorMessage = 'Message too long (max 2000 characters)';
      } else if (error.message === 'INVALID_MESSAGE') {
        errorMessage = 'Invalid message format';
      }

      socket.emit('error', { message: errorMessage });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const { recipientId, isTyping } = data;
    io.to(`user:${recipientId}`).emit('user_typing', {
      userId: socket.user.id,
      username: socket.user.username,
      isTyping
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.user.id}`);
  });
});

// ============================================
// DATABASE CONNECTION & SERVER START
// ============================================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync models (in production, use migrations instead)
    if (process.env.NODE_ENV === 'development') {
      // await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    // Start server
    server.listen(PORT, () => {
      logger.info(`========================================`);
      logger.info(`Legion Command Center API`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API Version: ${API_VERSION}`);
      logger.info(`========================================`);
    });
  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    logger.info('HTTP server closed');
    await sequelize.close();
    logger.info('Database connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    logger.info('HTTP server closed');
    await sequelize.close();
    logger.info('Database connection closed');
    process.exit(0);
  });
});

// Start the server if not imported for testing
if (require.main === module) {
  startServer();
}

module.exports = { app, io, server };
