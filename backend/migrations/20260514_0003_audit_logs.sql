-- Audit Logs Table
-- Tracks all sensitive operations for security and compliance

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created 
ON audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
ON audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource 
ON audit_logs(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
ON audit_logs(created_at DESC);

-- Partition by month for better performance (optional, for high-volume systems)
-- CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
-- FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

COMMENT ON TABLE audit_logs IS 'Audit trail for security-sensitive operations';
COMMENT ON COLUMN audit_logs.ip_hash IS 'SHA-256 hash of IP address for privacy';
COMMENT ON COLUMN audit_logs.details IS 'Additional context, sensitive fields redacted';
