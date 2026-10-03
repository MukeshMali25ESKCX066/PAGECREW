import React, {useEffect, useRef, useState} from "react";
import "./LandingPage.css";

export type HomeAuthMode = "login" | "register" | "admin";
export type HomeRegistrationForm = {
  name: string;
  email: string;
  phone: string;
  country: string;
  password: string;
  confirmPassword: string;
  accountType: string;
  company: string;
};
export type HomeEmailAvailability = "" | "checking" | "available" | "taken" | "invalid" | "error";

type Props = {
  authMode: HomeAuthMode;
  setAuthMode: React.Dispatch<React.SetStateAction<HomeAuthMode>>;
  authForm: HomeRegistrationForm;
  setAuthForm: React.Dispatch<React.SetStateAction<HomeRegistrationForm>>;
  authMessage: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  emailAvailability: HomeEmailAvailability;
  termsAccepted: boolean;
  setTermsAccepted: React.Dispatch<React.SetStateAction<boolean>>;
  passwordRequirements: Array<{label: string; valid: boolean}>;
  passwordStrength: number;
  passwordsMatch: boolean;
  approvalPending: boolean;
  onLogout: () => void;
};

const pageFeatures = [
  ["✈", "Multi-Page Posting", "Post to multiple Pages at once"],
  ["▦", "Smart Scheduling", "Plan and automate your content"],
  ["▤", "Content Calendar", "Stay organized with visual planning"],
  ["▥", "Performance Insights", "Track performance and grow faster"],
  ["◉", "Multi-Account Support", "Manage multiple profiles easily"]
];

const plans = [
  { name: "Demo", summary: "Try PageCrew with full features for 2 days.", price: "₹0", period: "2-day access", items: ["2 Days Full Access", "1 Profile Access", "Up to 8 Pages", "All Core Features", "No Credit Card"], badge: "2 DAYS FREE" },
  { name: "Pro", summary: "Best for individuals.", price: "₹2,999", period: "/ month", items: ["1 Profile Access", "Up to 8 Pages per Profile", "All Core Features", "Performance Insights", "Smart Scheduling"], badge: "POPULAR" },
  { name: "Growth", summary: "For multiple profiles.", price: "₹2,999", period: "/ month", items: ["3 Profile Access", "Up to 8 Pages per Profile", "Up to 24 Pages", "Advanced Insights", "Priority Support"] },
  { name: "Business", summary: "For growing businesses.", price: "₹3,999", period: "/ month", items: ["4 Profile Access", "Up to 8 Pages per Profile", "Up to 32 Pages", "All Core Features", "Dedicated Support"] },
  { name: "Agency", summary: "For agencies & large teams.", price: "₹4,999", period: "/ month", items: ["5 Profile Access", "Up to 8 Pages per Profile", "Up to 40 Pages", "Advanced Management", "Priority Support"] }
];

const faq = [
  ["What is PageCrew?", "PageCrew is a service-based social media management platform for managing connected profiles, Pages, posts, scheduling and available insights."],
  ["How does the 2-day demo work?", "The Demo plan provides 2 days of access so you can test PageCrew before selecting a monthly subscription."],
  ["How many Pages can I connect per profile?", "Each profile can connect up to 8 Pages. Your total capacity depends on your subscription plan."],
  ["Can I upgrade later?", "Yes. Your billing system can support upgrading to a plan with more profiles."],
  ["Can I manage multiple clients?", "Multi-profile plans are designed for users who need to manage separate profiles, brands or client workflows."]
];

function goToAccount(mode: HomeAuthMode, setAuthMode: Props["setAuthMode"]) {
  setAuthMode(mode);
  const path = mode === "register" ? "/register" : mode === "admin" ? "/suuperadmin" : "/login";
  window.location.assign(path);
}

