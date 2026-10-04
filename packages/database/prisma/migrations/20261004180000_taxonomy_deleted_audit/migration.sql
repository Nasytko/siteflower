-- Soft-extend audit enum for catalog category / flower-ref deletes & reassignments.
ALTER TYPE "AuditAction" ADD VALUE 'TAXONOMY_DELETED';
