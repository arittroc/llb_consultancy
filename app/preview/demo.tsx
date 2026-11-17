"use client";

import { useEffect, useRef, useState } from "react";
import { SlotPicker } from "../appointment/booking-form";
import { availableStarts, formatAppointment, formatDay, istDay } from "@/lib/time";

type Status = "pending" | "confirmed" | "declined" | "cancelled";
type Entry = { id: number; start: string; status: Status };
const rules = Array.from({ length: 5 }, (_, day) => ({ weekday: day + 1, opens_at: "10:00:00", closes_at: "17:00:00" }));
const settings = { slot_minutes: 30, buffer_minutes: 15, window_days: 14 };
const end = (start: string) => Date.parse(start) + (settings.slot_minutes + settings.buffer_minutes) * 60_000;
const label = (start: string) => formatAppointment.format(new Date(start)) + " IST";

function SampleTimes({ starts, selected, onSelect }: {
  starts: string[]; selected: string; onSelect: (start: string) => void;
}) {
  const [day, setDay] = useState("");
  const days = new Map<string, string>();
  for (const start of starts) {
    const key = istDay(start);
    if (!days.has(key)) days.set(key, formatDay.format(new Date(start)));
  }
  const current = days.has(day) ? day : days.keys().next().value;
  if (!current) return <p className="muted">All sample times are reserved.</p>;

  return <div className="stack">
    <label className="field demo-date">Appointment date
      <select value={current} onChange={event => { setDay(event.target.value); onSelect(""); }}>
        {Array.from(days, ([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
    </label>
    <SlotPicker starts={starts.filter(start => istDay(start) === current)} selected={selected} onSelect={onSelect} />
  </div>;
}

export function Demo() {
  const [mode, setMode] = useState<"client" | "advocate">("client");
  const [now, setNow] = useState<Date>();
  const [selected, select] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [receipt, setReceipt] = useState("");
  const [rescheduling, setRescheduling] = useState<number>();
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState("");
  const nextId = useRef(1);

  useEffect(() => setNow(new Date()), []);

  const pending = entries.filter(entry => entry.status === "pending").length;
  const confirmed = entries.filter(entry => entry.status === "confirmed");
  const reserved = confirmed.filter(entry => entry.id !== rescheduling).map(entry => ({
    start: entry.start,
    end: new Date(end(entry.start)).toISOString(),
  }));
  const starts = now ? availableStarts(rules, [], settings, [], reserved, now) : [];

  function open(view: typeof mode) {
    setMode(view);
    select("");
    setRescheduling(undefined);
    setConflict("");
    setMessage("");
  }

  function request() {
    if (!starts.includes(selected)) return;
    const entry: Entry = { id: nextId.current++, start: selected, status: "pending" };
    setEntries(old => [...old, entry]);
    setReceipt(selected);
    select("");
  }

  function update(entry: Entry, status: Status, start = entry.start) {
    if (status === "confirmed" && confirmed.some(row => row.id !== entry.id && Date.parse(start) < end(row.start) && end(start) > Date.parse(row.start))) {
      setConflict("This time is reserved. Decline the overlapping request or reschedule the confirmed appointment.");
      setMessage("");
      return;
    }
    setEntries(previous => previous.map(item => item.id === entry.id ? { ...item, status, start } : item));
    setRescheduling(undefined);
    select("");
    setConflict("");
    if (status === "confirmed") {
      setMessage((start === entry.start ? "Sample appointment approved for " : "Sample appointment moved to ") + label(start) + ".");
    } else {
      setMessage("Sample appointment " + status + ".");
    }
  }

  return <div className="stack demo">
    <div className="demo-toolbar">
      <div className="inline" role="group" aria-label="Demo view">
        <button type="button" className={"button" + (mode === "client" ? "" : " alt")} aria-pressed={mode === "client"} onClick={() => open("client")}>Client view</button>
        <button type="button" className={"button" + (mode === "advocate" ? "" : " alt")} aria-pressed={mode === "advocate"} onClick={() => open("advocate")}>Advocate view{pending > 0 ? " (" + pending + ")" : ""}</button>
      </div>
      {entries.length > 0 && <button type="button" className="demo-reset" onClick={() => { setEntries([]); setReceipt(""); open("client"); }}>Reset demo</button>}
    </div>

    {mode === "client" ? <section className="panel stack">
      <div>
        <h2>Request an appointment</h2>
        <p className="muted">Sample Client &middot; client@example.com &middot; India Standard Time</p>
      </div>
      {receipt && <div className="notice stack">
        <p role="status">Request received for {label(receipt)}.</p>
        <button type="button" className="button alt" onClick={() => open("advocate")}>Review in advocate view</button>
      </div>}
      {now ? <SampleTimes starts={starts} selected={selected} onSelect={select} /> : <p role="status">Loading sample availability&hellip;</p>}
      <button type="button" className="button" disabled={!starts.includes(selected)} onClick={request}>Request sample appointment</button>
    </section> : <section className="panel stack">
      <div>
        <h2>Appointment requests</h2>
        <p className="muted">{pending} pending &middot; {confirmed.length} confirmed</p>
      </div>
      {!entries.length && <p className="muted">Create a sample request in the client view to try the approval workflow.</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {conflict && <p className="notice error" role="alert">{conflict}</p>}
      {entries.map(entry => <article className="entry stack" key={entry.id}>
        <div className="demo-entry-heading">
          <div><h3>Sample Client</h3><time dateTime={entry.start}>{label(entry.start)}</time></div>
          <span className={"badge demo-status demo-status-" + entry.status}>{entry.status}</span>
        </div>
        {entry.status === "pending" && <div className="inline">
          <button type="button" className="button" onClick={() => update(entry, "confirmed")}>Approve request</button>
          <button type="button" className="button alt" onClick={() => update(entry, "declined")}>Decline</button>
        </div>}
        {entry.status === "confirmed" && <>
          <p className="muted">Calendar event and confirmation email simulated.</p>
          <div className="inline">
            <button type="button" className="button alt" onClick={() => { setRescheduling(entry.id); select(""); setConflict(""); }}>Reschedule</button>
            <button type="button" className="button alt" onClick={() => update(entry, "cancelled")}>Cancel appointment</button>
          </div>
          {rescheduling === entry.id && <div className="demo-reschedule stack">
            <SampleTimes starts={starts.filter(start => start !== entry.start)} selected={selected} onSelect={select} />
            <div className="inline">
              <button type="button" className="button" disabled={!selected} onClick={() => update(entry, "confirmed", selected)}>Save new time</button>
              <button type="button" className="button alt" onClick={() => { setRescheduling(undefined); select(""); }}>Keep current time</button>
            </div>
          </div>}
        </>}
      </article>)}
    </section>}
  </div>;
}
