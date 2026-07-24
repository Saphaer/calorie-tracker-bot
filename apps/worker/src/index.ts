import { zValidator } from '@hono/zod-validator';
import { calculateTargets, levelForXp } from '@nourish/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

type Bindings = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  APP_ORIGIN?: string;
};

type Variables = { userId: string; telegramId: string };
type TelegramUser = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; language_code?: string };
type RewardUnlock = { id: string; type: 'mission' | 'achievement'; title: string; xp: number; level: number; leveledUp: boolean };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const id = () => crypto.randomUUID();
const ok = <T>(data: T) => ({ success: true as const, data });

app.use('*', async (context, next) => {
  const origin = context.env.APP_ORIGIN ?? '*';
  return cors({ origin, allowHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'X-Demo-User-Id'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })(context, next);
});

app.onError((error, context) => {
  if (error instanceof HTTPException) return context.json({ success: false, error: error.message }, error.status);
  console.error(error);
  return context.json({ success: false, error: 'Something went wrong. Please try again.' }, 500);
});

app.get('/health', (context) => context.json(ok({ status: 'healthy', time: now() })));

async function hmac(key: ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validateInitData(initData: string, token: string): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !authDate || Date.now() / 1000 - authDate > 86_400) return null;
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData').buffer as ArrayBuffer, token);
  const signature = hex(await hmac(secret, checkString));
  if (signature.length !== hash.length) return null;
  let mismatch = 0;
  for (let index = 0; index < signature.length; index += 1) mismatch |= signature.charCodeAt(index) ^ hash.charCodeAt(index);
  if (mismatch !== 0) return null;
  const user = params.get('user');
  return user ? (JSON.parse(user) as TelegramUser) : null;
}

async function ensureUser(database: D1Database, telegram: TelegramUser) {
  let user = await database.prepare('SELECT * FROM users WHERE telegram_id = ?').bind(String(telegram.id)).first<Record<string, unknown>>();
  if (!user) {
    const userId = id();
    const timestamp = now();
    await database.batch([
      database.prepare('INSERT INTO users (id,telegram_id,first_name,last_name,username,avatar_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(userId, String(telegram.id), telegram.first_name, telegram.last_name ?? null, telegram.username ?? null, telegram.photo_url ?? null, timestamp, timestamp),
      database.prepare('INSERT INTO streaks (id,user_id,created_at,updated_at) VALUES (?,?,?,?)').bind(id(), userId, timestamp, timestamp),
      database.prepare('INSERT INTO settings (id,user_id,created_at,updated_at) VALUES (?,?,?,?)').bind(id(), userId, timestamp, timestamp),
    ]);
    if (telegram.language_code?.startsWith('ru')) await database.prepare("UPDATE settings SET language='ru' WHERE user_id=?").bind(userId).run();
    user = await database.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<Record<string, unknown>>();
  }
  return user!;
}

app.use('/api/*', async (context, next) => {
  const demoId = context.req.header('X-Demo-User-Id');
  let telegram: TelegramUser | null = null;
  if (demoId) telegram = { id: Number(demoId) || 10001, first_name: 'Alex', username: 'demo' };
  else {
    const initData = context.req.header('X-Telegram-Init-Data');
    if (initData && context.env.TELEGRAM_BOT_TOKEN) telegram = await validateInitData(initData, context.env.TELEGRAM_BOT_TOKEN);
  }
  if (!telegram) throw new HTTPException(401, { message: 'Open Nourish inside Telegram to continue.' });
  const user = await ensureUser(context.env.DB, telegram);
  context.set('userId', String(user.id));
  context.set('telegramId', String(telegram.id));
  await next();
});

function mapProfile(row: Record<string, unknown>, streak?: Record<string, unknown> | null) {
  return {
    id: row.id, telegramId: row.telegram_id, firstName: row.first_name, lastName: row.last_name, username: row.username, avatarUrl: row.avatar_url,
    age: row.age, gender: row.gender, heightCm: row.height_cm, currentWeightKg: row.current_weight_kg, targetWeightKg: row.target_weight_kg,
    activityLevel: row.activity_level, goal: row.goal, calorieTarget: row.calorie_target, proteinTarget: row.protein_target,
    carbsTarget: row.carbs_target, fatTarget: row.fat_target, waterTargetMl: row.water_target_ml,
    onboardingComplete: Boolean(row.onboarding_complete), xp: row.xp, level: row.level, coins: row.coins,
    currentStreak: streak?.current_streak ?? 0, longestStreak: streak?.longest_streak ?? 0,
  };
}

async function touchDaily(database: D1Database, userId: string) {
  const date = today();
  await database.prepare(`INSERT INTO daily_progress (id,user_id,date,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,date) DO NOTHING`).bind(id(), userId, date, now(), now()).run();
  const streak = await database.prepare('SELECT * FROM streaks WHERE user_id = ?').bind(userId).first<Record<string, unknown>>();
  const last = String(streak?.last_active_date ?? '');
  if (last !== date) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const current = last === yesterday ? Number(streak?.current_streak ?? 0) + 1 : 1;
    const longest = Math.max(current, Number(streak?.longest_streak ?? 0));
    await database.prepare('UPDATE streaks SET current_streak=?,longest_streak=?,last_active_date=?,updated_at=? WHERE user_id=?').bind(current, longest, date, now(), userId).run();
    const loginReference = `daily-login:`;
    const loginReward = await database.prepare('SELECT id FROM xp_logs WHERE user_id=? AND reference_id=?').bind(userId, loginReference).first();
    if (!loginReward) await awardXp(database, userId, 15, 'Daily login', loginReference);
  }
}

