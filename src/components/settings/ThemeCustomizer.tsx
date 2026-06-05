import { CheckCircle2, Palette, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import {
  DEFAULT_CUSTOM_THEME,
  THEME_PRESETS,
  applyThemeToDocument,
  evaluateCustomTheme,
  getReadableTextColor,
} from '@/lib/theme';

export default function ThemeCustomizer({ toast }: { toast: { showToast: (message: string, type?: string) => void } }) {
  const appTheme = useStore((state) => state.appTheme);
  const customTheme = useStore((state) => state.customTheme);
  const setAppTheme = useStore((state) => state.setAppTheme);
  const setCustomTheme = useStore((state) => state.setCustomTheme);
  const [draft, setDraft] = useState(customTheme);

  useEffect(() => {
    setDraft(customTheme);
  }, [customTheme]);

  const evaluation = useMemo(() => evaluateCustomTheme(draft), [draft]);
  const previewTheme = evaluation.theme;

  const previewStyle = {
    background: `linear-gradient(135deg, ${previewTheme.surface} 0%, #ffffff 100%)`,
    borderColor: previewTheme.primary,
  };

  const applyPreset = (presetId: typeof THEME_PRESETS[number]['id']) => {
    setAppTheme(presetId);
    if (presetId !== 'custom') {
      toast.showToast('Tema preset diterapkan.', 'success');
      return;
    }

    setCustomTheme(previewTheme);
    toast.showToast('Custom theme aktif.', 'success');
  };

  const handlePreview = () => {
    applyThemeToDocument('custom', previewTheme);
    toast.showToast('Preview custom theme diterapkan di perangkat ini.', 'success');
  };

  const handleSave = () => {
    setCustomTheme(previewTheme);
    setAppTheme('custom');
    toast.showToast('Custom theme disimpan.', 'success');
  };

  const resetDraft = () => {
    setDraft(DEFAULT_CUSTOM_THEME);
    toast.showToast('Draft custom theme dikembalikan ke default.', 'info');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-black text-slate-400 mb-3">PRESET TEMA</p>
        <div className="space-y-3">
          {THEME_PRESETS.map((preset) => {
            const isActive = appTheme === preset.id;
            return (
              <button type="button"
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`w-full rounded-2xl border-2 p-4 text-left transition ${isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[preset.preview.primary, preset.preview.accent, preset.preview.surface].map((color) => (
                        <span key={color} className="h-8 w-8 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{preset.name}</p>
                      <p className="text-xs text-slate-500">{preset.description}</p>
                    </div>
                  </div>
                  {isActive && <CheckCircle2 size={18} className="text-slate-900" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Palette size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-800">Custom Theme</p>
            <p className="text-xs text-slate-500">Pilih warna utama brand Anda, sisanya otomatis disesuaikan.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-1">
          <label className="rounded-2xl border border-slate-200 px-4 py-4">
            <span className="block text-xs font-black uppercase tracking-[0.18em] text-slate-400 mb-3">Warna Utama (Primary)</span>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={draft.primary}
                onChange={(event) => {
                  const p = event.target.value;
                  setDraft({ primary: p, accent: p, surface: p });
                }}
                className="h-12 w-12 rounded-xl cursor-pointer border-0 bg-transparent p-0"
              />
              <div>
                <span className="text-base font-bold text-slate-800 block">{draft.primary.toUpperCase()}</span>
                <span className="text-xs text-slate-500">Klik kotak warna untuk mengubah</span>
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 rounded-[28px] border-2 p-4 shadow-sm" style={previewStyle}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Preview</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
              <p className="text-sm font-black text-slate-900">KaffePOS Theme</p>
              <p className="mt-1 text-sm text-slate-600">Preview kartu, tombol utama, dan surface agar hasilnya tetap rapi.</p>
              <button
                type="button"
                className="mt-4 h-12 w-full sm:w-auto rounded-2xl px-4 text-[15px] font-black shadow-sm"
                style={{
                  backgroundColor: previewTheme.primary,
                  color: getReadableTextColor(previewTheme.primary),
                }}
              >
                Simpan Penyesuaian
              </button>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: previewTheme.accent, backgroundColor: previewTheme.surface }}>
              <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: previewTheme.accent }}>Accent Cue</p>
              <p className="mt-2 text-sm font-bold text-slate-800">Readable surface tetap dijaga walau user pilih warna sendiri.</p>
            </div>
          </div>
        </div>

        {evaluation.warnings.length > 0 && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">🪄</span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-blue-800">Sistem menyesuaikan warnamu!</p>
                {evaluation.warnings.map((warning) => (
                  <p key={warning} className="text-[11px] font-medium text-blue-700">{warning}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button"
            onClick={handlePreview}
            className="flex-1 h-12 rounded-2xl border border-slate-200 px-4 text-[15px] font-bold text-slate-700"
          >
            Preview di App
          </button>
          <button type="button"
            onClick={handleSave}
            className="flex-1 h-12 rounded-2xl bg-slate-900 px-4 text-[15px] font-black text-white"
          >
            Simpan Custom Theme
          </button>
          <button type="button"
            onClick={resetDraft}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-[15px] font-bold text-slate-600"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Theme custom disimpan sebagai preferensi perangkat supaya tetap aman dan cepat diterapkan di web maupun webview.
        </p>
      </div>
    </div>
  );
}
