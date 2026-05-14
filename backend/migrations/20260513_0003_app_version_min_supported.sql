update public.app_versions
set
  min_supported_web_version = case
    when min_supported_web_version = '0.0.0' then '2.0.0'
    else min_supported_web_version
  end,
  min_supported_apk_version = case
    when min_supported_apk_version = '0.0.0' then '2.0.0'
    else min_supported_apk_version
  end,
  metadata = metadata || '{"minSupportedFinalized": true}'::jsonb
where version = '2.0.0';
