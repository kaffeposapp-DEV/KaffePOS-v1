import { useEffect, useMemo, useState } from 'react';
import { resolveApiBaseUrl } from '@/lib/backendApi';
import { analyticsStatus } from '@/lib/analytics';

type StatusResponse = {
  ok: boolean;
  service: string;
  version: string;
  env: string;
  time: string;
  checks: {
    backend: { ok: boolean };
    database: { ok: boolean; latencyMs?: number | null };
    email: { ok: boolean; provider: string; fromEmail: string | null };
    payment: { ok: boolean; provider: string; environment: string; merchantId: string | null };
  };
  syncMatrix: Record<string, boolean>;
  readiness: Record<string, number>;
};

export default function SystemStatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const analytics = useMemo(() => analyticsStatus(), []);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = resolveApiBaseUrl() || 'https://api.kaffepos.my.id';

    fetch(`${apiBase}/system-status`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Gagal memuat status (${response.status})`);
        }
        return response.json() as Promise<StatusResponse>;
      })
      .then((data) => {
        setStatus(data);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat status sistem.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">System Status</p>
          <h1 className="mt-3 text-3xl font-black text-white">KaffePOS Production Readiness</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            Halaman ini menarik status backend production, koneksi database, provider email, dan matriks sinkronisasi fitur inti.
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300">
            Memuat status sistem...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        )}

        {status && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Backend', ok: status.checks.backend.ok, detail: status.service },
                { label: 'Database', ok: status.checks.database.ok, detail: `${status.checks.database.latencyMs ?? '-'} ms` },
                { label: 'Email', ok: status.checks.email.ok, detail: status.checks.email.fromEmail || 'Belum dikonfigurasi' },
                { label: 'Payment', ok: status.checks.payment.ok, detail: `${status.checks.payment.provider} · ${status.checks.payment.environment}` },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-300">{item.label}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      {item.ok ? 'Ready' : 'Needs Attention'}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-black text-white">{item.detail}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                <h2 className="text-lg font-black text-white">Sync Matrix</h2>
                <div className="mt-4 space-y-3">
                  {Object.entries(status.syncMatrix).map(([feature, enabled]) => (
                    <div key={feature} className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm last:border-b-0 last:pb-0">
                      <span className="text-slate-300">{feature}</span>
                      <span className={enabled ? 'text-emerald-300' : 'text-amber-300'}>
                        {enabled ? 'Synced' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                <h2 className="text-lg font-black text-white">Readiness Score</h2>
                <div className="mt-4 space-y-3">
                  {Object.entries({
                    ...status.readiness,
                    analytics: analytics.ga.configured || analytics.clarity.configured ? 9 : 6,
                  }).map(([feature, score]) => (
                    <div key={feature} className="flex items-center justify-between border-b border-slate-800 pb-3 text-sm last:border-b-0 last:pb-0">
                      <span className="text-slate-300">{feature}</span>
                      <span className="text-white">{score}/10</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="text-lg font-black text-white">Analytics</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-slate-300">Google Analytics</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {analytics.ga.configured ? analytics.ga.measurementId : 'Belum dikonfigurasi'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-slate-300">Microsoft Clarity</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {analytics.clarity.configured ? analytics.clarity.projectId : 'Belum dikonfigurasi'}
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
