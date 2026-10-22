-- Non-destructive: adds audit actions for restore and hard-delete.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_DELETED';
