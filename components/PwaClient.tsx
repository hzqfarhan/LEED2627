'use client';

import { useEffect, useState } from 'react';
import { QUEUE_EVENT, flushQueue, readQueue } from '@/lib/offlineQueue';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Runs on every page: registers the service worker, sends score sheets that were
 * saved while offline, and shows one small status bar when there is something to say.
 */
export default function PwaClient() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [installer, setInstaller] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker registration failed', err));
    }

    const count = () => setWaiting(readQueue().length);
    const send = async () => {
      if (readQueue().length === 0) return;
      const result = await flushQueue();
      count();
      if (result.rejected.length > 0) {
        const first = result.rejected[0];
        setMessage(`Stall ${first.item.stallNumber}: a score saved offline was not accepted. ${first.error}`);
      } else if (result.otherJudge && result.sent.length === 0) {
        setMessage('Scores from another judge are saved on this phone. They will be sent when that judge signs in here.');
      } else if (result.needsSignIn) {
        setMessage('Sign in again to send the scores saved on this phone.');
      } else if (result.sent.length > 0) {
        setMessage(`${result.sent.length} ${result.sent.length === 1 ? 'score' : 'scores'} saved offline ${result.sent.length === 1 ? 'has' : 'have'} been sent.`);
        window.setTimeout(() => setMessage(null), 6000);
      }
    };

    const goOnline = () => {
      setOnline(true);
      void send();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void send();
    };
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstaller(e as InstallPromptEvent);
    };

    setOnline(navigator.onLine);
    count();
    void send();
    const timer = window.setInterval(() => void send(), 45_000);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener(QUEUE_EVENT, count);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener(QUEUE_EVENT, count);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  const install = async () => {
    if (!installer) return;
    await installer.prompt();
    await installer.userChoice;
    setInstaller(null);
  };

  const parts: string[] = [];
  if (!online) parts.push('You are offline. Scores are kept on this phone until the connection returns.');
  if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? 'score is' : 'scores are'} waiting to send.`);
  if (message) parts.push(message);

  if (parts.length === 0 && !installer) return null;

  return (
    <div className="status-bar" role="status">
      {parts.length > 0 && <p>{parts.join(' ')}</p>}
      {message && (
        <button type="button" className="status-btn" onClick={() => setMessage(null)}>
          Dismiss
        </button>
      )}
      {installer && parts.length === 0 && <p>Add LEED 26 to your home screen for faster judging.</p>}
      {installer && (
        <button type="button" className="status-btn" onClick={install}>
          Install app
        </button>
      )}
    </div>
  );
}
