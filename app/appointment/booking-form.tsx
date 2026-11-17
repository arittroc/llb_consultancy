"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatAppointment, formatDay, formatTime, istDay } from "@/lib/time";

export function SlotPicker({ starts, selected, onSelect }: { starts: string[]; selected: string; onSelect: (start: string) => void }) {
  const groups = starts.reduce((map, start) => {
    const day = istDay(start);
    const values = map.get(day) || [];
    values.push(start);
    map.set(day, values);
    return map;
  }, new Map<string, string[]>());
  return <div>
    {[...groups].map(([day, values]) => <section key={day} aria-label={formatDay.format(new Date(values[0]))}>
      <h3 className="date-heading">{formatDay.format(new Date(values[0]))}</h3>
      <div className="times">{values.map(start => <button className="time" key={start} type="button" aria-pressed={start === selected} onClick={() => onSelect(start)}>{formatTime.format(new Date(start))}</button>)}</div>
    </section>)}
  </div>;
}

export function BookingForm({ invite }: { invite?: string }) {
  const [slots, setSlots] = useState<{ starts: string[]; minutes: number }>();
  const [selected, select] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requestKey = useRef<{ payload: string; key: string } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const headers: Record<string, string> = invite ? { "x-booking-invite": invite } : {};
    fetch("/api/availability", { headers, cache: "no-store", signal: abort.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setSlots(result);
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailabilityError("Availability is temporarily unavailable. Please try again.");
      });
    return () => abort.abort();
  }, [invite, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const details = { name: form.get("name"), email: form.get("email"), start: selected, invite };
    const payload = JSON.stringify(details);
    if (requestKey.current?.payload !== payload) requestKey.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, key: requestKey.current.key }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "The request could not be processed.");
      setReceived(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request could not be processed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (received) return <div className="panel" role="status"><h2>Request received</h2><p className="muted">The practice will review your request for {formatAppointment.format(new Date(selected))} IST and email you with the next step.</p></div>;
  if (availabilityError) return <div className="panel stack"><p role="alert" className="notice error">{availabilityError}</p><button className="button alt" onClick={() => { setAvailabilityError(""); setAttempt(value => value + 1); }}>Check again</button></div>;
  if (!slots) return <div className="panel" role="status">Checking availability…</div>;
  if (!slots.starts.length) return <div className="panel"><h2>No times available</h2><p className="muted">Please check again later for appointment availability.</p></div>;

  return <form className="panel stack" onSubmit={submit}>
    <div><h2>Available times</h2><p className="muted">{slots.minutes} minutes per appointment</p><SlotPicker starts={slots.starts} selected={selected} onSelect={select} /></div>
    <label className="field">Full name<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>
    <label className="field">Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    {error && <p className="notice error" role="alert">{error}</p>}
    {selected && <p className="muted" role="status">Selected {formatAppointment.format(new Date(selected))} IST</p>}
    <button className="button" disabled={busy || !selected}>{busy ? "Submitting…" : "Request appointment"}</button>
  </form>;
}
