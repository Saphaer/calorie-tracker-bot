import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardData, Food } from '@nourish/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Clock3, Heart, Plus, Search, Sparkles, Utensils } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Pill, SectionTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { api } from '@/lib/api';

type FoodTab = 'search' | 'favorites' | 'recent' | 'meals';

function FoodRow({ food, onAdd }: { food: Food; onAdd: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.toggleFavorite(food.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['foods'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return <motion.div layout className="flex items-center border-b border-[#edf1f5] last:border-0 dark:border-[#293541]">
    <button onClick={onAdd} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue/10 text-blue"><Utensils size={19} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold">{t(`foods.${food.id}`, { defaultValue: food.name })}</span><span className="mt-0.5 block truncate text-[12px] subtle">{food.brand ? `${food.brand} · ` : ''}{food.servingLabel}</span></span><span className="text-right"><b className="block text-[14px]">{Math.round(food.calories)}</b><span className="text-[11px] subtle">{t('common.kcal')}</span></span><Plus size={18} className="text-blue" /></button>
    <button disabled={toggle.isPending} onClick={() => toggle.mutate()} aria-label={food.isFavorite ? t('food.removeFavorite') : t('food.addFavorite')} className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-coral"><Heart size={17} fill={food.isFavorite ? 'currentColor' : 'none'} /></button>
  </motion.div>;
}

export function FoodPage({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FoodTab>('search');
  const [query, setQuery] = useState('');
  const setAddMealOpen = useAppStore((state) => state.setAddMealOpen);
  const { data: allFoods = [] } = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.foods('') });
  const source = tab === 'favorites' ? data.favoriteFoods : data.recentFoods;
  const foods = useMemo(() => source.filter((food) => food.name.toLowerCase().includes(query.toLowerCase())), [source, query]);
  const tabItems = [
    { id: 'search', labelKey: 'food.search', icon: Search },
    { id: 'favorites', labelKey: 'food.favorites', icon: Heart },
    { id: 'recent', labelKey: 'food.recent', icon: Clock3 },
    { id: 'meals', labelKey: 'food.saved', icon: Bookmark },
  ] as const;

  return <div className="page">
    <PageHeader eyebrow={t('food.eyebrow')} title={t('food.title')} action={<button onClick={() => setAddMealOpen(true)} aria-label={t('food.customFood')} title={t('food.customFood')} className="flex h-11 w-11 items-center justify-center rounded-full bg-blue text-white shadow-float"><Plus size={21} /></button>} />
    <div className="relative mb-4"><Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input pl-11 pr-4" placeholder={t('food.searchPlaceholder')} aria-label={t('food.search')} /></div>
    <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">{tabItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={cn('flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors', tab === item.id ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white subtle shadow-card dark:bg-[#1a222c]')}><Icon size={16} />{t(item.labelKey)}</button>; })}</div>
    <div className="mb-6 grid grid-cols-2 gap-3"><button onClick={() => setAddMealOpen(true)} className="card p-4 text-left"><span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-coral/10 text-coral"><Plus size={18} /></span><p className="text-[14px] font-bold">{t('food.quickCalories')}</p><p className="mt-1 text-[12px] leading-4 subtle">{t('food.quickCaloriesCopy')}</p></button><button onClick={() => setAddMealOpen(true)} className="card p-4 text-left"><span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-mint/10 text-mint"><Sparkles size={18} /></span><p className="text-[14px] font-bold">{t('food.customFood')}</p><p className="mt-1 text-[12px] leading-4 subtle">{t('food.customFoodCopy')}</p></button></div>
    <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{tab === 'meals' ? <SavedMeals foods={allFoods.filter((food) => food.brand === 'Custom')} onAdd={() => setAddMealOpen(true)} /> : <><SectionTitle title={tab === 'favorites' ? t('food.yourFavorites') : tab === 'recent' ? t('food.recentlyLogged') : t('food.suggested')} action={<Pill tone="gray">{foods.length} {t('common.items')}</Pill>} /><div className="card overflow-hidden">{foods.length ? foods.map((food) => <FoodRow key={food.id} food={food} onAdd={() => setAddMealOpen(true)} />) : <div className="px-6 py-10 text-center"><Heart className="mx-auto mb-3 text-[#b8c2cd]" size={28} /><p className="font-bold">{t('food.nothingHere')}</p><p className="mt-1 text-[13px] subtle">{t('food.nothingHereCopy')}</p></div>}</div></>}</motion.div></AnimatePresence>
  </div>;
}

function SavedMeals({ foods, onAdd }: { foods: Food[]; onAdd: () => void }) {
  const { t } = useTranslation();
  return <><SectionTitle title={t('food.savedMeals')} action={<Pill tone="gray">{foods.length} {t('common.meals')}</Pill>} />{foods.length ? <div className="card overflow-hidden">{foods.map((food) => <FoodRow key={food.id} food={food} onAdd={onAdd} />)}</div> : <div className="card px-6 py-10 text-center"><Bookmark className="mx-auto mb-3 text-[#b8c2cd]" size={28} /><p className="font-bold">{t('food.noSaved')}</p><p className="mx-auto mt-1 max-w-[260px] text-[13px] subtle">{t('food.noSavedCopy')}</p><button onClick={onAdd} className="mt-4 rounded-lg bg-blue px-4 py-2.5 text-[12px] font-bold text-white">{t('food.createSaved')}</button></div>}</>;
}
