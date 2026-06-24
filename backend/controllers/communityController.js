const { sequelize } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { trackEvent } = require('../services/analyticsService');
const { escapeHtml } = require('../utils/security');

// ============================================
// GUILDS
// ============================================

/**
 * @desc    Get all guilds
 * @route   GET /api/v1/community/guilds
 * @access  Public
 */
exports.getAllGuilds = async (req, res, next) => {
  try {
    const { isPublic = 'true', limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT
        g.*,
        u.username as owner_username,
        u.avatar_url as owner_avatar
      FROM guilds g
      JOIN users u ON g.created_by = u.id
      ${isPublic === 'true' ? 'WHERE g.is_public = TRUE' : ''}
      ORDER BY g.total_xp DESC, g.total_members DESC
      LIMIT :limit OFFSET :offset
    `;

    const [guilds] = await sequelize.query(query, {
      replacements: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

    res.json({
      success: true,
      count: guilds.length,
      data: { guilds }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get guild details
 * @route   GET /api/v1/community/guilds/:guildId
 * @access  Public
 */
exports.getGuild = async (req, res, next) => {
  try {
    const { guildId } = req.params;

    const [guilds] = await sequelize.query(`
      SELECT
        g.*,
        u.username as owner_username,
        u.avatar_url as owner_avatar,
        (
          SELECT json_agg(
            json_build_object(
              'userId', gm_user.id,
              'username', gm_user.username,
              'avatar', gm_user.avatar_url,
              'level', gm_user.level,
              'role', gm.role,
              'xpContributed', gm.xp_contributed,
              'joinedAt', gm.joined_at
            )
          )
          FROM guild_members gm
          JOIN users gm_user ON gm.user_id = gm_user.id
          WHERE gm.guild_id = g.id
          ORDER BY gm.role ASC, gm.xp_contributed DESC
        ) as members
      FROM guilds g
      JOIN users u ON g.created_by = u.id
      WHERE g.id = :guildId
    `, {
      replacements: { guildId }
    });

    if (guilds.length === 0) {
      throw new AppError('Guild not found', 404, 'GUILD_NOT_FOUND');
    }

    res.json({
      success: true,
      data: { guild: guilds[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new guild
 * @route   POST /api/v1/community/guilds
 * @access  Private
 */
exports.createGuild = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, description, charter, isPublic = true, maxMembers = 100 } = req.body;

    if (!name || name.length < 3) {
      throw new AppError('Guild name must be at least 3 characters', 400, 'INVALID_NAME');
    }

    // Check if user already owns a guild
    const [existingGuilds] = await sequelize.query(`
      SELECT id FROM guilds WHERE created_by = :userId
    `, {
      replacements: { userId }
    });

    if (existingGuilds.length > 0) {
      throw new AppError('You can only own one guild', 400, 'GUILD_LIMIT_REACHED');
    }

    // Create guild
    const [guildResult] = await sequelize.query(`
      INSERT INTO guilds (name, description, charter, is_public, max_members, created_by)
      VALUES (:name, :description, :charter, :isPublic, :maxMembers, :userId)
      RETURNING *
    `, {
      replacements: {
        name,
        description,
        charter,
        isPublic,
        maxMembers,
        userId
      }
    });

    const guild = guildResult[0];

    // Add creator as owner
    await sequelize.query(`
      INSERT INTO guild_members (guild_id, user_id, role)
      VALUES (:guildId, :userId, 'owner')
    `, {
      replacements: {
        guildId: guild.id,
        userId
      }
    });

    // Track event
    await trackEvent({
      userId,
      eventType: 'guild_created',
      properties: {
        guildId: guild.id,
        guildName: name
      }
    });

    res.status(201).json({
      success: true,
      message: 'Guild created successfully',
      data: { guild }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join a guild
 * @route   POST /api/v1/community/guilds/:guildId/join
 * @access  Private
 */
exports.joinGuild = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { guildId } = req.params;

    // Get guild details
    const [guilds] = await sequelize.query(`
      SELECT * FROM guilds WHERE id = :guildId
    `, {
      replacements: { guildId }
    });

    if (guilds.length === 0) {
      throw new AppError('Guild not found', 404, 'GUILD_NOT_FOUND');
    }

    const guild = guilds[0];

    // Check if guild is full
    if (guild.total_members >= guild.max_members) {
      throw new AppError('Guild is full', 400, 'GUILD_FULL');
    }

    // Check if already a member
    const [existingMembership] = await sequelize.query(`
      SELECT id FROM guild_members WHERE guild_id = :guildId AND user_id = :userId
    `, {
      replacements: { guildId, userId }
    });

    if (existingMembership.length > 0) {
      throw new AppError('Already a member of this guild', 400, 'ALREADY_MEMBER');
    }

    // Add member
    await sequelize.query(`
      INSERT INTO guild_members (guild_id, user_id, role)
      VALUES (:guildId, :userId, 'member')
    `, {
      replacements: { guildId, userId }
    });

    // Update guild member count
    await sequelize.query(`
      UPDATE guilds
      SET total_members = total_members + 1
      WHERE id = :guildId
    `, {
      replacements: { guildId }
    });

    // Track event
    await trackEvent({
      userId,
      eventType: 'guild_joined',
      properties: {
        guildId,
        guildName: guild.name
      }
    });

    res.json({
      success: true,
      message: 'Joined guild successfully'
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// FORUM POSTS
// ============================================

/**
 * @desc    Get forum posts
 * @route   GET /api/v1/community/posts
 * @access  Public
 */
exports.getPosts = async (req, res, next) => {
  try {
    const { guildId, postType, limit = 50, offset = 0 } = req.query;

    let filters = ['fp.is_deleted = FALSE'];
    let replacements = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    if (guildId) {
      filters.push('fp.guild_id = :guildId');
      replacements.guildId = guildId;
    }

    if (postType) {
      filters.push('fp.post_type = :postType');
      replacements.postType = postType;
    }

    const query = `
      SELECT
        fp.*,
        u.username,
        u.avatar_url,
        u.level,
        u.title as user_title,
        CASE WHEN fp.guild_id IS NOT NULL THEN g.name ELSE NULL END as guild_name
      FROM forum_posts fp
      JOIN users u ON fp.user_id = u.id
      LEFT JOIN guilds g ON fp.guild_id = g.id
      WHERE ${filters.join(' AND ')}
      ORDER BY fp.is_pinned DESC, fp.created_at DESC
      LIMIT :limit OFFSET :offset
    `;

    const [posts] = await sequelize.query(query, { replacements });

    res.json({
      success: true,
      count: posts.length,
      data: { posts }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a forum post
 * @route   POST /api/v1/community/posts
 * @access  Private
 */
exports.createPost = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { guildId, postType, title, content, mediaUrls } = req.body;

    if (!content || content.length < 10) {
      throw new AppError('Post content must be at least 10 characters', 400, 'INVALID_CONTENT');
    }

    // Verify guild membership if posting to a guild
    if (guildId) {
      const [membership] = await sequelize.query(`
        SELECT id FROM guild_members WHERE guild_id = :guildId AND user_id = :userId
      `, {
        replacements: { guildId, userId }
      });

      if (membership.length === 0) {
        throw new AppError('Must be a guild member to post', 403, 'NOT_GUILD_MEMBER');
      }
    }

    // Create post
    const [postResult] = await sequelize.query(`
      INSERT INTO forum_posts (user_id, guild_id, post_type, title, content, media_urls)
      VALUES (:userId, :guildId, :postType, :title, :content, :mediaUrls)
      RETURNING *
    `, {
      replacements: {
        userId,
        guildId: guildId || null,
        postType: postType || 'discussion',
        title: escapeHtml(title),
        content: escapeHtml(content),
        mediaUrls: JSON.stringify(mediaUrls || [])
      }
    });

    // Track event
    await trackEvent({
      userId,
      eventType: 'post_created',
      properties: {
        postId: postResult[0].id,
        postType,
        guildId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: { post: postResult[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Like a post
 * @route   POST /api/v1/community/posts/:postId/like
 * @access  Private
 */
exports.likePost = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { postId } = req.params;

    // Check if already liked
    const [existingLike] = await sequelize.query(`
      SELECT id FROM post_likes WHERE user_id = :userId AND post_id = :postId
    `, {
      replacements: { userId, postId }
    });

    if (existingLike.length > 0) {
      // Unlike
      await sequelize.query(`
        DELETE FROM post_likes WHERE user_id = :userId AND post_id = :postId
      `, {
        replacements: { userId, postId }
      });

      await sequelize.query(`
        UPDATE forum_posts SET likes_count = likes_count - 1 WHERE id = :postId
      `, {
        replacements: { postId }
      });

      return res.json({
        success: true,
        message: 'Post unliked',
        liked: false
      });
    } else {
      // Like
      await sequelize.query(`
        INSERT INTO post_likes (user_id, post_id) VALUES (:userId, :postId)
      `, {
        replacements: { userId, postId }
      });

      await sequelize.query(`
        UPDATE forum_posts SET likes_count = likes_count + 1 WHERE id = :postId
      `, {
        replacements: { postId }
      });

      return res.json({
        success: true,
        message: 'Post liked',
        liked: true
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get post comments
 * @route   GET /api/v1/community/posts/:postId/comments
 * @access  Public
 */
exports.getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const [comments] = await sequelize.query(`
      SELECT
        fc.*,
        u.username,
        u.avatar_url,
        u.level
      FROM forum_comments fc
      JOIN users u ON fc.user_id = u.id
      WHERE fc.post_id = :postId AND fc.is_deleted = FALSE
      ORDER BY fc.created_at ASC
    `, {
      replacements: { postId }
    });

    res.json({
      success: true,
      count: comments.length,
      data: { comments }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add a comment to a post
 * @route   POST /api/v1/community/posts/:postId/comments
 * @access  Private
 */
exports.addComment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;

    if (!content || content.length < 1) {
      throw new AppError('Comment cannot be empty', 400, 'INVALID_CONTENT');
    }

    // Create comment
    const [commentResult] = await sequelize.query(`
      INSERT INTO forum_comments (post_id, user_id, parent_comment_id, content)
      VALUES (:postId, :userId, :parentCommentId, :content)
      RETURNING *
    `, {
      replacements: {
        postId,
        userId,
        parentCommentId: parentCommentId || null,
        content: escapeHtml(content)
      }
    });

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: { comment: commentResult[0] }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
