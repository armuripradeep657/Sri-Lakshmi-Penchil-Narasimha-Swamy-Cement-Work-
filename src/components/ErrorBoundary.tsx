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
      const isTe = typeof localStorage !== 'undefined' && localStorage.getItem('slp_lang') === 'te';
      let readable = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed?.error) {
          readable = isTe
            ? `డేటాబేస్ చర్య విఫలమైంది: ${parsed.error}`
            : `Firestore ${parsed.operationType || 'operation'} on "${parsed.path || 'unknown'}" failed: ${parsed.error}`;
        }
      } catch {
        // plain text error
      }

      return (
        <div className="min-h-screen bg-[#FAF8F5] dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-[#E5DDD3] dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 text-[#C23B2B] dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold text-[#0A2240] dark:text-white">
                {isTe ? 'యాప్‌ను రీలోడ్ చేయాల్సి ఉంది' : 'Application Recovery Needed'}
              </h2>
            </div>
            <p className="mt-3 text-sm text-[#6D665E] dark:text-slate-300 leading-relaxed break-words">
              {readable}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A2240] text-white text-sm font-medium hover:bg-[#13325B] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {isTe
                ? 'శ్రీ లక్ష్మి పెంచిల్ నరసింహ స్వామి సిమెంట్ వర్క్స్ రీలోడ్ చేయండి'
                : 'Reload Sri Lakshmi Penchil Narasimha Swamy Cement Work'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
