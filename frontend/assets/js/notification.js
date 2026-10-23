// =====================================================
// BusinessPilot AI - Notification Center & Email Dispatch
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
    let currentUser = {};
    let activeFilter = "all";
    let emailAlertsEnabled = localStorage.getItem("email_alerts_enabled") !== "false"; // default true

    document.addEventListener("DOMContentLoaded", () => {
        loadUser();
        setupLogout();
        setupControls();
        loadNotifications();
        renderEmailHistory();
    });

    function loadUser() {
        try {
            const raw = localStorage.getItem("user");
            if (raw) currentUser = JSON.parse(raw);
            const nameEl = document.getElementById("profileName");
            if (nameEl && currentUser.username) nameEl.textContent = currentUser.username;

            const emailInput = document.getElementById("targetEmailInput");
            if (emailInput) {
                emailInput.value = currentUser.email || localStorage.getItem("alert_email") || "owner@businesspilot.ai";
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
        // Toggle Switch
        const toggle = document.getElementById("emailAlertsToggle");
        if (toggle) {
            toggle.checked = emailAlertsEnabled;
            toggle.addEventListener("change", (e) => {
                emailAlertsEnabled = e.target.checked;
                localStorage.setItem("email_alerts_enabled", String(emailAlertsEnabled));
                showToast(emailAlertsEnabled ? "เปิดการแจ้งเตือนทางอีเมลแล้ว" : "ปิดการแจ้งเตือนทางอีเมลชั่วคราว");
            });
        }

        // Email input change
        const emailInput = document.getElementById("targetEmailInput");
        emailInput?.addEventListener("change", (e) => {
            const email = e.target.value.trim();
            if (email && email.includes("@")) {
                localStorage.setItem("alert_email", email);
                showToast(`บันทึกอีเมลผู้รับเป็น ${email}`);
            }
        });

        // Send Email Now Button
        document.getElementById("sendEmailNowBtn")?.addEventListener("click", sendEmailAlerts);

        // Filter tabs
        document.querySelectorAll("[data-filter]").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                activeFilter = btn.dataset.filter;
                renderNotifications();
            });
        });

        // Clear all notifications
        document.getElementById("clearNotifsBtn")?.addEventListener("click", () => {
            sessionStorage.setItem("dismissed_notifs", "true");
            renderNotifications();
            showToast("ล้างรายการแจ้งเตือนเรียบร้อย");
        });
    }

    // Generate notifications from uploaded analysis
    function getGeneratedNotifications() {
        if (sessionStorage.getItem("dismissed_notifs") === "true") {
            return [];
        }

        const raw = localStorage.getItem("analysis_result");
        if (!raw) {
            return [
                {
                    id: "no_data",
                    type: "info",
                    level: "info",
                    badge: "เริ่มต้นใช้งาน",
                    title: "ยินดีต้อนรับสู่ BusinessPilot AI Notification Center",
                    desc: "ระบบตรวจจับความเสี่ยงทางการเงินและแจ้งเตือนอัตโนมัติ กรุณาอัปโหลดไฟล์ข้อมูลธุรกิจ (CSV) เพื่อเปิดใช้งานการแจ้งเตือนแบบเรียลไทม์",
                    time: "เมื่อสักครู่"
                }
            ];
        }

        try {
            rawAnalysis = JSON.parse(raw);
        } catch (_) {
            return [];
        }

        const notifs = [];
        const fin = rawAnalysis.financial || {};
        const cash = rawAnalysis.cash_flow || {};
        const health = rawAnalysis.business_health || {};
        const trends = rawAnalysis.trends || {};
        const filename = localStorage.getItem("uploaded_filename") || rawAnalysis.filename || "ข้อมูลล่าสุด";

        const runway = Number(cash.cash_runway_months);
        const profit = Number(fin.profit_loss);
        const score = Number(health.score);
        const revTrend = Number(trends.revenue_change_percent);
        const expTrend = Number(trends.expense_change_percent);

        // 1. Runway Alert
        if (Number.isFinite(runway) && runway < 3) {
            notifs.push({
                id: "runway_crit",
                type: "danger",
                level: "critical",
                badge: "วิกฤตเงินสด",
                title: "กระแสเงินสดหมุนเวียนต่ำกว่า 3 เดือน (ด่วนที่สุด)",
                desc: `จากการวิเคราะห์ไฟล์ ${filename} ธุรกิจมีระยะเวลาเงินสดเหลือเพียง ${runway.toFixed(1)} เดือน ควรระดมทุนเสริมสภาพคล่องหรือตัดลดต้นทุนที่ไม่จำเป็นทันที`,
                time: "วันนี้"
            });
        } else if (Number.isFinite(runway) && runway < 6) {
            notifs.push({
                id: "runway_warn",
                type: "warning",
                level: "warn",
                badge: "เฝ้าระวังเงินสด",
                title: "ระยะเวลาเงินสดคงเหลือต่ำกว่า 6 เดือน",
                desc: `เงินสดหมุนเวียนปัจจุบันเพียงพอใช้งานได้ประมาณ ${runway.toFixed(1)} เดือน ควรติดตามอัตราการเผาเงินสด (Burn Rate) อย่างใกล้ชิด`,
                time: "วันนี้"
            });
        }

        // 2. Net Loss Alert
        if (profit < 0) {
            notifs.push({
                id: "profit_loss",
                type: "danger",
                level: "danger",
                badge: "ผลประกอบการขาดทุน",
                title: "ผลประกอบการสุทธิติดลบ (Net Loss)",
                desc: `ยอดรวมค่าใช้จ่ายสูงกว่ารายรับ ขาดทุนสุทธิสะสม ฿${Math.abs(profit).toLocaleString()} ควรทบทวนโครงสร้างต้นทุนและเร่งเพิ่มยอดขาย`,
                time: "เมื่อวานนี้"
            });
        }

        // 3. Expense vs Revenue Growth
        if (expTrend > revTrend && expTrend > 10) {
            notifs.push({
                id: "exp_surge",
                type: "warning",
                level: "warn",
                badge: "ต้นทุนโตผิดปกติ",
                title: "ค่าใช้จ่ายเติบโตเร็วกว่ารายได้",
                desc: `อัตราการเพิ่มขึ้นของค่าใช้จ่าย (+${expTrend.toFixed(1)}%) สูงกว่าการเติบโตของรายรับ (+${revTrend.toFixed(1)}%) อาจกระทบต่ออัตรากำไรในระยะยาว`,
                time: "2 วันที่แล้ว"
            });
        }

        // 4. Milestone
        if (score >= 80) {
            notifs.push({
                id: "health_good",
                type: "success",
                level: "info",
                badge: "สุขภาพธุรกิจดีเยี่ยม",
                title: "คะแนนสุขภาพธุรกิจอยู่ในเกณฑ์ยอดเยี่ยม (Score: " + score + "/100)",
                desc: "สถานะทางการเงินและกระแสเงินสดมีความมั่นคงสูง พร้อมสำหรับการขยายการลงทุนหรือยกระดับธุรกิจ",
                time: "สัปดาห์นี้"
            });
        }

        // 5. System email ready
        notifs.push({
            id: "email_feature",
            type: "info",
            level: "info",
            badge: "อีเมลพร้อมใช้งาน",
            title: "ระบบแจ้งเตือนทางอีเมลเปิดใช้งานแล้ว (Email Notifications Active)",
            desc: "สามารถส่งสรุปผลการวิเคราะห์และความเสี่ยงสำคัญตรงเข้ากล่องข้อความอีเมลของคุณได้ตลอด 24 ชั่วโมง",
            time: "ระบบ"
        });

        return notifs;
    }

    function renderNotifications() {
        const container = document.getElementById("notifListContainer");
        if (!container) return;

        const all = getGeneratedNotifications();
        let filtered = all;

        if (activeFilter === "urgent") {
            filtered = all.filter(n => n.type === "danger" || n.type === "warning");
        } else if (activeFilter === "info") {
            filtered = all.filter(n => n.type === "info" || n.type === "success");
        }

        const countBadge = document.getElementById("notifCountBadge");
        if (countBadge) countBadge.textContent = all.length;

        if (!filtered.length) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fa-solid fa-bell-slash text-4xl mb-3 text-slate-600"></i>
                    <p class="text-sm">ไม่มีรายการแจ้งเตือนในหมวดหมู่นี้</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(n => {
            const icon = n.type === 'danger' ? 'fa-triangle-exclamation text-rose-400'
                       : n.type === 'warning' ? 'fa-circle-exclamation text-amber-400'
                       : n.type === 'success' ? 'fa-circle-check text-emerald-400'
                       : 'fa-circle-info text-cyan-400';

            const badgeColor = n.type === 'danger' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                             : n.type === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                             : n.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                             : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';

            return `
                <div class="notif-item ${n.type}">
                    <div class="text-xl mt-0.5">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <div class="flex items-center gap-2">
                                <span class="notif-badge ${badgeColor}">${escapeHtml(n.badge)}</span>
                                <h4 class="text-sm font-bold text-white">${escapeHtml(n.title)}</h4>
                            </div>
                            <span class="text-[11px] text-slate-500">${escapeHtml(n.time)}</span>
                        </div>
                        <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(n.desc)}</p>
                    </div>
                </div>
            `;
        }).join("");
    }

    function loadNotifications() {
        renderNotifications();
    }

    // 4. Send Email Alert Functionality
    async function sendEmailAlerts() {
        const btn = document.getElementById("sendEmailNowBtn");
        const emailInput = document.getElementById("targetEmailInput");
        const recipient = emailInput?.value.trim() || currentUser.email || "owner@businesspilot.ai";

        if (!recipient || !recipient.includes("@")) {
            alert("กรุณากรอกอีเมลที่ถูกต้อง");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังส่งแจ้งเตือน...`;
        }

        const notifs = getGeneratedNotifications();
        const payload = {
            email: recipient,
            subject: `[BusinessPilot AI Alert] แจ้งเตือนสถานะสุขภาพธุรกิจของคุณ`,
            notifications: notifs.map(n => ({
                title: n.title,
                message: n.desc,
                level: n.level
            })),
            business_status: rawAnalysis?.business_health?.status || "วิเคราะห์แล้ว",
            health_score: rawAnalysis?.business_health?.score || 0
        };

        try {
            const resp = await fetch(`${API_URL}/send-notification-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || data.delivery_status !== "sent") throw new Error(data.detail || data.message || "ระบบยังส่งอีเมลไม่สำเร็จ");

            // Save to dispatch history
            saveEmailHistory(recipient, notifs.length, data.delivery_status || "sent");

            showToast(`✅ ${data.message || `ส่งอีเมลแจ้งเตือนไปยัง ${recipient} สำเร็จ!`}`);
        } catch (err) {
            console.error("Email send error", err);
            saveEmailHistory(recipient, notifs.length, "failed");
            showToast(`ส่งไม่สำเร็จ: ${err.message || "ตรวจสอบการเชื่อมต่อและการตั้งค่าอีเมล"}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> ส่งการแจ้งเตือนเข้าอีเมลเดี๋ยวนี้`;
            }
            renderEmailHistory();
        }
    }

    function saveEmailHistory(recipient, count, status) {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem("email_dispatch_history") || "[]");
        } catch (_) {}

        history.unshift({
            recipient,
            count,
            status,
            date: new Date().toLocaleString("th-TH")
        });

        history = history.slice(0, 10); // Keep last 10
        localStorage.setItem("email_dispatch_history", JSON.stringify(history));
    }

    function renderEmailHistory() {
        const tbody = document.getElementById("emailHistoryBody");
        if (!tbody) return;

        let history = [];
        try {
            history = JSON.parse(localStorage.getItem("email_dispatch_history") || "[]");
        } catch (_) {}

        if (!history.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-slate-500 text-xs">ยังไม่มีประวัติการส่งอีเมล</td></tr>`;
            return;
        }

        tbody.innerHTML = history.map(h => `
            <tr class="border-b border-slate-800 text-xs">
                <td class="py-2.5 text-slate-300">${escapeHtml(h.date)}</td>
                <td class="py-2.5 text-cyan-400 font-medium">${escapeHtml(h.recipient)}</td>
                <td class="py-2.5 text-slate-400">${h.count} รายการ</td>
                <td class="py-2.5">
                    <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        <i class="fa-solid fa-circle-check"></i> ${h.status === 'sent' ? 'ส่งแล้ว' : 'สำเร็จ'}
                    </span>
                </td>
            </tr>
        `).join("");
    }

    function showToast(msg) {
        const toast = document.createElement("div");
        toast.className = "fixed bottom-5 right-5 z-50 bg-slate-900 border border-cyan-500 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2";
        toast.innerHTML = `<i class="fa-solid fa-circle-info text-cyan-400"></i> <span>${escapeHtml(msg)}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function escapeHtml(str) {
        return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
})();
