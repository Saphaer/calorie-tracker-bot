export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface UserProfile {
  id: string;
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  avatarUrl?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  activityLevel?: ActivityLevel;
  goal?: Goal;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTargetMl: number;
  onboardingComplete: boolean;
  xp: number;
  level: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  servingLabel: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isFavorite?: boolean;
}

export interface MealItem extends Food { multiplier: number; mealType: MealType; loggedAt: string; }
export interface DailyProgress { date: string; calories: number; protein: number; carbs: number; fat: number; waterMl: number; }
export interface WeightLog { id: string; weightKg: number; loggedAt: string; }
export interface Mission { id: string; title: string; description: string; icon: string; xpReward: number; progress: number; target: number; completed: boolean; period: 'daily'|'weekly'; }
export interface Achievement { id: string; title: string; description: string; icon: string; xpReward: number; unlockedAt?: string; }
export interface DashboardData { profile: UserProfile; progress: DailyProgress; meals: MealItem[]; missions: Mission[]; achievements: Achievement[]; recentFoods: Food[]; favoriteFoods: Food[]; }

export const LEVELS = [0, 120, 300, 600, 1000, 1500, 2200, 3100, 4200, 5600, 7300];
export const levelForXp = (xp: number) => {
  let level = 1;
  for (let index = 0; index < LEVELS.length; index += 1) if (xp >= LEVELS[index]) level = index + 1;
  return level;
};
export const xpToNextLevel = (xp: number) => {
  const level = levelForXp(xp);
  return LEVELS[level] ?? LEVELS[LEVELS.length - 1] + 2200;
};

export function calculateTargets(input: { age: number; gender: 'male'|'female'|'other'; heightCm: number; weightKg: number; activity: ActivityLevel; goal: Goal }) {
  const base = input.gender === 'male' ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + 5 : 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age - 161;
  const multipliers: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9 };
  const adjustment = input.goal === 'lose' ? -350 : input.goal === 'gain' ? 300 : 0;
  const calories = Math.max(1200, Math.round(base * multipliers[input.activity] + adjustment));
  const protein = Math.round(input.weightKg * (input.goal === 'gain' ? 1.8 : 1.6));
  const fat = Math.round((calories * 0.27) / 9);
  const carbs = Math.max(60, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat, waterMl: 2200 };
}
