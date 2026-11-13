import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabase';

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  images?: string[];
  metadata?: Record<string, unknown>;
}

export interface PersistedConversation {
  id: string;
  title: string;
  messages: PersistedMessage[];
  createdAt: number;
  updatedAt: number;
}

function client(): SupabaseClient {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error('SUPABASE_SERVER_SECRET_NOT_CONFIGURED');
  return supabase;
}

function timestampToIso(value: unknown, fallback: number): string {
  const timestamp = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
}

function toDatabaseMessages(conversationId: string, messages: PersistedMessage[]) {
  const now = Date.now();
  const selected = (Array.isArray(messages) ? messages : []).slice(-100);
  const seenIds = new Set<string>();

  return selected.map((message) => {
    const id = typeof message?.id === 'string' ? message.id.trim() : '';
    if (!id || id.length > 128) throw new Error('INVALID_MESSAGE_ID');
    if (seenIds.has(id)) throw new Error('DUPLICATE_MESSAGE_ID');
    seenIds.add(id);

    if (!['user', 'assistant', 'system'].includes(message.role)) {
      throw new Error('INVALID_MESSAGE_ROLE');
    }

    const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? message.metadata
      : {};

    return {
      id,
      role: message.role,
      content: String(message.content ?? '').slice(0, 100000),
      metadata: {
        images: (Array.isArray(message.images) ? message.images : [])
          .filter((url): url is string => typeof url === 'string' && /^https:\/\//i.test(url))
          .slice(0, 8),
        messageMetadata: metadata,
      },
      created_at: timestampToIso(message.createdAt, now),
    };
  }).map((row) => ({
    ...row,
    conversation_id: conversationId,
  }));
}

export async function listUserConversations(userId: string): Promise<PersistedConversation[]> {
  if (!userId || userId.length > 256) throw new Error('INVALID_USER_ID');
  const db = client();
  const { data: conversations, error } = await db
    .from('adam_conversations')
    .select('id,title,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!conversations?.length) return [];

  const ids = conversations.map((row: any) => row.id);
  const { data: messages, error: messageError } = await db
    .from('adam_messages')
    .select('id,conversation_id,role,content,metadata,created_at')
    .eq('user_id', userId)
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });
  if (messageError) throw messageError;

  const grouped = new Map<string, PersistedMessage[]>();
  for (const row of messages || []) {
    const list = grouped.get(row.conversation_id) || [];
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    list.push({
      id: row.id,
      role: row.role,
      content: row.content || '',
      createdAt: new Date(row.created_at).getTime(),
      images: Array.isArray((metadata as any).images) ? (metadata as any).images : undefined,
      metadata: (metadata as any).messageMetadata,
    });
    grouped.set(row.conversation_id, list);
  }

  return conversations.map((row: any) => ({
    id: row.id,
    title: row.title || 'New conversation',
    messages: grouped.get(row.id) || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

/**
 * Persists a conversation through one database transaction. The database RPC
 * locks the conversation and checks both conversation and message ownership
 * before applying any upserts, preventing cross-user ID collisions.
 *
 * The client parameter is injectable so the RPC contract can be unit-tested
 * without requiring live Supabase credentials.
 */
export async function saveUserConversationWithClient(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<any> },
  userId: string,
  conversation: PersistedConversation,
): Promise<void> {
  if (!userId || userId.length > 256) throw new Error('INVALID_USER_ID');
  if (!conversation || typeof conversation.id !== 'string' || !conversation.id.trim() || conversation.id.length > 128) {
    throw new Error('INVALID_CONVERSATION_ID');
  }
  if (!Array.isArray(conversation.messages)) throw new Error('INVALID_CONVERSATION_MESSAGES');

  const conversationId = conversation.id.trim();
  const now = Date.now();
  const payload = {
    id: conversationId,
    title: String(conversation.title || 'New conversation').slice(0, 120),
    created_at: timestampToIso(conversation.createdAt, now),
    updated_at: timestampToIso(conversation.updatedAt, now),
  };
  const messages = toDatabaseMessages(conversationId, conversation.messages);

  const { error } = await db.rpc('adam_save_conversation', {
    p_user_id: userId,
    p_conversation: payload,
    p_messages: messages,
  });

  if (error) {
    const message = String(error.message || '');
    if (message.includes('CONVERSATION_OWNERSHIP_MISMATCH')) {
      throw new Error('CONVERSATION_OWNERSHIP_MISMATCH');
    }
    if (message.includes('MESSAGE_OWNERSHIP_MISMATCH')) {
      throw new Error('MESSAGE_OWNERSHIP_MISMATCH');
    }
    throw error;
  }
}

export async function saveUserConversation(userId: string, conversation: PersistedConversation): Promise<void> {
  return saveUserConversationWithClient(client(), userId, conversation);
}

export async function deleteUserConversation(userId: string, conversationId: string): Promise<void> {
  if (!userId || userId.length > 256) throw new Error('INVALID_USER_ID');
  if (!conversationId || conversationId.length > 128) throw new Error('INVALID_CONVERSATION_ID');
  const { error } = await client().from('adam_conversations').delete().eq('id', conversationId).eq('user_id', userId);
  if (error) throw error;
}
