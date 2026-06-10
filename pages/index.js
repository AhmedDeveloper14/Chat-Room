import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const KARACHI_AREAS = ['DHA','Clifton','Gulshan-e-Iqbal','North Nazimabad','Saddar',
  'Korangi','Malir','Lyari','PECHS','Bahadurabad','Orangi Town','Site Area','Landhi','Kemari']
const CHAT_COLORS = ['','#ff9f7a','#c78fff','#ff7ab8','#7affdc','#ffd07a']
const EMOJIS = ['😂','🔥','❤️','👍','😍','🎉','😎','🤣','💯','😭','🙏','😊','🤔',
  '😅','👋','🍕','🍵','⚽','🏆','😴','🚗','📺','💪','🤗','😱','🎊','✨','💥','🇵🇰','🏙️']
const STATUSES = [
  {icon:'🟢',text:'Online'},
  {icon:'🍵',text:'Chai Pe Raha Hoon'},
  {icon:'🚗',text:'Stuck in Traffic'},
  {icon:'📺',text:'Watching the Match'},
  {icon:'😴',text:'AFK / Sone Jaa Raha'},
  {icon:'🔴',text:'Busy'},
  {icon:'📖',text:'Studying / Parh Raha'},
]
const FIFA_MATCHES = [
  { home:'🇧🇷 BRA', away:'🇦🇷 ARG', sh:1, sa:1, min:67, live:true },
  { home:'🇵🇰 PAK', away:'🇸🇦 KSA', sh:0, sa:1, min:34, live:true },
  { home:'🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENG', away:'🇩🇪 GER', sh:2, sa:1, min:'FT', live:false },
  { home:'🇫🇷 FRA', away:'🇦🇺 AUS', sh:'-', sa:'-', min:'19:00', live:false },
]

function nowTime() {
  return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})
}

