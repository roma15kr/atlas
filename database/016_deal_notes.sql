-- Formatted (Markdown) notes on a deal; visible and editable with the same access as the deal.
ALTER TABLE deals ADD COLUMN notes text CHECK (notes IS NULL OR char_length(notes) <= 10000);
