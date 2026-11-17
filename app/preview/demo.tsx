"use client";

import { useState } from "react";
import { SlotPicker } from "../appointment/booking-form";
import { availableStarts, formatAppointment } from "@/lib/time";

type Entry = { id: string; start: string; status: "pending" | "confirmed" | "declined" | "cancelled" };
const rules = Array.from({ length: 5 }, (_, day) => ({ weekday: day + 1, opens_at: "10:00:00", closes_at: "17:00:00" }));
const settings = { slot_minutes: 30, buffer_minutes: 15, window_days: 14 };
const end = (start: string) => Date.parse(start) + 45 * 60_000;

export function Demo() {
  const [mode, setMode] = useState<"client" | "advocate">("client");
  const [now, setNow] = useState<Date>();
  const [selected, select] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [receipt, setReceipt] = useState("");
  const [rescheduling, setRescheduling] = useState("");
  const [conflict, setConflict] = useState("");
  const confirmed = entries.filter(entry => entry.status === "confirmed");
  const reserved = confirmed.filter(entry => entry.id !== rescheduling).map(entry => ({
    start: entry.start, end: new Date(end(entry.start)).toISOString(),
  }));
  const starts = now ? availableStarts(rules, [], settings, [], reserved, now).slice(0, 15) : [];

  function open(view: typeof mode) {
    setNow(current => current ?? new Date());
    setMode(view);
    select("");
    setRescheduling("");
    setConflict("");
  }

  function update(entry: Entry, status: Entry["status"], start = entry.start) {
    if (status === "confirmed" && confirmed.some(row => row.id !== entry.id && Date.parse(start) < end(row.start) && end(start) > Date.parse(row.start))) {
      setConflict("This time is reserved. Decline the overlapping request or reschedule the confirmed appointment.");
      return;
    }
    setEntries(previous => previous.map(item => item.id === entry.id ? { ...item, status, start } : item));
    setRescheduling("");
    select("");
    setConflict("");
  }

  return <div className="stack">
    <div className="inline" aria-label="Demo view">
      <button className={"button" + (mode === "client" ? "" : " alt")} aria-pressed={mode === "client"} onClick={() => open("client")}>Client view</button>
      <button className={"button" + (mode === "advocate" ? "" : " alt")} aria-pressed={mode === "advocate"} onClick={() => open("advocate")}>Advocate view</button>
    </div>
    {mode === "client" ? <section className="panel stack">
      {!now ? <button className="button alt" onClick={() => open("client")}>Show sample times</button> : <>
        <h2>Available times</h2>
        <p className="muted">Sample Client · client@example.com · India Standard Time</p>
        <SlotPicker starts={starts} selected={selected} onSelect={select} />
        <button className="button" disabled={!selected} onClick={() => {
          setEntries(old => [...old, { id: crypto.randomUUID(), start: selected, status: "pending" }]);
          setReceipt(selected);
          select("");
        }}>Request sample appointment</button>
        {receipt && <p className="notice" role="status">Request received for {formatAppointment.format(new Date(receipt))} IST. Switch to advocate view to review it.</p>}
      </>}
    </section> : <section className="panel stack">
      <h2>Sample requests</h2>
      {!entries.length && <p className="muted">Create a sample request from the client view.</p>}
      {conflict && <p className="notice error" role="alert">{conflict}</p>}
      {entries.map(entry => <article className="entry stack" key={entry.id}>
        <div><h3>Sample Client</h3><time dateTime={entry.start}>{formatAppointment.format(new Date(entry.start))} IST</time>{" "}<span className="badge">{entry.status}</span></div>
        {entry.status === "pending" && <div className="inline"><button className="button" onClick={() => update(entry, "confirmed")}>Approve request</button><button className="button alt" onClick={() => update(entry, "declined")}>Decline</button></div>}
        {entry.status === "confirmed" && <>
          <p className="muted">Calendar event and confirmation email simulated.</p>
          <div className="inline"><button className="button alt" onClick={() => { setRescheduling(entry.id); select(""); }}>Reschedule</button><button className="button alt" onClick={() => update(entry, "cancelled")}>Cancel appointment</button></div>
          {rescheduling === entry.id && <><SlotPicker starts={starts.filter(start => start !== entry.start)} selected={selected} onSelect={select} /><button className="button" disabled={!selected} onClick={() => update(entry, "confirmed", selected)}>Save new time</button></>}
        </>}
      </article>)}
      {entries.length > 0 && <button className="button alt" onClick={() => { setEntries([]); setReceipt(""); open("client"); }}>Reset demo</button>}
    </section>}
  </div>;
}
