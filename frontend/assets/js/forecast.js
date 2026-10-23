// =====================================================
// BusinessPilot AI - Forecast Engine & Visualizer
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
    let activeHorizon = 6; // 3, 6, 12
    let activeScenario = "baseline"; // baseline, optimistic, conservative
    let simRevenueDelta = 0; // %
    let simExpenseDelta = 0; // %
    let tableFilter = "all"; // all, actual, forecast

    // Chart instances
    let chartRevExp = null;
    let chartCash = null;
    let chartProfit = null;

    // Currency Formatter
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
        // Horizon buttons
        document.querySelectorAll("[data-horizon]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-horizon]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                activeHorizon = parseInt(btn.dataset.horizon, 10);
                renderAll();
            });
        });

        // Scenario buttons
        document.querySelectorAll("[data-scenario]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-scenario]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                activeScenario = btn.dataset.scenario;
                // If scenario preset clicked, adjust slider defaults
                if (activeScenario === "optimistic") {
                    simRevenueDelta = 15;
                    simExpenseDelta = -5;
                } else if (activeScenario === "conservative") {
                    simRevenueDelta = -15;
                    simExpenseDelta = 10;
                } else {
                    simRevenueDelta = 0;
                    simExpenseDelta = 0;
                }
                syncSliderUI();
                renderAll();
            });
        });

        // Simulation sliders
        const revSlider = document.getElementById("simRevenueSlider");
        const expSlider = document.getElementById("simExpenseSlider");
        const cashInput = document.getElementById("simCashInput");
        const resetBtn = document.getElementById("resetSimBtn");

        revSlider?.addEventListener("input", (e) => {
            simRevenueDelta = parseFloat(e.target.value) || 0;
            document.getElementById("simRevenueVal").textContent = (simRevenueDelta >= 0 ? "+" : "") + simRevenueDelta + "%";
            document.querySelectorAll("[data-scenario]").forEach(b => b.classList.remove("active"));
            renderAll();
        });

        expSlider?.addEventListener("input", (e) => {
            simExpenseDelta = parseFloat(e.target.value) || 0;
            document.getElementById("simExpenseVal").textContent = (simExpenseDelta >= 0 ? "+" : "") + simExpenseDelta + "%";
            document.querySelectorAll("[data-scenario]").forEach(b => b.classList.remove("active"));
            renderAll();
        });

        cashInput?.addEventListener("change", (e) => {
            const val = parseFloat(e.target.value);
            if (Number.isFinite(val) && val >= 0) {
                initialCash = val;
                localStorage.setItem("initial_cash", String(val));
                renderAll();
            }
        });

        resetBtn?.addEventListener("click", () => {
            simRevenueDelta = 0;
            simExpenseDelta = 0;
            activeScenario = "baseline";
            document.querySelectorAll("[data-scenario]").forEach(b => {
                b.classList.toggle("active", b.dataset.scenario === "baseline");
            });
            syncSliderUI();
            renderAll();
        });

        // Table filters
        document.querySelectorAll("[data-table-filter]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-table-filter]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                tableFilter = btn.dataset.tableFilter;
                renderTable();
            });
        });

        // Export button
        document.getElementById("exportForecastCsv")?.addEventListener("click", exportForecastCsv);

        // Demo sample button
        document.getElementById("loadSampleBtn")?.addEventListener("click", loadSampleData);
    }

    function syncSliderUI() {
        const revSlider = document.getElementById("simRevenueSlider");
        const expSlider = document.getElementById("simExpenseSlider");
        const cashInput = document.getElementById("simCashInput");

        if (revSlider) {
            revSlider.value = simRevenueDelta;
            document.getElementById("simRevenueVal").textContent = (simRevenueDelta >= 0 ? "+" : "") + simRevenueDelta + "%";
        }
        if (expSlider) {
            expSlider.value = simExpenseDelta;
            document.getElementById("simExpenseVal").textContent = (simExpenseDelta >= 0 ? "+" : "") + simExpenseDelta + "%";
        }
        if (cashInput) {
            cashInput.value = initialCash;
        }
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
            syncSliderUI();
            renderAll();
        } catch (e) {
            console.error("Failed to parse analysis_result", e);
            showEmptyState(true);
        }
    }

    function showEmptyState(isEmpty) {
        const emptyHero = document.getElementById("emptyForecastHero");
        const mainContent = document.getElementById("forecastContent");
        if (emptyHero) emptyHero.style.display = isEmpty ? "block" : "none";
        if (mainContent) mainContent.style.display = isEmpty ? "none" : "block";
    }

    // Sample data loader for demo testing
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
        syncSliderUI();
        renderAll();
    }

    // 3. Process Forecast Mathematics
    function computeEffectiveModel() {
        if (!rawAnalysis) return null;

        let history = [];
        // Check if timeline is provided
        if (Array.isArray(rawAnalysis.timeline) && rawAnalysis.timeline.length > 0) {
            history = JSON.parse(JSON.stringify(rawAnalysis.timeline));
        } else {
            // Synthesize historical months from financial & trends if only summary is available
            const totRev = Number(rawAnalysis.financial?.total_revenue ?? rawAnalysis.total_revenue ?? 100000);
            const totExp = Number(rawAnalysis.financial?.total_expense ?? rawAnalysis.total_expense ?? 80000);
            const revTrend = Number(rawAnalysis.trends?.revenue_change_percent ?? 0);
            const expTrend = Number(rawAnalysis.trends?.expense_change_percent ?? 0);
            
            const nMonths = 6;
            const avgRev = totRev / nMonths;
            const avgExp = totExp / nMonths;
            const dRev = (avgRev * (revTrend / 100)) / (nMonths - 1);
            const dExp = (avgExp * (expTrend / 100)) / (nMonths - 1);

            const now = new Date();
            for (let i = nMonths - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const r = Math.max(0, avgRev - ((nMonths - 1) / 2 - (nMonths - 1 - i)) * dRev);
                const e = Math.max(0, avgExp - ((nMonths - 1) / 2 - (nMonths - 1 - i)) * dExp);
                history.push({
                    month: mStr,
                    revenue: Math.round(r),
                    expense: Math.round(e),
                    profit: Math.round(r - e),
                    net: Math.round(r - e),
                    is_forecast: false
                });
            }
        }

        // Calculate running cash for history
        let runningCash = initialCash;
        history.forEach(m => {
            runningCash += m.profit;
            m.cash_balance = runningCash;
        });

        // Linear regression for forecasting
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

        // Generate Forecast for up to 12 months forward
        const lastMonthStr = history[nHist - 1]?.month || "2026-12";
        const [ly, lm] = lastMonthStr.split("-").map(Number);

        const forecast = [];
        let forecastCash = runningCash;
        const revFactor = 1 + (simRevenueDelta / 100);
        const expFactor = 1 + (simExpenseDelta / 100);

        for (let step = 1; step <= 12; step++) {
            const targetM = lm + step;
            const py = ly + Math.floor((targetM - 1) / 12);
            const pm = ((targetM - 1) % 12) + 1;
            const mStr = `${py}-${String(pm).padStart(2, "0")}`;

            const x = (nHist - 1) + step;
            const basePredRev = Math.max(0, interceptRev + slopeRev * x);
            const basePredExp = Math.max(0, interceptExp + slopeExp * x);

            // Apply simulation modifiers
            const finalRev = Math.max(0, Math.round(basePredRev * revFactor));
            const finalExp = Math.max(0, Math.round(basePredExp * expFactor));
            const finalProfit = finalRev - finalExp;
            forecastCash += finalProfit;

            forecast.push({
                month: mStr,
                revenue: finalRev,
                expense: finalExp,
                profit: finalProfit,
                net: finalProfit,
                cash_balance: forecastCash,
                is_forecast: true
            });
        }

        return {
            history,
            forecast,
            slopeRev,
            slopeExp,
            runningCash
        };
    }

    // 4. Master Render
    function renderAll() {
        const model = computeEffectiveModel();
        if (!model) return;

        const { history, forecast, slopeRev, slopeExp } = model;
        const visibleForecast = forecast.slice(0, activeHorizon);

        renderHeaderBadge();
        renderKPIs(history, visibleForecast);
        renderCharts(history, visibleForecast);
        renderAIInsights(history, visibleForecast, slopeRev, slopeExp);
        renderTable();
    }

    function renderHeaderBadge() {
        const badge = document.getElementById("forecastSourceBadge");
        const filename = localStorage.getItem("uploaded_filename") || rawAnalysis?.filename || "ชุดข้อมูลของคุณ";
        if (badge) {
            badge.innerHTML = `<i class="fa-solid fa-file-csv text-cyan-400"></i> ${escapeHtml(filename)} (${activeHorizon} เดือน)`;
        }
    }

    // 5. Render Metric Cards
    function renderKPIs(history, forecast) {
        if (!forecast.length) return;

        const nextMonth = forecast[0];
        const lastActual = history[history.length - 1];

        // 1. Projected Revenue Next Month
        const revEl = document.getElementById("kpiProjectedRev");
        const revTrendEl = document.getElementById("kpiRevTrend");
        const revTotalEl = document.getElementById("kpiRevHorizonTotal");

        if (revEl) revEl.textContent = formatBaht(nextMonth.revenue);
        if (revTrendEl && lastActual) {
            const revDiff = nextMonth.revenue - lastActual.revenue;
            const revPct = lastActual.revenue > 0 ? (revDiff / lastActual.revenue) * 100 : 0;
            const isUp = revDiff >= 0;
            revTrendEl.className = isUp ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold";
            revTrendEl.innerHTML = `<i class="fa-solid fa-arrow-${isUp ? 'trend-up' : 'trend-down'}"></i> ${isUp ? '+' : ''}${formatNumber(revPct)}% เทียบเดือนล่าสุด`;
        }
        if (revTotalEl) {
            const sumRev = forecast.reduce((a, b) => a + b.revenue, 0);
            revTotalEl.textContent = `รวม ${activeHorizon} เดือน: ${formatBaht(sumRev)}`;
        }

        // 2. Projected Expenses Next Month
        const expEl = document.getElementById("kpiProjectedExp");
        const expTrendEl = document.getElementById("kpiExpTrend");
        const expTotalEl = document.getElementById("kpiExpHorizonTotal");

        if (expEl) expEl.textContent = formatBaht(nextMonth.expense);
        if (expTrendEl && lastActual) {
            const expDiff = nextMonth.expense - lastActual.expense;
            const expPct = lastActual.expense > 0 ? (expDiff / lastActual.expense) * 100 : 0;
            const isUp = expDiff > 0;
            // Expense increasing is usually cautionary (amber/rose)
            expTrendEl.className = isUp ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold";
            expTrendEl.innerHTML = `<i class="fa-solid fa-arrow-${isUp ? 'trend-up' : 'trend-down'}"></i> ${isUp ? '+' : ''}${formatNumber(expPct)}% เทียบเดือนล่าสุด`;
        }
        if (expTotalEl) {
            const sumExp = forecast.reduce((a, b) => a + b.expense, 0);
            expTotalEl.textContent = `รวม ${activeHorizon} เดือน: ${formatBaht(sumExp)}`;
        }

        // 3. Projected Profit / Loss
        const profitEl = document.getElementById("kpiProjectedProfit");
        const profitStatusEl = document.getElementById("kpiProfitStatus");
        const profitTotalEl = document.getElementById("kpiProfitHorizonTotal");

        if (profitEl) {
            profitEl.textContent = formatBaht(nextMonth.profit);
            profitEl.className = `text-2xl font-bold ${nextMonth.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        if (profitStatusEl) {
            const margin = nextMonth.revenue > 0 ? (nextMonth.profit / nextMonth.revenue) * 100 : 0;
            profitStatusEl.textContent = `อัตรากำไรคาดการณ์: ${formatNumber(margin)}%`;
        }
        if (profitTotalEl) {
            const sumProfit = forecast.reduce((a, b) => a + b.profit, 0);
            profitTotalEl.textContent = `กำไรสะสม ${activeHorizon} เดือน: ${formatBaht(sumProfit)}`;
        }

        // 4. Projected Runway
        const runwayEl = document.getElementById("kpiProjectedRunway");
        const runwayStatusEl = document.getElementById("kpiRunwayStatus");
        const runwayEndCashEl = document.getElementById("kpiRunwayEndCash");

        // Check if cash depletes
        let depletedIdx = -1;
        for (let i = 0; i < forecast.length; i++) {
            if (forecast[i].cash_balance <= 0) {
                depletedIdx = i;
                break;
            }
        }

        if (runwayEl) {
            if (depletedIdx >= 0) {
                runwayEl.textContent = `${depletedIdx + 1} เดือน`;
                runwayEl.className = "text-2xl font-bold text-rose-400";
            } else {
                runwayEl.textContent = `> ${activeHorizon} เดือน`;
                runwayEl.className = "text-2xl font-bold text-emerald-400";
            }
        }
        if (runwayStatusEl) {
            if (depletedIdx >= 0) {
                runwayStatusEl.className = "text-rose-400 font-medium";
                runwayStatusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> เสี่ยงเงินสดติดลบในเดือน ${forecast[depletedIdx].month}`;
            } else {
                runwayStatusEl.className = "text-emerald-400 font-medium";
                runwayStatusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> กระแสเงินสดเพียงพอตลอดช่วง`;
            }
        }
        if (runwayEndCashEl) {
            const lastCash = forecast[forecast.length - 1].cash_balance;
            runwayEndCashEl.textContent = `เงินสดสิ้นสุด: ${formatBaht(lastCash)}`;
        }
    }

    // 6. Chart.js Renderers
    function renderCharts(history, forecast) {
        if (!window.Chart) {
            console.warn("Chart.js not loaded");
            return;
        }

        renderRevExpChart(history, forecast);
        renderCashChart(history, forecast);
        renderProfitLossChart(history, forecast);
    }

    // Chart 1: Revenue & Expense (Historical solid + Forecast dashed)
    function renderRevExpChart(history, forecast) {
        const ctx = document.getElementById("revenueExpenseChart")?.getContext("2d");
        if (!ctx) return;

        const allLabels = [...history.map(h => h.month), ...forecast.map(f => f.month)];
        const nHist = history.length;

        // Actual series: values for history, null for forecast
        const actualRev = [...history.map(h => h.revenue), ...forecast.map(() => null)];
        const actualExp = [...history.map(h => h.expense), ...forecast.map(() => null)];

        // Forecast series: last actual point + forecast points so the line connects seamlessly!
        const forecastRev = [];
        const forecastExp = [];
        for (let i = 0; i < nHist - 1; i++) {
            forecastRev.push(null);
            forecastExp.push(null);
        }
        forecastRev.push(history[nHist - 1].revenue);
        forecastExp.push(history[nHist - 1].expense);
        forecast.forEach(f => {
            forecastRev.push(f.revenue);
            forecastExp.push(f.expense);
        });

        // Gradients
        const gradRev = ctx.createLinearGradient(0, 0, 0, 350);
        gradRev.addColorStop(0, "rgba(6, 182, 212, 0.35)");
        gradRev.addColorStop(1, "rgba(6, 182, 212, 0.0)");

        const gradExp = ctx.createLinearGradient(0, 0, 0, 350);
        gradExp.addColorStop(0, "rgba(244, 63, 94, 0.25)");
        gradExp.addColorStop(1, "rgba(244, 63, 94, 0.0)");

        if (chartRevExp) chartRevExp.destroy();

        chartRevExp = new Chart(ctx, {
            type: "line",
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: "รายรับจริง (Actual Revenue)",
                        data: actualRev,
                        borderColor: "#06b6d4",
                        backgroundColor: gradRev,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3,
                        pointBackgroundColor: "#06b6d4",
                        pointRadius: 4,
                        pointHoverRadius: 7
                    },
                    {
                        label: "พยากรณ์รายรับ (Forecast Revenue)",
                        data: forecastRev,
                        borderColor: "#22d3ee",
                        borderDash: [6, 6],
                        backgroundColor: "rgba(34, 211, 238, 0.06)",
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: "#22d3ee",
                        pointRadius: 4,
                        pointHoverRadius: 7
                    },
                    {
                        label: "ค่าใช้จ่ายจริง (Actual Expense)",
                        data: actualExp,
                        borderColor: "#f43f5e",
                        backgroundColor: gradExp,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3,
                        pointBackgroundColor: "#f43f5e",
                        pointRadius: 4,
                        pointHoverRadius: 7
                    },
                    {
                        label: "พยากรณ์ค่าใช้จ่าย (Forecast Expense)",
                        data: forecastExp,
                        borderColor: "#fb7185",
                        borderDash: [6, 6],
                        backgroundColor: "rgba(251, 113, 133, 0.06)",
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: "#fb7185",
                        pointRadius: 4,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: {
                            color: "#94a3b8",
                            font: { family: "Poppins", size: 12 },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: "rgba(15, 23, 42, 0.92)",
                        titleColor: "#f8fafc",
                        bodyColor: "#cbd5e1",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.raw === null || ctx.raw === undefined) return null;
                                return ` ${ctx.dataset.label}: ${formatBaht(ctx.raw)}`;
                            }
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

    // Chart 2: Cumulative Cash Runway
    function renderCashChart(history, forecast) {
        const ctx = document.getElementById("cashBalanceChart")?.getContext("2d");
        if (!ctx) return;

        const allLabels = [...history.map(h => h.month), ...forecast.map(f => f.month)];
        const allCash = [...history.map(h => h.cash_balance), ...forecast.map(f => f.cash_balance)];

        const gradCash = ctx.createLinearGradient(0, 0, 0, 260);
        gradCash.addColorStop(0, "rgba(168, 85, 247, 0.4)");
        gradCash.addColorStop(1, "rgba(59, 130, 246, 0.0)");

        if (chartCash) chartCash.destroy();

        chartCash = new Chart(ctx, {
            type: "line",
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: "เงินสดสะสม (Cash Balance)",
                        data: allCash,
                        borderColor: "#a855f7",
                        backgroundColor: gradCash,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: allCash.map(c => c <= 0 ? "#ef4444" : "#a855f7")
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
                            label: (ctx) => ` เงินสดสะสม: ${formatBaht(ctx.raw)}`
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

    // Chart 3: Monthly Net Profit / Loss Bars
    function renderProfitLossChart(history, forecast) {
        const ctx = document.getElementById("profitLossChart")?.getContext("2d");
        if (!ctx) return;

        const allLabels = [...history.map(h => h.month), ...forecast.map(f => f.month)];
        const allProfits = [...history.map(h => h.profit), ...forecast.map(f => f.profit)];

        const colors = allProfits.map((p, idx) => {
            const isForecast = idx >= history.length;
            if (p >= 0) {
                return isForecast ? "rgba(16, 185, 129, 0.55)" : "#10b981";
            } else {
                return isForecast ? "rgba(239, 68, 68, 0.55)" : "#ef4444";
            }
        });

        if (chartProfit) chartProfit.destroy();

        chartProfit = new Chart(ctx, {
            type: "bar",
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: "กำไร / ขาดทุนสุทธิ (Net Profit)",
                        data: allProfits,
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
                            label: (ctx) => ` กำไรสุทธิ: ${formatBaht(ctx.raw)}`
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

    // 7. AI Forecast Insights
    function renderAIInsights(history, forecast, slopeRev, slopeExp) {
        const container = document.getElementById("aiForecastInsights");
        if (!container) return;

        const insights = [];

        // Check backend forecast summary insights first
        if (Array.isArray(rawAnalysis?.forecast_summary?.insights) && rawAnalysis.forecast_summary.insights.length) {
            rawAnalysis.forecast_summary.insights.forEach(txt => {
                let type = "neutral";
                if (txt.includes("⚠️") || txt.includes("ติดลบ") || txt.includes("ลดลง") || txt.includes("สูงกว่า")) type = "risk";
                else if (txt.includes("เติบโต") || txt.includes("แข็งแกร่ง") || txt.includes("กำไร")) type = "opp";
                insights.push({ text: txt, type });
            });
        }

        // Add dynamic simulation insights
        if (simRevenueDelta !== 0 || simExpenseDelta !== 0) {
            insights.unshift({
                text: `สถานการณ์จำลอง (What-If): ปรับรายได้ ${simRevenueDelta >= 0 ? '+' : ''}${simRevenueDelta}% และค่าใช้จ่าย ${simExpenseDelta >= 0 ? '+' : ''}${simExpenseDelta}% ส่งผลให้กระแสเงินสดสิ้นสุดเป็น ${formatBaht(forecast[forecast.length - 1].cash_balance)}`,
                type: (simRevenueDelta >= simExpenseDelta) ? "opp" : "risk"
            });
        }

        // Depletion check
        const depleted = forecast.find(f => f.cash_balance <= 0);
        if (depleted && !insights.some(i => i.text.includes(depleted.month))) {
            insights.push({
                text: `⚠️ คำเตือนเร่งด่วน: เงินสดหมุนเวียนมีแนวโน้มหมดลงในเดือน ${depleted.month} ควรเตรียมสินเชื่อหมุนเวียนหรือตัดลดค่าใช้จ่ายไม่จำเป็นทันที`,
                type: "risk"
            });
        }

        // Fallback default insights if empty
        if (!insights.length) {
            if (slopeRev > 0) {
                insights.push({ text: `🚀 รายรับมีแนวโน้มเติบโตต่อเนื่องเฉลี่ย +฿${Math.round(slopeRev).toLocaleString()}/เดือน จากข้อมูลในอดีต`, type: "opp" });
            } else {
                insights.push({ text: `📉 รายรับมีแนวโน้มชะลอตัวเฉลี่ย ฿${Math.abs(Math.round(slopeRev)).toLocaleString()}/เดือน ควรเร่งกระตุ้นแคมเปญการขาย`, type: "risk" });
            }
            if (slopeExp > slopeRev) {
                insights.push({ text: `⚠️ อัตราการเพิ่มของค่าใช้จ่ายโตเร็วกว่ารายได้ ควรควบคุมต้นทุนคงที่ (Fixed Costs)`, type: "risk" });
            } else {
                insights.push({ text: `✅ การบริหารค่าใช้จ่ายมีเสถียรภาพสอดคล้องกับขนาดของธุรกิจ`, type: "opp" });
            }
        }

        container.innerHTML = insights.map(item => `
            <div class="insight-card ${item.type}">
                <div class="flex items-start gap-3">
                    <span class="text-lg">${item.type === 'risk' ? '⚠️' : (item.type === 'opp' ? '🚀' : '💡')}</span>
                    <div>
                        <p class="text-sm font-medium text-slate-200">${escapeHtml(item.text)}</p>
                    </div>
                </div>
            </div>
        `).join("");
    }

    // 8. Forecast Table
    function renderTable() {
        const tbody = document.getElementById("forecastTableBody");
        if (!tbody) return;

        const model = computeEffectiveModel();
        if (!model) return;

        let records = [];
        if (tableFilter === "all") {
            records = [...model.history, ...model.forecast.slice(0, activeHorizon)];
        } else if (tableFilter === "actual") {
            records = model.history;
        } else {
            records = model.forecast.slice(0, activeHorizon);
        }

        tbody.innerHTML = records.map(r => {
            const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
            const isProfit = r.profit >= 0;
            return `
                <tr class="${r.is_forecast ? 'forecast-row' : ''}">
                    <td class="font-medium text-white">${escapeHtml(r.month)}</td>
                    <td>
                        <span class="${r.is_forecast ? 'tag-forecast' : 'tag-actual'}">
                            ${r.is_forecast ? 'พยากรณ์' : 'ข้อมูลจริง'}
                        </span>
                    </td>
                    <td class="text-cyan-300 font-medium">${formatBaht(r.revenue)}</td>
                    <td class="text-rose-300 font-medium">${formatBaht(r.expense)}</td>
                    <td class="${isProfit ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">
                        ${isProfit ? '+' : ''}${formatBaht(r.profit)}
                    </td>
                    <td class="${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                        ${formatNumber(margin)}%
                    </td>
                    <td class="font-medium ${r.cash_balance <= 0 ? 'text-rose-400' : 'text-purple-300'}">
                        ${formatBaht(r.cash_balance)}
                    </td>
                </tr>
            `;
        }).join("");
    }

    // 9. Export Forecast CSV
    function exportForecastCsv() {
        const model = computeEffectiveModel();
        if (!model) return;

        const all = [...model.history, ...model.forecast.slice(0, activeHorizon)];
        const headers = ["Month", "Type", "Revenue", "Expense", "Profit_Loss", "Profit_Margin_Percent", "Cash_Balance"];
        const rows = all.map(r => {
            const margin = r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(2) : "0.00";
            return [
                r.month,
                r.is_forecast ? "Forecast" : "Actual",
                r.revenue,
                r.expense,
                r.profit,
                margin,
                r.cash_balance
            ];
        });

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `businesspilot-forecast-${activeHorizon}months.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
})();
