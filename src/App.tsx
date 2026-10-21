import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { ACCENTS } from './config';
import { isRoutineDue } from './lib/cron';
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
  const routineAttempts = useRef(new Map<string, number>());

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!settings.onboardingComplete) return;
    const tick = () => {
      const state = useStore.getState();
      if (state.streaming) return;
      const now = Date.now();
      const routine = state.settings.routines.find((item) => {
        if (!isRoutineDue(item, now)) return false;
        const lastAttempt = routineAttempts.current.get(item.id) || 0;
        return now - lastAttempt > 5 * 60_000;
      });
      if (!routine) return;
      routineAttempts.current.set(routine.id, now);
      void state.runRoutine(routine.id);
    };
    const interval = window.setInterval(tick, 30_000);
    const initial = window.setTimeout(tick, 8_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initial);
    };
  }, [settings.onboardingComplete]);

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
