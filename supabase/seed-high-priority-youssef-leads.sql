-- =============================================
-- Seed users: High priority, sourced by Youssef
-- Run after schema.sql.
-- =============================================

-- Ensure new columns exist (for DBs created before schema was updated)
alter table users add column if not exists title text default '';
alter table users add column if not exists company text default '';
alter table users add column if not exists notes text default '';
alter table users add column if not exists priority text default '';
alter table users add column if not exists source text default '';

-- Insert only High priority + Youssef source into users
insert into users (display_name, email, phone, credits_remaining, title, company, notes, priority, source) values
  ('Mohamed Elbrens', 'mohamed.elprince@incorta.com', '', 180, 'PM', 'Incorta', '', 'High', 'Youssef'),
  ('Mahmoud Sharaf', 'm.sharaf@flowtechouse.com', '', 180, 'CEO', 'FlowTech', 'Podcaster - He wants to add his logo on the reel - Limit up to 3 Giga', 'High', 'Youssef'),
  ('Ebraam Atef', 'ebraamatef739@gmail.com', '', 180, '', '', '', 'High', 'Youssef'),
  ('Basma Ashour', 'uxbasmaashour@gmail.com', '201067262629', 180, 'Marketing', 'Digilians', 'Schedule posted; 4 hrs / 12 hrs; 7 days; bulk; Capcut; only webapp', 'High', 'Youssef'),
  ('Aly Zidan', 'alyyzidan@gmail.com', '01006570754', 180, '', 'El Monteg Productions', '', 'High', 'Youssef'),
  ('Ammar Hassan', 'ammar.h.salah@gmail.com', '201020901327', 180, 'CEO', 'BE Group', 'Graphic design; strap; branding kit; diet logo; landscape to 7 cam on speaker; camera track*', 'High', 'Youssef'),
  ('Mohamed Emam', 'emam@elitemediahouse.com', '', 180, 'CEO', 'Elite Media House', '', 'High', 'Youssef'),
  ('Amr Hatem', 'amr.hatem@almentor.net', '01113479364', 180, 'Sr. Busnies Dev', 'Almentor', 'Captions; Monofi*', 'High', 'Youssef'),
  ('Roger', 'roger@b-cloudsolutions.com', '01229733377', 180, '', 'B-Cloud Solutions', '', 'High', 'Youssef'),
  ('Ola El Fatih', 'ola-elfatih2@gmail.com', '201557845728', 180, '', '', 'Saudi Investor', 'High', 'Youssef'),
  ('Amira', 'connect@alignwithamira.com', '01108055954', 180, '', 'Align With Amira', 'Canadia Sodanise Video editing aganecy', 'High', 'Youssef'),
  ('Kareem Hassan', 'karim.hassan7690@gmail.com', '', 180, '', 'Infotrack', 'Coding videos (content creator)', 'High', 'Youssef'),
  ('Shams El Din Sallam', 'shamseldiensallam@gmail.com', '01557809654', 180, '', 'Evo Business Solution', '', 'High', 'Youssef');
