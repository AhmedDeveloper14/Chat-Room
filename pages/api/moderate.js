import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const ROLE_POWER = { owner: 4, admin: 3, vip: 2, user: 1, guest: 0 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { action, actorNick, actorRole, targetNick, newRole } = req.body

  const actorPower = ROLE_POWER[actorRole] || 0
  const { data: targetUser } = await supabase
    .from('kl_users').select('role').eq('nick', targetNick).single()
  const targetPower = ROLE_POWER[targetUser?.role || 'guest'] || 0

  if (actorPower <= targetPower) {
    return res.status(403).json({ error: 'You cannot moderate someone with equal or higher rank.' })
  }

  if (action === 'ban') {
    if (actorPower < 3) return res.status(403).json({ error: 'Only Admins and Owner can ban.' })
    await supabase.from('kl_users').upsert({ nick: targetNick, is_banned: true, area:'—', role:'guest' }, { onConflict:'nick' })
    await supabase.from('kl_presence').delete().eq('nick', targetNick)
    // Broadcast ban via system message
    await supabase.from('kl_messages').insert({
      nick: 'System', role: 'system', color: '#4a7a60',
      text: `🚫 ${actorNick} has BANNED ${targetNick} from Karachi Lounge.`,
      is_system: true
    })
    return res.status(200).json({ success: true })
  }

  if (action === 'kick') {
    await supabase.from('kl_presence').delete().eq('nick', targetNick)
    await supabase.from('kl_messages').insert({
      nick: 'System', role: 'system', color: '#4a7a60',
      text: `⚠️ ${actorNick} has kicked ${targetNick} from the lounge!`,
      is_system: true
    })
    return res.status(200).json({ success: true })
  }

  if (action === 'setrole') {
    if (actorPower < 4) return res.status(403).json({ error: 'Only Owner can assign roles.' })
    const roleColors = { admin:'#00b4ff', vip:'#ffd700', user:'#e8f4f0', guest:'#e8f4f0' }
    const roleBgs = { admin:'#0a2030', vip:'#2a2000', user:'#1a1a2a', guest:'#1c2d3a' }
    await supabase.from('kl_users').upsert({
      nick: targetNick, role: newRole,
      color: roleColors[newRole] || '#e8f4f0',
      avatar_bg: roleBgs[newRole] || '#1c2d3a',
      area: targetUser?.area || 'Karachi'
    }, { onConflict: 'nick' })
    await supabase.from('kl_presence').update({ role: newRole }).eq('nick', targetNick)
    await supabase.from('kl_messages').insert({
      nick: 'System', role: 'system', color: '#4a7a60',
      text: `👑 ${actorNick} assigned ${targetNick} the role: ${newRole.toUpperCase()}`,
      is_system: true
    })
    return res.status(200).json({ success: true })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
