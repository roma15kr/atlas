-- Demo mailbox for the demo employee: folders and two threads, one linked to a client.
-- Applied only with SEED_DEMO_DATA. The secret is a marker the sync scheduler skips.
DO $$
DECLARE
  owner record;
  account uuid;
  inbox uuid;
  sent uuid;
  client record;
  linked uuid;
  newsletter uuid;
  first_message uuid;
BEGIN
  SELECT id, company_id INTO owner FROM users WHERE username = 'employee' LIMIT 1;
  IF owner.id IS NULL THEN RETURN; END IF;
  SELECT id, email, deal.deal_id INTO client FROM clients
    LEFT JOIN LATERAL (SELECT d.id AS deal_id FROM deals d WHERE d.client_id = clients.id LIMIT 1) deal ON true
    WHERE company_id = owner.company_id AND email = 'sofia@northstar.example' LIMIT 1;

  INSERT INTO mail_accounts (company_id, user_id, provider, email, display_name, imap_host, imap_port, imap_security,
                             smtp_host, smtp_port, smtp_security, username, secret, signature, last_synced_at)
  VALUES (owner.company_id, owner.id, 'IMAP', 'anna@atlas.example', 'Anna Petrova', 'imap.atlas.example', 993, 'SSL',
          'smtp.atlas.example', 465, 'SSL', 'anna@atlas.example', '{"demo": true}', E'--\nAnna Petrova\nAtlas Demo Company', now())
  RETURNING id INTO account;

  INSERT INTO mail_folders (account_id, path, name, special_use, total, unread) VALUES
    (account, 'INBOX', 'Входящие', 'INBOX', 2, 1),
    (account, 'Sent', 'Отправленные', 'SENT', 1, 0),
    (account, 'Drafts', 'Черновики', 'DRAFTS', 0, 0),
    (account, 'Archive', 'Архив', 'ARCHIVE', 0, 0),
    (account, 'Junk', 'Спам', 'JUNK', 0, 0),
    (account, 'Trash', 'Корзина', 'TRASH', 0, 0);
  SELECT id INTO inbox FROM mail_folders WHERE account_id = account AND special_use = 'INBOX';
  SELECT id INTO sent FROM mail_folders WHERE account_id = account AND special_use = 'SENT';

  INSERT INTO mail_threads (company_id, user_id, account_id, mailbox_email, subject, subject_key, participants, last_message_at,
                            message_count, unread_count, client_id, deal_id, link_source)
  VALUES (owner.company_id, owner.id, account, 'anna@atlas.example', 'Расширение лицензий', 'расширение лицензий',
          ARRAY['sofia@northstar.example'], now() - interval '2 hours', 2, 1, client.id, client.deal_id, CASE WHEN client.id IS NULL THEN NULL ELSE 'AUTO' END)
  RETURNING id INTO linked;
  INSERT INTO mail_messages (thread_id, account_id, folder_id, uid, message_id_header, from_address, from_name, to_addresses,
                             subject, snippet, text_body, html_body, sent_at, seen)
  VALUES (linked, account, sent, 1, '<demo-1@atlas.example>', 'anna@atlas.example', 'Anna Petrova',
          '[{"address": "sofia@northstar.example", "name": "Sofia Turner"}]', 'Расширение лицензий',
          'София, добрый день! Отправляю предложение по расширению на 40 мест.',
          E'София, добрый день!\n\nОтправляю предложение по расширению на 40 мест.\n\nАнна',
          '<p>София, добрый день!</p><p>Отправляю предложение по расширению на <b>40 мест</b>.</p><p>Анна</p>', now() - interval '1 day', true)
  RETURNING id INTO first_message;
  INSERT INTO mail_messages (thread_id, account_id, folder_id, uid, message_id_header, in_reply_to, reference_ids, from_address, from_name,
                             to_addresses, subject, snippet, text_body, html_body, sent_at, seen)
  VALUES (linked, account, inbox, 1, '<demo-2@northstar.example>', '<demo-1@atlas.example>', ARRAY['<demo-1@atlas.example>'],
          'sofia@northstar.example', 'Sofia Turner', '[{"address": "anna@atlas.example", "name": "Anna Petrova"}]',
          'Re: Расширение лицензий', 'Спасибо! Согласуем с финансовым отделом до пятницы.',
          E'Спасибо! Согласуем с финансовым отделом до пятницы.\n\nСофия',
          '<p>Спасибо! Согласуем с финансовым отделом до пятницы.</p><p>София</p>', now() - interval '2 hours', false);

  INSERT INTO mail_threads (company_id, user_id, account_id, mailbox_email, subject, subject_key, participants, last_message_at, message_count, unread_count)
  VALUES (owner.company_id, owner.id, account, 'anna@atlas.example', 'Итоги вебинара', 'итоги вебинара', ARRAY['events@example.com'], now() - interval '1 day', 1, 0)
  RETURNING id INTO newsletter;
  INSERT INTO mail_messages (thread_id, account_id, folder_id, uid, message_id_header, from_address, from_name, to_addresses,
                             subject, snippet, text_body, html_body, has_remote_images, sent_at, seen)
  VALUES (newsletter, account, inbox, 2, '<demo-3@example.com>', 'events@example.com', 'Events', '[{"address": "anna@atlas.example"}]',
          'Итоги вебинара', 'Запись вебинара и презентация доступны по ссылке.', 'Запись вебинара и презентация доступны по ссылке.',
          '<p>Запись вебинара и презентация доступны по ссылке.</p><img data-remote-src="https://example.com/pixel.gif" alt="">', true,
          now() - interval '1 day', true);
END $$;
