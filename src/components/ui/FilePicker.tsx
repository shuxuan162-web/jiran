import { useId, useRef } from "react";
import { useI18n } from "../../i18n";
import { DOC_TYPES } from "../../lib/validation";
import { IconUpload } from "./Icons";

export function FilePicker({ file, onPick, error }: { file: File | null; onPick: (f: File | null) => void; error?: string | null }) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <span className="label" id={`${id}-l`}>{t("signup.cert")}</span>
      <button type="button" className="file-drop" aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`}
        onClick={() => ref.current?.click()} style={{ width: "100%" }}>
        <IconUpload width={32} height={32} />
        <span>{file ? t("signup.certChosen", { name: file.name }) : t("signup.certChoose")}</span>
      </button>
      <input ref={ref} type="file" hidden accept={DOC_TYPES.join(",")}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <span className="hint" id={`${id}-h`}>{t("signup.certHint")}</span>
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}
