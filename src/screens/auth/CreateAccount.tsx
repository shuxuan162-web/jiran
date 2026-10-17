import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useShouldLeaveGuestPage } from "../../features/auth/useRedirectIfSignedIn";
import { supabase } from "../../lib/supabase";
import { callFunction } from "../../lib/functions";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import {
  alnumUpper, digitsOnly, fileProblem, formatNric, isValidEmail, isValidId, isValidNickname, passwordProblem,
} from "../../lib/validation";
import { loadAreas, loadUnits, uploadAndSubmitCertificate, type AreaRow, type UnitRow } from "../../features/auth/onboarding";
import { Banner, Field, ProgressSteps, SelectField, TopBar } from "../../components/ui/parts";
import { FilePicker } from "../../components/ui/FilePicker";

const TOTAL = 4;

export default function CreateAccount() {
  const { t } = useI18n();
  const nav = useNavigate();
  useTitle(t("signup.title"));

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState<"nric" | "passport">("nric");
  const [idNumber, setIdNumber] = useState("");
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [areaId, setAreaId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitId, setUnitId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<StringKey | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "creating" | "uploading">(null);
  const [err, setErr] = useState<StringKey | null>(null);

  useEffect(() => {
    // Areas that have units: residential precincts, plus estates without precincts yet
    loadAreas().then((a) => setAreas(a.filter((x) => x.residential && x.slug !== "elmina-west")))
      .catch(() => setErr("err.network"));
  }, []);
  useEffect(() => {
    setUnitId("");
    if (!areaId) { setUnits([]); return; }
    loadUnits(areaId).then(setUnits).catch(() => setErr("err.network"));
  }, [areaId]);

  const idOk = isValidId(idType, idNumber);
  const stepValid =
    step === 1 ? fullName.trim().length >= 3 && idOk :
    step === 2 ? !!unitId :
    step === 3 ? !!file && !fileProblem(file) :
    isValidEmail(email) && !passwordProblem(password) && isValidNickname(nickname);

  function next(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!stepValid) return;
    setTouched(false);
    setErr(null);
    if (step < TOTAL) { setStep(step + 1); window.scrollTo(0, 0); return; }
    void create();
  }

  async function create() {
    if (!file) return;
    setBusy("creating");
    setErr(null);
    const res = await callFunction("register-owner", {
      email: email.trim(), password, full_name: fullName.trim(), id_type: idType,
      id_number: idType === "nric" ? digitsOnly(idNumber) : alnumUpper(idNumber),
      unit_id: unitId, nickname: nickname.trim(), phone: phone.trim(),
    });
    if (res.error) { setBusy(null); setErr(errorKey(res.error)); return; }

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) { setBusy(null); nav("/login/owner"); return; }

    setBusy("uploading");
    try {
      await uploadAndSubmitCertificate(data.user.id, file);
    } catch {
      // The account exists; the Verification screen lets them upload again.
    }
    nav("/verification", { replace: true });
  }

  function pickFile(f: File | null) {
    setFile(f);
    setFileErr(f ? (fileProblem(f) ? (`err.${fileProblem(f)}` as StringKey) : null) : null);
  }

  const leave = useShouldLeaveGuestPage(!!busy);
  if (leave) return <Navigate to="/" replace />;

  const stepTitle = t(`signup.s${step}` as StringKey);
  const show = (cond: boolean, key: StringKey) => (touched && cond ? t(key) : null);

  return (
    <main className="screen no-nav">
      <TopBar title={t("signup.title")} back={step === 1 ? "/login" : undefined}
        right={step > 1 ? <button className="link-btn" onClick={() => setStep(step - 1)}>{t("common.back")}</button> : undefined} />
      <p className="muted" style={{ marginBottom: 0 }}>{t("signup.step", { n: step, total: TOTAL })}</p>
      <ProgressSteps step={step} total={TOTAL} />
      <h2 style={{ fontSize: "1.375rem", marginBottom: 16 }}>{stepTitle}</h2>

      <form onSubmit={next} noValidate>
        {step === 1 && (
          <>
            <Field label={t("signup.fullName")} autoComplete="name" value={fullName}
              onChange={(e) => setFullName(e.target.value)} error={show(fullName.trim().length < 3, "err.bad_name")} />
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
              <legend className="label" style={{ fontWeight: 800, marginBottom: 6 }}>{t("signup.idType")}</legend>
              <div className="segmented">
                {(["nric", "passport"] as const).map((k) => (
                  <label key={k}>
                    <input type="radio" name="idtype" checked={idType === k} onChange={() => { setIdType(k); setIdNumber(""); }} />
                    <span>{t(k === "nric" ? "signup.nric" : "signup.passport")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={t("signup.idNumber")} inputMode={idType === "nric" ? "numeric" : "text"} autoComplete="off"
              value={idNumber} spellCheck={false}
              onChange={(e) => setIdNumber(idType === "nric" ? formatNric(e.target.value) : e.target.value.toUpperCase())}
              hint={t(idType === "nric" ? "signup.idHintNric" : "signup.idHintPassport")}
              error={show(!idOk, idType === "nric" ? "err.bad_nric" : "err.bad_passport")} />
          </>
        )}

        {step === 2 && (
          <>
            <SelectField label={t("signup.area")} value={areaId} onChange={setAreaId}>
              <option value="">{t("signup.areaPick")}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectField>
            <SelectField label={t("signup.unit")} value={unitId} onChange={setUnitId} disabled={!areaId}
              hint={t("signup.unitDemo")}>
              <option value="">{t("signup.unitPick")}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </SelectField>
            {touched && !unitId && <Banner kind="error">{t("err.unit_unknown")}</Banner>}
          </>
        )}

        {step === 3 && (
          <FilePicker file={file} onPick={pickFile}
            error={fileErr ? t(fileErr) : touched && !file ? t("err.required") : null} />
        )}

        {step === 4 && (
          <>
            <Field label={t("signup.nickname")} autoComplete="nickname" value={nickname} spellCheck={false}
              onChange={(e) => setNickname(e.target.value)} hint={t("signup.nicknameHint")}
              error={show(!isValidNickname(nickname), "err.bad_nickname")} />
            <Field label={t("login.email")} type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} error={show(!isValidEmail(email), "err.bad_email")} />
            <Field label={t("login.password")} type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} hint={t("signup.passwordHint")}
              error={show(!!passwordProblem(password), "err.weak_password")} />
            <Field label={t("signup.phone")} type="tel" inputMode="tel" autoComplete="tel" optional value={phone}
              onChange={(e) => setPhone(e.target.value)} />
          </>
        )}

        {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}

        <button className="btn btn-primary" type="submit" disabled={!!busy}>
          {busy === "creating" ? t("signup.creating") : busy === "uploading" ? t("signup.uploading")
            : step < TOTAL ? t("common.continue") : t("signup.create")}
        </button>
      </form>
      <p className="center" style={{ marginTop: 24 }}><Link to="/login/owner">{t("signup.have")}</Link></p>
    </main>
  );
}
