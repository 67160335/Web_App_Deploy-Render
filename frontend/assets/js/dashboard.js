// =====================================================
// BusinessPilot AI - Dashboard
// =====================================================


/* =====================================================
   API CONFIG
===================================================== */

const IS_LOCAL_FRONTEND = window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_URL = window.BUSINESSPILOT_API_URL || (IS_LOCAL_FRONTEND ? "http://localhost:8000" : "https://businesspilot-ai-backend.onrender.com");



/* =====================================================
   PAGE LOAD
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        checkLogin();

        loadUser();

        loadAnalysisResult();

        updateGreeting();

        setupSearch();

        setupNotification();

        setupLogout();

        setupMenu();

    }
);



/* =====================================================
   CHECK LOGIN
===================================================== */

function checkLogin() {

    const token =
        localStorage.getItem(
            "access_token"
        );


    if (!token) {

        window.location.href =
            "login.html";

    }

}



/* =====================================================
   LOAD USER
===================================================== */

function loadUser() {

    const userRaw =
        localStorage.getItem(
            "user"
        );


    if (!userRaw) {
        return;
    }


    try {

        const user =
            JSON.parse(userRaw);


        const name =
            document.getElementById(
                "profileName"
            );


        if (
            name &&
            user.username
        ) {

            name.textContent =
                user.username;

        }

    } catch (error) {

        console.error(
            "USER LOAD ERROR:",
            error
        );

    }

}



/* =====================================================
   LOAD ANALYSIS
===================================================== */

function loadAnalysisResult() {

    const raw =
        localStorage.getItem(
            "analysis_result"
        );


    if (!raw) {

        console.warn(
            "No analysis result"
        );

        return;

    }


    try {

        const data =
            JSON.parse(raw);


        console.log(
            "Analysis Result:",
            data
        );


        /* =============================================
           BUSINESS HEALTH
        ============================================= */

        const health =
            data.business_health ||
            data.health ||
            {};


        const score =
            Number(
                health.score ??
                data.health_score ??
                data.business_health_score ??
                data.business_health?.score ??
                data.health?.score ??
                0
            );


        const status =
            health.status ??
            data.health_status ??
            getHealthStatus(
                score
            );


        updateHealth(
            score,
            status
        );



        /* =============================================
           FINANCIAL
        ============================================= */

        const financial =
            data.financial ||
            {};


        const revenue =
            Number(
                financial.total_revenue ??
                financial.revenue ??
                data.total_revenue ??
                0
            );


        const expense =
            Number(
                financial.total_expense ??
                financial.expense ??
                data.total_expense ??
                0
            );


        const profit =
            Number(
                financial.profit_loss ??
                financial.profit ??
                data.profit_loss ??
                revenue - expense
            );


        updateFinancial(
            revenue,
            expense,
            profit
        );



        /* =============================================
           CASH FLOW
        ============================================= */

        const cash =
            data.cash_flow ||
            {};


        const runway =
            Number(
                cash.cash_runway_months ??
                cash.runway_months ??
                data.cash_runway_months ??
                NaN
            );


        updateRunway(
            runway
        );



        /* =============================================
           TRENDS
        ============================================= */

        const trends =
            data.trends ||
            {};


        updateTrend(
            "revenueTrend",
            trends.revenue_change_percent
        );


        updateTrend(
            "expenseTrend",
            trends.expense_change_percent
        );


        /* =============================================
           RECOMMENDATIONS
        ============================================= */

        const recommendations =
            data.recommendations ||
            data.recommendation ||
            [];


        updateRecommendations(
            recommendations
        );


    } catch (error) {

        console.error(
            "ANALYSIS RESULT ERROR:",
            error
        );

        showAnalysisError();

    }

}



/* =====================================================
   HEALTH
===================================================== */

function updateHealth(
    score,
    status
) {

    const scoreElement =
        document.getElementById(
            "healthScore"
        );


    const statusElement =
        document.getElementById(
            "healthStatus"
        );


    if (scoreElement) {

        scoreElement.innerHTML =
            `${formatNumber(score)}
            <span>/100</span>`;

    }


    if (!statusElement) {
        return;
    }


    const normalized =
        String(status)
            .toLowerCase();


    let icon =
        "fa-circle-question";

    let text =
        "Unknown";

    let className =
        "status warning";


    if (
        normalized.includes(
            "healthy"
        ) ||
        score >= 70
    ) {

        icon =
            "fa-circle-check";

        text =
            "Healthy";

        className =
            "status healthy";

    }


    else if (
        normalized.includes(
            "watch"
        ) ||
        score >= 40
    ) {

        icon =
            "fa-triangle-exclamation";

        text =
            "Watch";

        className =
            "status warning";

    }


    else {

        icon =
            "fa-circle-exclamation";

        text =
            "Risk";

        className =
            "status danger";

    }


    statusElement.className =
        className;


    statusElement.innerHTML =
        `<i class="fa-solid ${icon}"></i> ${text}`;

}



