import { GoogleAuth } from 'google-auth-library';

const AUDIENCE = 'ki-cl-subgraphs';
const REFRESH_MS = 45 * 60 * 1000;

let token = '';

async function refresh(): Promise<void> {
  try {
    const client = await new GoogleAuth().getIdTokenClient(AUDIENCE);
    token = await client.idTokenProvider.fetchIdToken(AUDIENCE);
  } catch (error) {
    console.error('Could not mint an ID token for the subgraphs:', error);
  }
}

export async function start(): Promise<void> {
  if (!process.env.K_SERVICE) {
    return;
  }

  await refresh();
  setInterval(refresh, REFRESH_MS).unref();
}

export function authorization(): string {
  return token ? `Bearer ${token}` : '';
}
