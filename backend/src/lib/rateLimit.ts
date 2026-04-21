export async function enforceRateLimit(
  client: any,
  key: string,
  ip: string,
  maxHits: number,
  windowMinutes: number,
  now = new Date(),
  limitMessage = 'Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.',
) {
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();

  const { data: existing, error: fetchError } = await client
    .from('edge_rate_limits')
    .select('id,hits')
    .eq('rate_key', key)
    .gte('window_started_at', windowStart)
    .order('window_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!existing) {
    const { error } = await client.from('edge_rate_limits').insert({
      rate_key: key,
      hits: 1,
      last_ip: ip,
      window_started_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    if (error) throw error;
    return;
  }

  if ((existing.hits ?? 0) >= maxHits) {
    throw new Error(limitMessage);
  }

  const { error } = await client
    .from('edge_rate_limits')
    .update({
      hits: (existing.hits ?? 0) + 1,
      last_ip: ip,
      updated_at: now.toISOString(),
    })
    .eq('id', existing.id);

  if (error) throw error;
}
