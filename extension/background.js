/**
 * ZAPPLY BACKGROUND SERVICE WORKER
 * --------------------------------
 * Owns the bearer token and the cached session. Content scripts never talk to
 * the API directly — they ask the worker, which keeps credentials out of pages
 * and lets one fetch serve every tab.
 */

const DEFAULT_API = "http://localhost:3000";
// Short, because this is how long a settings change in the dashboard takes to
// reach the extension. Anything longer and toggles look broken.
const CACHE_TTL_MS = 60 * 1000;
// Beyond this we block on the network rather than serve a stale profile.
const STALE_MAX_MS = 30 * 60 * 1000;
let refreshing = null;

/* ------------------------------------------------------------------ */
/*  Storage helpers                                                    */
/* ------------------------------------------------------------------ */

const store = {
  get: (keys) => new Promise((r) => chrome.storage.local.get(keys, r)),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
  remove: (keys) => new Promise((r) => chrome.storage.local.remove(keys, r)),
};

async function apiBase() {
  const { apiBase } = await store.get("apiBase");
  return (apiBase || DEFAULT_API).replace(/\/+$/, "");
}

async function authHeaders() {
  const { token } = await store.get("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const base = await apiBase();
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(options.headers ?? {}),
  };

  try {
    const res = await fetch(`${base}${path}`, { ...options, headers });
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      await store.remove(["token", "session", "sessionAt"]);
      setBadge("!", "#E5484D");
      return { ok: false, error: "Your Zapply session expired. Pair again from the dashboard." };
    }
    if (!res.ok) return { ok: false, error: json.error || `Request failed (${res.status})` };
    return { ok: true, data: json.data };
  } catch (err) {
    return { ok: false, error: "Can't reach Zapply. Check that the app is running." };
  }
}

/* ------------------------------------------------------------------ */
/*  Session cache                                                      */
/* ------------------------------------------------------------------ */

/** Bootstrap payload, cached so a burst of tabs costs one request. */
async function getSession({ force = false } = {}) {
  const { session, sessionAt, token } = await store.get(["session", "sessionAt", "token"]);
  if (!token) return null;

  const age = sessionAt ? Date.now() - sessionAt : Infinity;

  if (session && age < CACHE_TTL_MS && !force) return session;

  // Stale-while-revalidate: an autofill shouldn't wait on the network, but the
  // cache also shouldn't go stale for minutes. Serve what we have and refresh
  // behind it, so the next fill uses current settings and saved answers.
  if (session && age < STALE_MAX_MS && !force) {
    refreshSession();
    return session;
  }

  const res = await api("/api/extension/bootstrap");
  if (!res.ok) return session ?? null;

  const active =
    res.data.profiles.find((p) => p._id === res.data.activeProfileId) ??
    res.data.profiles.find((p) => p.isDefault) ??
    res.data.profiles[0] ??
    null;

  const next = {
    user: res.data.user,
    premium: res.data.user?.premium ?? false,
    settings: res.data.settings ?? {},
    profiles: res.data.profiles ?? [],
    profile: active,
    responses: res.data.responses ?? [],
    syncedAt: res.data.syncedAt,
  };

  await store.set({ session: next, sessionAt: Date.now() });
  setBadge(next.profile ? "" : "!", next.profile ? "#00C2A8" : "#FFB020");
  return next;
}

/** Background refresh, deduped so ten tabs don't trigger ten fetches. */
function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = getSession({ force: true })
    .catch(() => null)
    .finally(() => { refreshing = null; });
  return refreshing;
}

function setBadge(text, color = "#5B2AD6") {
  chrome.action.setBadgeText({ text });
  if (text) chrome.action.setBadgeBackgroundColor({ color });
}

/* ------------------------------------------------------------------ */
/*  Message router                                                     */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    switch (msg?.type) {
      /* --- pairing --- */
      case "ZAPPLY_PAIR": {
        const base = (msg.apiBase || (await apiBase())).replace(/\/+$/, "");
        await store.set({ apiBase: base });
        try {
          const res = await fetch(`${base}/api/extension/pair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: msg.code }),
          });
          const json = await res.json();
          if (!res.ok) return respond({ ok: false, error: json.error });

          await store.set({ token: json.data.token, user: json.data.user });
          const session = await getSession({ force: true });
          return respond({ ok: true, data: { user: json.data.user, session } });
        } catch {
          return respond({ ok: false, error: "Couldn't reach that Zapply URL." });
        }
      }

      case "ZAPPLY_UNPAIR": {
        await store.remove(["token", "user", "session", "sessionAt"]);
        setBadge("");
        return respond({ ok: true });
      }

      /* --- session --- */
      case "ZAPPLY_GET_SESSION": {
        const session = await getSession({ force: msg.force });
        return respond(session ? { ok: true, data: session } : { ok: false, error: "not-connected" });
      }

      case "ZAPPLY_SET_PROFILE": {
        const { session } = await store.get("session");
        if (!session) return respond({ ok: false, error: "not-connected" });
        const profile = session.profiles.find((p) => p._id === msg.profileId);
        if (profile) {
          session.profile = profile;
          await store.set({ session });
        }
        return respond({ ok: true, data: session });
      }

      /* --- sync --- */
      case "ZAPPLY_SYNC": {
        const res = await api("/api/extension/sync", {
          method: "POST",
          body: JSON.stringify(msg.payload),
        });
        if (res.ok) {
          // New saved answers should be available to other tabs right away.
          await getSession({ force: true });
          const { stats } = await store.get("stats");
          const next = { ...(stats ?? { applications: 0 }) };
          if (msg.payload?.application) next.applications = (next.applications ?? 0) + 1;
          await store.set({ stats: next });
        }
        return respond(res);
      }

      /* --- premium: profile scoring --- */
      case "ZAPPLY_SCORE": {
        return respond(await api("/api/ai/score", { method: "POST", body: JSON.stringify(msg.payload) }));
      }

      /* --- premium: generated answer --- */
      case "ZAPPLY_ANSWER": {
        return respond(await api("/api/ai/answer", { method: "POST", body: JSON.stringify(msg.payload) }));
      }

      /* --- duplicate detection --- */
      case "ZAPPLY_CHECK": {
        return respond(await api("/api/extension/check", { method: "POST", body: JSON.stringify(msg.payload) }));
      }

      case "ZAPPLY_OPEN_DASHBOARD": {
        chrome.tabs.create({ url: `${await apiBase()}/dashboard` });
        return respond({ ok: true });
      }

      default:
        return respond({ ok: false, error: "Unknown message." });
    }
  })();

  return true; // keep the channel open for the async work above
});

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { apiBase: existing } = await store.get("apiBase");
  if (!existing) await store.set({ apiBase: DEFAULT_API });

  if (reason === "install") {
    chrome.tabs.create({ url: `${await apiBase()}/auth?mode=signup` });
    setBadge("1", "#FFB020");
  }
});

chrome.runtime.onStartup.addListener(() => getSession({ force: true }));

// Returning from the dashboard to a job page should pick up whatever changed.
chrome.tabs.onActivated.addListener(() => refreshSession());

/** Keyboard shortcut — fill the active tab on demand. */
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "run-autofill") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "ZAPPLY_RUN" });
});
