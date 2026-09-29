import { useCallback, useEffect, useState } from 'react';

import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * Which Ollama model answers on the Mac (maestro local_models.py, api/models.py).
 * Trying a model used to mean editing the Mac's .env and restarting uvicorn; now the
 * lane menu picks one and the next turn runs on it. Render has no Ollama, so this is
 * only asked of the local lane. A pick answers the owner only: demo logins keep the
 * Mac's .env models whatever is picked here (maestro sets that per request).
 */

export type ModelRole = 'chat' | 'vision' | 'companion';

export type LocalModel = {
  name: string;
  size_gb: number;
  /** "4.7B" */
  params: string;
  /** Ollama's own list: completion, vision, tools, thinking, … */
  caps: string[];
  /** Big enough to swap on this Mac: allowed, but slow. */
  heavy: boolean;
  /** A refusal-stripped build. maestro runs any pick for the owner only, this included. */
  uncensored: boolean;
};

export type RoleView = {
  label: string;
  /** The capability a model must list to take this role. */
  needs: string;
  default: string;
  current: string;
  /** False while the role runs on the .env default. */
  chosen: boolean;
};

export type ModelsView = {
  roles: Record<ModelRole, RoleView>;
  /** The cloud persona that speaks while chat is on its default, if the Mac has one. */
  default_voice: string | null;
  models: LocalModel[];
};

export const ROLE_ORDER: ModelRole[] = ['chat', 'vision', 'companion'];

export const fits = (model: LocalModel, role: RoleView) => model.caps.includes(role.needs);

async function read(res: Response): Promise<ModelsView> {
  if (res.status === 404) throw new Error('This Mac has no model choice yet. Restart its maestro.');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `The Mac refused (${res.status}).`);
  }
  return (await res.json()) as ModelsView;
}

export async function fetchModels(lane: Lane): Promise<ModelsView> {
  return read(await authedFetch(lane, '/models'));
}

/** `model` null puts the role back on the Mac's .env default. */
export async function chooseModel(lane: Lane, role: ModelRole, model: string | null): Promise<ModelsView> {
  return read(
    await authedFetch(lane, `/models/${role}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
  );
}

/** The Mac's models while `active` (the menu is open on the local lane). */
export function useLocalModels(lane: Lane, active: boolean) {
  const [view, setView] = useState<ModelsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ModelRole | null>(null);

  useEffect(() => {
    if (!active) return;
    let live = true;
    fetchModels(lane)
      .then((v) => {
        if (!live) return;
        setView(v);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane, active]);

  const choose = useCallback(
    async (role: ModelRole, model: string | null) => {
      setBusy(role);
      setError(null);
      try {
        setView(await chooseModel(lane, role, model));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [lane]
  );

  return { view, error, busy, choose };
}