// ─── AUDIO ────────────────────────────────────────────────────────────────────
let audioCtx = null
function playSound(type) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.connect(g); g.connect(audioCtx.destination)
    const s = { msg:{f:440,d:0.06}, join:{f:523,d:0.2}, dm:{f:660,d:0.15}, kick:{f:200,d:0.3,t:'sawtooth'}, goal:{f:880,d:0.4} }[type] || {f:440,d:0.06}
    o.frequency.value = s.f; o.type = s.t || 'sine'
    g.gain.setValueAtTime(0.12, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + s.d)
    o.start(); o.stop(audioCtx.currentTime + s.d)
  } catch(e) {}
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function KarachiLounge() {
  // Auth state
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('guest') // guest|login
  const [authForm, setAuthForm] = useState({ nick:'', area:'', password:'' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Chat state
  const [messages, setMessages] = useState([])
  const [dmChats, setDmChats] = useState({}) // { nick: [msgs] }
  const [activeTab, setActiveTab] = useState('global') // global | nick
  const [dmTabs, setDmTabs] = useState([])
  const [dmUnread, setDmUnread] = useState({})
  const [msgInput, setMsgInput] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  const [muted, setMuted] = useState(false)
  const [muteLeft, setMuteLeft] = useState(0)

  // Presence / sidebar
  const [onlineUsers, setOnlineUsers] = useState([])
  const [sidebarTab, setSidebarTab] = useState('online') // online|directory
  const [dirSearch, setDirSearch] = useState('')
  const [dirFilter, setDirFilter] = useState('all')
  const [allUsers, setAllUsers] = useState([])

  // UI state
  const [popover, setPopover] = useState(null) // { user, x, y }
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [myStatus, setMyStatus] = useState({icon:'🟢', text:'Online'})
  const [showRegBanner, setShowRegBanner] = useState(false)
  const [showRegForm, setShowRegForm] = useState(false)
  const [regForm, setRegForm] = useState({ email:'', password:'' })
  const [regError, setRegError] = useState('')
  const [goalFlash, setGoalFlash] = useState('')
  const [showStandings, setShowStandings] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileSidebar, setMobileSidebar] = useState(false)

  const messagesEndRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const realtimeRef = useRef(null)
  const muteTimerRef = useRef(null)
  const soundRef = useRef(true)

  useEffect(() => { soundRef.current = soundOn }, [soundOn])

  // ─── SCROLL ───────────────────────────────────────────────────────────────
  const scrollBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }, [])

  // ─── TOAST ────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(''), 3000)
  }, [])

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  async function handleJoin() {
    setAuthError(''); setAuthLoading(true)
    const { nick, area, password } = authForm
    if (!nick.trim()) { setAuthError('Nickname daalna zaroori hai!'); setAuthLoading(false); return }
    if (authMode === 'guest' && !area) { setAuthError('Apna area select karo!'); setAuthLoading(false); return }

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nick: nick.trim(), area, password, mode: authMode === 'login' ? 'login' : 'guest' })
    })
    const data = await res.json()
    if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return }

    const u = data.user
    setUser(u)
    setAuthLoading(false)
    await joinRoom(u)
  }

  async function joinRoom(u) {
    // Upsert presence
    await supabase.from('kl_presence').upsert({
      nick: u.nick, area: u.area, role: u.role,
      color: u.color, avatar_bg: u.avatarBg,
      status_icon: '🟢', status_text: 'Online',
      registered: u.registered, last_ping: new Date().toISOString()
    }, { onConflict: 'nick' })

    // System join message
    await supabase.from('kl_messages').insert({
      nick: 'System', role: 'system', color: '#4a7a60',
      text: `👋 ${u.nick} ne Karachi Lounge join kiya — ${u.area} se!`,
      is_system: true
    })

    // Load recent messages (last 80)
    const { data: msgs } = await supabase
      .from('kl_messages').select('*')
      .order('created_at', { ascending: false }).limit(80)
    setMessages((msgs || []).reverse())
    scrollBottom()

    // Load all users for directory
    const { data: users } = await supabase.from('kl_users').select('*')
    setAllUsers(users || [])

    // Setup realtime + presence ping
    setupRealtime(u)
    startPresencePing(u)

    if (!u.registered) setTimeout(() => setShowRegBanner(true), 4000)

    if (soundRef.current) playSound('join')
  }

  // ─── REALTIME ─────────────────────────────────────────────────────────────
  function setupRealtime(u) {
    if (realtimeRef.current) { supabase.removeChannel(realtimeRef.current) }

    const channel = supabase.channel('karachi-lounge-global')

    // New global messages
    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'kl_messages'
    }, (payload) => {
      const msg = payload.new
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      scrollBottom()
      if (msg.nick !== u.nick && !msg.is_system && soundRef.current) playSound('msg')
    })

    // Presence changes
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'kl_presence'
    }, () => { fetchPresence() })

    // DMs for this user
    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'kl_dms',
      filter: `to_nick=eq.${u.nick}`
    }, (payload) => {
      const dm = payload.new
      setDmChats(prev => {
        const thread = prev[dm.from_nick] || []
        return { ...prev, [dm.from_nick]: [...thread, dm] }
      })
      setDmTabs(prev => prev.includes(dm.from_nick) ? prev : [...prev, dm.from_nick])
      setDmUnread(prev => ({ ...prev, [dm.from_nick]: (prev[dm.from_nick]||0)+1 }))
      if (soundRef.current) playSound('dm')
    })

    // Kicked: remove from presence triggers leave
    channel.on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'kl_presence',
      filter: `nick=eq.${u.nick}`
    }, () => {
      showToast('⚠️ You have been kicked from the lounge!')
      setUser(null)
    })

    channel.subscribe()
    realtimeRef.current = channel

    // Initial presence fetch
    fetchPresence()
  }

  async function fetchPresence() {
    const cutoff = new Date(Date.now() - 90000).toISOString() // 90s timeout
    const { data } = await supabase
      .from('kl_presence').select('*')
      .gte('last_ping', cutoff)
      .order('last_ping', { ascending: false })
    setOnlineUsers(data || [])
  }

  function startPresencePing(u) {
    // Ping every 30s to stay "online"
    pingIntervalRef.current = setInterval(async () => {
      await supabase.from('kl_presence').upsert({
        nick: u.nick, area: u.area, role: u.role,
        color: u.color, avatar_bg: u.avatarBg,
        status_icon: myStatus.icon, status_text: myStatus.text,
        registered: u.registered, last_ping: new Date().toISOString()
      }, { onConflict: 'nick' })
    }, 30000)

    // On page close, remove presence
    const cleanup = async () => {
      await supabase.from('kl_presence').delete().eq('nick', u.nick)
      await supabase.from('kl_messages').insert({
        nick: 'System', role: 'system', color: '#4a7a60',
        text: `👋 ${u.nick} Karachi Lounge se chale gaye.`,
        is_system: true
      })
    }
    window.addEventListener('beforeunload', cleanup)
    return () => { window.removeEventListener('beforeunload', cleanup); clearInterval(pingIntervalRef.current) }
  }

  // ─── SEND MESSAGE ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!user || !msgInput.trim() || muted) return
    const text = msgInput.trim()
    setMsgInput('')

    if (activeTab === 'global') {
      await supabase.from('kl_messages').insert({
        nick: user.nick, role: user.role,
        color: selectedColor || user.color,
        area: user.area, text,
      })
    } else {
      // DM
      const { data: dm } = await supabase.from('kl_dms').insert({
        from_nick: user.nick, to_nick: activeTab, text
      }).select().single()
      if (dm) {
        setDmChats(prev => {
          const thread = prev[activeTab] || []
          return { ...prev, [activeTab]: [...thread, dm] }
        })
      }
    }
    if (soundRef.current) playSound('msg')
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ─── DMs ──────────────────────────────────────────────────────────────────
  async function openDM(nick) {
    if (nick === user?.nick) return
    if (!dmTabs.includes(nick)) {
      setDmTabs(prev => [...prev, nick])
      // Load existing DM history
      const { data } = await supabase.from('kl_dms')
        .select('*')
        .or(`and(from_nick.eq.${user.nick},to_nick.eq.${nick}),and(from_nick.eq.${nick},to_nick.eq.${user.nick})`)
        .order('created_at', { ascending: true })
      setDmChats(prev => ({ ...prev, [nick]: data || [] }))
    }
    setActiveTab(nick)
    setDmUnread(prev => ({ ...prev, [nick]: 0 }))
    setPopover(null)
    setMobileSidebar(false)
    if (soundRef.current) playSound('dm')
  }

  function closeDM(nick) {
    setDmTabs(prev => prev.filter(n => n !== nick))
    if (activeTab === nick) setActiveTab('global')
  }

  // ─── MODERATION ───────────────────────────────────────────────────────────
  async function moderate(action, targetNick, newRole) {
    setPopover(null)
    const res = await fetch('/api/moderate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action, actorNick: user.nick, actorRole: user.role, targetNick, newRole })
    })
    const data = await res.json()
    if (!res.ok) { showToast('❌ ' + data.error); return }
    showToast(`✅ Done: ${action} on ${targetNick}`)
    if (soundRef.current && action === 'kick') playSound('kick')
  }

  function startMute(targetNick) {
    setPopover(null)
    // If muting self (received mute), just disable input
    if (targetNick === user.nick) {
      setMuted(true); setMuteLeft(300)
      muteTimerRef.current = setInterval(() => {
        setMuteLeft(p => { if (p <= 1) { clearInterval(muteTimerRef.current); setMuted(false); return 0 } return p-1 })
      }, 1000)
    }
    supabase.from('kl_messages').insert({
      nick:'System', role:'system', color:'#4a7a60',
      text:`🔇 ${user.nick} has muted ${targetNick} for 5 minutes.`, is_system:true
    })
    showToast(`🔇 ${targetNick} muted for 5 mins`)
  }

  // ─── REGISTER NICK ────────────────────────────────────────────────────────
  async function registerNick() {
    setRegError('')
    if (!regForm.password || regForm.password.length < 6) { setRegError('Password min 6 characters!'); return }
    const res = await fetch('/api/register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ nick: user.nick, area: user.area, email: regForm.email, password: regForm.password, color: user.color, avatarBg: user.avatarBg })
    })
    const data = await res.json()
    if (!res.ok) { setRegError(data.error); return }
    const updated = { ...user, registered: true, role: data.role || user.role }
    setUser(updated)
    setShowRegForm(false); setShowRegBanner(false)
    await supabase.from('kl_presence').update({ registered: true }).eq('nick', user.nick)
    await supabase.from('kl_messages').insert({
      nick:'System', role:'system', color:'#4a7a60',
      text:`✅ ${user.nick} ne apna nickname register kar liya — verified member!`, is_system:true
    })
    showToast('🎉 Nickname register ho gaya! Verified badge mil gaya.')
    const { data: users } = await supabase.from('kl_users').select('*')
    setAllUsers(users || [])
    if (soundRef.current) playSound('join')
  }

  // ─── STATUS ───────────────────────────────────────────────────────────────
  async function changeStatus(s) {
    setMyStatus(s); setShowStatus(false)
    if (user) {
      await supabase.from('kl_presence').update({ status_icon: s.icon, status_text: s.text }).eq('nick', user.nick)
      await supabase.from('kl_messages').insert({
        nick:'System', role:'system', color:'#4a7a60',
        text:`${user.nick} ab: ${s.icon} ${s.text}`, is_system:true
      })
    }
  }

  // ─── POPOVER ──────────────────────────────────────────────────────────────
  function openPopover(u, e) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({ user: u, x: rect.right + 8, y: rect.top })
  }

  // ─── DIRECTORY ────────────────────────────────────────────────────────────
  const onlineNicks = new Set(onlineUsers.map(u => u.nick))
  const dirUsers = (() => {
    // merge DB users + online guests
    const map = {}
    allUsers.forEach(u => { map[u.nick] = { ...u, online: onlineNicks.has(u.nick), liveData: onlineUsers.find(x=>x.nick===u.nick) } })
    onlineUsers.forEach(u => { if (!map[u.nick]) map[u.nick] = { nick:u.nick, area:u.area, role:u.role, color:u.color, avatar_bg:u.avatar_bg, online:true, liveData:u, registered:u.registered } })
    let arr = Object.values(map)
    const q = dirSearch.toLowerCase()
    if (q) arr = arr.filter(u => u.nick.toLowerCase().includes(q) || (u.area||'').toLowerCase().includes(q))
    if (dirFilter !== 'all') {
      if (dirFilter === 'online') arr = arr.filter(u=>u.online)
      else if (dirFilter === 'registered') arr = arr.filter(u=>u.registered||u.password_hash)
      else arr = arr.filter(u=>u.role===dirFilter)
    }
    const order = {owner:0,admin:1,vip:2,user:3,guest:4}
    arr.sort((a,b)=>{ if(a.online!==b.online) return a.online?-1:1; return (order[a.role]||5)-(order[b.role]||5)||a.nick.localeCompare(b.nick) })
    return arr
  })()

  // ─── RENDER HELPERS ───────────────────────────────────────────────────────
  const roleIcon = (r) => ({owner:'👑',admin:'🛡️',vip:'⭐',user:'✔',guest:''}[r]||'')
  const roleColor = (r) => ({owner:'#ff4d6d',admin:'#00b4ff',vip:'#ffd700',user:'#00e5a0',guest:'#7a9aaa'}[r]||'#7a9aaa')
  const rolePower = (r) => ({owner:4,admin:3,vip:2,user:1,guest:0}[r]||0)

  const currentMsgs = activeTab === 'global' ? messages : (dmChats[activeTab] || [])

  const groupedOnline = ['owner','admin','vip','user','guest'].reduce((acc, role) => {
    const users = onlineUsers.filter(u=>u.role===role)
    if (users.length) acc.push({ role, users })
    return acc
  }, [])

  const roleMeta = {
    owner:{label:'Owner',icon:'👑',color:'#ff4d6d'},
    admin:{label:'Admins',icon:'🛡️',color:'#00b4ff'},
    vip:{label:'VIPs',icon:'⭐',color:'#ffd700'},
    user:{label:'Registered',icon:'✔',color:'#00e5a0'},
    guest:{label:'Guests',icon:'👤',color:'#3d5a6a'},
  }

  // ─── POPOVER ACTIONS ──────────────────────────────────────────────────────
  function renderPopoverActions(pu) {
    if (!user || pu.nick === user.nick) return <div style={{fontSize:'11px',color:'#3d5a6a',textAlign:'center',padding:'6px'}}>This is you!</div>
    const myPow = rolePower(user.role), tPow = rolePower(pu.role||pu.role)
    const canMod = myPow > tPow && myPow >= 3
    const canVipKick = user.role==='vip' && myPow > tPow
    return (<>
      <PopBtn color="electric" onClick={() => openDM(pu.nick)}>💬 Private Message</PopBtn>
      {(canMod || canVipKick) && <>
        <div style={{height:1,background:'#1e3446',margin:'6px 0'}}/>
        <div style={{fontSize:'10px',color:'#3d5a6a',textTransform:'uppercase',letterSpacing:'1px',padding:'2px 0'}}>Moderation</div>
        <PopBtn color="gold" onClick={() => startMute(pu.nick)}>🔇 Mute (5 min)</PopBtn>
        <PopBtn color="red" onClick={() => moderate('kick', pu.nick)}>🚫 Kick</PopBtn>
        {canMod && <PopBtn color="red" onClick={() => moderate('ban', pu.nick)}>⛔ Ban</PopBtn>}
      </>}
      {user.role==='owner' && <>
        <div style={{height:1,background:'#1e3446',margin:'6px 0'}}/>
        <div style={{fontSize:'10px',color:'#3d5a6a',textTransform:'uppercase',letterSpacing:'1px',padding:'2px 0'}}>Assign Role</div>
        <PopBtn color="electric" onClick={() => moderate('setrole', pu.nick, 'admin')}>🛡️ Make Admin</PopBtn>
        <PopBtn color="gold" onClick={() => moderate('setrole', pu.nick, 'vip')}>⭐ Make VIP</PopBtn>
        <PopBtn color="ghost" onClick={() => moderate('setrole', pu.nick, 'user')}>👤 Demote to User</PopBtn>
      </>}
    </>)
  }

  // ─── GOAL FLASH ───────────────────────────────────────────────────────────
  function triggerGoal(team) {
    setGoalFlash(team)
    setTimeout(() => setGoalFlash(''), 2800)
    if (soundRef.current) playSound('goal')
  }

  // ─── NOT LOGGED IN ────────────────────────────────────────────────────────
  if (!user) return (
    <div style={S.overlay}>
      <Head><title>Karachi Lounge | کراچی لاؤنج</title></Head>
      <div style={S.modalBox}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,transparent,#00e5a0,#00b4ff,transparent)'}}/>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontFamily:"'Noto Nastaliq Urdu',serif",fontSize:28,color:'#00e5a0',textShadow:'0 0 20px rgba(0,229,160,0.3)'}}>کراچی لاؤنج</div>
          <div style={{fontSize:22,fontWeight:700,background:'linear-gradient(90deg,#00e5a0,#00b4ff)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>KARACHI LOUNGE</div>
          <div style={{fontSize:11,color:'#7a9aaa',marginTop:6,letterSpacing:'1.5px',textTransform:'uppercase'}}>Pakistan's Premier City Chat Room</div>
        </div>
        <div style={{display:'flex',gap:2,background:'#0d1a22',borderRadius:6,padding:3,marginBottom:20}}>
          {['guest','login'].map(m=>(
            <button key={m} onClick={()=>setAuthMode(m)} style={{...S.modalTab, color: authMode===m?'#00e5a0':'#7a9aaa', background: authMode===m?'#162330':'transparent'}}>
              {m==='guest'?'⚡ Quick Entry':'🔑 Login'}
            </button>
          ))}
        </div>
        {authError && <div style={{background:'rgba(255,77,109,0.1)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:12,color:'#ff4d6d'}}>{authError}</div>}
        <div style={{marginBottom:14}}>
          <label style={S.label}>Nickname (عرفیت)</label>
          <input style={S.input} placeholder="e.g. KarachiKing786" maxLength={20}
            value={authForm.nick} onChange={e=>setAuthForm(p=>({...p,nick:e.target.value}))}
            onKeyDown={e=>e.key==='Enter'&&handleJoin()} autoFocus/>
        </div>
        {authMode==='guest' && (
          <div style={{marginBottom:14}}>
            <label style={S.label}>Karachi Area (علاقہ)</label>
            <select style={S.input} value={authForm.area} onChange={e=>setAuthForm(p=>({...p,area:e.target.value}))}>
              <option value="">Select your area...</option>
              {KARACHI_AREAS.map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
        )}
        {authMode==='login' && (
          <div style={{marginBottom:14}}>
            <label style={S.label}>Password</label>
            <input type="password" style={S.input} placeholder="Your password"
              value={authForm.password} onChange={e=>setAuthForm(p=>({...p,password:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&handleJoin()}/>
          </div>
        )}
        <button style={S.btnPrimary} onClick={handleJoin} disabled={authLoading}>
          {authLoading ? 'Joining...' : authMode==='guest' ? 'Enter the Lounge 🚀' : 'Login 🔑'}
        </button>
        {authMode==='login' && <p style={{textAlign:'center',marginTop:10,fontSize:11,color:'#3d5a6a'}}>New? Use Quick Entry and register your nick inside!</p>}
      </div>
    </div>
  )

  // ─── MAIN APP ─────────────────────────────────────────────────────────────
  return (
    <>
    <Head><title>Karachi Lounge | کراچی لاؤنج</title></Head>
    <div style={S.app} onClick={()=>{setPopover(null);setShowEmoji(false);setShowStatus(false)}}>

      {/* ── FIFA HEADER ── */}
      <div style={S.fifaHeader}>
        <div style={S.fifaBadge}>🏆 <span style={{fontSize:10,fontWeight:700,color:'#ffd700',letterSpacing:1}}>FIFA WC 2026</span></div>
        <div style={{flex:1,display:'flex',gap:8,alignItems:'center',overflowX:'auto',padding:'0 4px'}}>
          {FIFA_MATCHES.map((m,i)=>(
            <div key={i} style={{...S.matchCard, borderColor: m.live?'#00b87d':'#1e3446'}}>
              <span style={{fontSize:12}}>{m.home}</span>
              <span style={{...S.scoreBox, color: m.live?'#00e5a0':'#e8f4f0'}}>
                {m.sh==='-' ? 'vs' : `${m.sh}-${m.sa}`}
              </span>
              <span style={{fontSize:12}}>{m.away}</span>
              {m.live && <span style={{fontSize:10,color:'#00e5a0',animation:'pulse 1.5s infinite',marginLeft:2}}>{m.min}'</span>}
              {!m.live && <span style={{fontSize:9,color:'#3d5a6a',marginLeft:2}}>{m.min}</span>}
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          <button style={S.fifaBtn} onClick={e=>{e.stopPropagation();setShowStandings(p=>!p)}}>📊 Standings</button>
          <button style={S.fifaBtn} onClick={e=>{e.stopPropagation();triggerGoal('🇵🇰 PAK')}}>⚽ Test Goal</button>
          <button style={S.fifaBtn} onClick={()=>setSoundOn(p=>!p)}>{soundOn?'🔊':'🔇'}</button>
        </div>
        {goalFlash && (
          <div style={S.goalFlash}>⚽ GOAL! {goalFlash} SCORES!</div>
        )}
        {showStandings && (
          <div style={S.standingsPanel} onClick={e=>e.stopPropagation()}>
            <div style={{padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:'#00b4ff',textTransform:'uppercase',letterSpacing:1.5,marginBottom:10}}>Group Standings</div>
              {[{g:'Group A',teams:[{f:'🇧🇷',n:'Brazil',p:7},{f:'🇦🇷',n:'Argentina',p:7},{f:'🇺🇾',n:'Uruguay',p:3},{f:'🇨🇱',n:'Chile',p:0}]},
                {g:'Group C',teams:[{f:'🇸🇦',n:'Saudi Arabia',p:3},{f:'🇮🇷',n:'Iran',p:3},{f:'🇵🇰',n:'Pakistan',p:1},{f:'🇰🇷',n:'Korea',p:1}]}
              ].map(g=>(
                <div key={g.g} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:'#7a9aaa',marginBottom:4,paddingLeft:4}}>{g.g}</div>
                  {g.teams.map((t,i)=>(
                    <div key={t.n} style={{display:'grid',gridTemplateColumns:'18px 1fr 28px',gap:6,padding:'4px 6px',borderRadius:4,fontSize:12,color:i<2?'#00e5a0':'#e8f4f0'}}>
                      <span style={{color:'#3d5a6a'}}>{i+1}</span>
                      <span>{t.f} {t.n}</span>
                      <span style={{fontWeight:700,textAlign:'right'}}>{t.p}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{fontSize:10,color:'#00b87d'}}>🟢 Qualified for Round of 16</div>
            </div>
          </div>
        )}
      </div>

      {/* ── LAYOUT ── */}
      <div style={S.layout}>

        {/* ── SIDEBAR ── */}
        <div style={{...S.sidebar, ...(mobileSidebar?S.sidebarMobileOpen:{})}} onClick={e=>e.stopPropagation()}>
          <div style={S.sidebarHeader}>
            <span style={{fontSize:11,fontWeight:700,color:'#7a9aaa',textTransform:'uppercase',letterSpacing:1.5}}>
              {sidebarTab==='online'?'Online Now':'All Users'}
            </span>
            <span style={{background:'rgba(0,229,160,0.15)',border:'1px solid #00b87d',color:'#00e5a0',fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,fontFamily:'monospace'}}>
              {sidebarTab==='online' ? onlineUsers.length : dirUsers.length}
            </span>
          </div>

          {/* Sidebar tabs */}
          <div style={{display:'flex',gap:2,padding:'6px 8px 0',borderBottom:'1px solid #1e3446',flexShrink:0}}>
            {['online','directory'].map(t=>(
              <button key={t} onClick={()=>setSidebarTab(t)} style={{
                flex:1,padding:'7px 4px',background:'none',border:'none',
                borderBottom: sidebarTab===t?'2px solid #00e5a0':'2px solid transparent',
                color: sidebarTab===t?'#00e5a0':'#3d5a6a',
                fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:600,
                cursor:'pointer',transition:'all 0.2s',
              }}>
                {t==='online'?'🟢 Online':'👥 All Users'}
              </button>
            ))}
          </div>

          {/* Online panel */}
          {sidebarTab==='online' && (
            <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
              {groupedOnline.map(({role,users})=>(
                <div key={role}>
                  <div style={{padding:'6px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:roleColor(role),display:'flex',alignItems:'center',gap:6}}>
                    <span>{roleMeta[role]?.icon}</span>{roleMeta[role]?.label}
                    <span style={{marginLeft:'auto',color:'#3d5a6a',fontFamily:'monospace'}}>{users.length}</span>
                  </div>
                  {users.map(u=>(
                    <div key={u.nick} style={S.userItem} onClick={e=>openPopover(u,e)}>
                      <div style={{...S.userAvatar,background:u.avatar_bg||'#1c2d3a',color:u.color,position:'relative'}}>
                        {u.nick[0].toUpperCase()}
                        <div style={{position:'absolute',bottom:0,right:0,width:8,height:8,borderRadius:'50%',background:u.status_icon==='🔴'?'#ff4d6d':u.status_icon==='😴'?'#ffd700':'#00e5a0',border:'2px solid #0d1a22'}}/>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:u.color,display:'flex',alignItems:'center',gap:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {u.nick} {roleIcon(u.role)&&<span style={{fontSize:11}}>{roleIcon(u.role)}</span>}
                          {u.registered&&u.role==='user'&&<span style={{fontSize:10,color:'#00b4ff'}}>✔</span>}
                        </div>
                        <div style={{fontSize:10,color:'#3d5a6a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📍 {u.area||'—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {onlineUsers.length === 0 && <div style={{padding:20,textAlign:'center',color:'#3d5a6a',fontSize:12}}>Loading users...</div>}
            </div>
          )}

          {/* Directory panel */}
          {sidebarTab==='directory' && (
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'8px 10px',borderBottom:'1px solid #1e3446',flexShrink:0}}>
                <input style={{...S.input,padding:'6px 10px',fontSize:12}} placeholder="🔍 Search by nick or area..."
                  value={dirSearch} onChange={e=>setDirSearch(e.target.value)}/>
              </div>
              <div style={{display:'flex',gap:4,padding:'6px 10px',overflowX:'auto',flexShrink:0,borderBottom:'1px solid #1e3446'}}>
                {['all','online','owner','admin','vip','registered','guest'].map(f=>(
                  <button key={f} onClick={()=>setDirFilter(f)} style={{
                    padding:'3px 9px',borderRadius:10,border:'1px solid',fontSize:10,fontWeight:600,
                    whiteSpace:'nowrap',cursor:'pointer',transition:'all 0.15s',fontFamily:"'Space Grotesk',sans-serif",
                    borderColor: dirFilter===f?'#00b87d':'#1e3446',
                    color: dirFilter===f?'#00e5a0':'#3d5a6a',
                    background: dirFilter===f?'rgba(0,229,160,0.1)':'none',
                  }}>
                    {f==='all'?'All':f==='online'?'🟢 Online':f==='owner'?'👑 Owner':f==='admin'?'🛡️ Admin':f==='vip'?'⭐ VIP':f==='registered'?'✔ Verified':'👤 Guests'}
                  </button>
                ))}
              </div>
              <div style={{flex:1,overflowY:'auto'}}>
                {(() => {
                  const online = dirUsers.filter(u=>u.online)
                  const offline = dirUsers.filter(u=>!u.online)
                  return (<>
                    {online.length>0 && <>
                      <div style={S.dirSectionLabel}>🟢 Online — {online.length}</div>
                      {online.map(u=><DirRow key={u.nick} u={u} me={user} onDM={openDM} onProfile={openPopover}/>)}
                    </>}
                    {offline.length>0 && <>
                      <div style={S.dirSectionLabel}>💤 Offline — {offline.length}</div>
                      {offline.map(u=><DirRow key={u.nick} u={u} me={user} onDM={openDM} onProfile={openPopover}/>)}
                    </>}
                    {dirUsers.length===0 && <div style={{padding:20,textAlign:'center',color:'#3d5a6a',fontSize:12}}>No users found 🔍</div>}
                  </>)
                })()}
              </div>
            </div>
          )}

          {/* My Status */}
          {sidebarTab==='online' && (
            <div style={{padding:'10px 14px',borderTop:'1px solid #1e3446',flexShrink:0,position:'relative'}}>
              <div style={{fontSize:10,color:'#3d5a6a',marginBottom:5}}>My Status</div>
              <button style={{...S.hdrBtn,width:'100%',justifyContent:'flex-start'}} onClick={e=>{e.stopPropagation();setShowStatus(p=>!p)}}>
                <span>{myStatus.icon}</span> <span style={{fontSize:11}}>{myStatus.text.length>18?myStatus.text.slice(0,18)+'…':myStatus.text}</span>
              </button>
              {showStatus && (
                <div style={S.statusMenu} onClick={e=>e.stopPropagation()}>
                  {STATUSES.map(s=>(
                    <div key={s.text} style={S.statusOption} onClick={()=>changeStatus(s)}>{s.icon} {s.text}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile sidebar overlay */}
        {mobileSidebar && <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:49}} onClick={()=>setMobileSidebar(false)}/>}

        {/* ── CHAT AREA ── */}
        <div style={S.chatArea}>
          {/* Chat header */}
          <div style={S.chatHeader}>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700}}>
                {activeTab==='global'?'🏙️ Global Chat — Karachi Lounge':`💬 DM: ${activeTab}`}
              </div>
              <div style={{fontSize:11,color:'#7a9aaa'}}>
                {activeTab==='global'?`${onlineUsers.length} online • Sab yahan hain`:'Private Message • End-to-end encrypted'}
              </div>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button style={S.hdrBtn} onClick={()=>setMobileSidebar(p=>!p)}>👥</button>
              {!user.registered && <button style={{...S.hdrBtn,borderColor:'#0090cc',color:'#00b4ff'}} onClick={()=>{setShowRegBanner(false);setShowRegForm(true)}}>✅ Register Nick</button>}
            </div>
          </div>

          {/* DM Tabs */}
          <div style={{display:'flex',gap:2,padding:'6px 12px 0',borderBottom:'1px solid #1e3446',overflowX:'auto',flexShrink:0,background:'#0d1a22'}}>
            <div style={{...S.dmTab, ...(activeTab==='global'?S.dmTabActive:{})}} onClick={()=>setActiveTab('global')}>
              🌍 Global Chat
            </div>
            {dmTabs.map(nick=>(
              <div key={nick} style={{...S.dmTab,...(activeTab===nick?S.dmTabActive:{})}} onClick={()=>{setActiveTab(nick);setDmUnread(p=>({...p,[nick]:0}))}}>
                💬 {nick}
                {dmUnread[nick]>0 && <span style={{background:'#00b4ff',color:'#000',fontSize:9,fontWeight:700,width:14,height:14,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{dmUnread[nick]}</span>}
                <span style={{opacity:0.5,fontSize:12}} onClick={e=>{e.stopPropagation();closeDM(nick)}}>✕</span>
              </div>
            ))}
          </div>

          {/* Register banner */}
          {showRegBanner && !showRegForm && (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(0,180,255,0.06)',border:'1px solid #1e3446',borderLeft:'3px solid #00b4ff',borderRadius:6,padding:'8px 14px',margin:'8px 16px',flexShrink:0}}>
              <span>🔒</span>
              <div style={{flex:1,fontSize:12,color:'#7a9aaa'}}>Apna nickname secure karo! <strong style={{color:'#00b4ff'}}>Register karo</strong> taake koi aur use na kar sake.</div>
              <button style={{...S.hdrBtn,borderColor:'#0090cc',color:'#00b4ff',fontSize:11}} onClick={()=>{setShowRegForm(true);setShowRegBanner(false)}}>Register</button>
              <button style={{...S.hdrBtn,fontSize:11}} onClick={()=>setShowRegBanner(false)}>✕</button>
            </div>
          )}

          {/* Register inline form */}
          {showRegForm && (
            <div style={{background:'#111e28',border:'1px solid #2a4a60',borderRadius:8,padding:14,margin:'8px 16px',flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:700,color:'#00b4ff',marginBottom:10}}>🔐 Nickname Reserve karo: <span style={{color:'#e8f4f0'}}>{user.nick}</span></div>
              {regError && <div style={{color:'#ff4d6d',fontSize:12,marginBottom:8}}>{regError}</div>}
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <label style={S.label}>Email (optional)</label>
                  <input style={S.input} type="email" placeholder="you@example.com"
                    value={regForm.email} onChange={e=>setRegForm(p=>({...p,email:e.target.value}))}/>
                </div>
                <div style={{flex:1}}>
                  <label style={S.label}>Password (min 6)</label>
                  <input style={S.input} type="password" placeholder="••••••••"
                    value={regForm.password} onChange={e=>setRegForm(p=>({...p,password:e.target.value}))}/>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...S.hdrBtn,background:'rgba(0,180,255,0.1)',borderColor:'#0090cc',color:'#00b4ff'}} onClick={registerNick}>✅ Secure My Nick</button>
                <button style={S.hdrBtn} onClick={()=>setShowRegForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:'10px 14px',display:'flex',flexDirection:'column',gap:2}}>
            {currentMsgs.map((msg,i)=>{
              const isSystem = msg.is_system || msg.nick==='System'
              if (isSystem) return (
                <div key={msg.id||i} style={{background:'rgba(74,122,96,0.1)',borderLeft:'3px solid #4a7a60',borderRadius:'0 6px 6px 0',padding:'5px 10px',margin:'3px 0',fontSize:12,color:'#4a7a60',fontStyle:'italic'}}>
                  ⚙️ {msg.text}
                </div>
              )
              const u = onlineUsers.find(u=>u.nick===msg.nick)
              const avBg = u?.avatar_bg || '#1c2d3a'
              const initial = msg.nick[0]?.toUpperCase()
              const uObj = u || { nick:msg.nick, role:msg.role, area:msg.area, color:msg.color, avatar_bg:avBg, registered: !!msg.registered }
              return (
                <div key={msg.id||i} style={S.msgRow}>
                  <div style={{...S.msgAvatar,background:avBg,color:msg.color,cursor:'pointer'}} onClick={e=>openPopover(uObj,e)}>{initial}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                      <span style={{fontSize:13,fontWeight:700,color:msg.color,cursor:'pointer'}} onClick={e=>openPopover(uObj,e)}>
                        {msg.nick} {roleIcon(msg.role)&&<span style={{fontSize:11}}>{roleIcon(msg.role)}</span>}
                        {msg.registered&&msg.role==='user'&&<span style={{fontSize:10,color:'#00b4ff'}}> ✔</span>}
                      </span>
                      <span style={{fontSize:10,color:'#3d5a6a',fontFamily:'monospace'}}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}) : ''}
                      </span>
                    </div>
                    <div style={{fontSize:13,lineHeight:1.6,wordBreak:'break-word',color: msg.role==='vip'?'#e8d87a':'#e8f4f0'}}>{msg.text}</div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef}/>
          </div>

          {/* Chat Input */}
          <div style={{padding:'10px 14px',borderTop:'1px solid #1e3446',background:'#0d1a22',flexShrink:0}}>
            <div style={{display:'flex',gap:6,marginBottom:7,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{position:'relative'}}>
                <button style={S.toolBtn} onClick={e=>{e.stopPropagation();setShowEmoji(p=>!p)}}>😊 Emoji</button>
                {showEmoji && (
                  <div style={S.emojiPanel} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                      {EMOJIS.map(em=>(
                        <span key={em} style={{fontSize:20,cursor:'pointer',padding:3,borderRadius:4}} onClick={()=>{setMsgInput(p=>p+em);setShowEmoji(false)}}>{em}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:10,color:'#3d5a6a'}}>Color:</span>
                {CHAT_COLORS.map((c,i)=>(
                  <div key={i} onClick={()=>setSelectedColor(c)} style={{
                    width:18,height:18,borderRadius:'50%',
                    background:c||'#e8f4f0',cursor:'pointer',
                    border: selectedColor===c?'2px solid #fff':'2px solid transparent',
                    transition:'all 0.15s',
                  }}/>
                ))}
              </div>
              <span style={{fontSize:11,color:'#3d5a6a',marginLeft:'auto'}}>
                {activeTab==='global' ? `${onlineUsers.length} online` : `DM: ${activeTab}`}
              </span>
            </div>
            {muted ? (
              <div style={{textAlign:'center',padding:8,fontSize:12,color:'#ff4d6d',background:'rgba(255,77,109,0.1)',borderRadius:6}}>
                🔇 Muted. {Math.floor(muteLeft/60)}:{String(muteLeft%60).padStart(2,'0')} remaining
              </div>
            ) : (
              <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                <textarea style={S.msgInput} placeholder={activeTab==='global'?'Type your message... (Enter to send)':` DM to ${activeTab}...`}
                  value={msgInput} onChange={e=>setMsgInput(e.target.value)}
                  onKeyDown={handleKey} rows={1}
                  onInput={e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'}}/>
                <button style={S.sendBtn} onClick={sendMessage}>
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="#000"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PROFILE POPOVER ── */}
      {popover && (
        <div style={{...S.popover,left:Math.min(popover.x, window.innerWidth-270),top:Math.min(popover.y, window.innerHeight-380)}} onClick={e=>e.stopPropagation()}>
          <div style={{background:'linear-gradient(135deg,#162330,#0d1a22)',padding:14,display:'flex',gap:10,alignItems:'center',position:'relative'}}>
            <div style={{...S.msgAvatar,width:42,height:42,fontSize:17,background:popover.user.avatar_bg||'#1c2d3a',color:popover.user.color}}>{popover.user.nick[0]?.toUpperCase()}</div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:popover.user.color,display:'flex',alignItems:'center',gap:4}}>
                {popover.user.nick} {roleIcon(popover.user.role)&&<span>{roleIcon(popover.user.role)}</span>}
              </div>
              <div style={{fontSize:11,color:'#7a9aaa',marginTop:2}}>📍 {popover.user.area||'—'}</div>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1,color:roleColor(popover.user.role),marginTop:3}}>{popover.user.role}</div>
            </div>
            <button style={{position:'absolute',top:8,right:8,background:'none',border:'none',color:'#3d5a6a',cursor:'pointer',fontSize:16}} onClick={()=>setPopover(null)}>✕</button>
          </div>
          <div style={{padding:'10px 14px'}}>
            <div style={{background:'#0d1a22',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#7a9aaa',marginBottom:10,display:'flex',gap:6}}>
              {popover.user.status_icon||'🟢'} <span>{popover.user.status_text||'Online'}</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {renderPopoverActions(popover.user)}
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && <div style={S.toast}>{toast}</div>}

    </div>

    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      html,body,#__next { height:100%; overflow:hidden; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:#2a4a60; border-radius:2px; }
      @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
      @keyframes goalFlash { 0%{opacity:0;transform:scaleX(0)}10%{opacity:1;transform:scaleX(1)}80%{opacity:1}100%{opacity:0} }
      textarea { resize:none; }
      select option { background:#0d1a22; }
    `}</style>
    </>
  )
}

// ─── DIR ROW COMPONENT ────────────────────────────────────────────────────────
function DirRow({ u, me, onDM, onProfile }) {
  const [hover, setHover] = useState(false)
  const isMe = me && u.nick === me.nick
  const dotColor = u.online ? (u.liveData?.status_icon==='🔴'?'#ff4d6d':u.liveData?.status_icon==='😴'?'#ffd700':'#00e5a0') : '#3d5a6a'
  const roleLabels = {owner:'Owner',admin:'Admin',vip:'VIP',user:'',guest:'Guest'}
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',cursor:'pointer',background:hover?'#1c2d3a':'transparent',transition:'background 0.12s'}}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={e=>onProfile(u.liveData||u,e)}>
      <div style={{width:32,height:32,borderRadius:'50%',background:u.avatar_bg||'#1c2d3a',color:u.color||'#e8f4f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,position:'relative'}}>
        {u.nick[0]?.toUpperCase()}
        <div style={{position:'absolute',bottom:0,right:0,width:8,height:8,borderRadius:'50%',background:dotColor,border:'2px solid #0d1a22'}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:u.color||'#e8f4f0',display:'flex',alignItems:'center',gap:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {u.nick}
          {u.role==='owner'&&<span>👑</span>}{u.role==='admin'&&<span>🛡️</span>}{u.role==='vip'&&<span>⭐</span>}
          {(u.registered||u.password_hash)&&u.role==='user'&&<span style={{fontSize:10,color:'#00b4ff'}}>✔</span>}
        </div>
        <div style={{fontSize:10,color:'#3d5a6a',display:'flex',gap:5,marginTop:1}}>
          <span>📍 {u.area||'—'}</span>
          {roleLabels[u.role]&&<span style={{background:'#162330',padding:'1px 4px',borderRadius:3}}>{roleLabels[u.role]}</span>}
        </div>
      </div>
      {!isMe && hover && (
        <button style={{background:'rgba(0,180,255,0.1)',border:'1px solid #0090cc',color:'#00b4ff',borderRadius:5,padding:'4px 8px',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,fontFamily:"'Space Grotesk',sans-serif"}}
          onClick={e=>{e.stopPropagation();onDM(u.nick)}}>
          💬 DM
        </button>
      )}
      {isMe && <span style={{fontSize:10,color:'#3d5a6a',padding:'4px 6px'}}>You</span>}
    </div>
  )
}

// ─── POP BTN ──────────────────────────────────────────────────────────────────
function PopBtn({ color, onClick, children }) {
  const [h, setH] = useState(false)
  const colors = {
    electric: { bg:'rgba(0,180,255,0.1)', border:'#0090cc', text:'#00b4ff', hover:'#00b4ff', htext:'#000' },
    gold: { bg:'rgba(255,215,0,0.1)', border:'rgba(255,215,0,0.3)', text:'#ffd700', hover:'#ffd700', htext:'#000' },
    red: { bg:'rgba(255,77,109,0.1)', border:'rgba(255,77,109,0.3)', text:'#ff4d6d', hover:'#ff4d6d', htext:'#fff' },
    ghost: { bg:'none', border:'#1e3446', text:'#7a9aaa', hover:'#2a4a60', htext:'#e8f4f0' },
  }[color] || {}
  return (
    <button style={{padding:'7px 10px',borderRadius:6,border:`1px solid ${h?colors.hover:colors.border}`,background:h?colors.hover:colors.bg,color:h?colors.htext:colors.text,fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6,transition:'all 0.15s',width:'100%'}}
      onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
      {children}
    </button>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { background:'#070d12', color:'#e8f4f0', fontFamily:"'Space Grotesk',sans-serif", height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' },
  overlay: { position:'fixed', inset:0, background:'rgba(7,13,18,0.95)', backdropFilter:'blur(12px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modalBox: { background:'#111e28', border:'1px solid #2a4a60', borderRadius:16, padding:'32px 36px', width:400, maxWidth:'95vw', boxShadow:'0 0 60px rgba(0,229,160,0.06),0 20px 60px rgba(0,0,0,0.6)', position:'relative', overflow:'hidden' },
  modalTab: { flex:1, padding:8, border:'none', borderRadius:4, fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:500, cursor:'pointer', transition:'all 0.2s' },
  label: { display:'block', fontSize:11, fontWeight:600, color:'#7a9aaa', marginBottom:5, textTransform:'uppercase', letterSpacing:'1px' },
  input: { width:'100%', padding:'10px 12px', background:'#0d1a22', border:'1px solid #1e3446', borderRadius:6, color:'#e8f4f0', fontFamily:"'Space Grotesk',sans-serif", fontSize:13, outline:'none' },
  btnPrimary: { width:'100%', padding:13, background:'linear-gradient(135deg,#00b87d,#0090cc)', border:'none', borderRadius:6, color:'#000', fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:700, cursor:'pointer' },

  fifaHeader: { background:'#0d1a22', borderBottom:'1px solid #1e3446', padding:'0 12px', height:52, display:'flex', alignItems:'center', gap:10, flexShrink:0, position:'relative', overflow:'visible', zIndex:20 },
  fifaBadge: { display:'flex', alignItems:'center', gap:5, background:'#111e28', border:'1px solid #2a4a60', borderRadius:20, padding:'4px 10px', flexShrink:0, fontSize:15 },
  matchCard: { display:'flex', alignItems:'center', gap:7, background:'#111e28', border:'1px solid', borderRadius:20, padding:'5px 11px', whiteSpace:'nowrap', flexShrink:0, cursor:'pointer' },
  scoreBox: { background:'#162330', borderRadius:4, padding:'2px 7px', fontFamily:'monospace', fontSize:13, fontWeight:700 },
  fifaBtn: { background:'#111e28', border:'1px solid #1e3446', borderRadius:6, padding:'4px 9px', color:'#7a9aaa', fontFamily:"'Space Grotesk',sans-serif", fontSize:11, cursor:'pointer' },
  goalFlash: { position:'absolute', inset:0, background:'linear-gradient(90deg,transparent,rgba(255,215,0,0.15),transparent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'#ffd700', letterSpacing:4, animation:'goalFlash 2.5s ease forwards', pointerEvents:'none', zIndex:30 },
  standingsPanel: { position:'absolute', top:52, right:0, width:360, maxHeight:380, overflowY:'auto', background:'#111e28', border:'1px solid #2a4a60', borderRadius:'0 0 10px 10px', zIndex:50, boxShadow:'0 20px 40px rgba(0,0,0,0.5)' },

  layout: { flex:1, display:'flex', overflow:'hidden' },
  sidebar: { width:240, flexShrink:0, background:'#0d1a22', borderRight:'1px solid #1e3446', display:'flex', flexDirection:'column', overflow:'hidden' },
  sidebarMobileOpen: { position:'fixed', left:0, top:0, bottom:0, zIndex:100, animation:'slideRight 0.25s ease' },
  sidebarHeader: { padding:'12px 14px 8px', borderBottom:'1px solid #1e3446', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
  userItem: { padding:'6px 12px 6px 18px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'background 0.15s' },
  userAvatar: { width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 },
  statusMenu: { position:'absolute', bottom:'100%', left:0, right:0, background:'#111e28', border:'1px solid #2a4a60', borderRadius:6, padding:5, zIndex:200, boxShadow:'0 -10px 30px rgba(0,0,0,0.4)' },
  statusOption: { padding:'7px 10px', borderRadius:4, cursor:'pointer', fontSize:12, transition:'background 0.15s' },
  dirSectionLabel: { padding:'8px 12px 3px', fontSize:10, color:'#3d5a6a', fontWeight:700, textTransform:'uppercase', letterSpacing:'1.2px' },

  chatArea: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  chatHeader: { padding:'11px 14px', borderBottom:'1px solid #1e3446', display:'flex', alignItems:'center', gap:10, flexShrink:0, background:'#0d1a22' },
  hdrBtn: { background:'#111e28', border:'1px solid #1e3446', borderRadius:6, padding:'5px 9px', color:'#7a9aaa', fontFamily:"'Space Grotesk',sans-serif", fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 },
  dmTab: { display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:'6px 6px 0 0', cursor:'pointer', fontSize:12, whiteSpace:'nowrap', border:'1px solid transparent', borderBottom:'none', background:'#111e28', color:'#7a9aaa', transition:'all 0.2s' },
  dmTabActive: { color:'#e8f4f0', borderColor:'#1e3446' },
  msgRow: { display:'flex', gap:8, padding:'3px 5px', borderRadius:6, transition:'background 0.15s', alignItems:'flex-start' },
  msgAvatar: { width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, marginTop:1 },
  toolBtn: { background:'#111e28', border:'1px solid #1e3446', borderRadius:6, padding:'4px 8px', color:'#7a9aaa', fontFamily:"'Space Grotesk',sans-serif", fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 },
  emojiPanel: { position:'absolute', bottom:'100%', left:0, background:'#111e28', border:'1px solid #2a4a60', borderRadius:8, padding:10, zIndex:100, width:256, boxShadow:'0 -10px 30px rgba(0,0,0,0.4)' },
  msgInput: { flex:1, background:'#111e28', border:'1px solid #1e3446', borderRadius:6, padding:'9px 13px', color:'#e8f4f0', fontFamily:"'Space Grotesk',sans-serif", fontSize:13, outline:'none', minHeight:42, maxHeight:120, lineHeight:1.5 },
  sendBtn: { background:'linear-gradient(135deg,#00b87d,#0090cc)', border:'none', borderRadius:6, width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 },
  popover: { position:'fixed', zIndex:300, background:'#111e28', border:'1px solid #2a4a60', borderRadius:10, width:260, boxShadow:'0 20px 40px rgba(0,0,0,0.6)' },
  toast: { position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', background:'#162330', border:'1px solid #2a4a60', borderRadius:20, padding:'8px 18px', fontSize:12, zIndex:400, whiteSpace:'nowrap' },
}
