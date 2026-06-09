import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPA_URL = "https://prxumouufckubwioywuz.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeHVtb3V1ZmNrdWJ3aW95d3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDc2NTIsImV4cCI6MjA5NTgyMzY1Mn0.RpK8UmfzQhXVVuuVhsj5QH3HDhwT6RAm0ID0o_MqR7U";
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation",
};

async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, { headers: HEADERS, ...opts });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function upsertEntry(year, month, day, fields) {
  return sbFetch("/daily_entries", {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ year, month, day, ...fields }),
  });
}

async function fetchEntries(year) {
  return sbFetch(`/daily_entries?year=eq.${year}&order=month.asc,day.asc`);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
const YEARS = [2026,2027,2028,2029,2030];
const EXP_KEYS   = ["internet","power","feeding","wages"];
const EXP_LABELS = { internet:"Internet", power:"Power/Fuel", feeding:"Feeding", wages:"Wages" };

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  pageBg:"#0b1120", sidebar:"#0d1526", header:"#0d1526",
  card:"#111d33",   cardB:"#1a2d4a",   divider:"#162035",
  teal:"#00e5c3",   tealBg:"rgba(0,229,195,0.08)", tealBorder:"rgba(0,229,195,0.3)",
  red:"#f05252",    orange:"#f97316",  yellow:"#fbbf24",
  green:"#10b981",  blue:"#3b82f6",
  text:"#e2e8f0",   muted:"#4b6080",   subtle:"#1e3050",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const nv  = (v) => Number(v) || 0;
const fmt = (v) => nv(v) === 0 ? "0" : nv(v).toLocaleString();
const pctN= (inc,exp) => inc > 0 ? ((inc-exp)/inc*100).toFixed(1) : "0.0";

// Convert flat DB rows → nested { [month]: { [day]: row } }
function rowsToNested(rows) {
  const nested = {};
  for (const m of MONTHS) {
    nested[m] = {};
    for (let d=1;d<=31;d++) nested[m][d] = {income:"",internet:"",power:"",feeding:"",wages:""};
  }
  for (const r of rows) {
    if (nested[r.month]) {
      nested[r.month][r.day] = {
        income:   r.income   ?? "",
        internet: r.internet ?? "",
        power:    r.power    ?? "",
        feeding:  r.feeding  ?? "",
        wages:    r.wages    ?? "",
      };
    }
  }
  return nested;
}

function calcDay(row) {
  const inc = nv(row.income);
  const exp = EXP_KEYS.reduce((s,k)=>s+nv(row[k]),0);
  return { income:inc, expenses:exp, profit:inc-exp };
}
function calcMonth(md, days) {
  let inc=0, exp=0;
  const daily=[];
  for (let d=1;d<=days;d++) {
    const row=md[d]||{};
    const c=calcDay(row);
    inc+=c.income; exp+=c.expenses;
    daily.push({day:d,...c,
      internet:nv(row.internet),power:nv(row.power),
      feeding:nv(row.feeding),wages:nv(row.wages)});
  }
  return {income:inc,expenses:exp,profit:inc-exp,daily};
}
function calcYear(yd) {
  const months = MONTHS.map((m,i)=>{
    const r=calcMonth(yd[m]||{},MONTH_DAYS[i]);
    return {month:m.slice(0,3),full:m,income:r.income,expenses:r.expenses,profit:r.profit};
  });
  return {
    income:months.reduce((s,m)=>s+m.income,0),
    expenses:months.reduce((s,m)=>s+m.expenses,0),
    profit:months.reduce((s,m)=>s+m.profit,0),
    months,
  };
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function Ico({d,size=18,color="currentColor"}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>
    </svg>
  );
}
const ICONS = {
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
  spinner:"M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83",
};
const NAV = [
  {id:"dashboard",label:"Dashboard",icon:"dashboard"},
  {id:"entry",    label:"Daily Entry",icon:"entry"},
  {id:"monthly",  label:"Monthly",icon:"monthly"},
  {id:"annual",   label:"Annual",icon:"annual"},
  {id:"history",  label:"5-Year History",icon:"history"},
];

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({children,style={}}) {
  return <div style={{background:C.card,border:`1px solid ${C.cardB}`,borderRadius:10,...style}}>{children}</div>;
}
function KPICard({label,value,suffix="SSP",color=C.teal}) {
  return (
    <Card style={{padding:"22px 24px"}}>
      <div style={{fontSize:13,color:C.muted,marginBottom:16,fontWeight:500}}>{label}</div>
      <div style={{fontSize:32,fontWeight:700,color,lineHeight:1,letterSpacing:"-0.02em",
        fontVariantNumeric:"tabular-nums"}}>
        {typeof value==="number"?value.toLocaleString():value}
      </div>
      <div style={{fontSize:12,color:C.muted,marginTop:8}}>{suffix}</div>
    </Card>
  );
}
function SLabel({children,style={}}) {
  return <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",
    color:C.muted,fontWeight:600,...style}}>{children}</div>;
}
const TT = {
  contentStyle:{background:"#0d1a2e",border:`1px solid ${C.cardB}`,
    borderRadius:8,fontSize:11,color:C.text,padding:"8px 12px"},
  formatter:(v)=>[`SSP ${Number(v).toLocaleString()}`,""],
  labelStyle:{color:C.muted},
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({yearData,year}) {
  const yd = calcYear(yearData);
  const recentDays=[];
  for (let mi=MONTHS.length-1;mi>=0&&recentDays.length<6;mi--) {
    for (let d=MONTH_DAYS[mi];d>=1&&recentDays.length<6;d--) {
      const row=(yearData[MONTHS[mi]]||{})[d];
      if(row&&nv(row.income)>0){
        recentDays.push({label:`${MONTHS[mi].slice(0,3)} ${d}`,...calcDay(row)});
      }
    }
  }
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
        <KPICard label="Total Income"   value={yd.income}   color={C.teal}/>
        <KPICard label="Total Expenses" value={yd.expenses} color={C.red}/>
        <KPICard label="Net Profit"     value={yd.profit}   color={yd.profit>=0?C.yellow:C.red}/>
        <KPICard label="Profit Margin"  value={pctN(yd.income,yd.expenses)+"%"} color={C.teal} suffix="%"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:14}}>
        <Card style={{padding:22}}>
          <SLabel style={{marginBottom:16}}>Monthly Net Profit</SLabel>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={yd.months} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.subtle}/>
              <XAxis dataKey="month" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
              <Tooltip {...TT}/>
              <Line type="monotone" dataKey="profit" stroke={C.teal} strokeWidth={2.5}
                dot={(p)=>{const{cx,cy,payload}=p;return payload.income>0
                  ?<circle key={cx} cx={cx} cy={cy} r={4} fill={C.teal} stroke="none"/>
                  :<circle key={cx} cx={cx} cy={cy} r={0}/>}}
                activeDot={{r:5,fill:C.teal}} name="Net Profit"/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card style={{padding:22}}>
          <SLabel style={{marginBottom:16}}>Recent Days</SLabel>
          {recentDays.length===0
            ?<div style={{color:C.muted,fontSize:13,marginTop:30,lineHeight:1.6}}>
              No data yet. Add days in <strong style={{color:C.teal}}>Daily Entry</strong>.
             </div>
            :recentDays.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 0",borderBottom:i<recentDays.length-1?`1px solid ${C.divider}`:"none"}}>
                <span style={{color:C.muted,fontSize:12}}>{d.label}</span>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.teal,fontSize:13,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>
                    {d.income.toLocaleString()}
                  </div>
                  <div style={{color:d.profit>=0?C.green:C.red,fontSize:10,marginTop:1}}>
                    {d.profit>=0?"+":""}{d.profit.toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          }
        </Card>
      </div>
    </div>
  );
}