function HomeAmbientEffects() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const layer = layerRef.current;
    const canvas = layer?.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!layer || !canvas || !context || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const symbols = [
      {text: "f", color: "#1877f2"}, {text: "p", color: "#e60023"},
      {text: "▶", color: "#ff0033"}, {text: "𝕏", color: "#fff"}
    ];
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let mouseX = -1000;
    let mouseY = -1000;
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let ringX = cursorX;
    let ringY = cursorY;
    let particles: Array<{x: number; y: number; vx: number; vy: number; size: number; phase: number; symbol: typeof symbols[number]}> = [];

    function resizeCanvas() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(78, Math.max(42, Math.floor(width * height / 22000)));
      particles = Array.from({length: count}, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - .5) * .2,
        vy: (Math.random() - .5) * .2,
        size: 8 + Math.random() * 9,
        phase: Math.random() * Math.PI * 2,
        symbol: symbols[Math.floor(Math.random() * symbols.length)]
      }));
    }

    function draw(time: number) {
      context!.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        const dx = particle.x - mouseX;
        const dy = particle.y - mouseY;
        const distance = Math.hypot(dx, dy);
        if (distance < 110 && distance > 0) {
          particle.vx += dx / distance * .012;
          particle.vy += dy / distance * .012;
        }
        particle.vx *= .995;
        particle.vy *= .995;
        particle.x += particle.vx + Math.sin(time * .0004 + particle.phase) * .03;
        particle.y += particle.vy + Math.cos(time * .00035 + particle.phase) * .03;
        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;

        const alpha = .25 + .14 * Math.sin(time * .001 + particle.phase);
        context!.globalAlpha = alpha;
        context!.shadowBlur = 10;
        context!.shadowColor = particle.symbol.color;
        context!.fillStyle = particle.symbol.color;
        context!.font = `800 ${particle.size}px Arial, sans-serif`;
        context!.textAlign = "center";
        context!.textBaseline = "middle";
        context!.fillText(particle.symbol.text, particle.x, particle.y);
      });

      context!.shadowBlur = 0;
      context!.globalAlpha = 1;
      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const a = particles[first];
          const b = particles[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 105) continue;
          context!.beginPath();
          context!.moveTo(a.x, a.y);
          context!.lineTo(b.x, b.y);
          context!.strokeStyle = `rgba(100, 171, 255, ${(1 - distance / 105) * .11})`;
          context!.lineWidth = .65;
          context!.stroke();
        }
      }

      const cursor = layer!.querySelector<HTMLElement>(".reference-cursor-dot");
      const ring = layer!.querySelector<HTMLElement>(".reference-cursor-ring");
      const badges = [...layer!.querySelectorAll<HTMLElement>(".reference-cursor-badge")];
      cursorX += (mouseX - cursorX) * .3;
      cursorY += (mouseY - cursorY) * .3;
      ringX += (mouseX - ringX) * .13;
      ringY += (mouseY - ringY) * .13;
      cursor!.style.transform = `translate3d(${cursorX}px,${cursorY}px,0) translate(-50%,-50%)`;
      ring!.style.transform = `translate3d(${ringX}px,${ringY}px,0) translate(-50%,-50%)`;

      let followX = mouseX;
      let followY = mouseY;
      badges.forEach((badge, index) => {
        const speed = .2 - index * .018;
        const trailX = Number(badge.dataset.x || mouseX);
        const trailY = Number(badge.dataset.y || mouseY);
        const nextX = trailX + (followX - trailX) * speed;
        const nextY = trailY + (followY - trailY) * speed;
        badge.dataset.x = String(nextX);
        badge.dataset.y = String(nextY);
        badge.style.transform = `translate3d(${nextX}px,${nextY}px,0) translate(-50%,-50%) rotate(${index % 2 ? -1 : 1}deg)`;
        followX = nextX;
        followY = nextY;
      });

      animationFrame = window.requestAnimationFrame(draw);
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      mouseX = event.clientX;
      mouseY = event.clientY;
      layer!.classList.add("pointer-active");
      const target = event.target;
      layer!.classList.toggle("pointer-hover", target instanceof Element && Boolean(target.closest("a,button,input,select,summary")));
    }

    function handlePointerLeave() {
      mouseX = -1000;
      mouseY = -1000;
      layer!.classList.remove("pointer-active", "pointer-hover");
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const burstSymbols = ["f", "p", "▶", "𝕏"];
      burstSymbols.forEach((symbol, index) => {
        const burst = document.createElement("span");
        const angle = Math.PI * 2 / burstSymbols.length * index - Math.PI / 2;
        const distance = 43 + Math.random() * 25;
        burst.className = `reference-cursor-burst burst-${index}`;
        burst.textContent = symbol;
        burst.style.left = `${event.clientX}px`;
        burst.style.top = `${event.clientY}px`;
        burst.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
        burst.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
        layer!.appendChild(burst);
        window.setTimeout(() => burst.remove(), 800);
      });
    }

    resizeCanvas();
    animationFrame = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resizeCanvas, {passive: true});
    window.addEventListener("pointermove", handlePointerMove, {passive: true});
    window.addEventListener("pointerleave", handlePointerLeave, {passive: true});
    window.addEventListener("pointerdown", handlePointerDown, {passive: true});

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("pointerdown", handlePointerDown);
      layer.querySelectorAll(".reference-cursor-burst").forEach((burst) => burst.remove());
    };
  }, []);

  return <div className="reference-effects" ref={layerRef} aria-hidden="true">
    <canvas className="reference-particle-canvas" />
    <span className="reference-cursor-dot" />
    <span className="reference-cursor-ring" />
    <span className="reference-cursor-badge badge-fb">f</span><span className="reference-cursor-badge badge-pin">p</span><span className="reference-cursor-badge badge-yt">▶</span><span className="reference-cursor-badge badge-x">𝕏</span>
  </div>;
}

