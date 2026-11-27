-- The product is now called Quorfield: a company that never renamed the app gets the new standard name.
ALTER TABLE company_branding ALTER COLUMN app_name SET DEFAULT 'Quorfield';
UPDATE company_branding SET app_name = 'Quorfield' WHERE app_name = 'Atlas';
