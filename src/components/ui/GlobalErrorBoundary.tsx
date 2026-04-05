 
 
/* eslint-disable @typescript-eslint/no-unused-vars */
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
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
        <div style={{
          position: 'fixed', inset: 0, background: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', zIndex: 99999
        }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>☕</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1a0f0a', marginBottom: 12 }}>
            Ups, ada yang bermasalah.
          </h2>
          <p style={{ color: '#b08060', fontSize: 16, marginBottom: 32 }}>
            Coba lagi. Beberapa data mungkin belum sinkron.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '16px 32px', background: '#C8843A', color: '#fff',
              border: 'none', borderRadius: 16, fontWeight: 900, fontSize: 18,
              boxShadow: '0 8px 24px rgba(200, 132, 58, 0.3)',
              cursor: 'pointer',
              activeScale: 0.95
            } as any}
          >
            Muat Ulang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
