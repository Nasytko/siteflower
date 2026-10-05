-- ProductComponent XOR: exactly one of flower_item_id / flower_id must be set.
-- Additive only. Fails safely if existing rows violate the invariant.

DO $$
DECLARE
  invalid_count INTEGER;
  sample_ids TEXT;
BEGIN
  SELECT COUNT(*)::INTEGER INTO invalid_count
  FROM "product_components"
  WHERE
    ("flower_item_id" IS NULL AND "flower_id" IS NULL)
    OR ("flower_item_id" IS NOT NULL AND "flower_id" IS NOT NULL);

  IF invalid_count > 0 THEN
    SELECT string_agg(id::text, ', ' ORDER BY id)
    INTO sample_ids
    FROM (
      SELECT id
      FROM "product_components"
      WHERE
        ("flower_item_id" IS NULL AND "flower_id" IS NULL)
        OR ("flower_item_id" IS NOT NULL AND "flower_id" IS NOT NULL)
      ORDER BY id
      LIMIT 20
    ) bad;

    RAISE EXCEPTION
      'product_components XOR violation: % invalid row(s). Sample ids: %. Fix data before applying product_components_flower_ref_xor. Query: SELECT id, flower_item_id, flower_id FROM product_components WHERE (flower_item_id IS NULL AND flower_id IS NULL) OR (flower_item_id IS NOT NULL AND flower_id IS NOT NULL);',
      invalid_count,
      COALESCE(sample_ids, '(none)');
  END IF;
END $$;

ALTER TABLE "product_components"
  ADD CONSTRAINT "product_components_flower_ref_xor"
  CHECK (
    ("flower_item_id" IS NOT NULL AND "flower_id" IS NULL)
    OR ("flower_item_id" IS NULL AND "flower_id" IS NOT NULL)
  );
