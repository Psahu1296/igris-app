import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchManifest, type AssetSpec } from '@/lib/assets/manifest';
import { download, inspect } from '@/lib/assets/store';
import { extract, modelState, removeModel } from '@/lib/voice/model';

/** Where an asset is in the download → unpack → usable progression. */
export type AssetPhase = 'missing' | 'downloading' | 'extracting' | 'ready' | 'damaged';

export type AssetRow = {
  spec: AssetSpec;
  phase: AssetPhase;
  /** 0–1 during downloading or extracting, null otherwise. */
  progress: number | null;
  error: string | null;
};

/** An archive is only usable once unpacked, so readiness is the directory, not the file. */
function phaseOf(spec: AssetSpec): AssetPhase {
  if (spec.kind === 'archive') {
    const state = modelState(spec);
    return state === 'ready' ? 'ready' : state === 'archived' ? 'extracting' : 'missing';
  }
  const state = inspect(spec);
  return state === 'ready' ? 'ready' : state === 'damaged' ? 'damaged' : 'missing';
}

export function useAssets() {
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cancels = useRef(new Map<string, () => void>());

  // No setState before the first await: doing so runs synchronously inside the
  // effect below, which React now treats as a render-phase update.
  const load = useCallback(async () => {
    try {
      const manifest = await fetchManifest();
      setRows(
        manifest.assets.map((spec) => ({
          spec,
          phase: phaseOf(spec),
          progress: null,
          error: null,
        }))
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read the asset list.');
    }
  }, []);

  useEffect(() => {
    // Fetching from an external system on mount is a sanctioned effect, but the
    // lint rule fires on any call that transitively sets state, regardless of the
    // await in between. All state here lands in a promise callback, not the
    // effect body, so there is no cascading render to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const running = cancels.current;
    // Abandoning the screen mid-transfer should not leave a 67MB download running
    // against a progress callback whose component is gone.
    return () => running.forEach((cancel) => cancel());
  }, [load]);

  const patch = useCallback((id: string, change: Partial<AssetRow>) => {
    setRows((prev) => prev?.map((r) => (r.spec.id === id ? { ...r, ...change } : r)) ?? prev);
  }, []);

  const start = useCallback(
    async (spec: AssetSpec) => {
      patch(spec.id, { phase: 'downloading', progress: 0, error: null });

      const handle = download(spec, (written, total) =>
        patch(spec.id, { progress: total > 0 ? written / total : 0 })
      );
      cancels.current.set(spec.id, handle.cancel);

      try {
        await handle.promise;

        if (spec.kind === 'archive') {
          patch(spec.id, { phase: 'extracting', progress: 0 });
          await extract(spec, (fraction) => patch(spec.id, { progress: fraction }));
        }

        patch(spec.id, { phase: 'ready', progress: null });
      } catch (err) {
        patch(spec.id, {
          phase: phaseOf(spec),
          progress: null,
          error: err instanceof Error ? err.message : 'Download failed.',
        });
      } finally {
        cancels.current.delete(spec.id);
      }
    },
    [patch]
  );

  const cancel = useCallback(
    (spec: AssetSpec) => {
      cancels.current.get(spec.id)?.();
      cancels.current.delete(spec.id);
      patch(spec.id, { progress: null, phase: phaseOf(spec) });
    },
    [patch]
  );

  const discard = useCallback(
    (spec: AssetSpec) => {
      removeModel(spec);
      patch(spec.id, { phase: 'missing', progress: null, error: null });
    },
    [patch]
  );

  const downloadAll = useCallback(async () => {
    if (!rows) return;
    // Sequential on purpose: two large transfers on mobile data starve each other
    // and make the progress numbers meaningless.
    for (const row of rows) {
      if (row.phase !== 'ready') await start(row.spec);
    }
  }, [rows, start]);

  return { rows, loadError, reload: load, start, cancel, discard, downloadAll };
}
