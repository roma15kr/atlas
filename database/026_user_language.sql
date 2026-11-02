-- Each person's interface language (localization «Interface languages»): Ukrainian by default, Russian or English.
ALTER TABLE users ADD COLUMN language text NOT NULL DEFAULT 'uk' CHECK (language IN ('uk', 'ru', 'en'));
