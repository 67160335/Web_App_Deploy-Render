// =====================================================
// BusinessPilot AI - Executive Report Engine
// =====================================================

(() => {
    const token = localStorage.getItem("access_token");
    if (!token && window.location.protocol !== "file:") {
        window.location.href = "login.html";
        return;
    }

    const API_URL = window.BUSINESSPILOT_API_URL || 
        ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
            ? "http://localhost:8000" 
            : "https://businesspilot-ai-backend.onrender.com");

    let rawAnalysis = null;
    let initialCash = 100000;
    let currentUser = {};

    const formatBaht = (val, maxDecimals = 0) => {
        if (!Number.isFinite(Number(val))) return "฿0";
        return new Intl.NumberFormat("th-TH", {
            style: "currency",
            currency: "THB",
            maximumFractionDigits: maxDecimals,
            minimumFractionDigits: maxDecimals
        }).format(Number(val));
    };

    const formatNumber = (val, decimals = 1) => {
        if (!Number.isFinite(Number(val))) return "0";
        return new Intl.NumberFormat("th-TH", {
            maximumFractionDigits: decimals,
            minimumFractionDigits: decimals
        }).format(Number(val));
    };

    document.addEventListener("DOMContentLoaded", () => {
        loadUser();
        setupLogout();
        setupActions();
        loadReportData();
    });

    function loadUser() {
        try {
            const raw = localStorage.getItem("user");
            if (raw) currentUser = JSON.parse(raw);
            localStorage.removeItem("report_recipient_email");
            const nameEl = document.getElementById("profileName");
            if (nameEl && currentUser.username) nameEl.textContent = currentUser.username;
        } catch (_) {}
    }

    function setupLogout() {
        document.getElementById("logoutLink")?.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` }
                });
            } catch (_) {}
            ["access_token", "user", "uploaded_filename", "analysis_result", "initial_cash"].forEach(k => localStorage.removeItem(k));
            window.location.href = "login.html";
        });
    }

    function setupActions() {
        // Print / PDF Button
        document.getElementById("printReportBtn")?.addEventListener("click", () => {
            window.print();
        });

        // Export Full CSV
        document.getElementById("exportCsvBtn")?.addEventListener("click", exportFullCsv);

        // Export JSON
        document.getElementById("exportJsonBtn")?.addEventListener("click", exportJsonData);

        // Email Report Button
        document.getElementById("emailReportBtn")?.addEventListener("click", emailReportSummary);

        // Load Sample Button
        document.getElementById("loadSampleBtn")?.addEventListener("click", loadSampleData);
    }

    function loadReportData() {
        const raw = localStorage.getItem("analysis_result");
        const cashRaw = localStorage.getItem("initial_cash");
        if (cashRaw && Number.isFinite(Number(cashRaw))) {
            initialCash = parseFloat(cashRaw);
        }

        if (!raw) {
            showEmptyState(true);
            return;
        }

        try {
            rawAnalysis = JSON.parse(raw);
            showEmptyState(false);
            renderReport();
        } catch (e) {
            console.error("Failed to parse report data", e);
            showEmptyState(true);
        }
    }

    function showEmptyState(isEmpty) {
        const emptyHero = document.getElementById("emptyReportHero");
        const mainContent = document.getElementById("reportContent");
        if (emptyHero) emptyHero.style.display = isEmpty ? "block" : "none";
        if (mainContent) mainContent.style.display = isEmpty ? "none" : "block";
    }

    // Sample data loader
    function loadSampleData() {
        const sampleTimeline = [
            { month: "2026-01", revenue: 120000, expense: 85000, profit: 35000, net: 35000 },
            { month: "2026-02", revenue: 118000, expense: 87000, profit: 31000, net: 31000 },
            { month: "2026-03", revenue: 115000, expense: 90000, profit: 25000, net: 25000 },
            { month: "2026-04", revenue: 110000, expense: 93000, profit: 17000, net: 17000 },
            { month: "2026-05", revenue: 105000, expense: 96000, profit: 9000, net: 9000 },
            { month: "2026-06", revenue: 100000, expense: 99000, profit: 1000, net: 1000 },
            { month: "2026-07", revenue: 95000, expense: 102000, profit: -7000, net: -7000 },
            { month: "2026-08", revenue: 90000, expense: 105000, profit: -15000, net: -15000 },
            { month: "2026-09", revenue: 87000, expense: 107000, profit: -20000, net: -20000 },
            { month: "2026-10", revenue: 84000, expense: 109000, profit: -25000, net: -25000 },
            { month: "2026-11", revenue: 80000, expense: 112000, profit: -32000, net: -32000 },
            { month: "2026-12", revenue: 76000, expense: 115000, profit: -39000, net: -39000 }
        ];

        initialCash = 150000;
        localStorage.setItem("initial_cash", "150000");
        localStorage.setItem("uploaded_filename", "sample_business_data.csv");

        rawAnalysis = {
            message: "Sample Executive Analysis",
            filename: "sample_business_data.csv",
            business_health: {
                score: 72,
                status: "Watch"
            },
            financial: {
                total_revenue: 1180000,
                total_expense: 1200000,
                profit_loss: -20000,
                profit_margin_percent: -1.69
            },
            cash_flow: {
                initial_cash: 150000,
                monthly_burn_rate: 32000,
                cash_runway_months: 4.69
            },
            trends: {
                revenue_change_percent: -36.67,
                expense_change_percent: 35.29
            },
            recommendations: [
                "ค่าใช้จ่ายสูงกว่ารายรับ ควรลดค่าใช้จ่ายคงที่หรือเพิ่มรายได้เสริม",
                "รายรับมีแนวโน้มลดลง ควรทบทวนกลยุทธ์การขายและทำการตลาดเจาะกลุ่มลูกค้าเดิม",
                "เงินสดมีแนวโน้มหมดภายใน 5 เดือน ควรเตรียมเงินทุนหมุนเวียนสำรอง"
            ],
            timeline: sampleTimeline
        };

        localStorage.setItem("analysis_result", JSON.stringify(rawAnalysis));
        showEmptyState(false);
        renderReport();
    }

    function renderReport() {
        if (!rawAnalysis) return;

        const fin = rawAnalysis.financial || {};
        const cash = rawAnalysis.cash_flow || {};
        const health = rawAnalysis.business_health || {};
        const trends = rawAnalysis.trends || {};
        const filename = localStorage.getItem("uploaded_filename") || rawAnalysis.filename || "Business Dataset";

        // Header Metadata
        const titleEl = document.getElementById("repDatasetTitle");
        const refEl = document.getElementById("repReferenceId");
        const dateEl = document.getElementById("repGeneratedDate");
        const scoreBadge = document.getElementById("repHealthBadge");

        if (titleEl) titleEl.textContent = filename;
        if (refEl) refEl.textContent = `REF: BP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

        const score = Number(health.score || 0);
        const status = health.status || "Analyzed";
        if (scoreBadge) {
            const isGood = score >= 70;
            scoreBadge.className = `px-3 py-1 rounded-full text-xs font-bold ${isGood ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`;
            scoreBadge.innerHTML = `<i class="fa-solid fa-heart-pulse mr-1"></i> Health Score: ${score}/100 (${status})`;
        }

        // Section 1: KPI Grid
        const totRev = Number(fin.total_revenue || 0);
        const totExp = Number(fin.total_expense || 0);
        const profit = Number(fin.profit_loss || (totRev - totExp));
        const margin = Number(fin.profit_margin_percent || (totRev > 0 ? (profit / totRev) * 100 : 0));
        const runway = Number(cash.cash_runway_months);
        const burnRate = Number(cash.monthly_burn_rate || 0);

        setVal("repTotalRevenue", formatBaht(totRev));
        setVal("repTotalExpense", formatBaht(totExp));
        
        const profitEl = document.getElementById("repNetProfit");
        if (profitEl) {
            profitEl.textContent = (profit >= 0 ? "+" : "") + formatBaht(profit);
            profitEl.className = `text-2xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }

        setVal("repProfitMargin", `${formatNumber(margin)}%`);
        setVal("repBurnRate", formatBaht(burnRate) + "/เดือน");
        setVal("repRunway", Number.isFinite(runway) ? `${runway.toFixed(1)} เดือน` : "N/A (กระแสเงินสดบวก)");

        // Section 2: Financial Ratios
        const opexRatio = totRev > 0 ? (totExp / totRev) * 100 : 100;
        setVal("repOpexRatio", `${formatNumber(opexRatio)}%`);
        setBar("repOpexRatioBar", Math.min(100, opexRatio), opexRatio <= 85 ? "#10b981" : "#f43f5e");

        const revTrend = Number(trends.revenue_change_percent || 0);
        const expTrend = Number(trends.expense_change_percent || 0);
        setVal("repRevGrowth", `${revTrend >= 0 ? '+' : ''}${formatNumber(revTrend)}%`);
        setVal("repExpGrowth", `${expTrend >= 0 ? '+' : ''}${formatNumber(expTrend)}%`);

        // Section 3: Monthly Audit Table
        renderMonthlyTable();

        // Section 4: Recommendations
        renderRecommendations();
    }

    function renderMonthlyTable() {
        const tbody = document.getElementById("repTableBody");
        const tfoot = document.getElementById("repTableFoot");
        if (!tbody) return;

        let records = [];
        if (Array.isArray(rawAnalysis.timeline) && rawAnalysis.timeline.length) {
            records = rawAnalysis.timeline;
        } else {
            const totRev = Number(rawAnalysis.financial?.total_revenue || 0);
            const totExp = Number(rawAnalysis.financial?.total_expense || 0);
            records = [
                { month: "ยอดรวมทั้งสิ้น", revenue: totRev, expense: totExp, profit: totRev - totExp }
            ];
        }

        let sumRev = 0, sumExp = 0, sumProfit = 0;
        let runningCash = initialCash;

        tbody.innerHTML = records.map(r => {
            sumRev += r.revenue;
            sumExp += r.expense;
            sumProfit += r.profit;
            runningCash += r.profit;

            const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
            const isProfit = r.profit >= 0;

            return `
                <tr class="border-b border-slate-800 text-xs">
                    <td class="font-medium text-white">${escapeHtml(r.month)}</td>
                    <td class="text-slate-300">${formatBaht(r.revenue)}</td>
                    <td class="text-slate-300">${formatBaht(r.expense)}</td>
                    <td class="${isProfit ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">
                        ${isProfit ? '+' : ''}${formatBaht(r.profit)}
                    </td>
                    <td class="${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                        ${formatNumber(margin)}%
                    </td>
                    <td class="font-medium ${runningCash <= 0 ? 'text-rose-400' : 'text-purple-300'}">
                        ${formatBaht(runningCash)}
                    </td>
                </tr>
            `;
        }).join("");

        if (tfoot) {
            const avgMargin = sumRev > 0 ? (sumProfit / sumRev) * 100 : 0;
            tfoot.innerHTML = `
                <tr class="text-xs text-white font-bold bg-slate-900">
                    <td>ยอดรวม (Total)</td>
                    <td class="text-cyan-400">${formatBaht(sumRev)}</td>
                    <td class="text-rose-400">${formatBaht(sumExp)}</td>
                    <td class="${sumProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${sumProfit >= 0 ? '+' : ''}${formatBaht(sumProfit)}</td>
                    <td>${formatNumber(avgMargin)}%</td>
                    <td class="text-purple-400">${formatBaht(runningCash)}</td>
                </tr>
            `;
        }
    }

    function renderRecommendations() {
        const listEl = document.getElementById("repRecommendationsList");
        if (!listEl) return;

        const recs = Array.isArray(rawAnalysis.recommendations) ? rawAnalysis.recommendations : [];
        if (!recs.length) {
            listEl.innerHTML = `<li class="text-xs text-slate-400">ยังไม่มีข้อเสนอแนะเฉพาะสำหรับชุดข้อมูลนี้</li>`;
            return;
        }

        listEl.innerHTML = recs.map(r => {
            const txt = typeof r === "string" ? r : (r.message || JSON.stringify(r));
            return `
                <li class="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-200">
                    <i class="fa-solid fa-check text-cyan-400 mt-0.5"></i>
                    <span>${escapeHtml(txt)}</span>
                </li>
            `;
        }).join("");
    }

    // Export CSV
    function exportFullCsv() {
        if (!rawAnalysis) return;
        const records = Array.isArray(rawAnalysis.timeline) ? rawAnalysis.timeline : [];
        const headers = ["Month", "Revenue", "Expense", "Net_Profit", "Profit_Margin_Percent"];
        const rows = records.map(r => {
            const margin = r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(2) : "0.00";
            return [r.month, r.revenue, r.expense, r.profit, margin];
        });

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `businesspilot-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Export JSON
    function exportJsonData() {
        if (!rawAnalysis) return;
        const blob = new Blob([JSON.stringify(rawAnalysis, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `businesspilot-analysis-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Email Report Summary
    async function emailReportSummary() {
        const btn = document.getElementById("emailReportBtn");
        const recipient = document.getElementById("reportRecipientEmail")?.value.trim();
        if (!rawAnalysis) {
            showToast("ยังไม่มีข้อมูลรายงาน กรุณาอัปโหลดและวิเคราะห์ข้อมูลก่อน");
            return;
        }
        if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            showToast("กรุณากรอกอีเมลผู้รับให้ถูกต้อง");
            document.getElementById("reportRecipientEmail")?.focus();
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังส่ง...`;
        }

        const fin = rawAnalysis.financial || {};
        const cash = rawAnalysis.cash_flow || {};
        const trends = rawAnalysis.trends || {};
        const health = rawAnalysis.business_health || {};
        const totalRevenue = Number(fin.total_revenue || 0);
        const totalExpense = Number(fin.total_expense || 0);
        const netProfit = Number(fin.profit_loss ?? totalRevenue - totalExpense);
        const payload = {
            email: recipient,
            subject: `[BusinessPilot] สรุปภาพรวมธุรกิจสำหรับผู้บริหาร`,
            dataset_name: localStorage.getItem("uploaded_filename") || rawAnalysis.filename || "ชุดข้อมูลธุรกิจ",
            period: Array.isArray(rawAnalysis.timeline) && rawAnalysis.timeline.length
                ? `${rawAnalysis.timeline[0].month} ถึง ${rawAnalysis.timeline[rawAnalysis.timeline.length - 1].month}` : "ช่วงข้อมูลทั้งหมด",
            total_revenue: totalRevenue,
            total_expense: totalExpense,
            net_profit: netProfit,
            profit_margin_percent: Number(fin.profit_margin_percent ?? (totalRevenue ? netProfit / totalRevenue * 100 : 0)),
            monthly_burn_rate: Number(cash.monthly_burn_rate || 0),
            cash_runway_months: Number.isFinite(Number(cash.cash_runway_months)) ? Number(cash.cash_runway_months) : null,
            revenue_change_percent: Number(trends.revenue_change_percent || 0),
            expense_change_percent: Number(trends.expense_change_percent || 0),
            business_status: health.status || "ยังไม่มีสถานะ",
            health_score: Number(health.score || 0),
            recommendations: (Array.isArray(rawAnalysis.recommendations) ? rawAnalysis.recommendations : []).map(r => typeof r === "string" ? r : r.message || "").filter(Boolean).slice(0, 5)
        };

        try {
            const resp = await fetch(`${API_URL}/send-report-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || data.delivery_status !== "sent") throw new Error(data.detail || data.message || "ระบบยังส่งอีเมลไม่สำเร็จ");
            localStorage.setItem("alert_email", recipient);
            showToast(`ส่งรายงานถึง ${recipient} สำเร็จแล้ว`);
        } catch (err) {
            showToast(`ส่งไม่สำเร็จ: ${err.message || "ตรวจสอบการเชื่อมต่อและการตั้งค่าอีเมล"}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-envelope mr-1"></i> ส่งรายงานเข้าอีเมล`;
            }
        }
    }

    function setVal(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setBar(id, widthPct, color) {
        const el = document.getElementById(id);
        if (el) {
            el.style.width = `${widthPct}%`;
            if (color) el.style.backgroundColor = color;
        }
    }

    function showToast(msg) {
        const toast = document.createElement("div");
        toast.className = "fixed bottom-5 right-5 z-50 bg-slate-900 border border-cyan-500 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2";
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-cyan-400"></i> <span>${escapeHtml(msg)}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function escapeHtml(str) {
        return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
})();
