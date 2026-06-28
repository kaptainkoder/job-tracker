// Test double for the auth context. ApplicationDetail only reads `user`, so the stub returns
// a fixed signed-in owner. Not type-checked (outside the tsconfig include).
const auth = {
  user: { id: 'user-1', email: 'owner@example.com' },
  session: { access_token: 'test-access-token' },
};

export function useAuth() {
  return auth;
}
