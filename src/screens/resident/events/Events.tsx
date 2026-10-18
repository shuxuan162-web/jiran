import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  cancelEvent, checkInEvent, createEvent, eventById, eventCode, eventsList, rsvpEvent, type EventRow,
} from "../../../features/info/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { buildIcs, eventPhase, fromLocalInput, toLocalInput } from "../../../lib/info";
import { insideElmina } from "../../../lib/map/elmina";
import MapView from "../../../lib/map/MapView";
import { useTitle } from "../../../lib/useTitle";
import { Avatar, Banner, Field, Spinner, TopBar } from "../../../components/ui/parts";
import { NotificationBell } from "../../../components/issues";
import OrganicMapsLink from "../../../components/OrganicMapsLink";
import QrImage from "../../../components/QrImage";
import { eventQr } from "../../../lib/qr";
import { IconCalendar, IconCheck, IconPin, IconUsers } from "../../../components/ui/Icons";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function EventStateChip({ e }: { e: Pick<EventRow, "approval_state" | "kind"> }) {
  const { t } = useI18n();
  if (e.approval_state !== "approved") {
    const cls = e.approval_state === "pending" ? "lvl-medium" : e.approval_state === "rejected" ? "red" : "";
    return <span className={`chip ${cls}`}>{t(`event.state.${e.approval_state}` as StringKey)}</span>;
  }
  return <span className={`chip ${e.kind === "official" ? "blue" : "green"}`}>{t(e.kind === "official" ? "event.official" : "event.community")}</span>;
}

export function EventCard({ e, to }: { e: EventRow; to?: string }) {
  const { t } = useI18n();
  const d = new Date(e.starts_at);
  return (
    <Link to={to ?? `/app/events/${e.id}`} className="event-card">
      <span className="date-badge" aria-hidden="true">
        <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
        <strong>{d.getDate()}</strong>
      </span>
      <span className="grow">
        <span className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          <EventStateChip e={e} />
          {e.my_rsvp && <span className="chip green"><IconCheck width={14} /> {t(`event.rsvp.${e.my_rsvp}` as StringKey)}</span>}
          {e.is_full && <span className="chip">{t("event.full")}</span>}
        </span>
        <strong style={{ display: "block", fontSize: "1.0625rem" }}>{e.title}</strong>
        <span className="small muted" style={{ display: "block" }}>
          {fmtDay(e.starts_at)}, {fmtTime(e.starts_at)} to {fmtTime(e.ends_at)} · {e.location_name}
        </span>
        <span className="small muted">{t("event.goingN", { n: e.going_count })}{e.capacity ? ` / ${e.capacity}` : ""}</span>
      </span>
    </Link>
  );
}

type Tab = "upcoming" | "mine" | "past";

export default function Events() {
  const { t } = useI18n();
  useTitle(t("event.title"));
  const [params, setParams] = useSearchParams();
  const tab = (["upcoming", "mine", "past"].includes(params.get("tab") ?? "") ? params.get("tab") : "upcoming") as Tab;
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setRows(null);
    eventsList(tab).then(setRows).catch(() => { setFailed(true); setRows([]); });
  }, [tab]);

  return (
    <main className="screen">
      <TopBar title={t("event.title")} back="/app/residence" right={<NotificationBell />} />
      <Link to="/app/events/new" className="btn btn-primary" style={{ marginBottom: 16 }}>+ {t("event.create")}</Link>
      <div className="tabs" role="tablist" aria-label={t("event.title")}>
        {(["upcoming", "mine", "past"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k}
            onClick={() => setParams(k === "upcoming" ? {} : { tab: k }, { replace: true })}>{t(`event.tab.${k}` as StringKey)}</button>
        ))}
      </div>
      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t(`event.empty.${tab}` as StringKey)}</div> : (
        <div role="list">{rows.map((e) => <div role="listitem" key={e.id}><EventCard e={e} /></div>)}</div>
      )}
    </main>
  );
}

