'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

type PageState =
  | 'loading'
  | 'not-found'
  | 'closed'
  | 'full'
  | 'auth-email'
  | 'join'
  | 'joining'
  | 'waiting'
  | 'confirmed'
  | 'cancelled';

type Ride = {
  id: string;
  destination: string;
  max_passengers: number;
  status: string;
  fare: number | null;
  host_id: string;
  passenger_count: number;
};

export default function JoinPage({ params }: { params: { code: string } }) {
  const supabase = createClient();
  const joinCode = params.code.toUpperCase();

  const [state, setState] = useState<PageState>('loading');
  const [ride, setRide] = useState<Ride | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [perPerson, setPerPerson] = useState<number | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();

    const rideData = await fetchRide();
    if (!rideData) return;

    if (session) {
      const { data: existing } = await supabase
        .from('passengers')
        .select('id, status')
        .eq('stuber_id', rideData.id)
        .eq('user_id', session.user.id)
        .single();

      if (existing) {
        startPolling(rideData.id);
        setState('waiting');
        return;
      }

      setState('join');
    } else {
      setState('auth-email');
    }
  }

  async function fetchRide(): Promise<Ride | null> {
    const { data, error } = await supabase
      .from('stubers')
      .select('id, destination, max_passengers, status, fare, host_id, passengers(id)')
      .eq('join_code', joinCode)
      .single();

    if (error || !data) {
      setState('not-found');
      return null;
    }

    if (data.status === 'CANCELLED') { setState('cancelled'); return null; }
    if (data.status !== 'OPEN') { setState('closed'); return null; }

    const passengerCount = Array.isArray(data.passengers) ? data.passengers.length : 0;

    if (passengerCount >= data.max_passengers) {
      setState('full');
      return null;
    }

    const rideData = { ...data, passenger_count: passengerCount };
    setRide(rideData);
    return rideData;
  }

  async function handleVerifyEmail() {
    setError('');
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.match(/^[^@]+@[^@]+\.ac\.uk$/)) {
      setError('Please use a valid .ac.uk university email.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      setError('Could not start session — please refresh and try again.');
      return;
    }

    setState('join');
  }

  async function handleJoin() {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Please enter your name.'); return; }

    setState('joining');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !ride) { setError('Session expired. Please refresh.'); setState('join'); return; }

    await supabase.from('users').upsert(
      { id: session.user.id, email: email.trim().toLowerCase(), university: '' },
      { onConflict: 'id' }
    );

    const { error } = await supabase.from('passengers').insert({
      stuber_id: ride.id,
      user_id: session.user.id,
      name: trimmedName,
      email: email.trim().toLowerCase(),
      university: '',
      status: 'AUTHORISED',
    });

    if (error) { setError(error.message); setState('join'); return; }

    startPolling(ride.id);
    setState('waiting');
  }

  function startPolling(stuberId: string) {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('stubers')
        .select('status, fare, max_passengers, passengers(id)')
        .eq('id', stuberId)
        .single();

      if (!data) return;

      if (data.status === 'ACTIVE') {
        clearInterval(interval);
        const count = Array.isArray(data.passengers) ? data.passengers.length : 1;
        if (data.fare) setPerPerson(data.fare / (count + 1) + 0.5);
        setState('confirmed');
      } else if (data.status === 'CANCELLED') {
        clearInterval(interval);
        setState('cancelled');
      }
    }, 3000);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (state === 'loading') {
    return <Screen><Spinner /></Screen>;
  }

  if (state === 'not-found') {
    return (
      <Screen>
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ride not found</h1>
        <p className="text-gray-500">Double-check the QR code or join link and try again.</p>
      </Screen>
    );
  }

  if (state === 'closed') {
    return (
      <Screen>
        <p className="text-4xl mb-4">🔒</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ride closed</h1>
        <p className="text-gray-500">The host has already confirmed the fare for this ride.</p>
      </Screen>
    );
  }

  if (state === 'full') {
    return (
      <Screen>
        <p className="text-4xl mb-4">🚗</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ride is full</h1>
        <p className="text-gray-500">Sorry, all spots have been taken.</p>
      </Screen>
    );
  }

  if (state === 'cancelled') {
    return (
      <Screen>
        <p className="text-4xl mb-4">✕</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ride cancelled</h1>
        <p className="text-gray-500">The host cancelled this ride. You have not been charged.</p>
      </Screen>
    );
  }

  if (state === 'confirmed') {
    return (
      <Screen>
        <p className="text-5xl mb-4">✓</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">You're all set!</h1>
        <p className="text-indigo-600 font-semibold text-lg mb-6">{ride?.destination}</p>
        {perPerson != null && (
          <div className="bg-green-50 rounded-2xl px-10 py-6 text-center mb-6">
            <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Charged to your card</p>
            <p className="text-4xl font-extrabold text-green-700">£{perPerson.toFixed(2)}</p>
          </div>
        )}
        <p className="text-gray-500 text-sm text-center">Your fare has been confirmed. Enjoy the ride!</p>
      </Screen>
    );
  }

  if (state === 'waiting') {
    return (
      <Screen>
        <Spinner />
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Waiting for host</h1>
        <p className="text-indigo-600 font-semibold text-lg mb-4 text-center">{ride?.destination}</p>
        <p className="text-gray-500 text-sm text-center leading-relaxed">
          Your host is getting the Uber price. Once they confirm, your share will be charged automatically.
        </p>
        <div className="mt-6 flex items-center gap-2 bg-green-50 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-sm font-semibold text-green-700">Ride is open</span>
        </div>
      </Screen>
    );
  }

  if (state === 'auth-email') {
    return (
      <Screen>
        <Logo />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Join the ride</h1>
        <p className="text-gray-500 text-sm mb-6 text-center">
          Enter your university email to continue
        </p>
        {ride && <RideChip ride={ride} />}
        <div className="w-full mt-6">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            University email
          </label>
          <input
            type="email"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-indigo-500"
            placeholder="you@university.ac.uk"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVerifyEmail()}
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            onClick={handleVerifyEmail}
            className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-4 text-base active:opacity-80"
          >
            Continue
          </button>
        </div>
      </Screen>
    );
  }

  // join + joining states
  return (
    <Screen>
      <Logo />
      {ride && <RideChip ride={ride} />}
      <div className="w-full mt-6">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Your name
        </label>
        <input
          type="text"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-indigo-500"
          placeholder="e.g. Harry"
          value={name}
          onChange={e => setName(e.target.value)}
          autoCapitalize="words"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-4 bg-amber-50 rounded-xl p-4">
          <p className="text-amber-800 text-sm leading-relaxed">
            By joining, you agree to pay your share once the host confirms the Uber price. Payment will be taken automatically.
          </p>
        </div>

        <button
          onClick={handleJoin}
          disabled={state === 'joining' || !name.trim()}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-4 text-base disabled:opacity-40 active:opacity-80 flex items-center justify-center gap-2"
        >
          {state === 'joining' ? <Spinner small /> : 'Join Ride'}
        </button>
      </div>
    </Screen>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

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

function RideChip({ ride }: { ride: Ride }) {
  const spotsLeft = ride.max_passengers - ride.passenger_count;
  return (
    <div className="w-full bg-indigo-50 rounded-2xl p-5 text-center">
      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Destination</p>
      <p className="text-xl font-bold text-gray-900 mb-3">{ride.destination}</p>
      <p className="text-sm text-indigo-500 font-medium">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</p>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <div className={`${small ? 'w-5 h-5 border-2' : 'w-10 h-10 border-4 mb-8'} border-indigo-200 border-t-indigo-600 rounded-full animate-spin`} />
  );
}
