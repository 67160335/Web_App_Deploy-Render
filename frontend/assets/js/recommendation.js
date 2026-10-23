// =====================================================
// BusinessPilot AI - Recommendation & Strategic Copilot JS
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    initRecommendationPage();
});

let currentFilter = "all";
let rawAnalysisData = null;
let savedCheckedSteps = {};

function initRecommendationPage() {
    // 1. Auth check
    const token = localStorage.getItem("access_token");
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    // Load saved checklist progress from localStorage
    try {
        savedCheckedSteps = JSON.parse(localStorage.getItem("bp_checked_steps") || "{}");
    } catch (_) {
        savedCheckedSteps = {};
    }

    // 2. Load analysis data
    const raw = localStorage.getItem("analysis_result");
    if (raw) {
        try {
            rawAnalysisData = JSON.parse(raw);
        } catch (e) {
            console.error("Failed to parse analysis_result", e);
        }
    }

    if (!rawAnalysisData) {
        renderEmptyState();
        setupChatAdvisor({});
        return;
    }

    renderDiagnosis(rawAnalysisData);
    renderStrategicActions(rawAnalysisData, currentFilter);
    setupFilters();
    setupChatAdvisor(rawAnalysisData);
    setupActionButtons();
}

function getApiBaseUrl() {
    return window.BUSINESSPILOT_API_URL || window.location.origin;
}

function renderEmptyState() {
    const banner = document.getElementById("diagnosisBanner");
    if (banner) {
        banner.innerHTML = `
            <div class="text-center py-8">
                <i class="fa-solid fa-robot text-4xl text-cyan-400 mb-3"></i>
                <h3 class="text-xl font-bold text-white mb-2">à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ªà¸³à¸«à¸£à¸±à¸šà¸˜à¸¸à¸£à¸à¸´à¸ˆà¸‚à¸­à¸‡à¸„à¸¸à¸“</h3>
                <p class="text-slate-400 text-sm max-w-lg mx-auto mb-5">
                    à¸„à¸¸à¸“à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¹„à¸Ÿà¸¥à¹Œ CSV à¹€à¸žà¸·à¹ˆà¸­à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸ªà¸¸à¸‚à¸ à¸²à¸žà¸à¸²à¸£à¹€à¸‡à¸´à¸™ à¸à¸£à¸¸à¸“à¸²à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¹„à¸Ÿà¸¥à¹Œ à¸«à¸£à¸·à¸­à¸„à¸¥à¸´à¸à¸›à¸¸à¹ˆà¸¡à¸”à¹‰à¸²à¸™à¸¥à¹ˆà¸²à¸‡à¹€à¸žà¸·à¹ˆà¸­à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸ªà¸³à¸«à¸£à¸±à¸šà¸—à¸”à¸ªà¸­à¸š
                </p>
                <div class="flex justify-center gap-3">
                    <a href="upload_data.html" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90">
                        <i class="fa-solid fa-file-arrow-up mr-2"></i>à¸­à¸±à¸›à¹‚à¸«à¸¥à¸” CSV à¸•à¸­à¸™à¸™à¸µà¹‰
                    </a>
                    <button id="loadDemoBtn" class="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-300 font-semibold text-sm hover:bg-slate-750">
                        <i class="fa-solid fa-wand-magic-sparkles mr-2"></i>à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡ (Demo)
                    </button>
                </div>
            </div>
        `;
        document.getElementById("loadDemoBtn")?.addEventListener("click", loadDemoData);
    }

    const grid = document.getElementById("actionCardsGrid");
    if (grid) {
        grid.innerHTML = "";
    }
}

