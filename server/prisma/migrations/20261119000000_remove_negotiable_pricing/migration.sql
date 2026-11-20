ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "listings_contact_price_not_negotiable_check";
ALTER TABLE "listings" DROP COLUMN IF EXISTS "is_negotiable";
