import React, {useEffect, useMemo, useState} from "react";
import "./PaymentOnboarding.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

type Plan = {id: string; name: string; price: number; period: string; summary: string; features: string[]};
type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country?: string;
  accountType?: string;
  company?: string;
  planId?: string;
  paymentStatus?: "not_submitted" | "pending" | "not_required" | "rejected";
  paymentReference?: string;
  paymentPayerName?: string;
  paymentSubmittedAt?: string;
  paymentRejectionReason?: string;
};
type Props = {user: User; onLogout: () => void; onRefresh: () => Promise<void>};
type PaymentStatus = {qrConfigured: boolean};

function usePrivateImage(path: string) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) return;
    let active = true;
    let objectUrl = "";
    setError("");
    void fetch(path, {credentials: "include", cache: "no-store"}).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not load image.");
      }
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setImageUrl(objectUrl);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load image.");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return {imageUrl, error};
}

export function PrivateImage({path, alt, className}: {path: string; alt: string; className: string}) {
  const {imageUrl, error} = usePrivateImage(path);
  if (error) return <p className="payment-inline-error" role="status">{error}</p>;
  if (!imageUrl) return <p className="payment-muted">Loading secure image…</p>;
  return <img className={className} src={imageUrl} alt={alt} />;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {style: "currency", currency: "INR", maximumFractionDigits: 0}).format(amount);
}

