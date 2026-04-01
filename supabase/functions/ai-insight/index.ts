// supabase/functions/ai-insight/index.ts
// Edge Function: Proxy Gemini API — API key aman di server, tidak expose ke APK
// Deploy: supabase functions deploy ai-insight
// Secret: supabase secrets set GEMINI_API_KEY=AIza...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY  = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_URL  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_KEY}`
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON    = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── 1. Validasi user sudah login ─────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: login diperlukan.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Sesi tidak valid. Silakan login ulang.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Cek tier user (PRO atau Freemium) ────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, tier')
      .eq('id', user.id)
      .single()

    const isPro = profile?.is_pro === true || profile?.tier === 'pro'

    // ── 3. Rate limit berbeda berdasarkan tier ───────────────────
    // PRO    → 20x per hari
    // Freemium → 1x per bulan
    const now = new Date()
    let countQuery = supabase
      .from('ai_insight_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    let limitMax: number
    let limitLabel: string

    if (isPro) {
      // PRO: hitung per hari
      const today = now.toISOString().split('T')[0]
      countQuery = countQuery.gte('created_at', `${today}T00:00:00.000Z`)
      limitMax   = 20
      limitLabel = '20× per hari'
    } else {
      // Freemium: hitung per bulan
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      countQuery = countQuery.gte('created_at', startOfMonth)
      limitMax   = 1
      limitLabel = '1× per bulan'
    }

    const { count } = await countQuery

    if ((count ?? 0) >= limitMax) {
      const resetMsg = isPro
        ? 'Coba lagi besok.'
        : 'Kuota bulanan habis. Upgrade ke PRO untuk 20× analisis per hari!'
      return new Response(
        JSON.stringify({
          error: `Batas analisis AI tercapai (${limitLabel}). ${resetMsg}`
        }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Ambil prompt dari request body ────────────────────────
    const body = await req.json() as { prompt?: string }
    if (!body.prompt || typeof body.prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Parameter prompt diperlukan.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Batasi panjang prompt agar tidak abuse
    const prompt = body.prompt.slice(0, 4000)

    // ── 5. Panggil Gemini ────────────────────────────────────────
    const geminiRes = await fetch(GEMINI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.4,
          maxOutputTokens:  600,
          responseMimeType: 'application/json',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    })

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({})) as { error?: { message?: string } }
      const errMsg  = errData?.error?.message ?? `Gemini error ${geminiRes.status}`
      console.error('[ai-insight] Gemini error:', errMsg)
      return new Response(
        JSON.stringify({ error: `Gemini: ${errMsg}` }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

    let result: unknown
    try {
      result = JSON.parse(text)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Respons AI tidak valid. Coba lagi.' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── 6. Log request untuk rate limiting ───────────────────────
    await supabase.from('ai_insight_logs').insert({
      user_id:    user.id,
      created_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai-insight] Unhandled error:', msg)
    return new Response(
      JSON.stringify({ error: `Server error: ${msg}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
