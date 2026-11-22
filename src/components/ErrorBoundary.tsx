import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SLP Billing Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let readable = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed?.error) {
          readable = `Firestore ${parsed.operationType || 'operation'} on "${parsed.path || 'unknown'}" failed: ${parsed.error}`;
        }
      } catch {
        // plain text error
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Application Recovery Needed</h2>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {readable}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F44] text-white text-sm font-medium hover:bg-[#13326b] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Sri Lakshmi Penchil Narasimha Swamy Cement Work
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
