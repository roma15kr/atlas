-- Deleted chat messages are erased (team-chat «Editing and deleting messages»). Clean up deletions made before:
-- deleted replies and deleted messages without replies go; a deleted message with replies stays as an anchor
-- without reactions. Older notifications point at conversations, not messages, and expire on their own.
DELETE FROM chat_messages WHERE deleted_at IS NOT NULL AND parent_id IS NOT NULL;

DELETE FROM chat_messages x
WHERE x.deleted_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chat_messages r WHERE r.parent_id = x.id);

DELETE FROM chat_message_reactions rx USING chat_messages x WHERE x.id = rx.message_id AND x.deleted_at IS NOT NULL;

UPDATE chat_messages p SET reply_count = r.replies, last_reply_at = r.last
FROM (SELECT parent_id, count(*)::int AS replies, max(created_at) AS last FROM chat_messages WHERE parent_id IS NOT NULL GROUP BY parent_id) r
WHERE p.id = r.parent_id AND (p.reply_count <> r.replies OR p.last_reply_at IS DISTINCT FROM r.last);

UPDATE chat_messages p SET reply_count = 0, last_reply_at = NULL
WHERE p.parent_id IS NULL AND p.reply_count > 0 AND NOT EXISTS (SELECT 1 FROM chat_messages r WHERE r.parent_id = p.id);