export default function LandingPage(props: Props) {
  const [heroTilt, setHeroTilt] = React.useState({ x: 0, y: 0 });
  const {
    authMode, setAuthMode, authForm, setAuthForm, authMessage, onSubmit,
    emailAvailability, termsAccepted, setTermsAccepted, passwordRequirements,
    passwordStrength, passwordsMatch, approvalPending, onLogout
  } = props;

  return <div className="reference-home">
    <HomeAmbientEffects />
    <header className="reference-header">
      <div className="reference-container reference-header-inner">
        <a className="reference-logo" href="#home" aria-label="PageCrew home"><img src="/pagecrew-logo.png" alt="PageCrew" /></a>
        <nav aria-label="Main navigation"><a href="#home">Home</a><a href="#features">Features</a><a href="#plans">Plans</a><a href="#how">How It Works</a><a href="#faq">FAQs</a><a href="#contact">Contact</a></nav>
        <div className="reference-header-actions"><button className="reference-btn reference-ghost" type="button" onClick={() => goToAccount("login", setAuthMode)}>Login</button><button className="reference-btn reference-blue" type="button" onClick={() => goToAccount("register", setAuthMode)}>Register</button></div>
      </div>
    </header>

    {approvalPending && <div className="reference-pending" role="status"><span>Your account is awaiting super admin approval.</span><button type="button" onClick={onLogout}>Log out</button></div>}

    <main>
      <section className="reference-hero" id="home">
        <div className="reference-celestial-scene" aria-hidden="true">
          <div className="reference-starfield reference-starfield-far" />
          <div className="reference-starfield reference-starfield-near" />
          <div className="reference-moon">
            <span className="reference-moon-crater crater-one" />
            <span className="reference-moon-crater crater-two" />
            <span className="reference-moon-crater crater-three" />
            <span className="reference-moon-crater crater-four" />
          </div>
        </div>
        <div className="reference-container reference-hero-grid">
          <div className="reference-hero-copy">
            <span className="reference-kicker">#1 SOCIAL MEDIA PAGE MANAGEMENT PLATFORM</span>
            <h1>One Click.<br /><span>Every Page.</span></h1>
            <p>Manage, schedule, and post to multiple social media accounts and pages from one powerful dashboard. Save time, reach more audience and grow faster with PageCrew.</p>
            <div className="reference-hero-actions"><button className="reference-btn reference-blue" type="button" onClick={() => goToAccount("register", setAuthMode)}>Get Started Free</button><button className="reference-btn reference-ghost" type="button" onClick={() => goToAccount("login", setAuthMode)}>Login</button></div>
            <div className="reference-trust"><span>2 Days Free Demo</span><span>No Credit Card</span><span>Easy Setup</span></div>
          </div>
          <div className="reference-hero-art" aria-label="PageCrew dashboard preview" onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            setHeroTilt({ x: Number((-y * 7).toFixed(2)), y: Number((x * 9).toFixed(2)) });
          }} onPointerLeave={() => setHeroTilt({ x: 0, y: 0 })}>
            <div className="reference-art-glow" />
            <img className="reference-hero-image" src="/pagecrew-image-2.png" alt="PageCrew creator using social media tools to grow Page reach" style={{ "--tilt-x": `${heroTilt.x}deg`, "--tilt-y": `${heroTilt.y}deg` } as React.CSSProperties} />
          </div>
        </div>
        <div className="reference-social-layer" aria-hidden="true">
          <div className="reference-social-orbit orbit-one">
            <span className="reference-orbit-icon orbit-facebook">f</span>
            <span className="reference-orbit-icon orbit-pinterest">p</span>
          </div>
          <div className="reference-social-orbit orbit-two">
            <span className="reference-orbit-icon orbit-youtube"><i /></span>
            <span className="reference-orbit-icon orbit-x">X</span>
          </div>
        </div>
      </section>

      <section className="reference-feature-strip" id="features"><div className="reference-container reference-feature-grid">{pageFeatures.map(([icon, title, copy]) => <article className="reference-feature" key={title}><span className="reference-icon">{icon}</span><h2>{title}</h2><p>{copy}</p></article>)}</div></section>

      <section className="reference-section"><div className="reference-container reference-showcase">
        <div className="reference-mock"><div className="reference-mock-inner"><div className="reference-mock-brand">🔵 PageCrew Dashboard</div><div className="reference-mock-layout"><aside><b>PAGECREW</b><span className="selected">Dashboard</span><span>Create Post</span><span>Schedule</span><span>Calendar</span><span>Accounts</span><span>Pages</span><span>Insights</span><span>Media Library</span><span>Settings</span></aside><div className="reference-mock-main"><h3>Create Post</h3><p>Post to selected Pages</p><div className="reference-mock-chart"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="reference-mock-stats"><div><b>8 / 8</b><small>Pages Connected</small></div><div><b>24</b><small>Posts This Month</small></div><div><b>+42%</b><small>Engagement</small></div><div><b>96%</b><small>Success Rate</small></div></div></div></div></div></div>
        <div className="reference-copy"><span className="reference-tag">Why PageCrew?</span><h2>Social Media<br /><em>Made Simple.</em></h2><p>PageCrew helps businesses, creators and agencies manage multiple social media pages from one platform. Create, schedule, publish and track performance — all in one place.</p><ul><li>Post to multiple pages at once</li><li>Connect up to 8 pages per profile</li><li>Smart scheduling and content calendar</li><li>Detailed insights and reports</li><li>Save time and grow your audience</li></ul><button className="reference-text-link" type="button" onClick={() => goToAccount("register", setAuthMode)}>Start 2 Days Free Demo <span>→</span></button></div>
      </div></section>

      <section className="reference-section reference-how" id="how"><div className="reference-container"><div className="reference-heading"><span className="reference-tag">How It Works</span><h2>Get Started in 4 Simple Steps</h2><p>Connect, create, schedule and grow — it’s that easy with PageCrew.</p></div><div className="reference-steps">{[["1", "Connect Accounts", "Connect your social media account and select your Pages."], ["2", "Create & Schedule", "Create your post and choose when to publish."], ["3", "Post to Multiple Pages", "Publish to multiple Pages with one click."], ["4", "Track Performance", "Check insights and see your growth."]].map(([n, title, copy]) => <article className="reference-step" key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

      <section className="reference-section reference-pricing" id="plans"><div className="reference-container"><div className="reference-heading"><span className="reference-tag">Choose Your Plan</span><h2>Simple & Transparent Pricing</h2><p>Start with a free demo and upgrade anytime. Every profile can connect up to 8 Pages.</p><small className="reference-plan-note">Subscription checkout is not enabled in this local build.</small></div><div className="reference-plans">{plans.map((plan, index) => <article className={`reference-plan ${index === 1 ? "popular" : ""}`} key={plan.name}>{plan.badge && <span className={`reference-badge ${index === 0 ? "demo" : ""}`}>{plan.badge}</span>}<h3>{plan.name}</h3><p>{plan.summary}</p><div className="reference-price">{plan.price}<small>{plan.period}</small></div><ul>{plan.items.map((item) => <li key={item}>{item}</li>)}</ul><button className="reference-btn reference-blue" type="button" onClick={() => goToAccount("register", setAuthMode)}>{index === 0 ? "Start Free Demo" : "Get Started"}</button></article>)}</div></div></section>

      <section className="reference-section reference-dark"><div className="reference-container"><div className="reference-heading"><span className="reference-tag">Everything You Need</span><h2>Powerful Features for Better Management</h2><p>One service for publishing, scheduling, content planning and performance.</p></div><div className="reference-dark-grid">{[
        ["✈", "Multi-Page Posting", "Post to multiple Pages at once"], ["▦", "Smart Scheduling", "Plan content in advance"], ["▤", "Content Calendar", "Visual calendar for planning"], ["▥", "Performance Insights", "Track engagement"], ["◉", "Multi-Profile Support", "Manage multiple profiles"], ["⬡", "Secure & Reliable", "Built for your workflow"]
      ].map(([icon, title, copy]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

      <section className="reference-section reference-testimonials"><div className="reference-container"><div className="reference-heading"><span className="reference-tag">What Our Users Say</span><h2>Trusted by Businesses & Creators</h2></div><div className="reference-testimonial-grid">{[
        ["RM", "Rahul Mehta", "Digital Marketer", "PageCrew has saved me hours every week. I can manage all my pages from one dashboard."], ["PS", "Pooja Sharma", "Content Creator", "The scheduling and multi-page posting workflow is easy to use and reliable."], ["AV", "Amit Verma", "Business Owner", "The multi-profile structure is useful when managing different brands or clients."]
      ].map(([initials, name, title, quote]) => <article key={initials}><header><span>{initials}</span><div><b>{name}</b><small>{title}</small><em>★★★★★</em></div></header><p>“{quote}”</p></article>)}</div></div></section>

      <section className="reference-section reference-faq" id="faq"><div className="reference-container"><div className="reference-heading"><span className="reference-tag">Frequently Asked Questions</span><h2>Got Questions? We’ve Got Answers.</h2></div><div className="reference-faq-list">{faq.map(([q, answer]) => <details key={q}><summary>{q}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="reference-cta" id="contact"><div className="reference-container"><h2>Ready to Manage Your Social Media Pages?</h2><p>Start your 2-day free demo today and experience the power of PageCrew.</p><button className="reference-btn reference-blue" type="button" onClick={() => goToAccount("register", setAuthMode)}>Get Started Free</button><button className="reference-btn reference-ghost" type="button" onClick={() => goToAccount("login", setAuthMode)}>Login</button></div></section>

      <section className="reference-account" id="home-account"><div className="reference-container reference-account-grid"><div><span className="reference-tag">PAGECREW ACCOUNT</span><h2>Access your workspace</h2><p>Register and wait for super admin approval before connecting Facebook and managing Pages.</p>{approvalPending && <div className="reference-approval"><strong>Account awaiting approval</strong><span>Your registration is saved. Workspace access starts after admin approval.</span><button type="button" onClick={onLogout}>Log out</button></div>}</div><div className="reference-auth-panel"><div className="reference-auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button><button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button><button type="button" className={authMode === "admin" ? "active" : ""} onClick={() => setAuthMode("admin")}>Super Admin</button></div><form className="reference-auth-form" onSubmit={onSubmit}>
        {authMode === "register" ? <>
          <label>Full Name *<input autoComplete="name" required maxLength={150} value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} placeholder="Enter your full name" /></label>
          <label>Email Address *<input type="email" autoComplete="email" required value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" aria-describedby="home-email-status" /></label>
          <p id="home-email-status" className={`home-email-status ${emailAvailability}`} role="status" aria-live="polite">{emailAvailability === "checking" ? "Checking email availability..." : emailAvailability === "available" ? "Email is available" : emailAvailability === "taken" ? "An account with this email already exists." : emailAvailability === "invalid" ? "Enter a valid email address." : emailAvailability === "error" ? "Unable to check email. Try again." : ""}</p>
          <div className="reference-form-row"><label>Mobile Number<input type="tel" maxLength={30} value={authForm.phone} onChange={(event) => setAuthForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+91 98765 43210" /></label><label>Country *<select required value={authForm.country} onChange={(event) => setAuthForm((current) => ({ ...current, country: event.target.value }))}><option value="">Select country</option><option value="IN">India</option><option value="US">United States</option><option value="UK">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label></div>
          <label>Password *<input type="password" autoComplete="new-password" minLength={8} required value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Create a strong password" /></label>
          <div className="reference-password"><div className="reference-strength"><i className={`strength-${passwordStrength}`} style={{ width: `${passwordStrength * 20}%` }} /></div><small>{authForm.password ? ["", "Weak", "Weak", "Fair", "Good", "Strong"][passwordStrength] : "Enter a password"}</small><div>{passwordRequirements.map((item) => <span className={item.valid ? "valid" : ""} key={item.label}>{item.valid ? "✓" : "○"} {item.label}</span>)}</div></div>
          <label>Confirm Password *<input type="password" autoComplete="new-password" required value={authForm.confirmPassword} onChange={(event) => setAuthForm((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Confirm your password" /></label>
          {authForm.confirmPassword && <p className={`reference-password-match ${passwordsMatch ? "valid" : "invalid"}`}>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</p>}
          <label>Account Type *<select required value={authForm.accountType} onChange={(event) => setAuthForm((current) => ({ ...current, accountType: event.target.value }))}><option value="">Select account type</option><option value="creator">Individual / Creator</option><option value="business">Business / Brand</option><option value="manager">Social Media Manager</option><option value="agency">Marketing Agency</option></select></label>
          <label>Company / Brand Name<input maxLength={150} value={authForm.company} onChange={(event) => setAuthForm((current) => ({ ...current, company: event.target.value }))} placeholder="Your company or brand" /></label>
          <label className="reference-terms"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I agree to the Terms of Service and <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>
        </> : <><label>Email<input type="email" autoComplete="email" required value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="Enter password" /></label></>}
        {authMessage && <p className="reference-auth-message" role="status">{authMessage}</p>}<button className="reference-btn reference-blue reference-submit" type="submit">{authMode === "register" ? "Create My PageCrew Account" : authMode === "admin" ? "Super Admin Login" : "Login"}</button>
      </form></div></div></section>
    </main>

    <footer className="reference-footer"><div className="reference-container"><div className="reference-footer-grid"><div><a className="reference-logo" href="#home" aria-label="PageCrew home"><img src="/pagecrew-logo.png" alt="PageCrew" /></a></div><div><h2>Product</h2><a href="#features">Features</a><a href="#plans">Pricing</a><a href="#how">How It Works</a><a href="#faq">FAQs</a></div><div><h2>Account</h2><button type="button" onClick={() => goToAccount("login", setAuthMode)}>Login</button><button type="button" onClick={() => goToAccount("register", setAuthMode)}>Register</button><a href="/privacy.html">Privacy Policy</a><a href="/data-deletion.html">Data Deletion</a></div><div><h2>Company</h2><a href="#contact">Contact</a><p>Facebook access depends on Meta app permissions and review.</p></div></div><div className="reference-footer-bottom"><span>© 2026 PageCrew. All rights reserved.</span><span>One Click. Every Page.</span></div></div></footer>
  </div>;
}