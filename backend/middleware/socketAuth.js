const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

// Socket.IO authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    // Get token from handshake auth or query
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch up-to-date guilds from database
    // This is more secure than trusting the JWT payload which might be stale
    let guildIds = null;
    try {
      const [results] = await sequelize.query(
        "SELECT guild_id FROM guild_members WHERE user_id = :userId",
        { replacements: { userId: decoded.userId } }
      );
      // Ensure IDs are strings to match standard comparison logic and avoid type mismatch issues
      guildIds = results.map(r => String(r.guild_id));
    } catch (dbError) {
      logger.error(`Failed to fetch guilds for user ${decoded.userId}:`, dbError);
      // guildIds remains null, triggering fallback
    }

    // Attach user info to socket
    socket.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      // Use fetched guilds if available (even if empty), fallback to JWT guilds only on DB error
      guilds: guildIds !== null ? guildIds : (decoded.guilds || [])
    };

    logger.debug(`Socket authenticated for user: ${socket.user.id}`);
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error.message);
    next(new Error('Authentication error: Invalid token'));
  }
};

module.exports = authenticateSocket;
