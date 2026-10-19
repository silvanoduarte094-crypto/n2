import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { ACCENTS } from './config';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { RightPanel } from './components/RightPanel';
import { SettingsModal } from './components/SettingsModal';
import { CommandPalette } from './components/CommandPalette';
import { ToastHost } from './components/Toast';
import { Onboarding } from './components/Onboarding';
import { Logo } from './components/Logo';
import { cn } from './lib/utils';

export default function App() {
  const init = useStore((state) => state.init);
  const hydrated = useStore((state) => state.hydrated);
  const settings = useStore((state) => state.settings);
  const newSession = useStore((state) => state.newSession);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const setCommandOpen = useStore((state) => state.setCommandOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const resolved =
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : settings.theme;
      root.dataset.theme = resolved;
    };
    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-hsl', ACCENTS[settings.accent]?.hsl || ACCENTS.violet.hsl);
    root.dataset.font = settings.fontSize;
    root.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.accent, settings.fontSize, settings.reduceMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(!useStore.getState().commandOpen);
      } else if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newSession();
      } else if (mod && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (event.key === 'Escape') {
        setCommandOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newSession, setCommandOpen, setSettingsOpen, setSidebarOpen]);

  if (!hydrated) {
    return (
      <div className="splash">
        <div className="splash-glow" />
        <Logo size={64} />
        <strong>N2</strong>
        <span>acordando o núcleo…</span>
      </div>
    );
  }

  if (!settings.onboardingComplete) {
    return (
      <>
        <Onboarding />
        <ToastHost />
      </>
    );
  }

  return (
    <div className={cn('app', settings.reduceMotion && 'reduce-motion')}>
      <Sidebar />
      <main className="workspace">
        <TopBar />
        <ChatView />
        <Composer />
      </main>
      <RightPanel />
      <SettingsModal />
      <CommandPalette />
      <ToastHost />
    </div>
  );
}
