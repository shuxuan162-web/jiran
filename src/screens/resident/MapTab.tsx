import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import {
  activeEmergencies, checkIn, checkOut, confirmSos, feedOrdered, loadAreaShapes, mapPresence, setPrivacy,
  type FeedItem, type Presence, type PublicEmergency,
} from "../../features/sos/api";
import { supabase } from "../../lib/supabase";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { readPref, writePref } from "../../lib/prefs";
import { useTitle } from "../../lib/useTitle";
import { LEVEL_ICON, type Level } from "../../lib/scoring/labels";
import LeafletMap, { type AreaShape, type LivePosition, type MapPin } from "../../lib/map/LeafletMap";
import { Avatar, Banner } from "../../components/ui/parts";
import { NotificationBell, issuePinHtml } from "../../components/issues";
import SosButton from "../../components/SosButton";
import { IconPin, IconX } from "../../components/ui/Icons";

type Layer = "emergencies" | "issues" | "neighbours";
type Selected = { kind: "emergency"; e: PublicEmergency } | { kind: "issue"; f: FeedItem } | null;

const RING: Record<string, string> = { red: "#D71920", orange: "#F26522", amber: "#FDB515", green: "#1F7A5C", blue: "#2F6FB3" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const avatarHtml = (nickname: string, avatar: Record<string, unknown> | null, me: boolean, label?: string) =>
  `<div class="map-avatar${me ? " me" : ""}" style="background:${RING[String(avatar?.ring ?? "orange")] ?? RING.orange}">${esc(nickname.slice(0, 1).toUpperCase())}</div>` +
  (label ? `<div class="map-avatar-name">${esc(label)}</div>` : "");
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`;
};

/** Map tab (home): the live township map. Emergencies always come first (tier 1), then everything else. */
export default function MapTab() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { profile, refresh } = useAuth();
  useTitle(t("nav.map"));
  const [areas, setAreas] = useState<AreaShape[]>([]);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [sos, setSos] = useState<PublicEmergency[]>([]);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => {
    try { return { emergencies: true, issues: true, neighbours: true, ...JSON.parse(readPref("mapLayers") ?? "{}") }; }
    catch { return { emergencies: true, issues: true, neighbours: true }; }
  });
  const [track, setTrack] = useState(false);
  const [me, setMe] = useState<LivePosition | null>(null);
  const [locErr, setLocErr] = useState(false);
  const [sel, setSel] = useState<Selected>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, e] = await Promise.all([feedOrdered(150), activeEmergencies()]);
      setFeed(f); setSos(e); setFailed(false); setUpdated(new Date());
    } catch { setFailed(true); setFeed((x) => x ?? []); }
  }, []);
  const loadPresence = useCallback(() => { mapPresence().then(setPresence).catch(() => {}); }, []);

  useEffect(() => {
    loadAreaShapes().then(setAreas).catch(() => {});
    void load(); loadPresence();
    const a = window.setInterval(load, 15000);
    const b = window.setInterval(loadPresence, 30000);
    // Issue changes arrive live; emergencies of others are polled (they are only readable through the rounded view).
    const ch = supabase.channel(`map-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => void load())
      .subscribe();
    return () => { window.clearInterval(a); window.clearInterval(b); void supabase.removeChannel(ch); };
  }, [load, loadPresence]);
  useEffect(() => { writePref("mapLayers", JSON.stringify(layers)); }, [layers]);

  const myArea = profile?.home_area_id;
  const shapes = useMemo(() => areas.map((a) => {
    const n = presence?.areas.find((p) => p.area_id === a.id)?.count;
    return { ...a, mine: a.id === myArea, note: layers.neighbours && n ? t(n === 1 ? "map.neighbour" : "map.neighbours", { n }) : undefined };
  }), [areas, myArea, presence, layers.neighbours, t]);

  const issues = useMemo(() => (feed ?? []).filter((f) => f.kind === "issue"), [feed]);

  const pins: MapPin[] = useMemo(() => {
    const out: MapPin[] = [];
    if (layers.issues) for (const f of issues) {
      out.push({ id: f.id, lat: f.lat, lng: f.lng, html: issuePinHtml(f.level as Level), z: Math.round((f.score ?? 0) * 10),
        label: `${f.ref_no}: ${t(`cat.${f.title}` as StringKey)}, ${t(`level.${f.level}` as StringKey)}`, onClick: () => setSel({ kind: "issue", f }) });
    }
    if (layers.neighbours && presence) {
      for (const a of presence.areas) for (const v of a.avatars ?? []) {
        out.push({ id: `av-${a.area_id}-${v.nickname}`, lat: v.lat, lng: v.lng, html: avatarHtml(v.nickname, v.avatar, v.is_me), size: [32, 32], z: 100,
          label: t("map.neighbourIn", { name: v.nickname, area: a.name }) });
      }
      for (const c of presence.checkins) {
        out.push({ id: `ci-${c.nickname}`, lat: c.lat, lng: c.lng, html: avatarHtml(c.nickname, c.avatar, c.is_me, c.is_me ? t("map.you") : c.nickname),
          size: [32, 48], z: 500, label: t("map.checkedIn", { name: c.nickname, m: c.minutes_left }) });
      }
    }
    if (layers.emergencies) for (const e of sos) {
      out.push({ id: e.id, lat: e.lat, lng: e.lng, html: '<div class="pin pin-sos"><span>!</span></div>', size: [44, 52], z: 10000,
        label: `${t(`sosType.${e.type}` as StringKey)}: ${t(`sosStatus.${e.status}` as StringKey)}`, onClick: () => setSel({ kind: "emergency", e }) });
    }
    return out;
  }, [issues, sos, presence, layers, t]);

  const toggle = (k: Layer) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const counts: Record<Layer, number> = {
    emergencies: sos.length, issues: issues.length,
    neighbours: (presence?.areas.reduce((s, a) => s + a.count, 0) ?? 0),
  };
  const visibility = presence?.me?.map_visibility ?? profile?.map_visibility ?? "unset";
  const ghost = presence?.me?.ghost_mode ?? profile?.ghost_mode ?? false;
  const checkedInUntil = presence?.me?.checked_in_until ? new Date(presence.me.checked_in_until) : null;

  async function choosePrivacy(v: "precinct" | "hidden") {
    if (!profile) return;
    try { await setPrivacy(profile.id, { map_visibility: v }); await refresh(); loadPresence(); } catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
  }
  async function doCheckIn() {
    if (!me) return;
    setBusy(true); setNote(null);
    try { await checkIn(me.lat, me.lng); loadPresence(); setNote({ kind: "success", text: t("map.checkInDone") }); }
    catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function doCheckOut() {
    setBusy(true);
    try { await checkOut(); loadPresence(); setNote(null); } catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function confirm(e: PublicEmergency) {
    setBusy(true); setNote(null);
    try {
      await confirmSos(e.id, me?.lat, me?.lng);
      setNote({ kind: "success", text: t("map.confirmed") });
      await load();
      setSel(null);
    } catch (x) { setNote({ kind: "error", text: t(errorKey(x)) }); }
    setBusy(false);
  }
  const happening = (feed ?? []).slice(0, 8);

  return (
    <main className="screen map-screen">
      <header className="topbar">
        {profile && <Avatar name={profile.nickname} config={profile.avatar_config} size={44} />}
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{profile?.nickname}</div>
          <div className="muted small">{t("map.title")}</div>
        </div>
        <NotificationBell />
      </header>

      {visibility === "unset" && (
        <section className="card privacy-card" aria-labelledby="privacy-q">
          <h2 id="privacy-q" style={{ fontSize: "1.125rem" }}>{t("map.privacyQ")}</h2>
          <p className="muted" style={{ fontSize: "1rem" }}>{t("map.privacyLead")}</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-small grow" onClick={() => choosePrivacy("precinct")}>{t("map.privacyShow")}</button>
            <button className="btn btn-ghost btn-small grow" onClick={() => choosePrivacy("hidden")}>{t("map.privacyHide")}</button>
          </div>
        </section>
      )}

      <div className="chip-row layer-chips" role="group" aria-label={t("map.layers")}>
        {(["emergencies", "issues", "neighbours"] as Layer[]).map((k) => (
          <button key={k} type="button" className={`chip-btn layer-${k}`} aria-pressed={layers[k]} onClick={() => toggle(k)}>
            {t(`map.layer.${k}` as StringKey)} <span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="map-wrap">
        <LeafletMap label={t("map.title")} height="58vh" pins={pins} areas={shapes} track={track} focus={focus}
          onLocate={(p) => { setMe(p); setLocErr(false); }}
          onLocateError={() => { setLocErr(true); setTrack(false); }} />
        <div className="map-tools">
          <button type="button" className={`icon-btn${track ? " on" : ""}`} aria-pressed={track}
            aria-label={track ? t("map.liveOff") : t("map.liveOn")}
            onClick={() => { setTrack((x) => !x); if (track) setMe(null); else if (me) setFocus({ lat: me.lat, lng: me.lng, key: Date.now() }); }}>
            <IconPin />
          </button>
          {me && <button type="button" className="icon-btn" aria-label={t("map.centreMe")} onClick={() => setFocus({ lat: me.lat, lng: me.lng, zoom: 16, key: Date.now() })}>◎</button>}
        </div>
        <div className="map-sos"><SosButton variant="small" /></div>
      </div>

      <p className="small muted" style={{ margin: "6px 0 0" }} aria-live="polite">
        {updated ? t("map.updated", { time: updated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) }) : t("common.loading")}
        {" · "}{t("map.sosHoldHint")}
      </p>
      {failed && <div style={{ marginTop: 8 }}><Banner kind="error">{t("err.network")}</Banner></div>}
      {locErr && <div style={{ marginTop: 8 }}><Banner kind="warn">{t("map.locDenied")}</Banner></div>}

      {track && (
        <section className="card live-card" aria-live="polite">
          <strong>{me ? t("map.liveOnNow", { m: Math.round(me.accuracy) }) : t("map.liveFinding")}</strong>
          <p className="small muted" style={{ margin: "4px 0 8px" }}>{t("map.liveStaysHere")}</p>
          {visibility === "precinct" && !ghost ? (
            checkedInUntil ? (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={doCheckOut}>
                {t("map.checkOut", { time: checkedInUntil.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })}
              </button>
            ) : (
              <button className="btn btn-secondary btn-small" disabled={!me || busy} onClick={doCheckIn}>{t("map.checkIn")}</button>
            )
          ) : <p className="small" style={{ margin: 0 }}>{t("map.checkInOff")} <Link to="/app/profile/settings">{t("profile.settings")}</Link></p>}
        </section>
      )}
      {note && <div style={{ marginTop: 8 }}><Banner kind={note.kind}>{note.text}</Banner></div>}

      {sel && (
        <section className="sheet pop-in" role="dialog" aria-label={t("map.details")}>
          <button className="icon-btn sheet-close" aria-label={t("common.close")} onClick={() => setSel(null)}><IconX /></button>
          {sel.kind === "emergency" ? (
            <>
              <span className="chip lvl-urgent"><span aria-hidden="true">⚠</span> {t(`sosStatus.${sel.e.status}` as StringKey)}</span>
              <h2 style={{ fontSize: "1.25rem", margin: "8px 0 4px" }}>{t(`sosType.${sel.e.type}` as StringKey)}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {t("map.sosWhere", { area: sel.e.area_name ?? t("issue.nearby"), ago: ago(sel.e.created_at) })}
                {sel.e.confirm_count > 0 ? ` · ${t("map.sosSeen", { n: sel.e.confirm_count })}` : ""}
              </p>
              <p className="small" style={{ margin: "6px 0 10px" }}>{t("map.sosPrivacy")}</p>
              {sel.e.is_mine ? (
                <Link to={`/app/sos/${sel.e.id}`} className="btn btn-primary">{t("map.sosMine")}</Link>
              ) : sel.e.i_confirmed ? (
                <p className="small" style={{ fontWeight: 700 }}>{t("map.confirmed")}</p>
              ) : (
                <button className="btn btn-secondary" disabled={busy} onClick={() => confirm(sel.e)}>{t("map.sosConfirm")}</button>
              )}
            </>
          ) : (
            <>
              <span className={`chip lvl-${sel.f.level}`}><span aria-hidden="true">{LEVEL_ICON[sel.f.level as Level]}</span> {t(`level.${sel.f.level}` as StringKey)}</span>
              <h2 style={{ fontSize: "1.25rem", margin: "8px 0 4px" }}>{t(`cat.${sel.f.title}` as StringKey)}</h2>
              <p className="small muted" style={{ margin: "0 0 10px" }}>{sel.f.ref_no} · {sel.f.area_name ?? t("issue.nearby")} · #{issues.findIndex((x) => x.id === sel.f.id) + 1}</p>
              <button className="btn btn-primary" onClick={() => nav(`/app/issues/${sel.f.id}`)}>{t("map.openIssue")}</button>
            </>
          )}
        </section>
      )}

      <h2 className="section">{t("map.happening")}</h2>
      {happening.length === 0 ? <div className="card muted">{t("issues.emptyOpen")}</div> : (
        <div className="list" role="list">
          {happening.map((f) => (
            <button key={f.id} role="listitem" className={`list-row feed-row tier-${f.tier}`}
              onClick={() => { setFocus({ lat: f.lat, lng: f.lng, zoom: 16, key: Date.now() });
                if (f.kind === "emergency") { const e = sos.find((x) => x.id === f.id); if (e) setSel({ kind: "emergency", e }); }
                else setSel({ kind: "issue", f }); }}>
              <span className={`feed-dot lvl-${f.level}`} aria-hidden="true">{f.kind === "emergency" ? "!" : LEVEL_ICON[f.level]}</span>
              <span className="grow">
                {f.kind === "emergency" ? t(`sosType.${(sos.find((x) => x.id === f.id)?.type ?? "unspecified")}` as StringKey) : t(`cat.${f.title}` as StringKey)}
                <span className="small muted" style={{ display: "block", fontWeight: 600 }}>
                  {f.kind === "emergency" ? t("map.tierEmergency") : t(`level.${f.level}` as StringKey)} · {f.area_name ?? t("issue.nearby")} · {ago(f.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Link to="/app/issues" className="btn btn-ghost" style={{ marginTop: 12 }}>{t("map.seeAll", { n: issues.length })}</Link>
      <Link to="/app/report" className="fab">+ {t("issues.report")}</Link>
    </main>
  );
}
