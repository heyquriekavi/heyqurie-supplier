/** Who is signed in, which language, and where a fresh app open should land. */
import React, { createContext, useContext, useEffect, useState } from 'react';

import { useAppState } from './appState';
import { clearTokens, getTokens, KEYS, request, setTokens } from './http';
import { getItem, setItem } from './storage';
import { Lang, LANGUAGES, Strings, strings } from './strings';

export type Shop = {
  id: string;
  name: string;
  type: string;
  gstin: string | null;
  address: string | null;
  city: string | null;
};
export type User = {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  shop_id: string | null;
  language: Lang;
  shop?: Shop | null;
};

type Session = {
  ready: boolean;
  user: User | null;
  lang: Lang;
  t: Strings;
  setLang: (l: Lang) => void;
  signIn: (tokens: { access_token: string; refresh_token: string }, user: User) => Promise<void>;
  setUser: (u: User | null) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>('en');   // v1 is English only; Hindi and Tamil are written and waiting in strings.ts

  useEffect(() => {
    (async () => {
      try {
        const saved = (await getItem(KEYS.lang)) as Lang | null;
        if (saved && LANGUAGES.some((l) => l.code === saved && l.ready)) {
          setLangState(saved);
          useAppState.getState().setLanguage(saved);
        }
        const { access, refresh } = await getTokens();
        if (access || refresh) setUser(await request<User>('/api/v1/auth/me'));
      } catch {
        await clearTokens();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const value: Session = {
    ready,
    user,
    lang,
    t: strings(lang),
    setLang: (l) => {
      setLangState(l);
      useAppState.getState().setLanguage(l); // her screens read language from appState
      setItem(KEYS.lang, l);
    },
    signIn: async (tokens, u) => {
      await setTokens(tokens);
      setUser(u);
    },
    setUser,
    signOut: async () => {
      const { refresh } = await getTokens();
      if (refresh) request('/api/v1/auth/logout', { body: { refresh_token: refresh }, auth: false }).catch(() => {});
      await clearTokens();
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
