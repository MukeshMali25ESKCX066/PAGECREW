import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import "./dashboard.css";
import LandingPage, {type HomeAuthMode, type HomeRegistrationForm} from "./LandingPage";
import AuthPage from "./AuthPage";
import PaymentOnboarding, {PrivateImage} from "./PaymentOnboarding";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const PAGECREW_LOGO = "/pagecrew-logo.png";

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: "include" });
}

type Page = {id:string; name:string; account:string; accountId?:string; pictureUrl?:string};
type Job = {id:string; content:string; pageIds:string[]; scheduledAt:string; status:string; media?:{mimeType:string; originalName:string}; pageErrors?:Record<string,string>};
type FacebookAccount = {id:string; name:string; avatarUrl?:string};
type AuthUser = {
  id:string; name:string; email:string; role?:"user"|"admin"; status?:"pending"|"approved"|"rejected";
  isApproved?:boolean; approved?:boolean; phone?:string; country?:string; accountType?:string; company?:string;
  planId?:string; paymentStatus?:"not_submitted"|"pending"|"not_required"|"rejected";
  paymentReference?:string; paymentPayerName?:string; paymentSubmittedAt?:string; paymentRejectionReason?:string;
  planName?:string; planPrice?:number|null; paymentProofAvailable?:boolean; createdAt?:string;
};
type LinkPreview = {url:string; title:string; description:string; siteName:string; image:string};
type Profile = {connected:boolean; provider:string; name:string; avatarUrl?:string; accountId?:string; activeAccountId?:string; accounts?:FacebookAccount[]; authenticated?:boolean; user?:AuthUser | null; users?:AuthUser[]};
type View = "dashboard" | "pages" | "composer" | "manage-posts";

function getAuthModeFromPath(pathname: string): HomeAuthMode {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/register") return "register";
  if (path === "/suuperadmin") return "admin";
  return "login";
}

