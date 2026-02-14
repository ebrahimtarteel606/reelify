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

-- Users from "AI Everything Badge Scans - Users.csv"
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Bishoy Habib', 'bishoy.habib@summit-mea.com', '201007521318', 'Presales Manager', 'Summit', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ibrahim Abdelkhalek', 'compu.ebrahim@gmail.com', '201014914924', 'Lead travel consultant', 'Cwt', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohamed Ramdan', 'mohamed.ramadan@aman.eg', '201006718791', 'AI and Engineering Manager', 'Aman', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Amgad Ali', 'amgad.aali96@gmail.com', '201276042771', 'CMO', 'NUTX', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Selena Yoseli Garzon', 'yoseligarzon3@gmail.com', '201274250200', 'Paid Media', 'BRIA', 'Argentina', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Khushal Kamediya', 'khushal.kamediya@mindcrewtech.com', '91+91', 'Tech Lead', 'CuppaLeads', 'India', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohammed Samy', 'bnsamy@live.com', '201097997666', 'Owner', 'Dokkan Tech', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Amr Mohsen', 'amrmohsen.phd@hopeai.org', '15102982252', 'Chairman', 'HopeAi Inc.', 'United States of America', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Reem Ayad', 'reemayad18@yahoo.com', '—', 'Pharmacist', 'World Health Organization', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohamed Ahmed Essam', 'm.essam@middl-men.com', '201012466666', 'Strategy director', 'Middl-men', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Youssef Essam', 'youssef.essam@brightskiesinc.com', '201000269671', 'Business Developer Leader', 'BrightSkies', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('salma AbdElmordy', 'salmaabdelmordy@gmail.com', '201127904233', 'Senior Account Manager', '5D', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Abdelrahman Hassan', 'abdo@camaranmedia.org', '201200904545', 'Founder', 'Camaran media', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohamed Sameh', 'mohamed@nanovate.io', '201122976957', 'Video Editor', 'Nanovate', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Hadeer Hany Yaqout', 'hader.hany@evi-international.com', '201099694847', 'Operations manager', 'Experts Vision International', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mahmoud Elshikha', 'elshikha5000@gmail.com', '201020963840', 'Founder', 'CySent', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ahmed Emadelddin Mohamed', 'ahmedemadelddin@green-pen.com', '201127383852', 'CEO', 'Green Pen', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ali Hamed', 'hamdly634@gmail.com', '—', 'TIEC Ambassador', 'ITIDA/ TIEC', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Sofia Hanna', 'sofia.hanna08@gmail.com', '201001428154', 'COO', 'Vitala', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohammad Hussein', 'mohammadkamal323@gmail.com', '201117300306', 'Head of Development', 'Azad', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('ALAA ELSAYED', 'alaa@voomproptech.com', '201010314119', 'FOUNDER', 'VOOM', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Eman Badr', 'emanbadr1986@gmail.com', '201067764881', 'Transformation Director', 'Concentrix', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('abdelrahman gamal', 'abdelrahmangamal524@gmail.com', '201011027174', 'ai product designer', 'neuro', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Alexander Ogbeh', 'alexanderogbeh@gmail.com', '2348079401216', 'CEO', 'Lexis development company ltd', 'Nigeria', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('ABDELRAHMAN MAHMOUD', 'ABDELRAHMAN@USANIF.COM', '201552687716', 'MANAGING DIRECTOR', 'SHV', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ahmed Mansour', 'ahmed.ibrmansour@orange.com', '201275551973', 'Senior Supervisor RPA', 'Orange Egypt', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ahmed Atef', 'ahmedatiff@gmail.com', '201010330410', 'Product manager', 'Perroapp', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Adel El-demerdash', 'adelk11911@gmail.com', '201100682427', 'ASSOCIATE', 'Adel law firm', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ragui Abadir', 'abadir.ragui@gmail.com', '201001114380', 'Owner', 'Bites', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohammed Najeeb', 'm.najeeb@grandmstg.com', '201098325239', 'Deputy GM', 'Grand Technology', 'Yemen', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ramadan Moheyeldeen', 'Ramadan.moheyeldeen@gmail.com', '201005262214', 'Senior software engineer', 'Stockastic', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ebraam Atef', 'ebraamatef739@gmail.com', '201223283017', 'Data Science Student', '', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mahmoud Sharaf', 'm.sharaf@flowtechouse.com', '201111830042', 'Business development manager', 'Flow Tech House', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohamed ElPrince', 'mohamed.elprince@incorta.com', '201098237606', 'CPO', 'Layout.dv', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mostafa Zakaria', 'mzakaria@korastats.com', '201112273173', 'CTO', 'KoraStats', 'Egypt', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Basma Ashour', 'uxbasmaashour@gmail.com', '201067262629', 'Marketing', 'Digilians', 'Schedule posted; 4 hrs / 12 hrs; 7 days; bulk; Capcut; only webapp', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Aly Zidan', 'alyyzidan@gmail.com', '1006570754', '', 'El Monteg Productions', '', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ammar Hassan', 'ammar.h.salah@gmail.com', '201020901327', 'CEO', 'BE Group', 'Graphic design; strap; branding kit; diet logo; landscape to 7 cam on speaker; camera track*', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Mohamed Emam', 'emam@elitemediahouse.com', '—', 'CEO', 'Elite Media House', '', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Amr Hatem', 'amr.hatem@almentor.net', '1113479364', 'Sr. Busnies Dev', 'Almentor', 'Captions; Monofi*', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Roger', 'roger@b-cloudsolutions.com', '1229733377', '', 'B-Cloud Solutions', '', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ola El Fatih', 'ola-elfatih2@gmail.com', '201557845728', '', '', 'Saudi Investor', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Amira', 'connect@alignwithamira.com', '1108055954', '', 'Align With Amira', 'Canadia Sodanise Video editing aganecy', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Ahmed Habashy', 'info@aqarly.com', '201143076076', '', 'aqraly', 'Real estate content Has business card', 'Medium', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Kareem Hassan', 'karim.hassan7690@gmail.com', '—', '', 'Infotrack', 'Coding videos (content creator)', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Shams Sallam', 'shamseldiensallam@gmail.com', '1557809654', '', 'Evo Business Solution', '', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Salwa El Kasbgy', 'salwa@saraaadvertising.com', '201110719907', 'CEO', 'Saraa Ad Agency', 'Has business card', '', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Hussein Meshrafa', 'h.meshrafa@seasplit.com', '1001997177', 'Founder', 'Seasplit', '', 'High', 'Youssef');
insert into users (display_name, email, phone, title, company, notes, priority, source) values ('Nada Ashraf', 'nada.ashraf@startup-sync.com', '1272989333', 'PM', 'Startup Sync', '', 'High', 'Youssef');

