(() => {
if (!localStorage.getItem("access_token")) { window.location.href = "login.html"; return; }
const API_URL = window.BUSINESSPILOT_API_URL || ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:8000" : "https://businesspilot-ai-backend.onrender.com");
const page = document.body.dataset.page || "forecast";
const raw = localStorage.getItem("analysis_result");
let data = {};
try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
const escapeHtml = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const money = (v) => Number.isFinite(Number(v)) ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(v)) : "—";
const value = (...keys) => { for (const k of keys) if (data[k] !== undefined && data[k] !== null) return data[k]; return null; };
const list = (items) => Array.isArray(items) ? items : (items ? [items] : []);
const mount = document.getElementById("pageContent");
const noData = '<div class="notice">ยังไม่มีผลวิเคราะห์ กรุณาไปที่ <a href="upload_data.html">Upload Data</a> แล้วอัปโหลด CSV ก่อน</div>';
const metrics = (items) => '<div class="grid">'+items.map(([label,val])=>'<div class="metric"><small>'+label+'</small><strong>'+val+'</strong></div>').join("")+'</div>';
const recommendations = list(value("recommendations","recommendation"));
if (page === "forecast") {
 const trend = value("trends","monthly_trends","revenue_trend");
 mount.innerHTML = (raw ? metrics([["Revenue",money(value("total_revenue","revenue"))],["Expenses",money(value("total_expense","total_expenses","expenses"))],["Net profit / loss",money(value("profit_loss","net_profit"))],["Cash runway",value("runway_months","cash_runway_months") == null ? "—" : Number(value("runway_months","cash_runway_months")).toFixed(1)+" months"]]) : noData) + '<section class="panel"><h2>Forecast overview</h2><p class="muted">This view summarizes the current dataset. It does not extrapolate future values unless a forecast is provided by the analysis API.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;color:#a5f3fc">'+(trend ? escapeHtml(JSON.stringify(trend,null,2)) : "No trend series returned by the API yet.")+'</pre></section>';
} else if (page === "scenario") {
 mount.innerHTML = (raw ? '<section class="panel"><h2>Cash-flow scenario</h2><p class="muted">Adjust monthly expenses to estimate a simple runway scenario from the current analysis. This is a planning estimate, not financial advice.</p><div class="field"><label for="expenseDelta">Monthly expense change (%)</label><input id="expenseDelta" type="number" value="0" min="-90" max="500" step="5"></div><button class="btn" id="runScenario">Calculate scenario</button><div id="scenarioResult" class="grid" style="margin-top:18px"></div></section>' : noData);
 const run = () => { const cash = Number(localStorage.getItem("initial_cash") || 0); const expenses = Number(value("average_monthly_expense","monthly_expenses","avg_monthly_expense") || 0); const delta = Math.max(-90,Math.min(500,Number(document.getElementById("expenseDelta").value)||0)); const adjusted = expenses*(1+delta/100); const runway = adjusted > 0 ? cash/adjusted : null; document.getElementById("scenarioResult").innerHTML = metrics([["Adjusted monthly expenses",money(adjusted)],["Estimated runway",runway === null ? "Not available" : runway.toFixed(1)+" months"]]); };
 document.getElementById("runScenario")?.addEventListener("click",run); if(raw) run();
} else if (page === "recommendation") {
 mount.innerHTML = raw ? '<section class="panel"><h2>Recommended actions</h2>'+(recommendations.length ? '<ol class="list">'+recommendations.map(x=>'<li>'+escapeHtml(typeof x==="string"?x:(x.message||x.text||JSON.stringify(x)))+'</li>').join("")+'</ol>' : '<div class="notice">The API did not return recommendations for this dataset yet. Review your largest expenses and recent revenue trend.</div>')+'</section>' : noData;
} else if (page === "report") {
 mount.innerHTML = (raw ? '<section class="panel"><h2>Analysis report</h2><p class="muted">Export the current analysis result as a JSON report for your records.</p><button class="btn" id="exportReport">Export JSON report</button><button class="btn secondary" id="exportCsv" style="margin-left:8px">Export summary CSV</button><pre style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:18px">'+escapeHtml(JSON.stringify(data,null,2))+'</pre></section>' : noData);
 document.getElementById("exportReport")?.addEventListener("click",()=>download("businesspilot-analysis.json",JSON.stringify(data,null,2),"application/json"));
 document.getElementById("exportCsv")?.addEventListener("click",()=>{const rows=[["metric","value"],["total_revenue",value("total_revenue","revenue")],["total_expenses",value("total_expense","total_expenses","expenses")],["profit_loss",value("profit_loss","net_profit")],["status",value("status","business_status")]];download("businesspilot-summary.csv",rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv");});
} else if (page === "notification") {
 const runway = Number(value("runway_months","cash_runway_months"));
 const status = String(value("status","business_status","health_status")||"").toLowerCase();
 const notes = [];
 if (!raw) notes.push(["No analysis yet","Upload a CSV dataset to create notifications."]);
 else {
  if (Number.isFinite(runway) && runway < 3) notes.push(["Low cash runway","Estimated runway is under three months. Review cash commitments soon."]);
  if (status.includes("danger")||status.includes("critical")||status.includes("poor")) notes.push(["Business health needs attention","Review the dashboard and recommendations for the latest analysis."]);
  if (!notes.length) notes.push(["No urgent alerts","No high-priority alert could be inferred from the current analysis."]);
 }
 mount.innerHTML='<section class="panel"><h2>Notifications</h2>'+notes.map(([h,t])=>'<div class="notice '+(h==="Low cash runway"?"warn":"")+'"><strong>'+h+'</strong><p class="muted">'+t+'</p></div>').join("")+'<p class="muted">Notifications are generated locally from the latest analysis saved in this browser.</p></section>';
} else if (page === "settings") {
 let user = {}; try { user = JSON.parse(localStorage.getItem("user")||"{}"); } catch (_) {}
 mount.innerHTML='<section class="panel"><h2>Account</h2><p class="muted">Signed in as <strong>'+escapeHtml(user.username||"user")+'</strong></p><form id="passwordForm"><div class="field"><label for="oldPassword">Current password</label><input id="oldPassword" type="password" required autocomplete="current-password"></div><div class="field"><label for="newPassword">New password</label><input id="newPassword" type="password" required minlength="8" autocomplete="new-password"></div><button class="btn" type="submit">Change password</button><p id="settingsStatus" class="muted" role="status"></p></form></section><section class="panel"><h2>Application settings</h2><div class="field"><label for="apiUrl">Backend API URL</label><input id="apiUrl" type="url" value="'+String(localStorage.getItem("api_url")||API_URL).replace(/"/g,"&quot;")+'"></div><button class="btn secondary" id="saveApiUrl">Save API URL</button></section>';
 document.getElementById("saveApiUrl")?.addEventListener("click",()=>{const url=document.getElementById("apiUrl").value.trim().replace(/\/$/,"");if(!/^https?:\/\//i.test(url)){document.getElementById("settingsStatus").textContent="Enter a valid http(s) URL.";return;}localStorage.setItem("api_url",url);document.getElementById("settingsStatus").textContent="Saved. Reload pages to use this API URL.";});
 document.getElementById("passwordForm")?.addEventListener("submit",async(e)=>{e.preventDefault();const status=document.getElementById("settingsStatus");status.textContent="Updating password…";try{const response=await fetch(API_URL+"/change-password",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(localStorage.getItem("access_token")||"")},body:JSON.stringify({old_password:document.getElementById("oldPassword").value,new_password:document.getElementById("newPassword").value})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.detail||"Password change failed");status.textContent="Password updated.";e.target.reset();}catch(err){status.textContent=err.message;}});
}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
})();