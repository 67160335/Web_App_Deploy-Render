// =====================================================
// BusinessPilot AI - Scenario Modeling & Simulation Engine
// =====================================================

(() => {
    // 1. Auth Guard
    const token = localStorage.getItem("access_token");
    if (!token && window.location.protocol !== "file:") {
        window.location.href = "login.html";
        return;
    }

    const API_URL = window.BUSINESSPILOT_API_URL || 
        ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
            ? "http://localhost:8000" 
            : "https://businesspilot-ai-backend.onrender.com");

    // State
    let rawAnalysis = null;
    let initialCash = 100000;
    let activeHorizon = 6; // 6 or 12 months
    let activePreset = "baseline"; // baseline, growth, defensive, custom

    // Levers
    let revDelta = 0; // % (-50 to +100)
    let expDelta = 0; // % (-50 to +100)
    let newMonthlyRev = 0; // ฿
    let addPayroll = 0; // ฿/month
    let oneTimeCapex = 0; // ฿ (month 1)
    let addFunding = 0; // ฿ (month 1)

    // Chart instances
    let chartCashComp = null;
    let chartRevExpComp = null;
    let chartProfitDelta = null;

    // Currency & Number Formatters
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

    // DOM Ready
    document.addEventListener("DOMContentLoaded", () => {
        setupUserHeader();
        setupLogout();
        setupControls();
        loadData();
    });

    function setupUserHeader() {
        try {
            const userRaw = localStorage.getItem("user");
            if (userRaw) {
                const user = JSON.parse(userRaw);
                const el = document.getElementById("profileName");
                if (el && user.username) el.textContent = user.username;
            }
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

    function setupControls() {
        // Horizon buttons (6 vs 12 months)
        document.querySelectorAll("[data-horizon]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-horizon]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                activeHorizon = parseInt(btn.dataset.horizon, 10);
                renderAll();
            });
        });

        // Preset cards
        document.querySelectorAll("[data-preset]").forEach(card => {
            card.addEventListener("click", () => {
                const preset = card.dataset.preset;
                applyPreset(preset);
            });
        });

        // Sliders & Inputs
        const revSlider = document.getElementById("leverRevSlider");
        const expSlider = document.getElementById("leverExpSlider");
        const newRevInput = document.getElementById("leverNewRevInput");
        const payrollInput = document.getElementById("leverPayrollInput");
        const capexInput = document.getElementById("leverCapexInput");
        const fundingInput = document.getElementById("leverFundingInput");
        const startCashInput = document.getElementById("leverCashInput");

        revSlider?.addEventListener("input", (e) => {
            revDelta = parseFloat(e.target.value) || 0;
            document.getElementById("leverRevVal").textContent = (revDelta >= 0 ? "+" : "") + revDelta + "%";
            markCustomPreset();
            renderAll();
        });

        expSlider?.addEventListener("input", (e) => {
            expDelta = parseFloat(e.target.value) || 0;
            document.getElementById("leverExpVal").textContent = (expDelta >= 0 ? "+" : "") + expDelta + "%";
            markCustomPreset();
            renderAll();
        });

        newRevInput?.addEventListener("change", (e) => {
            newMonthlyRev = Math.max(0, parseFloat(e.target.value) || 0);
            markCustomPreset();
            renderAll();
        });

        payrollInput?.addEventListener("change", (e) => {
            addPayroll = Math.max(0, parseFloat(e.target.value) || 0);
            markCustomPreset();
            renderAll();
        });

        capexInput?.addEventListener("change", (e) => {
            oneTimeCapex = Math.max(0, parseFloat(e.target.value) || 0);
            markCustomPreset();
            renderAll();
        });

        fundingInput?.addEventListener("change", (e) => {
            addFunding = Math.max(0, parseFloat(e.target.value) || 0);
            markCustomPreset();
            renderAll();
        });

        startCashInput?.addEventListener("change", (e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= 0) {
                initialCash = v;
                localStorage.setItem("initial_cash", String(v));
                renderAll();
            }
        });

        // Reset button
        document.getElementById("resetScenarioBtn")?.addEventListener("click", () => {
            applyPreset("baseline");
        });

        // Export CSV button
        document.getElementById("exportScenarioCsv")?.addEventListener("click", exportScenarioCsv);

        // Load demo sample button
        document.getElementById("loadSampleBtn")?.addEventListener("click", loadSampleData);
    }

    function markCustomPreset() {
        activePreset = "custom";
        document.querySelectorAll("[data-preset]").forEach(c => {
            c.classList.toggle("active", c.dataset.preset === "custom");
        });
    }

    function applyPreset(preset) {
        activePreset = preset;
        document.querySelectorAll("[data-preset]").forEach(c => {
            c.classList.toggle("active", c.dataset.preset === preset);
        });

        if (preset === "baseline") {
            revDelta = 0;
            expDelta = 0;
            newMonthlyRev = 0;
            addPayroll = 0;
            oneTimeCapex = 0;
            addFunding = 0;
        } else if (preset === "growth") {
            revDelta = 30;
            expDelta = 10;
            newMonthlyRev = 25000;
            addPayroll = 30000;
            oneTimeCapex = 50000;
            addFunding = 100000;
        } else if (preset === "defensive") {
            revDelta = -5;
            expDelta = -20;
            newMonthlyRev = 0;
            addPayroll = 0;
            oneTimeCapex = 0;
            addFunding = 0;
        }

        syncLeversUI();
        renderAll();
    }

    function syncLeversUI() {
        const revSlider = document.getElementById("leverRevSlider");
        const expSlider = document.getElementById("leverExpSlider");
        const newRevInput = document.getElementById("leverNewRevInput");
        const payrollInput = document.getElementById("leverPayrollInput");
        const capexInput = document.getElementById("leverCapexInput");
        const fundingInput = document.getElementById("leverFundingInput");
        const startCashInput = document.getElementById("leverCashInput");

        if (revSlider) {
            revSlider.value = revDelta;
            document.getElementById("leverRevVal").textContent = (revDelta >= 0 ? "+" : "") + revDelta + "%";
        }
        if (expSlider) {
            expSlider.value = expDelta;
            document.getElementById("leverExpVal").textContent = (expDelta >= 0 ? "+" : "") + expDelta + "%";
        }
        if (newRevInput) newRevInput.value = newMonthlyRev;
        if (payrollInput) payrollInput.value = addPayroll;
        if (capexInput) capexInput.value = oneTimeCapex;
        if (fundingInput) fundingInput.value = addFunding;
        if (startCashInput) startCashInput.value = initialCash;
    }

    // 2. Load & Parse Analysis Data
    function loadData() {
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
            syncLeversUI();
            renderAll();
        } catch (e) {
            console.error("Failed to parse analysis_result", e);
            showEmptyState(true);
        }
    }

    function showEmptyState(isEmpty) {
        const emptyHero = document.getElementById("emptyScenarioHero");
        const mainContent = document.getElementById("scenarioContent");
        if (emptyHero) emptyHero.style.display = isEmpty ? "block" : "none";
        if (mainContent) mainContent.style.display = isEmpty ? "none" : "block";
    }

    // Sample data loader for instant demo testing
    function loadSampleData() {
        const sampleTimeline = [
            { month: "2026-01", revenue: 120000, expense: 85000, profit: 35000, net: 35000, is_forecast: false },
            { month: "2026-02", revenue: 118000, expense: 87000, profit: 31000, net: 31000, is_forecast: false },
            { month: "2026-03", revenue: 115000, expense: 90000, profit: 25000, net: 25000, is_forecast: false },
            { month: "2026-04", revenue: 110000, expense: 93000, profit: 17000, net: 17000, is_forecast: false },
            { month: "2026-05", revenue: 105000, expense: 96000, profit: 9000, net: 9000, is_forecast: false },
            { month: "2026-06", revenue: 100000, expense: 99000, profit: 1000, net: 1000, is_forecast: false },
            { month: "2026-07", revenue: 95000, expense: 102000, profit: -7000, net: -7000, is_forecast: false },
            { month: "2026-08", revenue: 90000, expense: 105000, profit: -15000, net: -15000, is_forecast: false },
            { month: "2026-09", revenue: 87000, expense: 107000, profit: -20000, net: -20000, is_forecast: false },
            { month: "2026-10", revenue: 84000, expense: 109000, profit: -25000, net: -25000, is_forecast: false },
            { month: "2026-11", revenue: 80000, expense: 112000, profit: -32000, net: -32000, is_forecast: false },
            { month: "2026-12", revenue: 76000, expense: 115000, profit: -39000, net: -39000, is_forecast: false }
        ];

        initialCash = 150000;
        localStorage.setItem("initial_cash", "150000");
        localStorage.setItem("uploaded_filename", "sample_business_data.csv");

        rawAnalysis = {
            message: "Sample Business Analysis",
            filename: "sample_business_data.csv",
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
            timeline: sampleTimeline
        };

        localStorage.setItem("analysis_result", JSON.stringify(rawAnalysis));
        showEmptyState(false);
        syncLeversUI();
        renderAll();
    }

    // 3. Mathematical Simulation Model
    function computeScenarioModel() {
        if (!rawAnalysis) return null;

        // Extract historical timeline
        let history = [];
        if (Array.isArray(rawAnalysis.timeline) && rawAnalysis.timeline.length > 0) {
            history = JSON.parse(JSON.stringify(rawAnalysis.timeline));
        } else {
            const totRev = Number(rawAnalysis.financial?.total_revenue ?? rawAnalysis.total_revenue ?? 100000);
            const totExp = Number(rawAnalysis.financial?.total_expense ?? rawAnalysis.total_expense ?? 80000);
            const nMonths = 6;
            const avgRev = totRev / nMonths;
            const avgExp = totExp / nMonths;
            for (let i = nMonths - 1; i >= 0; i--) {
                history.push({
                    month: `2026-${String(6 - i).padStart(2, "0")}`,
                    revenue: avgRev,
                    expense: avgExp,
                    profit: avgRev - avgExp,
                    net: avgRev - avgExp
                });
            }
        }

        // Linear regression slopes for baseline projection
        const nHist = history.length;
        let slopeRev = 0, interceptRev = history[nHist - 1]?.revenue || 0;
        let slopeExp = 0, interceptExp = history[nHist - 1]?.expense || 0;

        if (nHist >= 2) {
            const xMean = (nHist - 1) / 2;
            const revMean = history.reduce((sum, h) => sum + h.revenue, 0) / nHist;
            const expMean = history.reduce((sum, h) => sum + h.expense, 0) / nHist;
            let denom = 0, numRev = 0, numExp = 0;
            for (let i = 0; i < nHist; i++) {
                const diffX = i - xMean;
                denom += diffX * diffX;
                numRev += diffX * (history[i].revenue - revMean);
                numExp += diffX * (history[i].expense - expMean);
            }
            if (denom !== 0) {
                slopeRev = numRev / denom;
                interceptRev = revMean - slopeRev * xMean;
                slopeExp = numExp / denom;
                interceptExp = expMean - slopeExp * xMean;
            }
        }

        // Calculate actual historical running cash
        let baseRunCash = initialCash;
        history.forEach(m => {
            baseRunCash += m.profit;
            m.cash_balance = baseRunCash;
        });

        const lastMonthStr = history[nHist - 1]?.month || "2026-12";
        const [ly, lm] = lastMonthStr.split("-").map(Number);

        // Build side-by-side monthly records for future horizon
        const comparisonRows = [];
        let curBaseCash = baseRunCash;
        let curSimCash = baseRunCash + addFunding; // Add funding injected in month 1

        const revMultiplier = 1 + (revDelta / 100);
        const expMultiplier = 1 + (expDelta / 100);

        for (let step = 1; step <= activeHorizon; step++) {
            const targetM = lm + step;
            const py = ly + Math.floor((targetM - 1) / 12);
            const pm = ((targetM - 1) % 12) + 1;
            const mStr = `${py}-${String(pm).padStart(2, "0")}`;

            const x = (nHist - 1) + step;
            const rawBaseRev = Math.max(0, interceptRev + slopeRev * x);
            const rawBaseExp = Math.max(0, interceptExp + slopeExp * x);
            const baseRev = Math.round(rawBaseRev);
            const baseExp = Math.round(rawBaseExp);
            const baseProfit = baseRev - baseExp;
            curBaseCash += baseProfit;

            // Scenario calculations
            const simRev = Math.max(0, Math.round(rawBaseRev * revMultiplier + newMonthlyRev));
            const oneTimeC = (step === 1) ? oneTimeCapex : 0;
            const simExp = Math.max(0, Math.round(rawBaseExp * expMultiplier + addPayroll + oneTimeC));
            const simProfit = simRev - simExp;
            curSimCash += simProfit;

            comparisonRows.push({
                month: mStr,
                step,
                // Baseline
                baseRevenue: baseRev,
                baseExpense: baseExp,
                baseProfit,
                baseCash: curBaseCash,
                // Simulated
                simRevenue: simRev,
                simExpense: simExp,
                simProfit,
                simCash: curSimCash,
                // Deltas
                profitDelta: simProfit - baseProfit,
                cashDelta: curSimCash - curBaseCash
            });
        }

        // Runway Calculations
        let baseDepletedMonth = null;
        let baseRunwayMonths = activeHorizon;
        for (let i = 0; i < comparisonRows.length; i++) {
            if (comparisonRows[i].baseCash <= 0) {
                baseDepletedMonth = comparisonRows[i].month;
                baseRunwayMonths = i + 1;
                break;
            }
        }

        let simDepletedMonth = null;
        let simRunwayMonths = activeHorizon;
        for (let i = 0; i < comparisonRows.length; i++) {
            if (comparisonRows[i].simCash <= 0) {
                simDepletedMonth = comparisonRows[i].month;
                simRunwayMonths = i + 1;
                break;
            }
        }

        return {
            history,
            comparisonRows,
            baseRunwayMonths,
            baseDepletedMonth,
            simRunwayMonths,
            simDepletedMonth,
            baseEndingCash: comparisonRows[comparisonRows.length - 1].baseCash,
            simEndingCash: comparisonRows[comparisonRows.length - 1].simCash
        };
    }

    // 4. Master Render
    function renderAll() {
        const model = computeScenarioModel();
        if (!model) return;

        renderHeaderBadge();
        renderKPIs(model);
        renderCharts(model);
        renderAIAdvisory(model);
        renderTable(model);
    }

    function renderHeaderBadge() {
        const badge = document.getElementById("scenarioSourceBadge");
        const filename = localStorage.getItem("uploaded_filename") || rawAnalysis?.filename || "ชุดข้อมูลจริง";
        if (badge) {
            badge.innerHTML = `<i class="fa-solid fa-file-csv text-cyan-400"></i> ${escapeHtml(filename)} (${activeHorizon} เดือน)`;
        }
    }

    // 5. Render Comparison KPI Cards
    function renderKPIs(model) {
        const { comparisonRows, baseRunwayMonths, simRunwayMonths, baseDepletedMonth, simDepletedMonth, baseEndingCash, simEndingCash } = model;
        if (!comparisonRows.length) return;

        // 1. Runway Comparison
        const runwaySimEl = document.getElementById("kpiSimRunway");
        const runwayBaseEl = document.getElementById("kpiBaseRunway");
        const runwayDeltaEl = document.getElementById("kpiRunwayDelta");

        if (runwaySimEl) {
            runwaySimEl.textContent = simDepletedMonth ? `${simRunwayMonths} เดือน` : `> ${activeHorizon} เดือน`;
            runwaySimEl.className = `text-2xl font-bold ${simDepletedMonth ? 'text-amber-400' : 'text-emerald-400'}`;
        }
        if (runwayBaseEl) {
            runwayBaseEl.textContent = baseDepletedMonth ? `${baseRunwayMonths} เดือน` : `> ${activeHorizon} เดือน`;
        }
        if (runwayDeltaEl) {
            const diff = simRunwayMonths - baseRunwayMonths;
            if (!simDepletedMonth && baseDepletedMonth) {
                runwayDeltaEl.className = "delta-badge delta-positive";
                runwayDeltaEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> พ้นวิกฤตเงินสด`;
            } else if (diff > 0) {
                runwayDeltaEl.className = "delta-badge delta-positive";
                runwayDeltaEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> +${diff} เดือน`;
            } else if (diff < 0) {
                runwayDeltaEl.className = "delta-badge delta-negative";
                runwayDeltaEl.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ${diff} เดือน`;
            } else {
                runwayDeltaEl.className = "delta-badge delta-neutral";
                runwayDeltaEl.textContent = "เท่าเดิม";
            }
        }

        // 2. Ending Cash Balance Comparison
        const cashSimEl = document.getElementById("kpiSimCash");
        const cashBaseEl = document.getElementById("kpiBaseCash");
        const cashDeltaEl = document.getElementById("kpiCashDelta");

        if (cashSimEl) {
            cashSimEl.textContent = formatBaht(simEndingCash);
            cashSimEl.className = `text-2xl font-bold ${simEndingCash >= 0 ? 'text-purple-400' : 'text-rose-400'}`;
        }
        if (cashBaseEl) cashBaseEl.textContent = formatBaht(baseEndingCash);
        if (cashDeltaEl) {
            const diff = simEndingCash - baseEndingCash;
            const isUp = diff >= 0;
            cashDeltaEl.className = `delta-badge ${isUp ? 'delta-positive' : 'delta-negative'}`;
            cashDeltaEl.innerHTML = `<i class="fa-solid fa-arrow-${isUp ? 'up' : 'down'}"></i> ${isUp ? '+' : ''}${formatBaht(diff)}`;
        }

        // 3. Average Monthly Profit Comparison
        const avgBaseProfit = comparisonRows.reduce((s, r) => s + r.baseProfit, 0) / activeHorizon;
        const avgSimProfit = comparisonRows.reduce((s, r) => s + r.simProfit, 0) / activeHorizon;

        const profitSimEl = document.getElementById("kpiSimProfit");
        const profitBaseEl = document.getElementById("kpiBaseProfit");
        const profitDeltaEl = document.getElementById("kpiProfitDelta");

        if (profitSimEl) {
            profitSimEl.textContent = formatBaht(avgSimProfit);
            profitSimEl.className = `text-2xl font-bold ${avgSimProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        if (profitBaseEl) profitBaseEl.textContent = formatBaht(avgBaseProfit);
        if (profitDeltaEl) {
            const diff = avgSimProfit - avgBaseProfit;
            const isUp = diff >= 0;
            profitDeltaEl.className = `delta-badge ${isUp ? 'delta-positive' : 'delta-negative'}`;
            profitDeltaEl.innerHTML = `<i class="fa-solid fa-arrow-${isUp ? 'up' : 'down'}"></i> ${isUp ? '+' : ''}${formatBaht(diff)}/เดือน`;
        }

        // 4. Strategic Risk Rating
        const riskPill = document.getElementById("scenarioRiskRating");
        if (riskPill) {
            if (simEndingCash > 100000 && !simDepletedMonth) {
                riskPill.className = "risk-pill risk-low";
                riskPill.innerHTML = `<i class="fa-solid fa-shield-check"></i> ความเสี่ยงต่ำ (Low Risk)`;
            } else if (simEndingCash > 0) {
                riskPill.className = "risk-pill risk-medium";
                riskPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ความเสี่ยงปานกลาง (Moderate Risk)`;
            } else {
                riskPill.className = "risk-pill risk-high";
                riskPill.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> เสี่ยงเงินสดติดลบ (High Risk)`;
            }
        }
    }

    // 6. Chart.js Renderers
    function renderCharts(model) {
        if (!window.Chart) return;

        renderCashComparisonChart(model);
        renderRevExpComparisonChart(model);
        renderProfitDeltaChart(model);
    }

    // Chart 1: Cash Balance: Baseline vs. Simulated
    function renderCashComparisonChart(model) {
        const ctx = document.getElementById("scenarioCashChart")?.getContext("2d");
        if (!ctx) return;

        const { comparisonRows } = model;
        const labels = comparisonRows.map(r => r.month);
        const baseCashData = comparisonRows.map(r => r.baseCash);
        const simCashData = comparisonRows.map(r => r.simCash);
        const zeroLine = comparisonRows.map(() => 0);

        const gradSim = ctx.createLinearGradient(0, 0, 0, 320);
        gradSim.addColorStop(0, "rgba(168, 85, 247, 0.35)");
        gradSim.addColorStop(1, "rgba(168, 85, 247, 0.0)");

        const gradBase = ctx.createLinearGradient(0, 0, 0, 320);
        gradBase.addColorStop(0, "rgba(6, 182, 212, 0.2)");
        gradBase.addColorStop(1, "rgba(6, 182, 212, 0.0)");

        if (chartCashComp) chartCashComp.destroy();

        chartCashComp = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "แผนจำลอง (Simulated Scenario)",
                        data: simCashData,
                        borderColor: "#a855f7",
                        backgroundColor: gradSim,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3,
                        pointBackgroundColor: simCashData.map(c => c <= 0 ? "#ef4444" : "#a855f7"),
                        pointRadius: 5
                    },
                    {
                        label: "แผนปัจจุบัน (Baseline Trend)",
                        data: baseCashData,
                        borderColor: "#06b6d4",
                        backgroundColor: gradBase,
                        borderDash: [5, 5],
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointBackgroundColor: "#06b6d4",
                        pointRadius: 4
                    },
                    {
                        label: "จุดวิกฤตเงินสด (฿0 Danger Line)",
                        data: zeroLine,
                        borderColor: "rgba(244, 63, 94, 0.7)",
                        borderWidth: 1.5,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: { color: "#94a3b8", font: { family: "Poppins", size: 12 }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.92)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${formatBaht(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8", font: { family: "Poppins" } }
                    },
                    y: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: {
                            color: "#94a3b8",
                            font: { family: "Poppins" },
                            callback: (v) => "฿" + (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : v))
                        }
                    }
                }
            }
        });
    }

    // Chart 2: Revenue vs Expenses under Simulated Plan
    function renderRevExpComparisonChart(model) {
        const ctx = document.getElementById("scenarioRevExpChart")?.getContext("2d");
        if (!ctx) return;

        const { comparisonRows } = model;
        const labels = comparisonRows.map(r => r.month);

        if (chartRevExpComp) chartRevExpComp.destroy();

        chartRevExpComp = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "รายได้จำลอง (Simulated Revenue)",
                        data: comparisonRows.map(r => r.simRevenue),
                        backgroundColor: "rgba(6, 182, 212, 0.75)",
                        borderRadius: 6
                    },
                    {
                        label: "ค่าใช้จ่ายจำลอง (Simulated Expenses)",
                        data: comparisonRows.map(r => r.simExpense),
                        backgroundColor: "rgba(244, 63, 94, 0.75)",
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: { color: "#94a3b8", font: { family: "Poppins", size: 11 }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.92)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${formatBaht(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8", font: { family: "Poppins", size: 11 } }
                    },
                    y: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: {
                            color: "#94a3b8",
                            font: { family: "Poppins", size: 11 },
                            callback: (v) => "฿" + (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : v))
                        }
                    }
                }
            }
        });
    }

    // Chart 3: Net Profit Delta (Monthly difference: Sim Profit - Base Profit)
    function renderProfitDeltaChart(model) {
        const ctx = document.getElementById("scenarioProfitDeltaChart")?.getContext("2d");
        if (!ctx) return;

        const { comparisonRows } = model;
        const labels = comparisonRows.map(r => r.month);
        const deltas = comparisonRows.map(r => r.profitDelta);

        const colors = deltas.map(d => d >= 0 ? "rgba(16, 185, 129, 0.75)" : "rgba(244, 63, 94, 0.75)");

        if (chartProfitDelta) chartProfitDelta.destroy();

        chartProfitDelta = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "ส่วนต่างกำไรเทียบแผนเดิม (Net Profit Delta)",
                        data: deltas,
                        backgroundColor: colors,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.92)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => ` ผลต่างกำไร: ${ctx.raw >= 0 ? '+' : ''}${formatBaht(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8", font: { family: "Poppins", size: 11 } }
                    },
                    y: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: {
                            color: "#94a3b8",
                            font: { family: "Poppins", size: 11 },
                            callback: (v) => (v >= 0 ? "+" : "") + "฿" + (Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + "k" : v)
                        }
                    }
                }
            }
        });
    }

    // 7. AI Scenario Advisory
    function renderAIAdvisory(model) {
        const container = document.getElementById("scenarioAiAdvice");
        if (!container) return;

        const { simRunwayMonths, baseRunwayMonths, simDepletedMonth, baseDepletedMonth, simEndingCash, baseEndingCash } = model;

        const tips = [];

        // Runway impact analysis
        const runwayDiff = simRunwayMonths - baseRunwayMonths;
        if (!simDepletedMonth && baseDepletedMonth) {
            tips.push({
                icon: "🚀",
                title: "แผนนี้ช่วยให้ธุรกิจพ้นวิกฤตเงินสดสำเร็จ",
                desc: `จากเดิมที่เงินสดจะหมดในเดือน ${baseDepletedMonth} ภายใต้แผนจำลองนี้กระแสเงินสดจะเพียงพอตลอดทั้ง ${activeHorizon} เดือนข้างหน้า`
            });
        } else if (runwayDiff > 0) {
            tips.push({
                icon: "⏱️",
                title: `ยืดอายุเงินสดได้เพิ่มขึ้น +${runwayDiff} เดือน`,
                desc: `การปรับแต่งตัวแปรช่วยลดอัตราการเผาเงินสด (Burn Rate) ทำให้มีเวลาขยายตลาดและพัฒนาผลิตภัณฑ์เพิ่มขึ้น`
            });
        } else if (runwayDiff < 0) {
            tips.push({
                icon: "⚠️",
                title: `ข้อควรระวัง: เงินสดอาจหมดเร็วขึ้น ${Math.abs(runwayDiff)} เดือน`,
                desc: `การเพิ่มค่าใช้จ่ายหรือลงทุนโดยไม่มียอดขายชดเชยที่เพียงพอ อาจทำให้เงินสดติดลบเร็วขึ้นในเดือน ${simDepletedMonth}`
            });
        }

        // CapEx / Funding feedback
        if (addFunding > 0) {
            tips.push({
                icon: "💰",
                title: `เงินทุนเสริมสภาพคล่อง +${formatBaht(addFunding)}`,
                desc: `ช่วยสร้างกันชนทางการเงินที่มั่นคง ทำให้เงินสดสิ้นสุดคาดการณ์อยู่ที่ ${formatBaht(simEndingCash)}`
            });
        }

        if (oneTimeCapex > 0) {
            tips.push({
                icon: "🏗️",
                title: `การลงทุนครั้งเดียว ${formatBaht(oneTimeCapex)} ในเดือนแรก`,
                desc: `เงินสดลดลงเร็วขึ้นในระยะสั้น ควรตรวจเช็คว่ารายได้ใหม่สามารถคุ้มทุนคืนเงินก้อนนี้ได้ภายในกี่เดือน`
            });
        }

        // Net wealth impact
        const netCashDiff = simEndingCash - baseEndingCash;
        if (netCashDiff > 0) {
            tips.push({
                icon: "📈",
                title: `สร้างมูลค่ากระแสเงินสดส่วนเพิ่ม +${formatBaht(netCashDiff)}`,
                desc: `เปรียบเทียบกับแผนเดิม แผนนี้เพิ่มขีดความสามารถในการแข่งขันและผลกำไรสะสมอย่างมีนัยสำคัญ`
            });
        }

        container.innerHTML = tips.map(t => `
            <div class="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <span class="text-2xl">${t.icon}</span>
                <div>
                    <h4 class="text-sm font-bold text-slate-200">${escapeHtml(t.title)}</h4>
                    <p class="text-xs text-slate-400 mt-1 leading-relaxed">${escapeHtml(t.desc)}</p>
                </div>
            </div>
        `).join("");
    }

    // 8. Scenario Table
    function renderTable(model) {
        const tbody = document.getElementById("scenarioTableBody");
        if (!tbody) return;

        const { comparisonRows } = model;
        tbody.innerHTML = comparisonRows.map(r => {
            const isProfitUp = r.profitDelta >= 0;
            return `
                <tr>
                    <td class="font-medium text-white">${escapeHtml(r.month)}</td>
                    <td class="text-slate-400">${formatBaht(r.baseRevenue)}</td>
                    <td class="text-cyan-300 font-semibold">${formatBaht(r.simRevenue)}</td>
                    <td class="text-slate-400">${formatBaht(r.baseExpense)}</td>
                    <td class="text-rose-300 font-semibold">${formatBaht(r.simExpense)}</td>
                    <td class="${r.baseProfit >= 0 ? 'text-slate-300' : 'text-slate-500'}">${formatBaht(r.baseProfit)}</td>
                    <td class="${r.simProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">${formatBaht(r.simProfit)}</td>
                    <td class="${isProfitUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}">
                        ${isProfitUp ? '+' : ''}${formatBaht(r.profitDelta)}
                    </td>
                    <td class="${r.simCash <= 0 ? 'text-rose-400 font-bold' : 'text-purple-300 font-medium'}">${formatBaht(r.simCash)}</td>
                </tr>
            `;
        }).join("");
    }

    // 9. Export CSV
    function exportScenarioCsv() {
        const model = computeScenarioModel();
        if (!model) return;

        const { comparisonRows } = model;
        const headers = ["Month", "Base_Revenue", "Sim_Revenue", "Base_Expense", "Sim_Expense", "Base_Profit", "Sim_Profit", "Profit_Delta", "Sim_Cash_Balance"];
        const rows = comparisonRows.map(r => [
            r.month,
            r.baseRevenue,
            r.simRevenue,
            r.baseExpense,
            r.simExpense,
            r.baseProfit,
            r.simProfit,
            r.profitDelta,
            r.simCash
        ]);

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `businesspilot-scenario-${activePreset}-${activeHorizon}months.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
})();
