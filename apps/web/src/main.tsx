import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import { QueryClient,QueryClientProvider } from '@tanstack/react-query'; import App from './App'; import './i18n'; import './styles.css';
const webApp=window.Telegram?.WebApp; webApp?.ready(); webApp?.expand();
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1},mutations:{retry:0}}});
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><App/></QueryClientProvider></StrictMode>);
