-- 0001_extensions.sql
-- Feature 01 — Data foundation.
-- pg_trgm powers fuzzy merchant/category matching used by later features (09, 12).

create extension if not exists pg_trgm;
