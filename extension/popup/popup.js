/** Zapply popup: pairing, one-click fill, quick settings. */

const $ = (id) => document.getElementById(id);

const send = (message) =>
  new Promise((resolve) => chrome.runtime.sendMessage(message, (res) => resolve(res ?? { ok: false })));

const TOGGLES = [
  ["autofillOnLoad", "Fill as soon as a form loads"],
  ["autoPilot", "Auto Pilot (fill and submit)"],
  ["showOverlay", "Show the status pill"],
  ["trackAutomatically", "Track applications"],
  ["reuseSavedResponses", "Reuse saved answers"],
];

let session = null;

/* ------------------------------------------------------------------ */
/*  Pairing view                                                       */
/* ------------------------------------------------------------------ */

function showPairView() {
  $("view-pair").hidden = false;
  $("view-main").hidden = true;
  chrome.storage.local.get("apiBase", ({ apiBase }) => {
    $("apiBase").value = apiBase || "http://localhost:3000";
  });
}

$("code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  $("pair-error").hidden = true;
});

$("code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("pair-btn").click();
});

$("pair-btn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (code.length !== 6) {
    $("pair-error").textContent = "Enter all six characters from your dashboard.";
    $("pair-error").hidden = false;
    return;
  }

  $("pair-btn").disabled = true;
  $("pair-btn").textContent = "Connecting…";

  const res = await send({ type: "ZAPPLY_PAIR", code, apiBase: $("apiBase").value.trim() });

  $("pair-btn").disabled = false;
  $("pair-btn").textContent = "Connect";

  if (!res.ok) {
    $("pair-error").textContent = res.error || "That code didn't work.";
    $("pair-error").hidden = false;
    return;
  }

  session = res.data.session;
  renderMain();
});

$("open-dashboard").addEventListener("click", () => send({ type: "ZAPPLY_OPEN_DASHBOARD" }));
$("open-dashboard-2").addEventListener("click", () => send({ type: "ZAPPLY_OPEN_DASHBOARD" }));

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

function renderMain() {
  $("view-pair").hidden = true;
  $("view-main").hidden = false;

  $("plan-badge").hidden = !session?.premium;

  // Profiles
  const select = $("profile-select");
  select.innerHTML = "";
  (session?.profiles ?? []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p._id;
    opt.textContent = p.label || "Profile";
    opt.selected = p._id === session.profile?._id;
    select.appendChild(opt);
  });
  select.disabled = (session?.profiles?.length ?? 0) < 2;

  // Stats
  $("stat-answers").textContent = session?.responses?.length ?? 0;
  chrome.storage.local.get("stats", ({ stats }) => {
    $("stat-apps").textContent = stats?.applications ?? 0;
  });

  // Toggles
  const wrap = $("toggles");
  wrap.innerHTML = "";
  TOGGLES.forEach(([key, label]) => {
    const row = document.createElement("label");
    row.className = "toggle";
    row.innerHTML = `<span>${label}</span>`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = session?.settings?.[key] !== false && Boolean(session?.settings?.[key] ?? key !== "autoPilot");
    if (key === "autoPilot") input.checked = Boolean(session?.settings?.autoPilot);
    input.addEventListener("change", () => saveSetting(key, input.checked));
    row.appendChild(input);
    wrap.appendChild(row);
  });

  refreshPageStatus();
}

