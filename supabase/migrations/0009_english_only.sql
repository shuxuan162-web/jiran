-- Jiran: English is the only language. Old "bm" choices become "en"; only "en" is allowed from now on.
update public.profiles set language = 'en' where language is distinct from 'en';
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language = 'en');