function loadDemoData() {
    const demo = {
        business_health: { score: 58, status: "Watch" },
        financial: { total_revenue: 450000, total_expense: 485000, profit_loss: -35000, profit_margin_percent: -7.78 },
        cash_flow: { initial_cash: 180000, monthly_burn_rate: 35000, cash_runway_months: 4.2 },
        trends: { revenue_change_percent: -4.5, expense_change_percent: 6.8 },
        recommendation_source: "expert_cfo_matrix",
        ai_assessment: {
            overall_diagnosis: "à¸˜à¸¸à¸£à¸à¸´à¸ˆà¸¡à¸µà¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸ªà¸¹à¸‡à¸à¸§à¹ˆà¸²à¸£à¸²à¸¢à¹„à¸”à¹‰à¹€à¸¥à¹‡à¸à¸™à¹‰à¸­à¸¢à¹à¸¥à¸°à¸¢à¸­à¸”à¸‚à¸²à¸¢à¸¥à¸”à¸¥à¸‡ 4.5% à¸‚à¸“à¸°à¸—à¸µà¹ˆà¹€à¸‡à¸´à¸™à¸ªà¸”à¸ªà¸³à¸£à¸­à¸‡à¸žà¸­à¸£à¸­à¸‡à¸£à¸±à¸šà¹„à¸”à¹‰à¸›à¸£à¸°à¸¡à¸²à¸“ 4.2 à¹€à¸”à¸·à¸­à¸™ à¸ˆà¸¶à¸‡à¸ˆà¸³à¹€à¸›à¹‡à¸™à¸•à¹‰à¸­à¸‡à¹€à¸£à¹ˆà¸‡à¸šà¸£à¸´à¸«à¸²à¸£à¹€à¸‡à¸´à¸™à¸—à¸¸à¸™à¸«à¸¡à¸¸à¸™à¹€à¸§à¸µà¸¢à¸™à¹à¸¥à¸°à¸›à¸£à¸±à¸šà¹à¸œà¸™à¸à¸²à¸£à¸‚à¸²à¸¢",
            primary_bottleneck: "à¸à¸²à¸£à¹€à¸•à¸´à¸šà¹‚à¸•à¸‚à¸­à¸‡à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¹‚à¸•à¹€à¸£à¹‡à¸§à¸à¸§à¹ˆà¸²à¸£à¸²à¸¢à¸£à¸±à¸š à¸ªà¹ˆà¸‡à¸œà¸¥à¹ƒà¸«à¹‰à¸à¸£à¸°à¹à¸ªà¹€à¸‡à¸´à¸™à¸ªà¸”à¸•à¸´à¸”à¸¥à¸š à¸¿35,000 à¸•à¹ˆà¸­à¹€à¸”à¸·à¸­à¸™",
            recommended_30day_focus: "à¸¥à¸”à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¸”à¸³à¹€à¸™à¸´à¸™à¸‡à¸²à¸™à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸ˆà¸³à¹€à¸›à¹‡à¸™ 10-15% à¹à¸¥à¸°à¸à¸£à¸°à¸•à¸¸à¹‰à¸™à¸¢à¸­à¸”à¸‚à¸²à¸¢à¸à¸±à¸šà¸à¸²à¸™à¸¥à¸¹à¸à¸„à¹‰à¸²à¹€à¸”à¸´à¸¡à¸—à¸±à¸™à¸—à¸µ"
        },
        strategic_action_plan: [
            {
                id: "demo_cash_runway",
                category: "à¸à¸²à¸£à¸šà¸£à¸´à¸«à¸²à¸£à¹€à¸‡à¸´à¸™à¸ªà¸”",
                priority: "CRITICAL",
                impact: "à¸¢à¸·à¸”à¸­à¸²à¸¢à¸¸à¹€à¸‡à¸´à¸™à¸ªà¸”à¸—à¸±à¸™à¸—à¸µ +2.0 à¹€à¸”à¸·à¸­à¸™ (à¸›à¸£à¸°à¸«à¸¢à¸±à¸”à¹€à¸‡à¸´à¸™à¸ªà¸”à¸ªà¸³à¸£à¸­à¸‡ à¸¿40,000)",
                title: "à¸¡à¸²à¸•à¸£à¸à¸²à¸£à¸£à¸±à¸à¸©à¸²à¸ªà¸ à¸²à¸žà¸„à¸¥à¹ˆà¸­à¸‡à¹à¸¥à¸°à¸šà¸£à¸´à¸«à¸²à¸£à¹€à¸‡à¸´à¸™à¸—à¸¸à¸™à¸«à¸¡à¸¸à¸™à¹€à¸§à¸µà¸¢à¸™ (Cash Defense)",
                rationale: "à¸£à¸°à¸¢à¸°à¹€à¸§à¸¥à¸²à¹€à¸‡à¸´à¸™à¸ªà¸”à¹€à¸«à¸¥à¸·à¸­ 4.2 à¹€à¸”à¸·à¸­à¸™ à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸ à¸²à¸§à¸°à¸•à¸¶à¸‡à¸•à¸±à¸§à¸«à¸²à¸à¸¢à¸­à¸”à¸‚à¸²à¸¢à¸¢à¸±à¸‡à¸•à¸´à¸”à¸¥à¸šà¸•à¹ˆà¸­à¹€à¸™à¸·à¹ˆà¸­à¸‡",
                action_steps: [
                    "à¹€à¸ˆà¸£à¸ˆà¸²à¸‚à¸­à¸‚à¸¢à¸²à¸¢à¹€à¸„à¸£à¸”à¸´à¸•à¹€à¸—à¸­à¸¡à¸‹à¸±à¸žà¸žà¸¥à¸²à¸¢à¹€à¸­à¸­à¸£à¹Œà¸«à¸¥à¸±à¸à¸ˆà¸²à¸ 30 à¸§à¸±à¸™ à¹€à¸›à¹‡à¸™ 45 à¸§à¸±à¸™",
                    "à¸•à¸±à¹‰à¸‡à¸£à¸°à¸šà¸šà¸•à¸´à¸”à¸•à¸²à¸¡à¸¢à¸­à¸”à¸„à¹‰à¸²à¸‡à¸Šà¸³à¸£à¸°à¸ˆà¸²à¸à¸¥à¸¹à¸à¸„à¹‰à¸² (A/R) à¸žà¸£à¹‰à¸­à¸¡à¸¡à¸­à¸šà¸ªà¹ˆà¸§à¸™à¸¥à¸” 2% à¹€à¸¡à¸·à¹ˆà¸­à¸ˆà¹ˆà¸²à¸¢à¸ à¸²à¸¢à¹ƒà¸™ 7 à¸§à¸±à¸™",
                    "à¸—à¸šà¸—à¸§à¸™à¸à¸²à¸£à¸¥à¸‡à¸—à¸¸à¸™à¹à¸¥à¸°à¸Šà¸°à¸¥à¸­à¸à¸²à¸£à¸‹à¸·à¹‰à¸­à¸ªà¸´à¸™à¸—à¸£à¸±à¸žà¸¢à¹Œà¸–à¸²à¸§à¸£à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸à¹ˆà¸­à¹ƒà¸«à¹‰à¹€à¸à¸´à¸”à¸£à¸²à¸¢à¹„à¸”à¹‰à¹ƒà¸™à¸—à¸±à¸™à¸—à¸µ"
                ],
                kpi_to_track: "Cash Runway > 6 à¹€à¸”à¸·à¸­à¸™ à¹à¸¥à¸° à¸­à¸±à¸•à¸£à¸²à¸à¸²à¸£à¹€à¸à¹‡à¸šà¸«à¸™à¸µà¹‰ (DSO)",
                timeframe: "à¸ à¸²à¸¢à¹ƒà¸™ 7-14 à¸§à¸±à¸™"
            },
            {
                id: "demo_cost_cut",
                category: "à¸à¸²à¸£à¸„à¸§à¸šà¸„à¸¸à¸¡à¸•à¹‰à¸™à¸—à¸¸à¸™",
                priority: "HIGH",
                impact: "à¸•à¸±à¸”à¸¥à¸”à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¸”à¸³à¹€à¸™à¸´à¸™à¸‡à¸²à¸™à¸¥à¸‡ à¸¿25,000/à¹€à¸”à¸·à¸­à¸™",
                title: "à¸œà¹ˆà¸²à¸•à¸±à¸”à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¸•à¹‰à¸™à¸—à¸¸à¸™à¹à¸¥à¸°à¸•à¸±à¸”à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¸—à¸µà¹ˆà¸œà¸¥à¸•à¸­à¸šà¹à¸—à¸™à¸•à¹ˆà¸³ (Cost Audit)",
                rationale: "à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¹€à¸•à¸´à¸šà¹‚à¸•à¸ªà¸¹à¸‡à¸à¸§à¹ˆà¸²à¸£à¸²à¸¢à¹„à¸”à¹‰ +6.8% à¸à¸”à¸”à¸±à¸™à¸­à¸±à¸•à¸£à¸²à¸à¸³à¹„à¸£à¸ªà¸¸à¸—à¸˜à¸´",
                action_steps: [
                    "à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹à¸¥à¸°à¸¢à¸à¹€à¸¥à¸´à¸à¸‹à¸­à¸Ÿà¸•à¹Œà¹à¸§à¸£à¹Œ/à¸„à¹ˆà¸²à¸šà¸£à¸´à¸à¸²à¸£à¸£à¸²à¸¢à¹€à¸”à¸·à¸­à¸™ (SaaS) à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µà¸à¸²à¸£à¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¹€à¸›à¹‡à¸™à¸›à¸£à¸°à¸ˆà¸³",
                    "à¸—à¸šà¸—à¸§à¸™à¸‡à¸šà¹‚à¸†à¸©à¸“à¸²à¸­à¸­à¸™à¹„à¸¥à¸™à¹Œà¹à¸¥à¸°à¸›à¸´à¸”à¹à¸„à¸¡à¹€à¸›à¸à¸—à¸µà¹ˆà¸¡à¸µ ROAS à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸² 1.5x",
                    "à¸à¸³à¸«à¸™à¸”à¹€à¸žà¸”à¸²à¸™à¸à¸²à¸£à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸£à¸²à¸¢à¸ˆà¹ˆà¸²à¸¢à¹ƒà¸«à¸¡à¹ˆ à¹‚à¸”à¸¢à¸—à¸¸à¸à¸¢à¸­à¸”à¹€à¸à¸´à¸™ à¸¿10,000 à¸•à¹‰à¸­à¸‡à¸œà¹ˆà¸²à¸™à¸„à¸§à¸²à¸¡à¹€à¸«à¹‡à¸™à¸Šà¸­à¸šà¸‚à¸­à¸‡à¸œà¸¹à¹‰à¸šà¸£à¸´à¸«à¸²à¸£"
                ],
                kpi_to_track: "Operating Expense Ratio (OpEx / Revenue) < 75%",
                timeframe: "à¸ à¸²à¸¢à¹ƒà¸™ 14 à¸§à¸±à¸™"
            },
            {
                id: "demo_rev_boost",
                category: "à¸à¸²à¸£à¹€à¸žà¸´à¹ˆà¸¡à¸¢à¸­à¸”à¸‚à¸²à¸¢",
                priority: "GROWTH",
                impact: "à¸Ÿà¸·à¹‰à¸™à¸Ÿà¸¹à¸¢à¸­à¸”à¸‚à¸²à¸¢à¸à¸¥à¸±à¸šà¸¡à¸²à¹€à¸žà¸´à¹ˆà¸¡à¸‚à¸¶à¹‰à¸™ +12% à¸–à¸¶à¸‡ +15%",
                title: "à¸à¸£à¸°à¸•à¸¸à¹‰à¸™à¸à¸²à¸£à¸‹à¸·à¹‰à¸­à¸‹à¹‰à¸³à¸ˆà¸²à¸à¸à¸²à¸™à¸¥à¸¹à¸à¸„à¹‰à¸²à¹€à¸”à¸´à¸¡ (Customer Retention & Upsell)",
                rationale: "à¸£à¸²à¸¢à¹„à¸”à¹‰à¸Šà¸°à¸¥à¸­à¸•à¸±à¸§à¸¥à¸‡ -4.5% à¸à¸²à¸£à¸£à¸±à¸à¸©à¸²à¸¥à¸¹à¸à¸„à¹‰à¸²à¹€à¸à¹ˆà¸²à¸¡à¸µà¸•à¹‰à¸™à¸—à¸¸à¸™à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸²à¸à¸²à¸£à¸«à¸²à¸¥à¸¹à¸à¸„à¹‰à¸²à¹ƒà¸«à¸¡à¹ˆ 5 à¹€à¸—à¹ˆà¸²",
                action_steps: [
                    "à¸„à¸±à¸”à¹€à¸¥à¸·à¸­à¸à¸£à¸²à¸¢à¸Šà¸·à¹ˆà¸­à¸¥à¸¹à¸à¸„à¹‰à¸²à¸›à¸£à¸°à¸ˆà¸³ 20% à¹à¸£à¸à¹€à¸žà¸·à¹ˆà¸­à¸¡à¸­à¸šà¹‚à¸›à¸£à¹‚à¸¡à¸Šà¸±à¸™à¸žà¸´à¹€à¸¨à¸©à¹€à¸‰à¸žà¸²à¸°à¸šà¸¸à¸„à¸„à¸¥ (Exclusive Offer)",
                    "à¸ˆà¸±à¸”à¹à¸žà¹‡à¸à¹€à¸à¸ˆà¸ªà¸´à¸™à¸„à¹‰à¸²à¸‚à¸²à¸¢à¸”à¸µà¸„à¸¹à¹ˆà¸à¸±à¸šà¸ªà¸´à¸™à¸„à¹‰à¸²à¸¡à¸²à¸£à¹Œà¸ˆà¸´à¹‰à¸™à¸ªà¸¹à¸‡ (Product Bundling) à¹€à¸žà¸·à¹ˆà¸­à¹€à¸žà¸´à¹ˆà¸¡à¸¢à¸­à¸”à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¸•à¹ˆà¸­à¸šà¸´à¸¥",
                    "à¸ˆà¸±à¸”à¹à¸„à¸¡à¹€à¸›à¸à¸šà¸­à¸à¸•à¹ˆà¸­ (Referral Bonus) à¹ƒà¸«à¹‰à¸¥à¸¹à¸à¸„à¹‰à¸²à¹€à¸à¹ˆà¸²à¹à¸™à¸°à¸™à¸³à¹€à¸žà¸·à¹ˆà¸­à¸™à¹‚à¸”à¸¢à¸£à¸±à¸šà¸ªà¹ˆà¸§à¸™à¸¥à¸”à¸—à¸±à¹‰à¸‡à¸„à¸¹à¹ˆ"
                ],
                kpi_to_track: "Repeat Order Rate, Average Order Value (AOV)",
                timeframe: "à¸ à¸²à¸¢à¹ƒà¸™ 30 à¸§à¸±à¸™"
            }
        ]
    };

    localStorage.setItem("analysis_result", JSON.stringify(demo));
    rawAnalysisData = demo;
    initRecommendationPage();
}

