-- A channel's icon from the built-in library, as `<icon>:<colour>` (team-chat «Channel icon»); null shows «#».
ALTER TABLE chat_conversations ADD COLUMN icon text CHECK (icon IS NULL OR char_length(icon) <= 40);