/* =====================================================
   HEALTH STATUS
===================================================== */

function getHealthStatus(
    score
) {

    if (score >= 70) {

        return "Healthy";

    }


    if (score >= 40) {

        return "Watch";

    }


    return "Risk";

}



/* =====================================================
   FINANCIAL
===================================================== */

function updateFinancial(
    revenue,
    expense,
    profit
) {

    const revenueElement =
        document.getElementById(
            "revenueValue"
        );


    const expenseElement =
        document.getElementById(
            "expenseValue"
        );


    const profitElement =
        document.getElementById(
            "profitValue"
        );


    if (revenueElement) {

        revenueElement.textContent =
            formatMoney(
                revenue
            );

    }


    if (expenseElement) {

        expenseElement.textContent =
            formatMoney(
                expense
            );

    }


    if (profitElement) {

        profitElement.textContent =
            formatMoney(
                profit
            );


        profitElement.classList.remove(
            "positive",
            "negative"
        );


        profitElement.classList.add(
            profit >= 0
                ? "positive"
                : "negative"
        );

    }


    const profitTrend =
        document.getElementById(
            "profitTrend"
        );


    if (profitTrend) {

        if (profit >= 0) {

            profitTrend.textContent =
                "Positive result";

            profitTrend.className =
                "metric-trend positive";

        } else {

            profitTrend.textContent =
                "Loss detected";

            profitTrend.className =
                "metric-trend negative";

        }

    }

}



/* =====================================================
   CASH RUNWAY
===================================================== */

function updateRunway(
    runway
) {

    const runwayElement =
        document.getElementById(
            "runwayValue"
        );


    const trendElement =
        document.getElementById(
            "runwayTrend"
        );


    if (!runwayElement) {
        return;
    }


    if (
        !Number.isFinite(
            runway
        )
    ) {

        runwayElement.textContent =
            "N/A";


        if (trendElement) {

            trendElement.textContent =
                "No burn detected";

            trendElement.className =
                "metric-trend positive";

        }

        return;

    }


    runwayElement.textContent =
        `${runway.toFixed(2)} Months`;


    if (!trendElement) {
        return;
    }


    if (runway < 6) {

        trendElement.textContent =
            "Critical monitoring";

        trendElement.className =
            "metric-trend negative";

    }


    else if (runway < 12) {

        trendElement.textContent =
            "Need monitoring";

        trendElement.className =
            "metric-trend warning";

    }


    else {

        trendElement.textContent =
            "Good runway";

        trendElement.className =
            "metric-trend positive";

    }

}



/* =====================================================
   TRENDS
===================================================== */

function updateTrend(
    elementId,
    value
) {

    const element =
        document.getElementById(
            elementId
        );


    if (!element) {
        return;
    }


    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {

        element.textContent =
            "No trend data";

        element.className =
            "metric-trend";

        return;

    }


    const arrow =
        number >= 0
            ? "▲"
            : "▼";


    element.textContent =
        `${arrow} ${Math.abs(number).toFixed(2)}%`;


    element.className =
        number >= 0
            ? "metric-trend positive"
            : "metric-trend negative";

}



/* =====================================================
   RECOMMENDATIONS
===================================================== */

function updateRecommendations(
    recommendations
) {

    const box =
        document.getElementById(
            "recommendationBox"
        );


    if (!box) {
        return;
    }


    if (
        !Array.isArray(
            recommendations
        ) ||
        recommendations.length === 0
    ) {

        box.innerHTML = `

            <div class="empty-state">

                <i
                    class="fa-solid
                    fa-circle-info
                    text-3xl mb-3">
                </i>

                <p>
                    No recommendations available.
                </p>

            </div>

        `;

        return;

    }


    const list =
        recommendations
            .map(
                recommendation => `

                    <div
                        class="recommendation-item">

                        <i
                            class="fa-solid
                            fa-lightbulb
                            text-cyan-400
                            mr-2">
                        </i>

                        ${escapeHtml(
                            recommendation
                        )}

                    </div>

                `
            )
            .join("");


    box.innerHTML =
        list;

}



