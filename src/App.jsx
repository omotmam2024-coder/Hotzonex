import React, { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

// ── Responsive hook ──────────────────────────────────────────────────────────
function useIsMobile(){ 
  const [m,setM]=React.useState(()=>window.innerWidth<768);
  React.useEffect(()=>{
    const h=()=>setM(window.innerWidth<768);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  return m;
}
function useIsTablet(){
  const [t,setT]=React.useState(()=>window.innerWidth<1024);
  React.useEffect(()=>{
    const h=()=>setT(window.innerWidth<1024);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  return t;
}

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPA_URL = "https://prxumouufckubwioywuz.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeHVtb3V1ZmNrdWJ3aW95d3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDc2NTIsImV4cCI6MjA5NTgyMzY1Mn0.RpK8UmfzQhXVVuuVhsj5QH3HDhwT6RAm0ID0o_MqR7U";
const H = {
  "Content-Type":"application/json",
  "apikey":SUPA_KEY,
  "Authorization":`Bearer ${SUPA_KEY}`,
  "Prefer":"return=representation",
};

async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, { headers:H, ...opts });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

const enc = encodeURIComponent;

// ── Auth helpers ─────────────────────────────────────────────────────────────
const auth = {
  login:   (email,password) => sbFetch(`/app_users?email=eq.${enc(email)}&password=eq.${enc(password)}&active=eq.true`),
  getAll:  ()               => sbFetch(`/app_users?order=name.asc`),
  create:  (f)              => sbFetch("/app_users",{method:"POST",body:JSON.stringify(f)}),
  update:  (id,f)           => sbFetch(`/app_users?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(f)}),
  delete:  (id)             => sbFetch(`/app_users?id=eq.${id}`,{method:"DELETE",headers:{...H,Prefer:""}}),
};

// ── Role permissions ──────────────────────────────────────────────────────────
const ROLES = {
  admin:   { label:"Admin",   color:"#00e5c3", canDelete:true,  canEdit:true,  canViewAll:true,  canManageUsers:true  },
  manager: { label:"Manager", color:"#3b82f6", canDelete:false, canEdit:true,  canViewAll:true,  canManageUsers:false },
  staff:   { label:"Staff",   color:"#f97316", canDelete:false, canEdit:true,  canViewAll:false, canManageUsers:false },
  viewer:  { label:"Viewer",  color:"#a78bfa", canDelete:false, canEdit:false, canViewAll:true,  canManageUsers:false },
};
const canDo = (user, perm) => user && ROLES[user.role]?.[perm];

// ── SESSION: persist login in sessionStorage ──────────────────────────────────
const SESSION_KEY = "hzx_user";
function saveSession(u){ try{ sessionStorage.setItem(SESSION_KEY, JSON.stringify(u)); }catch{} }
function loadSession(){ try{ const s=sessionStorage.getItem(SESSION_KEY); return s?JSON.parse(s):null; }catch{ return null; } }
function clearSession(){ try{ sessionStorage.removeItem(SESSION_KEY); }catch{} }

// daily_entries CRUD — all queries scoped by location
const db = {
  fetchYear:  (y,loc)     => sbFetch(`/daily_entries?year=eq.${y}&location=eq.${enc(loc)}&order=month.asc,day.asc`),
  fetchMonth: (y,m,loc)   => sbFetch(`/daily_entries?year=eq.${y}&month=eq.${enc(m)}&location=eq.${enc(loc)}&order=day.asc`),
  fetchWeek:  (y,m,s,e,loc) => sbFetch(`/daily_entries?year=eq.${y}&month=eq.${enc(m)}&day=gte.${s}&day=lte.${e}&location=eq.${enc(loc)}&order=day.asc`),
  insert: (year,month,day,loc,f) => sbFetch("/daily_entries",{method:"POST",body:JSON.stringify({year,month,day,location:loc,...f})}),
  patch:  (id,f)          => sbFetch(`/daily_entries?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(f)}),
  delete: (id)            => sbFetch(`/daily_entries?id=eq.${id}`,{method:"DELETE",headers:{...H,Prefer:""}}),
  findId: (y,m,d,loc)     => sbFetch(`/daily_entries?year=eq.${y}&month=eq.${enc(m)}&day=eq.${d}&location=eq.${enc(loc)}&select=id`),
};

// Smart save: patch if we have an id, insert otherwise, fallback to patch on duplicate key
async function smartSave(year, month, day, loc, fields, existingId=null) {
  if (existingId) return db.patch(existingId, fields);
  try { return await db.insert(year, month, day, loc, fields); }
  catch(e) {
    if (e.message?.includes("23505")) {
      const rows = await db.findId(year, month, day, loc);
      if (rows?.length) return db.patch(rows[0].id, fields);
    }
    throw e;
  }
}

// other_expenses CRUD — scoped by location
const oe = {
  fetch:      (y,m,loc) => sbFetch(`/other_expenses?year=eq.${y}&month=eq.${enc(m)}&location=eq.${enc(loc)}&order=day.asc,id.asc`),
  fetchYear:  (y,loc)   => sbFetch(`/other_expenses?year=eq.${y}&location=eq.${enc(loc)}&order=month.asc,day.asc`),
  insert: (f)           => sbFetch("/other_expenses",{method:"POST",body:JSON.stringify(f)}),
  patch:  (id,f)        => sbFetch(`/other_expenses?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(f)}),
  delete: (id)          => sbFetch(`/other_expenses?id=eq.${id}`,{method:"DELETE",headers:{...H,Prefer:""}}),
};

// usd_savings CRUD
const usd = {
  fetchYear:  (y,loc)   => sbFetch(`/usd_savings?year=eq.${y}&location=eq.${enc(loc)}&order=month.asc,day.asc`),
  fetchMonth: (y,m,loc) => sbFetch(`/usd_savings?year=eq.${y}&month=eq.${enc(m)}&location=eq.${enc(loc)}&order=day.asc,id.asc`),
  fetchAll:   (y)       => sbFetch(`/usd_savings?year=eq.${y}&order=month.asc,day.asc`),
  insert: (f)           => sbFetch("/usd_savings",{method:"POST",body:JSON.stringify(f)}),
  patch:  (id,f)        => sbFetch(`/usd_savings?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(f)}),
  delete: (id)          => sbFetch(`/usd_savings?id=eq.${id}`,{method:"DELETE",headers:{...H,Prefer:""}}),
};

// Group other_expenses rows into { [month]: totalAmount }
function oeByMonth(oeRows){
  const map={};
  for(const m of MONTHS) map[m]=0;
  for(const r of oeRows) if(map[r.month]!==undefined) map[r.month]+=nv(r.amount);
  return map;
}

// Group usd_savings rows into { [month]: totalSSP exchanged }
// The SSP spent on USD exchange is real cash leaving the business
function usdByMonth(usdRows){
  const map={};
  for(const m of MONTHS) map[m]=0;
  for(const r of usdRows) if(map[r.month]!==undefined) map[r.month]+=nv(r.ssp_amount);
  return map;
}


// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
// Dynamic year range: from 2026 up to 2 years into the future
const START_YEAR = 2026;
const getYears = () => {
  const current = new Date().getFullYear();
  const end = current + 2;
  const years = [];
  for (let y = START_YEAR; y <= end; y++) years.push(y);
  return years;
};
const YEARS = getYears();
const EXP_KEYS   = ["internet","power","feeding","wages"];
const EXP_LABELS = {internet:"Internet",power:"Power/Fuel",feeding:"Feeding",wages:"Wages"};
const OE_CATS = ["Equipment / Hardware","Office Supplies","Rent / Utilities",
  "Transport","Food / Drinks","Maintenance","Marketing","Other"];

// leap-year-aware days in month
const daysInMonth = (mi, y) => (mi===1 && y%4===0) ? 29 : MONTH_DAYS[mi];

// ── Locations ─────────────────────────────────────────────────────────────────
const LOCATIONS = [
  { id:"HQ",       label:"Jebel Iraq HQ",       short:"HQ",       color:"#00e5c3",
    expKeys:["internet","power","feeding","wages"],
    expLabels:{internet:"Internet",power:"Power/Fuel",feeding:"Feeding",wages:"Wages"} },
  { id:"SUB",      label:"Jebel Iraq Sub-Office",short:"Sub",      color:"#3b82f6",
    expKeys:["power","wages"],
    expLabels:{power:"Power/Fuel",wages:"Wages"} },
  { id:"GOROM",    label:"Hotzonex Gorom",        short:"Gorom",    color:"#f97316",
    expKeys:["power","wages"],
    expLabels:{power:"Power/Fuel",wages:"Wages"} },
  { id:"HOME",     label:"Hotzonex Home",         short:"Home",     color:"#a78bfa",
    expKeys:["internet"],
    expLabels:{internet:"Internet"} },
];
const LOC_MAP = Object.fromEntries(LOCATIONS.map(l=>[l.id,l]));

// ── Palette ───────────────────────────────────────────────────────────────────
const DARK = {
  pageBg:"#0b1120", sidebar:"#0d1526", header:"#0d1526",
  card:"#111d33",   cardB:"#1a2d4a",   divider:"#162035",
  teal:"#00e5c3",   tealBg:"rgba(0,229,195,0.08)",
  red:"#f05252",    orange:"#f97316",  yellow:"#fbbf24",
  green:"#10b981",  blue:"#3b82f6",
  text:"#e2e8f0",   muted:"#4b6080",   subtle:"#1e3050",
  inputBg:"#090f1c",
};
const LIGHT = {
  pageBg:"#f0f4f8", sidebar:"#ffffff", header:"#ffffff",
  card:"#ffffff",   cardB:"#d1dce8",   divider:"#e2eaf3",
  teal:"#008a76",   tealBg:"rgba(0,138,118,0.08)",
  red:"#dc2626",    orange:"#ea580c",  yellow:"#b45309",
  green:"#15803d",  blue:"#1d4ed8",
  text:"#0f172a",   muted:"#64748b",   subtle:"#e2eaf3",
  inputBg:"#f8fafc",
};
// C is set dynamically in App and passed via context
const ThemeCtx = React.createContext(DARK);
const useTheme = () => React.useContext(ThemeCtx);
const UserCtx  = React.createContext(null);
const useUser  = () => React.useContext(UserCtx);

// ── Pure helpers ──────────────────────────────────────────────────────────────
const nv    = v => Number(v) || 0;
const fmt   = v => nv(v).toLocaleString();
const pctN  = (inc,exp) => inc>0 ? ((inc-exp)/inc*100).toFixed(1) : "0.0";

function rowsToNested(rows) {
  const n={};
  for(const m of MONTHS){n[m]={};for(let d=1;d<=31;d++)n[m][d]={income:"",internet:"",power:"",feeding:"",wages:""};}
  for(const r of rows) if(n[r.month]) n[r.month][r.day]={income:r.income??"",internet:r.internet??"",power:r.power??"",feeding:r.feeding??"",wages:r.wages??""};
  return n;
}
function calcDay(row){
  const inc=nv(row.income), exp=EXP_KEYS.reduce((s,k)=>s+nv(row[k]),0);
  return {income:inc,expenses:exp,profit:inc-exp};
}
function calcMonth(md, days){
  let inc=0,exp=0; const daily=[];
  for(let d=1;d<=days;d++){
    const row=md[d]||{}, c=calcDay(row);
    inc+=c.income; exp+=c.expenses;
    daily.push({day:d,...c,internet:nv(row.internet),power:nv(row.power),feeding:nv(row.feeding),wages:nv(row.wages)});
  }
  return {income:inc,expenses:exp,profit:inc-exp,daily};
}
function calcYear(yd, y){
  const months=MONTHS.map((m,i)=>{
    const r=calcMonth(yd[m]||{}, daysInMonth(i,y));
    return {month:m.slice(0,3),full:m,income:r.income,expenses:r.expenses,profit:r.profit};
  });
  return {income:months.reduce((s,m)=>s+m.income,0),expenses:months.reduce((s,m)=>s+m.expenses,0),profit:months.reduce((s,m)=>s+m.profit,0),months};
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function Ico({d,size=18,color="currentColor"}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
}
const IC = {
  dashboard:"M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  entry:"M12 5v14m-7-7h14",
  monthly:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  annual:"M18 20V10m-6 10V4M6 20v-6",
  history:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  wifi:"M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01",
  logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  chevron:"M19 9l-7 7-7-7",
  refresh:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  check:"M5 13l4 4L19 7",
  spin:"M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83",
  edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  report:"M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  purchase:"M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  download:"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
};


// ── Shared UI ─────────────────────────────────────────────────────────────────
const SEL_BG_DARK  = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%234b6080' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`;
const SEL_BG_LIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`;
function mkINP(C){ return {width:"100%",background:C.inputBg,border:`1px solid ${C.cardB}`,borderRadius:8,
  color:C.text,padding:"11px 14px",fontSize:14,outline:"none",boxSizing:"border-box",
  fontVariantNumeric:"tabular-nums",transition:"border-color 0.15s"}; }
function mkSEL(C){ const _dark=C.inputBg==="#090f1c"; return {...mkINP(C),cursor:"pointer",appearance:"none",
  backgroundImage:_dark?SEL_BG_DARK:SEL_BG_LIGHT,
  backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:32}; }

// ── Error Boundary (catches chart/render crashes) ────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(e){ return {err:e}; }
  render(){
    if(this.state.err){
      const C=this.props.theme||DARK;
      return(
        <div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>
          <div style={{fontSize:22,marginBottom:8}}>⚠</div>
          <div style={{color:C.red,marginBottom:4,fontWeight:600}}>Something went wrong</div>
          <div style={{fontSize:11,marginBottom:16}}>{this.state.err.message}</div>
          <button onClick={()=>this.setState({err:null})}
            style={{background:C.teal,border:"none",borderRadius:7,color:"#09111e",
              padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
function SafeView({children,theme}){
  return <ErrorBoundary theme={theme}>{children}</ErrorBoundary>;
}

function Card({children,style={}}){
  const C=useTheme();
  return <div style={{background:C.card,...style}}>{children}</div>;
}
function KPICard({label,value,suffix="SSP",color}){
  const C=useTheme();
  const isMobile=useIsMobile();
  const col=color||C.teal;
  return(
    <Card style={{padding:isMobile?"14px 16px":"22px 24px"}}>
      <div style={{fontSize:isMobile?11:13,color:C.muted,marginBottom:isMobile?8:16,fontWeight:500}}>{label}</div>
      <div style={{fontSize:isMobile?22:32,fontWeight:700,color:col,lineHeight:1,letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums"}}>
        {typeof value==="number"?value.toLocaleString():value}
      </div>
      <div style={{fontSize:11,color:C.muted,marginTop:isMobile?4:8}}>{suffix}</div>
    </Card>
  );
}
function SLabel({children,style={}}){
  const C=useTheme();
  return <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted,fontWeight:600,...style}}>{children}</div>;
}
function Spinner(){
  const C=useTheme();
  return(
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:32,height:32,border:`3px solid ${C.cardB}`,borderTop:`3px solid ${C.teal}`,
        borderRadius:"50%",animation:"_spin 0.8s linear infinite"}}/>
    </>
  );
}
function useTT(){
  const C=useTheme();
  return {
    contentStyle:{background:C.card,border:`1px solid ${C.cardB}`,borderRadius:8,fontSize:11,color:C.text,padding:"8px 12px"},
    formatter:(v)=>[`SSP ${Number(v).toLocaleString()}`,""],
    labelStyle:{color:C.muted},
  };
}
function ActionBtn({onClick,color,icon,label,disabled}){
  return(
    <button onClick={onClick} disabled={disabled}
      style={{background:`rgba(${color},0.1)`,border:`1px solid rgba(${color},0.3)`,
        borderRadius:6,color:`rgb(${color})`,padding:"5px 9px",cursor:disabled?"not-allowed":"pointer",
        display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,opacity:disabled?0.6:1}}>
      <Ico d={IC[icon]} size={12} color={`rgb(${color})`}/>{label}
    </button>
  );
}

// ── useLiveYear: fetches daily + other expenses + usd savings, auto-refreshes every 30s ─
function useLiveYear(year, loc){
  const [data,    setData]    = useState(null);
  const [oeData,  setOeData]  = useState(null);
  const [usdData, setUsdData] = useState(null); // { [month]: totalSSP exchanged }
  const [status,  setStatus]  = useState("loading");
  async function load(){
    try{
      const [rows, oeRows, usdRows] = await Promise.all([
        db.fetchYear(year, loc),
        oe.fetchYear(year, loc),
        usd.fetchYear(year, loc),
      ]);
      setData(rowsToNested(rows));
      setOeData(oeByMonth(oeRows));
      setUsdData(usdByMonth(usdRows));
      setStatus("live");
    }catch(e){ setStatus("error"); console.error(e); }
  }
  useEffect(()=>{ setData(null); setOeData(null); setUsdData(null); setStatus("loading"); load(); },[year,loc]);
  useEffect(()=>{ const t=setInterval(load,30000); return()=>clearInterval(t); },[year,loc]);
  return {data, oeData, usdData, status, reload:load};
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({year, loc, globalReload}){
  const C=useTheme(); const TT=useTT();
  const isMobile=useIsMobile(); const isTablet=useIsTablet();
  const {data,oeData,usdData,status,reload}=useLiveYear(year,loc);
  useEffect(()=>{ reload(); },[globalReload]);

  if(status==="loading"||!data||!oeData||!usdData) return <Loading/>;
  const yd=calcYear(data,year);

  // Real profit = income − operating expenses − other purchases − USD exchanged (SSP)
  const totalOtherExp = Object.values(oeData).reduce((s,v)=>s+v,0);
  const totalUsdSSP   = Object.values(usdData).reduce((s,v)=>s+v,0);
  const realTotalExp  = yd.expenses + totalOtherExp + totalUsdSSP;
  const realProfit    = yd.income - realTotalExp;

  const recent=[];
  for(let mi=MONTHS.length-1;mi>=0&&recent.length<6;mi--){
    for(let d=daysInMonth(mi,year);d>=1&&recent.length<6;d--){
      const row=(data[MONTHS[mi]]||{})[d];
      if(row&&nv(row.income)>0) recent.push({label:`${MONTHS[mi].slice(0,3)} ${d}`,...calcDay(row)});
    }
  }
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":isTablet?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?10:14,marginBottom:16}}>
        <KPICard label="Total Income"          value={yd.income}      color={C.teal}/>
        <KPICard label="Operating Expenses"    value={yd.expenses}    color={C.orange}/>
        <KPICard label="Other Purchases"       value={totalOtherExp}  color={C.red}/>
        <KPICard label="Real Profit (Take-Home)" value={realProfit}   color={realProfit>=0?C.green:C.red}/>
      </div>
      {/* Profit margin strip */}
      <Card style={{padding:isMobile?"12px 14px":"14px 22px",marginBottom:16,display:"flex",alignItems:"center",gap:isMobile?12:24,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Total Expenses</div>
          <div style={{color:C.red,fontWeight:700,fontSize:18,fontVariantNumeric:"tabular-nums"}}>SSP {realTotalExp.toLocaleString()}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>Operating {yd.expenses.toLocaleString()} + Purchases {totalOtherExp.toLocaleString()}{totalUsdSSP>0?` + USD savings ${totalUsdSSP.toLocaleString()}`:""} SSP</div>
        </div>
        <div style={{width:1,height:40,background:C.cardB}}/>
        <div>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Profit Margin</div>
          <div style={{color:C.teal,fontWeight:700,fontSize:18}}>{pctN(yd.income,realTotalExp)}%</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>of every SSP earned you keep</div>
        </div>
        <div style={{width:1,height:40,background:C.cardB}}/>
        <div>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Operating Profit</div>
          <div style={{color:C.yellow,fontWeight:700,fontSize:18,fontVariantNumeric:"tabular-nums"}}>{yd.profit>=0?"+":""}{yd.profit.toLocaleString()}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>before other purchases</div>
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 380px",gap:14}}>
        <Card style={{padding:22}}>
          <SLabel style={{marginBottom:16}}>Monthly Net Profit</SLabel>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={yd.months}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.subtle}/>
              <XAxis dataKey="month" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
              <Tooltip {...TT}/>
              <Line type="monotone" dataKey="profit" stroke={C.teal} strokeWidth={2.5}
                dot={p=>{ const{cx,cy,payload}=p; return payload.income>0
                  ?<circle key={cx} cx={cx} cy={cy} r={4} fill={C.teal} stroke="none"/>
                  :<circle key={cx} cx={cx} cy={cy} r={0}/>}}
                activeDot={{r:5,fill:C.teal}} name="Net Profit"/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card style={{padding:22}}>
          <SLabel style={{marginBottom:16}}>Recent Days</SLabel>
          {recent.length===0
            ?<div style={{color:C.muted,fontSize:13,marginTop:30,lineHeight:1.6}}>No data yet. Add days in <strong style={{color:C.teal}}>Daily Entry</strong>.</div>
            :recent.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 0",borderBottom:i<recent.length-1?`1px solid ${C.divider}`:"none"}}>
                <span style={{color:C.muted,fontSize:12}}>{d.label}</span>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.teal,fontSize:13,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{d.income.toLocaleString()}</div>
                  <div style={{color:d.profit>=0?C.green:C.red,fontSize:10,marginTop:1}}>{d.profit>=0?"+":""}{d.profit.toLocaleString()}</div>
                </div>
              </div>
            ))
          }
        </Card>
      </div>
    </div>
  );
}

function Loading(){
  const C=useTheme();
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60,gap:12,color:C.muted,fontSize:13}}><Spinner/> Loading…</div>;
}

// ── DAILY ENTRY ───────────────────────────────────────────────────────────────
function DailyEntry({year, loc, onSaved}){
  const C=useTheme();
  const isMobile=useIsMobile();
  const locCfg=LOC_MAP[loc];
  const today=new Date();
  const curMi=today.getMonth();
  const [selM,setSelM]=useState(MONTHS[curMi]);
  const [selD,setSelD]=useState(today.getDate());
  const [form,setForm]=useState({income:"",internet:"",power:"",feeding:"",wages:""});
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState(""); // "ok"|"error:..."|""
  const [editId,setEditId]=useState(null);
  const editRef=useRef(null);
  const [tableRows,setTableRows]=useState([]);
  const [tableLoading,setTableLoading]=useState(false);
  const [delConfirm,setDelConfirm]=useState(null);
  const [deleting,setDeleting]=useState(false);

  const mi=MONTHS.indexOf(selM);
  const dim=daysInMonth(mi,year);

  // Load table for current month
  async function loadTable(m=selM){
    setTableLoading(true);
    try{ setTableRows(await db.fetchMonth(year,m,loc)); }
    catch(e){ console.error(e); }
    finally{ setTableLoading(false); }
  }
  useEffect(()=>{ loadTable(selM); },[selM,year]);

  // Pre-fill form from DB row when day changes — skip if in edit mode
  useEffect(()=>{
    if(editRef.current!==null) return;
    // Find this day in tableRows (live DB data)
    const row=tableRows.find(r=>r.day===selD);
    if(row) setForm({income:row.income??"",internet:row.internet??"",power:row.power??"",feeding:row.feeding??"",wages:row.wages??""});
    else    setForm({income:"",internet:"",power:"",feeding:"",wages:""});
    setSaveMsg("");
  },[selD,tableRows]);

  const inc=nv(form.income), exp=locCfg.expKeys.reduce((s,k)=>s+nv(form[k]),0), prof=inc-exp;

  async function doSave(){
    setSaving(true); setSaveMsg("");
    try{
      const fields={income:nv(form.income),internet:nv(form.internet),power:nv(form.power),feeding:nv(form.feeding),wages:nv(form.wages)};
      await smartSave(year,selM,selD,loc,fields,editRef.current);
      setSaveMsg("ok");
      editRef.current=null; setEditId(null);
      await loadTable(selM);
      onSaved();
      setTimeout(()=>setSaveMsg(""),2500);
    }catch(e){ setSaveMsg("error:"+e.message); }
    finally{ setSaving(false); }
  }

  function doEdit(row){
    editRef.current=row.id; setEditId(row.id);
    setSelD(row.day);
    setForm({income:row.income??"",internet:row.internet??"",power:row.power??"",feeding:row.feeding??"",wages:row.wages??""});
    setSaveMsg("");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function resetForm(){
    editRef.current=null; setEditId(null);
    setForm({income:"",internet:"",power:"",feeding:"",wages:""});
    setSaveMsg("");
  }

  async function doDelete(id){
    setDeleting(true);
    try{
      await db.delete(id);
      setDelConfirm(null);
      if(editRef.current===id){ editRef.current=null; setEditId(null); resetForm(); }
      await loadTable(selM);
      onSaved();
    }catch(e){ alert("Delete failed: "+e.message); }
    finally{ setDeleting(false); }
  }

  const tInc=tableRows.reduce((s,r)=>s+nv(r.income),0);
  const tExp=tableRows.reduce((s,r)=>s+locCfg.expKeys.reduce((ss,k)=>ss+nv(r[k]),0),0);

  return(
    <div>
      {/* Selectors */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:20,maxWidth:720}}>
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Month</div>
          <select value={selM} style={mkSEL(C)} onChange={e=>{
            const v=e.target.value; const ni=MONTHS.indexOf(v);
            const mx=daysInMonth(ni,year);
            setSelM(v); if(selD>mx)setSelD(mx);
            editRef.current=null; setEditId(null); setSaveMsg("");
          }}>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Day</div>
          <select value={selD} style={mkSEL(C)} onChange={e=>setSelD(Number(e.target.value))}>
            {Array.from({length:dim},(_,i)=>i+1).map(d=><option key={d} value={d}>{d} {selM}</option>)}
          </select>
        </div>
      </div>

      {/* Form card */}
      <div style={{maxWidth:720,marginBottom:28}}>
        <Card style={{padding:26}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:12,color:C.muted}}>
              {editId
                ?<><span style={{color:C.yellow,fontWeight:700}}>✏ Editing</span> — {selD} {selM} {year}</>
                :<>New entry for <strong style={{color:C.text}}>{selD} {selM} {year}</strong></>}
            </div>
            {editId&&<button onClick={resetForm} style={{fontSize:11,color:C.muted,background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Cancel edit</button>}
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Income (SSP)</div>
            <input type="number" value={form.income} placeholder="0" style={mkINP(C)}
              onChange={e=>setForm(f=>({...f,income:e.target.value}))}
              onFocus={e=>e.target.style.borderColor=C.teal}
              onBlur={e=>e.target.style.borderColor=C.cardB}/>
          </div>

          <div style={{fontSize:11,color:C.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Expenses (SSP)</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:16}}>
            {locCfg.expKeys.map(k=>(
              <div key={k}>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>{locCfg.expLabels[k]}</div>
                <input type="number" value={form[k]} placeholder="0" style={mkINP(C)}
                  onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  onFocus={e=>e.target.style.borderColor=C.orange}
                  onBlur={e=>e.target.style.borderColor=C.cardB}/>
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div style={{background:C.inputBg,borderRadius:8,padding:isMobile?"12px 14px":"14px 18px",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr 1fr":"repeat(3,1fr)",gap:isMobile?8:12,marginBottom:16}}>
            {[["INCOME",inc,C.teal],["EXPENSES",exp,C.orange],["NET PROFIT",prof,prof>=0?C.green:C.red]].map(([l,v,col])=>(
              <div key={l}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4,letterSpacing:"0.1em"}}>{l}</div>
                <div style={{color:col,fontWeight:700,fontSize:18,fontVariantNumeric:"tabular-nums"}}>{v.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={doSave} disabled={saving}
              style={{flex:1,background:editId?C.yellow:C.teal,border:"none",borderRadius:8,color:"#09111e",
                padding:"12px 20px",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",
                opacity:saving?0.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {saving?<><Ico d={IC.spin} size={14} color="#09111e"/>Saving…</>
                :saveMsg==="ok"?<><Ico d={IC.check} size={14} color="#09111e"/>Saved!</>
                :editId?"Update Entry":"Save"}
            </button>
            <button onClick={resetForm} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:8,color:C.muted,padding:"12px 16px",fontSize:13,cursor:"pointer"}}>Clear</button>
          </div>
          {saveMsg.startsWith("error:")&&(
            <div style={{marginTop:10,padding:"8px 12px",background:"rgba(240,82,82,0.1)",border:"1px solid rgba(240,82,82,0.3)",borderRadius:7,fontSize:11,color:C.red}}>
              {saveMsg.replace("error:","")}
            </div>
          )}
        </Card>
      </div>

      {/* Entries table */}
      <Card style={{overflow:"hidden"}}>
        <div style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <SLabel>{selM} {year} — {tableRows.length} {tableRows.length===1?"entry":"entries"}</SLabel>
          <button onClick={()=>loadTable(selM)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"4px 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <Ico d={IC.refresh} size={12} color={C.muted}/>Refresh
          </button>
        </div>
        {tableLoading?<Loading/>:tableRows.length===0
          ?<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:13}}>No entries for {selM} {year}. Add one above.</div>
          :<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr>
                {["Day","Income",...locCfg.expKeys.map(k=>locCfg.expLabels[k]),"Net Profit","Actions"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:["Day","Actions"].includes(h)?"left":"right",
                    color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",
                    borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {tableRows.map(row=>{
                  const rExp=locCfg.expKeys.reduce((s,k)=>s+nv(row[k]),0), rProf=nv(row.income)-rExp;
                  const isEd=editId===row.id;
                  return(
                    <tr key={row.id}
                      style={{borderBottom:`1px solid ${C.divider}`,background:isEd?"rgba(251,191,36,0.05)":"transparent",transition:"background 0.1s"}}
                      onMouseEnter={e=>{if(!isEd)e.currentTarget.style.background="rgba(255,255,255,0.02)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=isEd?"rgba(251,191,36,0.05)":"transparent";}}>
                      <td style={{padding:"9px 14px",color:C.muted,fontWeight:600}}>
                        {row.day}{isEd&&<span style={{marginLeft:6,fontSize:9,color:C.yellow,background:"rgba(251,191,36,0.15)",padding:"1px 5px",borderRadius:4}}>editing</span>}
                      </td>
                      <td style={{padding:"9px 14px",textAlign:"right",color:C.teal,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{fmt(row.income)}</td>
                      {locCfg.expKeys.map(k=><td key={k} style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{fmt(row[k])}</td>)}
                      <td style={{padding:"9px 14px",textAlign:"right",fontWeight:700,fontVariantNumeric:"tabular-nums",color:rProf>=0?C.green:C.red}}>
                        {rProf>=0?"+":""}{fmt(rProf)}
                      </td>
                      <td style={{padding:"9px 14px"}}>
                        <div style={{display:"flex",gap:6}}>
                          <ActionBtn onClick={()=>doEdit(row)} color="59,130,246" icon="edit" label="Edit"/>
                          {canDo(useUser(),"canDelete")&&(
                            delConfirm===row.id
                            ?<div style={{display:"flex",gap:4}}>
                              <ActionBtn onClick={()=>doDelete(row.id)} color="240,82,82" icon="trash" label={deleting?"…":"Confirm"} disabled={deleting}/>
                              <button onClick={()=>setDelConfirm(null)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:11}}>Cancel</button>
                            </div>
                            :<ActionBtn onClick={()=>setDelConfirm(row.id)} color="240,82,82" icon="trash" label="Delete"/>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                  <td style={{padding:"9px 14px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Total</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.teal,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmt(tInc)}</td>
                  <td colSpan={4} style={{padding:"9px 14px",textAlign:"right",color:C.orange,fontSize:12,fontVariantNumeric:"tabular-nums"}}>{fmt(tExp)} exp</td>
                  <td style={{padding:"9px 14px",textAlign:"right",fontWeight:700,fontVariantNumeric:"tabular-nums",color:tInc-tExp>=0?C.green:C.red}}>{tInc-tExp>=0?"+":""}{fmt(tInc-tExp)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        }
      </Card>
    </div>
  );
}

// ── MONTHLY ───────────────────────────────────────────────────────────────────
function Monthly({year, loc, globalReload}){
  const C=useTheme(); const TT=useTT();
  const isMobile=useIsMobile();
  const locCfg=LOC_MAP[loc];
  const today=new Date();
  const [selM,setSelM]=useState(MONTHS[today.getMonth()]);
  const [rows,setRows]=useState([]);
  const [oeRows,setOeRows]=useState([]);
  const [loading,setLoading]=useState(false);

  const [usdRows,setUsdRows]=useState([]);
  async function loadMonth(m=selM){
    setLoading(true);
    try{
      const [daily,other,usdR]=await Promise.all([db.fetchMonth(year,m,loc), oe.fetch(year,m,loc), usd.fetchMonth(year,m,loc)]);
      setRows(daily); setOeRows(other); setUsdRows(usdR);
    }
    catch(e){ console.error(e); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadMonth(selM); },[selM,year]);
  useEffect(()=>{ loadMonth(selM); },[globalReload]);

  // Build nested from live rows
  const md={};
  for(let d=1;d<=31;d++) md[d]={};
  rows.forEach(r=>{ md[r.day]={income:r.income,internet:r.internet,power:r.power,feeding:r.feeding,wages:r.wages}; });

  const dim=daysInMonth(MONTHS.indexOf(selM),year);
  const {income,expenses,profit,daily}=calcMonth(md,dim);
  // Override expense column display to location-specific keys
  const locExpKeys=locCfg.expKeys;
  const locExpLabels=locCfg.expLabels;
  const otherExpTotal=oeRows.reduce((s,r)=>s+nv(r.amount),0);
  const usdSSPTotal=usdRows.reduce((s,r)=>s+nv(r.ssp_amount),0);
  const realProfit=profit-otherExpTotal-usdSSPTotal;
  const weeks=[[],[],[],[],[]];
  daily.forEach(d=>weeks[Math.min(Math.floor((d.day-1)/7),4)].push(d));

  return(
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {MONTHS.map(m=>{
          const active=m===selM;
          return(
            <button key={m} onClick={()=>setSelM(m)} style={{
              padding:"6px 13px",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:500,
              border:active?`1px solid ${C.teal}`:`1px solid ${C.cardB}`,
              background:active?C.tealBg:"transparent",
              color:active?C.teal:C.muted}}>
              {m.slice(0,3)}
            </button>
          );
        })}
        <button onClick={()=>loadMonth(selM)} style={{padding:"6px 12px",borderRadius:20,fontSize:12,cursor:"pointer",border:`1px solid ${C.cardB}`,background:"transparent",color:C.muted,display:"flex",alignItems:"center",gap:4}}>
          <Ico d={IC.refresh} size={12} color={C.muted}/>Refresh
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12,marginBottom:16}}>
        <KPICard label="Month Income"       value={income}         color={C.teal}/>
        <KPICard label="Operating Expenses" value={expenses}       color={C.orange}/>
        <KPICard label="Other Purchases"    value={otherExpTotal}  color={C.red}/>
        <KPICard label="Real Profit"        value={realProfit}     color={realProfit>=0?C.green:C.red}/>
      </div>
      {(otherExpTotal>0||usdSSPTotal>0)&&(
        <Card style={{padding:"12px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",background:"rgba(240,82,82,0.05)"}}>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
            <span style={{color:C.text,fontWeight:600}}>Operating profit</span> SSP {fmt(profit)}
            {otherExpTotal>0&&<>{" "}<span style={{color:C.muted}}>−</span>{" "}<span style={{color:C.red,fontWeight:600}}>purchases</span> SSP {fmt(otherExpTotal)}</>}
            {usdSSPTotal>0&&<>{" "}<span style={{color:C.muted}}>−</span>{" "}<span style={{color:C.green,fontWeight:600}}>USD savings</span> SSP {fmt(usdSSPTotal)}</>}
            {" "}<span style={{color:C.muted}}>=</span>{" "}
            <span style={{color:realProfit>=0?C.green:C.red,fontWeight:700}}>real take-home SSP {fmt(realProfit)}</span>
          </div>
        </Card>
      )}

      {loading?<Loading/>:weeks.map((wd,wi)=>{
        if(!wd.length) return null;
        const wI=wd.reduce((s,d)=>s+d.income,0), wE=wd.reduce((s,d)=>s+d.expenses,0);
        return(
          <Card key={wi} style={{marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"8px 16px",background:"rgba(255,255,255,0.02)",fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>Week {wi+1}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>
                  {["Day","Income",...locExpKeys.map(k=>locExpLabels[k]),"Net Profit"].map(h=>(
                    <th key={h} style={{padding:"8px 14px",textAlign:h==="Day"?"left":"right",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {wd.map(d=>(
                    <tr key={d.day} style={{borderBottom:`1px solid ${C.divider}`}}>
                      <td style={{padding:"8px 14px",color:C.muted,fontWeight:600}}>{d.day}</td>
                      <td style={{padding:"8px 14px",textAlign:"right",color:d.income>0?C.teal:C.muted,fontWeight:d.income>0?600:400,fontVariantNumeric:"tabular-nums"}}>{d.income>0?fmt(d.income):"—"}</td>
                      {locExpKeys.map(k=><td key={k} style={{padding:"8px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{d[k]>0?fmt(d[k]):"—"}</td>)}
                      <td style={{padding:"8px 14px",textAlign:"right",color:d.income===0?C.muted:d.profit>=0?C.green:C.red,fontWeight:d.income>0?700:400,fontVariantNumeric:"tabular-nums"}}>
                        {d.income===0?"—":(d.profit>=0?"+":"")+fmt(d.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{borderTop:`1px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                  <td style={{padding:"8px 14px",color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Total</td>
                  <td style={{padding:"8px 14px",textAlign:"right",color:C.teal,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmt(wI)}</td>
                  <td colSpan={4} style={{padding:"8px 14px",textAlign:"right",color:C.orange,fontSize:11,fontVariantNumeric:"tabular-nums"}}>{fmt(wE)} exp</td>
                  <td style={{padding:"8px 14px",textAlign:"right",color:wI-wE>=0?C.green:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{wI-wE>=0?"+":""}{fmt(wI-wE)}</td>
                </tr></tfoot>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── ANNUAL ────────────────────────────────────────────────────────────────────
function Annual({year, loc, globalReload}){
  const C=useTheme(); const TT=useTT();
  const isMobile=useIsMobile();
  const {data,oeData,usdData,status,reload}=useLiveYear(year,loc);
  useEffect(()=>{ reload(); },[globalReload]);
  if(status==="loading"||!data||!oeData||!usdData) return <Loading/>;
  const yd=calcYear(data,year);
  const totalOtherExp=Object.values(oeData).reduce((s,v)=>s+v,0);
  const totalUsdSSP=Object.values(usdData).reduce((s,v)=>s+v,0);
  const realTotalExp=yd.expenses+totalOtherExp+totalUsdSSP;
  const realProfit=yd.income-realTotalExp;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:14,marginBottom:20}}>
        <KPICard label="Total Income"       value={yd.income}     color={C.teal}/>
        <KPICard label="Operating Expenses" value={yd.expenses}   color={C.orange}/>
        <KPICard label="Other Purchases"    value={totalOtherExp} color={C.red}/>
        <KPICard label="Real Profit"        value={realProfit}    color={realProfit>=0?C.green:C.red}/>
      </div>
      <Card style={{overflow:"hidden"}}>
        <div style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <SLabel>Monthly Detail</SLabel>
          <span style={{fontSize:11,color:C.muted}}>Operating Profit = before purchases · Real Profit = after all spending</span>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>
              {["Month","Income","Op. Expenses","Other Purchases","USD Savings (SSP)","Op. Profit","Real Profit","Status"].map(h=>(
                <th key={h} style={{padding:"10px 14px",textAlign:h==="Month"?"left":"right",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {yd.months.map(m=>{
                const otherM=oeData[m.full]||0;
                const usdM=usdData[m.full]||0;
                const realM=m.profit-otherM-usdM;
                const hasData=m.income>0||otherM>0||usdM>0;
                return(
                  <tr key={m.month} style={{borderBottom:`1px solid ${C.divider}`,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"10px 14px",color:C.text,fontWeight:500}}>{m.full}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:m.income>0?C.teal:C.muted,fontVariantNumeric:"tabular-nums"}}>{m.income>0?fmt(m.income):"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:m.expenses>0?C.orange:C.muted,fontVariantNumeric:"tabular-nums"}}>{m.expenses>0?fmt(m.expenses):"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:otherM>0?C.red:C.muted,fontVariantNumeric:"tabular-nums"}}>{otherM>0?fmt(otherM):"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:usdM>0?C.green:C.muted,fontVariantNumeric:"tabular-nums"}}>{usdM>0?fmt(usdM):"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:m.income===0?C.muted:m.profit>=0?C.yellow:C.red,fontVariantNumeric:"tabular-nums"}}>{m.income===0?"—":(m.profit>=0?"+":"")+fmt(m.profit)}</td>
                    <td style={{padding:"10px 14px",textAlign:"right",color:!hasData?C.muted:realM>=0?C.green:C.red,fontWeight:hasData?700:400,fontVariantNumeric:"tabular-nums"}}>{!hasData?"—":(realM>=0?"+":"")+fmt(realM)}</td>
                    <td style={{padding:"10px 14px",textAlign:"right"}}>
                      {!hasData?<span style={{color:C.muted,fontSize:11}}>No data</span>
                        :<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,background:realM>=0?"rgba(16,185,129,0.12)":"rgba(240,82,82,0.12)",color:realM>=0?C.green:C.red}}>{realM>=0?"▲ Profit":"▼ Loss"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
              <td style={{padding:"10px 14px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Year Total</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:C.teal,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmt(yd.income)}</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:C.orange,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmt(yd.expenses)}</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{totalOtherExp>0?fmt(totalOtherExp):"—"}</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:C.green,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{totalUsdSSP>0?fmt(totalUsdSSP):"—"}</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:yd.profit>=0?C.yellow:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{yd.profit>=0?"+":""}{fmt(yd.profit)}</td>
              <td style={{padding:"10px 14px",textAlign:"right",color:realProfit>=0?C.green:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{realProfit>=0?"+":""}{fmt(realProfit)}</td>
              <td/>
            </tr></tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── 5-YEAR HISTORY ────────────────────────────────────────────────────────────
function History({loc}){
  const C=useTheme(); const TT=useTT();
  const [allData,setAllData]=useState({});
  const [oeAllData,setOeAllData]=useState({});
  const [usdAllData,setUsdAllData]=useState({});
  const [activeYears,setActiveYears]=useState(YEARS);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    // First fetch distinct years that have data, then load all of them
    const currentYear = new Date().getFullYear();
    const yearsToLoad = getYears(); // START_YEAR up to current+2
    Promise.all(yearsToLoad.map(y=>
      Promise.all([
        db.fetchYear(y,loc).catch(()=>[]),
        oe.fetchYear(y,loc).catch(()=>[]),
        usd.fetchYear(y,loc).catch(()=>[]),
      ]).then(([rows,oeRows,usdRows])=>({y,rows,oeRows,usdRows}))
    ))
    .then(results=>{
      const d={}, od={}, ud={}, activeYears=[];
      results.forEach(({y,rows,oeRows,usdRows})=>{
        d[y]=rowsToNested(rows);
        od[y]=oeByMonth(oeRows);
        ud[y]=usdByMonth(usdRows);
        if(rows.length>0||oeRows.length>0||usdRows.length>0) activeYears.push(y);
      });
      // Always include current year even if no data yet
      if(!activeYears.includes(currentYear)) activeYears.push(currentYear);
      setAllData(d);
      setOeAllData(od);
      setUsdAllData(ud);
      setActiveYears([...activeYears].sort((a,b)=>a-b));
    })
    .finally(()=>setLoading(false));
  },[loc]);

  if(loading) return <Loading/>;
  const ys=activeYears.map(y=>{
    const yd=calcYear(allData[y]||{},y);
    const oeTotal=Object.values(oeAllData[y]||{}).reduce((s,v)=>s+v,0);
    const usdTotal=Object.values(usdAllData[y]||{}).reduce((s,v)=>s+v,0);
    return {...yd,year:y,otherExp:oeTotal,usdSSP:usdTotal,realProfit:yd.profit-oeTotal-usdTotal};
  });
  const tot={
    income:  ys.reduce((s,y)=>s+y.income,0),
    expenses:ys.reduce((s,y)=>s+y.expenses,0),
    otherExp:ys.reduce((s,y)=>s+y.otherExp,0),
    usdSSP:  ys.reduce((s,y)=>s+y.usdSSP,0),
    profit:  ys.reduce((s,y)=>s+y.profit,0),
    realProfit:ys.reduce((s,y)=>s+y.realProfit,0),
  };
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
        <KPICard label="5-Year Income"       value={tot.income}     color={C.teal}/>
        <KPICard label="5-Year Op. Expenses" value={tot.expenses}   color={C.orange}/>
        <KPICard label="5-Year Purchases"    value={tot.otherExp}   color={C.red}/>
        <KPICard label="5-Year Real Profit"  value={tot.realProfit} color={tot.realProfit>=0?C.green:C.red}/>
      </div>
      <Card style={{padding:22,marginBottom:14}}>
        <SLabel style={{marginBottom:16}}>Year-by-Year Performance</SLabel>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={ys}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.subtle}/>
            <XAxis dataKey="year" tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}
              tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
            <Tooltip {...TT}/>
            <Bar dataKey="income"   fill={C.teal}   radius={[3,3,0,0]} name="Income"   barSize={12}/>
            <Bar dataKey="expenses" fill={C.orange}  radius={[3,3,0,0]} name="Expenses" barSize={12}/>
            <Bar dataKey="profit"   fill={C.green}   radius={[3,3,0,0]} name="Profit"   barSize={12}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      {["income","expenses","profit"].map(key=>{
        const col=key==="income"?C.teal:key==="expenses"?C.orange:C.green;
        return(
          <Card key={key} style={{marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"8px 16px",borderBottom:`1px solid ${C.cardB}`,fontSize:10,color:col,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700}}>{key}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>
                  <th style={{padding:"7px 14px",textAlign:"left",color:C.muted,fontSize:9,textTransform:"uppercase"}}>Year</th>
                  {MONTHS.map(m=><th key={m} style={{padding:"7px 7px",textAlign:"right",color:C.muted,fontSize:9,textTransform:"uppercase"}}>{m.slice(0,3)}</th>)}
                  <th style={{padding:"7px 14px",textAlign:"right",color:C.muted,fontSize:9,textTransform:"uppercase"}}>Total</th>
                </tr></thead>
                <tbody>
                  {ys.map(y=>(
                    <tr key={y.year} style={{borderBottom:`1px solid ${C.divider}`}}>
                      <td style={{padding:"7px 14px",color:C.muted,fontWeight:700}}>{y.year}</td>
                      {y.months.map(m=>(
                        <td key={m.month} style={{padding:"7px 7px",textAlign:"right",color:m[key]>0?col:"#1e2d40",fontVariantNumeric:"tabular-nums"}}>
                          {m[key]>0?(m[key]>=1e6?`${(m[key]/1e6).toFixed(2)}M`:m[key].toLocaleString()):"—"}
                        </td>
                      ))}
                      <td style={{padding:"7px 14px",textAlign:"right",color:col,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{y[key]>0?y[key].toLocaleString():"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── OTHER EXPENSES ────────────────────────────────────────────────────────────
function OtherExpenses({year,loc}){
  const C=useTheme();
  const isMobile=useIsMobile();
  const today=new Date();
  const [selM,setSelM]=useState(MONTHS[today.getMonth()]);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editRow,setEditRow]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const [deleting,setDeleting]=useState(false);
  const [msg,setMsg]=useState("");
  const [form,setForm]=useState({day:today.getDate(),description:"",amount:"",category:"Other",notes:""});

  const mi=MONTHS.indexOf(selM);
  const dim=daysInMonth(mi,year);

  async function loadRows(m=selM){
    setLoading(true);
    try{ setRows(await oe.fetch(year,m,loc)); }
    catch(e){ console.error(e); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadRows(selM); },[selM,year]);

  function resetForm(){ setForm({day:today.getDate(),description:"",amount:"",category:"Other",notes:""}); setEditRow(null); setMsg(""); }

  function startEdit(row){ setForm({day:row.day,description:row.description,amount:row.amount,category:row.category||"Other",notes:row.notes||""}); setEditRow(row); window.scrollTo({top:0,behavior:"smooth"}); }

  async function doSave(){
    if(!form.description.trim()){ setMsg("error:Please enter a description."); return; }
    if(!form.amount||nv(form.amount)<=0){ setMsg("error:Please enter a valid amount."); return; }
    setSaving(true); setMsg("");
    try{
      const payload={year,month:selM,day:Number(form.day),location:loc,description:form.description.trim(),amount:nv(form.amount),category:form.category,notes:form.notes.trim()};
      if(editRow) await oe.patch(editRow.id,payload); else await oe.insert(payload);
      setMsg("ok"); resetForm(); await loadRows(selM);
      setTimeout(()=>setMsg(""),2500);
    }catch(e){ setMsg("error:"+e.message); }
    finally{ setSaving(false); }
  }

  async function doDelete(id){
    setDeleting(true);
    try{ await oe.delete(id); setDelConfirm(null); if(editRow?.id===id) resetForm(); await loadRows(selM); }
    catch(e){ alert("Delete failed: "+e.message); }
    finally{ setDeleting(false); }
  }

  const total=rows.reduce((s,r)=>s+nv(r.amount),0);

  return(
    <div>
      <div style={{maxWidth:240,marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Month</div>
        <select value={selM} onChange={e=>setSelM(e.target.value)} style={mkSEL(C)}>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
      </div>

      <div style={{maxWidth:720,marginBottom:28}}>
        <Card style={{padding:26}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:13,color:C.muted}}>
              {editRow?<><span style={{color:C.yellow,fontWeight:600}}>✏ Editing purchase</span></>:<>Record a <strong style={{color:C.text}}>one-off purchase</strong> for {selM} {year}</>}
            </div>
            {editRow&&<button onClick={resetForm} style={{fontSize:11,color:C.muted,background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Cancel</button>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"160px 1fr",gap:10,marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Day</div>
              <select value={form.day} onChange={e=>setForm(f=>({...f,day:Number(e.target.value)}))} style={mkSEL(C)}>
                {Array.from({length:dim},(_,i)=>i+1).map(d=><option key={d} value={d}>{d} {selM}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Category</div>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={mkSEL(C)}>
                {OE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 200px",gap:10,marginBottom:12}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>What did you buy?</div>
              <input type="text" value={form.description} placeholder="e.g. New ethernet cable" style={mkINP(C)}
                onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Amount (SSP)</div>
              <input type="number" value={form.amount} placeholder="0" style={mkINP(C)}
                onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
                onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Notes (optional)</div>
            <input type="text" value={form.notes} placeholder="Any extra details…" style={mkINP(C)}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.cardB}/>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={doSave} disabled={saving}
              style={{flex:1,background:editRow?C.yellow:C.teal,border:"none",borderRadius:8,color:"#09111e",padding:"12px 20px",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {saving?<><Ico d={IC.spin} size={14} color="#09111e"/>Saving…</>:msg==="ok"?<><Ico d={IC.check} size={14} color="#09111e"/>Saved!</>:editRow?"Update Purchase":"Save Purchase"}
            </button>
            <button onClick={resetForm} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:8,color:C.muted,padding:"12px 16px",fontSize:13,cursor:"pointer"}}>Clear</button>
          </div>
          {msg.startsWith("error:")&&<div style={{marginTop:10,padding:"8px 12px",background:"rgba(240,82,82,0.1)",border:"1px solid rgba(240,82,82,0.3)",borderRadius:7,fontSize:11,color:C.red}}>{msg.replace("error:","")}</div>}
        </Card>
      </div>

      <Card style={{overflow:"hidden"}}>
        <div style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <SLabel>{selM} {year} — {rows.length} purchase{rows.length!==1?"s":""} · Total: SSP {total.toLocaleString()}</SLabel>
          <button onClick={()=>loadRows(selM)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"4px 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <Ico d={IC.refresh} size={12} color={C.muted}/>Refresh
          </button>
        </div>
        {loading?<Loading/>:rows.length===0
          ?<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:13}}>No purchases for {selM} {year}. Add one above.</div>
          :<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr>
                {["Day","Description","Category","Amount (SSP)","Notes","Actions"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:h==="Amount (SSP)"?"right":"left",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(row=>{
                  const isEd=editRow?.id===row.id;
                  return(
                    <tr key={row.id} style={{borderBottom:`1px solid ${C.divider}`,background:isEd?"rgba(251,191,36,0.04)":"transparent",transition:"background 0.1s"}}
                      onMouseEnter={e=>{if(!isEd)e.currentTarget.style.background="rgba(255,255,255,0.02)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=isEd?"rgba(251,191,36,0.04)":"transparent";}}>
                      <td style={{padding:"10px 14px",color:C.muted,fontWeight:600}}>{row.day} {selM}</td>
                      <td style={{padding:"10px 14px",color:C.text,fontWeight:500}}>
                        {row.description}{isEd&&<span style={{marginLeft:6,fontSize:9,color:C.yellow,background:"rgba(251,191,36,0.15)",padding:"1px 5px",borderRadius:4}}>editing</span>}
                      </td>
                      <td style={{padding:"10px 14px"}}><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"rgba(59,130,246,0.1)",color:C.blue,fontWeight:500}}>{row.category||"Other"}</span></td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:C.orange,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{nv(row.amount).toLocaleString()}</td>
                      <td style={{padding:"10px 14px",color:C.muted,fontSize:12}}>{row.notes||"—"}</td>
                      <td style={{padding:"10px 14px"}}>
                        <div style={{display:"flex",gap:6}}>
                          <ActionBtn onClick={()=>startEdit(row)} color="59,130,246" icon="edit" label="Edit"/>
                          {canDo(useUser(),"canDelete")&&(
                            delConfirm===row.id
                            ?<div style={{display:"flex",gap:4}}>
                              <ActionBtn onClick={()=>doDelete(row.id)} color="240,82,82" icon="trash" label={deleting?"…":"Confirm"} disabled={deleting}/>
                              <button onClick={()=>setDelConfirm(null)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:11}}>Cancel</button>
                            </div>
                            :<ActionBtn onClick={()=>setDelConfirm(row.id)} color="240,82,82" icon="trash" label="Delete"/>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                <td colSpan={3} style={{padding:"10px 14px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Month Total</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:C.orange,fontWeight:700,fontVariantNumeric:"tabular-nums",fontSize:14}}>{total.toLocaleString()}</td>
                <td colSpan={2}/>
              </tr></tfoot>
            </table>
          </div>
        }
      </Card>
    </div>
  );
}

// ── WEEKLY REPORT ─────────────────────────────────────────────────────────────
function WeeklyReport({year,loc}){
  const C=useTheme(); const TT=useTT();
  const isMobile=useIsMobile();
  const today=new Date();
  const [selM,setSelM]=useState(MONTHS[today.getMonth()]);
  const [selW,setSelW]=useState(1);
  const [rows,setRows]=useState([]);
  const [otherRows,setOtherRows]=useState([]);
  const [loading,setLoading]=useState(false);

  const mi=MONTHS.indexOf(selM);
  const dim=daysInMonth(mi,year);
  const numWeeks=Math.ceil(dim/7);
  const weekStart=(selW-1)*7+1;
  const weekEnd=Math.min(selW*7,dim);
  const weekDays=Array.from({length:weekEnd-weekStart+1},(_,i)=>weekStart+i);

  async function loadReport(m,w){
    setLoading(true);
    const mIdx=MONTHS.indexOf(m);
    const mDim=daysInMonth(mIdx,year);
    const wS=(w-1)*7+1, wE=Math.min(w*7,mDim);
    try{
      const [daily,other]=await Promise.all([
        db.fetchWeek(year,m,wS,wE,loc),
        oe.fetch(year,m,loc),
      ]);
      setRows(daily);
      setOtherRows(other.filter(r=>r.day>=wS&&r.day<=wE));
    }catch(e){ console.error(e); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadReport(selM,selW); },[selM,selW,year]);

  const dayMap={};
  rows.forEach(r=>{ dayMap[r.day]=r; });

  const totIncome  =rows.reduce((s,r)=>s+nv(r.income),0);
  const totInternet=rows.reduce((s,r)=>s+nv(r.internet),0);
  const totPower   =rows.reduce((s,r)=>s+nv(r.power),0);
  const totFeeding =rows.reduce((s,r)=>s+nv(r.feeding),0);
  const totWages   =rows.reduce((s,r)=>s+nv(r.wages),0);
  const totOpExp   =totInternet+totPower+totFeeding+totWages;
  const totOther   =otherRows.reduce((s,r)=>s+nv(r.amount),0);
  const totAllExp  =totOpExp+totOther;
  const netProfit  =totIncome-totAllExp;
  const margin     =pctN(totIncome,totAllExp);

  function downloadPDF(){
    const w=window.open("","_blank");
    w.document.write(buildPrintHTML({year,month:selM,week:selW,weekStart,weekEnd,weekDays,dayMap,rows,totIncome,totInternet,totPower,totFeeding,totWages,totOpExp,totOther,otherRows,totAllExp,netProfit,margin}));
    w.document.close();
    w.focus();
    setTimeout(()=>{ w.print(); w.close(); },400);
  }

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{minWidth:180}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Month</div>
          <select value={selM} onChange={e=>{setSelM(e.target.value);setSelW(1);}} style={mkSEL(C)}>
            {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{minWidth:200}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Week</div>
          <select value={selW} onChange={e=>setSelW(Number(e.target.value))} style={mkSEL(C)}>
            {Array.from({length:numWeeks},(_,i)=>i+1).map(w=>{
              const ws=(w-1)*7+1, we=Math.min(w*7,dim);
              return <option key={w} value={w}>Week {w} (Day {ws}–{we})</option>;
            })}
          </select>
        </div>
        <button onClick={()=>loadReport(selM,selW)} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.cardB}`,borderRadius:8,color:C.muted,padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
          <Ico d={IC.refresh} size={15} color={C.muted}/>Refresh
        </button>
        <button onClick={downloadPDF} style={{background:C.teal,border:"none",borderRadius:8,color:"#09111e",padding:"11px 20px",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
          <Ico d={IC.download} size={15} color="#09111e"/>Download PDF
        </button>
      </div>

      {loading?<Loading/>:(
        <div>
          <Card style={{padding:"18px 22px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:C.text}}>Weekly Report — Week {selW}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>{selM} {year} · Days {weekStart}–{weekEnd} · Hotzonex WiFi</div>
              </div>
              <div style={{fontSize:11,color:C.muted}}>{new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
            </div>
          </Card>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12,marginBottom:16}}>
            <KPICard label="Week Income"    value={totIncome}  color={C.teal}/>
            <KPICard label="Total Expenses" value={totAllExp}  color={C.red}/>
            <KPICard label="Net Profit"     value={netProfit}  color={netProfit>=0?C.green:C.red}/>
            <KPICard label="Profit Margin"  value={margin+"%"} color={C.teal} suffix="%"/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:16}}>
            <Card style={{padding:20}}>
              <SLabel style={{marginBottom:14}}>Operating Expense Breakdown</SLabel>
              {[["Internet",totInternet,C.blue],["Power / Fuel",totPower,C.orange],["Feeding",totFeeding,C.green],["Wages",totWages,C.teal]].map(([label,val,col])=>(
                <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.divider}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:2,background:col}}/>
                    <span style={{color:C.muted,fontSize:13}}>{label}</span>
                  </div>
                  <span style={{color:val>0?col:C.muted,fontWeight:val>0?700:400,fontSize:13,fontVariantNumeric:"tabular-nums"}}>{val>0?`SSP ${val.toLocaleString()}`:"—"}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:4}}>
                <span style={{color:C.text,fontWeight:700,fontSize:13}}>Operating Total</span>
                <span style={{color:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums",fontSize:13}}>SSP {totOpExp.toLocaleString()}</span>
              </div>
            </Card>
            <Card style={{padding:20}}>
              <SLabel style={{marginBottom:14}}>One-Off Purchases This Week</SLabel>
              {otherRows.length===0
                ?<div style={{color:C.muted,fontSize:13,marginTop:16}}>No purchases this week.</div>
                :<>
                  {otherRows.map(r=>(
                    <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:`1px solid ${C.divider}`}}>
                      <div>
                        <div style={{color:C.text,fontSize:13}}>{r.description}</div>
                        <div style={{color:C.muted,fontSize:10,marginTop:2}}>{r.category} · Day {r.day}</div>
                      </div>
                      <span style={{color:C.orange,fontWeight:700,fontSize:13,fontVariantNumeric:"tabular-nums",flexShrink:0,marginLeft:12}}>SSP {nv(r.amount).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:4}}>
                    <span style={{color:C.text,fontWeight:700,fontSize:13}}>Purchases Total</span>
                    <span style={{color:C.orange,fontWeight:700,fontVariantNumeric:"tabular-nums",fontSize:13}}>SSP {totOther.toLocaleString()}</span>
                  </div>
                </>
              }
            </Card>
          </div>

          <Card style={{overflow:"hidden"}}>
            <div style={{padding:"10px 18px"}}><SLabel>Daily Breakdown — Days {weekStart} to {weekEnd}</SLabel></div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr>
                  {["Day","Income","Internet","Power/Fuel","Feeding","Wages","Op. Expenses","Net Profit"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:h==="Day"?"left":"right",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {weekDays.map(d=>{
                    const r=dayMap[d]||{};
                    const inc=nv(r.income);
                    const opExp=[r.internet,r.power,r.feeding,r.wages].reduce((s,v)=>s+nv(v),0);
                    const profit=inc-opExp;
                    const hasData=inc>0||opExp>0;
                    return(
                      <tr key={d} style={{borderBottom:`1px solid ${C.divider}`,opacity:hasData?1:0.4}}>
                        <td style={{padding:"9px 14px",color:C.muted,fontWeight:600}}>{d} {selM.slice(0,3)}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:inc>0?C.teal:C.muted,fontWeight:inc>0?600:400,fontVariantNumeric:"tabular-nums"}}>{inc>0?inc.toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{nv(r.internet)>0?nv(r.internet).toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{nv(r.power)>0?nv(r.power).toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{nv(r.feeding)>0?nv(r.feeding).toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{nv(r.wages)>0?nv(r.wages).toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",color:opExp>0?C.orange:C.muted,fontVariantNumeric:"tabular-nums"}}>{opExp>0?opExp.toLocaleString():"—"}</td>
                        <td style={{padding:"9px 14px",textAlign:"right",fontWeight:hasData?700:400,fontVariantNumeric:"tabular-nums",color:!hasData?C.muted:profit>=0?C.green:C.red}}>{hasData?(profit>=0?"+":"")+profit.toLocaleString():"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                  <td style={{padding:"9px 14px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Week Total</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.teal,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{totIncome.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{totInternet.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{totPower.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{totFeeding.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{totWages.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:C.orange,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{totOpExp.toLocaleString()}</td>
                  <td style={{padding:"9px 14px",textAlign:"right",color:netProfit>=0?C.green:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{netProfit>=0?"+":""}{netProfit.toLocaleString()}</td>
                </tr></tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── PDF HTML ──────────────────────────────────────────────────────────────────
function buildPrintHTML(d){
  const f=n=>nv(n).toLocaleString();
  const dayRows=d.weekDays.map(day=>{
    const r=d.dayMap[day]||{};
    const inc=nv(r.income), opExp=[r.internet,r.power,r.feeding,r.wages].reduce((s,v)=>s+nv(v),0), profit=inc-opExp, hasData=inc>0||opExp>0;
    return `<tr style="opacity:${hasData?1:0.4}">
      <td>${day} ${d.month.slice(0,3)}</td>
      <td class="r teal">${inc>0?f(inc):"—"}</td>
      <td class="r">${nv(r.internet)>0?f(r.internet):"—"}</td>
      <td class="r">${nv(r.power)>0?f(r.power):"—"}</td>
      <td class="r">${nv(r.feeding)>0?f(r.feeding):"—"}</td>
      <td class="r">${nv(r.wages)>0?f(r.wages):"—"}</td>
      <td class="r orange">${opExp>0?f(opExp):"—"}</td>
      <td class="r ${profit>=0?"green":"red"}">${hasData?(profit>=0?"+":"")+f(profit):"—"}</td>
    </tr>`;
  }).join("");
  const otherRows=d.otherRows.map(r=>`<div class="exp-row"><span>${r.description} <span style="color:#94a3b8;font-size:10px">(${r.category})</span></span><span class="orange">${f(r.amount)} SSP</span></div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Weekly Report — Week ${d.week} ${d.month} ${d.year}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;padding:24px 32px;font-size:12px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #00e5c3;}
.logo{font-size:20px;font-weight:800;}.logo span{color:#00b8a0;}.subtitle{font-size:11px;color:#64748b;margin-top:3px;}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;}
.kpi{border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;background:#f8fafc;}
.kpi-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
.kpi-value{font-size:22px;font-weight:700;}.kpi-suffix{font-size:10px;color:#64748b;margin-top:3px;}
.teal{color:#00b8a0;}.red{color:#dc2626;}.green{color:#16a34a;}.orange{color:#ea580c;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;}
.box{border:1px solid #e2e8f0;border-radius:8px;padding:14px;}
.section-title{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:700;margin-bottom:10px;}
.exp-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px;}
.exp-total{display:flex;justify-content:space-between;padding:8px 0 0;font-weight:700;font-size:12px;}
table{width:100%;border-collapse:collapse;margin-bottom:18px;}th{background:#f1f5f9;padding:7px 10px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700;}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;}.r{text-align:right;}
tfoot td{font-weight:700;border-top:2px solid #cbd5e1;border-bottom:none;background:#f8fafc;}
.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;}
@media print{body{padding:12px 16px;}@page{margin:1cm;size:A4;}}</style></head><body>
<div class="header"><div><div class="logo">HOTZONEX <span>WiFi</span></div><div class="subtitle">Automated Tracker — Weekly Report</div></div>
<div style="text-align:right;"><div style="font-size:16px;font-weight:700;">Week ${d.week} — ${d.month} ${d.year}</div><div class="subtitle">Days ${d.weekStart}–${d.weekEnd} · ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div></div></div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Week Income</div><div class="kpi-value teal">${f(d.totIncome)}</div><div class="kpi-suffix">SSP</div></div>
  <div class="kpi"><div class="kpi-label">Total Expenses</div><div class="kpi-value red">${f(d.totAllExp)}</div><div class="kpi-suffix">SSP</div></div>
  <div class="kpi"><div class="kpi-label">Net Profit</div><div class="kpi-value ${d.netProfit>=0?"green":"red"}">${(d.netProfit>=0?"+":"")+f(d.netProfit)}</div><div class="kpi-suffix">SSP</div></div>
  <div class="kpi"><div class="kpi-label">Profit Margin</div><div class="kpi-value teal">${d.margin}%</div><div class="kpi-suffix">of income kept as profit</div></div>
</div>
<div class="two-col">
  <div class="box"><div class="section-title">Operating Expense Breakdown</div>
    <div class="exp-row"><span>Internet</span><span class="teal">${f(d.totInternet)} SSP</span></div>
    <div class="exp-row"><span>Power / Fuel</span><span class="orange">${f(d.totPower)} SSP</span></div>
    <div class="exp-row"><span>Feeding</span><span class="green">${f(d.totFeeding)} SSP</span></div>
    <div class="exp-row"><span>Wages</span><span style="color:#6366f1">${f(d.totWages)} SSP</span></div>
    <div class="exp-total"><span>Operating Total</span><span class="red">${f(d.totOpExp)} SSP</span></div>
  </div>
  <div class="box"><div class="section-title">One-Off Purchases This Week</div>
    ${d.otherRows.length===0?'<p style="color:#94a3b8;font-size:12px;margin-top:10px;">No purchases recorded.</p>':otherRows+`<div class="exp-total"><span>Purchases Total</span><span class="orange">${f(d.totOther)} SSP</span></div>`}
  </div>
</div>
<div class="section-title">Daily Breakdown</div>
<table><thead><tr><th>Day</th><th class="r">Income</th><th class="r">Internet</th><th class="r">Power/Fuel</th><th class="r">Feeding</th><th class="r">Wages</th><th class="r">Op. Expenses</th><th class="r">Net Profit</th></tr></thead>
<tbody>${dayRows}</tbody>
<tfoot><tr><td>Week Total</td><td class="r teal">${f(d.totIncome)}</td><td class="r">${f(d.totInternet)}</td><td class="r">${f(d.totPower)}</td><td class="r">${f(d.totFeeding)}</td><td class="r">${f(d.totWages)}</td><td class="r orange">${f(d.totOpExp)}</td><td class="r ${d.netProfit>=0?"green":"red"}">${(d.netProfit>=0?"+":"")+f(d.netProfit)}</td></tr></tfoot></table>
<div class="footer">Hotzonex WiFi Automated Tracker · ${d.month} ${d.year} Week ${d.week} · Confidential</div>
</body></html>`;
}

// ── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin, isDark, setIsDark}){
  const C = isDark ? DARK : LIGHT;
  const isMobile = useIsMobile();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function doLogin(e){
    e.preventDefault();
    if(!email.trim()){ setError("Please enter your email."); return; }
    if(!password.trim()){ setError("Please enter your password."); return; }
    setLoading(true); setError("");
    try{
      const rows = await auth.login(email.trim().toLowerCase(), password);
      if(!rows||rows.length===0){ setError("Invalid email or password. Please try again."); return; }
      const user = rows[0];
      saveSession(user);
      onLogin(user);
    }catch(e){ setError("Connection error. Please check your internet and try again."); }
    finally{ setLoading(false); }
  }

  return(
    <ThemeCtx.Provider value={C}>
    <div style={{minHeight:"100vh",background:C.pageBg,fontFamily:"'Inter',system-ui,sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>

      {/* Theme toggle top-right */}
      <button onClick={()=>setIsDark(d=>!d)}
        style={{position:"fixed",top:16,right:16,width:34,height:34,borderRadius:"50%",
          background:isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)",
          border:`1px solid ${C.cardB}`,cursor:"pointer",display:"flex",alignItems:"center",
          justifyContent:"center"}}>
        {isDark
          ?<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          :<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        }
      </button>

      <div style={{width:"100%",maxWidth:isMobile?"100%":420}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#003d35,#00594f)",
            border:`1px solid ${C.teal}44`,display:"flex",alignItems:"center",
            justifyContent:"center",margin:"0 auto 16px"}}>
            <Ico d={IC.wifi} size={26} color={C.teal}/>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>
            HOTZONEX <span style={{color:C.teal}}>WiFi</span>
          </div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.12em",marginTop:4}}>
            Automated Business Tracker
          </div>
        </div>

        {/* Card */}
        <div style={{background:C.card,padding:isMobile?"20px 16px 18px":"32px 32px 28px",boxShadow:isDark?"0 20px 60px rgba(0,0,0,0.5)":"0 8px 32px rgba(0,0,0,0.1)"}}>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Sign in</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:24}}>Enter your credentials to access your dashboard</div>

          <form onSubmit={doLogin}>
            {/* Email */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>Email Address</label>
              <input type="email" value={email} autoFocus
                placeholder="you@hotzonex.com"
                onChange={e=>{ setEmail(e.target.value); setError(""); }}
                style={{...mkINP(C),fontSize:14}}
                onFocus={e=>e.target.style.borderColor=C.teal}
                onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>

            {/* Password */}
            <div style={{marginBottom:24}}>
              <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>Password</label>
              <div style={{position:"relative"}}>
                <input type={showPw?"text":"password"} value={password}
                  placeholder="Enter your password"
                  onChange={e=>{ setPassword(e.target.value); setError(""); }}
                  style={{...mkINP(C),fontSize:14,paddingRight:44}}
                  onFocus={e=>e.target.style.borderColor=C.teal}
                  onBlur={e=>e.target.style.borderColor=C.cardB}/>
                <button type="button" onClick={()=>setShowPw(p=>!p)}
                  style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                    background:"transparent",border:"none",cursor:"pointer",color:C.muted,padding:2}}>
                  {showPw
                    ?<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                    :<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error&&(
              <div style={{marginBottom:16,padding:"10px 14px",background:`rgba(240,82,82,0.1)`,
                border:`1px solid rgba(240,82,82,0.3)`,borderRadius:8,fontSize:12,color:C.red,
                display:"flex",alignItems:"center",gap:8}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{width:"100%",background:C.teal,border:"none",borderRadius:8,
                color:"#09111e",padding:"13px 20px",fontWeight:700,fontSize:14,
                cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                transition:"opacity 0.15s"}}>
              {loading
                ?<><div style={{width:16,height:16,border:"2px solid #09111e44",borderTop:"2px solid #09111e",borderRadius:"50%",animation:"_spin 0.8s linear infinite"}}/> Signing in…</>
                :"Sign In"
              }
            </button>
          </form>
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:C.muted}}>
          Hotzonex WiFi Tracker · Secure Access
        </div>
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}

// ── USER MANAGEMENT (admin only) ──────────────────────────────────────────────
function UserManagement({currentUser}){
  const C=useTheme();
  const isMobile=useIsMobile();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [delConfirm,setDelConfirm] = useState(null);
  const [editUser,  setEditUser]   = useState(null);
  const [msg,     setMsg]     = useState("");
  const [showForm,setShowForm]= useState(false);
  const blank = {name:"",email:"",password:"",role:"staff",location:"HQ",active:true};
  const [form,setForm] = useState(blank);

  async function loadUsers(){
    setLoading(true);
    try{ setUsers(await auth.getAll()); }
    catch(e){ console.error(e); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadUsers(); },[]);

  function startAdd(){ setForm(blank); setEditUser(null); setShowForm(true); setMsg(""); }
  function startEdit(u){ setForm({name:u.name,email:u.email,password:u.password,role:u.role,location:u.location,active:u.active}); setEditUser(u); setShowForm(true); setMsg(""); }
  function cancelForm(){ setShowForm(false); setEditUser(null); setMsg(""); }

  async function doSave(){
    if(!form.name.trim()){ setMsg("error:Name is required."); return; }
    if(!form.email.trim()){ setMsg("error:Email is required."); return; }
    if(!form.password.trim()){ setMsg("error:Password is required."); return; }
    setSaving(true); setMsg("");
    try{
      if(editUser){
        // On update: only send email if it actually changed to avoid unique constraint error
        const payload={name:form.name.trim(),password:form.password,
          role:form.role,location:form.location,active:form.active};
        const newEmail=form.email.trim().toLowerCase();
        if(newEmail!==editUser.email) payload.email=newEmail;
        await auth.update(editUser.id,payload);
      } else {
        const payload={name:form.name.trim(),email:form.email.trim().toLowerCase(),
          password:form.password,role:form.role,location:form.location,active:form.active};
        await auth.create(payload);
      }
      setMsg("ok"); setShowForm(false); setEditUser(null);
      await loadUsers();
      setTimeout(()=>setMsg(""),2500);
    }catch(e){ setMsg("error:"+e.message); }
    finally{ setSaving(false); }
  }

  async function doDelete(id){
    try{ await auth.delete(id); setDelConfirm(null); await loadUsers(); }
    catch(e){ alert("Delete failed: "+e.message); }
  }

  async function toggleActive(u){
    try{ await auth.update(u.id,{active:!u.active}); await loadUsers(); }
    catch(e){ alert("Failed: "+e.message); }
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <SLabel>Team Members ({users.length})</SLabel>
        <button onClick={startAdd}
          style={{background:C.teal,border:"none",borderRadius:7,color:"#09111e",
            padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14m-7-7h14"/></svg>
          Add User
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm&&(
        <div style={{background:C.card,padding:24,marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:18}}>
            {editUser?"Edit User":"Add New User"}
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
            {[["Full Name","name","text",C.teal],["Email","email","email",C.teal],
              ["Password","password","text",C.orange]].map(([label,key,type,col])=>(
              <div key={key}>
                <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
                <input type={type} value={form[key]} placeholder={label}
                  onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                  style={mkINP(C)}
                  onFocus={e=>e.target.style.borderColor=col}
                  onBlur={e=>e.target.style.borderColor=C.cardB}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em"}}>Role</div>
              <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={mkSEL(C)}>
                {Object.entries(ROLES).map(([id,r])=><option key={id} value={id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em"}}>Assigned Location</div>
              <select value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={mkSEL(C)}>
                {LOCATIONS.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:C.muted}}>
              <input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))}
                style={{width:15,height:15,accentColor:C.teal,cursor:"pointer"}}/>
              Active account
            </label>
          </div>
          {msg.startsWith("error:")&&(
            <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(240,82,82,0.1)",border:"1px solid rgba(240,82,82,0.3)",borderRadius:7,fontSize:11,color:C.red}}>
              {msg.replace("error:","")}
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <button onClick={doSave} disabled={saving}
              style={{background:C.teal,border:"none",borderRadius:7,color:"#09111e",
                padding:"9px 18px",fontWeight:700,fontSize:12,cursor:saving?"not-allowed":"pointer",
                opacity:saving?0.7:1,display:"flex",alignItems:"center",gap:6}}>
              {saving?"Saving…":editUser?"Update User":"Create User"}
            </button>
            <button onClick={cancelForm}
              style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:7,
                color:C.muted,padding:"9px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
      {msg==="ok"&&<div style={{marginBottom:12,padding:"8px 12px",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:7,fontSize:11,color:C.green}}>✓ Saved successfully</div>}

      {/* Users table */}
      {loading?<Loading/>:(
        <div style={{background:C.card,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>
              {["Name","Email","Role","Location","Status","Actions"].map(h=>(
                <th key={h} style={{padding:"10px 14px",textAlign:"left",color:C.muted,
                  fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",
                  borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {users.map(u=>{
                const roleCfg=ROLES[u.role]||ROLES.viewer;
                const isSelf=u.id===currentUser.id;
                return(
                  <tr key={u.id} style={{borderBottom:`1px solid ${C.divider}`}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"10px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:30,height:30,borderRadius:"50%",background:roleCfg.color,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:12,fontWeight:700,color:"#09111e",flexShrink:0}}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{color:C.text,fontWeight:600}}>{u.name}</div>
                          {isSelf&&<div style={{fontSize:10,color:C.teal}}>You</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"10px 14px",color:C.muted,fontSize:12}}>{u.email}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,
                        background:`rgba(${hexToRgb(roleCfg.color)},0.12)`,color:roleCfg.color}}>
                        {roleCfg.label}
                      </span>
                    </td>
                    <td style={{padding:"10px 14px",color:C.muted,fontSize:12}}>
                      {LOC_MAP[u.location]?.label||u.location}
                    </td>
                    <td style={{padding:"10px 14px"}}>
                      <button onClick={()=>!isSelf&&toggleActive(u)}
                        disabled={isSelf}
                        style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,cursor:isSelf?"default":"pointer",
                          background:u.active?"rgba(16,185,129,0.12)":"rgba(100,116,139,0.12)",
                          color:u.active?C.green:C.muted,border:"none"}}>
                        {u.active?"● Active":"○ Inactive"}
                      </button>
                    </td>
                    <td style={{padding:"10px 14px"}}>
                      <div style={{display:"flex",gap:6}}>
                        <ActionBtn onClick={()=>startEdit(u)} color="59,130,246" icon="edit" label="Edit"/>
                        {!isSelf&&(
                          delConfirm===u.id
                            ?<div style={{display:"flex",gap:4}}>
                              <ActionBtn onClick={()=>doDelete(u.id)} color="240,82,82" icon="trash" label="Confirm"/>
                              <button onClick={()=>setDelConfirm(null)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:11}}>Cancel</button>
                            </div>
                            :<ActionBtn onClick={()=>setDelConfirm(u.id)} color="240,82,82" icon="trash" label="Delete"/>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ROOT APP ──────────────────────────────────────────────────────────────────

// ── USD SAVINGS ───────────────────────────────────────────────────────────────
function USDSavings({year,loc}){
  const C=useTheme();
  const isMobile=useIsMobile();
  const today=new Date();
  const [selM,setSelM]=useState(MONTHS[today.getMonth()]);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editRow,setEditRow]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const [deleting,setDeleting]=useState(false);
  const [msg,setMsg]=useState("");
  // Form: user enters SSP + rate → USD auto-calculated
  const [form,setForm]=useState({day:today.getDate(),ssp_amount:"",rate:"",notes:""});
  // Derived: USD = SSP / rate (live, not stored separately until save)
  const calcUSD = (ssp,rate) => (nv(ssp)>0&&nv(rate)>0) ? (nv(ssp)/nv(rate)) : 0;
  const previewUSD = calcUSD(form.ssp_amount, form.rate);

  const mi=MONTHS.indexOf(selM);
  const dim=daysInMonth(mi,year);

  async function loadRows(m=selM){
    setLoading(true);
    try{ setRows(await usd.fetchMonth(year,m,loc)); }
    catch(e){ console.error(e); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ loadRows(selM); },[selM,year,loc]);

  function resetForm(){ setForm({day:today.getDate(),ssp_amount:"",rate:"",notes:""}); setEditRow(null); setMsg(""); }
  function startEdit(row){
    setForm({day:row.day,ssp_amount:row.ssp_amount,rate:row.rate,notes:row.notes||""});
    setEditRow(row); window.scrollTo({top:0,behavior:"smooth"});
  }

  async function doSave(){
    if(!form.ssp_amount||nv(form.ssp_amount)<=0){ setMsg("error:Enter the SSP amount you are exchanging."); return; }
    if(!form.rate||nv(form.rate)<=0){ setMsg("error:Enter today's exchange rate (how many SSP = 1 USD)."); return; }
    const usdAmt = parseFloat((nv(form.ssp_amount)/nv(form.rate)).toFixed(2));
    setSaving(true); setMsg("");
    try{
      const payload={year,month:selM,day:Number(form.day),location:loc,
        ssp_amount:nv(form.ssp_amount),usd_amount:usdAmt,rate:nv(form.rate),notes:form.notes.trim()};
      if(editRow) await usd.patch(editRow.id,payload); else await usd.insert(payload);
      setMsg("ok"); resetForm(); await loadRows(selM);
      setTimeout(()=>setMsg(""),2500);
    }catch(e){ setMsg("error:"+e.message); }
    finally{ setSaving(false); }
  }

  async function doDelete(id){
    setDeleting(true);
    try{ await usd.delete(id); setDelConfirm(null); if(editRow?.id===id) resetForm(); await loadRows(selM); }
    catch(e){ alert("Delete failed: "+e.message); }
    finally{ setDeleting(false); }
  }

  const totUSD=rows.reduce((s,r)=>s+nv(r.usd_amount),0);
  const totSSP=rows.reduce((s,r)=>s+nv(r.ssp_amount),0);
  const avgRate=totUSD>0?(totSSP/totUSD).toFixed(0):0;

  return(
    <div>
      <div style={{maxWidth:240,marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Month</div>
        <select value={selM} onChange={e=>setSelM(e.target.value)} style={mkSEL(C)}>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:10,marginBottom:16}}>
        <KPICard label="Total USD Saved"   value={"$"+totUSD.toLocaleString()} color={C.green} suffix="USD"/>
        <KPICard label="Total SSP Spent"   value={totSSP}  color={C.red}   suffix="SSP"/>
        <KPICard label="Avg Exchange Rate" value={avgRate>0?`1 USD = ${Number(avgRate).toLocaleString()} SSP`:"—"} color={C.yellow} suffix="this month"/>
      </div>

      <div style={{maxWidth:720,marginBottom:28}}>
        <Card style={{padding:26}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:13,color:C.muted}}>
              {editRow?<><span style={{color:C.yellow,fontWeight:700}}>✏ Editing exchange</span></>
                :<>Record a <strong style={{color:C.text}}>USD exchange & saving</strong> — {selM} {year}</>}
            </div>
            {editRow&&<button onClick={resetForm} style={{fontSize:11,color:C.muted,background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Cancel</button>}
          </div>

          {/* Row 1: Day + SSP + Rate */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"140px 1fr 1fr",gap:10,marginBottom:14}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Day</div>
              <select value={form.day} onChange={e=>setForm(f=>({...f,day:Number(e.target.value)}))} style={mkSEL(C)}>
                {Array.from({length:dim},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>SSP Amount to Exchange</div>
              <input type="number" value={form.ssp_amount} placeholder="e.g. 1,300,000" style={mkINP(C)}
                onChange={e=>setForm(f=>({...f,ssp_amount:e.target.value}))}
                onFocus={e=>e.target.style.borderColor=C.red} onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Today's Rate <span style={{color:C.muted,fontWeight:400}}>(SSP per $1 USD)</span>
              </div>
              <input type="number" value={form.rate} placeholder="e.g. 1300" style={mkINP(C)}
                onChange={e=>setForm(f=>({...f,rate:e.target.value}))}
                onFocus={e=>e.target.style.borderColor=C.yellow} onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>
          </div>

          {/* Live auto-calculation result */}
          <div style={{background:C.inputBg,padding:"16px 20px",marginBottom:16}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>
              Calculated Result
            </div>
            <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>YOU EXCHANGE</div>
                <div style={{color:C.red,fontWeight:700,fontSize:22,fontVariantNumeric:"tabular-nums"}}>
                  {nv(form.ssp_amount)>0?`SSP ${nv(form.ssp_amount).toLocaleString()}`:<span style={{color:"#334155"}}>SSP —</span>}
                </div>
              </div>
              <div style={{color:C.muted,fontSize:24,alignSelf:"center"}}>→</div>
              <div>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>YOU RECEIVE</div>
                <div style={{color:previewUSD>0?C.green:"#334155",fontWeight:700,fontSize:28,fontVariantNumeric:"tabular-nums"}}>
                  {previewUSD>0?`$${previewUSD.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:"$—"}
                </div>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>RATE USED</div>
                <div style={{color:nv(form.rate)>0?C.yellow:"#334155",fontWeight:600,fontSize:14}}>
                  {nv(form.rate)>0?`$1 = SSP ${nv(form.rate).toLocaleString()}`:"Enter rate above"}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Notes (optional — e.g. bank name)</div>
            <input type="text" value={form.notes} placeholder="e.g. KCB Bank, Jebel Iraq branch" style={mkINP(C)}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.cardB}/>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={doSave} disabled={saving}
              style={{flex:1,background:editRow?C.yellow:C.teal,border:"none",borderRadius:8,color:"#09111e",padding:"12px 20px",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {saving?<><Ico d={IC.spin} size={14} color="#09111e"/>Saving…</>:msg==="ok"?<><Ico d={IC.check} size={14} color="#09111e"/>Saved!</>:editRow?"Update Exchange":"Save Exchange"}
            </button>
            <button onClick={resetForm} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:8,color:C.muted,padding:"12px 16px",fontSize:13,cursor:"pointer"}}>Clear</button>
          </div>
          {msg.startsWith("error:")&&<div style={{marginTop:10,padding:"8px 12px",background:"rgba(240,82,82,0.1)",border:"1px solid rgba(240,82,82,0.3)",borderRadius:7,fontSize:11,color:C.red}}>{msg.replace("error:","")}</div>}
        </Card>
      </div>

      {/* Table */}
      <Card style={{overflow:"hidden"}}>
        <div style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <SLabel>{selM} {year} — {rows.length} exchange{rows.length!==1?"s":""} · $USD {totUSD.toLocaleString()} saved</SLabel>
          <button onClick={()=>loadRows(selM)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"4px 10px",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <Ico d={IC.refresh} size={12} color={C.muted}/>Refresh
          </button>
        </div>
        {loading?<Loading/>:rows.length===0
          ?<div style={{padding:30,textAlign:"center",color:C.muted,fontSize:13}}>No exchanges recorded for {selM} {year}.</div>
          :<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr>
                {["Day","SSP Exchanged","USD Received","Rate (SSP/$1)","Notes","Actions"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:["Day","Notes","Actions"].includes(h)?"left":"right",color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(row=>{
                  const isEd=editRow?.id===row.id;
                  return(
                    <tr key={row.id} style={{borderBottom:`1px solid ${C.divider}`,background:isEd?"rgba(251,191,36,0.04)":"transparent",transition:"background 0.1s"}}
                      onMouseEnter={e=>{if(!isEd)e.currentTarget.style.background="rgba(255,255,255,0.02)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=isEd?"rgba(251,191,36,0.04)":"transparent";}}>
                      <td style={{padding:"9px 14px",color:C.muted,fontWeight:600}}>{row.day} {selM}</td>
                      <td style={{padding:"9px 14px",textAlign:"right",color:C.red,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{nv(row.ssp_amount).toLocaleString()}</td>
                      <td style={{padding:"9px 14px",textAlign:"right",color:C.green,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>${nv(row.usd_amount).toLocaleString()}</td>
                      <td style={{padding:"9px 14px",textAlign:"right",color:C.yellow,fontVariantNumeric:"tabular-nums"}}>{nv(row.rate)>0?nv(row.rate).toLocaleString():"—"}</td>
                      <td style={{padding:"9px 14px",color:C.muted,fontSize:12}}>{row.notes||"—"}{isEd&&<span style={{marginLeft:6,fontSize:9,color:C.yellow,background:"rgba(251,191,36,0.15)",padding:"1px 5px",borderRadius:4}}>editing</span>}</td>
                      <td style={{padding:"9px 14px"}}>
                        <div style={{display:"flex",gap:6}}>
                          <ActionBtn onClick={()=>startEdit(row)} color="59,130,246" icon="edit" label="Edit"/>
                          {canDo(useUser(),"canDelete")&&(
                            delConfirm===row.id
                            ?<div style={{display:"flex",gap:4}}>
                              <ActionBtn onClick={()=>doDelete(row.id)} color="240,82,82" icon="trash" label={deleting?"…":"Confirm"} disabled={deleting}/>
                              <button onClick={()=>setDelConfirm(null)} style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:6,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:11}}>Cancel</button>
                            </div>
                            :<ActionBtn onClick={()=>setDelConfirm(row.id)} color="240,82,82" icon="trash" label="Delete"/>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                <td style={{padding:"9px 14px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Total</td>
                <td style={{padding:"9px 14px",textAlign:"right",color:C.red,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{totSSP.toLocaleString()}</td>
                <td style={{padding:"9px 14px",textAlign:"right",color:C.green,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>${totUSD.toLocaleString()}</td>
                <td style={{padding:"9px 14px",textAlign:"right",color:C.yellow,fontSize:12}}>{avgRate>0?`avg ${Number(avgRate).toLocaleString()}`:"—"}</td>
                <td colSpan={2}/>
              </tr></tfoot>
            </table>
          </div>
        }
      </Card>
    </div>
  );
}

// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App(){
  const [isDark,   setIsDark]   = useState(true);
  const [user,     setUser]     = useState(()=>loadSession());
  const C = isDark ? DARK : LIGHT;

  // If not logged in, show login screen
  if(!user) return <LoginScreen onLogin={u=>setUser(u)} isDark={isDark} setIsDark={setIsDark}/>;
  return <MainApp user={user} onLogout={()=>{ clearSession(); setUser(null); }} isDark={isDark} setIsDark={setIsDark}/>;
}

function MainApp({user, onLogout, isDark, setIsDark}){
  const [year,     setYear]     = useState(new Date().getFullYear());
  const [loc,      setLoc]      = useState(
    // staff locked to their location; others start at HQ
    canDo(user,"canViewAll") ? "HQ" : user.location
  );
  const [view,     setView]     = useState("dashboard");
  const [yearOpen, setYearOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState("connecting");
  const [globalReload, setGlobalReload] = useState(0);
  const C = isDark ? DARK : LIGHT;
  const roleCfg = ROLES[user.role] || ROLES.viewer;

  useEffect(()=>{
    db.fetchYear(new Date().getFullYear(), loc)
      .then(()=>setDbStatus("live"))
      .catch(()=>setDbStatus("error"));
  },[]);

  function onSaved(){ setGlobalReload(n=>n+1); setDbStatus("live"); }
  const locCfg = LOC_MAP[loc];

  // Nav items filtered by role
  const ALL_NAV=[
    {id:"dashboard", label:"Dashboard",      icon:"dashboard", roles:["admin","manager","staff","viewer"]},
    {id:"entry",     label:"Daily Entry",    icon:"entry",     roles:["admin","manager","staff"]},
    {id:"monthly",   label:"Monthly",        icon:"monthly",   roles:["admin","manager","staff","viewer"]},
    {id:"annual",    label:"Annual",         icon:"annual",    roles:["admin","manager","viewer"]},
    {id:"history",   label:"History",        icon:"history",   roles:["admin","manager","viewer"]},
    {id:"purchases", label:"Other Expenses", icon:"purchase",  roles:["admin","manager"]},
    {id:"savings",   label:"USD Savings",    icon:"download",  roles:["admin","manager"]},
    {id:"report",    label:"Weekly Report",  icon:"report",    roles:["admin","manager","viewer"]},
    {id:"users",     label:"Manage Users",   icon:"dashboard", roles:["admin"]},
  ];
  const NAV_ITEMS = ALL_NAV.filter(n=>n.roles.includes(user.role));
  // If current view no longer allowed, redirect to dashboard
  useEffect(()=>{
    if(!NAV_ITEMS.find(n=>n.id===view)) setView("dashboard");
  },[user.role]);

  const TITLES_MAP={dashboard:"Business overview",entry:"Daily Entry",monthly:"Monthly Breakdown",
    annual:"Annual Summary",history:"History",purchases:"Other Expenses",
    savings:"USD Savings",report:"Weekly Report",users:"Manage Users"};

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Close sidebar when navigating on mobile
  function navTo(id){ setView(id); if(isMobile) setSidebarOpen(false); }

  return(
    <ThemeCtx.Provider value={C}>
    <UserCtx.Provider value={user}>
    <div style={{minHeight:"100vh",background:C.pageBg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,display:"flex",flexDirection:"column"}}>
      <style>{`
        @keyframes _spin{to{transform:rotate(360deg)}}
        @keyframes _slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { opacity:0.5; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{background:C.header,display:"flex",alignItems:"center",
        padding:isMobile?"0 12px":"0 20px",height:60,position:"sticky",
        top:0,zIndex:30,flexShrink:0,gap:8}}>

        {/* Hamburger (mobile) */}
        {isMobile&&(
          <button onClick={()=>setSidebarOpen(o=>!o)}
            style={{background:"transparent",border:"none",cursor:"pointer",
              color:C.muted,padding:6,display:"flex",alignItems:"center",flexShrink:0}}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={sidebarOpen?"M18 6L6 18M6 6l12 12":"M3 12h18M3 6h18M3 18h18"}/>
            </svg>
          </button>
        )}

        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#003d35,#00594f)",
            border:`1px solid ${C.teal}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ico d={IC.wifi} size={15} color={C.teal}/>
          </div>
          {!isMobile&&(
            <div>
              <div style={{fontSize:13,fontWeight:800,letterSpacing:"-0.01em",lineHeight:1}}>
                HOTZONEX <span style={{color:C.teal}}>WiFi</span>
              </div>
              <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginTop:1}}>Tracker</div>
            </div>
          )}
        </div>

        {/* Location tabs — hidden on mobile (accessible via sidebar) */}
        {!isMobile&&(
          <div style={{display:"flex",gap:4,marginLeft:12,flex:1,overflowX:"auto",scrollbarWidth:"none"}}>
            {(canDo(user,"canViewAll")?LOCATIONS:LOCATIONS.filter(l=>l.id===user.location)).map(l=>{
              const active=loc===l.id;
              return(
                <button key={l.id}
                  onClick={()=>canDo(user,"canViewAll")?(setLoc(l.id),setGlobalReload(n=>n+1)):null}
                  style={{padding:"4px 11px",borderRadius:20,fontSize:11,
                    cursor:canDo(user,"canViewAll")?"pointer":"default",
                    fontWeight:active?700:400,whiteSpace:"nowrap",
                    background:active?`rgba(${hexToRgb(l.color)},0.15)`:"transparent",
                    border:`1px solid ${active?l.color+"66":C.cardB}`,
                    color:active?l.color:C.muted,transition:"all 0.15s"}}>
                  {isTablet?l.short:l.label}
                </button>
              );
            })}
          </div>
        )}
        {isMobile&&<div style={{flex:1,textAlign:"center",fontSize:13,fontWeight:700,color:C.text}}>
          {TITLES_MAP[view]}
        </div>}

        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {/* DB dot (compact on mobile) */}
          <div style={{display:"flex",alignItems:"center",gap:4,
            background:dbStatus==="live"?"rgba(0,229,195,0.08)":"rgba(240,82,82,0.1)",
            border:`1px solid ${dbStatus==="live"?C.teal+"44":C.red+"44"}`,
            borderRadius:20,padding:isMobile?"4px 8px":"5px 12px",fontSize:10,
            color:dbStatus==="live"?C.teal:C.red,fontWeight:700}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:dbStatus==="live"?C.teal:C.red,
              boxShadow:`0 0 5px ${dbStatus==="live"?C.teal:C.red}`}}/>
            {!isMobile&&(dbStatus==="live"?"LIVE":"ERR")}
          </div>

          {/* Refresh */}
          <button onClick={onSaved} style={{background:"transparent",border:"none",cursor:"pointer",color:C.muted,padding:5,display:"flex",alignItems:"center"}}>
            <Ico d={IC.refresh} size={15} color={C.muted}/>
          </button>

          {/* Year — hidden on mobile */}
          {!isMobile&&(
            <div style={{position:"relative"}}>
              <button onClick={()=>setYearOpen(o=>!o)}
                style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.04)",
                  border:`1px solid ${C.cardB}`,borderRadius:7,color:C.text,
                  padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                {year}<Ico d={IC.chevron} size={11} color={C.muted}/>
              </button>
              {yearOpen&&(
                <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,
                  border:`1px solid ${C.cardB}`,borderRadius:8,overflow:"hidden",
                  zIndex:50,minWidth:130,boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}}>
                  <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.cardB}`}}>
                    <input type="number" placeholder="Type a year…"
                      style={{width:"100%",background:C.inputBg,border:`1px solid ${C.cardB}`,
                        borderRadius:6,color:C.text,padding:"5px 8px",fontSize:12,outline:"none",boxSizing:"border-box"}}
                      onKeyDown={e=>{ if(e.key==="Enter"){ const y=parseInt(e.target.value); if(y>=2000&&y<=2100){setYear(y);setYearOpen(false);} } }}/>
                  </div>
                  {YEARS.map(y=>(
                    <button key={y} onClick={()=>{setYear(y);setYearOpen(false);}}
                      style={{width:"100%",display:"block",padding:"7px 14px",
                        background:y===year?C.tealBg:"transparent",color:y===year?C.teal:C.text,
                        border:"none",textAlign:"left",fontSize:12,cursor:"pointer",fontWeight:y===year?600:400}}>{y}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Theme toggle */}
          <button onClick={()=>setIsDark(d=>!d)}
            style={{width:30,height:30,borderRadius:"50%",background:"transparent",
              border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {isDark
              ?<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              :<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            }
          </button>

          {/* Avatar + logout */}
          <div style={{width:30,height:30,borderRadius:"50%",background:roleCfg.color,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:12,fontWeight:700,color:"#09111e",flexShrink:0}}
            title={`${user.name} · ${roleCfg.label}`}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <button onClick={onLogout} title="Sign out"
            style={{background:"transparent",border:"none",cursor:"pointer",color:C.muted,padding:4,display:"flex",alignItems:"center"}}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,minHeight:0,position:"relative"}}>

        {/* Mobile overlay */}
        {isMobile&&sidebarOpen&&(
          <div onClick={()=>setSidebarOpen(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:25,top:60}}/>
        )}

        {/* Sidebar */}
        <div style={{
          width:210,flexShrink:0,background:C.sidebar,overflowY:"auto",
          ...(isMobile?{
            position:"fixed",top:60,left:0,height:"calc(100vh - 60px)",
            zIndex:26,transform:sidebarOpen?"translateX(0)":"translateX(-100%)",
            transition:"transform 0.25s ease",
          }:{
            position:"sticky",top:60,height:"calc(100vh - 60px)",
          })
        }}>
          {/* User info */}
          <div style={{padding:"12px 16px",background:`rgba(${hexToRgb(roleCfg.color)},0.06)`}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text}}>{user.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
              <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,fontWeight:600,
                background:`rgba(${hexToRgb(roleCfg.color)},0.15)`,color:roleCfg.color}}>
                {roleCfg.label}
              </span>
              <span style={{fontSize:10,color:locCfg.color,fontWeight:500}}>{locCfg.short}</span>
            </div>
          </div>

          {/* Mobile: location switcher inside sidebar */}
          {isMobile&&canDo(user,"canViewAll")&&(
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.cardB}`}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Location</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {LOCATIONS.map(l=>{
                  const active=loc===l.id;
                  return(
                    <button key={l.id} onClick={()=>{setLoc(l.id);setGlobalReload(n=>n+1);}}
                      style={{padding:"3px 10px",borderRadius:20,fontSize:11,cursor:"pointer",fontWeight:active?700:400,
                        background:active?`rgba(${hexToRgb(l.color)},0.15)`:"transparent",
                        border:`1px solid ${active?l.color+"66":C.cardB}`,
                        color:active?l.color:C.muted}}>
                      {l.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile: year picker inside sidebar */}
          {isMobile&&(
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.cardB}`}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Year</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {YEARS.slice(-4).map(y=>(
                  <button key={y} onClick={()=>setYear(y)}
                    style={{padding:"3px 10px",borderRadius:20,fontSize:11,cursor:"pointer",
                      background:y===year?C.tealBg:"transparent",
                      border:`1px solid ${y===year?C.teal:C.cardB}`,
                      color:y===year?C.teal:C.muted,fontWeight:y===year?700:400}}>
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nav */}
          <div style={{padding:"10px 0"}}>
            {NAV_ITEMS.map(item=>{
              const active=view===item.id;
              return(
                <button key={item.id} onClick={()=>navTo(item.id)}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,
                    padding:"11px 18px",
                    background:active?`rgba(${hexToRgb(locCfg.color)},0.08)`:"transparent",
                    borderLeft:`3px solid ${active?locCfg.color:"transparent"}`,
                    border:"none",outline:"none",
                    color:active?locCfg.color:C.muted,cursor:"pointer",
                    fontSize:13,fontWeight:active?600:400,textAlign:"left",transition:"color 0.12s"}}>
                  <Ico d={IC[item.icon]} size={16} color={active?locCfg.color:C.muted}/>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px 14px":"24px 28px",minWidth:0}}>
          {/* Page title — hidden on mobile (shown in header) */}
          {!isMobile&&(
            <div style={{marginBottom:20}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:C.text,letterSpacing:"-0.02em"}}>{TITLES_MAP[view]}</h1>
              <div style={{fontSize:12,color:C.muted,marginTop:3}}>
                {year} · <span style={{color:locCfg.color,fontWeight:600}}>{locCfg.label}</span>
              </div>
            </div>
          )}

          <SafeView theme={C}>
          {view==="dashboard" && <Dashboard  key={`dash-${year}-${loc}-${globalReload}`}  year={year} loc={loc} globalReload={globalReload}/>}
          {view==="entry"     && canDo(user,"canEdit") && <DailyEntry key={`entry-${year}-${loc}`} year={year} loc={loc} onSaved={onSaved}/>}
          {view==="entry"     && !canDo(user,"canEdit") && <div style={{color:C.muted,padding:40,textAlign:"center",fontSize:13}}>You don't have permission to enter data.</div>}
          {view==="monthly"   && <Monthly    key={`monthly-${year}-${loc}`}              year={year} loc={loc} globalReload={globalReload}/>}
          {view==="annual"    && <Annual     key={`annual-${year}-${loc}`}               year={year} loc={loc} globalReload={globalReload}/>}
          {view==="history"   && <History    key={`history-${loc}-${globalReload}`}      loc={loc}/>}
          {view==="purchases" && <OtherExpenses key={`oe-${year}-${loc}`}               year={year} loc={loc}/>}
          {view==="savings"   && <USDSavings key={`usd-${year}-${loc}`}                 year={year} loc={loc}/>}
          {view==="report"    && <WeeklyReport key={`report-${year}-${loc}-${globalReload}`} year={year} loc={loc}/>}
          {view==="users"     && <UserManagement currentUser={user}/>}
          </SafeView>
        </div>
      </div>
    </div>
    </UserCtx.Provider>
    </ThemeCtx.Provider>
  );
}

// hex color → "r,g,b" string for rgba()
function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
