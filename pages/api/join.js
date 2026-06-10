import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { nick, area, password, mode } = req.body

  if (!nick || nick.length < 2 || nick.length > 20) {
    return res.status(400).json({ error: 'Nickname must be 2-20 characters.' })
  }

  // Check if nick is banned
  const { data: existingUser } = await supabase
    .from('kl_users')
    .select('*')
    .eq('nick', nick)
    .single()

  if (existingUser?.is_banned) {
    return res.status(403).json({ error: 'This nickname is banned from Karachi Lounge.' })
  }

  if (mode === 'login') {
    // Login: nick must exist and password must match
    if (!existingUser) return res.status(404).json({ error: 'Nickname not registered. Use Quick Entry.' })
    if (!existingUser.password_hash) return res.status(400).json({ error: 'This nick has no password set.' })
    if (existingUser.password_hash !== password) return res.status(401).json({ error: 'Wrong password!' })

    return res.status(200).json({
      user: {
        nick: existingUser.nick,
        area: existingUser.area,
        role: existingUser.role,
        color: existingUser.color,
        avatarBg: existingUser.avatar_bg,
        registered: true,
      }
    })
  }

  // Guest mode: check if nick is taken by registered user
  if (existingUser && existingUser.password_hash) {
    return res.status(409).json({ error: 'This nickname is registered. Please Login instead.' })
  }

  const roleColors = { owner:'#ff4d6d', admin:'#00b4ff', vip:'#ffd700', user:'#e8f4f0', guest:'#e8f4f0' }
  const roleBgs   = { owner:'#3d0a10', admin:'#0a2030', vip:'#2a2000', user:'#1a1a2a', guest:'#1c2d3a' }
  const role = existingUser?.role || 'guest'

  return res.status(200).json({
    user: {
      nick,
      area: area || existingUser?.area || 'Karachi',
      role,
      color: existingUser?.color || roleColors[role],
      avatarBg: existingUser?.avatar_bg || roleBgs[role],
      registered: false,
    }
  })
}
