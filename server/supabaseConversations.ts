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

function toIsoTimestamp(value: number | undefined, fallback: number): string {
  const timestamp = Number(value);
  return new Date(Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback).toISOString();
}

export async function listUserConversations(userId: string): Promise<PersistedConversation[]> {
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
 * Client-generated IDs are globally unique database keys. Never use a plain
 * upsert here: a conflicting ID must not transfer ownership to the caller.
 * Insert-ignore plus owner-scoped updates makes retries safe and prevents an
 * ID collision from overwriting another user's conversation or message.
 */
export async function saveUserConversation(userId: string, conversation: PersistedConversation): Promise<void> {
  if (!userId || !conversation.id || conversation.id.length > 128) throw new Error('INVALID_CONVERSATION_ID');
  if (!Array.isArray(conversation.messages)) throw new Error('INVALID_CONVERSATION_MESSAGES');

  const seenMessageIds = new Set<string>();
  const rows = conversation.messages.slice(-100).map((message) => {
    const id = typeof message.id === 'string' ? message.id.trim() : '';
    if (!id || id.length > 128 || seenMessageIds.has(id)) throw new Error('INVALID_MESSAGE_ID');
    seenMessageIds.add(id);
    if (!['user', 'assistant', 'system'].includes(message.role)) throw new Error('INVALID_MESSAGE_ROLE');
    return {
      id,
      conversation_id: conversation.id,
      user_id: userId,
      role: message.role,
      content: String(message.content || '').slice(0, 100000),
      metadata: {
        images: (message.images || []).filter((url) => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 8),
        messageMetadata: message.metadata || {},
      },
      created_at: toIsoTimestamp(message.createdAt, Date.now()),
    };
  });

  const db = client();
  const now = Date.now();
  const createdAt = toIsoTimestamp(conversation.createdAt, now);
  const updatedAt = toIsoTimestamp(conversation.updatedAt, now);
  const conversationValues = {
    id: conversation.id,
    user_id: userId,
    title: String(conversation.title || 'New conversation').slice(0, 120),
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const { error: insertConversationError } = await db
    .from('adam_conversations')
    .upsert(conversationValues, { onConflict: 'id', ignoreDuplicates: true });
  if (insertConversationError) throw insertConversationError;

  const { error: updateConversationError } = await db
    .from('adam_conversations')
    .update({ title: conversationValues.title, updated_at: updatedAt })
    .eq('id', conversation.id)
    .eq('user_id', userId);
  if (updateConversationError) throw updateConversationError;

  const { data: ownedConversation, error: ownershipError } = await db
    .from('adam_conversations')
    .select('id')
    .eq('id', conversation.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedConversation) throw new Error('CONVERSATION_OWNERSHIP_MISMATCH');

  if (rows.length) {
    const { error: insertMessagesError } = await db
      .from('adam_messages')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (insertMessagesError) throw insertMessagesError;

    const { data: ownedMessages, error: messageOwnershipError } = await db
      .from('adam_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('conversation_id', conversation.id)
      .in('id', rows.map((row) => row.id));
    if (messageOwnershipError) throw messageOwnershipError;
    const ownedIds = new Set((ownedMessages || []).map((row: any) => row.id));
    if (rows.some((row) => !ownedIds.has(row.id))) throw new Error('MESSAGE_OWNERSHIP_MISMATCH');
  }
}

export async function deleteUserConversation(userId: string, conversationId: string): Promise<void> {
  if (!userId || !conversationId) throw new Error('INVALID_CONVERSATION_ID');
  const { error } = await client().from('adam_conversations').delete().eq('id', conversationId).eq('user_id', userId);
  if (error) throw error;
}
