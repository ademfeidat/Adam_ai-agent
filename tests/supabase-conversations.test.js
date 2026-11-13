import test from 'node:test';
import assert from 'node:assert/strict';

const { saveUserConversationWithClient } = await import('../server/supabaseConversations.ts');

function sampleConversation(messages = []) {
  return {
    id: 'conv_owner_1',
    title: '  Planning  ',
    messages,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_001_000,
  };
}

test('conversation save uses one atomic RPC and scopes its arguments to the server user ID', async () => {
  let invocation;
  const db = {
    async rpc(name, args) {
      invocation = { name, args };
      return { error: null };
    },
  };

  await saveUserConversationWithClient(db, 'firebase-user-123', sampleConversation([{
    id: 'msg_1',
    role: 'user',
    content: 'Hello',
    createdAt: 1_800_000_000_500,
    images: ['https://cdn.example/image.png', 'data:image/png;base64,AAAA', 'http://insecure.example/image.png'],
    metadata: { source: 'chat' },
  }]));

  assert.equal(invocation.name, 'adam_save_conversation');
  assert.equal(invocation.args.p_user_id, 'firebase-user-123');
  assert.equal(invocation.args.p_conversation.id, 'conv_owner_1');
  assert.equal(invocation.args.p_conversation.title, '  Planning  ');
  assert.equal(invocation.args.p_messages.length, 1);
  assert.equal(invocation.args.p_messages[0].conversation_id, 'conv_owner_1');
  assert.deepEqual(invocation.args.p_messages[0].metadata.images, ['https://cdn.example/image.png']);
  assert.deepEqual(invocation.args.p_messages[0].metadata.messageMetadata, { source: 'chat' });
});

test('conversation save caps the persisted history at the latest 100 messages', async () => {
  let invocation;
  const db = {
    async rpc(name, args) {
      invocation = { name, args };
      return { error: null };
    },
  };
  const messages = Array.from({ length: 105 }, (_, index) => ({
    id: `msg_${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: `message-${index}`,
    createdAt: 1_800_000_000_000 + index,
  }));

  await saveUserConversationWithClient(db, 'user-1', sampleConversation(messages));

  assert.equal(invocation.args.p_messages.length, 100);
  assert.equal(invocation.args.p_messages[0].id, 'msg_5');
  assert.equal(invocation.args.p_messages[99].id, 'msg_104');
});

test('duplicate message IDs are rejected before any database write', async () => {
  let called = false;
  const db = { async rpc() { called = true; return { error: null }; } };
  const messages = [
    { id: 'same-id', role: 'user', content: 'first', createdAt: 1 },
    { id: 'same-id', role: 'assistant', content: 'second', createdAt: 2 },
  ];

  await assert.rejects(
    () => saveUserConversationWithClient(db, 'user-1', sampleConversation(messages)),
    { message: 'DUPLICATE_MESSAGE_ID' },
  );
  assert.equal(called, false);
});

test('database ownership conflicts are surfaced as explicit authorization errors', async () => {
  const db = {
    async rpc() {
      return { error: { message: 'MESSAGE_OWNERSHIP_MISMATCH', code: '42501' } };
    },
  };

  await assert.rejects(
    () => saveUserConversationWithClient(db, 'user-2', sampleConversation([{
      id: 'message-owned-by-another-user',
      role: 'user',
      content: 'attempted collision',
      createdAt: 1,
    }])),
    { message: 'MESSAGE_OWNERSHIP_MISMATCH' },
  );
});

test('invalid message IDs and roles fail closed before database writes', async (t) => {
  for (const message of [
    { id: '', role: 'user', content: 'missing ID', createdAt: 1 },
    { id: 'x'.repeat(129), role: 'user', content: 'long ID', createdAt: 1 },
    { id: 'msg_bad_role', role: 'tool', content: 'invalid role', createdAt: 1 },
  ]) {
    await t.test(message.id || 'empty-id', async () => {
      let called = false;
      const db = { async rpc() { called = true; return { error: null }; } };
      await assert.rejects(() => saveUserConversationWithClient(db, 'user-1', sampleConversation([message])));
      assert.equal(called, false);
    });
  }
});
