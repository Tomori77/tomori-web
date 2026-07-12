import { jwtVerify, SignJWT } from 'jose'
import type { Env } from '../types'

function getSecret(env: Env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not configured')
  return new TextEncoder().encode(env.JWT_SECRET)
}

export async function createToken(env: Env, user: { id: number; role: number }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(getSecret(env))
}

export async function verifyToken(env: Env, token: string) {
  const { payload } = await jwtVerify(token, getSecret(env), { algorithms: ['HS256'] })
  const id = Number(payload.sub)
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid token subject')
  return id
}
