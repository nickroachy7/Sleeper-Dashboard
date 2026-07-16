import { useRef, useState } from 'react';
import { Bug, Lightbulb, MessageCircle, ImagePlus, X, Loader2, CheckCircle2, Send } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import {
  submitFeedback,
  FEEDBACK_MAX_MESSAGE,
  FEEDBACK_MAX_FILES,
  FEEDBACK_MAX_FILE_BYTES,
  FEEDBACK_ACCEPTED_TYPES,
  type FeedbackKind,
} from '../lib/feedback';

const KINDS: { id: FeedbackKind; label: string; icon: typeof Bug; hint: string }[] = [
  { id: 'bug', label: 'Bug', icon: Bug, hint: 'Something looks wrong or broken' },
  { id: 'idea', label: 'Idea', icon: Lightbulb, hint: 'A feature or improvement' },
  { id: 'other', label: 'Other', icon: MessageCircle, hint: 'Anything else' },
];

interface Attachment {
  file: File;
  url: string; // object URL for preview
}

export default function Feedback() {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placeholder =
    kind === 'bug'
      ? "What happened, and what did you expect? Steps to reproduce help a lot."
      : kind === 'idea'
        ? "What would you like to see? What problem would it solve for you?"
        : "What's on your mind?";

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);
    const incoming = Array.from(fileList);
    const next: Attachment[] = [...attachments];
    for (const file of incoming) {
      if (next.length >= FEEDBACK_MAX_FILES) {
        setError(`You can attach up to ${FEEDBACK_MAX_FILES} images.`);
        break;
      }
      if (!FEEDBACK_ACCEPTED_TYPES.includes(file.type)) {
        setError('Attachments must be PNG, JPG, GIF, or WebP images.');
        continue;
      }
      if (file.size > FEEDBACK_MAX_FILE_BYTES) {
        setError('Each image must be under 5 MB.');
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const reset = () => {
    attachments.forEach((a) => URL.revokeObjectURL(a.url));
    setKind('bug');
    setMessage('');
    setEmail('');
    setAttachments([]);
    setDone(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!message.trim()) {
      setError('Please add a short description.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({ kind, message, email, files: attachments.map((a) => a.file) });
      attachments.forEach((a) => URL.revokeObjectURL(a.url));
      setAttachments([]);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <PageHeader
          title="Feedback"
          subtitle="Spotted a bug or have an idea? Send it our way — a screenshot helps."
        />

        {done ? (
          <div className="rounded-xl bg-[#141419] border border-emerald-500/30 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-[16px] font-bold text-white">Thanks — that's in.</h2>
            <p className="text-[13px] text-[#9c9ca7] mt-1.5">
              We read every report. {email.trim() ? "We'll follow up if we need more detail." : ''}
            </p>
            <button
              onClick={reset}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1b1b22] hover:bg-[#22222b] text-[13px] font-medium text-white transition-colors"
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#75757f] tracking-[2px] uppercase mb-2.5">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {KINDS.map(({ id, label, icon: Icon, hint }) => {
                  const active = kind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setKind(id)}
                      className={`group flex flex-col items-center text-center gap-1.5 rounded-xl border p-3 sm:p-4 transition-all ${
                        active
                          ? 'border-accent-500 bg-accent-500/10'
                          : 'border-[#22222b] bg-[#141419] hover:border-[#363641] hover:bg-[#1b1b22]'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${active ? 'text-accent-400' : 'text-[#75757f] group-hover:text-[#9c9ca7]'}`}
                      />
                      <span className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-[#c4c4cd]'}`}>
                        {label}
                      </span>
                      <span className="text-[10px] leading-tight text-[#60606a] hidden sm:block">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="fb-message" className="block text-[11px] font-bold text-[#75757f] tracking-[2px] uppercase mb-2.5">
                Details
              </label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX_MESSAGE))}
                placeholder={placeholder}
                rows={6}
                className="w-full rounded-xl bg-[#141419] border border-[#26262f] px-4 py-3 text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500 transition-colors resize-y"
              />
              <div className="mt-1 text-right text-[10px] text-[#60606a]">
                {message.length}/{FEEDBACK_MAX_MESSAGE}
              </div>
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-[11px] font-bold text-[#75757f] tracking-[2px] uppercase mb-2.5">
                Screenshots <span className="text-[#4c4c56] normal-case tracking-normal font-medium">· optional</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {attachments.map((a, i) => (
                  <div key={a.url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#26262f] bg-[#141419]">
                    <img src={a.url} alt={a.file.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      aria-label="Remove attachment"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-black/70 hover:bg-black flex items-center justify-center text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {attachments.length < FEEDBACK_MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-lg border border-dashed border-[#363641] bg-[#141419] hover:border-accent-500 hover:bg-[#1b1b22] flex flex-col items-center justify-center gap-1 text-[#75757f] hover:text-accent-400 transition-colors"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Add</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={FEEDBACK_ACCEPTED_TYPES.join(',')}
                multiple
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
              />
              <p className="mt-2 text-[10px] text-[#60606a]">
                Up to {FEEDBACK_MAX_FILES} images · PNG, JPG, GIF, WebP · 5 MB each
              </p>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="fb-email" className="block text-[11px] font-bold text-[#75757f] tracking-[2px] uppercase mb-2.5">
                Email <span className="text-[#4c4c56] normal-case tracking-normal font-medium">· optional, for follow-up</span>
              </label>
              <input
                id="fb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-[#141419] border border-[#26262f] px-4 py-3 text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500 transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-[13px] text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-[#60606a]">Anonymous unless you leave an email.</p>
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-40 disabled:cursor-not-allowed text-[14px] font-semibold text-white transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
