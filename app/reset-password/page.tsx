'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

type PageState = 'checking' | 'invalid' | 'form' | 'saving' | 'done';

export default function ResetPasswordPage() {
  const supabase = createClient();

  const [state, setState] = useState<PageState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // PASSWORD_RECOVERY fires once Supabase's client has parsed whatever the
    // /verify redirect handed us — a #access_token hash (implicit flow) or a
    // ?code= query param (PKCE) — regardless of which shape it took.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setState('form');
    });

    init();

    return () => listener.subscription.unsubscribe();
  }, []);

  async function init() {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) { setState('form'); return; }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) { setState('form'); return; }

    // Give onAuthStateChange a moment to fire before giving up.
    setTimeout(async () => {
      const { data: { session: retrySession } } = await supabase.auth.getSession();
      setState((prev) => (prev === 'form' ? prev : retrySession ? 'form' : 'invalid'));
    }, 1500);
  }

  async function handleSubmit() {
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don\'t match.');
      return;
    }

    setState('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setState('form');
      return;
    }

    setState('done');
  }

  if (state === 'checking') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  if (state === 'invalid') {
    return (
      <Screen>
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Link expired</h1>
        <p className="text-gray-500 text-sm text-center">
          This password reset link is invalid or has expired. Go back to the app and request a new one.
        </p>
      </Screen>
    );
  }

  if (state === 'done') {
    return (
      <Screen>
        <p className="text-5xl mb-4">✓</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Password updated</h1>
        <p className="text-gray-500 text-sm text-center">
          You can now go back to the Stuber app and sign in with your new password.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <Logo />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Set a new password</h1>
      <p className="text-gray-500 text-sm mb-6 text-center">
        Choose a new password for your account.
      </p>
      <div className="w-full">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          New password
        </label>
        <input
          type="password"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-indigo-500"
          placeholder="At least 6 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />

        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">
          Confirm password
        </label>
        <input
          type="password"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-indigo-500"
          placeholder="Re-enter password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={state === 'saving'}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-4 text-base disabled:opacity-40 active:opacity-80 flex items-center justify-center gap-2"
        >
          {state === 'saving' ? <Spinner small /> : 'Update password'}
        </button>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto">
      {children}
    </main>
  );
}

function Logo() {
  return (
    <div className="mb-6 text-center">
      <span className="text-2xl font-extrabold text-indigo-600">stuber</span>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <div className={`${small ? 'w-5 h-5 border-2' : 'w-10 h-10 border-4 mb-8'} border-indigo-200 border-t-indigo-600 rounded-full animate-spin`} />
  );
}
