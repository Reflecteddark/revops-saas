-- PostgreSQL 16 Multi-Tenant RLS Initialization for RevOps Enterprise OS SaaS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row-Level Security helper function
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    tier VARCHAR(50) DEFAULT 'Pro' NOT NULL,
    max_seats INT DEFAULT 15 NOT NULL,
    ai_minutes_quota INT DEFAULT 2000 NOT NULL,
    ai_minutes_used INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    telegram_chat_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, email)
);

-- 3. Deals Table with RLS
CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    budget NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    stage VARCHAR(100) NOT NULL,
    days_in_stage INT DEFAULT 0 NOT NULL,
    stage_sla_days INT DEFAULT 3 NOT NULL,
    has_next_step BOOLEAN DEFAULT TRUE NOT NULL,
    is_at_risk BOOLEAN DEFAULT FALSE NOT NULL,
    risk_reason VARCHAR(255),
    avg_call_score NUMERIC(5, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on deals
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_deals ON deals
    FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
