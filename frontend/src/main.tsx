import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import "./dashboard.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const PAGECREW_LOGO = "/pagecrew-logo.png";

type Page = {id:string; name:string; account:string; accountId?:string; pictureUrl?:string};
type Job = {id:string; content:string; pageIds:string[]; scheduledAt:string; status:string; media?:{mimeType:string; originalName:string}; pageErrors?:Record<string,string>};
type FacebookAccount = {id:string; name:string; avatarUrl?:string};
type LinkPreview = {url:string; title:string; description:string; siteName:string; image:string};
type Profile = {connected:boolean; provider:string; name:string; avatarUrl?:string; accountId?:string; activeAccountId?:string; accounts?:FacebookAccount[]};
type View = "dashboard" | "pages" | "composer" | "manage-posts";

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

  async function loadAccountPages(accountId: string) {
    const pagesRes = await fetch(`${API}/pages?accountId=${encodeURIComponent(accountId)}`, {cache: "no-store"});
    if (!pagesRes.ok) return;
    const pagesData = await pagesRes.json();
    if (Array.isArray(pagesData)) {
      setPages((current) => [...current.filter((page) => page.accountId !== accountId), ...pagesData]);
    }
  }

  async function loadProfile() {
    try {
      const response = await fetch(`${API}/auth/me`, {cache: "no-store"});
      if (!response.ok) {
        setProfile(null);
        setPages([]);
        setActiveAccountId("");
        window.localStorage.removeItem("socialpilot.activeFacebookAccount");
        return;
      }
      const data = await response.json();
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
          await fetch(`${API}/auth/active`, {
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
    }
  }

  useEffect(() => {
    loadProfile();
    fetch(`${API}/posts`).then(r=>r.json()).then(setJobs);

    const interval = window.setInterval(() => {
      fetch(`${API}/posts`).then(r=>r.json()).then(setJobs);
    }, 15000);

    return () => window.clearInterval(interval);
  },[]);

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
        const response = await fetch(`${API}/posts/link-preview?url=${encodeURIComponent(candidate)}`);
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
      const response = await fetch(`${API}/auth/active`, {
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

      const response = await fetch(editingJobId ? `${API}/posts/${editingJobId}` : `${API}/posts/${action}`, { method: editingJobId ? "PATCH" : "POST", body: formData });
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
    await fetch(`${API}/auth/logout`, {method:"POST"});
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
        response = await fetch(`${API}/posts/${job.id}`, { method: "DELETE" });
        if (response.ok) {
          setJobs((current) => current.filter((entry) => entry.id !== job.id));
          setSelectedJobs((current) => current.filter((id) => id !== job.id));
        }
      } else if (action === "duplicate") {
        response = await fetch(`${API}/posts/${job.id}/duplicate`, { method: "POST" });
        if (response.ok) {
          const duplicate = await response.json();
          setJobs((current) => [duplicate, ...current]);
        }
      } else {
        const formData = new FormData();
        formData.append("content", job.content);
        formData.append("pageIds", JSON.stringify(job.pageIds));
        formData.append("status", "draft");
        response = await fetch(`${API}/posts/${job.id}`, { method: "PATCH", body: formData });
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

  return <div className="app">
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => navigateTo("dashboard")}>
        <img className="brand-icon" src={PAGECREW_LOGO} alt="PageCrew logo" />
        <span><strong>PageCrew</strong><small>a crew handling all your pages</small></span>
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
          {profile?.connected && <span className="account-chip"><span className="online-dot" />{profile.name}</span>}
          <a href={`${API}/auth/facebook?add=true`} className="connect">＋ {profile?.connected ? "Add Facebook account" : "Connect Facebook"}</a>
        </div>
      </header>
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
