import { createClient } from '@supabase/supabase-js'

// 브라우저에는 공개 가능한 URL·publishable key만 둔다 (PRD 13.3). service_role key 금지.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('.env.local에 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY가 필요합니다')
}

export const supabase = createClient(url, key)
