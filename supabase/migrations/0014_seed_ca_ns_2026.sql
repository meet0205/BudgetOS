-- 0014_seed_ca_ns_2026.sql
-- Feature 05 — 2026 tax reference data for Canada (federal) and Nova Scotia,
-- populated from official sources (NOT from memory) and stamped with verified_on.
-- Mirrors packages/core/src/tax/seed-ca-2026.ts. Re-verify against CRA before
-- relying on these; the UI surfaces verified_on and prompts when it goes stale.
--
-- Sources (verified 2026-07-24):
--   Federal brackets & BPA — CRA current-year rates
--   Nova Scotia brackets & BPA — Government of Nova Scotia
--   CPP / CPP2 — CRA contribution rates & maximums
--   EI — CRA premium rates & maximums

insert into tax_jurisdictions (country, province, tax_year, brackets, basic_personal_amount_minor, low_income_reduction, source_url, verified_on) values
('CA', null, 2026,
 '[{"upto_minor":5852300,"rate":0.14},{"upto_minor":11704500,"rate":0.205},{"upto_minor":18144000,"rate":0.26},{"upto_minor":25848200,"rate":0.29},{"upto_minor":null,"rate":0.33}]'::jsonb,
 1645200, null,
 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html', '2026-07-24'),
('CA', 'NS', 2026,
 '[{"upto_minor":3099500,"rate":0.0879},{"upto_minor":6199100,"rate":0.1495},{"upto_minor":9741700,"rate":0.1667},{"upto_minor":15712400,"rate":0.175},{"upto_minor":null,"rate":0.21}]'::jsonb,
 1193200, null,
 'https://www.novascotia.ca/personal-income-tax-rates-and-indexation', '2026-07-24');

insert into contribution_rules (tax_year, kind, rate, max_pensionable_minor, exemption_minor, self_employed_multiplier, source_url, verified_on) values
(2026, 'cpp',  0.05950, 7460000, 350000,  2.0, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html', '2026-07-24'),
(2026, 'cpp2', 0.04000, 8500000, 7460000, 2.0, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html', '2026-07-24'),
(2026, 'ei',   0.01630, 6890000, 0,       1.0, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html', '2026-07-24');
