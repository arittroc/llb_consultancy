"use client";

import { useActionState, useState } from "react";
import { enrollMfa, verifyMfa, type FormState } from "./actions";

type Action = (state: FormState, data: FormData) => Promise<FormState>;

function Result({ state }: { state: FormState }) {
  const [copied, setCopied] = useState(false);
  return <>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    {state.success && <p className="notice" role="status">{state.success}</p>}
    {state.link && <div className="notice stack">
      <label className="field">Appointment invitation<input readOnly value={state.link} onFocus={event => event.currentTarget.select()} /></label>
      <button type="button" className="button alt" onClick={async () => {
        try { await navigator.clipboard.writeText(state.link || ""); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? "Copied" : "Copy invitation"}</button>
    </div>}
  </>;
}

export function ActionForm({ action, label, children, secondary = false, compact = false, danger = false }: { action: Action; label: string; children?: React.ReactNode; secondary?: boolean; compact?: boolean; danger?: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  return <form className={compact ? "inline" : "stack"} action={submit} onSubmit={event => {
    if (danger && !window.confirm("Cancel this appointment and notify the client?")) event.preventDefault();
  }}>
    {children}
    <button className={"button" + (secondary ? " alt" : "")} disabled={pending}>{pending ? "Working…" : label}</button>
    <Result state={state} />
  </form>;
}

export function MfaSetup({ factor }: { factor?: string }) {
  const [setup, enroll, pending] = useActionState(enrollMfa, {});
  const factorId = factor || setup.factor;
  if (!factorId) return <form className="stack" action={enroll}>
    <p className="muted">Set up an authenticator app before viewing appointment records.</p>
    <button className="button" disabled={pending}>{pending ? "Creating key…" : "Set up authenticator"}</button>
    <Result state={setup} />
  </form>;

  return <div className="stack">
    {setup.qr && <div>
      <p className="muted">Scan the QR code with your authenticator app or enter the setup key.</p>
      { /* Supabase supplies a local data URI for the authenticator image. */ }
      <img width={180} height={180} alt="Authenticator setup QR code" src={setup.qr} />
      <p><code>{setup.secret}</code></p>
    </div>}
    <ActionForm action={verifyMfa} label="Verify code">
      <input type="hidden" name="factor" value={factorId} />
      <label className="field">Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" /></label>
    </ActionForm>
  </div>;
}