// ── DAILY ENTRY ───────────────────────────────────────────────────────────────
function DailyEntry({yearData,year,onSaved}) {
  const today = new Date();
  const [selM, setSelM] = useState(MONTHS[today.getMonth()]);
  const [selD, setSelD] = useState(today.getDate());
  const [form, setForm] = useState({income:"",internet:"",power:"",feeding:"",wages:""});
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const mi = MONTHS.indexOf(selM);
  const daysInM = mi===1&&year%4===0?29:MONTH_DAYS[mi];

  useEffect(()=>{
    const r=(yearData[selM]||{})[selD]||{};
    setForm({income:r.income||"",internet:r.internet||"",power:r.power||"",
             feeding:r.feeding||"",wages:r.wages||""});
  },[selM,selD,yearData]);

  const inc=nv(form.income), exp=EXP_KEYS.reduce((s,k)=>s+nv(form[k]),0), prof=inc-exp;

  async function doSave() {
    setSaving(true); setSaveMsg("");
    try {
      await upsertEntry(year, selM, selD, {
        income:   nv(form.income),
        internet: nv(form.internet),
        power:    nv(form.power),
        feeding:  nv(form.feeding),
        wages:    nv(form.wages),
      });
      setSaveMsg("saved");
      onSaved();
    } catch(e) {
      setSaveMsg("error: " + e.message);
    } finally { setSaving(false); }
  }

  async function doClear() {
    setSaving(true);
    try {
      await upsertEntry(year, selM, selD, {income:0,internet:0,power:0,feeding:0,wages:0});
      setForm({income:"",internet:"",power:"",feeding:"",wages:""});
      setSaveMsg("cleared");
      onSaved();
    } catch(e) { setSaveMsg("error: "+e.message); }
    finally { setSaving(false); }
  }

  const inp = {width:"100%",background:"#090f1c",border:`1px solid ${C.cardB}`,
    borderRadius:8,color:C.text,padding:"11px 14px",fontSize:14,
    outline:"none",boxSizing:"border-box",fontVariantNumeric:"tabular-nums",
    transition:"border-color 0.15s"};

  return (
    <div style={{maxWidth:680}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        {[
          ["Month",selM,(v)=>{setSelM(v);const ni=MONTHS.indexOf(v);const mx=ni===1&&year%4===0?29:MONTH_DAYS[ni];if(selD>mx)setSelD(mx);},
            MONTHS.map(m=>({v:m,l:m}))],
          ["Day",selD,(v)=>setSelD(Number(v)),
            Array.from({length:daysInM},(_,i)=>({v:i+1,l:`${i+1} ${selM}`}))],
        ].map(([label,val,onChange,opts])=>(
          <div key={label}>
            <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
            <select value={val} onChange={e=>onChange(e.target.value)}
              style={{...inp,cursor:"pointer",appearance:"none",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%234b6080' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:32}}>
              {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        ))}
      </div>

      <Card style={{padding:26}}>
        <div style={{fontSize:12,color:C.muted,marginBottom:22}}>
          Entry for <strong style={{color:C.text}}>{selD} {selM} {year}</strong>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:"0.08em"}}>Income (SSP)</div>
          <input type="number" value={form.income} placeholder="0"
            onChange={e=>setForm(f=>({...f,income:e.target.value}))} style={inp}
            onFocus={e=>e.target.style.borderColor=C.teal}
            onBlur={e=>e.target.style.borderColor=C.cardB}/>
        </div>
        <div style={{fontSize:11,color:C.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>Expenses (SSP)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:22}}>
          {EXP_KEYS.map(k=>(
            <div key={k}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{EXP_LABELS[k]}</div>
              <input type="number" value={form[k]} placeholder="0"
                onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inp}
                onFocus={e=>e.target.style.borderColor=C.orange}
                onBlur={e=>e.target.style.borderColor=C.cardB}/>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div style={{background:"#090f1c",borderRadius:8,padding:"14px 18px",
          display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:22}}>
          {[["INCOME",inc,C.teal],["EXPENSES",exp,C.orange],["NET PROFIT",prof,prof>=0?C.green:C.red]].map(([l,v,col])=>(
            <div key={l}>
              <div style={{fontSize:9,color:C.muted,marginBottom:5,letterSpacing:"0.1em"}}>{l}</div>
              <div style={{color:col,fontWeight:700,fontSize:17,fontVariantNumeric:"tabular-nums"}}>{v.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button onClick={doSave} disabled={saving}
            style={{flex:1,background:C.teal,border:"none",borderRadius:8,color:"#09111e",
              padding:"12px 20px",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",
              opacity:saving?0.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {saving
              ? <><Ico d={ICONS.spinner} size={14} color="#09111e"/> Saving…</>
              : saveMsg==="saved"
                ? <><Ico d={ICONS.check} size={14} color="#09111e"/> Saved!</>
                : "Save to Supabase"
            }
          </button>
          <button onClick={doClear} disabled={saving}
            style={{background:"transparent",border:`1px solid ${C.cardB}`,borderRadius:8,
              color:C.muted,padding:"12px 16px",fontSize:13,cursor:"pointer"}}>
            Clear
          </button>
        </div>
        {saveMsg && saveMsg.startsWith("error") && (
          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(240,82,82,0.1)",
            border:"1px solid rgba(240,82,82,0.3)",borderRadius:7,
            fontSize:11,color:C.red}}>{saveMsg}</div>
        )}
      </Card>
    </div>
  );
}

// ── MONTHLY ───────────────────────────────────────────────────────────────────
function Monthly({yearData,year}) {
  const [selM,setSelM] = useState("June");
  const mi = MONTHS.indexOf(selM);
  const days = mi===1&&year%4===0?29:MONTH_DAYS[mi];
  const {income,expenses,profit,daily} = calcMonth(yearData[selM]||{},days);
  const weeks=[[],[],[],[],[]];
  daily.forEach(d=>weeks[Math.min(Math.floor((d.day-1)/7),4)].push(d));
  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {MONTHS.map((m,i)=>{
          const {income:mi2}=calcMonth(yearData[m]||{},MONTH_DAYS[i]);
          const active=m===selM;
          return (
            <button key={m} onClick={()=>setSelM(m)} style={{
              padding:"6px 13px",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:500,
              border:active?`1px solid ${C.teal}`:`1px solid ${C.cardB}`,
              background:active?C.tealBg:"transparent",
              color:active?C.teal:mi2>0?C.text:C.muted}}>
              {m.slice(0,3)}{mi2>0&&<span style={{marginLeft:3,color:C.teal,fontSize:9}}>●</span>}
            </button>
          );
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <KPICard label="Month Income"   value={income}   color={C.teal}/>
        <KPICard label="Month Expenses" value={expenses} color={C.red}/>
        <KPICard label="Net Profit"     value={profit}   color={profit>=0?C.yellow:C.red}/>
        <KPICard label="Margin" value={pctN(income,expenses)+"%"} color={C.teal} suffix="%"/>
      </div>
      {weeks.map((wd,wi)=>{
        if(!wd.length) return null;
        const wI=wd.reduce((s,d)=>s+d.income,0), wE=wd.reduce((s,d)=>s+d.expenses,0);
        return (
          <Card key={wi} style={{marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"8px 16px",background:"rgba(255,255,255,0.02)",
              borderBottom:`1px solid ${C.cardB}`,fontSize:10,color:C.muted,
              textTransform:"uppercase",letterSpacing:"0.1em"}}>Week {wi+1}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr>{["Day","Income","Internet","Power/Fuel","Feeding","Wages","Net Profit"].map(h=>(
                    <th key={h} style={{padding:"8px 14px",textAlign:h==="Day"?"left":"right",
                      color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",
                      borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {wd.map(d=>(
                    <tr key={d.day} style={{borderBottom:`1px solid ${C.divider}`}}>
                      <td style={{padding:"8px 14px",color:C.muted,fontWeight:600}}>{d.day}</td>
                      <td style={{padding:"8px 14px",textAlign:"right",color:d.income>0?C.teal:C.muted,fontWeight:d.income>0?600:400}}>{fmt(d.income)}</td>
                      {["internet","power","feeding","wages"].map(k=>(
                        <td key={k} style={{padding:"8px 14px",textAlign:"right",color:C.muted}}>{fmt(d[k])}</td>
                      ))}
                      <td style={{padding:"8px 14px",textAlign:"right",
                        color:d.income===0?C.muted:d.profit>=0?C.green:C.red,
                        fontWeight:d.income>0?700:400}}>
                        {d.income===0?"—":fmt(d.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:`1px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                    <td style={{padding:"8px 14px",color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Total</td>
                    <td style={{padding:"8px 14px",textAlign:"right",color:C.teal,fontWeight:700}}>{fmt(wI)}</td>
                    <td colSpan={4} style={{padding:"8px 14px",textAlign:"right",color:C.orange,fontSize:11}}>{fmt(wE)} exp</td>
                    <td style={{padding:"8px 14px",textAlign:"right",color:wI-wE>=0?C.green:C.red,fontWeight:700}}>{fmt(wI-wE)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── ANNUAL ────────────────────────────────────────────────────────────────────
function Annual({yearData,year}) {
  const yd = calcYear(yearData);
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
        <KPICard label="Total Income"   value={yd.income}   color={C.teal}/>
        <KPICard label="Total Expenses" value={yd.expenses} color={C.red}/>
        <KPICard label="Net Profit"     value={yd.profit}   color={yd.profit>=0?C.yellow:C.red}/>
      </div>
      <Card style={{overflow:"hidden"}}>
        <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.cardB}`}}><SLabel>Monthly Detail</SLabel></div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr>{["Month","Income","Expenses","Profit","Margin","Status"].map(h=>(
                <th key={h} style={{padding:"10px 18px",textAlign:h==="Month"?"left":"right",
                  color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",
                  borderBottom:`1px solid ${C.cardB}`,fontWeight:600}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {yd.months.map(m=>(
                <tr key={m.month} style={{borderBottom:`1px solid ${C.divider}`,transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 18px",color:C.text,fontWeight:500}}>{m.full}</td>
                  <td style={{padding:"10px 18px",textAlign:"right",color:m.income>0?C.teal:C.muted,fontWeight:m.income>0?600:400}}>{fmt(m.income)}</td>
                  <td style={{padding:"10px 18px",textAlign:"right",color:m.expenses>0?C.orange:C.muted}}>{fmt(m.expenses)}</td>
                  <td style={{padding:"10px 18px",textAlign:"right",color:m.income===0?C.muted:m.profit>=0?C.green:C.red,fontWeight:m.income>0?700:400}}>{m.income===0?"—":fmt(m.profit)}</td>
                  <td style={{padding:"10px 18px",textAlign:"right",color:C.muted}}>{m.income===0?"—":pctN(m.income,m.expenses)+"%"}</td>
                  <td style={{padding:"10px 18px",textAlign:"right"}}>
                    {m.income===0
                      ?<span style={{color:C.muted,fontSize:11}}>No data</span>
                      :<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,
                          background:m.profit>=0?"rgba(16,185,129,0.12)":"rgba(240,82,82,0.12)",
                          color:m.profit>=0?C.green:C.red}}>
                          {m.profit>=0?"▲ Profit":"▼ Loss"}
                        </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{borderTop:`2px solid ${C.cardB}`,background:"rgba(255,255,255,0.02)"}}>
                <td style={{padding:"10px 18px",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Year Total</td>
                <td style={{padding:"10px 18px",textAlign:"right",color:C.teal,fontWeight:700}}>{fmt(yd.income)}</td>
                <td style={{padding:"10px 18px",textAlign:"right",color:C.orange,fontWeight:700}}>{fmt(yd.expenses)}</td>
                <td style={{padding:"10px 18px",textAlign:"right",color:yd.profit>=0?C.green:C.red,fontWeight:700}}>{fmt(yd.profit)}</td>
                <td style={{padding:"10px 18px",textAlign:"right",color:C.muted,fontWeight:700}}>{pctN(yd.income,yd.expenses)+"%"}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── 5-YEAR HISTORY ────────────────────────────────────────────────────────────
function History({allData}) {
  const ys = YEARS.map(y=>({year:y,...calcYear(allData[y]||{})}));
  const tot={income:ys.reduce((s,y)=>s+y.income,0),expenses:ys.reduce((s,y)=>s+y.expenses,0),profit:ys.reduce((s,y)=>s+y.profit,0)};
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
        <KPICard label="5-Year Income"   value={tot.income}   color={C.teal}/>
        <KPICard label="5-Year Expenses" value={tot.expenses} color={C.red}/>
        <KPICard label="5-Year Profit"   value={tot.profit}   color={tot.profit>=0?C.yellow:C.red}/>
      </div>
      <Card style={{padding:22,marginBottom:14}}>
        <SLabel style={{marginBottom:16}}>Year-by-Year Performance</SLabel>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={ys} margin={{top:0,right:0,left:0,bottom:0}}>
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
        return (
          <Card key={key} style={{marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"8px 16px",borderBottom:`1px solid ${C.cardB}`,
              fontSize:10,color:col,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700}}>{key}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{padding:"7px 14px",textAlign:"left",color:C.muted,fontSize:9,textTransform:"uppercase"}}>Year</th>
                    {MONTHS.map(m=><th key={m} style={{padding:"7px 7px",textAlign:"right",color:C.muted,fontSize:9,textTransform:"uppercase"}}>{m.slice(0,3)}</th>)}
                    <th style={{padding:"7px 14px",textAlign:"right",color:C.muted,fontSize:9,textTransform:"uppercase"}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ys.map(y=>(
                    <tr key={y.year} style={{borderBottom:`1px solid ${C.divider}`}}>
                      <td style={{padding:"7px 14px",color:C.muted,fontWeight:700}}>{y.year}</td>
                      {y.months.map(m=>(
                        <td key={m.month} style={{padding:"7px 7px",textAlign:"right",
                          color:m[key]>0?col:"#1e2d40",fontSize:11}}>
                          {m[key]>0?(m[key]>=1e6?`${(m[key]/1e6).toFixed(2)}M`:m[key].toLocaleString()):"—"}
                        </td>
                      ))}
                      <td style={{padding:"7px 14px",textAlign:"right",color:col,fontWeight:700}}>
                        {y[key]>0?y[key].toLocaleString():"—"}
                      </td>
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

// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  // allData[year] = nested month/day structure
  const [allData,   setAllData]   = useState({});
  const [year,      setYear]      = useState(2026);
  const [view,      setView]      = useState("dashboard");
  const [loading,   setLoading]   = useState(true);
  const [dbStatus,  setDbStatus]  = useState("connecting"); // connecting | live | error
  const [yearOpen,  setYearOpen]  = useState(false);
  const [errMsg,    setErrMsg]    = useState("");
  const yearRef = useRef(year);
  yearRef.current = year;

  // Load data for a given year from Supabase
  async function loadYear(y) {
    try {
      const rows = await fetchEntries(y);
      const nested = rowsToNested(rows);
      setAllData(prev => ({...prev, [y]: nested}));
      setDbStatus("live");
      return nested;
    } catch(e) {
      setDbStatus("error");
      setErrMsg(e.message);
      // Return empty structure so app still works
      const empty = {};
      for (const m of MONTHS) { empty[m]={}; for(let d=1;d<=31;d++) empty[m][d]={income:"",internet:"",power:"",feeding:"",wages:""}; }
      setAllData(prev=>({...prev,[y]:empty}));
      return empty;
    }
  }

  useEffect(()=>{
    setLoading(true);
    loadYear(2026).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if (!allData[year]) loadYear(year);
  },[year]);

  const yearData = allData[year] || {};

  // Called after a save — reload current year
  async function handleSaved() {
    const rows = await fetchEntries(yearRef.current).catch(()=>[]);
    setAllData(prev=>({...prev,[yearRef.current]:rowsToNested(rows)}));
  }

  const TITLES={dashboard:"Business overview",entry:"Daily Entry",
    monthly:"Monthly Breakdown",annual:"Annual Summary",history:"5-Year History"};

  if (loading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:C.pageBg,color:C.muted,fontSize:14,gap:16,
      fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:36,height:36,border:`3px solid ${C.cardB}`,borderTop:`3px solid ${C.teal}`,
        borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div>Connecting to Supabase…</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.pageBg,
      fontFamily:"'Inter',system-ui,sans-serif",color:C.text,display:"flex",flexDirection:"column"}}>

      {/* ── HEADER ── */}
      <div style={{background:C.header,borderBottom:`1px solid ${C.cardB}`,
        display:"flex",alignItems:"center",padding:"0 24px",height:68,
        position:"sticky",top:0,zIndex:20,flexShrink:0}}>

        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:12,width:220,flexShrink:0}}>
          <div style={{width:38,height:38,borderRadius:10,
            background:"linear-gradient(135deg,#003d35,#00594f)",
            border:`1px solid ${C.teal}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ico d={ICONS.wifi} size={18} color={C.teal}/>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.01em",lineHeight:1}}>
              HOTZONEX <span style={{color:C.teal}}>WiFi</span>
            </div>
            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginTop:2}}>
              Automated Tracker
            </div>
          </div>
        </div>

        <div style={{flex:1}}/>

        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* DB status badge */}
          <div style={{display:"flex",alignItems:"center",gap:6,
            background:dbStatus==="live"?"rgba(0,229,195,0.08)":dbStatus==="error"?"rgba(240,82,82,0.1)":"rgba(255,255,255,0.05)",
            border:`1px solid ${dbStatus==="live"?C.teal+"44":dbStatus==="error"?C.red+"44":"#ffffff22"}`,
            borderRadius:20,padding:"6px 14px",fontSize:11,
            color:dbStatus==="live"?C.teal:dbStatus==="error"?C.red:C.muted,fontWeight:700,letterSpacing:"0.04em"}}>
            <div style={{width:6,height:6,borderRadius:"50%",
              background:dbStatus==="live"?C.teal:dbStatus==="error"?C.red:C.muted,
              boxShadow:dbStatus==="live"?`0 0 8px ${C.teal}`:dbStatus==="error"?`0 0 6px ${C.red}`:"none"}}/>
            {dbStatus==="live"?"LIVE · SUPABASE":dbStatus==="error"?"DB ERROR":"CONNECTING…"}
          </div>

          {/* Refresh */}
          <button onClick={()=>loadYear(year).then(()=>{})}
            style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${C.cardB}`,
              borderRadius:8,color:C.muted,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center"}}>
            <Ico d={ICONS.refresh} size={14} color={C.muted}/>
          </button>

          {/* Year dropdown */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setYearOpen(o=>!o)}
              style={{display:"flex",alignItems:"center",gap:8,
                background:"rgba(255,255,255,0.04)",border:`1px solid ${C.cardB}`,
                borderRadius:8,color:C.text,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {year} <Ico d={ICONS.chevron} size={13} color={C.muted}/>
            </button>
            {yearOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,
                border:`1px solid ${C.cardB}`,borderRadius:8,overflow:"hidden",zIndex:50,minWidth:100}}>
                {YEARS.map(y=>(
                  <button key={y} onClick={()=>{setYear(y);setYearOpen(false);}}
                    style={{width:"100%",display:"block",padding:"9px 16px",
                      background:y===year?C.tealBg:"transparent",
                      color:y===year?C.teal:C.text,border:"none",
                      textAlign:"left",fontSize:13,cursor:"pointer",fontWeight:y===year?600:400}}>
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div style={{width:36,height:36,borderRadius:"50%",background:C.teal,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:14,fontWeight:700,color:"#09111e",flexShrink:0}}>O</div>

          {/* Logout */}
          <button style={{background:"transparent",border:"none",cursor:"pointer",
            padding:6,color:C.muted,display:"flex",alignItems:"center"}}>
            <Ico d={ICONS.logout} size={18} color={C.muted}/>
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{display:"flex",flex:1,minHeight:0}}>
        {/* Sidebar */}
        <div style={{width:220,flexShrink:0,background:C.sidebar,
          borderRight:`1px solid ${C.cardB}`,position:"sticky",
          top:68,height:"calc(100vh - 68px)",overflowY:"auto"}}>
          <div style={{padding:"16px 0"}}>
            {NAV.map(item=>{
              const active=view===item.id;
              return (
                <button key={item.id} onClick={()=>setView(item.id)}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:11,
                    padding:"11px 20px",
                    background:active?"rgba(0,229,195,0.08)":"transparent",
                    borderLeft:`3px solid ${active?C.teal:"transparent"}`,
                    border:"none",
                    color:active?C.teal:C.muted,cursor:"pointer",
                    fontSize:13,fontWeight:active?600:400,textAlign:"left",transition:"all 0.12s"}}>
                  <Ico d={ICONS[item.icon]} size={16} color={active?C.teal:C.muted}/>
                  {item.label}
                </button>
              );
            })}
          </div>
          {dbStatus==="error" && (
            <div style={{margin:"8px 12px",padding:"8px 10px",background:"rgba(240,82,82,0.08)",
              border:"1px solid rgba(240,82,82,0.2)",borderRadius:7,fontSize:10,color:C.red,lineHeight:1.5}}>
              <strong>DB Error:</strong> {errMsg.slice(0,80)}
            </div>
          )}
        </div>

        {/* Main */}
        <div style={{flex:1,overflowY:"auto",padding:"28px 30px",minWidth:0}}>
          <div style={{marginBottom:24}}>
            <h1 style={{margin:0,fontSize:26,fontWeight:700,color:C.text,letterSpacing:"-0.02em"}}>
              {TITLES[view]}
            </h1>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>{year} · Hotzonex WiFi</div>
          </div>

          {view==="dashboard" && <Dashboard yearData={yearData} year={year}/>}
          {view==="entry"     && <DailyEntry yearData={yearData} year={year} onSaved={handleSaved}/>}
          {view==="monthly"   && <Monthly yearData={yearData} year={year}/>}
          {view==="annual"    && <Annual yearData={yearData} year={year}/>}
          {view==="history"   && <History allData={allData}/>}
        </div>
      </div>
    </div>
  );
}
