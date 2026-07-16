/**
 * Client helper for the Feedback surface.
 *
 * A submission uploads any screenshots to the public `feedback-attachments`
 * storage bucket, then inserts one row into `feedback`. RLS restricts the
 * browser to bounded INSERTs only (see migration 20260715_feedback).
 */
import { supabase } from './supabase';

export type FeedbackKind = 'bug' | 'idea' | 'other';

export const FEEDBACK_MAX_MESSAGE = 5000;
export const FEEDBACK_MAX_FILES = 4;
export const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per image
export const FEEDBACK_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const BUCKET = 'feedback-attachments';

/** Coarse anonymous identity so one browser's submissions can be rate-limited.
 *  Reuses the same key as community votes when present. Not auth. */
function submitterId(): string {
  const KEY = 'community_voter_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

function sanitizeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'png';
  return `${Math.random().toString(36).slice(2)}.${ext || 'png'}`;
}

export interface SubmitFeedbackArgs {
  kind: FeedbackKind;
  message: string;
  /** Optional email for follow-up. */
  email?: string;
  /** Optional screenshot attachments. */
  files?: File[];
}

/** Upload attachments then record one feedback row. Throws on failure so the
 *  form can surface an error. */
export async function submitFeedback(args: SubmitFeedbackArgs): Promise<void> {
  const message = args.message.trim();
  if (!message) throw new Error('Please add a short description.');
  if (message.length > FEEDBACK_MAX_MESSAGE) {
    throw new Error(`Please keep it under ${FEEDBACK_MAX_MESSAGE} characters.`);
  }

  const id = submitterId();
  const files = (args.files ?? []).slice(0, FEEDBACK_MAX_FILES);

  // Upload screenshots first; collect their public URLs.
  const attachments: string[] = [];
  for (const file of files) {
    if (!FEEDBACK_ACCEPTED_TYPES.includes(file.type)) {
      throw new Error('Attachments must be PNG, JPG, GIF, or WebP images.');
    }
    if (file.size > FEEDBACK_MAX_FILE_BYTES) {
      throw new Error('Each image must be under 5 MB.');
    }
    const path = `${id}/${Date.now()}-${sanitizeName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(`Couldn't upload attachment: ${upErr.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    attachments.push(data.publicUrl);
  }

  const email = args.email?.trim() || null;
  const { error } = await supabase.from('feedback').insert({
    kind: args.kind,
    message,
    email,
    attachments,
    page_url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    submitter_id: id,
  });
  if (error) throw new Error(error.message);
}
