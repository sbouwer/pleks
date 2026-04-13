-- Migration 012: Rent receipt path on payments (BUILD_51)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_path text;