function renderDiagnosis(data) {
    const banner = document.getElementById("diagnosisBanner");
    if (!banner) return;

    const assessment = data.ai_assessment || {};
    const source = data.recommendation_source || "expert_cfo_matrix";
    const sourceLabel = (source === "openrouter") 
        ? '<span class="ai-engine-pill openrouter"><i class="fa-solid fa-sparkles"></i> Cloud AI (OpenRouter LLM)</span>'
        : '<span class="ai-engine-pill"><i class="fa-solid fa-brain"></i> Trained CFO Decision Matrix</span>';

    const health = data.business_health || {};
    const score = health.score ?? 50;
    const status = health.status || "Watch";

    const diagnosisText = assessment.overall_diagnosis || 
        `à¸˜à¸¸à¸£à¸à¸´à¸ˆà¸‚à¸­à¸‡à¸„à¸¸à¸“à¸¡à¸µà¸„à¸°à¹à¸™à¸™à¸ªà¸¸à¸‚à¸ à¸²à¸žà¸£à¸§à¸¡ ${score}/100 (${status}) à¸„à¸§à¸£à¹ƒà¸«à¹‰à¸„à¸§à¸²à¸¡à¸ªà¸³à¸„à¸±à¸à¸à¸±à¸šà¸à¸²à¸£à¸£à¸±à¸à¸©à¸²à¸ªà¸ à¸²à¸žà¸„à¸¥à¹ˆà¸­à¸‡à¹à¸¥à¸°à¸ªà¸£à¹‰à¸²à¸‡à¸à¸³à¹„à¸£à¸­à¸¢à¹ˆà¸²à¸‡à¸¢à¸±à¹ˆà¸‡à¸¢à¸·à¸™`;
    const bottleneckText = assessment.primary_bottleneck || 
        "à¸­à¸±à¸•à¸£à¸²à¸ªà¹ˆà¸§à¸™à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¸•à¹ˆà¸­à¸£à¸²à¸¢à¸£à¸±à¸šà¹à¸¥à¸°à¸£à¸°à¸¢à¸°à¹€à¸§à¸¥à¸²à¹€à¸‡à¸´à¸™à¸ªà¸”à¸«à¸¡à¸¸à¸™à¹€à¸§à¸µà¸¢à¸™à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸à¸²à¸£à¹€à¸à¹‰à¸²à¸£à¸°à¸§à¸±à¸‡";
    const focusText = assessment.recommended_30day_focus || 
        "à¸£à¸±à¸à¸©à¸²à¸§à¸´à¸™à¸±à¸¢à¸à¸²à¸£à¹ƒà¸Šà¹‰à¹€à¸‡à¸´à¸™à¸ªà¸”à¹à¸¥à¸°à¸à¸£à¸°à¸•à¸¸à¹‰à¸™à¸£à¸²à¸¢à¹„à¸”à¹‰à¸ˆà¸²à¸à¸ªà¸´à¸™à¸„à¹‰à¸²à¸—à¸µà¹ˆà¸—à¸³à¸à¸³à¹„à¸£à¸ªà¸¹à¸‡à¸ªà¸¸à¸”";

    banner.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div>
                <span class="text-xs font-bold tracking-wider uppercase text-cyan-400">Strategic Decision Engine</span>
                <h2 class="text-xl md:text-2xl font-bold text-white mt-1">à¸šà¸—à¸§à¸´à¸™à¸´à¸ˆà¸‰à¸±à¸¢à¹à¸¥à¸°à¸‚à¹‰à¸­à¹€à¸ªà¸™à¸­à¹à¸™à¸°à¹€à¸Šà¸´à¸‡à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ</h2>
            </div>
            <div>
                ${sourceLabel}
            </div>
        </div>

        <div class="diagnosis-grid">
            <div class="diagnosis-card overall">
                <span class="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-stethoscope"></i> à¸ à¸²à¸žà¸£à¸§à¸¡à¸ªà¸¸à¸‚à¸ à¸²à¸žà¸˜à¸¸à¸£à¸à¸´à¸ˆ
                </span>
                <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(diagnosisText)}</p>
            </div>

            <div class="diagnosis-card bottleneck">
                <span class="text-xs font-semibold text-rose-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-triangle-exclamation"></i> à¸ˆà¸¸à¸”à¸„à¸­à¸‚à¸§à¸” / à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¹€à¸£à¹ˆà¸‡à¸”à¹ˆà¸§à¸™
                </span>
                <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(bottleneckText)}</p>
            </div>

            <div class="diagnosis-card focus">
                <span class="text-xs font-semibold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-bullseye"></i> à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢à¸ªà¸³à¸„à¸±à¸à¹ƒà¸™ 30 à¸§à¸±à¸™à¸‚à¹‰à¸²à¸‡à¸«à¸™à¹‰à¸²
                </span>
                <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(focusText)}</p>
            </div>
        </div>
    `;
}

function renderStrategicActions(data, filter) {
    const container = document.getElementById("actionCardsGrid");
    if (!container) return;

    let actions = data.strategic_action_plan;
    if (!Array.isArray(actions) || actions.length === 0) {
        // Fallback from simple recommendations array
        const simple = data.recommendations || [];
        actions = simple.map((item, idx) => ({
            id: `legacy_action_${idx}`,
            category: "à¸à¸²à¸£à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡à¸˜à¸¸à¸£à¸à¸´à¸ˆ",
            priority: idx === 0 ? "HIGH" : "GROWTH",
            impact: "à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡à¸„à¸§à¸²à¸¡à¸¡à¸±à¹ˆà¸™à¸„à¸‡à¸—à¸²à¸‡à¸à¸²à¸£à¹€à¸‡à¸´à¸™",
            title: typeof item === "string" ? item : "à¸‚à¹‰à¸­à¹€à¸ªà¸™à¸­à¹à¸™à¸°à¸—à¸²à¸‡à¸˜à¸¸à¸£à¸à¸´à¸ˆ",
            rationale: "à¸§à¸´à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ˆà¸²à¸à¹à¸™à¸§à¹‚à¸™à¹‰à¸¡à¸£à¸²à¸¢à¹„à¸”à¹‰à¹à¸¥à¸°à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢à¸¥à¹ˆà¸²à¸ªà¸¸à¸”",
            action_steps: [
                "à¸—à¸šà¸—à¸§à¸™à¸•à¸±à¸§à¹€à¸¥à¸‚à¸£à¹ˆà¸§à¸¡à¸à¸±à¸šà¸—à¸µà¸¡à¸šà¸£à¸´à¸«à¸²à¸£",
                "à¸à¸³à¸«à¸™à¸”à¸œà¸¹à¹‰à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸šà¹à¸¥à¸°à¸§à¸±à¸™à¹à¸¥à¹‰à¸§à¹€à¸ªà¸£à¹‡à¸ˆ",
                "à¸•à¸´à¸”à¸•à¸²à¸¡à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œà¹ƒà¸™à¸«à¸™à¹‰à¸² Dashboard à¸ªà¸±à¸›à¸”à¸²à¸«à¹Œà¸¥à¸°à¸„à¸£à¸±à¹‰à¸‡"
            ],
            kpi_to_track: "Net Profit & Cash Balance",
            timeframe: "à¸ à¸²à¸¢à¹ƒà¸™ 30 à¸§à¸±à¸™"
        }));
    }

    // Apply filter
    const filtered = actions.filter(action => {
        if (filter === "all") return true;
        if (filter === "critical") return action.priority === "CRITICAL";
        if (filter === "cash") return (action.category || "").includes("à¹€à¸‡à¸´à¸™à¸ªà¸”");
        if (filter === "cost") return (action.category || "").includes("à¸•à¹‰à¸™à¸—à¸¸à¸™") || (action.category || "").includes("à¸„à¹ˆà¸²à¹ƒà¸Šà¹‰à¸ˆà¹ˆà¸²à¸¢");
        if (filter === "growth") return (action.priority === "GROWTH") || (action.category || "").includes("à¸¢à¸­à¸”à¸‚à¸²à¸¢") || (action.category || "").includes("à¹€à¸•à¸´à¸šà¹‚à¸•");
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 glass-panel">
                <i class="fa-solid fa-filter text-slate-500 text-3xl mb-3"></i>
                <h4 class="text-white font-semibold">à¹„à¸¡à¹ˆà¸žà¸šà¸¡à¸²à¸•à¸£à¸à¸²à¸£à¹ƒà¸™à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆà¸™à¸µà¹‰</h4>
                <p class="text-slate-400 text-xs mt-1">à¸¥à¸­à¸‡à¹€à¸¥à¸·à¸­à¸à¸•à¸±à¸§à¸à¸£à¸­à¸‡ "à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”" à¹€à¸žà¸·à¹ˆà¸­à¸”à¸¹à¹à¸œà¸™à¸›à¸à¸´à¸šà¸±à¸•à¸´à¸à¸²à¸£à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(action => {
        const priorityClass = (action.priority || "").toLowerCase();
        const priorityIcon = (priorityClass === "critical") 
            ? '<i class="fa-solid fa-triangle-exclamation"></i>' 
            : ((priorityClass === "high") ? '<i class="fa-solid fa-bolt"></i>' : '<i class="fa-solid fa-arrow-trend-up"></i>');

        const steps = action.action_steps || [];
        const checkedForCard = savedCheckedSteps[action.id] || [];
        const percent = steps.length ? Math.round((checkedForCard.length / steps.length) * 100) : 0;

        const stepsHtml = steps.map((step, idx) => {
            const isChecked = checkedForCard.includes(idx);
            return `
                <li class="step-item ${isChecked ? 'completed' : ''}" data-card-id="${action.id}" data-step-idx="${idx}">
                    <input type="checkbox" class="step-checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="step-text">${escapeHtml(step)}</span>
                </li>
            `;
        }).join("");

        return `
            <div class="action-card" id="card_${action.id}">
                <div>
                    <div class="action-card-header">
                        <span class="category-tag"><i class="fa-solid fa-tag text-xs mr-1 opacity-70"></i>${escapeHtml(action.category || 'à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ')}</span>
                        <span class="priority-tag ${priorityClass}">${priorityIcon} ${escapeHtml(action.priority || 'HIGH')}</span>
                    </div>

                    <h3 class="action-card-title">${escapeHtml(action.title || 'à¸¡à¸²à¸•à¸£à¸à¸²à¸£à¹€à¸Šà¸´à¸‡à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ')}</h3>
                    
                    <div class="action-card-rationale">
                        <strong><i class="fa-solid fa-circle-info mr-1 text-cyan-400"></i>à¹€à¸«à¸•à¸¸à¸œà¸¥:</strong> ${escapeHtml(action.rationale || 'à¸­à¸´à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸£à¸´à¸‡à¸‚à¸­à¸‡à¸˜à¸¸à¸£à¸à¸´à¸ˆ')}
                    </div>

                    <div class="impact-badge">
                        <i class="fa-solid fa-chart-pie text-cyan-400 text-base"></i>
                        <span>${escapeHtml(action.impact || 'à¸Šà¹ˆà¸§à¸¢à¹€à¸žà¸´à¹ˆà¸¡à¸›à¸£à¸°à¸ªà¸´à¸—à¸˜à¸´à¸ à¸²à¸žà¸—à¸²à¸‡à¸à¸²à¸£à¹€à¸‡à¸´à¸™')}</span>
                    </div>

                    <div class="steps-title">
                        <span><i class="fa-solid fa-list-check mr-1.5"></i>à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¸›à¸à¸´à¸šà¸±à¸•à¸´à¸à¸²à¸£</span>
                        <span class="card-progress-text text-cyan-300 font-bold">${percent}%</span>
                    </div>

                    <div class="card-progress-bar">
                        <div class="card-progress-fill" style="width: ${percent}%;"></div>
                    </div>

                    <ul class="steps-list">
                        ${stepsHtml}
                    </ul>
                </div>

                <div class="action-card-footer">
                    <div>
                        <i class="fa-solid fa-bullseye text-cyan-400 mr-1"></i>KPI: 
                        <span class="text-slate-300">${escapeHtml(action.kpi_to_track || 'à¸à¸³à¹„à¸£à¸ªà¸¸à¸—à¸˜à¸´')}</span>
                    </div>
                    <div>
                        <i class="fa-regular fa-clock text-amber-400 mr-1"></i>
                        <span class="text-slate-300">${escapeHtml(action.timeframe || 'à¹€à¸£à¹‡à¸§à¹† à¸™à¸µà¹‰')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Bind checkbox listeners
    container.querySelectorAll(".step-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const cardId = item.dataset.cardId;
            const stepIdx = parseInt(item.dataset.stepIdx, 10);
            const checkbox = item.querySelector(".step-checkbox");
            
            // If user didn't click directly on checkbox, toggle it
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }

            if (!savedCheckedSteps[cardId]) {
                savedCheckedSteps[cardId] = [];
            }

            if (checkbox.checked) {
                if (!savedCheckedSteps[cardId].includes(stepIdx)) {
                    savedCheckedSteps[cardId].push(stepIdx);
                }
                item.classList.add("completed");
            } else {
                savedCheckedSteps[cardId] = savedCheckedSteps[cardId].filter(x => x !== stepIdx);
                item.classList.remove("completed");
            }

            // Save to localStorage
            localStorage.setItem("bp_checked_steps", JSON.stringify(savedCheckedSteps));

            // Update card progress bar & text
            const card = document.getElementById(`card_${cardId}`);
            if (card) {
                const totalSteps = card.querySelectorAll(".step-item").length;
                const checkedCount = savedCheckedSteps[cardId].length;
                const newPercent = totalSteps ? Math.round((checkedCount / totalSteps) * 100) : 0;
                const fill = card.querySelector(".card-progress-fill");
                const text = card.querySelector(".card-progress-text");
                if (fill) fill.style.width = `${newPercent}%`;
                if (text) text.textContent = `${newPercent}%`;
            }
        });
    });
}