async function awardXp(database: D1Database, userId: string, amount: number, reason: string, referenceId?: string) {
  const user = await database.prepare('SELECT xp,level FROM users WHERE id=?').bind(userId).first<{ xp: number; level: number }>();
  const nextXp = (user?.xp ?? 0) + amount;
  const nextLevel = levelForXp(nextXp);
  await database.batch([
    database.prepare('UPDATE users SET xp=?,level=?,coins=coins+?,updated_at=? WHERE id=?').bind(nextXp, nextLevel, Math.max(1, Math.round(amount / 5)), now(), userId),
    database.prepare('INSERT INTO xp_logs (id,user_id,amount,reason,reference_id,created_at) VALUES (?,?,?,?,?,?)').bind(id(), userId, amount, reason, referenceId ?? null, now()),
  ]);
  return { xp: nextXp, level: nextLevel, leveledUp: nextLevel > (user?.level ?? 1) };
}

async function evaluateRewards(database: D1Database, userId: string) {
  const user = await database.prepare('SELECT * FROM users WHERE id=?').bind(userId).first<Record<string, unknown>>();
  if (!user) return [];
  const [progress, streak, mealCount, activeDays, proteinDays, waterDays] = await Promise.all([
    database.prepare('SELECT * FROM daily_progress WHERE user_id=? AND date=?').bind(userId, today()).first<Record<string, unknown>>(),
    database.prepare('SELECT * FROM streaks WHERE user_id=?').bind(userId).first<Record<string, unknown>>(),
    database.prepare('SELECT count(*) count FROM meals WHERE user_id=?').bind(userId).first<{ count: number }>(),
    database.prepare("SELECT count(*) count FROM daily_progress WHERE user_id=? AND date>=date(?, 'weekday 1', '-7 days') AND (meals_logged>0 OR water_ml>0)").bind(userId, today()).first<{ count: number }>(),
    database.prepare('SELECT count(*) count FROM daily_progress WHERE user_id=? AND protein>=?').bind(userId, Number(user.protein_target)).first<{ count: number }>(),
    database.prepare('SELECT count(*) count FROM daily_progress WHERE user_id=? AND water_ml>=?').bind(userId, Number(user.water_target_ml)).first<{ count: number }>(),
  ]);
  const mealTypes = await database.prepare('SELECT DISTINCT meal_type FROM meals WHERE user_id=? AND substr(logged_at,1,10)=?').bind(userId, today()).all<{ meal_type: string }>();
  const types = new Set(mealTypes.results.map((row) => row.meal_type));
  const missionValues: Record<string, number> = {
    water: Number(progress?.water_ml ?? 0), protein: Number(progress?.protein ?? 0), breakfast: types.has('breakfast') ? 1 : 0,
    meal_types: ['breakfast', 'lunch', 'dinner'].filter((type) => types.has(type)).length, active_days: Number(activeDays?.count ?? 0),
  };
  const unlocked: RewardUnlock[] = [];
  const missionRows = await database.prepare('SELECT * FROM missions WHERE active=1').all<Record<string, unknown>>();
  for (const mission of missionRows.results) {
    const periodKey = mission.period === 'weekly' ? `week:${new Date().toISOString().slice(0, 7)}:${Math.ceil(new Date().getUTCDate() / 7)}` : today();
    const value = missionValues[String(mission.metric)] ?? 0;
    const target = mission.metric === 'protein' ? Number(user.protein_target) : Number(mission.target);
    const existing = await database.prepare('SELECT completed_at FROM completed_missions WHERE user_id=? AND mission_id=? AND period_key=?').bind(userId, mission.id, periodKey).first<{ completed_at: string | null }>();
    const completedAt = value >= target ? existing?.completed_at ?? now() : null;
    await database.prepare(`INSERT INTO completed_missions (id,user_id,mission_id,period_key,progress,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,mission_id,period_key) DO UPDATE SET progress=excluded.progress,completed_at=coalesce(completed_missions.completed_at,excluded.completed_at),updated_at=excluded.updated_at`).bind(id(), userId, mission.id, periodKey, value, completedAt, now(), now()).run();
    if (completedAt && !existing?.completed_at) {
      const reward = await awardXp(database, userId, Number(mission.xp_reward), `Mission: ${mission.title}`, String(mission.id));
      unlocked.push({ id: String(mission.id), type: 'mission', title: String(mission.title), xp: Number(mission.xp_reward), level: reward.level, leveledUp: reward.leveledUp });
    }
  }
  const goalReached = user.goal === 'gain' ? Number(user.current_weight_kg) >= Number(user.target_weight_kg) : user.goal === 'lose' ? Number(user.current_weight_kg) <= Number(user.target_weight_kg) : false;
  const achievementValues: Record<string, number> = { meals: Number(mealCount?.count ?? 0), streak: Number(streak?.longest_streak ?? 0), protein_days: Number(proteinDays?.count ?? 0), water_days: Number(waterDays?.count ?? 0), goal_weight: goalReached ? 1 : 0 };
  const achievementRows = await database.prepare('SELECT * FROM achievements').all<Record<string, unknown>>();
  for (const achievement of achievementRows.results) {
    if ((achievementValues[String(achievement.metric)] ?? 0) < Number(achievement.target)) continue;
    const result = await database.prepare('INSERT OR IGNORE INTO user_achievements (id,user_id,achievement_id,unlocked_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id(), userId, achievement.id, now(), now(), now()).run();
    if (result.meta.changes > 0) {
      const reward = await awardXp(database, userId, Number(achievement.xp_reward), `Achievement: ${achievement.title}`, String(achievement.id));
      unlocked.push({ id: String(achievement.id), type: 'achievement', title: String(achievement.title), xp: Number(achievement.xp_reward), level: reward.level, leveledUp: reward.leveledUp });
    }
  }
  return unlocked;
}
app.get('/api/dashboard', async (context) => {
  const userId = context.get('userId');
  await touchDaily(context.env.DB, userId);
  await evaluateRewards(context.env.DB, userId);
  const [user, streak, progress, mealRows, missionRows, achievementRows, recentRows, favoriteRows] = await Promise.all([
    context.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first<Record<string, unknown>>(),
    context.env.DB.prepare('SELECT * FROM streaks WHERE user_id=?').bind(userId).first<Record<string, unknown>>(),
    context.env.DB.prepare('SELECT * FROM daily_progress WHERE user_id=? AND date=?').bind(userId, today()).first<Record<string, unknown>>(),
    context.env.DB.prepare(`SELECT mi.id,mi.food_name name,mi.serving_label,mi.multiplier,mi.calories,mi.protein,mi.carbs,mi.fat,m.meal_type,m.logged_at FROM meal_items mi JOIN meals m ON m.id=mi.meal_id WHERE m.user_id=? AND substr(m.logged_at,1,10)=? ORDER BY m.logged_at DESC`).bind(userId, today()).all<Record<string, unknown>>(),
    context.env.DB.prepare('SELECT * FROM missions WHERE active=1 ORDER BY period,xp_reward').all<Record<string, unknown>>(),
    context.env.DB.prepare(`SELECT a.*,ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=? ORDER BY ua.unlocked_at DESC,a.xp_reward`).bind(userId).all<Record<string, unknown>>(),
    context.env.DB.prepare('SELECT * FROM foods WHERE user_id IS NULL OR user_id=? ORDER BY use_count DESC,updated_at DESC LIMIT 8').bind(userId).all<Record<string, unknown>>(),
    context.env.DB.prepare('SELECT * FROM foods WHERE user_id=? AND is_favorite=1 ORDER BY updated_at DESC LIMIT 8').bind(userId).all<Record<string, unknown>>(),
  ]);
  const daily = progress ?? { date: today(), calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0 };
  const mealTypes = new Set(mealRows.results.map((row) => row.meal_type));
  const missionProgress: Record<string, number> = { water: Number(daily.water_ml), protein: Number(daily.protein), breakfast: mealTypes.has('breakfast') ? 1 : 0, meal_types: ['breakfast','lunch','dinner'].filter((type) => mealTypes.has(type)).length, active_days: Number(streak?.current_streak ?? 0) };
  return context.json(ok({
    profile: mapProfile(user!, streak),
    progress: { date: daily.date, calories: daily.calories, protein: daily.protein, carbs: daily.carbs, fat: daily.fat, waterMl: daily.water_ml },
    meals: mealRows.results.map((row) => ({ ...row, id: row.id, name: row.name, servingLabel: row.serving_label, mealType: row.meal_type, loggedAt: row.logged_at })),
    missions: missionRows.results.map((row) => ({ id: row.id, title: row.title, description: row.description, icon: row.icon, xpReward: row.xp_reward, period: row.period, target: row.target, progress: Math.min(Number(row.target), missionProgress[String(row.metric)] ?? 0), completed: (missionProgress[String(row.metric)] ?? 0) >= Number(row.target) })),
    achievements: achievementRows.results.map((row) => ({ id: row.id, title: row.title, description: row.description, icon: row.icon, xpReward: row.xp_reward, unlockedAt: row.unlocked_at })),
    recentFoods: recentRows.results.map(mapFood), favoriteFoods: favoriteRows.results.map(mapFood),
  }));
});

const onboardingSchema = z.object({ age: z.number().int().min(13).max(100), gender: z.enum(['male','female','other']), heightCm: z.number().min(120).max(230), currentWeightKg: z.number().min(35).max(350), targetWeightKg: z.number().min(35).max(350), activityLevel: z.enum(['sedentary','light','moderate','high','athlete']), goal: z.enum(['lose','maintain','gain']) });
app.put('/api/profile/onboarding', zValidator('json', onboardingSchema), async (context) => {
  const input = context.req.valid('json');
  const targets = calculateTargets({ age: input.age, gender: input.gender, heightCm: input.heightCm, weightKg: input.currentWeightKg, activity: input.activityLevel, goal: input.goal });
  await context.env.DB.prepare(`UPDATE users SET age=?,gender=?,height_cm=?,current_weight_kg=?,target_weight_kg=?,activity_level=?,goal=?,calorie_target=?,protein_target=?,carbs_target=?,fat_target=?,water_target_ml=?,onboarding_complete=1,updated_at=? WHERE id=?`).bind(input.age,input.gender,input.heightCm,input.currentWeightKg,input.targetWeightKg,input.activityLevel,input.goal,targets.calories,targets.protein,targets.carbs,targets.fat,targets.waterMl,now(),context.get('userId')).run();
  await context.env.DB.prepare('INSERT INTO weight_logs (id,user_id,weight_kg,logged_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id(),context.get('userId'),input.currentWeightKg,now(),now(),now()).run();
  return context.json(ok(targets));
});

function mapFood(row: Record<string, unknown>) { return { id: row.id, name: row.name, brand: row.brand, servingLabel: row.serving_label, servingGrams: row.serving_grams, calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat, isFavorite: Boolean(row.is_favorite) }; }
app.get('/api/foods', async (context) => {
  const query = `%${context.req.query('q') ?? ''}%`;
  const rows = await context.env.DB.prepare('SELECT * FROM foods WHERE (user_id IS NULL OR user_id=?) AND name LIKE ? ORDER BY is_favorite DESC,use_count DESC,name LIMIT 30').bind(context.get('userId'),query).all<Record<string, unknown>>();
  return context.json(ok(rows.results.map(mapFood)));
});
const foodSchema = z.object({ name: z.string().min(2).max(80), brand: z.string().max(80).optional(), servingLabel: z.string().min(1).max(40), servingGrams: z.number().positive(), calories: z.number().nonnegative(), protein: z.number().nonnegative(), carbs: z.number().nonnegative(), fat: z.number().nonnegative() });
app.post('/api/foods', zValidator('json', foodSchema), async (context) => {
  const food = context.req.valid('json'); const foodId = id(); const timestamp = now();
  await context.env.DB.prepare('INSERT INTO foods (id,user_id,name,brand,serving_label,serving_grams,calories,protein,carbs,fat,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(foodId,context.get('userId'),food.name,food.brand ?? null,food.servingLabel,food.servingGrams,food.calories,food.protein,food.carbs,food.fat,timestamp,timestamp).run();
  return context.json(ok({ id: foodId, ...food }), 201);
});
app.patch('/api/foods/:id/favorite', async (context) => {
  const userId = context.get('userId');
  const food = await context.env.DB.prepare('SELECT * FROM foods WHERE id=? AND (user_id IS NULL OR user_id=?)').bind(context.req.param('id'), userId).first<Record<string, unknown>>();
  if (!food) throw new HTTPException(404, { message: 'Food not found' });
  if (food.user_id === null) {
    await context.env.DB.prepare('INSERT INTO foods (id,user_id,name,brand,serving_label,serving_grams,calories,protein,carbs,fat,is_favorite,use_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id(), userId, food.name, food.brand, food.serving_label, food.serving_grams, food.calories, food.protein, food.carbs, food.fat, 1, 0, now(), now()).run();
  } else {
    await context.env.DB.prepare('UPDATE foods SET is_favorite=CASE WHEN is_favorite=1 THEN 0 ELSE 1 END,updated_at=? WHERE id=? AND user_id=?').bind(now(), food.id, userId).run();
  }
  return context.json(ok({ updated: true }));
});

const mealSchema = z.object({ mealType: z.enum(['breakfast','lunch','dinner','snack']), foodId: z.string().optional(), name: z.string().min(1), servingLabel: z.string().min(1), multiplier: z.number().positive().max(20), calories: z.number().nonnegative(), protein: z.number().nonnegative(), carbs: z.number().nonnegative(), fat: z.number().nonnegative(), loggedAt: z.string().datetime().optional() });
app.post('/api/meals', zValidator('json', mealSchema), async (context) => {
  const input = context.req.valid('json'); const timestamp = input.loggedAt ?? now(); const mealId = id(); const itemId = id(); const userId = context.get('userId'); const scale = input.multiplier; await touchDaily(context.env.DB,userId);
  await context.env.DB.batch([
    context.env.DB.prepare('INSERT INTO meals (id,user_id,meal_type,logged_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(mealId,userId,input.mealType,timestamp,now(),now()),
    context.env.DB.prepare('INSERT INTO meal_items (id,meal_id,food_id,food_name,serving_label,multiplier,calories,protein,carbs,fat,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(itemId,mealId,input.foodId ?? null,input.name,input.servingLabel,scale,input.calories*scale,input.protein*scale,input.carbs*scale,input.fat*scale,now(),now()),
    context.env.DB.prepare('UPDATE daily_progress SET calories=calories+?,protein=protein+?,carbs=carbs+?,fat=fat+?,meals_logged=meals_logged+1,updated_at=? WHERE user_id=? AND date=?').bind(input.calories*scale,input.protein*scale,input.carbs*scale,input.fat*scale,now(),userId,timestamp.slice(0,10)),
    context.env.DB.prepare('UPDATE foods SET use_count=use_count+1,updated_at=? WHERE id=?').bind(now(),input.foodId ?? ''),
  ]);
  const reward = await awardXp(context.env.DB,userId,10,'Meal logged',mealId);
  const rewards = await evaluateRewards(context.env.DB, userId);
  await notifyRewards(context.env, userId, rewards, reward.leveledUp ? reward.level : undefined);
  return context.json(ok({ id: itemId, reward, rewards }), 201);
});
app.delete('/api/meals/:itemId', async (context) => {
  const userId=context.get('userId'); const item=await context.env.DB.prepare(`SELECT mi.*,m.id meal_id,m.logged_at FROM meal_items mi JOIN meals m ON m.id=mi.meal_id WHERE mi.id=? AND m.user_id=?`).bind(context.req.param('itemId'),userId).first<Record<string,unknown>>(); if(!item) throw new HTTPException(404,{message:'Meal item not found'});
  await context.env.DB.batch([context.env.DB.prepare('DELETE FROM meal_items WHERE id=?').bind(item.id),context.env.DB.prepare('DELETE FROM meals WHERE id=?').bind(item.meal_id),context.env.DB.prepare('UPDATE daily_progress SET calories=max(0,calories-?),protein=max(0,protein-?),carbs=max(0,carbs-?),fat=max(0,fat-?),meals_logged=max(0,meals_logged-1),updated_at=? WHERE user_id=? AND date=?').bind(item.calories,item.protein,item.carbs,item.fat,now(),userId,String(item.logged_at).slice(0,10))]); return context.json(ok({deleted:true}));
});

app.post('/api/water', zValidator('json', z.object({ amountMl: z.number().int().min(50).max(5000) })), async (context) => { const {amountMl}=context.req.valid('json'); const userId=context.get('userId'); await touchDaily(context.env.DB,userId); await context.env.DB.batch([context.env.DB.prepare('INSERT INTO water_logs (id,user_id,amount_ml,logged_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id(),userId,amountMl,now(),now(),now()),context.env.DB.prepare('UPDATE daily_progress SET water_ml=water_ml+?,updated_at=? WHERE user_id=? AND date=?').bind(amountMl,now(),userId,today())]); const rewards=await evaluateRewards(context.env.DB,userId); await notifyRewards(context.env,userId,rewards); return context.json(ok({amountMl,rewards})); });
app.get('/api/weights', async (context) => { const rows=await context.env.DB.prepare('SELECT id,weight_kg,logged_at FROM weight_logs WHERE user_id=? ORDER BY logged_at DESC LIMIT 120').bind(context.get('userId')).all<Record<string,unknown>>(); return context.json(ok(rows.results.map(row=>({id:row.id,weightKg:row.weight_kg,loggedAt:row.logged_at})))); });
app.post('/api/weights', zValidator('json', z.object({ weightKg:z.number().min(35).max(350), note:z.string().max(200).optional() })), async (context) => { const input=context.req.valid('json'); const timestamp=now(); const userId=context.get('userId'); await context.env.DB.batch([context.env.DB.prepare('INSERT INTO weight_logs (id,user_id,weight_kg,logged_at,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id(),userId,input.weightKg,timestamp,input.note??null,timestamp,timestamp),context.env.DB.prepare('UPDATE users SET current_weight_kg=?,updated_at=? WHERE id=?').bind(input.weightKg,timestamp,userId)]); const rewards=await evaluateRewards(context.env.DB,userId); await notifyRewards(context.env,userId,rewards); return context.json(ok({weightKg:input.weightKg,loggedAt:timestamp,rewards}),201); });

app.get('/api/stats', async (context) => { const days=Math.min(90,Math.max(7,Number(context.req.query('days')??7))); const since=new Date(Date.now()-(days-1)*86_400_000).toISOString().slice(0,10); const [progress,weights]=await Promise.all([context.env.DB.prepare('SELECT * FROM daily_progress WHERE user_id=? AND date>=? ORDER BY date').bind(context.get('userId'),since).all<Record<string,unknown>>(),context.env.DB.prepare('SELECT weight_kg,logged_at FROM weight_logs WHERE user_id=? AND substr(logged_at,1,10)>=? ORDER BY logged_at').bind(context.get('userId'),since).all<Record<string,unknown>>()]); return context.json(ok({days:progress.results.map(row=>({date:row.date,calories:row.calories,protein:row.protein,carbs:row.carbs,fat:row.fat,waterMl:row.water_ml})),weights:weights.results.map(row=>({weightKg:row.weight_kg,loggedAt:row.logged_at}))})); });
app.get('/api/settings', async (context) => { const row=await context.env.DB.prepare('SELECT * FROM settings WHERE user_id=?').bind(context.get('userId')).first<Record<string,unknown>>(); return context.json(ok(row)); });
const settingsSchema=z.object({theme:z.enum(['light','dark','system']).optional(),language:z.string().min(2).max(8).optional(),units:z.enum(['metric','imperial']).optional(),dailyReminder:z.boolean().optional(),waterReminder:z.boolean().optional(),calorieReminder:z.boolean().optional(),streakWarning:z.boolean().optional(),reminderHour:z.number().int().min(0).max(23).optional(),timezone:z.string().max(50).optional()});
app.put('/api/settings', zValidator('json',settingsSchema), async(context)=>{const input=context.req.valid('json'); const current=await context.env.DB.prepare('SELECT * FROM settings WHERE user_id=?').bind(context.get('userId')).first<Record<string,unknown>>(); await context.env.DB.prepare('UPDATE settings SET theme=?,language=?,units=?,daily_reminder=?,water_reminder=?,calorie_reminder=?,streak_warning=?,reminder_hour=?,timezone=?,updated_at=? WHERE user_id=?').bind(input.theme??current?.theme,input.language??current?.language,input.units??current?.units,input.dailyReminder===undefined?current?.daily_reminder:Number(input.dailyReminder),input.waterReminder===undefined?current?.water_reminder:Number(input.waterReminder),input.calorieReminder===undefined?current?.calorie_reminder:Number(input.calorieReminder),input.streakWarning===undefined?current?.streak_warning:Number(input.streakWarning),input.reminderHour??current?.reminder_hour,input.timezone??current?.timezone,now(),context.get('userId')).run(); return context.json(ok(input));});
app.get('/api/export', async(context)=>{const userId=context.get('userId'); const tables=['users','meals','meal_items','water_logs','weight_logs','daily_progress','completed_missions','user_achievements','xp_logs','streaks','settings']; const result:Record<string,unknown>={exportedAt:now()}; for(const table of tables){if(table==='meal_items'){result[table]=(await context.env.DB.prepare('SELECT mi.* FROM meal_items mi JOIN meals m ON m.id=mi.meal_id WHERE m.user_id=?').bind(userId).all()).results;}else result[table]=(await context.env.DB.prepare(`SELECT * FROM ${table} WHERE ${table==='users'?'id':'user_id'}=?`).bind(userId).all()).results;} return context.json(ok(result));});
app.delete('/api/account',async(context)=>{await context.env.DB.prepare('DELETE FROM users WHERE id=?').bind(context.get('userId')).run(); return context.json(ok({deleted:true}));});

type TelegramUpdate={message?:{chat:{id:number};text?:string;from?:TelegramUser}};
async function sendTelegram(token:string,chatId:string|number,text:string,appUrl?:string,russian=false){await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',reply_markup:appUrl?{inline_keyboard:[[{text:russian?'Открыть Nourish':'Open Nourish',web_app:{url:appUrl}}]]}:undefined})});}
const russianRewardTitles: Record<string,string> = {
  'water-2l':'Цель по воде',
  'log-breakfast':'Утренний ритм',
  'protein-goal':'Цель по белку',
  'all-meals':'Полный день',
  'weekly-consistency':'Стабильная неделя',
  'first-meal':'Первая еда',
  'healthy-week':'Здоровая неделя',
  'protein-master':'Мастер белка',
  'hydration-hero':'Герой воды',
  'consistency-king':'Король регулярности',
  'hundred-meals':'100 приёмов пищи',
  'goal-weight':'Целевой вес',
};
async function notifyRewards(env:Bindings,userId:string,rewards:RewardUnlock[],level?:number){
  if(!env.TELEGRAM_BOT_TOKEN||(!rewards.length&&!level))return;
  const recipient=await env.DB.prepare('SELECT u.telegram_id,s.language FROM users u JOIN settings s ON s.user_id=u.id WHERE u.id=?').bind(userId).first<{telegram_id:string;language:string}>();
  if(!recipient?.telegram_id)return;
  const russian=recipient.language==='ru';
  for(const reward of rewards){
    const title=russian?russianRewardTitles[reward.id]??reward.title:reward.title;
    const heading=reward.type==='mission'?(russian?'Задание выполнено':'Mission complete'):(russian?'Достижение открыто':'Achievement unlocked');
    await sendTelegram(env.TELEGRAM_BOT_TOKEN,recipient.telegram_id,`<b>${heading}</b>\n${title}\n+${reward.xp} XP`,env.APP_ORIGIN,russian);
  }
  const newLevel=level??rewards.filter((reward)=>reward.leveledUp).at(-1)?.level;
  if(newLevel)await sendTelegram(env.TELEGRAM_BOT_TOKEN,recipient.telegram_id,russian?`<b>Новый уровень: ${newLevel}</b>\nПродолжайте в том же ритме.`:`<b>Level ${newLevel} reached</b>\nKeep building your momentum.`,env.APP_ORIGIN,russian);
}
app.post('/telegram/webhook',async(context)=>{if(context.env.TELEGRAM_WEBHOOK_SECRET&&context.req.header('X-Telegram-Bot-Api-Secret-Token')!==context.env.TELEGRAM_WEBHOOK_SECRET) throw new HTTPException(401,{message:'Invalid webhook secret'}); const update=await context.req.json<TelegramUpdate>(); const message=update.message; if(!message?.from||!message.text||!context.env.TELEGRAM_BOT_TOKEN)return context.json({ok:true}); const user=await ensureUser(context.env.DB,message.from); const settingsRow=await context.env.DB.prepare('SELECT language FROM settings WHERE user_id=?').bind(user.id).first<{language:string}>(); const russian=settingsRow?.language==='ru'||message.from.language_code?.startsWith('ru')===true; const command=message.text.split(' ')[0].toLowerCase(); const copy=russian?(command==='/help'?'Используйте Nourish для учёта еды, воды и веса. Приложение отслеживает цели, серии, XP, задания и достижения.':command==='/start'?'<b>Добро пожаловать в Nourish.</b>\nВаш спокойный помощник для питания, воды, веса и полезных привычек.':'Откройте панель Nourish ниже.'):(command==='/help'?'Use Nourish to log meals, water, and weight. Your dashboard tracks daily targets, streaks, XP, missions, and achievements.':command==='/start'?'<b>Welcome to Nourish.</b>\nYour calm daily companion for nutrition, hydration, weight, and healthier habits.':'Open your Nourish dashboard below.'); await sendTelegram(context.env.TELEGRAM_BOT_TOKEN,message.chat.id,copy,context.env.APP_ORIGIN,russian); return context.json({ok:true});});

async function runReminders(env:Bindings){if(!env.TELEGRAM_BOT_TOKEN)return; const currentTime=new Date(); const rows=await env.DB.prepare(`SELECT u.telegram_id,u.first_name,s.language,s.daily_reminder,s.water_reminder,s.streak_warning,s.reminder_hour,s.timezone,coalesce(dp.water_ml,0) water_ml,u.water_target_ml,st.last_active_date FROM users u JOIN settings s ON s.user_id=u.id JOIN streaks st ON st.user_id=u.id LEFT JOIN daily_progress dp ON dp.user_id=u.id AND dp.date=? WHERE u.onboarding_complete=1`).bind(today()).all<Record<string,unknown>>(); for(const row of rows.results){let localHour:number;try{localHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:String(row.timezone||'UTC'),hour:'2-digit',hour12:false}).format(currentTime));}catch{localHour=currentTime.getUTCHours();}const russian=row.language==='ru';let text=''; if(Boolean(row.daily_reminder)&&Number(row.reminder_hour)===localHour)text=russian?`Доброе утро, ${row.first_name}. Ваш план Nourish на сегодня готов.`:`Good morning, ${row.first_name}. Your Nourish plan is ready.`; else if(Boolean(row.water_reminder)&&localHour===16&&Number(row.water_ml)<Number(row.water_target_ml)*0.6)text=russian?`Проверка воды: сегодня выпито ${row.water_ml} мл. Стакан воды поможет приблизиться к цели.`:`Hydration check: you are at ${row.water_ml} ml today. A glass of water keeps your goal moving.`; else if(Boolean(row.streak_warning)&&localHour===20&&row.last_active_date!==today())text=russian?'Ваша серия ещё ждёт. Запишите еду или стакан воды, чтобы сохранить её.':'Your daily streak is still waiting. Log one meal or glass of water to keep it alive.'; if(text)await sendTelegram(env.TELEGRAM_BOT_TOKEN,String(row.telegram_id),text,env.APP_ORIGIN,russian);}}

export default { fetch: app.fetch, scheduled: (_controller:ScheduledController,env:Bindings,context:ExecutionContext)=>context.waitUntil(runReminders(env)) };
