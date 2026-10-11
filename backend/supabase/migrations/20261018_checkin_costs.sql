-- AI-written check-ins (Pip's morning plan and session recap) get their own cost line
ALTER TABLE llm_usage DROP CONSTRAINT IF EXISTS llm_usage_feature_check;
ALTER TABLE llm_usage ADD CONSTRAINT llm_usage_feature_check CHECK (feature IN ('chat', 'analysis', 'notes', 'checkin'));
