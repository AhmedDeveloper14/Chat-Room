# 🚀 KARACHI LOUNGE — DEPLOY GUIDE
## Supabase (backend) + Vercel (frontend) = Live Chatroom in ~15 minutes

---

## STEP 1 — Supabase Account & Database Setup (FREE)

1. **supabase.com** pe jao → "Start your project" → GitHub se signup karo
2. "New Project" click karo:
   - Name: `karachi-lounge`
   - Database Password: koi strong password rakh lo (save kar lo)
   - Region: **Singapore** (Pakistan ke sabse nazdeek)
3. Project create hone ka wait karo (~2 min)

### Database Tables banana:
4. Left sidebar mein **"SQL Editor"** click karo
5. **"New Query"** click karo
6. `supabase-schema.sql` file kholo, saara content copy karo, paste karo, **"Run"** dabao
7. Green ✓ aaye toh tables ban gayi

### Realtime enable karo:
8. Left sidebar → **"Database"** → **"Replication"**
9. In tables ke samne toggle ON karo:
   - `kl_messages`
   - `kl_presence`
   - `kl_dms`

### API Keys copy karo:
10. Left sidebar → **"Settings"** → **"API"**
11. Yeh do cheezein copy kar lo (baad mein kaam aayegi):
    - **Project URL** → `https://xxxxx.supabase.co`
    - **anon / public** key → lamba string hai

---

## STEP 2 — Code GitHub pe Upload karo

1. **github.com** pe jao → New Repository → name: `karachi-lounge` → Public → Create
2. Apne computer pe terminal kholo jahan project folder hai:

```bash
cd karachi-lounge
git init
git add .
git commit -m "Karachi Lounge v1 🚀"
git remote add origin https://github.com/TUMHARA_USERNAME/karachi-lounge.git
git push -u origin main
```

---

## STEP 3 — Vercel pe Deploy karo (FREE)

1. **vercel.com** pe jao → GitHub se login karo
2. **"New Project"** → `karachi-lounge` repo select karo → **"Import"**
3. Framework: **Next.js** (auto detect hoga)
4. **"Environment Variables"** section mein yeh add karo:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

5. **"Deploy"** dabao → 2-3 minutes mein live ho jayega!
6. Tumhara URL milega: `karachi-lounge-xxx.vercel.app`

---

## STEP 4 — Custom Domain (Optional, ~$10/year)

1. `karachilounge.com` ya `karachilounge.pk` kharido (Namecheap/GoDaddy)
2. Vercel → Project → Settings → Domains → Add domain
3. DNS records Vercel batayega, woh copy karo domain registrar mein

---

## STEP 5 — Owner Account Setup

Owner account pehle se SQL mein seed kiya gaya hai:
- **Nick:** `KLOwner`
- **Password:** `owner786`

**Login ke baad password zaroor change karo!**

---

## 📊 Free Tier Capacity (Supabase + Vercel)

| Resource | Free Limit | 200-300 users ke liye |
|----------|------------|----------------------|
| Supabase DB | 500 MB | ✅ Enough |
| Realtime connections | 200 concurrent | ✅ Perfect |
| Bandwidth | 2 GB/month | ✅ OK for start |
| Vercel requests | Unlimited | ✅ No limit |
| Vercel bandwidth | 100 GB/month | ✅ More than enough |

**Result:** 200-300 users ke saath bilkul kaam karega FREE mein!

Agar 1000+ users ho jaayen:
- Supabase Pro: $25/month
- Vercel Pro: $20/month

---

## 🔧 Local Development (Test karne ke liye)

```bash
# .env.local file banao
cp .env.example .env.local
# Supabase keys fill karo .env.local mein

# Dependencies install karo
npm install

# Local server start karo
npm run dev

# Browser mein kholo: http://localhost:3000
```

---

## ❓ Common Issues

**"Missing Supabase env variables" error:**
→ Vercel mein environment variables sahi add karo, redeploy karo

**Messages show nahi ho rahe:**
→ Supabase SQL Editor mein Realtime tables wali commands chalao (schema.sql mein hain)

**User kicked nahi ho raha:**
→ Supabase → Auth → Policies check karo, sab "Allow all" hona chahiye for now

---

## 🏗️ Production Hardening (Baad mein)

- [ ] Passwords bcrypt se hash karo (currently plain text)
- [ ] Rate limiting add karo API routes mein
- [ ] Message history pagination (currently last 80)
- [ ] Image upload support (Supabase Storage)
- [ ] Email verification for registration
- [ ] Supabase Row Level Security tighten karo
