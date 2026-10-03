import React, {useEffect} from "react";
import type {HomeAuthMode, HomeRegistrationForm} from "./LandingPage";
import "./AuthPage.css";

type Props = {
  authMode: HomeAuthMode;
  setAuthMode: (mode: HomeAuthMode) => void;
  authForm: HomeRegistrationForm;
  setAuthForm: React.Dispatch<React.SetStateAction<HomeRegistrationForm>>;
  authMessage: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  emailAvailability: "" | "checking" | "available" | "taken" | "invalid" | "error";
  termsAccepted: boolean;
  setTermsAccepted: React.Dispatch<React.SetStateAction<boolean>>;
  passwordRequirements: Array<{label: string; valid: boolean}>;
  passwordStrength: number;
  passwordsMatch: boolean;
  approvalPending: boolean;
  onLogout: () => void;
  adminTotpRequired: boolean;
  adminTotpCode: string;
  setAdminTotpCode: React.Dispatch<React.SetStateAction<string>>;
  onCancelAdminTotp: () => void;
};

const platformSymbols = [
  ["fb", "f", "8%", "22%", "30px"],
  ["ig", "◎", "18%", "78%", "25px"],
  ["pi", "p", "78%", "20%", "32px"],
  ["yt", "▶", "91%", "64%", "26px"],
  ["in", "in", "67%", "78%", "25px"],
  ["tk", "♪", "54%", "12%", "27px"],
  ["x", "𝕏", "34%", "88%", "24px"]
];

