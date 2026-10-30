import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdentity } from '../server/security/firebaseIdentity.ts';

test('verifies identity using Firebase and returns provider-owned claims', async () => {
  let request;
  const identity = await verifyFirebaseIdentity('valid-token', 'public-api-key', async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({
      users: [{ localId: 'firebase-uid', email: 'user@example.com', emailVerified: true, displayName: 'Verified User' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  assert.equal(identity.uid, 'firebase-uid');
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.email, 'user@example.com');
  assert.equal(request.init.method, 'POST');
  assert.equal(JSON.parse(request.init.body).idToken, 'valid-token');
});

test('rejects invalid tokens and malformed Firebase responses', async () => {
  const invalid = await verifyFirebaseIdentity('bad-token', 'key', async () =>
    new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 }));
  assert.equal(invalid, null);

  const malformed = await verifyFirebaseIdentity('valid-token', 'key', async () =>
    new Response(JSON.stringify({ users: [{}] }), { status: 200 }));
  assert.equal(malformed, null);
});

test('fails closed when configuration is missing and reports provider outages', async () => {
  assert.equal(await verifyFirebaseIdentity('token', '', async () => { throw new Error('must not run'); }), null);
  await assert.rejects(
    verifyFirebaseIdentity('token', 'key', async () => { throw new Error('network down'); }),
    /FIREBASE_IDENTITY_UNAVAILABLE/,
  );
  await assert.rejects(
    verifyFirebaseIdentity('token', 'key', async () => new Response('{}', { status: 503 })),
    /FIREBASE_IDENTITY_UNAVAILABLE/,
  );
});
