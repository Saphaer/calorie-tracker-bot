import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Apple, BarChart3, CircleUserRound, Home, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAppStore, type Tab } from '@/store/app';
import { cn, haptic } from '@/lib/utils';
import { DashboardPage } from '@/pages/Dashboard';
import { FoodPage } from '@/pages/Food';
import { ProgressPage } from '@/pages/Progress';
import { RewardsPage } from '@/pages/Rewards';
import { ProfilePage } from '@/pages/Profile';
import { Onboarding } from '@/pages/Onboarding';
import { AddMealSheet, WaterSheet } from '@/components/Overlays';

const tabs:{id:Tab;label:string;icon:typeof Home}[]=[{id:'home',label:'Today',icon:Home},{id:'log',label:'Food',icon:Apple},{id:'progress',label:'Progress',icon:BarChart3},{id:'rewards',label:'Rewards',icon:Sparkles},{id:'profile',label:'Profile',icon:CircleUserRound}];
export default function App(){const {data,isLoading}=useQuery({queryKey:['dashboard'],queryFn:api.dashboard});const tab=useAppStore(state=>state.tab);const setTab=useAppStore(state=>state.setTab);const setAddMealOpen=useAppStore(state=>state.setAddMealOpen);const toast=useAppStore(state=>state.toast);const theme=useAppStore(state=>state.theme);
useEffect(()=>{const prefersDark=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',theme==='dark'||(theme==='system'&&(window.Telegram?.WebApp?.colorScheme==='dark'||prefersDark)));},[theme]);
useEffect(()=>{void api.updateSettings({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}).catch(()=>undefined)},[]);
if(isLoading||!data)return <div className="app-shell page"><div className="skeleton mb-7 h-8 w-44 rounded-lg"/><div className="skeleton mb-4 h-64 rounded-card"/><div className="grid grid-cols-2 gap-4"><div className="skeleton h-32 rounded-card"/><div className="skeleton h-32 rounded-card"/></div></div>;
if(!data.profile.onboardingComplete)return <Onboarding/>;
const pages:Record<Tab,ReactNode>={home:<DashboardPage data={data}/>,log:<FoodPage data={data}/>,progress:<ProgressPage data={data}/>,rewards:<RewardsPage data={data}/>,profile:<ProfilePage data={data}/>};
return <main className="app-shell"><AnimatePresence mode="wait"><motion.div key={tab} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-8}} transition={{duration:.2}}>{pages[tab]}</motion.div></AnimatePresence>
<button title="Add meal" aria-label="Add meal" onClick={()=>{haptic('medium');setAddMealOpen(true)}} className="fixed bottom-[84px] left-1/2 z-50 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-blue text-white shadow-float"><Plus size={26} strokeWidth={2.7}/></button>
<nav className="bottom-nav"><div className="grid grid-cols-5 gap-1">{tabs.map((item,index)=>{const Icon=item.icon;const active=item.id===tab;return <button key={item.id} onClick={()=>{haptic();setTab(item.id)}} className={cn('flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition-colors',index===2?'mr-7':'',index===3?'ml-7':'',active?'text-blue':'text-[#8b96a3]')}><Icon size={21} strokeWidth={active?2.7:2}/><span>{item.label}</span></button>})}</div></nav>
<AddMealSheet/><WaterSheet/><AnimatePresence>{toast&&<motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}} className="fixed left-1/2 top-[max(20px,env(safe-area-inset-top))] z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-xl dark:bg-white dark:text-ink">{toast}</motion.div>}</AnimatePresence></main>}