function downloadIcs(e: EventRow) {
  const blob = new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "event"}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function EventDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [e, setE] = useState<EventRow | null | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [showCode, setShowCode] = useState(false);
  useTitle(e?.title ?? t("event.title"));

  const load = useCallback(async () => {
    try {
      const x = await eventById(id);
      setE(x);
      if (x?.is_host && x.approval_state === "approved") setCode(await eventCode(id).catch(() => null));
    } catch { setE(null); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function rsvp(status: "going" | "interested" | null) {
    if (!e) return;
    setBusy(true); setNote(null);
    try {
      await rsvpEvent(e.id, status);
      await load();
      setNote({ kind: "success", text: t(status === "going" ? "event.rsvpGoingDone" : status === "interested" ? "event.rsvpInterestedDone" : "event.rsvpRemoved") });
    } catch (x) { setNote({ kind: "error", text: t(errorKey(x)) }); }
    setBusy(false);
  }

  async function checkIn(withCode: boolean) {
    if (!e) return;
    setBusy(true); setNote(null);
    const done = async (r: { method: string }) => {
      await load();
      setNote({ kind: "success", text: t(r.method === "already" ? "event.checkedInAlready" : "event.checkedIn") });
      setBusy(false);
    };
    const fail = (x: unknown) => { setNote({ kind: "error", text: t(errorKey(x)) }); setBusy(false); };
    if (withCode) { checkInEvent(e.id, null, typed.trim()).then(done, fail); return; }
    if (!navigator.geolocation) { fail("checkin_need_location"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => checkInEvent(e.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }, null).then(done, fail),
      () => { setShowCode(true); fail("checkin_need_location"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  async function cancel() {
    if (!e) return;
    const reason = window.prompt(t("event.cancelQ")) ?? null;
    if (reason === null) return;
    try { await cancelEvent(e.id, reason); await load(); } catch (x) { setNote({ kind: "error", text: t(errorKey(x)) }); }
  }

  if (e === undefined) return <main className="screen"><TopBar title={t("event.title")} back /><Spinner /></main>;
  if (!e) return <main className="screen"><TopBar title={t("event.title")} back /><Banner kind="error">{t("err.not_found")}</Banner></main>;

  const phase = eventPhase(e.starts_at, e.ends_at);
  const approved = e.approval_state === "approved";
  return (
    <main className="screen">
      <TopBar title={t("event.title")} back="/app/events" />
      <article className="card pop-in">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <EventStateChip e={e} />
          {phase === "over" && approved && <span className="chip">{t("event.past")}</span>}
          {e.is_full && phase !== "over" && <span className="chip">{t("event.full")}</span>}
        </div>
        <h1 style={{ fontSize: "1.5rem", margin: "10px 0 8px" }}>{e.title}</h1>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          {e.host_avatar !== null && e.host_nickname && <Avatar name={e.host_nickname} config={e.host_avatar ?? undefined} size={32} />}
          <span className="small">{t("event.hostedBy", { name: e.host_nickname ?? t("post.aNeighbour") })}</span>
        </div>
        <p className="row" style={{ gap: 8, margin: "4px 0" }}><IconCalendar width={20} /> {fmtDay(e.starts_at)}, {fmtTime(e.starts_at)} to {fmtTime(e.ends_at)}</p>
        <p className="row" style={{ gap: 8, margin: "4px 0" }}><IconPin width={20} /> {e.location_name}{e.area_name ? ` · ${e.area_name}` : ""}</p>
        <p className="row" style={{ gap: 8, margin: "4px 0 12px" }}><IconUsers width={20} />
          {phase === "over"
            ? t("event.attended", { n: e.checked_in_count })
            : <>{t("event.goingN", { n: e.going_count })}{e.capacity ? ` / ${e.capacity}` : ""} · {t("event.interestedN", { n: e.interested_count })}</>}
        </p>

        {e.approval_state === "pending" && <Banner kind="info">{t("event.pendingLead")}</Banner>}
        {e.approval_state === "rejected" && <Banner kind="warn">{t("event.rejectedLead", { reason: e.reject_reason ?? "" })}</Banner>}
        {e.approval_state === "cancelled" && <Banner kind="warn">{t("event.cancelledLead")}</Banner>}

        <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>

        {approved && phase !== "over" && (
          <>
            <div className="segmented" role="group" aria-label={t("event.rsvpQ")} style={{ marginBottom: 8 }}>
              <button type="button" className={`seg-btn${e.my_rsvp === "going" ? " on" : ""}`} aria-pressed={e.my_rsvp === "going"} disabled={busy || (e.is_full && e.my_rsvp !== "going")}
                onClick={() => rsvp(e.my_rsvp === "going" ? null : "going")}>{t("event.going")}</button>
              <button type="button" className={`seg-btn${e.my_rsvp === "interested" ? " on" : ""}`} aria-pressed={e.my_rsvp === "interested"} disabled={busy}
                onClick={() => rsvp(e.my_rsvp === "interested" ? null : "interested")}>{t("event.interested")}</button>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => downloadIcs(e)}><IconCalendar width={18} /> {t("event.addCal")}</button>
          </>
        )}

        {approved && phase === "checkin_open" && (
          <section className="card checkin-card" style={{ marginTop: 12 }}>
            {e.checked_in ? <strong className="row" style={{ gap: 6 }}><IconCheck width={20} /> {t("event.checkedIn")}</strong> : (
              <>
                <strong>{t("event.checkinQ")}</strong>
                <p className="small muted" style={{ margin: "4px 0 8px" }}>{t("event.checkinLead")}</p>
                <button className="btn btn-primary btn-small" disabled={busy} onClick={() => checkIn(false)}>{t("event.checkinHere")}</button>
                <Link to="/app/scan" className="btn btn-secondary btn-small" style={{ marginLeft: 8 }}>{t("event.scanQr")}</Link>
                {!showCode ? <button className="link-btn" style={{ marginLeft: 12 }} onClick={() => setShowCode(true)}>{t("event.useCode")}</button> : (
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <input className="input" inputMode="numeric" maxLength={6} value={typed} aria-label={t("event.codeLabel")}
                      placeholder="000000" onChange={(x) => setTyped(x.target.value.replace(/\D/g, ""))} style={{ maxWidth: 140 }} />
                    <button className="btn btn-secondary btn-small" disabled={busy || typed.length !== 6} onClick={() => checkIn(true)}>{t("event.checkinCode")}</button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {approved && phase === "upcoming" && e.my_rsvp === "going" && <p className="small muted" style={{ marginTop: 8 }}>{t("event.checkinLater")}</p>}

        {e.is_host && code && phase !== "over" && approved && (
          <div className="card" style={{ marginTop: 12, background: "var(--color-tint-amber)" }}>
            <strong>{t("event.yourCode")}</strong>
            <div className="big-code" aria-label={code.split("").join(" ")}>{code}</div>
            <div style={{ display: "grid", placeItems: "center", margin: "6px 0 8px" }}>
              <QrImage value={eventQr(e.id, code)} size={180} label={t("event.qrAlt", { title: e.title })} />
            </div>
            <p className="small" style={{ margin: 0 }}>{t("event.yourCodeLeadQr")}</p>
          </div>
        )}

        {note && <div style={{ marginTop: 12 }}><Banner kind={note.kind}>{note.text}</Banner></div>}
        <div style={{ marginTop: 12 }}><OrganicMapsLink lat={e.lat} lng={e.lng} name={e.location_name} /></div>
        {e.is_host && (e.approval_state === "approved" || e.approval_state === "pending") && phase !== "over" && (
          <button className="link-btn" style={{ marginTop: 12 }} onClick={cancel}>{t("event.cancel")}</button>
        )}
      </article>
    </main>
  );
}

/** Event form, used by residents (goes to approval) and by management (published at once). */
export function EventForm({ onDone, staff = false }: { onDone: (r: { id: string; approval_state: string }) => void; staff?: boolean }) {
  const { t } = useI18n();
  const start0 = new Date(Date.now() + 2 * 86400000); start0.setHours(8, 0, 0, 0);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState(toLocalInput(start0));
  const [end, setEnd] = useState(toLocalInput(new Date(start0.getTime() + 2 * 3600000)));
  const [place, setPlace] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const s = fromLocalInput(start), en = fromLocalInput(end);
  const capN = cap.trim() ? Number(cap) : null;
  const problems: Partial<Record<"title" | "desc" | "time" | "place" | "pin" | "cap", StringKey>> = {};
  if (title.trim().length < 4) problems.title = "event.errTitle";
  if (desc.trim().length < 10) problems.desc = "err.description_short";
  if (!s || !en || new Date(en) <= new Date(s)) problems.time = "event.errTime";
  else if (new Date(s).getTime() < Date.now() + 3600000) problems.time = "err.event_too_soon";
  if (place.trim().length < 2) problems.place = "err.required";
  if (!pin) problems.pin = "event.errPin";
  else if (!insideElmina(pin.lat, pin.lng)) problems.pin = "err.outside_township";
  if (capN !== null && (!Number.isInteger(capN) || capN < 2 || capN > 2000)) problems.cap = "event.errCap";
  const ok = Object.keys(problems).length === 0;
  const show = (k: keyof typeof problems) => (touched && problems[k] ? t(problems[k]!) : null);

  async function submit() {
    setTouched(true);
    if (!ok || !pin || !s || !en) return;
    setBusy(true); setErr(null);
    try {
      onDone(await createEvent({ title: title.trim(), description: desc.trim(), startsAt: s, endsAt: en, locationName: place.trim(), lat: pin.lat, lng: pin.lng, capacity: capN }));
    } catch (x) { setErr(t(errorKey(x))); setBusy(false); }
  }

  return (
    <div>
      {!staff && <Banner kind="info">{t("event.approvalNote")}</Banner>}
      <div style={{ height: 12 }} />
      <Field label={t("event.fTitle")} value={title} maxLength={100} onChange={(x) => setTitle(x.target.value)} error={show("title")} />
      <label className="field">
        <span className="label">{t("event.fDesc")}</span>
        <textarea className="textarea" value={desc} maxLength={2000} onChange={(x) => setDesc(x.target.value)} placeholder={t("event.fDescHint")} />
        {show("desc") && <span className="error">{show("desc")}</span>}
      </label>
      <div className="two-col">
        <Field label={t("event.fStart")} type="datetime-local" value={start} onChange={(x) => setStart(x.target.value)} />
        <Field label={t("event.fEnd")} type="datetime-local" value={end} onChange={(x) => setEnd(x.target.value)} error={show("time")} />
      </div>
      <Field label={t("event.fPlace")} value={place} maxLength={120} onChange={(x) => setPlace(x.target.value)} hint={t("event.fPlaceHint")} error={show("place")} />
      <div className="field">
        <span className="label">{t("event.fPin")}</span>
        <MapView label={t("event.fPin")} height={260} pick={pin} onPick={(lat, lng) => setPin({ lat, lng })} />
        {show("pin") && <span className="error">{show("pin")}</span>}
      </div>
      <Field label={t("event.fCap")} optional inputMode="numeric" value={cap} onChange={(x) => setCap(x.target.value.replace(/\D/g, ""))} hint={t("event.fCapHint")} error={show("cap")} />
      {err && <Banner kind="error">{err}</Banner>}
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? t("common.loading") : t(staff ? "event.publish" : "event.submit")}</button>
    </div>
  );
}

export function CreateEvent() {
  const { t } = useI18n();
  const nav = useNavigate();
  useTitle(t("event.create"));
  return (
    <main className="screen">
      <TopBar title={t("event.create")} back />
      <EventForm onDone={(r) => nav(`/app/events/${r.id}`, { replace: true })} />
    </main>
  );
}
