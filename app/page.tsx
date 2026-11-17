import type { Metadata } from "next";
import Link from "next/link";
import { publicAssetUrl } from "@/lib/storage";
import "./profile.css";

export const metadata: Metadata = {
  title: "Trishik Seksaria | Advocate, Calcutta High Court",
  description: "Professional profile of Trishik Seksaria, BBA LL.B. (Hons.), practising at the Calcutta High Court.",
};

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

export default function ProfilePage() {
  const portrait = publicAssetUrl(process.env.PORTRAIT_OBJECT_KEY);
  const demo = process.env.NODE_ENV === "development" || process.env.ENABLE_DEMO === "true";
  const publicBooking = process.env.PUBLIC_BOOKING === "true";

  return (
    <div className="profile-site" id="top">
      <a className="profile-skip" href="#profile-main">Skip to content</a>
      <header className="profile-header">
        <div className="profile-wrap profile-navigation">
          <Link href="/" className="profile-brand" aria-label="Trishik Seksaria home">
            <span className="profile-seal" aria-hidden="true">TS</span>
            <span>Trishik Seksaria</span>
          </Link>
          <nav className="profile-nav" aria-label="Main navigation">
            <a href="#profile">Profile</a>
            <a href="#practice">Practice</a>
            {publicBooking && <Link href="/appointment">Appointments <Arrow diagonal /></Link>}
          </nav>
        </div>
      </header>

      <main id="profile-main">
        <section className="profile-hero" aria-labelledby="profile-title">
          <div className="profile-wrap profile-hero-grid">
            <div className="profile-hero-copy">
              <p className="profile-kicker">Advocate <span /> Calcutta High Court</p>
              <h1 id="profile-title">Trishik<br /><em>Seksaria</em></h1>
              <p className="profile-credential">BBA LL.B. (Hons.)</p>
              <a href="#profile" className="profile-primary">Professional profile <Arrow diagonal /></a>
            </div>
            <div className="profile-art">
              <div className="profile-art-inset">
                {portrait ? <img className="profile-portrait" src={portrait} alt="Trishik Seksaria" fetchPriority="high" /> : <div className="profile-art-monogram" aria-hidden="true">
                  <span className="profile-art-star profile-art-star-top">&#10022;</span>
                  <span className="profile-art-mark">T<i>S</i></span>
                  <span className="profile-art-star profile-art-star-bottom">&#10022;</span>
                </div>}
              </div>
              <div className="profile-art-caption"><span>Calcutta High Court</span><span>Kolkata, India</span></div>
            </div>
          </div>
        </section>

        <section className="profile-overview" id="profile" aria-labelledby="profile-overview-title">
          <div className="profile-wrap profile-overview-grid">
            <div>
              <p className="profile-kicker"><span /> Professional profile</p>
              <h2 id="profile-overview-title">Trishik Seksaria</h2>
            </div>
            <p>Trishik Seksaria is an advocate practising at the Calcutta High Court in Kolkata. He holds a BBA LL.B. (Hons.) degree.</p>
          </div>
          <div className="profile-wrap">
            <section className="profile-details" id="practice" aria-labelledby="profile-practice-title">
              <h2 id="profile-practice-title">Practice details</h2>
              <dl>
                <div><dt>Court</dt><dd>Calcutta High Court</dd></div>
                <div><dt>Location</dt><dd>Kolkata, West Bengal</dd></div>
                <div><dt>Qualification</dt><dd>BBA LL.B. (Hons.)</dd></div>
              </dl>
            </section>
          </div>
        </section>
      </main>

      <footer className="profile-footer">
        <div className="profile-wrap profile-footer-inner">
          <Link href="/" className="profile-brand" aria-label="Trishik Seksaria home">
            <span className="profile-seal" aria-hidden="true">TS</span>
            <span>Trishik Seksaria</span>
          </Link>
          <nav aria-label="Footer navigation">
            <Link href="/privacy">Privacy</Link>
            {demo && <Link href="/preview">Appointment demo</Link>}
            <Link href="/admin">Practice sign-in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
