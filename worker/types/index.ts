export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  MEDIA_BUCKET: R2Bucket
}

export type AppContext = {
  Bindings: Env
}
