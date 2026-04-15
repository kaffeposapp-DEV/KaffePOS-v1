create or replace function public.check_feature_access(p_feature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan text := 'secangkir';
  v_expiry timestamptz;
  v_has_pro boolean := false;
  v_allowed boolean := false;
  v_reason text := 'Upgrade paket untuk membuka fitur ini.';
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'allowed', false,
      'plan', 'guest',
      'reason', 'Silakan login terlebih dahulu.'
    );
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'plan', 'secangkir',
      'reason', 'Profil tidak ditemukan.'
    );
  end if;

  v_has_pro := v_profile.tier = 'pro' or coalesce(v_profile.is_pro, false);
  v_plan := coalesce(nullif(v_profile.pro_plan, ''), case when v_has_pro then 'founder' else 'secangkir' end);
  v_expiry := coalesce(v_profile.pro_expires_at, v_profile.tier_expires_at);

  if v_has_pro and v_expiry is not null and v_expiry <= now() then
    v_has_pro := false;
    v_plan := 'secangkir';
    v_reason := 'Langganan kamu sudah berakhir. Silakan perpanjang.';
  end if;

  case p_feature
    when 'report_export_pdf' then
      v_allowed := v_has_pro and v_plan in ('kopi_susu', 'signature', 'founder');
      if not v_allowed then
        v_reason := 'Export PDF tersedia mulai paket Kopi Susu.';
      end if;
    when 'report_share_whatsapp' then
      v_allowed := v_has_pro and v_plan in ('kopi_susu', 'signature', 'founder');
      if not v_allowed then
        v_reason := 'Bagikan laporan ke WhatsApp tersedia mulai paket Kopi Susu.';
      end if;
    when 'receipt_share_whatsapp' then
      v_allowed := v_has_pro and v_plan in ('kopi_susu', 'signature', 'founder');
      if not v_allowed then
        v_reason := 'Kirim struk PDF via WhatsApp tersedia mulai paket Kopi Susu.';
      end if;
    when 'ai_insight' then
      v_allowed := v_has_pro and v_plan in ('signature', 'founder');
      if not v_allowed then
        v_reason := 'AI Insight tersedia mulai paket Signature.';
      end if;
    when 'thermal_printer' then
      v_allowed := v_has_pro and v_plan in ('signature', 'founder');
      if not v_allowed then
        v_reason := 'Thermal printer Bluetooth & USB tersedia mulai paket Signature.';
      end if;
    when 'browser_print' then
      v_allowed := v_has_pro and v_plan in ('kopi_susu', 'signature', 'founder');
      if not v_allowed then
        v_reason := 'Cetak browser/WiFi tersedia mulai paket Kopi Susu.';
      end if;
    else
      v_allowed := false;
      v_reason := 'Fitur tidak dikenali.';
  end case;

  return jsonb_build_object(
    'allowed', v_allowed,
    'plan', v_plan,
    'reason', v_reason,
    'expires_at', v_expiry
  );
end;
$$;
grant execute on function public.check_feature_access(text) to authenticated;
