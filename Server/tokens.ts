import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { calculateJwkThumbprint, errors, exportJWK, jwtVerify, SignJWT } from 'jose';

const ALGORITHM = 'EdDSA';
const TYPE = 'at+jwt';

export type Check = { sub: string } | 'missing' | 'expired' | 'invalid';

let keys: Promise<{ privateKey: KeyObject; publicKey: KeyObject; kid: string }> | undefined;

function load() {
  keys ??= (async () => {
    const privateKey = createPrivateKey(process.env.JWT_SIGNING_KEY!);
    const publicKey = createPublicKey(privateKey);

    return { privateKey, publicKey, kid: await calculateJwkThumbprint(await exportJWK(publicKey)) };
  })();

  return keys;
}

export async function sign(sub: string, expiresAt: Date): Promise<string> {
  const { privateKey, kid } = await load();

  return new SignJWT({ sub })
    .setProtectedHeader({ alg: ALGORITHM, kid, typ: TYPE })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

export async function check(token: string | undefined): Promise<Check> {
  if (!token) {
    return 'missing';
  }

  const { publicKey } = await load();

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [ALGORITHM],
      typ: TYPE,
      requiredClaims: ['sub', 'iat', 'exp'],
    });

    return { sub: payload.sub as string };
  } catch (error) {
    return error instanceof errors.JWTExpired ? 'expired' : 'invalid';
  }
}
