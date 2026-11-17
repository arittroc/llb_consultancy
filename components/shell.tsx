import Link from "next/link";

export function Shell({ title, lead, narrow = false, children }: { title: string; lead?: string; narrow?: boolean; children: React.ReactNode }) {
  return <main className={"shell" + (narrow ? " narrow" : "")}>
    <nav className="utility-nav" aria-label="Page navigation">
      <Link className="wordmark" href="/">Trishik Seksaria</Link>
      <Link href="/privacy">Privacy notice</Link>
    </nav>
    <header className="utility-intro"><h1 className="utility-title">{title}</h1>{lead && <p>{lead}</p>}</header>
    {children}
  </main>;
}
