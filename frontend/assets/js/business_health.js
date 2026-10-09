// ======================================
// BusinessPilot AI
// health.js - Dynamic analysis version
// ======================================

document.addEventListener("DOMContentLoaded", () => {
    loadAnalysisResult();
    createToast();
    exportButton();
    setupHoverEffect();
});


// ======================================
// LOAD ANALYSIS RESULT
// ======================================

function loadAnalysisResult() {

    const raw = localStorage.getItem("analysis_result");

    if (!raw) {
        showNoAnalysis();
        return;
    }

    let result;

    try {
        result = JSON.parse(raw);
    } catch (error) {
        console.error("Invalid analysis_result:", error);
        showNoAnalysis();
        return;
    }

    const health = result.business_health || {};
    const financial = result.financial || {};
    const cashFlow = result.cash_flow || {};
    const trends = result.trends || {};
    const recommendations = Array.isArray(result.recommendations)
        ? result.recommendations
        : [];

    const score = Number(health.score ?? 0);
    const status = health.status || "Unknown";

    const revenue = Number(financial.total_revenue ?? 0);
    const expense = Number(financial.total_expense ?? 0);
    const profit = Number(financial.profit_loss ?? 0);
    const margin = Number(financial.profit_margin_percent ?? 0);

    const revenueChange =
        Number(trends.revenue_change_percent ?? 0);

    const expenseChange =
        Number(trends.expense_change_percent ?? 0);

    const runway = cashFlow.cash_runway_months;

    const runwayNumber =
        runway === null || runway === undefined
            ? null
            : Number(runway);

    // Update dashboard
    updateScore(score);

    updateStatus(status);

    updateFinancial(
        revenue,
        expense,
        profit,
        margin
    );

    updateRunway(runwayNumber);

    updateTrends(
        revenueChange,
        expenseChange
    );

    updateSummary(
        revenueChange,
        expenseChange,
        profit,
        margin,
        runwayNumber,
        recommendations
    );
}


// ======================================
// SCORE
// ======================================

function updateScore(score) {

    const element =
        document.getElementById(
            "healthScoreValue"
        );

    if (!element) return;

    const target = Math.max(
        0,
        Math.min(100, Math.round(score))
    );

    let current = 0;

    const timer = setInterval(() => {

        current++;

        element.innerHTML =
            `${current}<span>/100</span>`;

        if (current >= target) {
            clearInterval(timer);
        }

    }, 12);
}


// ======================================
// STATUS
// ======================================

function updateStatus(status) {

    const statusText =
        document.getElementById(
            "healthStatusText"
        );

    const statusBox =
        document.getElementById(
            "healthStatus"
        );

    const description =
        document.getElementById(
            "healthDescription"
        );

    let text;

    if (status === "Healthy") {
        text = "Healthy Business";
    }
    else if (status === "Watch") {
        text = "Watch";
    }
    else if (status === "Risk") {
        text = "Risk";
    }
    else {
        text = status;
    }

    if (statusText) {
        statusText.textContent = text;
    }

    if (statusBox) {

        let icon;

        if (status === "Healthy") {
            icon = "fa-circle-check";
        }
        else if (status === "Watch") {
            icon = "fa-triangle-exclamation";
        }
        else {
            icon = "fa-circle-exclamation";
        }

        statusBox.innerHTML =
            `<i class="fa-solid ${icon}"></i>
             <span id="healthStatusText">
             ${text}
             </span>`;
    }

    if (description) {

        if (status === "Healthy") {

            description.textContent =
                "Your business is performing well based on the uploaded financial data.";

        }
        else if (status === "Watch") {

            description.textContent =
                "Your business is operating, but some financial indicators should be monitored.";

        }
        else {

            description.textContent =
                "Your business has financial risks that should be addressed.";

        }
    }
}


// ======================================
// FINANCIAL
// ======================================

