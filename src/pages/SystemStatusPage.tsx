import { useEffect, useState } from 'react';
import { resolveApiBaseUrl } from '@/lib/backendApi';
import { analyticsStatus, analyticsWarnings, type AnalyticsStatus } from '@/lib/analytics';

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
    payment: { ok: boolean; commerciallyReady?: boolean; provider: string; environment: string; merchantId: string | null };
  };
  syncMatrix: Record<string, boolean>;
  readiness: Record<string, number>;
  warnings?: string[];
};

export default function SystemStatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsStatus>(() => analyticsStatus());

  useEffect(() => {
    setAnalytics(analyticsStatus());
  }, []);

  const analyticsAlerts = analyticsWarnings();

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              System Live Status
            </p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Checked: {new Date().toLocaleTimeString()}</p>
          </div>
          <h1 className="mt-3 max-w-full break-words text-2xl font-black text-white italic uppercase sm:text-3xl">Production Readiness Audit</h1>
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
                { label: 'Email', ok: status.checks.email.ok, detail: status.checks.email.fromEmail || (status.checks.email.ok ? 'Aktif' : 'Belum dikonfigurasi') },
                {
                  label: 'Payment',
                  ok: status.checks.payment.commerciallyReady ?? status.checks.payment.ok,
                  detail: `${status.checks.payment.provider} · ${status.checks.payment.environment}`,
                },
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

            {status.warnings && status.warnings.length > 0 && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
                <h2 className="text-lg font-black text-amber-100">Operational Warnings</h2>
                <div className="mt-4 space-y-2 text-sm text-amber-50/90">
                  {status.warnings.map((warning) => (
                    <p key={warning}>• {warning}</p>
                  ))}
                </div>
              </section>
            )}

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
              {analyticsAlerts.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-50/90">
                  <p className="font-semibold text-amber-100">Butuh aktivasi di frontend build</p>
                  <div className="mt-2 space-y-2">
                    {analyticsAlerts.map((warning) => (
                      <p key={warning}>• {warning}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-slate-300">Google Analytics</p>
                  <p className="mt-2 text-sm text-slate-400">{analytics.ga.configured ? analytics.ga.measurementId : 'Belum dikonfigurasi di build ini'}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>Configured: {analytics.ga.configured ? 'Ya' : 'Belum'}</p>
                    <p>Script injected: {analytics.ga.scriptInjected ? 'Ya' : 'Belum'}</p>
                    <p>Runtime ready: {analytics.ga.runtimeReady ? 'Ya' : 'Belum'}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-slate-300">Microsoft Clarity</p>
                  <p className="mt-2 text-sm text-slate-400">{analytics.clarity.configured ? analytics.clarity.projectId : 'Belum dikonfigurasi di build ini'}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>Configured: {analytics.clarity.configured ? 'Ya' : 'Belum'}</p>
                    <p>Script injected: {analytics.clarity.scriptInjected ? 'Ya' : 'Belum'}</p>
                    <p>Runtime ready: {analytics.clarity.runtimeReady ? 'Ya' : 'Belum'}</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Perubahan `VITE_GA_MEASUREMENT_ID` atau `VITE_CLARITY_PROJECT_ID` hanya terbaca saat frontend dibuild ulang. Setelah env diubah di service KaffePOS Web, frontend harus diredeploy.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
