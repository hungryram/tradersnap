-- Feedback and bug reports sent from the form on the marketing site (tradewithpip.ai/feedback).
-- Written by the API with the service role; users can't read it.
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'other')),
  message TEXT NOT NULL,
  -- Optional: only if they want a reply
  email TEXT,
  -- Where they came from (the extension menu, the contact page) and the extension version, when known
  source TEXT,
  extension_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
