import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; name?: string; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[ErrorBoundary:${this.props.name}]`, error, info); }
  handleReset = () => this.setState({ hasError: false, error: null });
  render() {
    if (this.state.hasError) return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4 text-2xl">⚠️</div>
        <h3 className="font-black text-slate-800 text-lg mb-1">Ups, ada yang error</h3>
        <p className="text-slate-400 text-sm text-center mb-3">{this.props.name ? `Tab ${this.props.name} bermasalah.` : 'Halaman ini bermasalah.'}</p>
        <p className="text-xs text-red-400 bg-red-50 rounded-xl px-3 py-2 mb-4 font-mono text-center">{this.state.error?.message}</p>
        <button onClick={this.handleReset} className="px-6 py-3 bg-orange-500 text-white font-bold rounded-2xl active:scale-95">Coba Lagi</button>
      </div>
    );
    return this.props.children;
  }
}
export default ErrorBoundary;
