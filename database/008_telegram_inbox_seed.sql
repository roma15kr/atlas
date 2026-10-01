-- Demo Telegram contacts: bound, unassigned, unverified and blocked. Applied only with SEED_DEMO_DATA.
DO $$
DECLARE
  company uuid;
  employee uuid;
  alex uuid;
  sofia record;
  noah uuid;
  bound uuid;
  stranger uuid;
BEGIN
  SELECT company_id, id INTO company, employee FROM users WHERE username = 'employee' LIMIT 1;
  IF company IS NULL THEN RETURN; END IF;
  SELECT id INTO alex FROM users WHERE company_id = company AND username = 'alex';
  SELECT c.id, (SELECT d.id FROM deals d WHERE d.client_id = c.id LIMIT 1) AS deal_id INTO sofia FROM clients c WHERE c.company_id = company AND c.email = 'sofia@northstar.example';
  SELECT id INTO noah FROM clients WHERE company_id = company AND email = 'noah@vertex.example';
  INSERT INTO telegram_settings (company_id, bot_username) VALUES (company, 'atlas_demo_bot') ON CONFLICT DO NOTHING;

  INSERT INTO telegram_contacts (company_id, telegram_user_id, username, first_name, last_name, client_id, responsible_id, status, bound_via, greeted_at, last_message_at)
  VALUES (company, 100000001, 'sofia_turner', 'Sofia', 'Turner', sofia.id, employee, 'ACTIVE', 'INVITE', now() - interval '3 days', now() - interval '40 minutes')
  RETURNING id INTO bound;
  INSERT INTO telegram_messages (contact_id, direction, telegram_message_id, text, status, sent_by, created_at) VALUES
    (bound, 'IN', 11, 'Добрый день! Когда сможете прислать счёт на 40 мест?', 'RECEIVED', NULL, now() - interval '2 hours'),
    (bound, 'OUT', 12, 'Здравствуйте, София! Счёт пришлю сегодня до 17:00.', 'SENT', employee, now() - interval '90 minutes'),
    (bound, 'IN', 13, 'Отлично, спасибо!', 'RECEIVED', NULL, now() - interval '40 minutes');
  IF sofia.deal_id IS NOT NULL THEN INSERT INTO telegram_deal_links (contact_id, deal_id, linked_by) VALUES (bound, sofia.deal_id, employee); END IF;

  INSERT INTO telegram_contacts (company_id, telegram_user_id, username, first_name, status, greeted_at, last_message_at)
  VALUES (company, 100000002, 'olena_shop', 'Олена', 'ACTIVE', now() - interval '20 minutes', now() - interval '20 minutes')
  RETURNING id INTO stranger;
  INSERT INTO telegram_messages (contact_id, direction, telegram_message_id, text, status, created_at)
  VALUES (stranger, 'IN', 21, 'Здравствуйте, сколько стоит доставка в Днепр?', 'RECEIVED', now() - interval '20 minutes');

  INSERT INTO telegram_contacts (company_id, telegram_user_id, first_name, client_id, responsible_id, status, bound_via)
  VALUES (company, 100000003, 'Noah', noah, alex, 'UNVERIFIED', 'IMPORT');
  INSERT INTO telegram_contacts (company_id, telegram_user_id, username, first_name, responsible_id, status, bound_via, last_message_at)
  VALUES (company, 100000004, 'ex_customer', 'Игорь', employee, 'BLOCKED', 'TRIAGE', now() - interval '10 days');
END $$;
