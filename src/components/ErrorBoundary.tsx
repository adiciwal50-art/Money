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
    return { hasError: true, message: error.message || 'অপ্রত্যাশিত ত্রুটি ঘটেছে' };
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = 'সিস্টেমে সাময়িক ত্রুটি হয়েছে। অনুগ্রহ করে পেজটি রিলোড করুন।';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendlyMsg = 'অ্যাক্সেস অনুমতি পাওয়া যায়নি। অনুগ্রহ করে আবার সাইন-ইন করুন।';
      }

      return (
        <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-6">
          <div className="glass-surface max-w-md w-full rounded-2xl p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-white">সমস্যা শনাক্ত হয়েছে</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{friendlyMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              রিলোড করুন
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
