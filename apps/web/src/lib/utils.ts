import { clsx, type ClassValue } from 'clsx'; import { twMerge } from 'tailwind-merge';
export const cn=(...inputs:ClassValue[])=>twMerge(clsx(inputs));
export const pct=(value:number,target:number)=>Math.min(100,Math.round((value/Math.max(1,target))*100));
export const compact=(value:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(value);
export const haptic=(type:'light'|'medium'|'heavy'='light')=>window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(type);
