UPDATE deals
SET currency = 'UAH'
WHERE currency <> 'UAH';

ALTER TABLE deals
  ALTER COLUMN currency SET DEFAULT 'UAH';

ALTER TABLE deals
  ADD CONSTRAINT deals_currency_uah_check CHECK (currency = 'UAH');

UPDATE kpis
SET unit = 'UAH'
WHERE upper(btrim(unit)) IN ('RUB', 'USD', 'EUR');
