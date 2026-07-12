export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  MEDIA_BUCKET: R2Bucket
  JWT_SECRET?: string
}

export type AppContext = {
  Bindings: Env
  Variables: {
    user: AuthUser
  }
}

export interface AuthUser {
  id: number
  username: string
  email: string
  role: number
  avatar_url: string | null
  bio: string | null
}