export default function AuthPage(props: Props) {
  const {
    authMode, setAuthMode, authForm, setAuthForm, authMessage, onSubmit,
    emailAvailability, termsAccepted, setTermsAccepted, passwordRequirements,
    passwordStrength, passwordsMatch, approvalPending, onLogout,
    adminTotpRequired, adminTotpCode, setAdminTotpCode, onCancelAdminTotp
  } = props;
  const isRegister = authMode === "register";
  const isAdmin = authMode === "admin";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = isRegister ? "Create Account — PageCrew" : isAdmin ? "Super Admin Login — PageCrew" : "Login — PageCrew";
    return () => { document.title = previousTitle; };
  }, [isAdmin, isRegister]);

  return <div className={`pagecrew-auth ${isRegister ? "register-page" : ""}`}>
    <div className="auth-background" aria-hidden="true">
      <span className="auth-orb auth-orb-one" />
      <span className="auth-orb auth-orb-two" />
      <span className="auth-orb auth-orb-three" />
      <span className="auth-stars" />
      <div className="auth-platforms">{platformSymbols.map(([className, symbol, left, top, size]) =>
        <span key={className} className={`auth-platform ${className}`} style={{left, top, fontSize: size}}>{symbol}</span>
      )}</div>
    </div>

    <main className="auth-wrap">
      <div className="pagecrew-auth-card">
        <section className="auth-brand-panel">
          <a className="auth-brand" href="/" aria-label="PageCrew home">
            <img src="/pagecrew-logo.png" alt="PageCrew" />
          </a>
          <div className="auth-pitch">
            <h1>One Click.<br /><span>Every Page.</span></h1>
            <p>Manage, publish and schedule your social media content from one powerful workspace.</p>
            <div className="auth-feature-pills"><b>● Multi-Page</b><b>✦ Smart Scheduling</b><b>↗ Insights</b></div>
          </div>
          <small className="auth-copyright">© 2026 PageCrew</small>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-heading">
            <h2>{isRegister ? "Create your account" : isAdmin ? "Super admin login" : "Welcome back"}</h2>
            <p>{isRegister
              ? "Start managing all your social pages from one place."
              : isAdmin
                ? adminTotpRequired ? "Enter your current six-digit Google Authenticator code to finish signing in." : "Sign in to review PageCrew account registrations."
                : "Login to continue to your PageCrew dashboard."}</p>
          </div>

          {approvalPending && <div className="auth-approval" role="status">
            <strong>Your account is awaiting super admin approval.</strong>
            <span>Workspace access starts after your registration is approved.</span>
            <button type="button" onClick={onLogout}>Log out</button>
          </div>}

          <form className="auth-form" onSubmit={onSubmit}>
            {isRegister && <>
              <label className="auth-field">Full name
                <input autoComplete="name" maxLength={150} required value={authForm.name} onChange={(event) => setAuthForm((current) => ({...current, name: event.target.value}))} placeholder="Your full name" />
              </label>
            </>}
            {!adminTotpRequired && <label className="auth-field">Email address
              <input type="email" autoComplete="email" required value={authForm.email} onChange={(event) => setAuthForm((current) => ({...current, email: event.target.value}))} placeholder="you@example.com" aria-describedby={isRegister ? "auth-email-status" : undefined} />
            </label>}
            {isRegister && <p id="auth-email-status" className={`auth-email-status ${emailAvailability}`} role="status" aria-live="polite">
              {emailAvailability === "checking" ? "Checking email availability..." : emailAvailability === "available" ? "Email is available" : emailAvailability === "taken" ? "An account with this email already exists." : emailAvailability === "invalid" ? "Enter a valid email address." : emailAvailability === "error" ? "Unable to check email. Try again." : ""}
            </p>}
            {isRegister && <>
              <label className="auth-field">Mobile number
                <input type="tel" autoComplete="tel" maxLength={30} value={authForm.phone} onChange={(event) => setAuthForm((current) => ({...current, phone: event.target.value}))} placeholder="+91 98765 43210" />
              </label>
              <label className="auth-field">Country
                <select required autoComplete="country" value={authForm.country} onChange={(event) => setAuthForm((current) => ({...current, country: event.target.value}))}>
                  <option value="">Select country</option><option value="IN">India</option><option value="US">United States</option><option value="UK">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option>
                </select>
              </label>
            </>}
            {!adminTotpRequired && <label className="auth-field">Password
              <input type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 8 : undefined} required value={authForm.password} onChange={(event) => setAuthForm((current) => ({...current, password: event.target.value}))} placeholder={isRegister ? "Create a strong password" : "Enter your password"} />
            </label>}
            {isAdmin && adminTotpRequired && <label className="auth-field">Google Authenticator code
              <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={adminTotpCode} onChange={(event) => setAdminTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit code" />
            </label>}
            {isRegister && <>
              <div className="auth-password-strength">
                <div><i className={`strength-${passwordStrength}`} style={{width: `${passwordStrength * 20}%`}} /></div>
                <small>{authForm.password ? ["", "Weak", "Weak", "Fair", "Good", "Strong"][passwordStrength] : "Enter a password"}</small>
                <p>{passwordRequirements.map((item) => <span className={item.valid ? "valid" : ""} key={item.label}>{item.valid ? "✓" : "○"} {item.label}</span>)}</p>
              </div>
              <label className="auth-field">Confirm password
                <input type="password" autoComplete="new-password" required value={authForm.confirmPassword} onChange={(event) => setAuthForm((current) => ({...current, confirmPassword: event.target.value}))} placeholder="Confirm your password" />
              </label>
              {authForm.confirmPassword && <p className={`auth-password-match ${passwordsMatch ? "valid" : "invalid"}`}>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</p>}
              <label className="auth-field">Account type
                <select required value={authForm.accountType} onChange={(event) => setAuthForm((current) => ({...current, accountType: event.target.value}))}>
                  <option value="">Select account type</option><option value="creator">Individual / Creator</option><option value="business">Business / Brand</option><option value="manager">Social Media Manager</option><option value="agency">Marketing Agency</option>
                </select>
              </label>
              <label className="auth-field">Company / brand name
                <input maxLength={150} value={authForm.company} onChange={(event) => setAuthForm((current) => ({...current, company: event.target.value}))} placeholder="Your company or brand" />
              </label>
              <label className="auth-terms"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I agree to the Terms of Service and <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>
            </>}
            {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
            <button className="auth-submit" type="submit">{isRegister ? "Create My PageCrew Account" : isAdmin ? adminTotpRequired ? "Verify code and sign in" : "Super Admin Login" : "Login to PageCrew"}</button>
          </form>

          <div className="auth-bottom">
            {isRegister
              ? <>Already have an account? <button type="button" onClick={() => setAuthMode("login")}>Login here</button></>
              : isAdmin
                ? adminTotpRequired
                  ? <button type="button" onClick={onCancelAdminTotp}>Use password again</button>
                  : <>Not a super admin? <button type="button" onClick={() => setAuthMode("login")}>User login</button></>
                : <>Don't have an account? <button type="button" onClick={() => setAuthMode("register")}>Create your account</button></>}
          </div>
        </section>
      </div>
    </main>
  </div>;
}
