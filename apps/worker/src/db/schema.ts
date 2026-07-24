import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
};

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), telegramId: text('telegram_id').notNull().unique(), firstName: text('first_name').notNull(),
  lastName: text('last_name'), username: text('username'), avatarUrl: text('avatar_url'), age: integer('age'), gender: text('gender'),
  heightCm: real('height_cm'), currentWeightKg: real('current_weight_kg'), targetWeightKg: real('target_weight_kg'),
  activityLevel: text('activity_level'), goal: text('goal'), calorieTarget: integer('calorie_target').notNull().default(2000),
  proteinTarget: integer('protein_target').notNull().default(120), carbsTarget: integer('carbs_target').notNull().default(220),
  fatTarget: integer('fat_target').notNull().default(65), waterTargetMl: integer('water_target_ml').notNull().default(2200),
  onboardingComplete: integer('onboarding_complete', { mode: 'boolean' }).notNull().default(false), xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1), coins: integer('coins').notNull().default(0), ...timestamps,
}, (table) => [index('users_telegram_idx').on(table.telegramId)]);

export const foods = sqliteTable('foods', {
  id: text('id').primaryKey(), userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), name: text('name').notNull(),
  brand: text('brand'), servingLabel: text('serving_label').notNull().default('1 serving'), servingGrams: real('serving_grams').notNull().default(100),
  calories: real('calories').notNull(), protein: real('protein').notNull().default(0), carbs: real('carbs').notNull().default(0),
  fat: real('fat').notNull().default(0), isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  useCount: integer('use_count').notNull().default(0), ...timestamps,
}, (table) => [index('foods_name_idx').on(table.name), index('foods_user_idx').on(table.userId)]);

export const meals = sqliteTable('meals', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mealType: text('meal_type').notNull(), name: text('name'), loggedAt: text('logged_at').notNull(), ...timestamps,
}, (table) => [index('meals_user_date_idx').on(table.userId, table.loggedAt)]);

export const mealItems = sqliteTable('meal_items', {
  id: text('id').primaryKey(), mealId: text('meal_id').notNull().references(() => meals.id, { onDelete: 'cascade' }),
  foodId: text('food_id').references(() => foods.id, { onDelete: 'set null' }), foodName: text('food_name').notNull(),
  servingLabel: text('serving_label').notNull(), multiplier: real('multiplier').notNull().default(1), calories: real('calories').notNull(),
  protein: real('protein').notNull(), carbs: real('carbs').notNull(), fat: real('fat').notNull(), ...timestamps,
}, (table) => [index('meal_items_meal_idx').on(table.mealId)]);

export const waterLogs = sqliteTable('water_logs', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), amountMl: integer('amount_ml').notNull(), loggedAt: text('logged_at').notNull(), ...timestamps }, (table) => [index('water_user_date_idx').on(table.userId, table.loggedAt)]);
export const weightLogs = sqliteTable('weight_logs', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), weightKg: real('weight_kg').notNull(), loggedAt: text('logged_at').notNull(), note: text('note'), ...timestamps }, (table) => [index('weight_user_date_idx').on(table.userId, table.loggedAt)]);
export const dailyProgress = sqliteTable('daily_progress', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), date: text('date').notNull(), calories: real('calories').notNull().default(0), protein: real('protein').notNull().default(0), carbs: real('carbs').notNull().default(0), fat: real('fat').notNull().default(0), waterMl: integer('water_ml').notNull().default(0), mealsLogged: integer('meals_logged').notNull().default(0), ...timestamps }, (table) => [uniqueIndex('daily_progress_user_date_unique').on(table.userId, table.date)]);
export const missions = sqliteTable('missions', { id: text('id').primaryKey(), title: text('title').notNull(), description: text('description').notNull(), icon: text('icon').notNull(), metric: text('metric').notNull(), target: real('target').notNull(), xpReward: integer('xp_reward').notNull(), coinReward: integer('coin_reward').notNull().default(5), period: text('period').notNull().default('daily'), active: integer('active', { mode: 'boolean' }).notNull().default(true), ...timestamps });
export const completedMissions = sqliteTable('completed_missions', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), missionId: text('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }), periodKey: text('period_key').notNull(), progress: real('progress').notNull().default(0), completedAt: text('completed_at'), claimedAt: text('claimed_at'), ...timestamps }, (table) => [uniqueIndex('completed_mission_period_unique').on(table.userId, table.missionId, table.periodKey)]);
export const achievements = sqliteTable('achievements', { id: text('id').primaryKey(), title: text('title').notNull(), description: text('description').notNull(), icon: text('icon').notNull(), metric: text('metric').notNull(), target: real('target').notNull(), xpReward: integer('xp_reward').notNull(), ...timestamps });
export const userAchievements = sqliteTable('user_achievements', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), achievementId: text('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }), unlockedAt: text('unlocked_at').notNull(), ...timestamps }, (table) => [uniqueIndex('user_achievement_unique').on(table.userId, table.achievementId)]);
export const xpLogs = sqliteTable('xp_logs', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), amount: integer('amount').notNull(), reason: text('reason').notNull(), referenceId: text('reference_id'), createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()) }, (table) => [index('xp_user_idx').on(table.userId)]);
export const streaks = sqliteTable('streaks', { id: text('id').primaryKey(), userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }), currentStreak: integer('current_streak').notNull().default(0), longestStreak: integer('longest_streak').notNull().default(0), lastActiveDate: text('last_active_date'), ...timestamps });
export const settings = sqliteTable('settings', { id: text('id').primaryKey(), userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }), theme: text('theme').notNull().default('system'), language: text('language').notNull().default('en'), units: text('units').notNull().default('metric'), dailyReminder: integer('daily_reminder', { mode: 'boolean' }).notNull().default(true), waterReminder: integer('water_reminder', { mode: 'boolean' }).notNull().default(true), calorieReminder: integer('calorie_reminder', { mode: 'boolean' }).notNull().default(true), streakWarning: integer('streak_warning', { mode: 'boolean' }).notNull().default(true), reminderHour: integer('reminder_hour').notNull().default(9), timezone: text('timezone').notNull().default('UTC'), ...timestamps });
export const sessions = sqliteTable('sessions', { id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), tokenHash: text('token_hash').notNull().unique(), expiresAt: text('expires_at').notNull(), lastSeenAt: text('last_seen_at').notNull(), createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()) }, (table) => [index('sessions_user_idx').on(table.userId)]);
