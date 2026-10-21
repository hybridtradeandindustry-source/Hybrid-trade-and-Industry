-- Scope AI conversation history by factory so switching the top-navbar
-- scope (Block Factory / Plastic Recycling / Combined) does not leak chat
-- history or context between businesses. NULL factory_id = combined/legacy
-- conversations (rows created before this column existed).

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS factory_id uuid
  REFERENCES factories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_factory
  ON ai_conversations(organization_id, user_id, factory_id, updated_at DESC);