/* =====================================================
   FORMAT MONEY
===================================================== */

function formatMoney(
    value
) {

    const number =
        Number(value || 0);


    return (
        "฿" +
        number.toLocaleString(
            "th-TH",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        )
    );

}



/* =====================================================
   FORMAT NUMBER
===================================================== */

function formatNumber(
    value
) {

    return Number(
        value || 0
    ).toLocaleString(
        "th-TH",
        {
            maximumFractionDigits: 2
        }
    );

}



/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(value);


    return div.innerHTML;

}



/* =====================================================
   GREETING
===================================================== */

function updateGreeting() {

    const element =
        document.getElementById(
            "greeting"
        );


    if (!element) {
        return;
    }


    const hour =
        new Date().getHours();


    let greeting;


    if (hour < 12) {

        greeting =
            "Good Morning";

    }


    else if (hour < 18) {

        greeting =
            "Good Afternoon";

    }


    else {

        greeting =
            "Good Evening";

    }


    element.innerHTML =
        `${greeting} 👋`;

}



/* =====================================================
   SEARCH
===================================================== */

function setupSearch() {

    const input =
        document.querySelector(
            ".search input"
        );


    if (!input) {
        return;
    }


    input.addEventListener(
        "keyup",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                const keyword =
                    input.value.trim();


                if (!keyword) {
                    return;
                }


                alert(
                    `Search: ${keyword}`
                );

            }

        }
    );

}



/* =====================================================
   NOTIFICATION
===================================================== */

function setupNotification() {

    const button =
        document.querySelector(
            ".notification-btn"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        () => {

            const raw =
                localStorage.getItem(
                    "analysis_result"
                );


            if (!raw) {

                alert(
                    "ยังไม่มีผลวิเคราะห์"
                );

                return;

            }


            try {

                const data =
                    JSON.parse(
                        raw
                    );


                const recommendations =
                    data.recommendations ||
                    [];


                let message =
                    "BusinessPilot AI\n\n";


                if (
                    recommendations.length
                ) {

                    recommendations
                        .forEach(
                            item => {

                                message +=
                                    `• ${item}\n`;

                            }
                        );

                } else {

                    message +=
                        "ไม่มี Notification ใหม่";

                }


                alert(
                    message
                );


            } catch (error) {

                console.error(
                    error
                );

            }

        }
    );

}



/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

    const logout =
        document.querySelector(
            ".logout a"
        );


    if (!logout) {
        return;
    }


    logout.addEventListener(
        "click",
        async event => {

            event.preventDefault();


            const token =
                localStorage.getItem(
                    "access_token"
                );


            try {

                if (token) {

                    await fetch(
                        `${API_URL}/logout`,
                        {

                            method:
                                "POST",

                            headers: {

                                "Authorization":
                                    `Bearer ${token}`

                            }

                        }
                    );

                }

            } catch (_) {

                // Logout ต่อได้
            }


            localStorage.removeItem(
                "access_token"
            );

            localStorage.removeItem(
                "user"
            );

            localStorage.removeItem(
                "uploaded_filename"
            );

            localStorage.removeItem(
                "analysis_result"
            );

            localStorage.removeItem(
                "initial_cash"
            );


            window.location.href =
                "login.html";

        }
    );

}



/* =====================================================
   MENU
===================================================== */

function setupMenu() {

    const menus =
        document.querySelectorAll(
            ".menu-item"
        );


    menus.forEach(
        menu => {

            menu.addEventListener(
                "click",
                () => {

                    menus.forEach(
                        item =>
                            item.classList
                                .remove(
                                    "active"
                                )
                    );


                    menu.classList.add(
                        "active"
                    );

                }
            );

        }
    );

}



/* =====================================================
   ERROR
===================================================== */

function showAnalysisError() {

    const box =
        document.getElementById(
            "recommendationBox"
        );


    if (!box) {
        return;
    }


    box.innerHTML = `

        <div
            class="empty-state">

            <i
                class="fa-solid
                fa-triangle-exclamation
                text-4xl
                text-yellow-400
                mb-4">
            </i>

            <p>
                ไม่สามารถอ่านผลวิเคราะห์ได้
            </p>

            <a
                href="upload.html"
                class="text-cyan-400">

                Upload ใหม่

            </a>

        </div>

    `;

}