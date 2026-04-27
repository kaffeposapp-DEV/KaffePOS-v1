import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Coffee } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GlobalErrorBoundary]', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#0b0f19] flex flex-col items-center justify-center p-8 text-center z-[99999]">
          {/* Decorative background blur */}
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/10 blur-[120px] rounded-full" />

          <div className="relative z-10 max-w-md w-full">
            <div className="w-24 h-24 bg-orange-500/10 border border-orange-500/20 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-2xl">
              <AlertTriangle size={48} className="text-orange-500" />
            </div>
            
            <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-6 leading-none">
              Sesuatu <br />Bermasalah. 🛠️
            </h2>
            
            <p className="text-slate-400 text-lg font-medium leading-relaxed mb-10">
              Jangan khawatir, data transaksi Anda biasanya tetap aman. Sistem butuh penyegaran singkat untuk sinkronisasi ulang.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-4 mb-10 text-left overflow-hidden">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Error Detail</p>
                <code className="text-xs text-orange-200/70 font-mono break-all line-clamp-3">
                    {this.state.error?.message || 'Unknown runtime error'}
                </code>
            </div>

            <button
              onClick={this.handleReload}
              className="w-full py-6 bg-orange-500 text-slate-950 rounded-[24px] font-black text-xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_40px_rgba(216,130,59,0.3)] uppercase italic"
            >
              <RefreshCw size={24} strokeWidth={3} /> 
              Segarkan Halaman
            </button>
            
            <div className="mt-12 flex items-center justify-center gap-3 text-slate-500">
                <Coffee size={16} />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">KaffePOS Recovery Engine</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
