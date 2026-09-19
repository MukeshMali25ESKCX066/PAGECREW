import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const API = "http://localhost:4000/api";

type Page = {id:string; name:string; account:string};
type Job = {id:string; content:string; pageIds:string[]; scheduledAt:string; status:string};
type Profile = {connected:boolean; provider:string; name:string; avatarUrl?:string; accountId?:string};

function getCurrentIstDateTimeLocal() {
  const now = new Date();
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
  const [scheduledAt,setScheduledAt] = useState(() => getCurrentIstDateTimeLocal());
  const [jobs,setJobs] = useState<Job[]>([]);
  const [message,setMessage] = useState("");
  const [profile,setProfile] = useState<Profile | null>(null);

  async function loadProfile() {
    try {
      const r = await fetch(`${API}/auth/me`, {cache: "no-store"});
      if (!r.ok) {
        setProfile(null);
        setPages([]);
        return;
      }
      const data = await r.json();
      const nextProfile = data.connected ? data : null;
      setProfile(nextProfile);

      if (nextProfile) {
        const pagesRes = await fetch(`${API}/pages`, {cache: "no-store"});
        const pagesData = await pagesRes.json();
        setPages(Array.isArray(pagesData) ? pagesData : []);
      } else {
        setPages([]);
      }

      const url = new URL(window.location.href);
      if (data.connected && url.searchParams.get("connected") === "facebook") {
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

  const toggle=(id:string)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const all=()=>setSelected(selected.length===pages.length?[]:pages.map(p=>p.id));

  async function schedule(){
    setMessage("");
    const r=await fetch(`${API}/posts/schedule`,{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({content,pageIds:selected,scheduledAt})
    });
    const data=await r.json();
    if(!r.ok){setMessage(data.error||"Failed");return;}
    setJobs(j=>[...j,data]); setContent(""); setMessage(`Scheduled for ${selected.length} Pages`);
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

  return <div className="app">
    <header>
      <div className="brand-wrap">
        <b>SocialPilot Hub</b>
        <span>One Post. Every Page.</span>
      </div>

      {profile?.connected ? (
        <div className="profile-menu">
          <button className="profile-button" type="button">
            <img src={profile.avatarUrl || "https://graph.facebook.com/100000000001/picture?type=square"} alt={profile.name} />
            <span>{profile.name}</span>
            <span className="caret">▼</span>
          </button>
          <div className="profile-dropdown">
            <button type="button">More</button>
            <button type="button" className="danger" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      ) : (
        <a href={`${API}/auth/facebook`} className="connect">+ Connect Facebook Account</a>
      )}
    </header>
    <main>
      <section className="stats">
        <div><strong>5</strong><small>Accounts</small></div>
        <div><strong>{pages.length}+</strong><small>Pages</small></div>
        <div><strong>{jobs.length}</strong><small>Scheduled</small></div>
      </section>
      <section className="grid">
        <div className="card pages">
          <div className="cardhead"><h2>Facebook Pages</h2><button onClick={all}>{selected.length===pages.length?"Clear":"Select All"}</button></div>
          {Object.entries(groups).map(([account,list])=><div className="account" key={account}>
            <h3>{account}</h3>
            {list.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggle(p.id)}/>{p.name}</label>)}
          </div>)}
        </div>
        <div className="card composer">
          <h2>Create Post</h2>
          <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Write your post..."/>
          <label>Schedule date & time</label>
          <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/>
          <button className="primary" disabled={!content||!selected.length||!scheduledAt} onClick={schedule}>SCHEDULE TO SELECTED PAGES</button>
          {message&&<p className="message">{message}</p>}
          <p className="hint">{selected.length} Pages selected</p>
        </div>
      </section>
      <section className="card"><h2>Scheduled Posts</h2>
        {jobs.length===0?<p>No scheduled posts yet.</p>:jobs.map(j=><div className="job" key={j.id}>
          <span>{j.content}</span><small>{j.pageIds.length} Pages · {formatIst(j.scheduledAt)} · {j.status}</small>
        </div>)}
      </section>
    </main>
  </div>
}
createRoot(document.getElementById("root")!).render(<App/>);
