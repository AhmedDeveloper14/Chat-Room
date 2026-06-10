import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { nick, area, email, password, color, avatarBg } = req.body

  if (!nick || !password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  // Check if already registered
  const { data: existing } = await supabase
    .from('kl_users')
    .select('nick, password_hash')
    .eq('nick', nick)
    .single()

  if (existing?.password_hash) {
    return res.status(409).json({ error: 'This nickname is already registered!' })
  }

  // Upsert user record
  const { error } = await supabase.from('kl_users').upsert({
    nick,
    area: area || 'Karachi',
    role: existing?.role || 'user',
    color: color || '#e8f4f0',
    avatar_bg: avatarBg || '#1c2d3a',
    password_hash: password, // In production: use bcrypt
    email: email || null,
  }, { onConflict: 'nick' })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ success: true, role: existing?.role || 'user' })
}
