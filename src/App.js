import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, orderBy, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail } from "firebase/auth";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8SQ-cZEsbFtPzoqMw8Lq0pJ9xfZatBnA",
  authDomain: "kiln-booker.firebaseapp.com",
  projectId: "kiln-booker",
  storageBucket: "kiln-booker.firebasestorage.app",
  messagingSenderId: "1031788137264",
  appId: "1:1031788137264:web:b0ee70138f2544f38d56f5",
};

// ─── MASTER PASSWORD (change this — it's the shared studio admin password) ────
const MASTER_PASSWORD = "kiln1234";

// ─── INITIAL SUPER ADMIN (seeded to Firestore on first run) ──────────────────
const SEED_ADMIN = { name: "Eryn", role: "superadmin" };


// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const HOURS = Array.from({length:24},(_,i)=>i);
const PRESET_HOURS = { "Bisque":10,"Glaze Low-Fire":8,"Glaze Mid-Fire":12,"Glaze High-Fire":14,"Reduction":16,"Custom":null };
const KILN_PHOTOS = [
  "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&q=80",
  "https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=400&q=80",
  "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400&q=80",
];
const DEFAULT_KILNS = [
  { id:"kiln-a", name:"Kiln A", type:"Electric", color:"#c8502a", maxTempF:2300, capacityCuFt:7, notes:"Top-loader. Best for bisque and low-fire.", firingTypes:["Bisque","Glaze Low-Fire"], circuit:"Circuit 1", outOfOrder:false, imageUrl:KILN_PHOTOS[0] },
  { id:"kiln-b", name:"Kiln B", type:"Electric", color:"#b07d2a", maxTempF:2300, capacityCuFt:5, notes:"Front-loader. Great for test tiles.", firingTypes:["Bisque","Glaze Low-Fire","Glaze Mid-Fire"], circuit:"Circuit 1", outOfOrder:false, imageUrl:KILN_PHOTOS[1] },
  { id:"kiln-c", name:"Kiln C", type:"Gas", color:"#4a7c59", maxTempF:2400, capacityCuFt:18, notes:"Large reduction kiln. Ensure ventilation is on.", firingTypes:["Glaze Mid-Fire","Glaze High-Fire","Reduction"], circuit:"Circuit 2", outOfOrder:false, imageUrl:KILN_PHOTOS[2] },
];
const MOCK_BOOKINGS = [
  {id:"b1",kilnId:"kiln-a",date:"2026-03-05",startHour:8,duration:10,user:"Maya Chen",phone:"512-555-0101",type:"Bisque",note:"Spring collection",paid:false,cancelled:false,createdAt:""},
  {id:"b2",kilnId:"kiln-c",date:"2026-03-07",startHour:6,duration:14,user:"Sara Kim",phone:"512-555-0202",type:"Glaze High-Fire",note:"Porcelain vases",paid:true,cancelled:false,createdAt:""},
  {id:"b3",kilnId:"kiln-b",date:"2026-03-10",startHour:9,duration:8,user:"Tom Rivera",phone:"512-555-0303",type:"Glaze Low-Fire",note:"",paid:false,cancelled:false,createdAt:""},
];
const MOCK_POSTS = [
  {id:"p1",author:"Maya Chen",content:"Anyone have tips for preventing crawling on thick glazes?",pinned:false,time:"2 hours ago",replies:[{id:"r1",author:"Tom Rivera",content:"Apply thinner coats and make sure bisqueware is fully dry!",time:"1 hour ago"}]},
  {id:"p2",author:"Eryn (Admin)",content:"🔔 Studio closed March 15 for maintenance.",pinned:true,time:"Yesterday",replies:[]},
];
const MOCK_MESSAGES = {
  "Tom Rivera":[{id:1,from:"Tom Rivera",text:"Hey! Did you see the new cone 10 schedule?",time:"10:30 am"},{id:2,from:"You",text:"Not yet, when does it start?",time:"10:45 am"}],
  "Sara Kim":[{id:1,from:"Sara Kim",text:"Can I borrow your kiln wash recipe?",time:"Yesterday"}],
  "Lee Park":[],"Maya Chen":[],
};
const CONTACTS=[{name:"Tom Rivera"},{name:"Sara Kim"},{name:"Lee Park"},{name:"Maya Chen"}];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2,"0");
const fmtHr = h => h===0?"12 am":h<12?`${h} am`:h===12?"12 pm":`${h-12} pm`;
const getDIM = (y,m) => new Date(y,m+1,0).getDate();
const getFD  = (y,m) => new Date(y,m,1).getDay();
const dStr   = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
const avLet  = n => n?.trim()?.[0]?.toUpperCase()||"?";
const hColor = s => { const c=["#c8502a","#b07d2a","#4a7c59","#5a6a9a","#7a4a6a","#3a7a8a","#8a4a3a"]; let h=0; for(let i=0;i<s.length;i++)h=s.charCodeAt(i)+(h<<5)-h; return c[Math.abs(h)%c.length]; };
const now = () => new Date().toISOString();

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',system-ui,sans-serif;background:#f4efe8;color:#1e120a;}
:root{
  --clay:#c8502a;--clay-d:#9e3d1e;--clay-l:#fef3ee;--clay-ll:#fff8f5;
  --earth:#b07d2a;--earth-l:#fdf6e8;--moss:#4a7c59;--moss-l:#eef6f1;
  --ink:#1e120a;--mid:#6b4f3a;--pale:#a89080;
  --surf:#faf7f2;--bdr:#ddd0c0;--white:#fff;
  --danger:#dc2626;--danger-l:#fee2e2;--success:#16a34a;--success-l:#dcfce7;
  --warn:#d97706;--warn-l:#fef3c7;--info:#2563eb;--info-l:#dbeafe;
}
.nt{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.875rem;font-weight:500;padding:.45rem .85rem;border-radius:6px;color:#c8a882;transition:all .15s;display:flex;align-items:center;gap:.35rem;white-space:nowrap;}
.nt:hover{color:#f5f0e8;background:rgba(255,255,255,.1);}
.nt.on{background:var(--clay);color:white;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.3rem;border:none;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.875rem;font-weight:600;padding:.5rem 1.1rem;transition:all .15s;line-height:1;}
.bp{background:var(--clay);color:white;}.bp:hover{background:var(--clay-d);}.bp:disabled{opacity:.4;cursor:not-allowed;}
.bs{background:transparent;color:var(--clay);border:1.5px solid var(--clay);}.bs:hover{background:var(--clay);color:white;}
.bg{background:transparent;color:var(--mid);border:1px solid var(--bdr);}.bg:hover{background:var(--bdr);}
.bd{background:var(--danger-l);color:var(--danger);}.bd:hover{background:#fecaca;}
.bw{background:var(--warn-l);color:var(--warn);}.bw:hover{background:#fde68a;}
.bsuc{background:var(--success-l);color:var(--success);}.bsuc:hover{background:#bbf7d0;}
.sm{padding:.3rem .65rem;font-size:.78rem;}.xs{padding:.2rem .5rem;font-size:.72rem;}
.card{background:var(--white);border:1px solid var(--bdr);border-radius:10px;}
.mo{position:fixed;inset:0;background:rgba(30,18,10,.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:1rem;}
.md{background:var(--surf);border-radius:12px;padding:1.75rem;width:500px;max-width:100%;max-height:92vh;overflow-y:auto;border:1px solid var(--bdr);box-shadow:0 20px 60px rgba(30,18,10,.25);}
.fl label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--earth);margin-bottom:.3rem;}
.fl{margin-bottom:.9rem;}
.fl select,.fl input,.fl textarea{width:100%;padding:.52rem .75rem;border:1.5px solid var(--bdr);border-radius:6px;background:white;font-family:'DM Sans',sans-serif;font-size:.88rem;color:var(--ink);transition:border-color .15s;}
.fl select:focus,.fl input:focus,.fl textarea:focus{outline:none;border-color:var(--clay);}
.fl textarea{resize:vertical;min-height:68px;}
.chip{font-size:.67rem;font-weight:700;border-radius:4px;padding:2px 5px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:white;display:block;}
.dc{border-radius:8px;cursor:pointer;min-height:68px;padding:5px;border:1.5px solid var(--bdr);background:white;transition:all .12s;}
.dc:hover{border-color:var(--clay);background:var(--clay-ll);}
.dc.sel{border-color:var(--clay);border-width:2px;background:var(--clay-l);}
.dc.tod{border-color:var(--earth);}
.twrap{flex:1;height:28px;background:#f0e8dc;border-radius:4px;position:relative;overflow:hidden;}
.tblk{position:absolute;top:2px;height:24px;border-radius:3px;display:flex;align-items:center;padding:0 5px;font-size:.65rem;font-weight:600;color:white;overflow:hidden;white-space:nowrap;}
.av{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;flex-shrink:0;}
.mb{padding:.52rem .9rem;border-radius:16px;max-width:78%;font-size:.88rem;line-height:1.5;}
.cr{padding:.58rem .72rem;cursor:pointer;border-radius:7px;transition:background .12s;display:flex;align-items:center;gap:.58rem;}
.cr:hover{background:#f0e8dc;}.cr.ac{background:var(--clay-l);border-left:3px solid var(--clay);}
.bdg{display:inline-flex;align-items:center;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:99px;white-space:nowrap;}
.tp{background:none;border:none;font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;padding:.32rem .85rem;border-radius:6px;cursor:pointer;color:var(--mid);transition:all .12s;}
.tp.on{background:var(--clay);color:white;}
.alert{border-radius:8px;padding:.65rem .95rem;font-size:.83rem;font-weight:500;display:flex;align-items:flex-start;gap:.45rem;line-height:1.45;}
.a-warn{background:var(--warn-l);color:#92400e;border:1px solid #fcd34d;}
.a-err{background:var(--danger-l);color:#991b1b;border:1px solid #fca5a5;}
.a-ok{background:var(--success-l);color:#14532d;border:1px solid #86efac;}
.a-info{background:var(--info-l);color:#1e40af;border:1px solid #93c5fd;}
.stat-card{background:white;border:1px solid var(--bdr);border-radius:10px;padding:1rem 1.1rem;}
.offline-bar{position:fixed;top:0;left:0;right:0;z-index:500;background:#1e120a;color:#fbbf24;padding:.48rem 1rem;text-align:center;font-size:.82rem;font-weight:600;letter-spacing:.03em;}
.pinned-badge{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;display:inline-flex;align-items:center;gap:3px;}
.oo-badge{background:var(--danger-l);color:var(--danger);font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;}
.paid-badge{background:var(--success-l);color:var(--success);font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;}
.unpaid-badge{background:var(--warn-l);color:var(--warn);font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;}
.kiln-img{width:100%;height:156px;object-fit:cover;border-radius:8px;margin-bottom:.7rem;border:1px solid var(--bdr);}
.kiln-img-thumb{width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid var(--bdr);flex-shrink:0;}
.admin-tag{background:#1e120a;color:#c8a882;font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;}
.super-tag{background:var(--clay);color:white;font-size:.67rem;font-weight:700;padding:2px 7px;border-radius:99px;}
input::placeholder,textarea::placeholder{color:#b8a898;}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#d4c4b0;border-radius:3px}
@media(min-width:480px){.nav-label{display:inline!important}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
export default function PotteryApp() {
  const [online, setOnline]     = useState(navigator.onLine);
  const [fbReady, setFbReady]   = useState(false);
  const [fbError, setFbError]   = useState(null);
  const [kilns, setKilns]       = useState(DEFAULT_KILNS);
  const [bookings, setBookings] = useState(MOCK_BOOKINGS);
  const [posts, setPosts]       = useState(MOCK_POSTS);
  const [admins, setAdmins]     = useState([{ name: SEED_ADMIN.name, role: "superadmin" }]);

  // UI
  const [view, setView]               = useState("calendar");
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1));
  const [selectedDay, setSelectedDay] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState({});
  const [bookingError, setBookingError] = useState("");
  const [messages, setMessages]       = useState(MOCK_MESSAGES);
  const [activeContact, setActiveContact] = useState("Tom Rivera");
  const [newMessage, setNewMessage]   = useState("");
  const [newPost, setNewPost]         = useState("");
  const [showReply, setShowReply]     = useState({});
  const [replyText, setReplyText]     = useState({});

  // Member auth (Firebase Authentication)
  const [member, setMember]               = useState(null);  // { uid, email, displayName }
  const [authLoading, setAuthLoading]     = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode]           = useState("signin");
  const [authEmail, setAuthEmail]         = useState("");
  const [authPassword, setAuthPassword]   = useState("");
  const [authName, setAuthName]           = useState("");
  const [authError, setAuthError]         = useState("");
  const [authLoading2, setAuthLoading2]   = useState(false);

  // Member profile (stored in Firestore "members/{uid}")
  const [profile, setProfile]         = useState({});
  const [profileDraft, setProfileDraft] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg]   = useState("");

  // Admin auth
  const [adminUser, setAdminUser]         = useState(null); // { name, role }
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginName, setLoginName]         = useState("");
  const [loginPass, setLoginPass]         = useState("");
  const [loginError, setLoginError]       = useState("");
  const isAdmin = !!adminUser;

  // Admin panel
  const [adminTab, setAdminTab]       = useState("dashboard");
  const [editingKiln, setEditingKiln] = useState(null);
  const [kilnDraft, setKilnDraft]     = useState({});
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("admin");
  const [adminMsg, setAdminMsg]       = useState("");
  const [circuits, setCircuits]       = useState(["Circuit 1","Circuit 2","Circuit 3","Circuit 4"]);
  const [newCircuitName, setNewCircuitName] = useState("");

  // Studio branding (saved to Firestore "settings/studio")
  const [studioSettings, setStudioSettings] = useState({
    name: "Earthen Studio",
    tagline: "Kiln Booking",
    emoji: "🏺",
    accentColor: "#c8502a",
    bgColor: "#f4efe8",
    headerBg: "#1e120a",
  });
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null); // booking to cancel
  const [cancelName, setCancelName]     = useState("");
  const [cancelPhone, setCancelPhone]   = useState("");
  const [cancelError, setCancelError]   = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const dbRef   = useRef(null);
  const authRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── Online ──
  useEffect(() => {
    const up = () => setOnline(true), dn = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, activeContact]);

  // ── Firebase init ──
  useEffect(() => {
    async function init() {
      try {
        const app  = initializeApp(FIREBASE_CONFIG);
        const fs   = getFirestore(app);
        const auth = getAuth(app);
        dbRef.current   = { fs, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, orderBy };
        authRef.current = { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail };

        // Watch auth state — restores session automatically on page reload
        onAuthStateChanged(auth, async user => {
          if (user) {
            await user.reload();
            const displayName = user.displayName || user.email.split("@")[0];
            setMember({ uid: user.uid, email: user.email, displayName });
            try {
              const snap = await getDoc(doc(fs, "members", user.uid));
              if (snap.exists()) setProfile(snap.data());
              else setProfile({});
            } catch(e) { setProfile({}); }
          } else {
            setMember(null);
            setProfile({});
          }
          setAuthLoading(false);
        });

        // Bookings
        onSnapshot(query(collection(fs,"bookings"), orderBy("createdAt","desc")), snap => {
          setBookings(snap.docs.map(d => ({ id:d.id, ...d.data() })));
        });
        // Posts
        onSnapshot(query(collection(fs,"posts"), orderBy("createdAt","desc")), snap => {
          setPosts(snap.docs.map(d => ({ id:d.id, ...d.data(), replies: d.data().replies||[] })));
        });
        // Kilns
        onSnapshot(collection(fs,"kilns"), snap => {
          if (!snap.empty) setKilns(snap.docs.map(d => ({ id:d.id, ...d.data() })));
          else DEFAULT_KILNS.forEach(k => setDoc(doc(fs,"kilns",k.id), k));
        });
        // Admins
        onSnapshot(collection(fs,"admins"), async snap => {
          if (!snap.empty) {
            setAdmins(snap.docs.map(d => ({ id:d.id, ...d.data() })));
          } else {
            await setDoc(doc(fs,"admins", SEED_ADMIN.name.toLowerCase()), { name: SEED_ADMIN.name, role:"superadmin" });
          }
        });

        // Studio settings
        onSnapshot(doc(fs,"settings","studio"), snap => {
          if (snap.exists()) setStudioSettings(s => ({ ...s, ...snap.data() }));
        });

        // Studio settings
        onSnapshot(doc(fs,"settings","studio"), snap => {
          if (snap.exists()) setStudioSettings(s => ({ ...s, ...snap.data() }));
        });

        setFbReady(true);
      } catch(e) {
        console.warn("Firebase unavailable, demo mode:", e.message);
        setFbError("Demo mode — changes won't be saved to the cloud.");
        setAuthLoading(false);
      }
    }
    init();
  }, []);

  // ── Member auth ──
  async function handleSignUp() {
    if (!authName.trim()) { setAuthError("Please enter your name."); return; }
    if (!authEmail.trim()) { setAuthError("Please enter your email."); return; }
    if (authPassword.length < 6) { setAuthError("Password must be at least 6 characters."); return; }
    setAuthLoading2(true); setAuthError("");
    try {
      const { auth, createUserWithEmailAndPassword, updateProfile } = authRef.current;
      const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await updateProfile(cred.user, { displayName: authName.trim() });
      // Reload to ensure displayName is persisted before reading it back
      await cred.user.reload();
      const displayName = cred.user.displayName || authName.trim();
      setMember({ uid: cred.user.uid, email: cred.user.email, displayName });
      setShowAuthModal(false); setAuthEmail(""); setAuthPassword(""); setAuthName("");
    } catch(e) {
      const msgs = { "auth/email-already-in-use":"An account with that email already exists.", "auth/invalid-email":"Invalid email address.", "auth/weak-password":"Password is too weak." };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthLoading2(false);
  }

  async function handleSignIn() {
    if (!authEmail.trim() || !authPassword) { setAuthError("Please enter your email and password."); return; }
    setAuthLoading2(true); setAuthError("");
    try {
      const { auth, signInWithEmailAndPassword } = authRef.current;
      const cred = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setMember({ uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName || cred.user.email.split("@")[0] });
      setShowAuthModal(false); setAuthEmail(""); setAuthPassword("");
    } catch(e) {
      const msgs = { "auth/invalid-credential":"Incorrect email or password.", "auth/user-not-found":"No account found with that email.", "auth/wrong-password":"Incorrect password." };
      setAuthError(msgs[e.code] || "Incorrect email or password.");
    }
    setAuthLoading2(false);
  }

  async function handleSignOut() {
    if (authRef.current) await authRef.current.signOut(authRef.current.auth);
    setMember(null);
  }

  async function handleForgotPassword() {
    if (!authEmail.trim()) { setAuthError("Enter your email above first."); return; }
    try {
      const { auth, sendPasswordResetEmail } = authRef.current;
      await sendPasswordResetEmail(auth, authEmail.trim());
      setAuthError("✓ Password reset email sent — check your inbox.");
    } catch(e) { setAuthError("Couldn't send reset email. Check the address and try again."); }
  }

  // ── Admin login ──
  function handleAdminLogin() {
    const trimmed = loginName.trim();
    if (!trimmed) { setLoginError("Please enter your name."); return; }
    if (loginPass !== MASTER_PASSWORD) { setLoginError("Incorrect password."); return; }
    const match = admins.find(a => a.name.toLowerCase() === trimmed.toLowerCase());
    if (!match) { setLoginError("Your name isn't on the admin list. Ask a superadmin to add you."); return; }
    setAdminUser({ name: match.name, role: match.role });
    setShowAdminLogin(false); setLoginName(""); setLoginPass(""); setLoginError("");
  }

  // ── Conflict detection (multi-day aware) ──
  // Bookings now store startTs and endTs as ISO strings for reliable comparison
  function toTs(date, hour) { return new Date(`${date}T${pad(hour)}:00:00`).getTime(); }
  function getConflict(kilnId, startDate, startHour, endDate, endHour, excludeId=null) {
    const newStart = toTs(startDate, startHour);
    const newEnd   = toTs(endDate, endHour);
    if (newEnd <= newStart) return "Unload time must be after load time.";
    const active = bookings.filter(b => !b.cancelled);
    const ov = active.find(b => {
      if (excludeId && b.id===excludeId) return false;
      if (b.kilnId!==kilnId) return false;
      const bStart = toTs(b.startDate||b.date, b.startHour);
      const bEnd   = toTs(b.endDate||b.date, b.startHour+b.duration);
      return newStart < bEnd && newEnd > bStart;
    });
    if (ov) {
      const k = kilns.find(k=>k.id===kilnId);
      return `${k?.name} is already booked ${ov.startDate||ov.date} ${fmtHr(ov.startHour)} → ${ov.endDate||ov.date} ${fmtHr(ov.endHour||ov.startHour+ov.duration)} by ${ov.user}.`;
    }
    const circuit = kilns.find(k=>k.id===kilnId)?.circuit;
    if (circuit) {
      const sibs = kilns.filter(k=>k.circuit===circuit&&k.id!==kilnId).map(k=>k.id);
      const cc = active.find(b => {
        if (excludeId && b.id===excludeId) return false;
        if (!sibs.includes(b.kilnId)) return false;
        const bStart = toTs(b.startDate||b.date, b.startHour);
        const bEnd   = toTs(b.endDate||b.date, b.endHour||b.startHour+b.duration);
        return newStart < bEnd && newEnd > bStart;
      });
      if (cc) { const ck=kilns.find(k=>k.id===cc.kilnId); return `Circuit conflict: ${ck?.name} (${circuit}) is running during that time.`; }
    }
    return null;
  }

  // ── Booking ──
  function openBookingModal() {
    const k = kilns.find(k=>!k.outOfOrder)||kilns[0];
    const dt = k?.firingTypes?.[0]||"Bisque";
    const kiln_preset = (k?.presetHours||{})[dt] ?? PRESET_HOURS[dt] ?? 10;
    const startDate = dStr(year, month, selectedDay);
    // Calculate end date/time by adding preset hours to start
    const startMs = new Date(`${startDate}T08:00:00`).getTime();
    const endMs   = startMs + kiln_preset * 3600000;
    const endD    = new Date(endMs);
    const endDate = dStr(endD.getFullYear(), endD.getMonth(), endD.getDate());
    const endHour = endD.getHours();
    setBookingForm({ kilnId:k?.id, startDate, startHour:8, endDate, endHour, type:dt, duration:kiln_preset, user:"", phone:"", note:"", customHours:"" });
    setBookingError(""); setShowBookingModal(true);
  }

  async function submitBooking() {
    if (!member) { setBookingError("Please sign in to book a kiln."); return; }
    const { startDate, startHour, endDate, endHour, kilnId, type, note, phone } = bookingForm;
    if (!startDate || !endDate) { setBookingError("Please select start and end dates."); return; }
    const startMs = toTs(startDate, startHour);
    const endMs   = toTs(endDate, endHour);
    if (endMs <= startMs) { setBookingError("Unload time must be after load time."); return; }
    const durationHrs = Math.round((endMs - startMs) / 3600000);
    const conflict = getConflict(kilnId, startDate, startHour, endDate, endHour);
    if (conflict) { setBookingError(conflict); return; }
    const bk = { kilnId, startDate, startHour, endDate, endHour, duration:durationHrs,
      date: startDate,
      user: member.displayName, uid: member.uid,
      phone: phone||"", type, note:note||"",
      paid:false, cancelled:false, createdAt:now() };
    if (dbRef.current) {
      const {addDoc,collection,fs,serverTimestamp} = dbRef.current;
      await addDoc(collection(fs,"bookings"), {...bk, createdAt:serverTimestamp()});
    } else setBookings(p=>[...p,{id:"b"+Date.now(),...bk}]);
    setShowBookingModal(false);
  }

  // ── Admin actions ──
  async function fbUpdate(col, id, data) {
    if (dbRef.current) { const {doc,updateDoc,fs}=dbRef.current; await updateDoc(doc(fs,col,id),data); }
  }
  async function fbDelete(col, id) {
    if (dbRef.current) { const {doc,deleteDoc,fs}=dbRef.current; await deleteDoc(doc(fs,col,id)); }
  }
  async function fbSet(col, id, data) {
    if (dbRef.current) { const {doc,setDoc,fs}=dbRef.current; await setDoc(doc(fs,col,id),data); }
  }
  async function fbAdd(col, data) {
    if (dbRef.current) { const {addDoc,collection,serverTimestamp,fs}=dbRef.current; await addDoc(collection(fs,col),{...data,createdAt:serverTimestamp()}); }
  }

  async function cancelBooking(id) {
    await fbUpdate("bookings",id,{cancelled:true,cancelledAt:now(),cancelledBy:adminUser?.name||"user"});
    if (!dbRef.current) setBookings(p=>p.map(b=>b.id===id?{...b,cancelled:true}:b));
  }
  async function togglePaid(id,paid) {
    await fbUpdate("bookings",id,{paid:!paid,paidMarkedBy:adminUser?.name,paidMarkedAt:now()});
    if (!dbRef.current) setBookings(p=>p.map(b=>b.id===id?{...b,paid:!paid}:b));
  }
  async function togglePin(id,pinned) {
    await fbUpdate("posts",id,{pinned:!pinned});
    if (!dbRef.current) setPosts(p=>p.map(x=>x.id===id?{...x,pinned:!pinned}:x));
  }
  async function deletePost(id) {
    await fbDelete("posts",id);
    if (!dbRef.current) setPosts(p=>p.filter(x=>x.id!==id));
  }
  async function toggleOOO(id,current) {
    await fbUpdate("kilns",id,{outOfOrder:!current});
    if (!dbRef.current) setKilns(p=>p.map(k=>k.id===id?{...k,outOfOrder:!k.outOfOrder}:k));
  }
  async function saveKiln() {
    const firingTypes = typeof kilnDraft.firingTypesRaw==="string"
      ? kilnDraft.firingTypesRaw.split(",").map(s=>s.trim()).filter(Boolean)
      : kilnDraft.firingTypes||[];
    const data = {...kilnDraft, firingTypes, maxTempF:+kilnDraft.maxTempF, capacityCuFt:+kilnDraft.capacityCuFt, outOfOrder:!!kilnDraft.outOfOrder};
    delete data.firingTypesRaw;
    await fbSet("kilns",data.id,data);
    if (!dbRef.current) { if(editingKiln==="new") setKilns(p=>[...p,data]); else setKilns(p=>p.map(k=>k.id===editingKiln?data:k)); }
    setEditingKiln(null);
  }
  async function deleteKiln(id) {
    await fbDelete("kilns",id);
    if (!dbRef.current) setKilns(p=>p.filter(k=>k.id!==id));
  }

  // ── Admin management ──
  async function addAdmin() {
    const name = newAdminName.trim();
    if (!name) return;
    if (admins.find(a=>a.name.toLowerCase()===name.toLowerCase())) { setAdminMsg("That name is already an admin."); return; }
    const entry = { name, role: newAdminRole };
    await fbSet("admins", name.toLowerCase(), entry);
    if (!dbRef.current) setAdmins(p=>[...p,entry]);
    setNewAdminName(""); setAdminMsg(`✓ ${name} added as ${newAdminRole}.`);
    setTimeout(()=>setAdminMsg(""),3000);
  }
  async function removeAdmin(name) {
    if (name.toLowerCase()===SEED_ADMIN.name.toLowerCase()) { setAdminMsg("Cannot remove the original superadmin."); setTimeout(()=>setAdminMsg(""),3000); return; }
    await fbDelete("admins", name.toLowerCase());
    if (!dbRef.current) setAdmins(p=>p.filter(a=>a.name!==name));
    setAdminMsg(`${name} removed.`); setTimeout(()=>setAdminMsg(""),3000);
  }

  // ── Studio settings ──
  async function saveSettings(draft) {
    setStudioSettings(draft);
    await fbSet("settings","studio", draft);
    setSettingsDraft(null);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  }

  async function verifyCancelAndSubmit() {
    if (!cancelName.trim()) { setCancelError("Please enter your name."); return; }
    const nameMatch = cancelTarget.user.toLowerCase() === cancelName.trim().toLowerCase();
    // Phone is optional at booking time so only check it if the booking has one
    const phoneMatch = !cancelTarget.phone || cancelTarget.phone.replace(/\D/g,"") === cancelPhone.replace(/\D/g,"");
    if (!nameMatch || !phoneMatch) { setCancelError("Name or phone number doesn't match the booking."); return; }
    await cancelBooking(cancelTarget.id);
    setCancelTarget(null); setCancelName(""); setCancelPhone(""); setCancelError("");
  }
  async function saveProfile(draft) {
    if (!member) return;
    setProfileSaving(true);
    try {
      if (draft.displayName?.trim() && draft.displayName.trim() !== member.displayName) {
        await updateProfile(authRef.current.auth.currentUser, { displayName: draft.displayName.trim() });
        setMember(m => ({ ...m, displayName: draft.displayName.trim() }));
      }
      await fbSet("members", member.uid, { ...draft, email: member.email, updatedAt: now() });
      setProfile(draft);
      setProfileDraft(null);
      setProfileMsg("✓ Profile saved!");
      setTimeout(() => setProfileMsg(""), 3000);
    } catch(e) { setProfileMsg("Error saving — try again."); }
    setProfileSaving(false);
  }

  async function submitPost() {
    if (!newPost.trim()) return;
    const authorName = isAdmin ? `${adminUser.name} (Admin)` : "You";
    const entry = { author:authorName, content:newPost.trim(), pinned:false, replies:[], time:"Just now", createdAt:now() };
    await fbAdd("posts",entry);
    if (!dbRef.current) setPosts(p=>[{id:"p"+Date.now(),...entry},...p]);
    setNewPost("");
  }
  async function submitReply(postId) {
    if (!replyText[postId]?.trim()) return;
    const authorName = isAdmin ? `${adminUser.name} (Admin)` : "You";
    const reply = { id:"r"+Date.now(), author:authorName, content:replyText[postId].trim(), time:"Just now" };
    const post = posts.find(p=>p.id===postId);
    await fbUpdate("posts",postId,{ replies:[...(post?.replies||[]),reply] });
    if (!dbRef.current) setPosts(p=>p.map(x=>x.id===postId?{...x,replies:[...x.replies,reply]}:x));
    setReplyText(p=>({...p,[postId]:""})); setShowReply(p=>({...p,[postId]:false}));
  }

  // ── Derived ──
  const active      = bookings.filter(b=>!b.cancelled);
  const daysInMonth = getDIM(year,month);
  const firstDay    = getFD(year,month);
  const selDS       = selectedDay ? dStr(year,month,selectedDay) : null;
  const selBks = selDS ? active.filter(b => {
    const bStart = b.startDate||b.date;
    const bEnd   = b.endDate||b.date;
    return selDS >= bStart && selDS <= bEnd;
  }) : [];
  const selKiln = kilns.find(k=>k.id===bookingForm.kilnId);
  const prevConflict = showBookingModal && bookingForm.startDate && bookingForm.endDate
    ? getConflict(bookingForm.kilnId, bookingForm.startDate, bookingForm.startHour, bookingForm.endDate, bookingForm.endHour)
    : null;
  const sortedPosts = [...posts].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));

  function getStats() {
    const totalHours = active.reduce((s,b)=>s+b.duration,0);
    const byKiln = kilns.map(k=>({...k, hours:active.filter(b=>b.kilnId===k.id).reduce((s,b)=>s+b.duration,0), count:active.filter(b=>b.kilnId===k.id).length}));
    return { total:active.length, totalHours, byKiln, paid:active.filter(b=>b.paid).length, unpaid:active.filter(b=>!b.paid).length, cancelled:bookings.filter(b=>b.cancelled).length, users:[...new Set(active.map(b=>b.user))] };
  }
  const stats = getStats();

  // ═══════════════════════════════════════════════════════════════════════════
  const accent = studioSettings.accentColor || "#c8502a";
  const accentDark = accent; // simplification — could compute darker shade
  const dynamicCSS = CSS.replace(/var\(--clay\)/g, accent).replace(/var\(--clay-d\)/g, accentDark);

  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:studioSettings.bgColor||"#f4efe8",minHeight:"100vh"}}>
      <style>{dynamicCSS}</style>

      {!online && <div className="offline-bar">⚡ You're offline — connect to Wi-Fi to book a kiln. Bookings won't be saved until you reconnect.</div>}
      {fbError && <div style={{background:"var(--warn-l)",borderBottom:"1px solid #fcd34d",padding:".4rem 1rem",fontSize:".76rem",color:"#92400e",textAlign:"center",fontWeight:500}}>📡 {fbError}</div>}

      {/* ── HEADER ── */}
      <div style={{background:studioSettings.headerBg||"#1e120a",padding:"0 .75rem",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:online?0:30,zIndex:50,boxShadow:"0 2px 14px rgba(0,0,0,.28)",minHeight:52}}>
        {/* Logo + name */}
        <div style={{display:"flex",alignItems:"center",gap:".5rem",flexShrink:0}}>
          {studioSettings.logoUrl
            ? <img src={studioSettings.logoUrl} alt="logo" style={{width:28,height:28,borderRadius:5,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
            : <span style={{fontSize:"1.2rem"}}>{studioSettings.emoji||"🏺"}</span>
          }
          <div style={{lineHeight:1.1}}>
            <div style={{fontSize:".85rem",fontWeight:700,color:"#f5f0e8",whiteSpace:"nowrap"}}>{studioSettings.name||"Earthen Studio"}</div>
            <div style={{fontSize:".55rem",fontWeight:600,color:"#c8a882",letterSpacing:".08em",textTransform:"uppercase"}}>{studioSettings.tagline||"Kiln Booking"}</div>
          </div>
        </div>

        {/* Nav + auth */}
        <div style={{display:"flex",alignItems:"center",gap:".1rem"}}>
          {[["calendar","📅","Calendar"],["board","💬","Community"]].map(([v,ic,lb])=>(
            <button key={v} className={`nt${view===v&&!isAdmin?" on":""}`} onClick={()=>{setView(v); if(isAdmin)setAdminUser(null);}}
              style={{padding:".4rem .55rem"}}>
              <span>{ic}</span><span style={{display:"none"}} className="nav-label">{lb}</span>
            </button>
          ))}
          <div style={{width:1,height:16,background:"rgba(255,255,255,.15)",margin:"0 .15rem"}}/>
          {/* Member avatar / sign in */}
          {!authLoading && (member
            ? <div style={{display:"flex",alignItems:"center",gap:".25rem"}}>
                <div className="av" style={{width:24,height:24,background:profile.photoUrl?"transparent":hColor(member.displayName),fontSize:".65rem",flexShrink:0,cursor:"pointer",overflow:"hidden"}}
                  onClick={()=>setView("profile")} title="My Profile">
                  {profile.photoUrl
                    ? <img src={profile.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : avLet(member.displayName)}
                </div>
                <button className="nt" style={{fontSize:".7rem",padding:".3rem .45rem"}} onClick={handleSignOut}>Out</button>
              </div>
            : <button className="nt" style={{fontSize:".75rem",padding:".35rem .55rem"}} onClick={()=>{setShowAuthModal(true);setAuthError("");setAuthMode("signin");}}>Sign In</button>
          )}
          <div style={{width:1,height:16,background:"rgba(255,255,255,.15)",margin:"0 .15rem"}}/>
          {/* Admin */}
          {isAdmin
            ? <div style={{display:"flex",alignItems:"center",gap:".25rem"}}>
                <span style={{fontSize:".75rem",color:"#c8a882",fontWeight:600}}>⚙️ {adminUser.name}</span>
                <button className="nt" style={{fontSize:".7rem",padding:".3rem .45rem"}} onClick={()=>setAdminUser(null)}>Out</button>
              </div>
            : <button className="nt" onClick={()=>{setShowAdminLogin(true);setLoginError("");}} style={{fontSize:".75rem",padding:".35rem .55rem"}}>⚙️</button>
          }
        </div>
      </div>

      {/* ── ADMIN LOGIN MODAL ── */}
      {showAdminLogin && (
        <div className="mo" onClick={()=>setShowAdminLogin(false)}>
          <div className="md" style={{width:380}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,fontSize:"1.05rem",marginBottom:"1.1rem"}}>🔐 Admin Login</h3>
            <div className="fl">
              <label>Your Name</label>
              <input value={loginName} onChange={e=>setLoginName(e.target.value)} placeholder="e.g. Eryn" autoFocus onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()}/>
            </div>
            <div className="fl">
              <label>Studio Master Password</label>
              <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="Master password" onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()}/>
            </div>
            {loginError && <div style={{color:"var(--danger)",fontSize:".82rem",marginBottom:".7rem",fontWeight:500}}>⚠ {loginError}</div>}
            <div style={{display:"flex",gap:".6rem"}}>
              <button className="btn bp" onClick={handleAdminLogin}>Login</button>
              <button className="btn bg" onClick={()=>setShowAdminLogin(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          ADMIN PANEL
      ════════════════════════════════════════════ */}
      {isAdmin && (
        <div style={{maxWidth:1060,margin:"0 auto",padding:"1.25rem 1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
            <div>
              <h2 style={{fontSize:"1.2rem",fontWeight:700}}>⚙️ Admin Panel</h2>
              <div style={{fontSize:".78rem",color:"var(--pale)"}}>Logged in as <strong>{adminUser.name}</strong> · {adminUser.role}</div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{display:"flex",gap:".2rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
            {[["dashboard","📊 Dashboard"],["bookings","📋 Bookings"],["kilns","🔥 Kilns"],["circuits","⚡ Circuits"],
              ...(adminUser.role==="superadmin"?[["admins","👤 Manage Admins"],["settings","🎨 Studio Settings"]]:[])
            ].map(([t,lb])=>(
              <button key={t} className={`tp${adminTab===t?" on":""}`} onClick={()=>setAdminTab(t)}>{lb}</button>
            ))}
          </div>

          {/* ── DASHBOARD ── */}
          {adminTab==="dashboard" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:".7rem",marginBottom:"1.4rem"}}>
                {[{l:"Total Bookings",v:stats.total,ic:"📅",c:"var(--clay)"},{l:"Kiln Hours",v:stats.totalHours+"h",ic:"⏱",c:"var(--earth)"},{l:"Paid",v:stats.paid,ic:"✅",c:"var(--moss)"},{l:"Unpaid",v:stats.unpaid,ic:"⚠️",c:"var(--warn)"},{l:"Cancelled",v:stats.cancelled,ic:"❌",c:"var(--danger)"},{l:"Members",v:stats.users.length,ic:"👤",c:"#5a6a9a"}].map(s=>(
                  <div key={s.l} className="stat-card">
                    <div style={{fontSize:"1.3rem",marginBottom:".25rem"}}>{s.ic}</div>
                    <div style={{fontSize:"1.5rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                    <div style={{fontSize:".73rem",color:"var(--pale)",marginTop:".2rem",fontWeight:500}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <h3 style={{fontWeight:700,fontSize:".92rem",marginBottom:".7rem"}}>Kiln Usage</h3>
              <div style={{display:"grid",gap:".55rem",marginBottom:"1.4rem"}}>
                {stats.byKiln.map(k=>{
                  const pct=stats.totalHours>0?Math.round((k.hours/stats.totalHours)*100):0;
                  return(
                    <div key={k.id} style={{background:"white",border:"1px solid var(--bdr)",borderRadius:8,padding:".75rem .95rem"}}>
                      <div style={{display:"flex",alignItems:"center",gap:".55rem",marginBottom:".35rem"}}>
                        {k.imageUrl&&<img src={k.imageUrl} alt={k.name} className="kiln-img-thumb"/>}
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:".86rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                            {k.name}{k.outOfOrder&&<span className="oo-badge">Out of Order</span>}
                          </div>
                          <div style={{fontSize:".73rem",color:"var(--pale)"}}>{k.count} bookings · {k.hours}h</div>
                        </div>
                        <div style={{fontWeight:700,color:k.color,fontSize:".9rem"}}>{pct}%</div>
                      </div>
                      <div style={{background:"#f0e8dc",borderRadius:99,height:5,overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:k.color,borderRadius:99}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <h3 style={{fontWeight:700,fontSize:".92rem",marginBottom:".7rem"}}>Active Members</h3>
              <div style={{display:"flex",flexWrap:"wrap",gap:".45rem"}}>
                {stats.users.map(u=>(
                  <div key={u} style={{display:"flex",alignItems:"center",gap:".35rem",background:"white",border:"1px solid var(--bdr)",borderRadius:99,padding:".28rem .7rem .28rem .35rem"}}>
                    <div className="av" style={{width:22,height:22,background:hColor(u),fontSize:".68rem"}}>{avLet(u)}</div>
                    <span style={{fontSize:".8rem",fontWeight:500}}>{u}</span>
                  </div>
                ))}
                {!stats.users.length&&<div style={{color:"var(--pale)",fontSize:".84rem",fontStyle:"italic"}}>No bookings yet.</div>}
              </div>
            </div>
          )}

          {/* ── BOOKINGS ── */}
          {adminTab==="bookings" && (
            <div>
              <div style={{display:"flex",gap:".5rem",marginBottom:".85rem",fontSize:".82rem",color:"var(--pale)"}}>
                <span>{active.length} active</span><span>·</span><span>{bookings.filter(b=>b.cancelled).length} cancelled</span>
              </div>
              <div style={{display:"grid",gap:".5rem"}}>
                {!bookings.length&&<div style={{color:"var(--pale)",fontStyle:"italic",fontSize:".88rem"}}>No bookings yet.</div>}
                {[...bookings].sort((a,b)=>a.date>b.date?1:-1).map(b=>{
                  const k=kilns.find(k=>k.id===b.kilnId);
                  return(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:".7rem",padding:".7rem .9rem",background:b.cancelled?"#fafafa":"white",borderRadius:8,border:"1px solid var(--bdr)",opacity:b.cancelled?.55:1}}>
                      <div style={{width:5,height:38,borderRadius:3,background:k?.color||"#ccc",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".84rem",display:"flex",alignItems:"center",gap:".35rem",flexWrap:"wrap"}}>
                          {b.user}
                          <span style={{fontWeight:400,color:"var(--pale)"}}>— {k?.name} · {b.type}</span>
                          {b.cancelled&&<span className="bdg" style={{background:"#f3f4f6",color:"#6b7280"}}>Cancelled{b.cancelledBy?` by ${b.cancelledBy}`:""}</span>}
                        </div>
                        <div style={{fontSize:".76rem",color:"var(--mid)"}}>
                          🔒 {b.startDate||b.date} {fmtHr(b.startHour)} → 🔓 {b.endDate||b.date} {fmtHr(b.endHour??b.startHour+b.duration)} ({b.duration}h){b.phone?` · 📞 ${b.phone}`:""}
                        </div>
                        {b.note&&<div style={{fontSize:".71rem",color:"var(--pale)",fontStyle:"italic"}}>{b.note}</div>}
                        {b.paid&&b.paidMarkedBy&&<div style={{fontSize:".7rem",color:"var(--moss)"}}>Marked paid by {b.paidMarkedBy}</div>}
                      </div>
                      {!b.cancelled&&(
                        <>
                          <button className={`btn xs ${b.paid?"bsuc":"bw"}`} onClick={()=>togglePaid(b.id,b.paid)}>{b.paid?"✓ Paid":"Mark Paid"}</button>
                          <button className="btn bd xs" onClick={()=>cancelBooking(b.id)}>Cancel</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── KILNS ── */}
          {adminTab==="kilns" && (
            editingKiln ? (
              <div className="card" style={{padding:"1.35rem",maxWidth:500}}>
                <h4 style={{fontWeight:700,marginBottom:".95rem",fontSize:".92rem"}}>{editingKiln==="new"?"Add New Kiln":`Edit: ${kilnDraft.name}`}</h4>
                {[["name","Kiln Name","text"],["type","Type (Electric / Gas)","text"],["maxTempF","Max Temp (°F)","number"],["capacityCuFt","Capacity (cu ft)","number"],["color","Color (hex)","text"],["imageUrl","Photo URL","text"]].map(([k,lb,t])=>(
                  <div className="fl" key={k}><label>{lb}</label><input type={t} value={kilnDraft[k]||""} onChange={e=>setKilnDraft(d=>({...d,[k]:e.target.value}))}/></div>
                ))}
                {kilnDraft.imageUrl&&<img src={kilnDraft.imageUrl} alt="preview" className="kiln-img" onError={e=>e.target.style.display="none"}/>}
                <div className="fl"><label>Notes</label><textarea value={kilnDraft.notes||""} onChange={e=>setKilnDraft(d=>({...d,notes:e.target.value}))}/></div>
                <div className="fl">
                  <label>Firing Types (comma-separated)</label>
                  <input value={kilnDraft.firingTypesRaw??(kilnDraft.firingTypes||[]).join(", ")} onChange={e=>setKilnDraft(d=>({...d,firingTypesRaw:e.target.value}))} placeholder="Bisque, Glaze Low-Fire, Reduction"/>
                  <div style={{fontSize:".7rem",color:"var(--pale)",marginTop:".2rem"}}>Options: {Object.keys(PRESET_HOURS).filter(t=>t!=="Custom").join(", ")}</div>
                </div>
                {/* Per-kiln preset hours */}
                {(() => {
                  const types = typeof kilnDraft.firingTypesRaw==="string"
                    ? kilnDraft.firingTypesRaw.split(",").map(s=>s.trim()).filter(Boolean)
                    : kilnDraft.firingTypes||[];
                  if (!types.length) return null;
                  return (
                    <div className="fl">
                      <label>Preset Run Times (hours per firing type)</label>
                      <div style={{display:"grid",gap:".4rem"}}>
                        {types.map(t=>(
                          <div key={t} style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                            <span style={{fontSize:".82rem",fontWeight:500,width:160,flexShrink:0}}>{t}</span>
                            <input type="number" min="1" max="48"
                              value={(kilnDraft.presetHours||{})[t] ?? PRESET_HOURS[t] ?? ""}
                              onChange={e=>setKilnDraft(d=>({...d,presetHours:{...(d.presetHours||{}),[t]:+e.target.value}}))}
                              style={{width:80}} placeholder="hrs"/>
                            <span style={{fontSize:".75rem",color:"var(--pale)"}}>hours</span>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:".7rem",color:"var(--pale)",marginTop:".3rem"}}>These are the default run times shown when booking this specific kiln.</div>
                    </div>
                  );
                })()}
                <div className="fl" style={{display:"flex",alignItems:"center",gap:".55rem"}}>
                  <input type="checkbox" id="oochk" checked={!!kilnDraft.outOfOrder} onChange={e=>setKilnDraft(d=>({...d,outOfOrder:e.target.checked}))} style={{width:"auto"}}/>
                  <label htmlFor="oochk" style={{textTransform:"none",letterSpacing:"normal",fontSize:".86rem",color:"var(--danger)",fontWeight:600,marginBottom:0}}>Mark as Out of Order</label>
                </div>
                <div style={{display:"flex",gap:".5rem",marginTop:".5rem"}}>
                  <button className="btn bp sm" onClick={saveKiln}>Save Kiln</button>
                  <button className="btn bg sm" onClick={()=>setEditingKiln(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:"grid",gap:".6rem",marginBottom:".9rem"}}>
                  {kilns.map(k=>(
                    <div key={k.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".75rem .95rem",background:"white",borderRadius:8,border:"1px solid var(--bdr)"}}>
                      {k.imageUrl?<img src={k.imageUrl} alt={k.name} className="kiln-img-thumb"/>:<div style={{width:46,height:46,borderRadius:6,background:k.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.3rem",flexShrink:0}}>🔥</div>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".88rem",display:"flex",alignItems:"center",gap:".4rem",flexWrap:"wrap"}}>
                          {k.name}{k.outOfOrder&&<span className="oo-badge">Out of Order</span>}
                        </div>
                        <div style={{fontSize:".73rem",color:"var(--pale)"}}>{k.type} · {k.maxTempF}°F · {k.capacityCuFt} cu ft · {k.circuit||"No circuit"}</div>
                        <div style={{fontSize:".7rem",color:"var(--pale)"}}>{(k.firingTypes||[]).join(" · ")}</div>
                      </div>
                      <div style={{display:"flex",gap:".35rem",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <button className={`btn xs ${k.outOfOrder?"bsuc":"bw"}`} onClick={()=>toggleOOO(k.id,k.outOfOrder)}>{k.outOfOrder?"✓ Restore":"Out of Order"}</button>
                        <button className="btn bg xs" onClick={()=>{setEditingKiln(k.id);setKilnDraft({...k});}}>Edit</button>
                        <button className="btn bd xs" onClick={()=>deleteKiln(k.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn bs sm" onClick={()=>{setEditingKiln("new");setKilnDraft({id:"kiln-"+Date.now(),name:"",type:"Electric",maxTempF:2300,capacityCuFt:10,color:"#c8502a",notes:"",firingTypes:[],circuit:"Circuit 1",outOfOrder:false,imageUrl:""});}}>+ Add Kiln</button>
              </div>
            )
          )}

          {/* ── CIRCUITS ── */}
          {adminTab==="circuits" && (
            <div style={{maxWidth:480}}>
              <p style={{fontSize:".83rem",color:"var(--mid)",marginBottom:".9rem",lineHeight:1.55}}>Kilns sharing a circuit cannot run simultaneously. Add or remove circuits, then assign kilns to them below.</p>

              {/* Manage circuit names */}
              <div className="card" style={{padding:"1.1rem",marginBottom:"1rem"}}>
                <h4 style={{fontWeight:700,fontSize:".86rem",marginBottom:".75rem"}}>Circuits</h4>
                <div style={{display:"grid",gap:".4rem",marginBottom:".75rem"}}>
                  {circuits.map(c=>(
                    <div key={c} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".45rem .7rem",background:"#faf7f2",borderRadius:6,border:"1px solid var(--bdr)"}}>
                      <span style={{fontSize:".82rem",fontWeight:600,flex:1}}>⚡ {c}</span>
                      <span style={{fontSize:".72rem",color:"var(--pale)"}}>
                        {kilns.filter(k=>k.circuit===c).map(k=>k.name).join(", ")||"No kilns assigned"}
                      </span>
                      <button className="btn bd xs" onClick={()=>{
                        if(kilns.some(k=>k.circuit===c)){alert(`Remove all kilns from ${c} before deleting it.`);return;}
                        setCircuits(p=>p.filter(x=>x!==c));
                      }}>Remove</button>
                    </div>
                  ))}
                  {circuits.length===0&&<div style={{fontSize:".82rem",color:"var(--pale)",fontStyle:"italic"}}>No circuits yet.</div>}
                </div>
                <div style={{display:"flex",gap:".5rem"}}>
                  <input value={newCircuitName} onChange={e=>setNewCircuitName(e.target.value)} placeholder="New circuit name, e.g. Circuit 3" onKeyDown={e=>{ if(e.key==="Enter"&&newCircuitName.trim()){setCircuits(p=>[...p,newCircuitName.trim()]);setNewCircuitName("");}}}
                    style={{flex:1,padding:".45rem .7rem",border:"1.5px solid var(--bdr)",borderRadius:6,fontFamily:"'DM Sans',sans-serif",fontSize:".86rem"}}/>
                  <button className="btn bp sm" onClick={()=>{if(newCircuitName.trim()){setCircuits(p=>[...p,newCircuitName.trim()]);setNewCircuitName("");}}}>+ Add</button>
                </div>
              </div>

              {/* Assign kilns to circuits */}
              <div className="card" style={{padding:"1.1rem"}}>
                <h4 style={{fontWeight:700,fontSize:".86rem",marginBottom:".75rem"}}>Assign Kilns to Circuits</h4>
                {kilns.map(k=>(
                  <div className="fl" key={k.id}>
                    <label>{k.name}</label>
                    <select value={k.circuit||""} onChange={async e=>{
                      await fbUpdate("kilns",k.id,{circuit:e.target.value});
                      if(!dbRef.current) setKilns(p=>p.map(x=>x.id===k.id?{...x,circuit:e.target.value}:x));
                    }}>
                      <option value="">— No Circuit —</option>
                      {circuits.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
                <div style={{background:"var(--warn-l)",border:"1px solid #fcd34d",borderRadius:7,padding:".65rem .85rem",fontSize:".79rem",color:"#92400e",lineHeight:1.6,marginTop:".4rem"}}>
                  <strong>⚡ Current groups:</strong><br/>
                  {circuits.map(c=>{
                    const m=kilns.filter(k=>k.circuit===c); if(!m.length) return null;
                    return<span key={c}>{c}: {m.map(k=>k.name).join(" + ")}<br/></span>;
                  })}
                  {!kilns.some(k=>k.circuit)&&<span style={{fontStyle:"italic"}}>No kilns assigned to circuits yet.</span>}
                </div>
              </div>
            </div>
          )}

          {/* ── MANAGE ADMINS (superadmin only) ── */}
          {adminTab==="admins" && adminUser.role==="superadmin" && (
            <div style={{maxWidth:520}}>
              <p style={{fontSize:".83rem",color:"var(--mid)",marginBottom:"1rem",lineHeight:1.55}}>
                Admins log in with their name + the studio master password. Anyone on this list can access the admin panel.
                Superadmins can also manage this list and change the master password.
              </p>

              {/* Current admins */}
              <div style={{display:"grid",gap:".5rem",marginBottom:"1.1rem"}}>
                {admins.map(a=>(
                  <div key={a.name} style={{display:"flex",alignItems:"center",gap:".7rem",padding:".68rem .9rem",background:"white",borderRadius:8,border:"1px solid var(--bdr)"}}>
                    <div className="av" style={{width:32,height:32,background:hColor(a.name),fontSize:".8rem"}}>{avLet(a.name)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:".88rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                        {a.name}
                        {a.role==="superadmin"?<span className="super-tag">superadmin</span>:<span className="admin-tag">admin</span>}
                      </div>
                    </div>
                    {a.name.toLowerCase()!==SEED_ADMIN.name.toLowerCase()&&(
                      <button className="btn bd xs" onClick={()=>removeAdmin(a.name)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add admin */}
              <div className="card" style={{padding:"1.2rem"}}>
                <h4 style={{fontWeight:700,fontSize:".88rem",marginBottom:".85rem"}}>Add New Admin</h4>
                <div className="fl"><label>Name (must match exactly when logging in)</label><input value={newAdminName} onChange={e=>setNewAdminName(e.target.value)} placeholder="e.g. Jamie" onKeyDown={e=>e.key==="Enter"&&addAdmin()}/></div>
                <div className="fl">
                  <label>Role</label>
                  <select value={newAdminRole} onChange={e=>setNewAdminRole(e.target.value)}>
                    <option value="admin">Admin — can manage bookings, kilns, posts</option>
                    <option value="superadmin">Superadmin — all of the above + manage admins</option>
                  </select>
                </div>
                {adminMsg&&<div className={`alert ${adminMsg.startsWith("✓")?"a-ok":"a-err"}`} style={{marginBottom:".7rem"}}>{adminMsg}</div>}
                <button className="btn bp sm" onClick={addAdmin}>Add Admin</button>
              </div>

              <div className="alert a-info" style={{marginTop:"1rem"}}>
                💡 To change the master password, update the <code style={{background:"#dbeafe",padding:"1px 4px",borderRadius:3}}>MASTER_PASSWORD</code> constant at the top of the app file and redeploy.
              </div>
            </div>
          )}

          {/* ── STUDIO SETTINGS ── */}
          {adminTab==="settings" && adminUser.role==="superadmin" && (() => {
            const draft = settingsDraft || studioSettings;
            const set = (k,v) => setSettingsDraft(d => ({ ...(d||studioSettings), [k]:v }));
            return (
              <div style={{maxWidth:520}}>
                <p style={{fontSize:".83rem",color:"var(--mid)",marginBottom:"1rem",lineHeight:1.55}}>
                  Customize your studio's name, logo, and colors. Changes are saved to the cloud and update instantly for everyone.
                </p>

                <div className="card" style={{padding:"1.35rem",marginBottom:"1rem"}}>
                  <h4 style={{fontWeight:700,fontSize:".9rem",marginBottom:"1rem"}}>Identity</h4>

                  <div className="fl"><label>Studio Name</label>
                    <input value={draft.name||""} onChange={e=>set("name",e.target.value)} placeholder="e.g. River Clay Studio"/>
                  </div>
                  <div className="fl"><label>Tagline (shown under name)</label>
                    <input value={draft.tagline||""} onChange={e=>set("tagline",e.target.value)} placeholder="e.g. Kiln Booking"/>
                  </div>

                  {/* Logo */}
                  <div className="fl">
                    <label>Logo Image URL (optional)</label>
                    <input value={draft.logoUrl||""} onChange={e=>set("logoUrl",e.target.value)} placeholder="Paste a direct image link (https://...)"/>
                    <div style={{fontSize:".71rem",color:"var(--pale)",marginTop:".25rem"}}>
                      Tip: upload your logo to <strong>imgur.com</strong> or <strong>imgbb.com</strong> and paste the direct image link here. Leave blank to use an emoji instead.
                    </div>
                  </div>

                  {/* Logo preview */}
                  {draft.logoUrl && (
                    <div style={{marginBottom:".9rem",display:"flex",alignItems:"center",gap:".75rem",padding:".7rem",background:"#1e120a",borderRadius:8,width:"fit-content"}}>
                      <img src={draft.logoUrl} alt="preview" style={{width:40,height:40,borderRadius:6,objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                      <div>
                        <div style={{color:"#f5f0e8",fontWeight:700,fontSize:".88rem"}}>{draft.name||"Studio Name"}</div>
                        <div style={{color:"#c8a882",fontSize:".6rem",textTransform:"uppercase",letterSpacing:".1em"}}>{draft.tagline||"Kiln Booking"}</div>
                      </div>
                    </div>
                  )}

                  {/* Emoji fallback */}
                  {!draft.logoUrl && (
                    <div className="fl">
                      <label>Header Emoji (used when no logo is set)</label>
                      <input value={draft.emoji||"🏺"} onChange={e=>set("emoji",e.target.value)} placeholder="🏺" style={{maxWidth:80}}/>
                    </div>
                  )}

                  {/* Header preview */}
                  <div style={{padding:".65rem .9rem",background:draft.headerBg||"#1e120a",borderRadius:8,display:"flex",alignItems:"center",gap:".6rem",marginBottom:".9rem"}}>
                    {draft.logoUrl
                      ? <img src={draft.logoUrl} alt="logo" style={{width:28,height:28,borderRadius:5,objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                      : <span style={{fontSize:"1.2rem"}}>{draft.emoji||"🏺"}</span>
                    }
                    <div>
                      <div style={{color:"#f5f0e8",fontWeight:700,fontSize:".88rem"}}>{draft.name||"Studio Name"}</div>
                      <div style={{color:"#c8a882",fontSize:".58rem",textTransform:"uppercase",letterSpacing:".1em"}}>{draft.tagline||"Kiln Booking"}</div>
                    </div>
                    <span style={{color:"var(--pale)",fontSize:".7rem",marginLeft:"auto",fontStyle:"italic"}}>Header preview</span>
                  </div>
                </div>

                <div className="card" style={{padding:"1.35rem",marginBottom:"1rem"}}>
                  <h4 style={{fontWeight:700,fontSize:".9rem",marginBottom:"1rem"}}>Colors</h4>
                  {[
                    ["accentColor","Accent Color (buttons, highlights)","#c8502a"],
                    ["bgColor","Page Background","#f4efe8"],
                    ["headerBg","Header Background","#1e120a"],
                  ].map(([k,lb,def])=>(
                    <div className="fl" key={k} style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                      <div style={{flex:1}}>
                        <label style={{display:"block"}}>{lb}</label>
                        <input value={draft[k]||def} onChange={e=>set(k,e.target.value)} placeholder={def}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".4rem",flexShrink:0,paddingTop:"1.2rem"}}>
                        <input type="color" value={draft[k]||def} onChange={e=>set(k,e.target.value)}
                          style={{width:36,height:32,border:"1px solid var(--bdr)",borderRadius:5,cursor:"pointer",padding:2}}/>
                        <div style={{width:32,height:32,borderRadius:5,background:draft[k]||def,border:"1px solid var(--bdr)"}}/>
                      </div>
                    </div>
                  ))}
                  <div style={{fontSize:".73rem",color:"var(--pale)",marginTop:".25rem"}}>Use hex codes like <code>#c8502a</code> or pick with the color swatch.</div>
                </div>

                {settingsSaved && <div className="alert a-ok" style={{marginBottom:".9rem"}}>✓ Settings saved! Updating everywhere now.</div>}
                {settingsDraft && (
                  <div style={{display:"flex",gap:".6rem"}}>
                    <button className="btn bp" onClick={()=>saveSettings(draft)}>Save Settings</button>
                    <button className="btn bg" onClick={()=>setSettingsDraft(null)}>Discard Changes</button>
                  </div>
                )}
                {!settingsDraft && !settingsSaved && (
                  <div style={{fontSize:".8rem",color:"var(--pale)",fontStyle:"italic"}}>Make a change above to enable saving.</div>
                )}
              </div>
            );
          })()}

          {/* ── STUDIO SETTINGS ── */}
          {adminTab==="settings" && adminUser.role==="superadmin" && (
            <div style={{maxWidth:500}}>
              <p style={{fontSize:".83rem",color:"var(--mid)",marginBottom:"1rem",lineHeight:1.55}}>
                Customize your studio's name, branding, and colors. Changes save instantly and update for all users.
              </p>
              {(() => {
                const draft = settingsDraft || studioSettings;
                const set = (k,v) => setSettingsDraft(d => ({...(d||studioSettings),[k]:v}));
                return (
                  <div className="card" style={{padding:"1.35rem"}}>
                    <div className="fl"><label>Studio Name</label>
                      <input value={draft.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. River Clay Studio"/>
                    </div>
                    <div className="fl"><label>Tagline (shown under name)</label>
                      <input value={draft.tagline} onChange={e=>set("tagline",e.target.value)} placeholder="e.g. Kiln Booking"/>
                    </div>
                    <div className="fl"><label>Emoji / Icon</label>
                      <input value={draft.emoji} onChange={e=>set("emoji",e.target.value)} placeholder="e.g. 🏺 🔥 🎨 🪴"/>
                      <div style={{fontSize:".7rem",color:"var(--pale)",marginTop:".2rem"}}>Paste any emoji — it appears in the header and browser tab.</div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".75rem"}}>
                      <div className="fl" style={{marginBottom:0}}>
                        <label>Accent Color</label>
                        <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
                          <input type="color" value={draft.accentColor||"#c8502a"} onChange={e=>set("accentColor",e.target.value)} style={{width:44,height:36,padding:2,border:"1.5px solid var(--bdr)",borderRadius:6,cursor:"pointer"}}/>
                          <input value={draft.accentColor||"#c8502a"} onChange={e=>set("accentColor",e.target.value)} style={{flex:1}} placeholder="#c8502a"/>
                        </div>
                        <div style={{fontSize:".7rem",color:"var(--pale)",marginTop:".25rem"}}>Buttons, highlights, active states</div>
                      </div>
                      <div className="fl" style={{marginBottom:0}}>
                        <label>Header Background</label>
                        <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
                          <input type="color" value={draft.headerBg||"#1e120a"} onChange={e=>set("headerBg",e.target.value)} style={{width:44,height:36,padding:2,border:"1.5px solid var(--bdr)",borderRadius:6,cursor:"pointer"}}/>
                          <input value={draft.headerBg||"#1e120a"} onChange={e=>set("headerBg",e.target.value)} style={{flex:1}} placeholder="#1e120a"/>
                        </div>
                        <div style={{fontSize:".7rem",color:"var(--pale)",marginTop:".25rem"}}>Top navigation bar color</div>
                      </div>
                    </div>

                    {/* Live preview */}
                    <div style={{margin:"1.1rem 0 .9rem",borderRadius:8,overflow:"hidden",border:"1px solid var(--bdr)"}}>
                      <div style={{background:draft.headerBg||"#1e120a",padding:".6rem .9rem",display:"flex",alignItems:"center",gap:".5rem"}}>
                        <span style={{fontSize:"1.2rem"}}>{draft.emoji||"🏺"}</span>
                        <div>
                          <div style={{fontSize:".88rem",fontWeight:700,color:"#f5f0e8"}}>{draft.name||"Your Studio Name"}</div>
                          <div style={{fontSize:".58rem",fontWeight:600,color:"#c8a882",letterSpacing:".1em",textTransform:"uppercase"}}>{draft.tagline||"Kiln Booking"}</div>
                        </div>
                      </div>
                      <div style={{padding:".7rem .9rem",background:"white",display:"flex",gap:".5rem",alignItems:"center"}}>
                        <div style={{background:draft.accentColor||"#c8502a",color:"white",borderRadius:6,padding:".3rem .7rem",fontSize:".78rem",fontWeight:600}}>+ Book a Kiln</div>
                        <div style={{fontSize:".78rem",color:"var(--pale)"}}>← live preview</div>
                      </div>
                    </div>

                    {settingsSaved && <div className="alert a-ok" style={{marginBottom:".8rem"}}>✓ Settings saved!</div>}
                    <div style={{display:"flex",gap:".55rem"}}>
                      <button className="btn bp sm" onClick={async ()=>{
                        const toSave = settingsDraft || studioSettings;
                        await fbSet("settings","studio",toSave);
                        if (!dbRef.current) setStudioSettings(toSave);
                        setSettingsDraft(null);
                        setSettingsSaved(true);
                        setTimeout(()=>setSettingsSaved(false),3000);
                      }}>Save Settings</button>
                      <button className="btn bg sm" onClick={()=>setSettingsDraft(null)}>Reset</button>
                    </div>
                  </div>
                );
              })()}

              <div className="alert a-info" style={{marginTop:"1rem"}}>
                💡 <strong>Sharing this app?</strong> Fork it on GitHub and point other studios to their own Firebase project. Each studio gets their own data — fully independent.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          CALENDAR VIEW
      ════════════════════════════════════════════ */}
      {!isAdmin && view==="calendar" && (
        <div style={{maxWidth:1060,margin:"0 auto",padding:"1.25rem 1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
            <button className="btn bg sm" onClick={()=>{setCurrentDate(new Date(year,month-1,1));setSelectedDay(null);}}>‹ Prev</button>
            <h2 style={{fontSize:"1.3rem",fontWeight:700}}>{MONTH_NAMES[month]} {year}</h2>
            <button className="btn bg sm" onClick={()=>{setCurrentDate(new Date(year,month+1,1));setSelectedDay(null);}}>Next ›</button>
          </div>
          <div style={{display:"flex",gap:".7rem",marginBottom:".85rem",flexWrap:"wrap"}}>
            {kilns.map(k=>(
              <div key={k.id} style={{display:"flex",alignItems:"center",gap:".35rem",fontSize:".78rem",fontWeight:500}}>
                <div style={{width:10,height:10,borderRadius:3,background:k.outOfOrder?"#d1d5db":k.color}}/>
                <span style={{textDecoration:k.outOfOrder?"line-through":"none",color:k.outOfOrder?"var(--pale)":"inherit"}}>{k.name}</span>
                {k.outOfOrder?<span className="oo-badge">Out of Order</span>:<span style={{color:"var(--pale)",fontWeight:400}}>· {k.type} · {k.maxTempF}°F</span>}
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px",marginBottom:"1rem"}}>
            {DAY_NAMES.map(d=><div key={d} style={{textAlign:"center",fontSize:".68rem",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--pale)",padding:".3rem 0"}}>{d}</div>)}
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
              const ds=dStr(year,month,d);
              // Show bookings that START or span through this day
              const db=active.filter(b=>{
                const bStart=b.startDate||b.date;
                const bEnd=b.endDate||b.date;
                return ds>=bStart && ds<=bEnd;
              });
              const isT=new Date().getDate()===d&&new Date().getMonth()===month&&new Date().getFullYear()===year;
              return(
                <div key={d} className={`dc${selectedDay===d?" sel":""}${isT?" tod":""}`} onClick={()=>setSelectedDay(d)}>
                  <div style={{fontSize:".77rem",fontWeight:isT?700:500,color:isT?"var(--clay)":"var(--ink)",marginBottom:2}}>{d}</div>
                  {db.slice(0,3).map(b=>{const k=kilns.find(k=>k.id===b.kilnId);return k?<div key={b.id} className="chip" style={{background:k.color}}>{k.name}{b.endDate&&b.endDate!==b.startDate?" ↦":""} {fmtHr(b.startHour)}</div>:null;})}
                  {db.length>3&&<div style={{fontSize:".6rem",color:"var(--pale)"}}>+{db.length-3}</div>}
                </div>
              );
            })}
          </div>

          {selectedDay&&(
            <div className="card" style={{padding:"1.3rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <h3 style={{fontSize:"1.05rem",fontWeight:700}}>{MONTH_NAMES[month]} {selectedDay}, {year}</h3>
                <button className="btn bp" onClick={()=>{
                  if(!member){setShowAuthModal(true);setAuthMode("signin");setAuthError("");}
                  else openBookingModal();
                }} disabled={!online}>{online?(member?"+ Book a Kiln":"Sign In to Book"):"Offline"}</button>
              </div>
              {!online&&<div className="alert a-warn" style={{marginBottom:"1rem"}}>⚡ You're offline. Connect to Wi-Fi to make a booking.</div>}
              {kilns.map(k=>{
                const kb=selBks.filter(b=>b.kilnId===k.id);
                return(
                  <div key={k.id} style={{marginBottom:".8rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:".38rem",marginBottom:".26rem",flexWrap:"wrap"}}>
                      <div style={{width:8,height:8,borderRadius:2,background:k.outOfOrder?"#d1d5db":k.color}}/>
                      <span style={{fontSize:".72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--mid)"}}>{k.name} — {k.type} / {k.maxTempF}°F / {k.capacityCuFt} cu ft</span>
                      {k.outOfOrder&&<span className="oo-badge">Out of Order</span>}
                      {k.circuit&&<span className="bdg" style={{background:"#f0e8dc",color:"var(--earth)"}}>{k.circuit}</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:".62rem",color:"var(--pale)",width:34,textAlign:"right",flexShrink:0}}>12am</span>
                      <div className="twrap" style={{opacity:k.outOfOrder?.45:1}}>
                        {k.outOfOrder&&<div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(45deg,#fee2e2,#fee2e2 4px,white 4px,white 8px)",opacity:.7}}/>}
                        {kb.map(b=><div key={b.id} className="tblk" style={{left:`${(b.startHour/24)*100}%`,width:`${(b.duration/24)*100}%`,background:k.color}}>{b.user}</div>)}
                      </div>
                      <span style={{fontSize:".62rem",color:"var(--pale)",width:30,flexShrink:0}}>11pm</span>
                    </div>
                  </div>
                );
              })}
              {!selBks.length
                ?<div style={{textAlign:"center",color:"var(--pale)",padding:"1.1rem",fontStyle:"italic",fontSize:".86rem"}}>No bookings yet for this day.</div>
                :<div style={{display:"grid",gap:".48rem",marginTop:".85rem"}}>
                  {selBks.map(b=>{const k=kilns.find(k=>k.id===b.kilnId);return k?(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".65rem .88rem",background:"#faf7f2",borderRadius:8,border:"1px solid var(--bdr)"}}>
                      <div style={{width:5,height:36,borderRadius:3,background:k.color,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".84rem",display:"flex",alignItems:"center",gap:".35rem",flexWrap:"wrap"}}>
                          {k.name} — {b.type}

                        </div>
                        <div style={{fontSize:".76rem",color:"var(--mid)"}}>
                          🔒 {b.startDate||b.date} {fmtHr(b.startHour)} → 🔓 {b.endDate||b.date} {fmtHr(b.endHour??b.startHour+b.duration)}
                          {b.endDate&&b.endDate!==(b.startDate||b.date)&&<span style={{background:"var(--info-l)",color:"var(--info)",fontSize:".67rem",fontWeight:700,padding:"1px 5px",borderRadius:99,marginLeft:4}}>Multi-day</span>}
                          {" · "}{b.user}{b.phone?` · 📞 ${b.phone}`:""}
                        </div>
                        {b.note&&<div style={{fontSize:".71rem",color:"var(--pale)",fontStyle:"italic"}}>{b.note}</div>}
                      </div>
                      {member && (b.uid===member.uid) && online &&
                        <button onClick={()=>cancelBooking(b.id)} className="btn bd sm">Cancel</button>
                      }
                    </div>
                  ):null;})}
                </div>}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          MEMBER AUTH MODAL
      ════════════════════════════════════════════ */}
      {showAuthModal && (
        <div className="mo" onClick={()=>setShowAuthModal(false)}>
          <div className="md" style={{width:400}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",gap:".3rem",marginBottom:"1.2rem",background:"#f0e8dc",borderRadius:8,padding:".3rem"}}>
              {[["signin","Sign In"],["signup","Create Account"]].map(([m,lb])=>(
                <button key={m} className={`tp${authMode===m?" on":""}`} style={{flex:1,textAlign:"center"}}
                  onClick={()=>{setAuthMode(m);setAuthError("");}}>
                  {lb}
                </button>
              ))}
            </div>
            {authMode==="signup" && (
              <div className="fl">
                <label>Your Name</label>
                <input value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="e.g. Maya Chen" autoFocus/>
              </div>
            )}
            <div className="fl">
              <label>Email</label>
              <input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
                placeholder="your@email.com" autoFocus={authMode==="signin"}
                onKeyDown={e=>e.key==="Enter"&&(authMode==="signin"?handleSignIn():handleSignUp())}/>
            </div>
            <div className="fl">
              <label>Password {authMode==="signup"&&<span style={{fontWeight:400,textTransform:"none",letterSpacing:"normal"}}>(min 6 characters)</span>}</label>
              <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={e=>e.key==="Enter"&&(authMode==="signin"?handleSignIn():handleSignUp())}/>
            </div>
            {authError && (
              <div className={`alert ${authError.startsWith("✓")?"a-ok":"a-err"}`} style={{marginBottom:".8rem"}}>{authError}</div>
            )}
            <div style={{display:"flex",gap:".6rem",alignItems:"center"}}>
              <button className="btn bp" onClick={authMode==="signin"?handleSignIn:handleSignUp} disabled={authLoading2}>
                {authLoading2?"...":(authMode==="signin"?"Sign In":"Create Account")}
              </button>
              <button className="btn bg" onClick={()=>setShowAuthModal(false)}>Cancel</button>
              {authMode==="signin" && (
                <button onClick={handleForgotPassword} style={{background:"none",border:"none",cursor:"pointer",fontSize:".78rem",fontWeight:600,color:"var(--earth)",fontFamily:"'DM Sans',sans-serif",marginLeft:"auto"}}>
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          BOOKING MODAL
      ════════════════════════════════════════════ */}
      {showBookingModal&&(
        <div className="mo" onClick={()=>setShowBookingModal(false)}>
          <div className="md" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:"1.05rem",fontWeight:700,marginBottom:"1.1rem"}}>Book a Kiln — {MONTH_NAMES[month]} {selectedDay}</h3>
            <div className="fl">
              <label>Select Kiln</label>
              <select value={bookingForm.kilnId} onChange={e=>{
                const k=kilns.find(k=>k.id===e.target.value);
                const dt=k?.firingTypes?.[0]||"Bisque";
                const dur=(k?.presetHours||{})[dt] ?? PRESET_HOURS[dt] ?? 10;
                setBookingForm(f=>({...f,kilnId:e.target.value,type:dt,duration:dur,endHour:f.startHour+dur}));
              }}>
                {kilns.map(k=><option key={k.id} value={k.id} disabled={k.outOfOrder}>{k.name} ({k.type}, {k.maxTempF}°F, {k.capacityCuFt} cu ft){k.outOfOrder?" — OUT OF ORDER":""}</option>)}
              </select>
            </div>
            {selKiln?.imageUrl&&<img src={selKiln.imageUrl} alt={selKiln.name} className="kiln-img" onError={e=>e.target.style.display="none"}/>}
            {selKiln?.notes&&<div style={{fontSize:".77rem",color:"var(--pale)",marginBottom:".85rem",fontStyle:"italic",marginTop:"-.3rem"}}>{selKiln.notes}</div>}
            {selKiln?.outOfOrder&&<div className="alert a-err" style={{marginBottom:".85rem"}}>⚠ This kiln is currently out of order and cannot be booked.</div>}
            <div className="fl">
              <label>Firing Type</label>
              <select value={bookingForm.type} disabled={selKiln?.outOfOrder} onChange={e=>{
                const t=e.target.value;
                const dur=(selKiln?.presetHours||{})[t] ?? PRESET_HOURS[t] ?? bookingForm.duration;
                setBookingForm(f=>({...f,type:t,duration:dur,endHour:f.startHour+(dur||0)}));
              }}>
                {(selKiln?.firingTypes||[]).concat(["Custom"]).map(t=><option key={t}>{t}</option>)}
              </select>
              {bookingForm.type!=="Custom"&&<div style={{fontSize:".73rem",color:"var(--pale)",marginTop:".22rem"}}>Preset for {selKiln?.name}: {bookingForm.duration} hours</div>}
            </div>
            {bookingForm.type==="Custom"&&<div className="fl"><label>Duration (hours)</label><input type="number" min="1" max="168" value={bookingForm.customHours} onChange={e=>{
              const hrs=parseInt(e.target.value)||0;
              if(bookingForm.startDate){
                const endMs=toTs(bookingForm.startDate,bookingForm.startHour)+hrs*3600000;
                const endD=new Date(endMs);
                setBookingForm(f=>({...f,customHours:e.target.value,endDate:dStr(endD.getFullYear(),endD.getMonth(),endD.getDate()),endHour:endD.getHours(),duration:hrs}));
              } else setBookingForm(f=>({...f,customHours:e.target.value}));
            }}/></div>}

            {/* Load date + time */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".75rem",marginBottom:".9rem"}}>
              <div className="fl" style={{marginBottom:0}}>
                <label>🔒 Load Date</label>
                <input type="date" value={bookingForm.startDate||""} disabled={selKiln?.outOfOrder}
                  onChange={e=>{
                    const sd=e.target.value;
                    if(!sd) return;
                    const dur=bookingForm.duration||1;
                    const endMs=toTs(sd,bookingForm.startHour)+dur*3600000;
                    const endD=new Date(endMs);
                    setBookingForm(f=>({...f,startDate:sd,endDate:dStr(endD.getFullYear(),endD.getMonth(),endD.getDate()),endHour:endD.getHours()}));
                  }}/>
              </div>
              <div className="fl" style={{marginBottom:0}}>
                <label>🔒 Load Time</label>
                <select value={bookingForm.startHour||8} disabled={selKiln?.outOfOrder}
                  onChange={e=>{
                    const sh=+e.target.value;
                    const dur=bookingForm.duration||1;
                    const endMs=toTs(bookingForm.startDate||dStr(year,month,selectedDay),sh)+dur*3600000;
                    const endD=new Date(endMs);
                    setBookingForm(f=>({...f,startHour:sh,endDate:dStr(endD.getFullYear(),endD.getMonth(),endD.getDate()),endHour:endD.getHours()}));
                  }}>
                  {HOURS.map(h=><option key={h} value={h}>{fmtHr(h)}</option>)}
                </select>
              </div>
            </div>

            {/* Unload date + time */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".75rem"}}>
              <div className="fl" style={{marginBottom:0}}>
                <label>🔓 Unload Date</label>
                <input type="date" value={bookingForm.endDate||""} disabled={selKiln?.outOfOrder}
                  min={bookingForm.startDate||""}
                  onChange={e=>setBookingForm(f=>({...f,endDate:e.target.value}))}/>
              </div>
              <div className="fl" style={{marginBottom:0}}>
                <label>🔓 Unload Time</label>
                <select value={bookingForm.endHour??18} disabled={selKiln?.outOfOrder}
                  onChange={e=>setBookingForm(f=>({...f,endHour:+e.target.value}))}>
                  {HOURS.map(h=><option key={h} value={h}>{fmtHr(h)}</option>)}
                </select>
              </div>
            </div>

            {/* Duration summary */}
            {bookingForm.startDate && bookingForm.endDate && (() => {
              const ms = toTs(bookingForm.endDate,bookingForm.endHour??18) - toTs(bookingForm.startDate,bookingForm.startHour||8);
              const hrs = Math.round(ms/3600000);
              const days = Math.floor(hrs/24);
              const remHrs = hrs%24;
              const label = hrs<=0 ? "⚠ End must be after start" : days>0 ? `${days}d ${remHrs}h total` : `${hrs}h total`;
              return <div style={{fontSize:".73rem",color:hrs<=0?"var(--danger)":"var(--pale)",margin:".3rem 0 .9rem",fontStyle:"italic"}}>Duration: {label}</div>;
            })()}
            {member && <div style={{fontSize:".82rem",color:"var(--mid)",marginBottom:".9rem",display:"flex",alignItems:"center",gap:".4rem"}}>
              <div className="av" style={{width:22,height:22,background:hColor(member.displayName),fontSize:".65rem"}}>{avLet(member.displayName)}</div>
              Booking as <strong>{member.displayName}</strong>
            </div>}
            <div className="fl"><label>Phone Number</label><input type="tel" value={bookingForm.phone||""} onChange={e=>setBookingForm(f=>({...f,phone:e.target.value}))} placeholder="e.g. 512-555-0100" disabled={selKiln?.outOfOrder}/></div>
            <div className="fl"><label>Note (optional)</label><textarea value={bookingForm.note} onChange={e=>setBookingForm(f=>({...f,note:e.target.value}))} placeholder="What are you firing?" disabled={selKiln?.outOfOrder}/></div>
            {!selKiln?.outOfOrder&&(
              <div className={`alert ${prevConflict?"a-err":"a-ok"}`} style={{marginBottom:".85rem"}}>
                {prevConflict ? `⚠ ${prevConflict}` : bookingForm.startDate&&bookingForm.endDate ? `✓ ${bookingForm.startDate} ${fmtHr(bookingForm.startHour)} → ${bookingForm.endDate} ${fmtHr(bookingForm.endHour??18)} is available.` : "Select load and unload dates."}
              </div>
            )}
            {bookingError&&<div style={{color:"var(--danger)",fontSize:".83rem",marginBottom:".7rem",fontWeight:500}}>⚠ {bookingError}</div>}
            <div style={{display:"flex",gap:".55rem",justifyContent:"flex-end"}}>
              <button className="btn bg" onClick={()=>setShowBookingModal(false)}>Cancel</button>
              <button className="btn bp" onClick={submitBooking} disabled={!!prevConflict||selKiln?.outOfOrder||!online}>
                {!online?"Offline — Can't Book":"Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          PROFILE VIEW
      ════════════════════════════════════════════ */}
      {!isAdmin && view==="profile" && (
        <div style={{maxWidth:520,margin:"0 auto",padding:"1.25rem 1rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1.25rem"}}>
            <button className="btn bg sm" onClick={()=>setView("calendar")}>‹ Back</button>
            <h2 style={{fontSize:"1.2rem",fontWeight:700}}>My Profile</h2>
          </div>
          {!member
            ? <div className="alert a-warn">Please sign in to view your profile.</div>
            : (() => {
                const draft = profileDraft || { displayName: member.displayName, phone: profile.phone||"", bio: profile.bio||"", photoUrl: profile.photoUrl||"" };
                const set = (k,v) => setProfileDraft(d => ({ ...(d || draft), [k]: v }));
                return (
                  <div>
                    {/* Avatar */}
                    <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.25rem"}}>
                      <div className="av" style={{width:72,height:72,fontSize:"1.6rem",background:draft.photoUrl?"transparent":hColor(member.displayName),flexShrink:0,overflow:"hidden",borderRadius:"50%"}}>
                        {draft.photoUrl
                          ? <img src={draft.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                          : avLet(member.displayName)}
                      </div>
                      <div>
                        <div style={{fontWeight:700,fontSize:"1rem"}}>{member.displayName}</div>
                        <div style={{fontSize:".78rem",color:"var(--pale)"}}>{member.email}</div>
                      </div>
                    </div>

                    <div className="card" style={{padding:"1.35rem",marginBottom:"1rem"}}>
                      <h4 style={{fontWeight:700,fontSize:".9rem",marginBottom:"1rem"}}>Edit Profile</h4>

                      <div className="fl">
                        <label>Display Name</label>
                        <input value={draft.displayName||""} onChange={e=>set("displayName",e.target.value)} placeholder="Your name"/>
                      </div>
                      <div className="fl">
                        <label>Phone Number</label>
                        <input type="tel" value={draft.phone||""} onChange={e=>set("phone",e.target.value)} placeholder="e.g. 512-555-0100"/>
                      </div>
                      <div className="fl">
                        <label>Bio (optional)</label>
                        <textarea value={draft.bio||""} onChange={e=>set("bio",e.target.value)} placeholder="Tell the studio a little about yourself…"/>
                      </div>
                      <div className="fl">
                        <label>Profile Photo URL (optional)</label>
                        <input value={draft.photoUrl||""} onChange={e=>set("photoUrl",e.target.value)} placeholder="Paste a direct image link (https://...)"/>
                        <div style={{fontSize:".71rem",color:"var(--pale)",marginTop:".25rem"}}>Tip: upload to <strong>imgur.com</strong> and paste the direct link here.</div>
                      </div>
                      {draft.photoUrl && (
                        <img src={draft.photoUrl} alt="preview" style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--bdr)",marginBottom:".75rem"}} onError={e=>e.target.style.display="none"}/>
                      )}

                      {profileMsg && <div className={`alert ${profileMsg.startsWith("✓")?"a-ok":"a-err"}`} style={{marginBottom:".75rem"}}>{profileMsg}</div>}
                      <div style={{display:"flex",gap:".6rem"}}>
                        <button className="btn bp" onClick={()=>saveProfile(draft)} disabled={profileSaving||!profileDraft}>
                          {profileSaving?"Saving…":"Save Profile"}
                        </button>
                        {profileDraft && <button className="btn bg" onClick={()=>setProfileDraft(null)}>Discard</button>}
                      </div>
                    </div>

                    {/* My bookings summary */}
                    <div className="card" style={{padding:"1.35rem"}}>
                      <h4 style={{fontWeight:700,fontSize:".9rem",marginBottom:".85rem"}}>My Bookings</h4>
                      {active.filter(b=>b.uid===member.uid).length===0
                        ? <div style={{fontSize:".84rem",color:"var(--pale)",fontStyle:"italic"}}>No bookings yet.</div>
                        : active.filter(b=>b.uid===member.uid).slice(0,5).map(b=>{
                            const k=kilns.find(k=>k.id===b.kilnId);
                            return k?(
                              <div key={b.id} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".55rem 0",borderBottom:"1px solid var(--bdr)"}}>
                                <div style={{width:4,height:32,borderRadius:2,background:k.color,flexShrink:0}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontWeight:600,fontSize:".84rem"}}>{k.name} — {b.type}</div>
                                  <div style={{fontSize:".74rem",color:"var(--mid)"}}>🔒 {b.startDate} {fmtHr(b.startHour)} → 🔓 {b.endDate} {fmtHr(b.endHour??b.startHour+b.duration)}</div>
                                </div>
                                <button className="btn bd xs" onClick={()=>cancelBooking(b.id)}>Cancel</button>
                              </div>
                            ):null;
                          })
                      }
                    </div>
                  </div>
                );
              })()
          }
        </div>
      )}

      {/* ════════════════════════════════════════════
          COMMUNITY BOARD
      ════════════════════════════════════════════ */}
      {!isAdmin&&view==="board"&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"1.25rem 1rem"}}>
          <h2 style={{fontSize:"1.3rem",fontWeight:700,marginBottom:"1rem"}}>Community Board</h2>
          <div className="card" style={{padding:".9rem",marginBottom:"1rem"}}>
            <textarea value={newPost} onChange={e=>setNewPost(e.target.value)} placeholder="Share a tip, ask a question, or post an announcement…" style={{width:"100%",border:"none",fontFamily:"'DM Sans',sans-serif",fontSize:".9rem",resize:"none",minHeight:66,outline:"none",background:"transparent",color:"var(--ink)"}}/>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:".38rem"}}>
              <button className="btn bp sm" onClick={submitPost} disabled={!online}>{online?"Post":"Offline"}</button>
            </div>
          </div>
          {sortedPosts.map(post=>(
            <div key={post.id} className="card" style={{padding:"1rem",marginBottom:".7rem",borderLeft:post.pinned?"3px solid #f59e0b":"1px solid var(--bdr)"}}>
              <div style={{display:"flex",gap:".62rem",marginBottom:".62rem",alignItems:"flex-start"}}>
                <div className="av" style={{width:32,height:32,background:hColor(post.author),fontSize:".82rem"}}>{avLet(post.author)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:".38rem",flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:".86rem"}}>{post.author}</span>
                    {post.pinned&&<span className="pinned-badge">📌 Pinned</span>}
                    <span style={{fontSize:".7rem",color:"var(--pale)"}}>{post.time}</span>
                  </div>
                </div>
              </div>
              <div style={{fontSize:".87rem",lineHeight:1.6,marginBottom:".7rem"}}>{post.content}</div>
              {post.replies?.map(r=>(
                <div key={r.id} style={{marginLeft:"1.05rem",borderLeft:"2px solid #e8ddd0",paddingLeft:".8rem",marginBottom:".45rem"}}>
                  <div style={{display:"flex",gap:".38rem",alignItems:"center",marginBottom:".14rem"}}>
                    <div className="av" style={{width:21,height:21,fontSize:".63rem",background:hColor(r.author)}}>{avLet(r.author)}</div>
                    <span style={{fontWeight:700,fontSize:".78rem"}}>{r.author}</span>
                    <span style={{fontSize:".68rem",color:"var(--pale)"}}>{r.time}</span>
                  </div>
                  <div style={{fontSize:".83rem"}}>{r.content}</div>
                </div>
              ))}
              {showReply[post.id]?(
                <div style={{marginTop:".52rem",display:"flex",gap:".38rem"}}>
                  <input value={replyText[post.id]||""} onChange={e=>setReplyText(p=>({...p,[post.id]:e.target.value}))} placeholder="Write a reply…" onKeyDown={e=>e.key==="Enter"&&submitReply(post.id)} style={{flex:1,padding:".36rem .65rem",border:"1.5px solid var(--bdr)",borderRadius:6,fontFamily:"'DM Sans',sans-serif",fontSize:".84rem"}}/>
                  <button className="btn bp sm" onClick={()=>submitReply(post.id)}>Reply</button>
                  <button className="btn bg sm" onClick={()=>setShowReply(p=>({...p,[post.id]:false}))}>✕</button>
                </div>
              ):(
                <button onClick={()=>setShowReply(p=>({...p,[post.id]:true}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:".77rem",fontWeight:600,color:"var(--earth)",fontFamily:"'DM Sans',sans-serif"}}>↩ Reply</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════
          MESSAGES
      ════════════════════════════════════════════ */}
      {!isAdmin&&view==="messages"&&(
        <div style={{maxWidth:840,margin:"0 auto",padding:"1.25rem 1rem",display:"flex",gap:".85rem",height:"calc(100vh - 64px)"}}>
          <div className="card" style={{width:190,padding:".58rem",flexShrink:0}}>
            <div style={{fontWeight:700,fontSize:".7rem",color:"var(--pale)",textTransform:"uppercase",letterSpacing:".07em",padding:".18rem .42rem",marginBottom:".38rem"}}>Messages</div>
            {CONTACTS.map(c=>(
              <div key={c.name} className={`cr${activeContact===c.name?" ac":""}`} onClick={()=>setActiveContact(c.name)}>
                <div className="av" style={{width:27,height:27,background:hColor(c.name),fontSize:".72rem"}}>{avLet(c.name)}</div>
                <span style={{fontSize:".83rem",fontWeight:500}}>{c.name}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:".72rem .9rem",borderBottom:"1px solid var(--bdr)",display:"flex",alignItems:"center",gap:".55rem",background:"var(--surf)",borderRadius:"10px 10px 0 0"}}>
              <div className="av" style={{width:27,height:27,background:hColor(activeContact),fontSize:".72rem"}}>{avLet(activeContact)}</div>
              <span style={{fontWeight:700,fontSize:".88rem"}}>{activeContact}</span>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:".82rem .9rem",display:"flex",flexDirection:"column",gap:".4rem"}}>
              {!(messages[activeContact]?.length)&&<div style={{textAlign:"center",color:"var(--pale)",fontStyle:"italic",marginTop:"2rem",fontSize:".84rem"}}>No messages yet.</div>}
              {(messages[activeContact]||[]).map(m=>(
                <div key={m.id} style={{display:"flex",justifyContent:m.from==="You"?"flex-end":"flex-start"}}>
                  <div>
                    <div className="mb" style={{background:m.from==="You"?"var(--clay)":"#f0e8dc",color:m.from==="You"?"white":"var(--ink)",borderRadius:m.from==="You"?"14px 14px 3px 14px":"14px 14px 14px 3px"}}>{m.text}</div>
                    <div style={{fontSize:".62rem",color:"var(--pale)",textAlign:m.from==="You"?"right":"left",marginTop:2,padding:"0 4px"}}>{m.time}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef}/>
            </div>
            <div style={{padding:".62rem .78rem",borderTop:"1px solid var(--bdr)",display:"flex",gap:".38rem",background:"var(--surf)"}}>
              <input value={newMessage} onChange={e=>setNewMessage(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&newMessage.trim()){setMessages(p=>({...p,[activeContact]:[...(p[activeContact]||[]),{id:Date.now(),from:"You",text:newMessage,time:"Now"}]}));setNewMessage("");}}}
                placeholder={`Message ${activeContact}…`} style={{flex:1,padding:".44rem .72rem",border:"1.5px solid var(--bdr)",borderRadius:20,fontFamily:"'DM Sans',sans-serif",fontSize:".84rem",outline:"none"}}/>
              <button className="btn bp" onClick={()=>{if(newMessage.trim()){setMessages(p=>({...p,[activeContact]:[...(p[activeContact]||[]),{id:Date.now(),from:"You",text:newMessage,time:"Now"}]}));setNewMessage("");}}} style={{borderRadius:20,padding:".44rem .88rem"}}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
