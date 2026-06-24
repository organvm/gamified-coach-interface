const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('member', 'coach', 'admin', 'founder'),
    defaultValue: 'member'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'deleted'),
    defaultValue: 'active'
  },

  // Profile Information
  first_name: DataTypes.STRING(100),
  last_name: DataTypes.STRING(100),
  avatar_url: DataTypes.TEXT,
  bio: DataTypes.TEXT,
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'UTC'
  },

  // Gamification Stats
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  total_xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  current_xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  xp_to_next_level: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  title: {
    type: DataTypes.STRING(100),
    defaultValue: 'Recruit'
  },

  // Onboarding & Preferences
  gamification_style: {
    type: DataTypes.ENUM('sports', 'rpg', 'platformer', 'fps', 'strategy', 'racing'),
    defaultValue: 'rpg'
  },
  gamification_theme: {
    type: DataTypes.STRING(100),
    defaultValue: 'cyberpunk'
  },
  onboarding_completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  // Subscription
  subscription_tier: {
    type: DataTypes.ENUM('free', 'potion', 'core_quest', 'raid', 'mastermind'),
    defaultValue: 'free'
  },
  subscription_start_date: DataTypes.DATE,
  subscription_end_date: DataTypes.DATE,
  stripe_customer_id: DataTypes.STRING(255),

  // Tracking
  last_login: DataTypes.DATE,
  login_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  longest_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'users',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password_hash) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password_hash')) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      unique: true,
      fields: ['username']
    },
    // Performance: Optimize search by status for active user queries
    {
      fields: ['status']
    },
    // Performance: Optimize gamification leaderboards
    {
      fields: ['total_xp', 'level']
    }
  ]
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password_hash);
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password_hash;
  return values;
};

User.prototype.addXP = async function(xpAmount) {
  this.current_xp += xpAmount;
  this.total_xp += xpAmount;

  // Level up logic
  while (this.current_xp >= this.xp_to_next_level) {
    this.current_xp -= this.xp_to_next_level;
    this.level += 1;
    this.xp_to_next_level = Math.floor(100 * Math.pow(this.level, 1.5));

    // Update title based on level
    this.title = this.getTitleForLevel(this.level);
  }

  await this.save();
  return {
    leveledUp: true,
    newLevel: this.level,
    currentXP: this.current_xp,
    xpToNext: this.xp_to_next_level
  };
};

User.prototype.getTitleForLevel = function(level) {
  if (level >= 50) return 'Legion Commander';
  if (level >= 40) return 'War Master';
  if (level >= 30) return 'Elite Warrior';
  if (level >= 20) return 'Veteran';
  if (level >= 10) return 'Soldier';
  if (level >= 5) return 'Fighter';
  return 'Recruit';
};

module.exports = User;