function setupFilters() {
    const pills = document.querySelectorAll(".filter-pill");
    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            currentFilter = pill.dataset.filter || "all";
            if (rawAnalysisData) {
                renderStrategicActions(rawAnalysisData, currentFilter);
            }
        });
    });
}

function setupActionButtons() {
    // Print / PDF Button
    const printBtn = document.getElementById("printPlanBtn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
    }

    // Refresh / Re-analyze
    const refreshBtn = document.getElementById("refreshPlanBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            if (confirm("à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸£à¸µà¹€à¸‹à¹‡à¸•à¸„à¸§à¸²à¸¡à¸„à¸·à¸šà¸«à¸™à¹‰à¸²à¸‚à¸­à¸‡à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¸—à¸µà¹ˆà¸—à¸³à¹à¸¥à¹‰à¸§ (Checklist) à¸«à¸£à¸·à¸­à¹„à¸¡à¹ˆ?")) {
                savedCheckedSteps = {};
                localStorage.removeItem("bp_checked_steps");
                if (rawAnalysisData) {
                    renderStrategicActions(rawAnalysisData, currentFilter);
                }
            }
        });
    }
}

// =====================================================
// AI CFO Copilot Interactive Chatbox
// =====================================================

function setupChatAdvisor(data) {
    const sendBtn = document.getElementById("chatSendBtn");
    const input = document.getElementById("chatInput");
    const history = document.getElementById("chatHistory");
    const quickBtns = document.querySelectorAll(".quick-prompt-btn");

    if (!sendBtn || !input || !history) return;

    quickBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            input.value = btn.textContent.trim();
            handleSendQuestion();
        });
    });

    sendBtn.addEventListener("click", handleSendQuestion);

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendQuestion();
        }
    });

    async function handleSendQuestion() {
        const question = input.value.trim();
        if (!question) return;

        // Append User Message
        appendMessage("user", question);
        input.value = "";
        sendBtn.disabled = true;

        // Show typing indicator
        const typingId = appendTypingIndicator();

        // Build context from analysis data
        const fin = data.financial || {};
        const cash = data.cash_flow || {};
        const trends = data.trends || {};
        const context = {
            total_revenue: fin.total_revenue || 0,
            total_expense: fin.total_expense || 0,
            profit_loss: fin.profit_loss || 0,
            cash_runway_months: cash.cash_runway_months,
            revenue_growth_percent: trends.revenue_change_percent,
            expense_growth_percent: trends.expense_change_percent,
            business_health_score: data.business_health?.score
        };

        try {
            const token = localStorage.getItem("access_token") || "";
            const res = await fetch(`${getApiBaseUrl()}/ai/chat-advisor`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ question, context })
            });

            removeElement(typingId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸•à¹ˆà¸­ AI à¹„à¸”à¹‰");
            }

            const result = await res.json();
            const sourceBadge = result.source === "openrouter" 
                ? '<span class="text-[10px] text-purple-400 font-normal ml-2">âš¡ OpenRouter Cloud AI</span>' 
                : '<span class="text-[10px] text-cyan-400 font-normal ml-2">ðŸ§  Expert CFO Matrix</span>';

            appendMessage("cfo", result.answer, sourceBadge);

        } catch (err) {
            removeElement(typingId);
            appendMessage("cfo", `âš ï¸ à¸‚à¸±à¸”à¸‚à¹‰à¸­à¸‡: ${err.message || "à¹€à¸à¸´à¸”à¸‚à¹‰à¸­à¸œà¸´à¸”à¸žà¸¥à¸²à¸”à¹ƒà¸™à¸à¸²à¸£à¹€à¸£à¸µà¸¢à¸ AI CFO"} (à¸£à¸°à¸šà¸šà¹„à¸”à¹‰à¹€à¸•à¸£à¸µà¸¢à¸¡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œà¹ƒà¸™à¸šà¸±à¸•à¸£à¸”à¹‰à¸²à¸™à¸šà¸™à¹„à¸§à¹‰à¹à¸¥à¹‰à¸§)`);
        } finally {
            sendBtn.disabled = false;
        }
    }

    function appendMessage(sender, text, extraHtml = "") {
        const msgDiv = document.createElement("div");
        msgDiv.className = `chat-msg ${sender}`;
        
        if (sender === "cfo") {
            // Render basic markdown formatting
            const formatted = formatMarkdown(text);
            msgDiv.innerHTML = `
                <div class="flex items-center gap-2 mb-1 text-cyan-400 font-semibold text-xs">
                    <i class="fa-solid fa-robot"></i> AI CFO Copilot ${extraHtml}
                </div>
                <div>${formatted}</div>
            `;
        } else {
            msgDiv.textContent = text;
        }

        history.appendChild(msgDiv);
        history.scrollTop = history.scrollHeight;
    }

    function appendTypingIndicator() {
        const id = "typing_" + Date.now();
        const div = document.createElement("div");
        div.id = id;
        div.className = "chat-msg cfo";
        div.innerHTML = `
            <div class="flex items-center gap-2 text-cyan-400 text-xs">
                <i class="fa-solid fa-circle-notch fa-spin"></i> AI CFO à¸à¸³à¸¥à¸±à¸‡à¸›à¸£à¸°à¸¡à¸§à¸¥à¸œà¸¥à¸•à¸±à¸§à¹€à¸¥à¸‚à¹à¸¥à¸°à¸„à¸´à¸”à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ...
            </div>
        `;
        history.appendChild(div);
        history.scrollTop = history.scrollHeight;
        return id;
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
}

function formatMarkdown(text) {
    if (!text) return "";
    let str = escapeHtml(text);
    // Bold **text**
    str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Line breaks
    str = str.replace(/\n/g, '<br>');
    return str;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
