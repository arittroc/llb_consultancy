import type { Metadata } from "next";
import Link from "next/link";
import { publicAssetUrl } from "@/lib/storage";
import "./profile.css";

export const metadata: Metadata = {
  title: "Trishik Seksaria | Advocate, Calcutta High Court",
  description: "Professional profile of Trishik Seksaria, BBA LL.B. (Hons.), practising at the Calcutta High Court.",
};

export default function ProfilePage() {
  const portrait = publicAssetUrl(process.env.PORTRAIT_OBJECT_KEY);
  const demo = process.env.NODE_ENV === "development" || process.env.ENABLE_DEMO === "true";
  const publicBooking = process.env.PUBLIC_BOOKING === "true";

  return (
    <div className="profile-site" id="top">
      <a className="profile-skip" href="#profile-main">Skip to content</a>
      <header className="profile-header">
        <div className="profile-wrap profile-navigation">
          <Link className="profile-brand" href="/" aria-label="Trishik Seksaria home">
            <span className="profile-seal" aria-hidden="true">TS</span>
            <span>Trishik Seksaria</span>
          </Link>
          <nav className="profile-nav" aria-label="Main navigation">
            <a href="#profile">Profile</a>
            <a href="#practice">Practice</a>
            {publicBooking && <Link href="/appointment">Appointments</Link>}
            {demo && <Link href="/preview">Appointment demo</Link>}
          </nav>
        </div>
      </header>

      <main id="profile-main">
        <section className="profile-hero profile-wrap" aria-labelledby="profile-title">
          <div className="profile-hero-copy">
            <p className="profile-kicker">Advocate <span aria-hidden="true" /> Calcutta High Court</p>
            <h1 id="profile-title">Trishik <em>Seksaria</em></h1>
            <p className="profile-credential">BBA LL.B. (Hons.)</p>
            <div className="profile-actions">
              <a href="#profile" className="profile-primary">View profile <span aria-hidden="true">&#8595;</span></a>
              {publicBooking && <Link className="profile-secondary" href="/appointment">Appointments <span aria-hidden="true">&#8599;</span></Link>}
              {demo && !publicBooking && <Link className="profile-secondary" href="/preview">Try the appointment demo <span aria-hidden="true">&#8599;</span></Link>}
            </div>
          </div>
          <figure className="profile-art">
            <div className="profile-art-inset">
              {portrait ? (
                <img className="profile-portrait" src={portrait} alt="Trishik Seksaria" fetchPriority="high" />
              ) : (
                <div className="profile-art-monogram" aria-hidden="true">
                  <span className="profile-art-arch" />
                  <span className="profile-art-mark"><span>T</span><i>S</i></span>
                  <span className="profile-art-star">&#10022;</span>
                </div>
              )}
            </div>
            <figcaption className="profile-art-caption">
              <span>Calcutta High Court</span><span>Kolkata, India</span>
            </figcaption>
          </figure>
        </section>

        <section className="profile-overview" id="profile" aria-labelledby="profile-overview-title">
          <div className="profile-wrap profile-overview-grid">
            <div className="profile-overview-copy">
              <h2 id="profile-overview-title">Professional profile</h2>
              <p>Trishik Seksaria is an advocate practising at the Calcutta High Court in Kolkata. He holds a BBA LL.B. (Hons.) degree.</p>
            </div>
            <section className="profile-details" id="practice" aria-labelledby="profile-practice-title">
              <h3 id="profile-practice-title">Practice details</h3>
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
          <Link className="profile-brand" href="/" aria-label="Trishik Seksaria home">
            <span className="profile-seal" aria-hidden="true">TS</span>
            <span>Trishik Seksaria</span>
          </Link>
          <nav aria-label="Footer navigation">
            <Link href="/privacy">Privacy notice</Link>
            <Link href="/admin">Practice sign-in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