function getCurrentIstDateTimeLocal(value = new Date()) {
  const now = value;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal" && part.value) acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function App() {
  const [pages,setPages] = useState<Page[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [content,setContent] = useState("");
  const [linkPreview,setLinkPreview] = useState<LinkPreview | null>(null);
  const [isLoadingLinkPreview,setIsLoadingLinkPreview] = useState(false);
  const [linkPreviewError,setLinkPreviewError] = useState("");
  const [scheduleEnabled,setScheduleEnabled] = useState(false);
  const [scheduleDate,setScheduleDate] = useState(() => getCurrentIstDateTimeLocal().slice(0, 10));
  const [scheduleTime,setScheduleTime] = useState(() => getCurrentIstDateTimeLocal().slice(11, 16));
  const [mediaFile,setMediaFile] = useState<File | null>(null);
  const [mediaPreview,setMediaPreview] = useState("");
  const [jobs,setJobs] = useState<Job[]>([]);
  const [message,setMessage] = useState("");
  const [actionFeedback,setActionFeedback] = useState("");
  const [editingJobId,setEditingJobId] = useState("");
  const [actionMenuId,setActionMenuId] = useState("");
  const [isScheduling,setIsScheduling] = useState(false);
  const [profile,setProfile] = useState<Profile | null>(null);
  const [authUser,setAuthUser] = useState<AuthUser | null>(null);
  const [authUsers,setAuthUsers] = useState<AuthUser[]>([]);
  const [authMode,setAuthMode] = useState<HomeAuthMode>(() => getAuthModeFromPath(window.location.pathname));
  const [authForm,setAuthForm] = useState<HomeRegistrationForm>({ name: "", email: "", phone: "", country: "", password: "", confirmPassword: "", accountType: "", company: "" });
  const [authMessage,setAuthMessage] = useState("");
  const [adminTotpRequired,setAdminTotpRequired] = useState(false);
  const [adminTotpChallenge,setAdminTotpChallenge] = useState("");
  const [adminTotpCode,setAdminTotpCode] = useState("");
  const [emailAvailability,setEmailAvailability] = useState<"" | "checking" | "available" | "taken" | "invalid" | "error">("");
  const [termsAccepted,setTermsAccepted] = useState(false);
  const [pendingUsers,setPendingUsers] = useState<AuthUser[]>([]);
  const [paymentQrConfigured,setPaymentQrConfigured] = useState(false);
  const [paymentQrBusy,setPaymentQrBusy] = useState(false);
  const [paymentQrMessage,setPaymentQrMessage] = useState("");
  const [adminTotpEnabled,setAdminTotpEnabled] = useState(false);
  const [adminTotpSetupPending,setAdminTotpSetupPending] = useState(false);
  const [adminTotpQr,setAdminTotpQr] = useState("");
  const [adminTotpManualKey,setAdminTotpManualKey] = useState("");
  const [adminTotpManagementCode,setAdminTotpManagementCode] = useState("");
  const [adminTotpDisableRequested,setAdminTotpDisableRequested] = useState(false);
  const [adminTotpBusy,setAdminTotpBusy] = useState(false);
  const [adminTotpMessage,setAdminTotpMessage] = useState("");
  const [approvalPending,setApprovalPending] = useState(false);
  const [activeAccountId,setActiveAccountId] = useState(() => window.localStorage.getItem("socialpilot.activeFacebookAccount") || "");
  const [search,setSearch] = useState("");
  const [accountFilter,setAccountFilter] = useState("all");
  const [manageStatus,setManageStatus] = useState("all");
  const [manageSearch,setManageSearch] = useState("");
  const [manageAccount,setManageAccount] = useState("all");
  const [manageDateRange,setManageDateRange] = useState("all");
  const [selectedJobs,setSelectedJobs] = useState<string[]>([]);
  const [expandedJob,setExpandedJob] = useState("");
  const [managePage,setManagePage] = useState(1);
  const [activeView,setActiveView] = useState<View>(() => {
    const hash = window.location.hash.replace("#", "") as View;
    return ["dashboard", "pages", "composer", "manage-posts"].includes(hash) ? hash : "dashboard";
  });

  function navigateToAuth(mode: HomeAuthMode) {
    const path = mode === "register" ? "/register" : mode === "admin" ? "/suuperadmin" : "/login";
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setAuthMode(mode);
    setAuthMessage("");
    setAdminTotpRequired(false);
    setAdminTotpChallenge("");
    setAdminTotpCode("");
  }

  async function loadAccountPages(accountId: string) {
    const pagesRes = await apiFetch(`${API}/pages?accountId=${encodeURIComponent(accountId)}`, {cache: "no-store"});
    if (!pagesRes.ok) return;
    const pagesData = await pagesRes.json();
    if (Array.isArray(pagesData)) {
      setPages((current) => [...current.filter((page) => page.accountId !== accountId), ...pagesData]);
    }
  }

  async function loadProfile() {
    try {
      const response = await apiFetch(`${API}/auth/me`, {cache: "no-store"});
      if (!response.ok) {
        setProfile(null);
        setPages([]);
        setActiveAccountId("");
        window.localStorage.removeItem("socialpilot.activeFacebookAccount");
        setAuthUser(null);
        setAuthUsers([]);
        setPendingUsers([]);
        setApprovalPending(false);
        return;
      }
      const data = await response.json();
      const loadedUser = data.user || null;
      const userApproved = loadedUser ? loadedUser.role === "admin" || loadedUser.status === "approved" || loadedUser.isApproved || loadedUser.approved : false;
      setAuthUser(loadedUser);
      setApprovalPending(Boolean(loadedUser && !userApproved));
      setAuthUsers(Array.isArray(data.users) ? data.users : []);
      const connectedAccounts: FacebookAccount[] = Array.isArray(data.accounts)
        ? data.accounts
        : data.accountId ? [{id: data.accountId, name: data.name, avatarUrl: data.avatarUrl}] : [];
      const url = new URL(window.location.href);
      const justConnected = url.searchParams.get("connected") === "facebook";
      const savedAccountId = justConnected ? "" : window.localStorage.getItem("socialpilot.activeFacebookAccount") || "";
      const nextAccountId = connectedAccounts.find((account) => account.id === savedAccountId)?.id || data.activeAccountId || connectedAccounts[0]?.id || "";
      const activeAccount = connectedAccounts.find((account) => account.id === nextAccountId);
      const nextProfile: Profile | null = data.connected && activeAccount
        ? {...data, ...activeAccount, accountId: nextAccountId, activeAccountId: nextAccountId, accounts: connectedAccounts}
        : null;
      setProfile(nextProfile);
      setActiveAccountId(nextProfile?.activeAccountId || "");

      if (nextProfile) {
        window.localStorage.setItem("socialpilot.activeFacebookAccount", nextProfile.activeAccountId || "");
        if (data.activeAccountId !== nextProfile.activeAccountId) {
          await apiFetch(`${API}/auth/active`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({accountId: nextProfile.activeAccountId})
          });
        }
        await loadAccountPages(nextProfile.activeAccountId || "");
      } else {
        setPages([]);
      }

      if (data.connected && justConnected) {
        url.searchParams.delete("connected");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      setProfile(null);
      setPages([]);
      setAuthUser(null);
      setAuthUsers([]);
      setPendingUsers([]);
      setApprovalPending(false);
    }
  }

  async function loadPosts() {
    try {
      const response = await apiFetch(`${API}/posts`, { cache: "no-store" });
      if (!response.ok) {
        setJobs([]);
        return;
      }
      const data = await response.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      setJobs([]);
    }
  }

  async function loadPendingUsers() {
    if (!authUser || authUser.role !== "admin") return;
    try {
      const response = await apiFetch(`${API}/auth/admin/users`, { cache: "no-store" });
      if (!response.ok) {
        setPendingUsers([]);
        return;
      }
      const data = await response.json();
      setPendingUsers(Array.isArray(data) ? data : []);
    } catch {
      setPendingUsers([]);
    }
  }

  async function loadPaymentQrStatus() {
    try {
      const response = await apiFetch(`${API}/auth/payment/status`, {cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load payment QR settings.");
      setPaymentQrConfigured(Boolean(data.qrConfigured));
    } catch (error) {
      setPaymentQrMessage(error instanceof Error ? error.message : "Could not load payment QR settings.");
    }
  }

  async function loadAdminTotpStatus() {
    try {
      const response = await apiFetch(`${API}/auth/admin/totp/status`, {cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load authenticator settings.");
      setAdminTotpEnabled(Boolean(data.enabled));
      setAdminTotpSetupPending(Boolean(data.setupPending));
      setAdminTotpMessage("");
      if (data.setupPending && !data.enabled) await loadAdminTotpSetupQr();
    } catch (error) {
      setAdminTotpMessage(error instanceof Error ? error.message : "Could not load authenticator settings.");
    }
  }

  async function loadAdminTotpSetupQr() {
    const response = await apiFetch(`${API}/auth/admin/totp/setup`, {cache: "no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load authenticator setup QR.");
    setAdminTotpQr(data.qrCode);
    setAdminTotpManualKey(data.manualEntryKey);
  }

  async function startAdminTotpSetup() {
    setAdminTotpBusy(true);
    setAdminTotpMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/totp/setup`, {method: "POST"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create authenticator setup QR.");
      setAdminTotpQr(data.qrCode);
      setAdminTotpManualKey(data.manualEntryKey);
      setAdminTotpSetupPending(true);
      setAdminTotpMessage("Scan this QR with Google Authenticator, then enter its current 6-digit code.");
    } catch (error) {
      setAdminTotpMessage(error instanceof Error ? error.message : "Could not create authenticator setup QR.");
    } finally {
      setAdminTotpBusy(false);
    }
  }

  async function confirmAdminTotpSetup() {
    setAdminTotpBusy(true);
    setAdminTotpMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/totp/enable`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({code: adminTotpManagementCode})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not enable authenticator protection.");
      setAdminTotpEnabled(true);
      setAdminTotpSetupPending(false);
      setAdminTotpQr("");
      setAdminTotpManualKey("");
      setAdminTotpManagementCode("");
      setAdminTotpMessage("Google Authenticator is enabled for super admin sign-in.");
    } catch (error) {
      setAdminTotpMessage(error instanceof Error ? error.message : "Could not enable authenticator protection.");
    } finally {
      setAdminTotpBusy(false);
    }
  }

  async function cancelAdminTotpSetup() {
    setAdminTotpBusy(true);
    setAdminTotpMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/totp/setup`, {method: "DELETE"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not cancel authenticator setup.");
      setAdminTotpSetupPending(false);
      setAdminTotpQr("");
      setAdminTotpManualKey("");
      setAdminTotpManagementCode("");
      setAdminTotpMessage("Authenticator setup cancelled.");
    } catch (error) {
      setAdminTotpMessage(error instanceof Error ? error.message : "Could not cancel authenticator setup.");
    } finally {
      setAdminTotpBusy(false);
    }
  }

  async function disableAdminTotp() {
    setAdminTotpBusy(true);
    setAdminTotpMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/totp/disable`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({code: adminTotpManagementCode})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disable authenticator protection.");
      setAdminTotpEnabled(false);
      setAdminTotpDisableRequested(false);
      setAdminTotpManagementCode("");
      setAdminTotpMessage("Google Authenticator protection is disabled.");
    } catch (error) {
      setAdminTotpMessage(error instanceof Error ? error.message : "Could not disable authenticator protection.");
    } finally {
      setAdminTotpBusy(false);
    }
  }

  async function uploadPaymentQr(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setPaymentQrMessage("QR images must be 8 MB or smaller.");
      return;
    }
    const formData = new FormData();
    formData.append("qrCode", file);
    setPaymentQrBusy(true);
    setPaymentQrMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/payment-qr`, {method: "POST", body: formData});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not upload payment QR.");
      setPaymentQrConfigured(true);
      setPaymentQrMessage("Payment QR saved. New users can now submit their payment.");
    } catch (error) {
      setPaymentQrMessage(error instanceof Error ? error.message : "Could not upload payment QR.");
    } finally {
      setPaymentQrBusy(false);
    }
  }

  async function removePaymentQr() {
    setPaymentQrBusy(true);
    setPaymentQrMessage("");
    try {
      const response = await apiFetch(`${API}/auth/admin/payment-qr`, {method: "DELETE"});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove payment QR.");
      setPaymentQrConfigured(false);
      setPaymentQrMessage("Payment QR removed.");
    } catch (error) {
      setPaymentQrMessage(error instanceof Error ? error.message : "Could not remove payment QR.");
    } finally {
      setPaymentQrBusy(false);
    }
  }

  async function approveUser(userId: string) {
    try {
      const response = await apiFetch(`${API}/auth/admin/approve-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthMessage(data.error || "Could not approve this user.");
        return;
      }
      await loadPendingUsers();
      setAuthMessage(data.user ? `${data.user.name} was approved successfully.` : "User approved successfully.");
    } catch {
      setAuthMessage("Could not approve this user right now.");
    }
  }

  async function rejectPayment(userId: string) {
    const reason = window.prompt("Explain what needs correction so the user can submit payment proof again:");
    if (reason === null) return;
    try {
      const response = await apiFetch(`${API}/auth/admin/reject-payment`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({userId, reason})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthMessage(data.error || "Could not reject this payment.");
        return;
      }
      await loadPendingUsers();
      setAuthMessage(`Payment proof for ${data.user?.name || "this user"} was rejected. They can submit a new screenshot.`);
    } catch {
      setAuthMessage("Could not reject this payment right now.");
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const endpoint = authMode === "login" ? "login" : authMode === "register" ? "register" : adminTotpRequired ? "admin/login/verify" : "admin/login";
    if (authMode === "register") {
      const strongPassword = authForm.password.length >= 8 && /[A-Z]/.test(authForm.password) && /[a-z]/.test(authForm.password) && /[0-9]/.test(authForm.password) && /[^A-Za-z0-9]/.test(authForm.password);
      if (!strongPassword) {
        setAuthMessage("Use at least 8 characters with uppercase, lowercase, a number, and a special character.");
        return;
      }
      if (authForm.password !== authForm.confirmPassword) {
        setAuthMessage("Passwords do not match.");
        return;
      }
      if (emailAvailability !== "available") {
        setAuthMessage(emailAvailability === "checking" ? "Please wait while we check your email." : "Please enter an available email address.");
        return;
      }
      if (!termsAccepted) {
        setAuthMessage("Please accept the Terms of Service and Privacy Policy.");
        return;
      }
    }
    const body = authMode === "admin" && adminTotpRequired
      ? {challengeToken: adminTotpChallenge, code: adminTotpCode}
      : authMode === "register"
      ? {
          fullName: authForm.name,
          email: authForm.email.trim(),
          phone: authForm.phone,
          country: authForm.country,
          password: authForm.password,
          accountType: authForm.accountType,
          company: authForm.company,
          termsAccepted
        }
      : { email: authForm.email, password: authForm.password };

    try {
      const response = await apiFetch(`${API}/auth/${endpoint}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthMessage(data.error || "Authentication failed");
        return;
      }
      if (authMode === "admin" && data.requiresTotp) {
        setAdminTotpRequired(true);
        setAdminTotpChallenge(data.challengeToken);
        setAdminTotpCode("");
        setAuthMessage("Enter the current 6-digit code from Google Authenticator to continue.");
        return;
      }
      setAuthForm({ name: "", email: "", phone: "", country: "", password: "", confirmPassword: "", accountType: "", company: "" });
      setTermsAccepted(false);
      setAdminTotpRequired(false);
      setAdminTotpChallenge("");
      setAdminTotpCode("");
      if (authMode === "register") {
        setAuthMessage("Account created. Your workspace access is pending super admin approval.");
      }
      await loadProfile();
      if (authMode === "admin") {
        setAuthMessage("Super admin signed in.");
      }
    } catch {
      setAuthMessage("Could not reach the server. Please try again.");
    }
  }

  function cancelAdminTotpChallenge() {
    setAdminTotpRequired(false);
    setAdminTotpChallenge("");
    setAdminTotpCode("");
    setAuthMessage("");
  }

  async function switchCurrentUser(userId: string) {
    try {
      const response = await apiFetch(`${API}/auth/switch-user`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ userId })
      });
      if (!response.ok) {
        setAuthMessage("Could not switch user.");
        return;
      }
      await loadProfile();
    } catch {
      setAuthMessage("Could not switch user right now.");
    }
  }

  async function logoutCurrentUser() {
    try {
      await apiFetch(`${API}/auth/logout`, { method: "POST" });
      setAuthUser(null);
      setAuthUsers([]);
      setProfile(null);
      setPages([]);
      setActiveAccountId("");
      window.localStorage.removeItem("socialpilot.activeFacebookAccount");
      await loadProfile();
    } catch {
      setAuthMessage("Could not logout right now.");
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  useEffect(() => {
    if (authUser) void loadPosts();
    else setJobs([]);

    const interval = window.setInterval(() => {
      if (authUser) void loadPosts();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [authUser]);

  useEffect(() => {
    if (authUser?.role === "admin") {
      void loadPendingUsers();
      void loadPaymentQrStatus();
      void loadAdminTotpStatus();
    }
  }, [authUser]);

  useEffect(() => {
    if (authMode !== "register") {
      setEmailAvailability("");
      return;
    }

    const email = authForm.email.trim().toLowerCase();
    if (!email) {
      setEmailAvailability("");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailAvailability("invalid");
      return;
    }

    let active = true;
    setEmailAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`${API}/auth/check-email?email=${encodeURIComponent(email)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Email check failed");
        const data = await response.json();
        if (active) setEmailAvailability(data.available ? "available" : "taken");
      } catch {
        if (active) setEmailAvailability("error");
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authMode, authForm.email]);

  useEffect(() => {
    if (!mediaPreview) return;
    if (!mediaPreview.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(mediaPreview);
  }, [mediaPreview]);

  useEffect(() => {
    const candidate = content.match(/https?:\/\/[^\s<>]+/i)?.[0].replace(/[.,!?;:)}\]]+$/, "");
    setLinkPreview(null);
    setLinkPreviewError("");
    if (!candidate) {
      setIsLoadingLinkPreview(false);
      return;
    }

    let active = true;
    setIsLoadingLinkPreview(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`${API}/posts/link-preview?url=${encodeURIComponent(candidate)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Preview unavailable.");
        if (active) setLinkPreview(data);
      } catch (error) {
        if (active) setLinkPreviewError(error instanceof Error ? error.message : "Preview unavailable.");
      } finally {
        if (active) setIsLoadingLinkPreview(false);
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [content]);

  useEffect(() => {
    const syncFromHash = () => {
      const nextHash = window.location.hash.replace("#", "") as View;
      if (["dashboard", "pages", "composer", "manage-posts"].includes(nextHash)) {
        setActiveView(nextHash);
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const syncAuthMode = () => setAuthMode(getAuthModeFromPath(window.location.pathname));
    window.addEventListener("popstate", syncAuthMode);
    return () => window.removeEventListener("popstate", syncAuthMode);
  }, []);

  const navigateTo = (view: View) => {
    setActiveView(view);
    window.history.pushState({}, "", `#${view}`);
  };

  async function selectFacebookAccount(accountId: string) {
    const account = profile?.accounts?.find((entry) => entry.id === accountId);
    if (!account || accountId === activeAccountId) return;
    setActiveAccountId(accountId);
    setProfile((current) => current ? {...current, ...account, accountId, activeAccountId: accountId} : current);
    setSelected([]);
    setSearch("");
    setAccountFilter("all");
    setActionFeedback("");
    window.localStorage.setItem("socialpilot.activeFacebookAccount", accountId);

    try {
      const response = await apiFetch(`${API}/auth/active`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({accountId})
      });
      if (!response.ok) throw new Error("Could not switch Facebook account.");
      await loadAccountPages(accountId);
    } catch {
      setActionFeedback("Could not load this Facebook account. Please reconnect it.");
    }
  }

  const toggle=(id:string)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const all=()=>{
    const activePages = pages.filter((page) => page.accountId === activeAccountId);
    setSelected(selected.length===activePages.length && activePages.length ? [] : activePages.map((page)=>page.id));
  };

  function chooseMedia(file?: File) {
    if (!file) return;
    const acceptedTypes = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];
    if (!acceptedTypes.includes(file.type)) {
      setMessage("Choose a JPG, PNG, MP4, or MOV file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMessage("Media files must be 50 MB or smaller.");
      return;
    }
    setMessage("");
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  }

  function clearMedia() {
    setMediaFile(null);
    setMediaPreview("");
  }

  async function submitPost(action: "schedule" | "publish" | "draft") {
    setMessage("");
    setIsScheduling(true);
    try {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("pageIds", JSON.stringify(selected));
      if (action === "schedule") formData.append("scheduledAt", `${scheduleDate}T${scheduleTime}`);
      if (editingJobId) formData.append("status", action === "draft" ? "draft" : action === "publish" ? "publish" : "scheduled");
      if (mediaFile) formData.append("media", mediaFile);

      const response = await apiFetch(editingJobId ? `${API}/posts/${editingJobId}` : `${API}/posts/${action}`, { method: editingJobId ? "PATCH" : "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not save this post");
        return;
      }

      setJobs((current) => [data, ...current.filter((job) => job.id !== data.id)]);
      setContent("");
      clearMedia();
      setEditingJobId("");
      if (action === "draft") {
        setMessage("Draft saved.");
      } else if (data.status === "failed") {
        setMessage(`Publishing failed: ${Object.values(data.pageErrors || {})[0] || "Check the post details for the Page error."}`);
      } else if (data.status === "partial") {
        setMessage("Published to some Pages. Open post details to see which Page failed.");
      } else if (action === "publish") {
        setMessage(`Published to ${selected.length} ${selected.length === 1 ? "Page" : "Pages"}.`);
      } else {
        setMessage(`Scheduled for ${selected.length} ${selected.length === 1 ? "Page" : "Pages"}.`);
      }
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleLogout() {
    await apiFetch(`${API}/auth/logout`, {method:"POST"});
    setProfile(null);
    setPages([]);

    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    window.history.replaceState({}, "", url.toString());

    await loadProfile();
  }

  const formatIst = (dateValue: string | Date) => {
    const date = new Date(dateValue);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(date);
  };

  const groups = pages.reduce<Record<string, Page[]>>((acc, page) => {
    (acc[page.account] ??= []).push(page);
    return acc;
  }, {});

  const accounts = Object.keys(groups);
  const connectedAccounts = profile?.accounts || [];
  const activePages = pages.filter((page) => page.accountId === activeAccountId);
  const pageById = new Map<string, Page>(pages.map((page) => [page.id, page]));
  const editingJob = jobs.find((job) => job.id === editingJobId);
  const previewPage = pages.find((page) => selected.includes(page.id));
  const contentLink = content.match(/https?:\/\/[^\s<>]+/i)?.[0].replace(/[.,!?;:)}\]]+$/, "");
  const visiblePages = activePages.filter((page) =>
    page.name.toLowerCase().includes(search.toLowerCase()) &&
    (accountFilter === "all" || page.account === accountFilter)
  );
  const publishedCount = jobs.filter((job) => job.status === "published").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const recentJobs = [...jobs].sort((first, second) => new Date(second.scheduledAt).getTime() - new Date(first.scheduledAt).getTime()).slice(0, 6);
  const manageTabs = ["all", "draft", "published", "scheduled", "partial", "failed"];
  const dateCutoff = manageDateRange === "30"
    ? Date.now() - 30 * 24 * 60 * 60 * 1000
    : manageDateRange === "90"
      ? Date.now() - 90 * 24 * 60 * 60 * 1000
      : manageDateRange === "month"
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
        : null;
  const managedJobs = [...jobs]
    .filter((job) => manageStatus === "all" || job.status === manageStatus)
    .filter((job) => {
      const relatedPages = job.pageIds.map((id) => pageById.get(id)).filter((page): page is Page => Boolean(page));
      const matchesAccount = manageAccount === "all" || relatedPages.some((page) => page.account === manageAccount);
      const query = manageSearch.trim().toLowerCase();
      const matchesSearch = !query || job.content.toLowerCase().includes(query) || relatedPages.some((page) => page.name.toLowerCase().includes(query));
      const timestamp = new Date(job.scheduledAt).getTime();
      const matchesDate = dateCutoff === null || (timestamp >= dateCutoff && timestamp <= Date.now());
      return matchesAccount && matchesSearch && matchesDate;
    })
    .sort((first, second) => new Date(second.scheduledAt).getTime() - new Date(first.scheduledAt).getTime());
  const managePageSize = 8;
  const managePageCount = Math.max(1, Math.ceil(managedJobs.length / managePageSize));
  const pagedJobs = managedJobs.slice((managePage - 1) * managePageSize, managePage * managePageSize);
  const currentPageSelected = pagedJobs.length > 0 && pagedJobs.every((job) => selectedJobs.includes(job.id));
  const canAccessWorkspace = Boolean(authUser && (authUser.role === "admin" || authUser.status === "approved" || authUser.isApproved || authUser.approved));
  const pendingApprovalUsers = pendingUsers.filter((user) => user.status === "pending" && !user.isApproved && (user.paymentStatus === "pending" || user.paymentStatus === "not_required"));
  const approvedUsers = pendingUsers.filter((user) => user.status === "approved" || user.isApproved);
  const passwordRequirements = [
    { label: "8+ characters", valid: authForm.password.length >= 8 },
    { label: "Uppercase", valid: /[A-Z]/.test(authForm.password) },
    { label: "Lowercase", valid: /[a-z]/.test(authForm.password) },
    { label: "Number", valid: /[0-9]/.test(authForm.password) },
    { label: "Special character", valid: /[^A-Za-z0-9]/.test(authForm.password) }
  ];
  const passwordStrength = passwordRequirements.filter((requirement) => requirement.valid).length;
  const passwordsMatch = Boolean(authForm.confirmPassword) && authForm.password === authForm.confirmPassword;

  function toggleCurrentPageJobs() {
    const currentIds = pagedJobs.map((job) => job.id);
    setSelectedJobs((current) => currentPageSelected
      ? current.filter((id) => !currentIds.includes(id))
      : [...new Set([...current, ...currentIds])]);
  }

  async function handlePostAction(job: Job, action: "edit" | "reschedule" | "draft" | "duplicate" | "delete") {
    setActionMenuId("");
    setActionFeedback("");
    if (action === "edit" || action === "reschedule") {
      setEditingJobId(job.id);
      setContent(job.content);
      setSelected(job.pageIds);
      setScheduleEnabled(action === "reschedule" || job.status === "scheduled");
      const scheduleValue = getCurrentIstDateTimeLocal(new Date(job.scheduledAt));
      setScheduleDate(scheduleValue.slice(0, 10));
      setScheduleTime(scheduleValue.slice(11, 16));
      setMediaFile(null);
      setMediaPreview(job.media ? `${API}/posts/${job.id}/media` : "");
      navigateTo("composer");
      return;
    }

    if (action === "delete" && !window.confirm("Delete this post? This cannot be undone.")) return;

    try {
      let response: Response;
      if (action === "delete") {
        response = await apiFetch(`${API}/posts/${job.id}`, { method: "DELETE" });
        if (response.ok) {
          setJobs((current) => current.filter((entry) => entry.id !== job.id));
          setSelectedJobs((current) => current.filter((id) => id !== job.id));
        }
      } else if (action === "duplicate") {
        response = await apiFetch(`${API}/posts/${job.id}/duplicate`, { method: "POST" });
        if (response.ok) {
          const duplicate = await response.json();
          setJobs((current) => [duplicate, ...current]);
        }
      } else {
        const formData = new FormData();
        formData.append("content", job.content);
        formData.append("pageIds", JSON.stringify(job.pageIds));
        formData.append("status", "draft");
        response = await apiFetch(`${API}/posts/${job.id}`, { method: "PATCH", body: formData });
        if (response.ok) {
          const updated = await response.json();
          setJobs((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
        }
      }

      if (response.ok) {
        setActionFeedback(action === "delete" ? "Post deleted." : action === "duplicate" ? "Post duplicated to drafts." : "Post moved to drafts.");
      } else {
        const data = await response.json().catch(() => ({}));
        setActionFeedback(data.error || "Could not complete that post action.");
      }
    } catch {
      setActionFeedback("Could not reach the server. Please try again.");
    }
  }

  function postActions(job: Job) {
    const canEdit = job.status !== "published" && job.status !== "partial";
    return <div className="post-actions">
      <button className="post-actions-trigger" type="button" aria-label={`Actions for ${job.content || job.media?.originalName || "post"}`} aria-haspopup="menu" aria-expanded={actionMenuId === job.id} onClick={() => setActionMenuId((current) => current === job.id ? "" : job.id)}>⋮</button>
      {actionMenuId === job.id && <div className="post-action-menu" role="menu">
        {canEdit && <button type="button" role="menuitem" onClick={() => void handlePostAction(job, "edit")}>Edit post</button>}
        {canEdit && <button type="button" role="menuitem" onClick={() => void handlePostAction(job, "reschedule")}>Reschedule post</button>}
        {job.status !== "draft" && <button type="button" role="menuitem" onClick={() => void handlePostAction(job, "draft")}>Move to Drafts</button>}
        <button type="button" role="menuitem" onClick={() => void handlePostAction(job, "duplicate")}>Duplicate post</button>
        <button type="button" role="menuitem" onClick={() => void handlePostAction(job, "delete")}>Delete post</button>
      </div>}
    </div>;
  }

  function setManageFilter(update: () => void) {
    update();
    setManagePage(1);
  }

  if (authUser?.role === "admin") {
    return <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand"><img className="admin-brand-logo" src={PAGECREW_LOGO} alt="PageCrew" /><span><small>Super admin</small></span></div>
        <div className="admin-topbar-right"><span className="admin-identity">{authUser.name}</span><button type="button" className="text-button" onClick={logoutCurrentUser}>Log out</button></div>
      </header>
      <main className="admin-dashboard">
        <div className="admin-page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>User approvals</h1><p>Review registrations and control who can enter the workspace.</p></div><button type="button" className="refresh-button" onClick={() => void loadPendingUsers()} aria-label="Refresh users" title="Refresh users">↻</button></div>

        <section className="admin-metrics" aria-label="User account summary">
          <div><span>All users</span><strong>{pendingUsers.filter((user) => user.role !== "admin").length}</strong></div>
          <div><span>Awaiting review</span><strong>{pendingApprovalUsers.length}</strong></div>
          <div><span>Approved</span><strong>{approvedUsers.filter((user) => user.role !== "admin").length}</strong></div>
        </section>

        <section className="admin-users-section admin-security-section">
          <div className="admin-section-heading"><div><h2>Security</h2><p>Protect every super admin sign-in with a time-based code from Google Authenticator.</p></div></div>
          <div className="admin-security-content">
            <div className="admin-security-toggle-row">
              <div><strong>Google Authenticator</strong><span>{adminTotpEnabled ? "Two-step verification is on." : "Two-step verification is off."}</span></div>
              <label className="admin-security-switch">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Google Authenticator"
                  checked={adminTotpEnabled}
                  disabled={adminTotpBusy}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setAdminTotpDisableRequested(false);
                      void startAdminTotpSetup();
                    } else {
                      setAdminTotpDisableRequested(true);
                      setAdminTotpQr("");
                      setAdminTotpSetupPending(false);
                      setAdminTotpManagementCode("");
                    }
                  }}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            {(adminTotpQr || adminTotpSetupPending) && <div className="admin-totp-setup">
              {!adminTotpQr && <button className="approve-button" type="button" disabled={adminTotpBusy} onClick={() => void loadAdminTotpSetupQr().catch((error: unknown) => setAdminTotpMessage(error instanceof Error ? error.message : "Could not load authenticator setup QR."))}>Show setup QR</button>}
              {adminTotpQr && <img src={adminTotpQr} alt="Google Authenticator setup QR code" />}
              <p>Open Google Authenticator, scan this QR code, then enter the current code to turn protection on.</p>
              {adminTotpManualKey && <p>Manual setup key: <code>{adminTotpManualKey}</code></p>}
              <label>6-digit authenticator code
                <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={adminTotpManagementCode} onChange={(event) => setAdminTotpManagementCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
              </label>
              <div className="admin-security-actions">
                <button className="approve-button" type="button" disabled={adminTotpBusy || adminTotpManagementCode.length !== 6} onClick={() => void confirmAdminTotpSetup()}>{adminTotpBusy ? "Please wait…" : "Verify and enable"}</button>
                <button className="reject-payment-button" type="button" disabled={adminTotpBusy} onClick={() => void cancelAdminTotpSetup()}>Cancel setup</button>
              </div>
            </div>}
            {adminTotpDisableRequested && <div className="admin-totp-setup">
              <p>Enter a current authenticator code to turn off two-step verification.</p>
              <label>6-digit authenticator code
                <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={adminTotpManagementCode} onChange={(event) => setAdminTotpManagementCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
              </label>
              <div className="admin-security-actions">
                <button className="reject-payment-button" type="button" disabled={adminTotpBusy || adminTotpManagementCode.length !== 6} onClick={() => void disableAdminTotp()}>{adminTotpBusy ? "Please wait…" : "Verify and turn off"}</button>
                <button className="text-button" type="button" onClick={() => { setAdminTotpDisableRequested(false); setAdminTotpManagementCode(""); }}>Keep protection on</button>
              </div>
            </div>}
            {adminTotpMessage && <p className="admin-feedback" role="status">{adminTotpMessage}</p>}
          </div>
        </section>

        <section className="admin-users-section">
          <div className="admin-section-heading payment-qr-heading"><div><h2>Payment QR code</h2><p>Users see this QR after picking a paid plan. Upload the QR for the account where you receive payments.</p></div></div>
          <div className="admin-payment-settings">
            {paymentQrConfigured && <PrivateImage path={`${API}/auth/payment/qr`} alt="Current payment QR code" className="admin-payment-qr" />}
            <div className="admin-payment-settings-actions">
              <label className="approve-button payment-qr-upload">{paymentQrBusy ? "Saving…" : paymentQrConfigured ? "Replace QR image" : "Upload QR image"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={paymentQrBusy} onChange={(event) => void uploadPaymentQr(event)} /></label>
              {paymentQrConfigured && <button className="reject-payment-button" type="button" disabled={paymentQrBusy} onClick={() => void removePaymentQr()}>Remove QR</button>}
            </div>
            {paymentQrMessage && <p className="admin-feedback" role="status">{paymentQrMessage}</p>}
          </div>
        </section>

        <section className="admin-users-section">
          <div className="admin-section-heading"><div><h2>Pending registrations</h2><p>{pendingApprovalUsers.length ? `${pendingApprovalUsers.length} user${pendingApprovalUsers.length === 1 ? "" : "s"} need payment review` : "No users are waiting for payment review"}</p></div></div>
          {authMessage && <p className="admin-feedback" role="status">{authMessage}</p>}
          {pendingApprovalUsers.length ? <div className="admin-user-list">
            {pendingApprovalUsers.map((user) => <article className="admin-payment-review" key={user.id}>
              <div className="admin-payment-user"><span className="admin-user-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div className="admin-user-info"><strong>{user.name}</strong><span>{user.email}</span></div><span className="admin-status pending">{user.paymentStatus === "not_required" ? "Demo" : "Payment review"}</span></div>
              <div className="admin-payment-details">
                <div><small>Phone</small><strong>{user.phone || "—"}</strong></div>
                <div><small>Country</small><strong>{user.country || "—"}</strong></div>
                <div><small>Account type</small><strong>{user.accountType || "—"}</strong></div>
                <div><small>Company / brand</small><strong>{user.company || "—"}</strong></div>
                <div><small>Plan</small><strong>{user.planName || "—"}</strong></div>
                <div><small>Plan amount</small><strong>{user.planPrice ? `₹${user.planPrice.toLocaleString("en-IN")} / month` : "No payment required"}</strong></div>
                {user.paymentStatus === "pending" && <><div><small>Payer name</small><strong>{user.paymentPayerName || "—"}</strong></div><div><small>Transaction reference / UTR</small><strong>{user.paymentReference || "—"}</strong></div><div><small>Submitted at</small><strong>{user.paymentSubmittedAt ? new Date(user.paymentSubmittedAt).toLocaleString() : "—"}</strong></div></>}
                <div><small>Registered</small><strong>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</strong></div>
              </div>
              {user.paymentProofAvailable && <PrivateImage path={`${API}/auth/admin/payment-proof/${encodeURIComponent(user.id)}`} alt={`Payment screenshot from ${user.name}`} className="admin-payment-proof" />}
              <p className="admin-statement-reminder">Compare the transaction reference, amount and screenshot with your payment statement before approving.</p>
              <div className="admin-payment-actions">
                <button className="approve-button" type="button" onClick={() => void approveUser(user.id)}>Approve after checking statement</button>
                {user.paymentStatus === "pending" && <button className="reject-payment-button" type="button" onClick={() => void rejectPayment(user.id)}>Reject proof</button>}
              </div>
            </article>)}
          </div> : <div className="admin-empty-state"><span aria-hidden="true">✓</span><strong>All caught up</strong><p>New registrations will appear here for review.</p></div>}
        </section>

        <section className="admin-users-section approved-section">
          <div className="admin-section-heading"><div><h2>Approved users</h2><p>These accounts can access the PageCrew workspace.</p></div></div>
          {approvedUsers.filter((user) => user.role !== "admin").length ? <div className="admin-user-list">
            {approvedUsers.filter((user) => user.role !== "admin").map((user) => <article className="admin-user-row" key={user.id}>
              <span className="admin-user-avatar approved-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
              <div className="admin-user-info"><strong>{user.name}</strong><span>{user.email}</span></div>
              <span className="admin-status approved">Approved</span>
            </article>)}
          </div> : <p className="admin-no-approved">No approved users yet.</p>}
        </section>
      </main>
    </div>;
  }

  if (authUser && authUser.role !== "admin" && !canAccessWorkspace) {
    return <PaymentOnboarding user={authUser} onLogout={logoutCurrentUser} onRefresh={loadProfile} />;
  }

  if (!authUser || !canAccessWorkspace) {
    const authPath = ["/login", "/register", "/suuperadmin"].includes(window.location.pathname.replace(/\/+$/, "") || "/");
    if (authPath) {
      return <AuthPage
        authMode={authMode}
        setAuthMode={navigateToAuth}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authMessage={authMessage}
        onSubmit={handleAuthSubmit}
        emailAvailability={emailAvailability}
        termsAccepted={termsAccepted}
        setTermsAccepted={setTermsAccepted}
        passwordRequirements={passwordRequirements}
        passwordStrength={passwordStrength}
        passwordsMatch={passwordsMatch}
        approvalPending={approvalPending}
        onLogout={logoutCurrentUser}
        adminTotpRequired={adminTotpRequired}
        adminTotpCode={adminTotpCode}
        setAdminTotpCode={setAdminTotpCode}
        onCancelAdminTotp={cancelAdminTotpChallenge}
      />;
    }
    return <LandingPage
      authMode={authMode}
      setAuthMode={setAuthMode}
      authForm={authForm}
      setAuthForm={setAuthForm}
      authMessage={authMessage}
      onSubmit={handleAuthSubmit}
      emailAvailability={emailAvailability}
      termsAccepted={termsAccepted}
      setTermsAccepted={setTermsAccepted}
      passwordRequirements={passwordRequirements}
      passwordStrength={passwordStrength}
      passwordsMatch={passwordsMatch}
      approvalPending={approvalPending}
      onLogout={logoutCurrentUser}
    />;
  }

  return <div className="app">
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => navigateTo("dashboard")}>
        <img className="brand-icon" src={PAGECREW_LOGO} alt="PageCrew logo" />
      </button>
      <p className="nav-title">Workspace</p>
      <nav className="nav" aria-label="Main navigation">
        <button type="button" className={activeView === "dashboard" ? "active" : ""} onClick={() => navigateTo("dashboard")}><span aria-hidden="true">⌂</span>Dashboard</button>
        <button type="button" className={activeView === "pages" ? "active" : ""} onClick={() => navigateTo("pages")}><span aria-hidden="true">▤</span>Facebook Pages</button>
        <button type="button" className={activeView === "composer" ? "active" : ""} onClick={() => navigateTo("composer")}><span aria-hidden="true">＋</span>Create Post</button>
        <button type="button" className={activeView === "manage-posts" ? "active" : ""} onClick={() => navigateTo("manage-posts")}><span aria-hidden="true">▤</span>Manage Posts</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="profile-mini">
          <span className="avatar">{profile?.name?.slice(0, 1) || "F"}</span>
          <span><strong>{profile?.name || "Facebook account"}</strong><small>{profile?.connected ? "Connected" : "Not connected"}</small></span>
        </div>
        {profile?.connected ? <button className="logout" type="button" onClick={handleLogout}>Log out</button> : null}
      </div>
    </aside>

    <div className="main" id="dashboard">
      <header className="topbar">
        <div><h1>{activeView === "dashboard" ? "Dashboard" : activeView === "pages" ? "Facebook Pages" : activeView === "composer" ? "Create Post" : "Manage Posts"}</h1><p>Manage your connected Facebook pages</p></div>
        <div className="topbar-actions">
          {authUser && <span className="account-chip"><span className="online-dot" />{authUser.name}</span>}
          {profile?.connected && <span className="account-chip"><span className="online-dot" />{profile.name}</span>}
          <a href={`${API}/auth/facebook?add=true`} className="connect">＋ {profile?.connected ? "Add Facebook account" : "Connect Facebook"}</a>
        </div>
      </header>
      {authUser ? <section className="panel auth-panel">
        <div className="panel-heading">
          <div><h2>Workspace user</h2><p>{authUser.name} is currently active</p></div>
          <button className="text-button" type="button" onClick={logoutCurrentUser}>Log out</button>
        </div>
        <div className="panel-body user-switcher-panel">
          <div className="user-summary">
            <strong>{authUser.name}</strong>
            <small>{authUser.email}</small>
          </div>
          {authUsers.length > 1 && <div className="user-switch-list">
            {authUsers.map((entry) => <button key={entry.id} type="button" className={entry.id === authUser.id ? "active user-switch-chip" : "user-switch-chip"} onClick={() => switchCurrentUser(entry.id)}>{entry.name}</button>)}
          </div>}
        </div>
      </section> : <section className="panel auth-panel">
        <div className="panel-heading">
          <div><h2>Login to workspace</h2><p>Use your real account to manage this dashboard</p></div>
        </div>
        <div className="panel-body auth-box">
          <div className="auth-toggle">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
            <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
          </div>
          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === "register" && <label><span>Name</span><input value={authForm.name} onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))} placeholder="Your full name" /></label>}
            <label><span>Email</span><input type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" /></label>
            <label><span>Password</span><input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} placeholder="••••••••" /></label>
            {authMessage && <p className="message error" role="status">{authMessage}</p>}
            <button className="primary" type="submit">{authMode === "login" ? "Login" : "Create account"}</button>
          </form>
        </div>
      </section>}
      <main className="content">
        {activeView === "dashboard" && <>
          <section className="welcome">
            <div><p className="eyebrow">SOCIAL PUBLISHING</p><h2>Good to see you{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}.</h2><p>Plan and publish across your connected pages.</p></div>
            <button className="primary create-link" type="button" onClick={() => navigateTo("composer")}>＋ Create post</button>
          </section>

          <section className="stats" aria-label="Publishing overview">
            <div className="stat"><span className="stat-icon blue">▤</span><strong>{connectedAccounts.length}</strong><small>Connected accounts</small></div>
            <div className="stat"><span className="stat-icon green">◉</span><strong>{pages.length}</strong><small>Facebook pages</small></div>
            <div className="stat"><span className="stat-icon amber">◷</span><strong>{jobs.filter((job) => job.status === "scheduled").length}</strong><small>Scheduled posts</small></div>
            <div className="stat"><span className="stat-icon green">✓</span><strong>{publishedCount}</strong><small>Published posts</small></div>
            <div className="stat"><span className="stat-icon red">!</span><strong>{failedCount}</strong><small>Failed posts</small></div>
          </section>
        </>}

        {activeView === "pages" && <section className="workspace-grid">
          <section className="panel" id="pages">
            <div className="panel-heading"><div><h2>Facebook Pages</h2><p>{profile?.name || "Select an account to view its Pages"}</p></div><button className="text-button" type="button" onClick={all}>{selected.length===activePages.length && activePages.length ? "Clear selection" : "Select all"}</button></div>
            <div className="panel-body">
              <div className="page-filters">
                <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search pages" placeholder="Search pages" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <select aria-label="Filter by account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                  <option value="all">All accounts</option>
                  {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
                </select>
              </div>
              <div className="pages-list">
                {visiblePages.map((page) => <label className="page-row" key={page.id}>
                  <input type="checkbox" checked={selected.includes(page.id)} onChange={() => toggle(page.id)} />
                  <span className="page-avatar"><span>{page.name.slice(0, 1).toUpperCase()}</span>{page.pictureUrl && <img src={page.pictureUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>
                  <span className="page-info"><strong>{page.name}</strong><small>{page.account}</small></span>
                </label>)}
                {!visiblePages.length && <p className="empty-pages">{pages.length ? "No pages match your search." : "Connect Facebook to load your pages."}</p>}
              </div>
              <p className="selection-count"><strong>{selected.length}</strong> of {activePages.length} pages selected</p>
            </div>
          </section>
        </section>}

        {activeView === "composer" && <section className="workspace-grid">
          <section className="panel composer" id="composer">
            <div className="panel-heading"><div><h2>{editingJobId ? "Edit post" : "Create post"}</h2><p>Write once, publish to selected pages</p></div></div>
            <div className="panel-body composer-layout">
              <div className="composer-fields">
                <label className="field-label" htmlFor="post-content">Post content</label>
                <textarea id="post-content" value={content} onChange={e=>setContent(e.target.value)} placeholder="What would you like to share?" />
                <div className="media-controls">
                  <input id="post-media" className="media-input" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={(event) => { chooseMedia(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                  <label className="media-button" htmlFor="post-media"><span aria-hidden="true">▧</span>Add photo/video</label>
                  {mediaFile && <><span className="media-name" title={mediaFile.name}>{mediaFile.name}</span><button className="remove-media" type="button" onClick={clearMedia} aria-label="Remove attached media">×</button></>}
                </div>
                <label className="schedule-toggle"><span>Schedule post</span><input type="checkbox" role="switch" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} /><span className="toggle-track" aria-hidden="true" /></label>
                {scheduleEnabled && <div className="schedule-fields">
                  <label><span>Date</span><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label>
                  <label><span>Time</span><input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></label>
                </div>}
                <div className="composer-actions">
                  {scheduleEnabled && <button className="primary full" disabled={(!content.trim()&&!mediaFile)||!selected.length||!scheduleDate||!scheduleTime||isScheduling} onClick={() => submitPost("schedule")}>Schedule post <span aria-hidden="true">→</span></button>}
                  <button className="publish-now" type="button" disabled={(!content.trim()&&!mediaFile)||!selected.length||isScheduling} onClick={() => submitPost("publish")}>Publish now</button>
                  <button className="save-draft" type="button" disabled={(!content.trim()&&!mediaFile)||isScheduling} onClick={() => submitPost("draft")}>Save draft</button>
                </div>
                {message&&<p className={`message ${message.startsWith("Publishing failed") || message.startsWith("Choose") || message.startsWith("Media") || message.startsWith("Could not") ? "error" : message.startsWith("Published to some") ? "warning" : ""}`} role="status">{message}</p>}
                <p className="composer-footnote">{selected.length} {selected.length === 1 ? "page" : "pages"} selected</p>
              </div>
              <div className="composer-side">
                <section className="composer-pages" aria-label="Select Facebook pages">
                  <div className="account-picker">
                    <div className="account-picker-heading"><strong>Facebook accounts</strong><a href={`${API}/auth/facebook?add=true`}>＋ Add account</a></div>
                    <div className="account-choice-list">
                      {connectedAccounts.map((account) => <button className={`account-choice ${activeAccountId === account.id ? "active" : ""}`} type="button" key={account.id} aria-pressed={activeAccountId === account.id} onClick={() => void selectFacebookAccount(account.id)}>
                        <span className="account-choice-avatar">{account.name.slice(0, 1).toUpperCase()}</span><span>{account.name}</span>
                      </button>)}
                      {!connectedAccounts.length && <a className="account-connect-link" href={`${API}/auth/facebook`}>＋ Connect a Facebook account</a>}
                    </div>
                  </div>
                  <div className="composer-pages-heading"><div><strong>{profile?.name ? `${profile.name} Pages` : "Facebook Pages"}</strong><small>{selected.length} of {activePages.length} selected</small></div><button className="text-button" type="button" disabled={!activePages.length} onClick={all}>{selected.length === activePages.length && activePages.length ? "Clear all" : "Select all"}</button></div>
                  {activeAccountId && <div className="page-filters">
                    <label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search pages" placeholder="Search pages" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                  </div>}
                  {activeAccountId ? <div className="composer-pages-list">
                    {visiblePages.map((page) => <label className="page-row" key={page.id}>
                      <input type="checkbox" checked={selected.includes(page.id)} onChange={() => toggle(page.id)} />
                      <span className="page-avatar"><span>{page.name.slice(0, 1).toUpperCase()}</span>{page.pictureUrl && <img src={page.pictureUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>
                      <span className="page-info"><strong>{page.name}</strong><small>{page.account}</small></span>
                    </label>)}
                    {!visiblePages.length && <p className="empty-pages">{activePages.length ? "No pages match your search." : "This account has no pages available."}</p>}
                  </div> : <p className="empty-pages account-pages-empty">Choose or connect a Facebook account to see its Pages.</p>}
                </section>
                <aside className="feed-preview" aria-label="Facebook feed preview">
                <div className="preview-heading">Facebook Feed preview</div>
                <article className="preview-post">
                  <header className="preview-author">
                    <span className="preview-avatar"><span>{previewPage?.name.slice(0, 1).toUpperCase() || "F"}</span>{previewPage?.pictureUrl && <img src={previewPage.pictureUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>
                    <span><strong>{previewPage?.name || "Your Facebook Page"}</strong><small>Just now · Public</small></span>
                  </header>
                  {content.trim() && <p className="preview-copy">{content}</p>}
                  {mediaPreview && ((mediaFile?.type || editingJob?.media?.mimeType || "").startsWith("video/")
                    ? <video className="preview-media" src={mediaPreview} controls />
                    : <img className="preview-media" src={mediaPreview} alt="Post attachment preview" />)}
                  {isLoadingLinkPreview && <p className="link-preview-status">Loading link preview...</p>}
                  {linkPreview && <a className="link-preview-card" href={linkPreview.url} target="_blank" rel="noopener noreferrer">
                    {linkPreview.image && <img className="link-preview-image" src={linkPreview.image} alt="" />}
                    <span className="link-preview-copy"><small>{linkPreview.siteName}</small><strong>{linkPreview.title}</strong>{linkPreview.description && <span>{linkPreview.description}</span>}<em>Open link ↗</em></span>
                  </a>}
                  {!isLoadingLinkPreview && linkPreviewError && contentLink && <a className="link-preview-fallback" href={contentLink} target="_blank" rel="noopener noreferrer">Open link in new tab ↗</a>}
                  <footer className="preview-actions"><span>Like</span><span>Comment</span><span>Share</span></footer>
                </article>
                </aside>
              </div>
            </div>
          </section>
          <section className="panel recent-panel">
            <div className="panel-heading"><div><h2>Recent</h2><p>Your latest drafts and posts</p></div><button className="text-button" type="button" onClick={() => navigateTo("manage-posts")}>View all</button></div>
            <div className="recent-list">
              {actionFeedback && <p className="post-action-feedback" role="status">{actionFeedback}</p>}
              {recentJobs.map((job) => <article className="recent-row" key={job.id}>
                <input className="recent-select" type="checkbox" aria-label={`Select post ${job.content.slice(0, 32)}`} checked={selectedJobs.includes(job.id)} onChange={() => setSelectedJobs((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])} />
                {job.media?.mimeType.startsWith("image/") ? <img className="recent-thumb" src={`${API}/posts/${job.id}/media`} alt={job.media.originalName} /> : <span className="recent-thumb recent-thumb-text">{job.content.trim().slice(0, 2).toUpperCase() || "P"}</span>}
                <span className="recent-post-copy"><strong>{job.content.trim() || job.media?.originalName || "Untitled post"}</strong><small>{job.pageIds.length} {job.pageIds.length === 1 ? "page" : "pages"} · {formatIst(job.scheduledAt)}</small></span>
                <span className="recent-row-actions"><span className={`status ${job.status}`}>{job.status}</span>{postActions(job)}</span>
              </article>)}
              {!recentJobs.length && <p className="recent-empty">Drafts and posts will appear here.</p>}
            </div>
          </section>
        </section>}

        {activeView === "manage-posts" && <section className="panel manage-panel" id="manage-posts">
          <div className="panel-heading manage-heading"><div><h2>Manage posts</h2><p>Review and organize your publishing queue</p></div><button className="primary manage-create" type="button" onClick={() => navigateTo("composer")}>＋ Create post</button></div>
          {actionFeedback && <p className="post-action-feedback" role="status">{actionFeedback}</p>}
          <div className="manage-tabs" role="tablist" aria-label="Filter posts by status">
            {manageTabs.map((status) => <button className={`manage-tab ${manageStatus === status ? "active" : ""}`} key={status} type="button" role="tab" aria-selected={manageStatus === status} onClick={() => setManageFilter(() => setManageStatus(status))}>
              {status === "all" ? "All posts" : status[0].toUpperCase() + status.slice(1)}<span>{status === "all" ? jobs.length : jobs.filter((job) => job.status === status).length}</span>
            </button>)}
          </div>
          <div className="manage-toolbar">
            <label className="search-box manage-search-box"><span aria-hidden="true">⌕</span><input aria-label="Search posts" placeholder="Search post or page" value={manageSearch} onChange={(event) => setManageFilter(() => setManageSearch(event.target.value))} /></label>
            <select aria-label="Filter posts by account" value={manageAccount} onChange={(event) => setManageFilter(() => setManageAccount(event.target.value))}>
              <option value="all">All accounts</option>
              {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
            </select>
            <select aria-label="Filter posts by date" value={manageDateRange} onChange={(event) => setManageFilter(() => setManageDateRange(event.target.value))}>
              <option value="all">Any date</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="month">This month</option>
            </select>
          </div>
          <div className="manage-table-wrap">
            <table className="manage-table">
              <thead><tr>
                <th className="select-column"><input type="checkbox" aria-label="Select posts on this page" checked={currentPageSelected} onChange={toggleCurrentPageJobs} /></th>
                <th>Post</th><th>Pages</th><th>Scheduled</th><th>Status</th><th className="action-column">Actions</th>
              </tr></thead>
              <tbody>
                {pagedJobs.map((job) => {
                  const relatedPages = job.pageIds.map((id) => pageById.get(id)).filter((page): page is Page => Boolean(page));
                  const isExpanded = expandedJob === job.id;
                  const pageErrors = Object.entries(job.pageErrors || {});
                  return <React.Fragment key={job.id}>
                    <tr>
                      <td className="select-column"><input type="checkbox" aria-label={`Select post ${job.content.slice(0, 32)}`} checked={selectedJobs.includes(job.id)} onChange={() => setSelectedJobs((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])} /></td>
                      <td><div className="managed-post">{job.media?.mimeType.startsWith("image/") ? <img className="post-thumb post-thumb-image" src={`${API}/posts/${job.id}/media`} alt={job.media.originalName} /> : <span className="post-thumb">{job.content.trim().slice(0, 2).toUpperCase() || "P"}</span>}<span><strong>{job.content || job.media?.originalName}</strong><small>{job.media?.originalName || "Text post"}</small></span></div></td>
                      <td>{job.pageIds.length} {job.pageIds.length === 1 ? "page" : "pages"}</td>
                      <td>{formatIst(job.scheduledAt)}</td>
                      <td><span className={`status ${job.status}`}>{job.status}</span></td>
                      <td className="action-column"><div className="manage-row-actions">{postActions(job)}<button className="details-button" type="button" aria-expanded={isExpanded} onClick={() => setExpandedJob(isExpanded ? "" : job.id)}>{isExpanded ? "Hide" : "View"}</button></div></td>
                    </tr>
                    {isExpanded && <tr className="details-row"><td colSpan={6}><p>{job.content || job.media?.originalName}</p><small>Target pages: {relatedPages.length ? relatedPages.map((page) => page.name).join(", ") : job.pageIds.join(", ")}</small>{pageErrors.map(([pageId, error]) => <p className="page-error" key={pageId}><strong>{pageById.get(pageId)?.name || pageId}:</strong> {error}</p>)}</td></tr>}
                  </React.Fragment>;
                })}
                {!pagedJobs.length && <tr><td className="manage-empty" colSpan={6}>{jobs.length ? "No posts match these filters." : "No posts yet. Schedule a post to see it here."}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="manage-footer">
            <span>{selectedJobs.length} selected <button className="clear-selection" type="button" disabled={!selectedJobs.length} onClick={() => setSelectedJobs([])}>Clear</button></span>
            <div className="pagination"><span>{managedJobs.length ? `${(managePage - 1) * managePageSize + 1}-${Math.min(managePage * managePageSize, managedJobs.length)} of ${managedJobs.length}` : "0 posts"}</span><button type="button" aria-label="Previous page" disabled={managePage <= 1} onClick={() => setManagePage((page) => Math.max(1, page - 1))}>‹</button><button type="button" aria-label="Next page" disabled={managePage >= managePageCount} onClick={() => setManagePage((page) => Math.min(managePageCount, page + 1))}>›</button></div>
          </div>
        </section>}
      </main>
    </div>
  </div>
}
createRoot(document.getElementById("root")!).render(<App/>);
