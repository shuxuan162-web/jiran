-- Jiran · 0003_severity_words
-- Keyword rules match whole words only (so "api" = fire in Malay doesn't match "rapid").
-- Postgres \m and \M are word boundaries; the TypeScript twin maps them to \b.
update public.severity_keywords k set pattern = v.newp from (values
 ('spark|exposed|live wire|wayar|electrocut|renjatan', '\m(spark\w*|exposed|live wire|wayar|electrocut\w*|renjatan)\M'),
 ('fire|smoke|api|asap|burn', '\m(fire|smoke|api|asap|burn\w*)\M'),
 ('flood|banjir|overflow|melimpah|rising water', '\m(flood\w*|banjir|overflow\w*|melimpah|rising water)\M'),
 ('child|children|kids|kanak|budak|school|sekolah', '\m(child|children|kids?|kanak|budak|school|sekolah)\M'),
 ('injur|hurt|accident|cedera|kemalangan|fell|jatuh', '\m(injur\w*|hurt|accident\w*|cedera|kemalangan|fell|jatuh|tripped)\M'),
 ('danger|dangerous|bahaya|urgent|segera', '\m(danger\w*|bahaya|urgent|segera)\M'),
 ('aedes|dengue|denggi|stagnant|bertakung', '\m(aedes|dengue|denggi|stagnant|bertakung)\M'),
 ('dark|gelap|no light', '\m(dark|gelap|no light)\M'),
 ('elderly|warga emas|wheelchair|kerusi roda|oku', '\m(elderly|warga emas|wheelchair|kerusi roda|oku)\M')
) v(oldp, newp) where k.pattern = v.oldp;

update public.issues set severity = public.issue_severity(category, description, reopened_count);
select public.refresh_issue_priority(id) from public.issues;