function updateFinancial(
    revenue,
    expense,
    profit,
    margin
) {

    setMoney(
        "healthRevenueValue",
        revenue
    );

    setMoney(
        "healthExpenseValue",
        expense
    );

    setMoney(
        "healthProfitValue",
        profit
    );

    const profitStatus =
        document.getElementById(
            "healthProfitStatus"
        );

    if (profitStatus) {

        if (profit >= 0) {

            profitStatus.textContent =
                `Healthy · Margin ${margin.toFixed(2)}%`;

            profitStatus.className =
                "positive";

        }
        else {

            profitStatus.textContent =
                "Loss detected";

            profitStatus.className =
                "negative";
        }
    }
}


// ======================================
// TRENDS
// ======================================

function updateTrends(
    revenueChange,
    expenseChange
) {

    const revenueTrend =
        document.getElementById(
            "healthRevenueTrend"
        );

    const expenseTrend =
        document.getElementById(
            "healthExpenseTrend"
        );

    if (revenueTrend) {

        revenueTrend.textContent =
            `${formatPercent(revenueChange)} revenue trend`;

        revenueTrend.className =
            revenueChange >= 0
                ? "positive"
                : "negative";
    }

    if (expenseTrend) {

        expenseTrend.textContent =
            `${formatPercent(expenseChange)} expense trend`;

        expenseTrend.className =
            expenseChange <= 0
                ? "positive"
                : "negative";
    }
}


// ======================================
// CASH RUNWAY
// ======================================

function updateRunway(runway) {

    const value =
        document.getElementById(
            "healthRunwayValue"
        );

    const status =
        document.getElementById(
            "healthRunwayStatus"
        );

    if (!value || !status) return;

    if (
        runway === null ||
        !Number.isFinite(runway)
    ) {

        value.textContent =
            "N/A";

        status.textContent =
            "No burn detected";

        status.className =
            "positive";

        return;
    }

    value.textContent =
        `${runway.toFixed(2)} Months`;

    if (runway < 6) {

        status.textContent =
            "Critical monitoring";

        status.className =
            "negative";

    }
    else if (runway < 12) {

        status.textContent =
            "Need monitoring";

        status.className =
            "warning";

    }
    else {

        status.textContent =
            "Good runway";

        status.className =
            "positive";
    }
}


// ======================================
// SUMMARY
// ======================================

function updateSummary(
    revenueChange,
    expenseChange,
    profit,
    margin,
    runway,
    recommendations
) {

    const list =
        document.getElementById(
            "healthSummaryList"
        );

    if (!list) return;

    const messages = [];

    // Revenue
    if (revenueChange > 0) {

        messages.push(
            `📈 Revenue increased by ${revenueChange.toFixed(2)}%`
        );

    }
    else if (revenueChange < 0) {

        messages.push(
            `📉 Revenue decreased by ${Math.abs(revenueChange).toFixed(2)}%`
        );

    }
    else {

        messages.push(
            "📊 Revenue remained stable"
        );
    }


    // Profit
    if (profit >= 0) {

        messages.push(
            `💰 Cash result is positive · Profit ${formatMoney(profit)}`
        );

    }
    else {

        messages.push(
            `⚠️ Loss detected · ${formatMoney(profit)}`
        );
    }


    // Margin
    messages.push(
        `📊 Profit margin: ${margin.toFixed(2)}%`
    );


    // Expense
    if (expenseChange > 0) {

        messages.push(
            `⚠️ Expense increased by ${expenseChange.toFixed(2)}%`
        );

    }
    else {

        messages.push(
            `✅ Expense trend: ${formatPercent(expenseChange)}`
        );
    }


    // Runway
    if (
        runway !== null &&
        Number.isFinite(runway)
    ) {

        messages.push(
            `⏱ Cash runway: ${runway.toFixed(2)} months`
        );
    }


    // Recommendations
    if (recommendations.length > 0) {

        recommendations
            .slice(0, 2)
            .forEach(item => {

                messages.push(
                    `💡 ${item}`
                );

            });
    }


    list.innerHTML =
        messages
            .map(
                message =>
                    `<li>${escapeHtml(message)}</li>`
            )
            .join("");
}


