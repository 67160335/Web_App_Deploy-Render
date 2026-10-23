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
    return window.BUSINESSPILOT_API_URL || 
        ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
            ? "http://localhost:8000" 
            : "https://businesspilot-ai-backend.onrender.com");
}

function renderEmptyState() {
    const banner = document.getElementById("diagnosisBanner");
    if (banner) {
        banner.innerHTML = `
            <div class="text-center py-8">
                <i class="fa-solid fa-robot text-4xl text-cyan-400 mb-3"></i>
                <h3 class="text-xl font-bold text-white mb-2">ยังไม่มีผลวิเคราะห์สำหรับธุรกิจของคุณ</h3>
                <p class="text-slate-400 text-sm max-w-lg mx-auto mb-5">
                    คุณยังไม่ได้อัปโหลดไฟล์ CSV เพื่อประเมินสุขภาพการเงิน กรุณาอัปโหลดไฟล์ หรือคลิกปุ่มด้านล่างเพื่อโหลดข้อมูลตัวอย่างสำหรับทดสอบ
                </p>
                <div class="flex justify-center gap-3">
                    <a href="upload_data.html" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90">
                        <i class="fa-solid fa-file-arrow-up mr-2"></i>อัปโหลด CSV ตอนนี้
                    </a>
                    <button id="loadDemoBtn" class="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-cyan-300 font-semibold text-sm hover:bg-slate-750">
                        <i class="fa-solid fa-wand-magic-sparkles mr-2"></i>โหลดข้อมูลตัวอย่าง (Demo)
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
            overall_diagnosis: "ธุรกิจมีรายจ่ายสูงกว่ารายได้เล็กน้อยและยอดขายลดลง 4.5% ขณะที่เงินสดสำรองพอรองรับได้ประมาณ 4.2 เดือน จึงจำเป็นต้องเร่งบริหารเงินทุนหมุนเวียนและปรับแผนการขาย",
            primary_bottleneck: "การเติบโตของค่าใช้จ่ายโตเร็วกว่ารายรับ ส่งผลให้กระแสเงินสดติดลบ ฿35,000 ต่อเดือน",
            recommended_30day_focus: "ลดค่าใช้จ่ายดำเนินงานที่ไม่จำเป็น 10-15% และกระตุ้นยอดขายกับฐานลูกค้าเดิมทันที"
        },
        strategic_action_plan: [
            {
                id: "demo_cash_runway",
                category: "การบริหารเงินสด",
                priority: "CRITICAL",
                impact: "ยืดอายุเงินสดทันที +2.0 เดือน (ประหยัดเงินสดสำรอง ฿40,000)",
                title: "มาตรการรักษาสภาพคล่องและบริหารเงินทุนหมุนเวียน (Cash Defense)",
                rationale: "ระยะเวลาเงินสดเหลือ 4.2 เดือน เสี่ยงเข้าสู่ภาวะตึงตัวหากยอดขายยังติดลบต่อเนื่อง",
                action_steps: [
                    "เจรจาขอขยายเครดิตเทอมซัพพลายเออร์หลักจาก 30 วัน เป็น 45 วัน",
                    "ตั้งระบบติดตามยอดค้างชำระจากลูกค้า (A/R) พร้อมมอบส่วนลด 2% เมื่อจ่ายภายใน 7 วัน",
                    "ทบทวนการลงทุนและชะลอการซื้อสินทรัพย์ถาวรที่ไม่ก่อให้เกิดรายได้ในทันที"
                ],
                kpi_to_track: "Cash Runway > 6 เดือน และ อัตราการเก็บหนี้ (DSO)",
                timeframe: "ภายใน 7-14 วัน"
            },
            {
                id: "demo_cost_cut",
                category: "การควบคุมต้นทุน",
                priority: "HIGH",
                impact: "ตัดลดรายจ่ายดำเนินงานลง ฿25,000/เดือน",
                title: "ผ่าตัดโครงสร้างต้นทุนและตัดค่าใช้จ่ายที่ผลตอบแทนต่ำ (Cost Audit)",
                rationale: "ค่าใช้จ่ายเติบโตสูงกว่ารายได้ +6.8% กดดันอัตรากำไรสุทธิ",
                action_steps: [
                    "ตรวจสอบและยกเลิกซอฟต์แวร์/ค่าบริการรายเดือน (SaaS) ที่ไม่มีการใช้งานเป็นประจำ",
                    "ทบทวนงบโฆษณาออนไลน์และปิดแคมเปญที่มี ROAS ต่ำกว่า 1.5x",
                    "กำหนดเพดานการอนุมัติรายจ่ายใหม่ โดยทุกยอดเกิน ฿10,000 ต้องผ่านความเห็นชอบของผู้บริหาร"
                ],
                kpi_to_track: "Operating Expense Ratio (OpEx / Revenue) < 75%",
                timeframe: "ภายใน 14 วัน"
            },
            {
                id: "demo_rev_boost",
                category: "การเพิ่มยอดขาย",
                priority: "GROWTH",
                impact: "ฟื้นฟูยอดขายกลับมาเพิ่มขึ้น +12% ถึง +15%",
                title: "กระตุ้นการซื้อซ้ำจากฐานลูกค้าเดิม (Customer Retention & Upsell)",
                rationale: "รายได้ชะลอตัวลง -4.5% การรักษาลูกค้าเก่ามีต้นทุนต่ำกว่าการหาลูกค้าใหม่ 5 เท่า",
                action_steps: [
                    "คัดเลือกรายชื่อลูกค้าประจำ 20% แรกเพื่อมอบโปรโมชันพิเศษเฉพาะบุคคล (Exclusive Offer)",
                    "จัดแพ็กเกจสินค้าขายดีคู่กับสินค้ามาร์จิ้นสูง (Product Bundling) เพื่อเพิ่มยอดใช้จ่ายต่อบิล",
                    "จัดแคมเปญบอกต่อ (Referral Bonus) ให้ลูกค้าเก่าแนะนำเพื่อนโดยรับส่วนลดทั้งคู่"
                ],
                kpi_to_track: "Repeat Order Rate, Average Order Value (AOV)",
                timeframe: "ภายใน 30 วัน"
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
        `ธุรกิจของคุณมีคะแนนสุขภาพรวม ${score}/100 (${status}) ควรให้ความสำคัญกับการรักษาสภาพคล่องและสร้างกำไรอย่างยั่งยืน`;
    const bottleneckText = assessment.primary_bottleneck || 
        "อัตราส่วนค่าใช้จ่ายต่อรายรับและระยะเวลาเงินสดหมุนเวียนต้องการการเฝ้าระวัง";
    const focusText = assessment.recommended_30day_focus || 
        "รักษาวินัยการใช้เงินสดและกระตุ้นรายได้จากสินค้าที่ทำกำไรสูงสุด";

    banner.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div>
                <span class="text-xs font-bold tracking-wider uppercase text-cyan-400">Strategic Decision Engine</span>
                <h2 class="text-xl md:text-2xl font-bold text-white mt-1">บทวินิจฉัยและข้อเสนอแนะเชิงกลยุทธ์</h2>
            </div>
            <div>
                ${sourceLabel}
            </div>
        </div>

        <div class="diagnosis-grid">
            <div class="diagnosis-card overall">
                <span class="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-stethoscope"></i> ภาพรวมสุขภาพธุรกิจ
                </span>
                <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(diagnosisText)}</p>
            </div>

            <div class="diagnosis-card bottleneck">
                <span class="text-xs font-semibold text-rose-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-triangle-exclamation"></i> จุดคอขวด / ความเสี่ยงเร่งด่วน
                </span>
                <p class="text-sm text-slate-200 leading-relaxed">${escapeHtml(bottleneckText)}</p>
            </div>

            <div class="diagnosis-card focus">
                <span class="text-xs font-semibold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-bullseye"></i> เป้าหมายสำคัญใน 30 วันข้างหน้า
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
            category: "การปรับปรุงธุรกิจ",
            priority: idx === 0 ? "HIGH" : "GROWTH",
            impact: "ปรับปรุงความมั่นคงทางการเงิน",
            title: typeof item === "string" ? item : "ข้อเสนอแนะทางธุรกิจ",
            rationale: "วิเคราะห์จากแนวโน้มรายได้และค่าใช้จ่ายล่าสุด",
            action_steps: [
                "ทบทวนตัวเลขร่วมกับทีมบริหาร",
                "กำหนดผู้รับผิดชอบและวันแล้วเสร็จ",
                "ติดตามผลลัพธ์ในหน้า Dashboard สัปดาห์ละครั้ง"
            ],
            kpi_to_track: "Net Profit & Cash Balance",
            timeframe: "ภายใน 30 วัน"
        }));
    }

    // Apply filter
    const filtered = actions.filter(action => {
        if (filter === "all") return true;
        if (filter === "critical") return action.priority === "CRITICAL";
        if (filter === "cash") return (action.category || "").includes("เงินสด");
        if (filter === "cost") return (action.category || "").includes("ต้นทุน") || (action.category || "").includes("ค่าใช้จ่าย");
        if (filter === "growth") return (action.priority === "GROWTH") || (action.category || "").includes("ยอดขาย") || (action.category || "").includes("เติบโต");
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 glass-panel">
                <i class="fa-solid fa-filter text-slate-500 text-3xl mb-3"></i>
                <h4 class="text-white font-semibold">ไม่พบมาตรการในหมวดหมู่นี้</h4>
                <p class="text-slate-400 text-xs mt-1">ลองเลือกตัวกรอง "ทั้งหมด" เพื่อดูแผนปฏิบัติการทั้งหมด</p>
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
                        <span class="category-tag"><i class="fa-solid fa-tag text-xs mr-1 opacity-70"></i>${escapeHtml(action.category || 'กลยุทธ์')}</span>
                        <span class="priority-tag ${priorityClass}">${priorityIcon} ${escapeHtml(action.priority || 'HIGH')}</span>
                    </div>

                    <h3 class="action-card-title">${escapeHtml(action.title || 'มาตรการเชิงกลยุทธ์')}</h3>
                    
                    <div class="action-card-rationale">
                        <strong><i class="fa-solid fa-circle-info mr-1 text-cyan-400"></i>เหตุผล:</strong> ${escapeHtml(action.rationale || 'อิงข้อมูลจริงของธุรกิจ')}
                    </div>

                    <div class="impact-badge">
                        <i class="fa-solid fa-chart-pie text-cyan-400 text-base"></i>
                        <span>${escapeHtml(action.impact || 'ช่วยเพิ่มประสิทธิภาพทางการเงิน')}</span>
                    </div>

                    <div class="steps-title">
                        <span><i class="fa-solid fa-list-check mr-1.5"></i>ขั้นตอนปฏิบัติการ</span>
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
                        <span class="text-slate-300">${escapeHtml(action.kpi_to_track || 'กำไรสุทธิ')}</span>
                    </div>
                    <div>
                        <i class="fa-regular fa-clock text-amber-400 mr-1"></i>
                        <span class="text-slate-300">${escapeHtml(action.timeframe || 'เร็วๆ นี้')}</span>
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
            if (confirm("ต้องการรีเซ็ตความคืบหน้าของขั้นตอนที่ทำแล้ว (Checklist) หรือไม่?")) {
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
                throw new Error(errData.detail || "ไม่สามารถเชื่อมต่อ AI ได้");
            }

            const result = await res.json();
            const sourceBadge = result.source === "openrouter" 
                ? '<span class="text-[10px] text-purple-400 font-normal ml-2">⚡ OpenRouter Cloud AI</span>' 
                : '<span class="text-[10px] text-cyan-400 font-normal ml-2">🧠 Expert CFO Matrix</span>';

            appendMessage("cfo", result.answer, sourceBadge);

        } catch (err) {
            removeElement(typingId);
            appendMessage("cfo", `⚠️ ขัดข้อง: ${err.message || "เกิดข้อผิดพลาดในการเรียก AI CFO"} (ระบบได้เตรียมข้อมูลกลยุทธ์ในบัตรด้านบนไว้แล้ว)`);
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
                <i class="fa-solid fa-circle-notch fa-spin"></i> AI CFO กำลังประมวลผลตัวเลขและคิดกลยุทธ์...
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
