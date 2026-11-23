import React from 'react';

interface State { error: Error | null }

/** Menangkap error render agar pengguna tidak melihat layar putih. Data tidak hilang: tersimpan di server/browser. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Titik pasang untuk layanan pelaporan error (Sentry, dsb.).
    console.error('Rampung error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <h1 className="m-0 text-2xl font-extrabold">Ada yang tidak beres</h1>
        <p className="m-0 max-w-md text-[15px] leading-relaxed text-arang-body">Halaman gagal ditampilkan. Data Anda aman. Muat ulang halaman, atau kembali ke beranda.</p>
        <div className="flex gap-3">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Muat ulang</button>
          <a className="btn btn-outline" href="#/beranda" onClick={() => this.setState({ error: null })}>Ke beranda</a>
        </div>
        <details className="max-w-md text-xs text-arang-muted"><summary className="cursor-pointer">Detail teknis</summary><pre className="mt-2 whitespace-pre-wrap text-left">{this.state.error.message}</pre></details>
      </div>
    );
  }
}
