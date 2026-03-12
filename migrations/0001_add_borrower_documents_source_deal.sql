ALTER TABLE borrower_documents ADD COLUMN IF NOT EXISTS source_deal_id INTEGER;
ALTER TABLE borrower_documents ADD COLUMN IF NOT EXISTS source_deal_name VARCHAR(500);
