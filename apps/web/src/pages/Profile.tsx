import { useState } from 'react';
import type { DashboardData } from '@nourish/shared';
import { useMutation } from '@tanstack/react-query';
import { Bell, ChevronRight, CircleUserRound, Download, Droplets, Flame, Globe2, Moon, Ruler, Scale, Shield, Sun, Target, Trash2, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { PageHeader, Pill, ProgressBar, SectionTitle, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

export function ProfilePage({ data }: { data: DashboardData }) {
  const { t, i18n } = useTranslation();
  const profile = data.profile;
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const showToast = useAppStore((state) => state.showToast);
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [reminders, setReminders] = useState({ daily: true, water: true, calorie: true, streak: true });
  const language = i18n.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en';

  const exportMutation = useMutation({
    mutationFn: api.exportData,
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `nourish-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast(t('profile.exportDownloaded'));
    },
    onError: () => showToast(t('profile.connectExport')),
  });
  const deleteMutation = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => {
      showToast(t('profile.dataDeleted'));
      setTimeout(() => window.Telegram?.WebApp?.close(), 900);
    },
    onError: () => showToast(t('profile.connectDelete')),
  });

  const updateReminder = (key: keyof typeof reminders, value: boolean) => {
    setReminders((current) => ({ ...current, [key]: value }));
    void api.updateSettings({ [`${key}Reminder`]: value }).catch(() => undefined);
  };
  const changeLanguage = (nextLanguage: 'en' | 'ru') => {
    localStorage.setItem('language', nextLanguage);
    void i18n.changeLanguage(nextLanguage);
    void api.updateSettings({ language: nextLanguage }).catch(() => undefined);
  };
  const changeTheme = (nextTheme: 'light' | 'dark' | 'system') => {
    setTheme(nextTheme);
    void api.updateSettings({ theme: nextTheme }).catch(() => undefined);
  };

  return <div className="page">
    <PageHeader eyebrow={t('profile.eyebrow')} title={t('profile.title')} action={<button aria-label={t('profile.title')} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card dark:bg-[#1a222c]"><CircleUserRound size={21} /></button>} />
    <section className="card mb-4 p-5"><div className="flex items-center gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue font-display text-[24px] font-extrabold text-white">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.firstName.slice(0, 1)}</div><div className="min-w-0 flex-1"><h2 className="truncate font-display text-[20px] font-extrabold">{profile.firstName}{profile.lastName ? ` ${profile.lastName}` : ''}</h2><p className="mt-0.5 truncate text-[12px] subtle">{profile.username ? `@${profile.username}` : t('profile.telegramMember')}</p><div className="mt-2 flex gap-2"><Pill tone="blue">{t('dashboard.level', { level: profile.level })}</Pill><Pill tone="yellow"><Flame size={12} />{t('dashboard.streak', { count: profile.currentStreak })}</Pill></div></div></div><div className="mt-5"><div className="mb-2 flex justify-between text-[11px] font-semibold"><span className="subtle">{t('profile.levelProgress')}</span><span>{profile.xp} XP</span></div><ProgressBar value={profile.xp % 300} target={300} /></div></section>
    <div className="mb-7 grid grid-cols-3 gap-3"><ProfileStat icon={<Scale />} label={t('profile.weight')} value={`${profile.currentWeightKg} kg`} /><ProfileStat icon={<Target />} label={t('profile.goal')} value={profile.goal === 'lose' ? t('profile.lose') : profile.goal === 'gain' ? t('profile.gain') : t('profile.maintain')} /><ProfileStat icon={<Trophy />} label={t('profile.badges')} value={String(data.achievements.filter((item) => item.unlockedAt).length)} /></div>
    <SectionTitle title={t('profile.appearance')} />
    <section className="card mb-6 p-4"><p className="mb-3 text-[12px] font-semibold subtle">{t('profile.theme')}</p><div className="segmented grid-cols-3">{([{ id: 'light', label: t('profile.light'), icon: Sun }, { id: 'dark', label: t('profile.dark'), icon: Moon }, { id: 'system', label: t('common.system'), icon: Shield }] as const).map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => changeTheme(item.id)} className={cn('flex h-10 items-center justify-center gap-1.5 rounded-md text-[12px] font-bold', theme === item.id ? 'bg-white text-blue shadow-sm dark:bg-[#313d4a]' : 'subtle')}><Icon size={15} />{item.label}</button>; })}</div></section>
    <SectionTitle title={t('profile.preferences')} />
    <section className="card mb-6 overflow-hidden">
      <SettingRow icon={<Ruler />} title={t('profile.units')} copy={t('profile.unitsCopy')}><div className="flex rounded-lg bg-[#edf1f5] p-1 dark:bg-[#26313d]">{(['metric', 'imperial'] as const).map((item) => <button key={item} onClick={() => { setUnits(item); void api.updateSettings({ units: item }).catch(() => undefined); }} className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-bold', units === item ? 'bg-white shadow-sm dark:bg-[#354250]' : 'subtle')}>{t(`profile.${item}`)}</button>)}</div></SettingRow>
      <SettingRow icon={<Globe2 />} title={t('profile.language')} copy={t('profile.languageCopy')}><div className="flex rounded-lg bg-[#edf1f5] p-1 dark:bg-[#26313d]"><button onClick={() => changeLanguage('en')} className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-bold', language === 'en' ? 'bg-white shadow-sm dark:bg-[#354250]' : 'subtle')}>EN</button><button onClick={() => changeLanguage('ru')} className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-bold', language === 'ru' ? 'bg-white shadow-sm dark:bg-[#354250]' : 'subtle')}>RU</button></div></SettingRow>
    </section>
    <SectionTitle title={t('profile.reminders')} />
    <section className="card mb-6 overflow-hidden"><SettingRow icon={<Bell />} title={t('profile.dailyCheckin')} copy={t('profile.dailyCheckinCopy')}><Toggle label={t('profile.dailyCheckin')} checked={reminders.daily} onChange={(value) => updateReminder('daily', value)} /></SettingRow><SettingRow icon={<Droplets />} title={t('profile.waterReminder')} copy={t('profile.waterReminderCopy')}><Toggle label={t('profile.waterReminder')} checked={reminders.water} onChange={(value) => updateReminder('water', value)} /></SettingRow><SettingRow icon={<Target />} title={t('profile.calorieReminder')} copy={t('profile.calorieReminderCopy')}><Toggle label={t('profile.calorieReminder')} checked={reminders.calorie} onChange={(value) => updateReminder('calorie', value)} /></SettingRow><SettingRow icon={<Flame />} title={t('profile.streakWarning')} copy={t('profile.streakWarningCopy')}><Toggle label={t('profile.streakWarning')} checked={reminders.streak} onChange={(value) => updateReminder('streak', value)} /></SettingRow></section>
    <SectionTitle title={t('profile.yourData')} />
    <section className="card mb-6 overflow-hidden"><button onClick={() => exportMutation.mutate()} className="flex w-full items-center gap-3 border-b border-[#edf1f5] p-4 text-left dark:border-[#293541]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue/10 text-blue"><Download size={18} /></span><span className="flex-1"><b className="block text-[13px]">{t('profile.export')}</b><span className="text-[11px] subtle">{t('profile.exportCopy')}</span></span><ChevronRight size={17} className="subtle" /></button><button onClick={() => { if (confirm(t('profile.deleteConfirm'))) deleteMutation.mutate(); }} className="flex w-full items-center gap-3 p-4 text-left text-[#d74747]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffecec] dark:bg-[#3b2529]"><Trash2 size={18} /></span><span className="flex-1"><b className="block text-[13px]">{t('profile.delete')}</b><span className="text-[11px] text-[#d97a7a]">{t('profile.deleteCopy')}</span></span><ChevronRight size={17} /></button></section>
    <p className="pb-2 text-center text-[11px] subtle">{t('profile.footer')}</p>
  </div>;
}

function SettingRow({ icon, title, copy, children }: { icon: React.ReactNode; title: string; copy: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-b border-[#edf1f5] p-4 last:border-0 dark:border-[#293541]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef3f7] subtle [&>svg]:h-[17px] [&>svg]:w-[17px] dark:bg-[#26313d]">{icon}</span><span className="min-w-0 flex-1"><b className="block text-[13px]">{title}</b><span className="block truncate text-[11px] subtle">{copy}</span></span>{children}</div>;
}

function ProfileStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card min-w-0 p-3 text-center"><span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue/10 text-blue [&>svg]:h-[16px] [&>svg]:w-[16px]">{icon}</span><p className="truncate text-[12px] font-bold">{value}</p><p className="mt-0.5 text-[10px] subtle">{label}</p></div>;
}
