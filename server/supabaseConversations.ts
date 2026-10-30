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

export async function saveUserConversation(userId: string, conversation: PersistedConversation): Promise<void> {
  if (!conversation.id || conversation.id.length > 128) throw new Error('INVALID_CONVERSATION_ID');
  const db = client();
  const now = new Date().toISOString();
  const createdAt = new Date(conversation.createdAt || Date.now()).toISOString();
  const updatedAt = new Date(conversation.updatedAt || Date.now()).toISOString();

  const { error: conversationError } = await db.from('adam_conversations').upsert({
    id: conversation.id,
    user_id: userId,
    title: String(conversation.title || 'New conversation').slice(0, 120),
    created_at: createdAt,
    updated_at: updatedAt,
  }, { onConflict: 'id' });
  if (conversationError) throw conversationError;

  const rows = (conversation.messages || []).slice(-100).map((message) => ({
    id: String(message.id).slice(0, 128),
    conversation_id: conversation.id,
    user_id: userId,
    role: message.role,
    content: String(message.content || '').slice(0, 100000),
    metadata: {
      images: (message.images || []).filter((url) => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 8),
      messageMetadata: message.metadata || {},
    },
    created_at: new Date(message.createdAt || Date.now()).toISOString(),
  })).filter((row) => row.id && ['user', 'assistant', 'system'].includes(row.role));

  if (rows.length) {
    const { error: messageError } = await db.from('adam_messages').upsert(rows, { onConflict: 'id' });
    if (messageError) throw messageError;
  }
}

export async function deleteUserConversation(userId: string, conversationId: string): Promise<void> {
  const { error } = await client().from('adam_conversations').delete().eq('id', conversationId).eq('user_id', userId);
  if (error) throw error;
}