export default function PaymentOnboarding({user, onLogout, onRefresh}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(user.planId || "");
  const [paymentInfo, setPaymentInfo] = useState<PaymentStatus | null>(null);
  const [payerName, setPayerName] = useState(user.paymentPayerName || user.name || "");
  const [reference, setReference] = useState(user.paymentReference || "");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changePlan, setChangePlan] = useState(!user.planId);
  const [success, setSuccess] = useState("");
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === (selectedPlanId || user.planId)), [plans, selectedPlanId, user.planId]);
  const needsPayment = Boolean(selectedPlan && selectedPlan.price > 0);
  const paymentSubmitted = user.paymentStatus === "pending" || user.paymentStatus === "not_required";
  const isRejected = user.paymentStatus === "rejected";

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`${API}/auth/plans`, {credentials: "include", cache: "no-store"}),
      fetch(`${API}/auth/payment/status`, {credentials: "include", cache: "no-store"})
    ]).then(async ([plansResponse, statusResponse]) => {
      if (!plansResponse.ok) throw new Error("Could not load PageCrew plans.");
      if (!statusResponse.ok) {
        const data = await statusResponse.json().catch(() => ({}));
        throw new Error(data.error || "Could not load your payment status.");
      }
      const nextPlans = await plansResponse.json() as Plan[];
      const nextStatus = await statusResponse.json() as PaymentStatus;
      if (active) {
        setPlans(nextPlans);
        setPaymentInfo(nextStatus);
        if (user.planId) setSelectedPlanId(user.planId);
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load payment details.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user.planId]);

  async function readResponse(response: Response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
    return data;
  }

  async function choosePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/auth/payment/plan`, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({planId: selectedPlanId})
      });
      const result = await readResponse(response);
      const plan = result.plan as Plan;
      if (plan.price === 0) {
        await readResponse(await fetch(`${API}/auth/payment/demo-submit`, {method: "POST", credentials: "include"}));
        setSuccess("Your Demo plan has been sent to the super admin for review.");
        await onRefresh();
        return;
      }
      setChangePlan(false);
      await onRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your plan.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!screenshot) {
      setError("Select a screenshot of your completed payment.");
      return;
    }
    if (screenshot.size > 8 * 1024 * 1024) {
      setError("Payment screenshots must be 8 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const formData = new FormData();
    formData.append("payerName", payerName);
    formData.append("reference", reference);
    formData.append("screenshot", screenshot);
    try {
      await readResponse(await fetch(`${API}/auth/payment/submit`, {method: "POST", credentials: "include", body: formData}));
      setSuccess("Payment details submitted. Your account will be reviewed after the super admin checks the transaction.");
      setScreenshot(null);
      await onRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit your payment proof.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="payment-onboarding">
    <header className="payment-topbar">
      <a href="/" aria-label="PageCrew home"><img src="/pagecrew-logo.png" alt="PageCrew" /></a>
      <div><span>{user.name}</span><button type="button" onClick={onLogout}>Log out</button></div>
    </header>
    <section className="payment-shell">
      <div className="payment-progress"><span className="complete">1. Account</span><i /><span className={user.planId ? "complete" : "current"}>2. Choose plan</span><i /><span className={paymentSubmitted ? "complete" : needsPayment ? "current" : ""}>3. Payment & review</span></div>
      {loading ? <section className="payment-panel"><p className="payment-muted">Loading your plans…</p></section> : <>
        {paymentSubmitted ? <section className="payment-panel payment-status-panel">
          <span className="payment-status-icon">✓</span>
          <p className="payment-eyebrow">APPLICATION RECEIVED</p>
          <h1>{user.paymentStatus === "pending" ? "Payment submitted for review" : "Plan submitted for review"}</h1>
          <p className="payment-lead">{user.paymentStatus === "pending"
            ? "A super admin will compare your payment reference and screenshot against the account statement before approving access."
            : "Your free Demo plan has been sent to the super admin for review. No payment is required for this plan."}</p>
          <div className="payment-summary"><span>Selected plan</span><strong>{selectedPlan?.name || user.planId}</strong><span>Amount</span><strong>{selectedPlan ? (selectedPlan.price ? formatAmount(selectedPlan.price) : "Free") : "—"}</strong>
            {user.paymentStatus === "pending" && <><span>Payer name</span><strong>{user.paymentPayerName}</strong><span>Transaction reference</span><strong>{user.paymentReference}</strong></>}
          </div>
          {success && <p className="payment-success" role="status">{success}</p>}
          <button className="payment-secondary" type="button" onClick={onLogout}>Log out</button>
        </section> : changePlan || !user.planId ? <section className="payment-panel">
          <p className="payment-eyebrow">PAGECREW PLANS</p>
          <h1>Choose your plan</h1>
          <p className="payment-lead">Select the plan you want. Paid plans need a payment screenshot and transaction reference before account review.</p>
          <form onSubmit={choosePlan}>
            <div className="payment-plans">
              {plans.map((plan) => <label className={`payment-plan ${selectedPlanId === plan.id ? "selected" : ""}`} key={plan.id}>
                <input type="radio" name="plan" value={plan.id} checked={selectedPlanId === plan.id} onChange={() => setSelectedPlanId(plan.id)} />
                <span className="payment-plan-title"><strong>{plan.name}</strong><b>{plan.price ? formatAmount(plan.price) : "Free"}<small>{plan.period}</small></b></span>
                <span className="payment-plan-summary">{plan.summary}</span>
                <span className="payment-plan-features">{plan.features.join(" · ")}</span>
              </label>)}
            </div>
            {error && <p className="payment-error" role="alert">{error}</p>}
            {success && <p className="payment-success" role="status">{success}</p>}
            <button className="payment-primary" type="submit" disabled={!selectedPlanId || busy}>{busy ? "Saving plan…" : selectedPlan?.price === 0 ? "Continue with free Demo" : "Continue to payment"}</button>
          </form>
        </section> : <section className="payment-panel">
          <p className="payment-eyebrow">SECURE PAYMENT SUBMISSION</p>
          <h1>Pay for {selectedPlan?.name}</h1>
          <p className="payment-lead">Pay the exact plan amount using this QR code, then enter the payer name and transaction reference and attach your payment screenshot.</p>
          <div className="payment-amount">{selectedPlan ? formatAmount(selectedPlan.price) : "—"} <small>{selectedPlan?.period}</small></div>
          {isRejected && <div className="payment-rejection" role="alert"><strong>Payment proof needs correction</strong><span>{user.paymentRejectionReason || "Please check the details and submit a new screenshot."}</span></div>}
          <div className="payment-qr-frame">
            {paymentInfo?.qrConfigured
              ? <PrivateImage path={`${API}/auth/payment/qr`} alt="PageCrew payment QR code" className="payment-qr-image" />
              : <p className="payment-qr-missing">Payment QR is not configured. Please contact PageCrew support before paying.</p>}
          </div>
          <form className="payment-submit-form" onSubmit={submitPayment}>
            <label>Payer name<input required minLength={2} maxLength={150} value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Name shown in the payment app" /></label>
            <label>Transaction reference / UTR<input required minLength={6} maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter the payment reference number" /></label>
            <label>Payment screenshot<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setScreenshot(event.currentTarget.files?.[0] || null)} /><small>JPG, PNG, or WebP. Maximum 8 MB.</small></label>
            {error && <p className="payment-error" role="alert">{error}</p>}
            {success && <p className="payment-success" role="status">{success}</p>}
            <button className="payment-primary" type="submit" disabled={busy || !paymentInfo?.qrConfigured}>{busy ? "Submitting…" : "Submit payment for admin review"}</button>
          </form>
          {user.paymentStatus !== "pending" && <button className="payment-secondary" type="button" disabled={busy} onClick={() => setChangePlan(true)}>Change plan</button>}
        </section>}
      </>}
      <p className="payment-privacy-note">Your payment screenshot and transaction reference are visible only to you and the PageCrew super admin.</p>
    </section>
  </main>;
}
