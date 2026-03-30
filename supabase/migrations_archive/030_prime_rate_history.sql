-- 030_prime_rate_history.sql — Seed historical SA prime rates (SARB MPC decisions)

-- Remove the placeholder seed first
DELETE FROM prime_rates WHERE notes = 'Seed rate — update with actual effective date';

-- Insert full history (newest first for readability, order doesn't matter for queries)
INSERT INTO prime_rates (rate_percent, effective_date, notes) VALUES
  (10.25, '2025-11-21', 'MPC Nov 2025'),
  (10.50, '2025-08-01', 'MPC Aug 2025'),
  (10.75, '2025-05-30', 'MPC May 2025'),
  (11.00, '2025-01-31', 'MPC Jan 2025'),
  (11.25, '2024-11-22', 'MPC Nov 2024'),
  (11.50, '2024-09-20', 'MPC Sep 2024'),
  (11.75, '2023-05-26', 'MPC May 2023'),
  (11.25, '2023-03-31', 'MPC Mar 2023'),
  (10.75, '2023-01-27', 'MPC Jan 2023'),
  (10.50, '2022-11-25', 'MPC Nov 2022'),
  (9.75,  '2022-09-23', 'MPC Sep 2022'),
  (9.00,  '2022-07-22', 'MPC Jul 2022'),
  (8.25,  '2022-05-20', 'MPC May 2022'),
  (7.75,  '2022-03-25', 'MPC Mar 2022'),
  (7.50,  '2022-01-28', 'MPC Jan 2022'),
  (7.25,  '2021-11-19', 'MPC Nov 2021'),
  (7.00,  '2020-07-24', 'MPC Jul 2020'),
  (7.25,  '2020-05-22', 'MPC May 2020'),
  (7.75,  '2020-04-15', 'MPC Apr 2020 (emergency)'),
  (8.75,  '2020-03-20', 'MPC Mar 2020 (COVID emergency)'),
  (9.75,  '2020-01-17', 'MPC Jan 2020'),
  (10.00, '2019-07-19', 'MPC Jul 2019'),
  (10.25, '2018-11-23', 'MPC Nov 2018'),
  (10.00, '2018-03-29', 'MPC Mar 2018'),
  (10.25, '2017-07-21', 'MPC Jul 2017')
ON CONFLICT DO NOTHING;
