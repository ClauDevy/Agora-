'use client';

// Shows a patient's private link (/p/<token>) with copy, QR, and open buttons.
// Used on the create-success screen and the patient detail page.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function PatientLinkPanel({
  token,
  patientName,
}: {
  token: string;
  patientName?: string;
}) {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const url = origin ? `${origin}/p/${token}` : `/p/${token}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(`${origin}/p/${token}`, {
      width: 220,
      margin: 1,
      color: { dark: '#0a0b0d', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(''));
  }, [origin, token]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked; the URL is visible to copy manually */
    }
  }

  return (
    <div className="rounded-[16px] border border-[color:var(--card-border)] bg-background/40 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Private patient link
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 break-all rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">
          {url}
        </code>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] transition hover:opacity-90"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[color:var(--card-border)] px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Open
          </a>
        </div>
      </div>

      {qr && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`QR code to open ${patientName ?? 'patient'}'s AlalAI link`}
            className="rounded-lg bg-white p-2"
            width={220}
            height={220}
          />
          <p className="text-xs text-muted-foreground">
            Scan to open on the patient&apos;s phone
          </p>
        </div>
      )}
    </div>
  );
}
