-- One free chart analysis and one free "send with chart" question while getting started
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_analysis_used BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_chart_chat_used BOOLEAN NOT NULL DEFAULT false;
