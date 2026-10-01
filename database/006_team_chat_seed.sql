-- Demo chat: a sales channel, a group, a DM and a few messages. Applied only with SEED_DEMO_DATA.
DO $$
DECLARE
  company uuid;
  director uuid;
  manager uuid;
  employee uuid;
  alex uuid;
  general uuid;
  sales uuid;
  grp uuid;
  dm uuid;
  root uuid;
BEGIN
  SELECT u.company_id, u.id INTO company, director FROM users u WHERE u.username = 'director' LIMIT 1;
  IF company IS NULL THEN RETURN; END IF;
  SELECT id INTO manager FROM users WHERE company_id = company AND username = 'manager';
  SELECT id INTO employee FROM users WHERE company_id = company AND username = 'employee';
  SELECT id INTO alex FROM users WHERE company_id = company AND username = 'alex';
  general := chat_default_channel(company);

  INSERT INTO chat_conversations (company_id, kind, name, description, visibility, created_by)
  VALUES (company, 'CHANNEL', 'Продажи', 'Сделки, клиенты и планы отдела продаж', 'PRIVATE', manager)
  RETURNING id INTO sales;
  INSERT INTO chat_members (conversation_id, user_id, role) VALUES
    (sales, manager, 'ADMIN'), (sales, employee, 'MEMBER'), (sales, alex, 'MEMBER');

  INSERT INTO chat_conversations (company_id, kind, name, created_by)
  VALUES (company, 'GROUP', 'Демо для «Северного ветра»', employee) RETURNING id INTO grp;
  INSERT INTO chat_members (conversation_id, user_id) VALUES (grp, employee), (grp, alex), (grp, manager);

  INSERT INTO chat_conversations (company_id, kind, dm_key, created_by)
  VALUES (company, 'DM', CASE WHEN director < employee THEN director || ':' || employee ELSE employee || ':' || director END, director)
  RETURNING id INTO dm;
  INSERT INTO chat_members (conversation_id, user_id) VALUES (dm, director), (dm, employee);

  INSERT INTO chat_messages (conversation_id, author_id, body, created_at) VALUES
    (general, director, 'Коллеги, в пятницу в 16:00 общая встреча по итогам квартала.', now() - interval '2 days');
  INSERT INTO chat_messages (conversation_id, author_id, body, created_at, reply_count, last_reply_at)
  VALUES (sales, manager, '@employee, пришли, пожалуйста, обновлённый прайс для партнёров.', now() - interval '3 hours', 1, now() - interval '2 hours')
  RETURNING id INTO root;
  INSERT INTO chat_mentions (message_id, user_id) VALUES (root, employee);
  INSERT INTO chat_messages (conversation_id, author_id, parent_id, body, created_at)
  VALUES (sales, employee, root, 'Готовлю, будет к вечеру.', now() - interval '2 hours');
  INSERT INTO chat_messages (conversation_id, author_id, body, created_at) VALUES
    (grp, alex, 'Сценарий демо готов, посмотрите до четверга.', now() - interval '1 hour'),
    (dm, director, 'Анна, как прошла встреча с клиентом?', now() - interval '30 minutes');

  UPDATE chat_conversations c SET last_message_at = (SELECT max(created_at) FROM chat_messages m WHERE m.conversation_id = c.id)
  WHERE c.company_id = company;
  -- Members start with everything before the seed read, so the demo shows some unread messages.
  UPDATE chat_members SET last_read_at = now() - interval '7 days' WHERE conversation_id IN (general, sales, grp, dm);
  UPDATE chat_members SET last_read_at = now() WHERE user_id = director AND conversation_id = dm;
END $$;