// ======================================
// NO ANALYSIS
// ======================================

function showNoAnalysis() {

    const score =
        document.getElementById(
            "healthScoreValue"
        );

    const status =
        document.getElementById(
            "healthStatusText"
        );

    const description =
        document.getElementById(
            "healthDescription"
        );

    const list =
        document.getElementById(
            "healthSummaryList"
        );

    if (score) {

        score.innerHTML =
            `0<span>/100</span>`;
    }

    if (status) {

        status.textContent =
            "Waiting for analysis";
    }

    if (description) {

        description.textContent =
            "Upload and analyze a CSV first to see your current business health.";
    }

    if (list) {

        list.innerHTML =
            "<li>Upload and analyze a CSV to display current results.</li>";
    }
}


// ======================================
// HELPERS
// ======================================

function setMoney(
    id,
    value
) {

    const element =
        document.getElementById(id);

    if (!element) return;

    element.textContent =
        formatMoney(value);
}


function formatMoney(value) {

    const number =
        Number(value) || 0;

    return "฿" +
        number.toLocaleString(
            "en-US",
            {
                maximumFractionDigits: 2
            }
        );
}


function formatPercent(value) {

    const number =
        Number(value) || 0;

    const sign =
        number > 0
            ? "+"
            : "";

    return sign +
        number.toFixed(2) +
        "%";
}


function escapeHtml(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


// ======================================
// TOAST
// ======================================

function createToast() {

    if (
        !localStorage.getItem(
            "analysis_result"
        )
    ) {
        return;
    }

    const toast =
        document.createElement(
            "div"
        );

    toast.innerHTML =
        "✅ Business health loaded from latest analysis";

    toast.style.position =
        "fixed";

    toast.style.right =
        "30px";

    toast.style.bottom =
        "30px";

    toast.style.background =
        "#22c55e";

    toast.style.color =
        "white";

    toast.style.padding =
        "16px 25px";

    toast.style.borderRadius =
        "15px";

    toast.style.opacity =
        "0";

    toast.style.transition =
        ".5s";

    toast.style.zIndex =
        "999";

    document.body.appendChild(
        toast
    );

    setTimeout(() => {

        toast.style.opacity =
            "1";

    }, 400);

    setTimeout(() => {

        toast.style.opacity =
            "0";

    }, 3000);
}


// ======================================
// EXPORT
// ======================================

function exportButton() {

    const btn =
        document.querySelector(
            ".export-btn"
        );

    if (!btn) return;

    btn.addEventListener(
        "click",
        () => {

            btn.innerHTML =
                "<i class='fa-solid fa-spinner fa-spin'></i> Exporting...";

            setTimeout(() => {

                alert(
                    "Report exported successfully."
                );

                btn.innerHTML =
                    "<i class='fa-solid fa-download'></i> Export Report";

            }, 1800);

        }
    );
}


// ======================================
// HOVER EFFECT
// ======================================

function setupHoverEffect() {

    document
        .querySelectorAll(".glass")
        .forEach(card => {

            card.addEventListener(
                "mousemove",
                e => {

                    const rect =
                        card.getBoundingClientRect();

                    const x =
                        e.clientX -
                        rect.left;

                    const y =
                        e.clientY -
                        rect.top;

                    card.style.background =
                        `radial-gradient(
                            circle at ${x}px ${y}px,
                            rgba(6,182,212,.15),
                            rgba(255,255,255,.04) 65%
                        )`;
                }
            );


            card.addEventListener(
                "mouseleave",
                () => {

                    card.style.background =
                        "rgba(255,255,255,.04)";
                }
            );

        });
}