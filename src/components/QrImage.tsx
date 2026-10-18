import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code drawn on the phone (no image service involved). */
export default function QrImage({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1E1B1A", light: "#FFFFFF" } })
      .then((u) => { if (alive) setSrc(u); }).catch(() => setSrc(null));
    return () => { alive = false; };
  }, [value, size]);
  return src
    ? <img src={src} width={size} height={size} alt={label} className="qr-image" />
    : <div className="qr-image" style={{ width: size, height: size }} role="img" aria-label={label} />;
}
