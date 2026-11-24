import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { Facebook, MessageSquare, Send, ExternalLink, Youtube } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { generateId } from '../lib/seedAndHelpers';
import { CmsSettings, SupportMessage, UserProfile } from '../types';

interface SupportTabProps {
  user: UserProfile;
  cms: CmsSettings;
}

export const SupportTab: React.FC<SupportTabProps> = ({ user, cms }) => {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'supportChats', user.uid, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SupportMessage);
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `supportChats/${user.uid}/messages`);
      }
    );
    return () => unsub();
  }, [user.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;

    setSending(true);
    const msgId = generateId('msg');
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'supportChats', user.uid),
        {
          userId: user.uid,
          userName: user.fullName,
          userContact: user.phone || user.email,
          lastMessage: clean.slice(0, 480),
          unreadByAdmin: 1,
          unreadByUser: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(doc(db, 'supportChats', user.uid, 'messages', msgId), {
        id: msgId,
        senderId: user.uid,
        senderRole: 'user',
        text: clean.slice(0, 980),
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `supportChats/${user.uid}/messages/${msgId}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Live Support Chat Window */}
      <div className="lg:col-span-8 glass-surface rounded-3xl overflow-hidden flex flex-col h-[540px]">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">সরাসরি লাইভ চ্যাট সাপোর্ট</h2>
              <p className="text-xs text-slate-400">কাস্টমার সার্ভিস টিম সরাসরি এখানে উত্তর দেয়</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-slate-400">
              <MessageSquare className="w-8 h-8 text-slate-600" />
              <p className="text-sm">যেকোনো সমস্যা বা প্রশ্ন থাকলে নিচে মেসেজ লিখুন।</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderRole === 'user';
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isMe
                        ? 'bg-amber-500 text-slate-950 font-medium rounded-br-sm'
                        : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? 'text-slate-900/70' : 'text-slate-400'}`}>
                      {isMe ? 'আপনি' : 'সাপোর্ট অ্যাডমিন'}
                      {m.createdAt?.toDate
                        ? ` · ${m.createdAt.toDate().toLocaleTimeString('bn-BD', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-slate-800 flex items-center gap-2.5">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="আপনার সমস্যা বা প্রশ্ন লিখুন..."
            className="flex-1 h-11 rounded-xl bg-slate-950 border border-slate-800 px-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="h-11 px-4 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm inline-flex items-center gap-1.5 hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            পাঠান
          </button>
        </form>
      </div>

      {/* Telegram, YouTube & Facebook Channels */}
      <div className="lg:col-span-4 space-y-4">
        {cms.telegramUrl.trim() && (
          <div className="glass-gold rounded-3xl p-5 space-y-3">
            <h3 className="text-base font-bold text-white">সরাসরি টেলিগ্রাম সাপোর্ট</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              তাৎক্ষণিক সহায়তার জন্য সরাসরি আমাদের অফিশিয়াল টেলিগ্রাম সাপোর্টে যোগাযোগ করুন।
            </p>
            <a
              href={cms.telegramUrl.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 rounded-xl bg-[#229ED9] text-white font-bold text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all"
            >
              টেলিগ্রামে কথা বলুন
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {(cms.youtubeUrl.trim() || cms.facebookUrl.trim()) && (
          <div className="glass-surface rounded-3xl p-5 space-y-3">
            <h3 className="text-base font-bold text-white">টিউটোরিয়াল ও গাইডলাইন</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              কীভাবে ডিপোজিট, প্যাকেজ ক্রয় এবং দৈনিক আয় ক্লেইম করবেন তা ভিডিও ও পোস্টে দেখুন।
            </p>
            <div className="space-y-2.5 pt-1">
              {cms.youtubeUrl.trim() && (
                <a
                  href={cms.youtubeUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-rose-500/25 transition-colors"
                >
                  <Youtube className="w-4 h-4" />
                  YouTube ভিডিও গাইড
                </a>
              )}
              {cms.facebookUrl.trim() && (
                <a
                  href={cms.facebookUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-blue-500/15 border border-blue-500/35 text-blue-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-500/25 transition-colors"
                >
                  <Facebook className="w-4 h-4" />
                  Facebook অফিশিয়াল পেজ
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
