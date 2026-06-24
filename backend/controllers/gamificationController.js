const { sequelize } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const User = require('../models/User');
const logger = require('../utils/logger');
const { trackEvent } = require('../services/analyticsService');

// ============================================
// ACHIEVEMENTS
// ============================================

/**
 * @desc    Get all achievements
 * @route   GET /api/v1/achievements
 * @access  Public
 */
exports.getAllAchievements = async (req, res, next) => {
  try {
    const { category, rarity, hideHidden } = req.query;

    let whereClause = {};
    if (category) whereClause.category = category;
    if (rarity) whereClause.rarity = rarity;
    if (hideHidden === 'true') whereClause.is_hidden = false;

    const query = `
      SELECT * FROM achievements
      ${Object.keys(whereClause).length > 0 ? 'WHERE ' + Object.keys(whereClause).map(k => `${k} = :${k}`).join(' AND ') : ''}
      ORDER BY rarity DESC, xp_reward DESC
    `;

    const [achievements] = await sequelize.query(query, {
      replacements: whereClause
    });

    res.json({
      success: true,
      count: achievements.length,
      data: { achievements }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's achievements
 * @route   GET /api/v1/achievements/user/:userId
 * @access  Private
 */
exports.getUserAchievements = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const query = `
      SELECT
        a.*,
        ua.unlocked_at,
        ua.progress,
        ua.is_completed
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = :userId
      ORDER BY ua.is_completed DESC, a.rarity DESC, a.xp_reward DESC
    `;

    const [achievements] = await sequelize.query(query, {
      replacements: { userId }
    });

    const completed = achievements.filter(a => a.is_completed).length;
    const total = achievements.length;
    const completionPercentage = Math.round((completed / total) * 100);

    res.json({
      success: true,
      data: {
        achievements,
        stats: {
          completed,
          total,
          completionPercentage
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check and unlock achievements for user
 * @route   POST /api/v1/achievements/check
 * @access  Private
 */
exports.checkAchievements = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findByPk(userId);

    // Get user statistics
    const [stats] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM user_quests WHERE user_id = :userId AND status = 'completed') as quests_completed,
        (SELECT COUNT(*) FROM forum_posts WHERE user_id = :userId) as posts_created,
        (SELECT COUNT(*) FROM workouts WHERE user_id = :userId) as workouts_logged,
        (SELECT COUNT(*) FROM guilds WHERE created_by = :userId) as guilds_created,
        (SELECT SUM(likes_count) FROM forum_posts WHERE user_id = :userId) as likes_received,
        :loginStreak as login_streak,
        :level as level
    `, {
      replacements: {
        userId,
        loginStreak: user.login_streak,
        level: user.level
      }
    });

    const userStats = stats[0];

    // Get all achievements and check if user qualifies
    const [achievements] = await sequelize.query(`
      SELECT a.*, ua.is_completed
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = :userId
      WHERE ua.is_completed IS NULL OR ua.is_completed = FALSE
    `, {
      replacements: { userId }
    });

    const unlockedAchievements = [];
    let totalXPReward = 0;
    const dbPromises = [];

    for (const achievement of achievements) {
      const requirements = achievement.requirements;
      let unlocked = true;

      // Check each requirement
      for (const [key, value] of Object.entries(requirements)) {
        if (userStats[key] < value) {
          unlocked = false;
          break;
        }
      }

      if (unlocked) {
        // Accumulate XP
        totalXPReward += achievement.xp_reward;
        unlockedAchievements.push(achievement);

        // Unlock achievement
        dbPromises.push(sequelize.query(`
          INSERT INTO user_achievements (user_id, achievement_id, is_completed, unlocked_at)
          VALUES (:userId, :achievementId, TRUE, NOW())
          ON CONFLICT (user_id, achievement_id) DO UPDATE
          SET is_completed = TRUE, unlocked_at = NOW()
        `, {
          replacements: {
            userId,
            achievementId: achievement.id
          }
        }));

        // Create notification
        dbPromises.push(sequelize.query(`
          INSERT INTO notifications (user_id, notification_type, title, message, data)
          VALUES (:userId, 'achievement', :title, :message, :data)
        `, {
          replacements: {
            userId,
            title: '🏆 ACHIEVEMENT UNLOCKED!',
            message: `You unlocked: ${achievement.name}`,
            data: JSON.stringify({ achievementId: achievement.id, xpReward: achievement.xp_reward })
          }
        }));

        // Track event
        dbPromises.push(trackEvent({
          userId,
          eventType: 'achievement_unlocked',
          properties: {
            achievementId: achievement.id,
            achievementName: achievement.name,
            xpReward: achievement.xp_reward
          }
        }));
      }
    }

    // Performance optimization: Execute all DB operations concurrently
    if (dbPromises.length > 0) {
      await Promise.all(dbPromises);
    }

    // Update user XP once
    if (totalXPReward > 0) {
      await user.addXP(totalXPReward);
    }

    res.json({
      success: true,
      data: {
        unlockedCount: unlockedAchievements.length,
        achievements: unlockedAchievements
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SKILLS & SKILL TREES
// ============================================

/**
 * @desc    Get all skill trees
 * @route   GET /api/v1/skills/trees
 * @access  Public
 */
exports.getSkillTrees = async (req, res, next) => {
  try {
    const [skillTrees] = await sequelize.query(`
      SELECT
        st.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', sn.id,
              'name', sn.name,
              'description', sn.description,
              'tier', sn.tier,
              'position_x', sn.position_x,
              'position_y', sn.position_y,
              'parent_node_id', sn.parent_node_id,
              'xp_cost', sn.xp_cost,
              'requirements', sn.requirements,
              'benefits', sn.benefits,
              'icon_url', sn.icon_url
            )
          )
          FROM skill_nodes sn
          WHERE sn.skill_tree_id = st.id
          ORDER BY sn.tier, sn.position_y
        ) as nodes
      FROM skill_trees st
      ORDER BY st.category
    `);

    res.json({
      success: true,
      data: { skillTrees }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's skill progress
 * @route   GET /api/v1/skills/user/:userId
 * @access  Private
 */
exports.getUserSkills = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const [userSkills] = await sequelize.query(`
      SELECT
        st.id as tree_id,
        st.name as tree_name,
        st.category,
        json_agg(
          json_build_object(
            'nodeId', sn.id,
            'nodeName', sn.name,
            'tier', sn.tier,
            'isUnlocked', COALESCE(us.is_unlocked, FALSE),
            'currentLevel', COALESCE(us.current_level, 0),
            'unlockedAt', us.unlocked_at
          )
        ) as nodes
      FROM skill_trees st
      JOIN skill_nodes sn ON st.id = sn.skill_tree_id
      LEFT JOIN user_skills us ON sn.id = us.skill_node_id AND us.user_id = :userId
      GROUP BY st.id, st.name, st.category
      ORDER BY st.category
    `, {
      replacements: { userId }
    });

    res.json({
      success: true,
      data: { skills: userSkills }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Unlock skill node
 * @route   POST /api/v1/skills/unlock
 * @access  Private
 */
exports.unlockSkill = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { skillNodeId } = req.body;

    // Get skill node details
    const [skillNodes] = await sequelize.query(`
      SELECT * FROM skill_nodes WHERE id = :skillNodeId
    `, {
      replacements: { skillNodeId }
    });

    if (skillNodes.length === 0) {
      throw new AppError('Skill node not found', 404, 'SKILL_NOT_FOUND');
    }

    const skillNode = skillNodes[0];

    // Check if user has enough XP
    const user = await User.findByPk(userId);

    if (user.current_xp < skillNode.xp_cost) {
      throw new AppError('Insufficient XP', 400, 'INSUFFICIENT_XP');
    }

    // Check if parent node is unlocked (if required)
    if (skillNode.parent_node_id) {
      const [parentUnlocked] = await sequelize.query(`
        SELECT is_unlocked FROM user_skills
        WHERE user_id = :userId AND skill_node_id = :parentNodeId
      `, {
        replacements: {
          userId,
          parentNodeId: skillNode.parent_node_id
        }
      });

      if (!parentUnlocked || !parentUnlocked[0]?.is_unlocked) {
        throw new AppError('Parent skill must be unlocked first', 400, 'PARENT_REQUIRED');
      }
    }

    // Deduct XP
    user.current_xp -= skillNode.xp_cost;
    await user.save();

    // Unlock skill
    await sequelize.query(`
      INSERT INTO user_skills (user_id, skill_node_id, is_unlocked, unlocked_at, current_level)
      VALUES (:userId, :skillNodeId, TRUE, NOW(), 1)
      ON CONFLICT (user_id, skill_node_id) DO UPDATE
      SET is_unlocked = TRUE, unlocked_at = NOW(), current_level = user_skills.current_level + 1
    `, {
      replacements: {
        userId,
        skillNodeId
      }
    });

    // Create notification
    await sequelize.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, data)
      VALUES (:userId, 'achievement', :title, :message, :data)
    `, {
      replacements: {
        userId,
        title: '⚡ SKILL UNLOCKED!',
        message: `You unlocked: ${skillNode.name}`,
        data: JSON.stringify({ skillNodeId, benefits: skillNode.benefits })
      }
    });

    // Track event
    await trackEvent({
      userId,
      eventType: 'skill_unlocked',
      properties: {
        skillNodeId,
        skillName: skillNode.name,
        xpCost: skillNode.xp_cost
      }
    });

    res.json({
      success: true,
      message: 'Skill unlocked successfully',
      data: {
        skill: skillNode,
        remainingXP: user.current_xp
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// ONBOARDING
// ============================================

/**
 * @desc    Save user onboarding preferences
 * @route   POST /api/v1/users/onboarding
 * @access  Private
 */
exports.saveOnboarding = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { role, gamificationStyle, gamificationTheme } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Update user fields
    if (role) user.role = role; // Note: In a real app, changing role might require more checks
    if (gamificationStyle) user.gamification_style = gamificationStyle;
    if (gamificationTheme) user.gamification_theme = gamificationTheme;
    user.onboarding_completed = true;

    await user.save();

    await trackEvent({
      userId,
      eventType: 'onboarding_completed',
      properties: {
        role,
        style: gamificationStyle,
        theme: gamificationTheme
      }
    });

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      data: {
        user: {
          id: user.id,
          role: user.role,
          gamificationStyle: user.gamification_style,
          gamificationTheme: user.gamification_theme,
          onboardingCompleted: user.onboarding_completed
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// XP & LEVELING
// ============================================

/**
 * @desc    Award XP to user
 * @route   POST /api/v1/xp/award
 * @access  Private
 */
exports.awardXP = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { xpAmount, reason } = req.body;

    if (!xpAmount || xpAmount <= 0) {
      throw new AppError('Invalid XP amount', 400, 'INVALID_XP');
    }

    const user = await User.findByPk(userId);
    const previousLevel = user.level;

    const result = await user.addXP(xpAmount);

    // Track XP award
    await trackEvent({
      userId,
      eventType: 'xp_awarded',
      properties: {
        xpAmount,
        reason,
        newLevel: user.level
      }
    });

    // Check if leveled up
    if (user.level > previousLevel) {
      await trackEvent({
        userId,
        eventType: 'level_up',
        properties: {
          newLevel: user.level,
          previousLevel
        }
      });
    }

    res.json({
      success: true,
      message: `Awarded ${xpAmount} XP`,
      data: {
        xpAwarded: xpAmount,
        currentXP: user.current_xp,
        totalXP: user.total_xp,
        level: user.level,
        xpToNextLevel: user.xp_to_next_level,
        leveledUp: user.level > previousLevel,
        newTitle: user.title
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's XP history
 * @route   GET /api/v1/xp/history
 * @access  Private
 */
exports.getXPHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.query;

    const [history] = await sequelize.query(`
      SELECT
        event_type,
        properties,
        created_at
      FROM analytics_events
      WHERE user_id = :userId
        AND event_type IN ('xp_awarded', 'level_up')
      ORDER BY created_at DESC
      LIMIT :limit
    `, {
      replacements: { userId, limit: parseInt(limit) }
    });

    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
