-- Who uninstalled: the extension's uninstall link carries a signed code for the signed-in account
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
ALTER TABLE uninstall_feedback ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
