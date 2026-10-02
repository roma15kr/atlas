-- Self-service profile details and an uploaded profile photo.
ALTER TABLE users
  ADD COLUMN birth_date date CHECK (birth_date >= DATE '1900-01-01'),
  ADD COLUMN phone text CHECK (char_length(phone) <= 40),
  ADD COLUMN contact_email text CHECK (char_length(contact_email) <= 254),
  ADD COLUMN city text CHECK (char_length(city) <= 120),
  ADD COLUMN about text CHECK (char_length(about) <= 500),
  ADD COLUMN show_birthday boolean NOT NULL DEFAULT true,
  -- avatar_url (from 001) is kept as /api/v1/avatars/<avatar_id>; the id changes with every upload.
  ADD COLUMN avatar_id uuid UNIQUE,
  ADD COLUMN avatar_key text,
  ADD COLUMN avatar_mime text CHECK (avatar_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT users_avatar_complete CHECK ((avatar_id IS NULL) = (avatar_key IS NULL) AND (avatar_id IS NULL) = (avatar_mime IS NULL));