async function saveSetting(key, value) {
  session.settings = { ...(session.settings ?? {}), [key]: value };
  chrome.storage.local.set({ session });

  const { apiBase, token } = await new Promise((r) =>
    chrome.storage.local.get(["apiBase", "token"], r)
  );
  fetch(`${apiBase}/api/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ [key]: value }),
  }).catch(() => {});
}

$("profile-select").addEventListener("change", async (e) => {
  const res = await send({ type: "ZAPPLY_SET_PROFILE", profileId: e.target.value });
  if (res.ok) session = res.data;
});

/* ------------------------------------------------------------------ */
/*  Page status + fill                                                 */
/* ------------------------------------------------------------------ */

function setStatus(tone, title, body = "") {
  $("status-dot").dataset.tone = tone;
  $("status-title").textContent = title;
  $("status-body").textContent = body;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshPageStatus() {
  const tab = await activeTab();
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) {
    setStatus("idle", "No page to fill", "Open a job application and try again.");
    $("fill-btn").disabled = true;
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "ZAPPLY_STATUS" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      setStatus("idle", "Zapply isn't running here", "Reload the page if you just installed the extension.");
      $("fill-btn").disabled = false;
      return;
    }

    if (res.duplicate) {
      const when = new Date(res.duplicate.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      setStatus(
        "warn",
        "You already applied to this",
        `Sent ${when} · currently "${res.duplicate.stage}". Fill anyway below.`
      );
      $("fill-btn").disabled = false;
      $("fill-btn").textContent = "Fill it anyway";
      return;
    }

    if (res.lastRun) {
      $("stat-fields").textContent = res.lastRun.unmatched || res.lastRun.drafted ? String(res.lastRun.filled) : "—";
      const detail = [
        res.ats && `Detected: ${res.ats}`,
        res.lastRun.matchScore != null && `${res.lastRun.profileLabel} · ${res.lastRun.matchScore}% match`,
        res.lastRun.drafted && `${res.lastRun.drafted} drafted — read before submitting`,
      ]
        .filter(Boolean)
        .join(" · ");
      setStatus(
        res.lastRun.unmatched ? "warn" : "ready",
        res.lastRun.unmatched
          ? `${res.lastRun.unmatched} field${res.lastRun.unmatched === 1 ? "" : "s"} need you`
          : (res.lastRun.drafted ? "Review drafted answers" : "Ready to review"),
        res.lastRun.unmatched ? detail : (res.lastRun.drafted ? detail : "Profile and saved answers applied.")
      );
    } else if (res.isApplication) {
      setStatus("ready", "Application detected", res.ats ? `Detected: ${res.ats}` : "Ready to fill.");
    } else {
      setStatus("idle", "This doesn't look like an application", "You can still fill it manually.");
    }
    $("fill-btn").disabled = false;
  });
}

$("stop-btn").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  await send({ type: "ZAPPLY_STOP" });
  $("stop-btn").hidden = true;
  $("fill-btn").hidden = false;
  $("fill-btn").disabled = false;
  $("fill-btn").textContent = "Fill this application";
  setStatus("warn", "Autofill stopped", "No more fields will be changed until you click Fill this application again.");
});

$("fill-btn").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab?.id) return;

  $("fill-btn").disabled = true;
  $("fill-btn").textContent = "Filling…";
  $("stop-btn").hidden = false;
  $("stop-btn").disabled = false;

  chrome.tabs.sendMessage(tab.id, { type: "ZAPPLY_RUN" }, (res) => {
    $("fill-btn").disabled = false;
    $("fill-btn").textContent = "Fill this application";
    $("stop-btn").hidden = true;

    if (chrome.runtime.lastError || !res?.ok) {
      setStatus("warn", "Couldn't fill this page", "Reload it and try again.");
      return;
    }
    $("stat-fields").textContent = res.data.unmatched || res.data.drafted ? String(res.data.filled) : "—";
    const needsReview = Boolean(res.data.unmatched || res.data.drafted);
    setStatus(
      res.data.unmatched ? "warn" : "ready",
      res.data.unmatched
        ? `${res.data.unmatched} field${res.data.unmatched === 1 ? "" : "s"} need you`
        : (res.data.drafted ? "Review drafted answers" : "Ready to review"),
      res.data.unmatched
        ? [
            `${res.data.detected} fields checked`,
            res.data.matchScore != null && `${res.data.matchScore}% match`,
          ].filter(Boolean).join(" · ")
        : (res.data.drafted ? "AI drafted answers are marked on the form." : "Profile and saved answers applied.")
    );
    if (!needsReview) setTimeout(() => window.close(), 120);
  });
});

$("sync-btn").addEventListener("click", async () => {
  $("sync-btn").textContent = "Syncing…";
  const res = await send({ type: "ZAPPLY_GET_SESSION", force: true });
  if (res.ok) {
    session = res.data;
    renderMain();
  }
  $("sync-btn").textContent = "Sync now";
});

$("unpair-btn").addEventListener("click", async () => {
  await send({ type: "ZAPPLY_UNPAIR" });
  session = null;
  $("code").value = "";
  showPairView();
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

(async function init() {
  const res = await send({ type: "ZAPPLY_GET_SESSION" });
  if (res.ok && res.data?.profile) {
    session = res.data;
    renderMain();
  } else {
    showPairView();
  }
})();
