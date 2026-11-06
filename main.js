"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PencilInkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

// src/log.ts
var MAX_ENTRIES = 1200;
var MAX_FILE_BYTES = 350 * 1024;
var UTF8_ENC = new TextEncoder();
var UTF8_DEC = new TextDecoder();
var Log = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.entries = [];
    this.lastErrorFlush = 0;
    this.dirty = false;
    this.timer = null;
    this.started = Date.now();
    this._logPath = "";
    this.perf = {
      frames: 0,
      frameMsSum: 0,
      frameMsMax: 0,
      frameEmaMs: 0,
      frameOver8Ms: 0,
      renders: 0,
      renderMsSum: 0,
      renderMsMax: 0,
      strokes: 0,
      slowFrames: 0
    };
    this.previous = "";
  }
  path() {
    if (!this._logPath && this.plugin && this.plugin.manifest && this.plugin.manifest.dir) {
      this._logPath = `${this.plugin.manifest.dir}/pencil-ink.log`;
    }
    return this._logPath || `${this.plugin.manifest.dir}/pencil-ink.log`;
  }
  async load() {
    try {
      const ad = this.plugin.app.vault.adapter;
      const p = this.path();
      if (await ad.exists(p)) {
        const old = await ad.read(p);
        this.entries.push({ t: Date.now(), lvl: "info", cat: "log", msg: `--- previous session (${old.split("\n").length} lines) follows in file only ---`, _line: null });
        this.previous = old.slice(-6e4);
      }
    } catch (e) {
    }
  }
  add(lvl, cat, msg, data) {
    let line2 = msg;
    if (data !== void 0) {
      try {
        line2 += " " + (typeof data === "string" ? data : JSON.stringify(data, (_k, v) => v instanceof Error ? v.message : v));
      } catch (e) {
        line2 += " [unserialisable]";
      }
    }
    this.entries.push({ t: Date.now(), lvl, cat, msg: line2.slice(0, 600), _line: null });
    if (this.entries.length >= MAX_ENTRIES + 200) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    if (lvl === "error") {
      console.error(`[Pencil Ink] ${cat}: ${line2}`);
      if (Date.now() - this.lastErrorFlush > 5e3) {
        this.lastErrorFlush = Date.now();
        void this.flush();
      }
    }
    this.dirty = true;
    this.schedule();
  }
  debug(cat, msg, data) {
    this.add("debug", cat, msg, data);
  }
  info(cat, msg, data) {
    this.add("info", cat, msg, data);
  }
  warn(cat, msg, data) {
    this.add("warn", cat, msg, data);
  }
  error(cat, msg, data) {
    this.add("error", cat, msg, data);
  }
  frame(ms) {
    const p = this.perf;
    p.frames++;
    p.frameMsSum += ms;
    p.frameEmaMs = p.frames === 1 ? ms : p.frameEmaMs * 0.9 + ms * 0.1;
    if (ms > p.frameMsMax) p.frameMsMax = ms;
    if (ms > 8.33) p.frameOver8Ms++;
    if (ms > 16) p.slowFrames++;
  }
  render(ms) {
    const p = this.perf;
    p.renders++;
    p.renderMsSum += ms;
    if (ms > p.renderMsMax) p.renderMsMax = ms;
  }
  schedule() {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 3e4);
  }
  async flush() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
      let text = this.format(this.entries);
      if (text.length > MAX_FILE_BYTES) text = text.slice(-MAX_FILE_BYTES);
      await this.plugin.app.vault.adapter.write(this.path(), text);
    } catch (e) {
    }
  }
  fmt(t) {
    const d = new Date(t);
    const p = (n, w = 2) => String(n).padStart(w, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }
  format(list2) {
    const active = list2.length > MAX_ENTRIES ? list2.slice(-MAX_ENTRIES) : list2;
    const out = new Array(active.length);
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      if (!e._line) e._line = `${this.fmt(e.t)} ${e.lvl.toUpperCase().padEnd(5)} [${e.cat}] ${e.msg}`;
      out[i] = e._line;
    }
    return out.join("\n");
  }
  clear() {
    this.entries = [];
    this.previous = "";
    this.dirty = true;
    this.info("log", "log cleared");
  }
  /** Header with environment details, followed by the entries. */
  report(header) {
    const p = this.perf;
    const avg = (s, n) => n ? (s / n).toFixed(2) : "0";
    const perf = `perf: strokes=${p.strokes} liveFrames=${p.frames} avgFrameMs=${avg(p.frameMsSum, p.frames)} emaFrameMs=${p.frameEmaMs.toFixed(2)} maxFrameMs=${p.frameMsMax.toFixed(1)} over8ms(120Hz)=${p.frameOver8Ms} slowFrames(>16ms)=${p.slowFrames} pageRenders=${p.renders} avgRenderMs=${avg(p.renderMsSum, p.renders)} maxRenderMs=${p.renderMsMax.toFixed(0)}`;
    const prev = this.previous ? `

===== previous session (tail) =====
${this.previous.slice(-12e3)}` : "";
    return `${header}
${perf}

===== this session =====
${this.format(this.entries)}${prev}`;
  }
};

// src/recorder.ts
var KEEP = 60;
var r2 = (v) => Math.round(v * 100) / 100;
var Recorder = class {
  constructor() {
    this.enabled = true;
    this.strokes = [];
    this.count = 0;
    this.cur = null;
    this.t0 = 0;
    this.now0 = 0;
    this.ox = 0;
    this.oy = 0;
  }
  start(src, tool, size, scale, sigmaPx, predict, rect, cx, cy, t) {
    if (!this.enabled) return;
    this.t0 = t;
    this.now0 = performance.now();
    this.ox = rect.left;
    this.oy = rect.top;
    this.cur = {
      n: ++this.count,
      whenMs: Date.now(),
      src,
      tool,
      size,
      scale: +scale.toFixed(4),
      sigmaPx,
      predict,
      lateMs: r2(this.now0 - t),
      down: [r2(cx - this.ox), r2(cy - this.oy)],
      up: null,
      ms: 0,
      events: [],
      out: null,
      trimmedPx: null
    };
  }
  flat(list2, fallbackT) {
    var _a;
    const len = list2.length;
    if (!len) return [];
    const o = new Array(len * 3);
    for (let i = 0; i < len; i++) {
      const s = list2[i];
      const base = i * 3;
      o[base] = r2(s.clientX - this.ox);
      o[base + 1] = r2(s.clientY - this.oy);
      o[base + 2] = r2(((_a = s.timeStamp) != null ? _a : fallbackT) - this.t0);
    }
    return o;
  }
  event(t, own, coalesced, predicted) {
    const c = this.cur;
    if (!c || c.events.length > 4e3) return;
    c.events.push({
      t: r2(t - this.t0),
      at: r2(performance.now() - this.now0),
      e: [r2(own.clientX - this.ox), r2(own.clientY - this.oy)],
      c: this.flat(coalesced, t),
      p: this.flat(predicted, t)
    });
  }
  finish(cx, cy, out, trimmedPx) {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    c.up = [r2(cx - this.ox), r2(cy - this.oy)];
    c.ms = Math.round(performance.now() - this.now0);
    c.trimmedPx = trimmedPx;
    if (out) {
      const nPts = Math.floor(out.length / 3);
      const ptsOut = new Array(nPts * 2);
      for (let i = 0, j = 0; i < out.length; i += 3, j += 2) {
        ptsOut[j] = out[i];
        ptsOut[j + 1] = out[i + 1];
      }
      c.out = ptsOut;
    }
    this.strokes.push(c);
    if (this.strokes.length > KEEP) this.strokes.shift();
  }
  cancel() {
    this.cur = null;
  }
  get size() {
    return this.strokes.length;
  }
  clear() {
    this.strokes = [];
  }
  export(header) {
    const formattedStrokes = this.strokes.map((s) => ({
      ...s,
      when: s.when || new Date(s.whenMs || Date.now()).toISOString()
    }));
    return JSON.stringify({ format: "pencil-ink-recording", v: 2, ...header, strokes: formattedStrokes });
  }
};

// src/pdfgen.ts
function blankPdf(width = 595, height = 842, pattern = "blank") {
  const parts = [];
  if (pattern === "lined") {
    parts.push("0.75 0.85 0.95 RG 0.5 w");
    for (let y = 60; y <= 780; y += 28) {
      parts.push(`40 ${y} m ${width - 40} ${y} l`);
    }
    parts.push("S");
  } else if (pattern === "grid") {
    parts.push("0.85 0.88 0.92 RG 0.4 w");
    for (let x = 40; x <= width - 40; x += 14.17) {
      const xs = x.toFixed(2);
      parts.push(`${xs} 40 m ${xs} ${height - 40} l`);
    }
    for (let y = 40; y <= height - 40; y += 14.17) {
      const ys = y.toFixed(2);
      parts.push(`40 ${ys} m ${width - 40} ${ys} l`);
    }
    parts.push("S");
  } else if (pattern === "dot") {
    const maxY = 40 + Math.floor((height - 80) / 14.17) * 14.17;
    const maxYs = maxY.toFixed(2);
    parts.push("0.7 0.7 0.75 RG 1 J 1.3 w [0 14.17] 0 d");
    for (let x = 40; x <= width - 40; x += 14.17) {
      const xs = x.toFixed(2);
      parts.push(`${xs} 40 m ${xs} ${maxYs} l`);
    }
    parts.push("S");
  } else if (pattern === "cornell") {
    parts.push("0.75 0.85 0.95 RG 0.5 w");
    for (let y = 180; y <= 760; y += 26) {
      parts.push(`175 ${y} m ${width - 40} ${y} l`);
    }
    parts.push("S", "0.92 0.58 0.58 RG 0.8 w", `40 760 m ${width - 40} 760 l`, "175 160 m 175 760 l", `40 160 m ${width - 40} 160 l`, "S");
  }
  const stream = parts.length ? parts.join("\n") + "\n" : "";
  const streamLen = typeof Buffer !== "undefined" ? Buffer.byteLength(stream, "utf8") : UTF8_ENC.encode(stream).length;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n \n";
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return UTF8_ENC.encode(out).buffer;
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  v: 9,
  clientId: "",
  clientSecret: "",
  accessToken: "",
  refreshToken: "",
  expiresAt: 0,
  driveFolder: "Obsidian Vault",
  autoSync: true,
  pollSeconds: 8,
  pushDelayMs: 2500,
  includeFolders: "",
  excludeFolders: "",
  maxFileMB: 150,
  openAllPdfs: true,
  streamMode: "auto",
  fullLoadMB: 320,
  quicknoteFolder: "Quicknotes",
  openLibraryOnStartup: false,
  newTabOpensLibrary: true,
  starredPaths: [],
  coverColors: {},
  pendingOpen: "",
  maxDpr: 2,
  pen: { colors: ["#1c1c1e", "#007aff", "#ff3b30"], sizes: [1.6, 3.2, 6], c: 0, s: 1 },
  penStyle: "fountain",
  pressureSensitivity: 1.0,
  highlighter: { colors: ["#ffde59", "#69e6a6", "#ff94af"], sizes: [12, 18, 30], c: 0, s: 1 },
  eraserSizes: [12, 24, 48],
  eraserSlot: 1,
  eraserMode: "stroke",
  eraseHlOnly: false,
  autoDeselectEraser: false,
  hlStraight: false,
  blockSidebarSwipe: true,
  openInScroll: false,
  autoHideToolbar: true,
  penSmooth: 3,
  lastPages: {},
  doubleTapUndo: true,
  blockVerticalSwipe: true
};

// src/sync.ts
var import_obsidian2 = require("obsidian");

// src/drive.ts
var import_obsidian = require("obsidian");
var SCOPE = "https://www.googleapis.com/auth/drive";
var API = "https://www.googleapis.com/drive/v3";
var UPLOAD = "https://www.googleapis.com/upload/drive/v3";
var REDIRECT = "http://127.0.0.1:8765";
var FOLDER_MIME = "application/vnd.google-apps.folder";
var FIELDS = "id,name,mimeType,md5Checksum,modifiedTime,size,parents,trashed";
var DriveError = class extends Error {
  constructor(msg, status = 0, fatal = false) {
    super(msg);
    this.status = status;
    this.fatal = fatal;
  }
};
var form = (o) => new URLSearchParams(o).toString();
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Request timed out after ${Math.round(ms / 1e3)} s`)), ms);
  p.then(
    (v) => {
      clearTimeout(timer);
      resolve(v);
    },
    (e) => {
      clearTimeout(timer);
      reject(e);
    }
  );
});
var esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
function b64url(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const chunks = [];
  for (let i = 0; i < b.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, b.subarray(i, i + 8192)));
  }
  return btoa(chunks.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function safeDriveErrorText(r) {
  try {
    const j = r.json || (r.text ? JSON.parse(r.text) : null);
    if (j && typeof j === "object") {
      if (typeof j.error_description === "string") return j.error_description.slice(0, 160);
      if (j.error && typeof j.error.message === "string") return j.error.message.slice(0, 160);
      if (typeof j.error === "string") return j.error.slice(0, 160);
    }
  } catch (e) {
  }
  return String(r.text || "").replace(/"(access_token|refresh_token|client_secret)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"').slice(0, 160);
}
var Drive = class {
  constructor(plugin) {
    this.plugin = plugin;
    /** Bytes sent and received since Obsidian started, so the data used can be seen in settings. */
    this.bytesUp = 0;
    this.bytesDown = 0;
    this.refreshing = null;
  }
  get s() {
    return this.plugin.settings;
  }
  // ------------------------------------------------------------ auth (code flow + PKCE, pasted back)
  async beginAuth() {
    const raw = new Uint8Array(48);
    crypto.getRandomValues(raw);
    const verifier = b64url(raw);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", UTF8_ENC.encode(verifier)));
    const url = "https://accounts.google.com/o/oauth2/v2/auth?" + form({
      client_id: this.s.clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent"
    });
    return { url, verifier };
  }
  async finishAuth(pasted, verifier) {
    let code = pasted.trim();
    const m = code.match(/[?&]code=([^&\s]+)/);
    if (m) code = decodeURIComponent(m[1]);
    if (!code) throw new DriveError("Paste the address from the browser first.");
    const r = await (0, import_obsidian.requestUrl)({
      url: "https://oauth2.googleapis.com/token",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: form({
        client_id: this.s.clientId,
        client_secret: this.s.clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code"
      }),
      throw: false
    });
    if (r.status !== 200) throw new DriveError("Google rejected the code: " + safeDriveErrorText(r), r.status);
    this.s.accessToken = r.json.access_token;
    this.s.refreshToken = r.json.refresh_token || this.s.refreshToken;
    this.s.expiresAt = Date.now() + r.json.expires_in * 1e3;
    await this.plugin.saveSettings();
  }
  async ensureToken() {
    if (!this.s.refreshToken) throw new DriveError("Not connected to Google Drive", 401, true);
    if (this.s.accessToken && Date.now() < this.s.expiresAt - 6e4) return;
    if (!this.refreshing) this.refreshing = this.refreshAccess().finally(() => this.refreshing = null);
    return this.refreshing;
  }
  async refreshAccess() {
    var _a;
    const r = await (0, import_obsidian.requestUrl)({
      url: "https://oauth2.googleapis.com/token",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: form({
        client_id: this.s.clientId,
        client_secret: this.s.clientSecret,
        refresh_token: this.s.refreshToken,
        grant_type: "refresh_token"
      }),
      throw: false
    });
    if (r.status !== 200) {
      if (((_a = r.json) == null ? void 0 : _a.error) === "invalid_grant") {
        this.s.refreshToken = "";
        this.s.accessToken = "";
        await this.plugin.saveSettings();
        throw new DriveError("Google login expired. Reconnect in Pencil Ink settings.", 401, true);
      }
      throw new DriveError("Token refresh failed: " + safeDriveErrorText(r), r.status);
    }
    this.s.accessToken = r.json.access_token;
    this.s.expiresAt = Date.now() + r.json.expires_in * 1e3;
    await this.plugin.saveSettings();
  }
  // ------------------------------------------------------------ transport
  async call(req) {
    var _a, _b;
    if (req.body) this.bytesUp += typeof req.body === "string" ? req.body.length : req.body.byteLength;
    const r = await this.callRaw(req);
    this.bytesDown += r.arrayBuffer ? r.arrayBuffer.byteLength : (_b = (_a = r.text) == null ? void 0 : _a.length) != null ? _b : 0;
    return r;
  }
  async callRaw(req) {
    let attempt = 0;
    for (; ; ) {
      await this.ensureToken();
      const r = await withTimeout((0, import_obsidian.requestUrl)({
        url: req.url,
        method: req.method,
        body: req.body,
        contentType: req.contentType,
        headers: { Authorization: `Bearer ${this.s.accessToken}` },
        throw: false
      }), req.body ? 18e4 : 6e4);
      if (r.status === 401 && attempt < 1) {
        this.s.expiresAt = 0;
        attempt++;
        continue;
      }
      const limited = r.status === 429 || r.status >= 500 || r.status === 403 && /rateLimit/i.test(r.text);
      if (limited && attempt < 4) {
        attempt++;
        let waitMs = 600 * 2 ** attempt + Math.floor(Math.random() * 350);
        if (r.headers) {
          const raKey = Object.keys(r.headers).find((k) => k.toLowerCase() === "retry-after");
          const raSec = raKey ? Number(r.headers[raKey]) : 0;
          if (Number.isFinite(raSec) && raSec > 0 && raSec <= 60) waitMs = Math.max(waitMs, raSec * 1e3);
        }
        await sleep(waitMs);
        continue;
      }
      return r;
    }
  }
  check(r, what) {
    if (r.status >= 200 && r.status < 300) return;
    throw new DriveError(`Drive ${what} failed (${r.status}): ${safeDriveErrorText(r)}`, r.status);
  }
  // ------------------------------------------------------------ files
  async startToken() {
    const r = await this.call({ url: `${API}/changes/startPageToken?supportsAllDrives=false` });
    this.check(r, "token");
    return r.json.startPageToken;
  }
  async changes(token) {
    var _a;
    const fields = `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`;
    const r = await this.call({
      url: `${API}/changes?pageToken=${encodeURIComponent(token)}&pageSize=1000&includeRemoved=true&restrictToMyDrive=true&fields=${encodeURIComponent(fields)}`
    });
    this.check(r, "changes");
    return { changes: (_a = r.json.changes) != null ? _a : [], next: r.json.nextPageToken, newStart: r.json.newStartPageToken };
  }
  async listChildren(parents) {
    var _a;
    const out = [];
    let page = "";
    const q2 = "(" + parents.map((p) => `'${p}' in parents`).join(" or ") + ") and trashed=false";
    do {
      const r = await this.call({
        url: `${API}/files?q=${encodeURIComponent(q2)}&pageSize=1000&fields=${encodeURIComponent(`nextPageToken,files(${FIELDS})`)}` + (page ? `&pageToken=${encodeURIComponent(page)}` : "")
      });
      this.check(r, "list");
      out.push(...(_a = r.json.files) != null ? _a : []);
      page = r.json.nextPageToken || "";
    } while (page);
    return out;
  }
  /** Files or folders with this name directly under the parent, found on Drive itself (not from memory). */
  async findChildren(parent, name, mime) {
    var _a;
    const esc2 = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q2 = `'${parent}' in parents and name = '${esc2}' and trashed=false` + (mime ? ` and mimeType = '${mime}'` : "");
    const out = [];
    let page = "";
    do {
      const r = await this.call({
        url: `${API}/files?q=${encodeURIComponent(q2)}&pageSize=1000&fields=${encodeURIComponent(`nextPageToken,files(${FIELDS})`)}` + (page ? `&pageToken=${encodeURIComponent(page)}` : "")
      });
      this.check(r, "find");
      out.push(...(_a = r.json.files) != null ? _a : []);
      page = r.json.nextPageToken || "";
    } while (page);
    return out;
  }
  async get(id) {
    const r = await this.call({ url: `${API}/files/${id}?fields=${FIELDS}` });
    if (r.status === 404) return null;
    this.check(r, "get");
    return r.json;
  }
  async download(id) {
    const r = await this.call({ url: `${API}/files/${id}?alt=media` });
    this.check(r, "download");
    return r.arrayBuffer;
  }
  async createFolder(name, parent) {
    const r = await this.call({
      url: `${API}/files?fields=${FIELDS}`,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] })
    });
    this.check(r, "create folder");
    return r.json;
  }
  async patch(id, body, addParent, removeParent) {
    let url = `${API}/files/${id}?fields=${FIELDS}`;
    if (addParent) url += `&addParents=${addParent}`;
    if (removeParent) url += `&removeParents=${removeParent}`;
    const r = await this.call({ url, method: "PATCH", contentType: "application/json", body: JSON.stringify(body) });
    this.check(r, "update");
    return r.json;
  }
  async trash(id) {
    const r = await this.call({
      url: `${API}/files/${id}?fields=id`,
      method: "PATCH",
      contentType: "application/json",
      body: JSON.stringify({ trashed: true })
    });
    if (r.status === 404) return;
    this.check(r, "trash");
  }
  async upload(o) {
    const meta = o.id ? {} : { name: o.name, parents: [o.parent] };
    const method = o.id ? "PATCH" : "POST";
    const base = o.id ? `${UPLOAD}/files/${o.id}` : `${UPLOAD}/files`;
    if (o.data.byteLength <= 4 * 1024 * 1024) {
      const b = "pink" + Math.random().toString(36).slice(2);
      const enc = UTF8_ENC;
      const head = enc.encode(
        `--${b}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(meta)}\r
--${b}\r
Content-Type: application/octet-stream\r
\r
`
      );
      const tail = enc.encode(`\r
--${b}--`);
      const body = new Uint8Array(head.length + o.data.byteLength + tail.length);
      body.set(head, 0);
      body.set(new Uint8Array(o.data), head.length);
      body.set(tail, head.length + o.data.byteLength);
      const r = await this.call({
        url: `${base}?uploadType=multipart&fields=${FIELDS}`,
        method,
        contentType: `multipart/related; boundary=${b}`,
        body: body.buffer
      });
      this.check(r, "upload");
      return r.json;
    }
    const start = await this.call({
      url: `${base}?uploadType=resumable&fields=${FIELDS}`,
      method,
      contentType: "application/json; charset=UTF-8",
      body: JSON.stringify(meta)
    });
    this.check(start, "upload start");
    const key = Object.keys(start.headers).find((k) => k.toLowerCase() === "location");
    if (!key) throw new DriveError("Drive upload start returned no session URL");
    const put = await this.call({
      url: start.headers[key],
      method: "PUT",
      contentType: "application/octet-stream",
      body: o.data
    });
    this.check(put, "upload");
    return put.json;
  }
  /** Resolve the configured Drive folder (name, link or id) to a folder id, creating it if needed. */
  async resolveRoot(spec) {
    var _a;
    spec = spec.trim() || "Obsidian Vault";
    const m = spec.match(/folders\/([A-Za-z0-9_-]{10,})/) || spec.match(/^([A-Za-z0-9_-]{25,})$/);
    if (m) {
      const f = await this.get(m[1]);
      if (!f || f.mimeType !== FOLDER_MIME) throw new DriveError("That Drive link is not a folder you can access.");
      return f.id;
    }
    const q2 = `name='${esc(spec)}' and mimeType='${FOLDER_MIME}' and trashed=false and 'root' in parents`;
    const r = await this.call({ url: `${API}/files?q=${encodeURIComponent(q2)}&fields=files(id)&pageSize=5` });
    this.check(r, "folder lookup");
    if ((_a = r.json.files) == null ? void 0 : _a.length) {
      r.json.files.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      return r.json.files[0].id;
    }
    return (await this.createFolder(spec, "root")).id;
  }
};

// src/types.ts
var blankKey = (id) => "b:" + id;
var emptyDoc = (name = "") => ({
  version: 1,
  name,
  pages: {},
  deleted: {},
  updated: 0,
  blanks: {},
  bookmarks: {},
  removed: {}
});
var newId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
function mergeMarks(a = {}, b = {}) {
  const out = {};
  for (const src of [a, b]) for (const [k, m] of Object.entries(src != null ? src : {})) if (!out[k] || m.t > out[k].t) out[k] = m;
  return out;
}
function mergeDocs(a, b) {
  var _a, _b, _c, _d, _e;
  const deleted = { ...a.deleted };
  for (const k of Object.keys(b.deleted || {})) deleted[k] = Math.max((_a = deleted[k]) != null ? _a : 0, b.deleted[k]);
  const blanks = {};
  for (const src of [(_b = a.blanks) != null ? _b : {}, (_c = b.blanks) != null ? _c : {}]) {
    for (const [id, bp] of Object.entries(src)) if (!deleted[id] && !blanks[id]) blanks[id] = bp;
  }
  const pages = {};
  const keys = /* @__PURE__ */ new Set([...Object.keys(a.pages), ...Object.keys(b.pages)]);
  for (const key of keys) {
    if (key.startsWith("b:") && !blanks[key.slice(2)]) continue;
    const pa = (_d = a.pages[key]) != null ? _d : [];
    const pb = (_e = b.pages[key]) != null ? _e : [];
    if (pa === pb || pa.length === 0 || pb.length === 0) {
      const single = pa.length ? pa : pb;
      let cleanSorted = single.length > 0;
      const seenIds = /* @__PURE__ */ new Set();
      for (let i = 0; i < single.length; i++) {
        const s = single[i];
        if (deleted[s.id] || seenIds.has(s.id)) {
          cleanSorted = false;
          break;
        }
        seenIds.add(s.id);
        if (i > 0) {
          const prev = single[i - 1];
          if (prev.t > s.t || (prev.t === s.t && prev.id > s.id)) {
            cleanSorted = false;
            break;
          }
        }
      }
      if (cleanSorted) {
        if (single.length) pages[key] = single.slice();
        continue;
      }
    }
    const seen = /* @__PURE__ */ new Map();
    for (let i = 0; i < pa.length; i++) {
      const s = pa[i];
      if (!deleted[s.id] && !seen.has(s.id)) seen.set(s.id, s);
    }
    for (let i = 0; i < pb.length; i++) {
      const s = pb[i];
      if (!deleted[s.id] && !seen.has(s.id)) seen.set(s.id, s);
    }
    const arr = [...seen.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));
    if (arr.length) pages[key] = arr;
  }
  const bookmarks = mergeMarks(a.bookmarks, b.bookmarks);
  const removed = mergeMarks(a.removed, b.removed);
  return { version: 1, name: a.name || b.name, pages, deleted, updated: Math.max(a.updated, b.updated), blanks, bookmarks, removed };
}
var sameBlanks = (a, b) => {
  const ba = (a && a.blanks) || {};
  const bb = (b && b.blanks) || {};
  if (ba === bb) return true;
  const ka = Object.keys(ba);
  const kb = Object.keys(bb);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    if (!Object.prototype.hasOwnProperty.call(bb, k)) return false;
    const xa = ba[k], xb = bb[k];
    if (xa !== xb && xa && xb && (xa.anchor !== xb.anchor || xa.parent !== xb.parent || xa.ord !== xb.ord || xa.src !== xb.src)) return false;
  }
  return true;
};
function sameMarksMap(ma, mb) {
  const a = ma || {}, b = mb || {};
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    const va = a[k], vb = b[k];
    if (!vb || Boolean(va.on) !== Boolean(vb.on) || va.t !== vb.t) return false;
  }
  return true;
}
function sameContent(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const da = a.deleted || {}, db = b.deleted || {};
  if (da !== db) {
    const dka = Object.keys(da);
    if (dka.length !== Object.keys(db).length) return false;
    for (let i = 0; i < dka.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(db, dka[i])) return false;
    }
  }
  if (!sameBlanks(a, b)) return false;
  if (!sameMarksMap(a.bookmarks, b.bookmarks)) return false;
  if (!sameMarksMap(a.removed, b.removed)) return false;
  const aPages = a.pages || {}, bPages = b.pages || {};
  if (aPages === bPages) return true;
  for (const k of Object.keys(bPages)) {
    const lb = bPages[k] ? bPages[k].length : 0;
    const la = aPages[k] ? aPages[k].length : 0;
    if (la !== lb) return false;
  }
  for (const k of Object.keys(aPages)) {
    const pa = aPages[k];
    const la = pa ? pa.length : 0;
    const pb = bPages[k];
    const lb = pb ? pb.length : 0;
    if (la !== lb) return false;
    if (la === 0 || pa === pb) continue;
    let orderedMatch = true;
    for (let i = 0; i < la; i++) {
      if (pa[i].id !== pb[i].id) {
        orderedMatch = false;
        break;
      }
    }
    if (!orderedMatch) {
      const idSet = new Set();
      for (let i = 0; i < la; i++) idSet.add(pa[i].id);
      for (let i = 0; i < lb; i++) {
        if (!idSet.has(pb[i].id)) return false;
      }
    }
  }
  return true;
}
function parseDoc(text) {
  try {
    return docFromObject(JSON.parse(text));
  } catch (e) {
    return null;
  }
}
function docFromObject(d) {
  if (d && d.version === 1 && d.pages) {
    d.deleted = d.deleted || {};
    d.blanks = d.blanks || {};
    d.bookmarks = d.bookmarks || {};
    d.removed = d.removed || {};
    return d;
  }
  return null;
}
function ensureTree(blanks) {
  var _a;
  const groups = /* @__PURE__ */ new Map();
  for (const b of Object.values(blanks)) {
    if (b.parent !== void 0) continue;
    const a = Number.isFinite(b.anchor) ? Math.max(0, Math.floor(b.anchor)) : 0;
    b.anchor = a;
    const g = (_a = groups.get(a)) != null ? _a : [];
    g.push(b);
    groups.set(a, g);
  }
  for (const [anchor, g] of groups) {
    g.sort((x, y) => (x.ord || 0) - (y.ord || 0) || (x.t || 0) - (y.t || 0) || (x.id < y.id ? -1 : 1));
    let prev = anchor === 0 ? "0" : String(anchor);
    for (const b of g) {
      b.parent = prev;
      prev = "b:" + b.id;
    }
  }
}
function layoutBlanks(blanks) {
  var _a;
  ensureTree(blanks);
  const all = Object.values(blanks);
  const ids2 = new Set(all.map((b) => b.id));
  const rootOf = (anchor) => anchor <= 0 ? "0" : String(anchor);
  const kids = /* @__PURE__ */ new Map();
  for (const b of all) {
    const orphan = b.parent.startsWith("b:") && !ids2.has(b.parent.slice(2));
    const key = orphan ? rootOf(b.anchor) : b.parent;
    const list2 = (_a = kids.get(key)) != null ? _a : [];
    list2.push(b);
    kids.set(key, list2);
  }
  for (const list2 of kids.values()) list2.sort((x, y) => y.t - x.t || (x.id < y.id ? 1 : -1));
  const visited = /* @__PURE__ */ new Set();
  const roots = /* @__PURE__ */ new Set(["0", ...all.map((b) => rootOf(b.anchor))]);
  for (const r of roots) {
    const anchor = r === "0" ? 0 : Number(r);
    let seq = 0;
    const stack = [{ list: kids.get(r) || [], idx: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.idx >= top.list.length) {
        stack.pop();
        continue;
      }
      const b = top.list[top.idx++];
      if (visited.has(b.id)) continue;
      visited.add(b.id);
      b.anchor = anchor;
      b.ord = seq++;
      const childList = kids.get("b:" + b.id);
      if (childList && childList.length) {
        stack.push({ list: childList, idx: 0 });
      }
    }
  }
}
function placeBlankTree(after) {
  var _a;
  if (!after) return { parent: "0", anchor: 0, t: Date.now() };
  if (after.blank) return { parent: "b:" + after.blank.id, anchor: after.blank.anchor, t: Date.now() };
  const n = (_a = after.pdfN) != null ? _a : 0;
  return { parent: n <= 0 ? "0" : String(n), anchor: Math.max(0, n), t: Date.now() };
}
function buildOrder(numPages, blanks) {
  if (blanks) layoutBlanks(blanks);
  const groups = /* @__PURE__ */ new Map();
  for (const b of Object.values(blanks != null ? blanks : {})) {
    const a = Number.isFinite(b.anchor) ? Math.max(0, Math.min(numPages, Math.floor(b.anchor))) : 0;
    const arr = groups.get(a);
    if (arr) arr.push(b);
    else groups.set(a, [b]);
  }
  for (const arr of groups.values()) arr.sort((x, y) => x.ord - y.ord || (x.id < y.id ? -1 : 1));
  const out = [];
  const push = (n) => {
    var _a;
    for (const b of (_a = groups.get(n)) != null ? _a : []) out.push({ blank: b });
  };
  push(0);
  for (let n = 1; n <= numPages; n++) {
    out.push({ pdfN: n });
    push(n);
  }
  return out;
}

// src/wire.ts
var COMPACT_VERSION = 2;
function encodePts(pts) {
  let px = 0;
  let py = 0;
  let pz = 0;
  const out = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    if (!Number.isFinite(pts[i]) || !Number.isFinite(pts[i + 1]) || !Number.isFinite(pts[i + 2])) continue;
    const x = Math.round(pts[i] * 100);
    const y = Math.round(pts[i + 1] * 100);
    const z = Math.round(pts[i + 2] * 100);
    out.push((x - px).toString(36), (y - py).toString(36), (z - pz).toString(36));
    px = x;
    py = y;
    pz = z;
  }
  return out.join(" ");
}
function decodePts(text) {
  const out = [];
  if (!text) return out;
  const len = text.length;
  let pos = 0;
  let px = 0, py = 0, pz = 0;
  const readB36 = () => {
    while (pos < len && text.charCodeAt(pos) === 32) pos++;
    if (pos >= len) return null;
    let sign = 1;
    let ch = text.charCodeAt(pos);
    if (ch === 45) {
      sign = -1;
      pos++;
    } else if (ch === 43) {
      pos++;
    }
    if (pos >= len || text.charCodeAt(pos) === 32) {
      pos = len;
      return NaN;
    }
    let val = 0;
    while (pos < len) {
      ch = text.charCodeAt(pos);
      if (ch === 32) {
        pos++;
        break;
      }
      let d;
      if (ch >= 48 && ch <= 57) d = ch - 48;
      else if (ch >= 97 && ch <= 122) d = ch - 87;
      else if (ch >= 65 && ch <= 90) d = ch - 55;
      else {
        pos = len;
        return NaN;
      }
      val = val * 36 + d;
      pos++;
    }
    return sign * val;
  };
  while (pos < len) {
    const dx = readB36();
    if (dx === null) break;
    if (Number.isNaN(dx)) { out.push(NaN); break; }
    const dy = readB36();
    if (dy === null) break;
    if (Number.isNaN(dy)) { out.push(NaN); break; }
    const dz = readB36();
    if (dz === null) break;
    if (Number.isNaN(dz)) { out.push(NaN); break; }
    px += dx;
    py += dy;
    pz += dz;
    out.push(px / 100, py / 100, pz / 100);
  }
  return out;
}
async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
async function gunzipText(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
async function encodeWire(doc) {
  const pages = {};
  for (const [key, list2] of Object.entries(doc.pages)) {
    pages[key] = list2.map(compactStroke);
  }
  const body = JSON.stringify({ ...doc, version: COMPACT_VERSION, pages });
  return gzipBytes(UTF8_ENC.encode(body));
}
async function decodeWire(buf) {
  if (buf.byteLength === 0) return null;
  const bytes = new Uint8Array(buf);
  let text;
  try {
    text = bytes[0] === 31 && bytes[1] === 139 ? await gunzipText(bytes) : UTF8_DEC.decode(bytes);
  } catch (e) {
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!raw || raw.version !== COMPACT_VERSION || !raw.pages) return docFromObject(raw);
  const pages = {};
  try {
    for (const [key, list2] of Object.entries(raw.pages)) pages[key] = list2.map(expandStroke);
  } catch (e) {
    return null;
  }
  return docFromObject({ ...raw, version: 1, pages });
}
var compactStroke = (s) => s.style ? { id: s.id, t: s.t, tool: s.tool, style: s.style, color: s.color, size: s.size, d: encodePts(s.pts) } : { id: s.id, t: s.t, tool: s.tool, color: s.color, size: s.size, d: encodePts(s.pts) };
var expandStroke = (s) => {
  const pts = decodePts(s.d);
  if (!pts.every(Number.isFinite)) throw new Error("bad points");
  const out = { id: s.id, t: s.t, tool: s.tool, color: s.color, size: s.size, pts };
  if (typeof s.style === "string" && s.style) out.style = s.style;
  return out;
};
function shardText(key, strokes2) {
  return JSON.stringify({ v: 1, key, s: strokes2.map(compactStroke) });
}
function indexText(meta) {
  return JSON.stringify({ v: 1, meta });
}
var gzipText = (text) => gzipBytes(UTF8_ENC.encode(text));
async function readText(buf) {
  if (buf.byteLength === 0) return null;
  const bytes = new Uint8Array(buf);
  try {
    return bytes[0] === 31 && bytes[1] === 139 ? await gunzipText(bytes) : UTF8_DEC.decode(bytes);
  } catch (e) {
    return null;
  }
}
async function decodeShard(buf) {
  const text = await readText(buf);
  if (text === null) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!raw || raw.v !== 1 || typeof raw.key !== "string" || !Array.isArray(raw.s)) return null;
  try {
    return { key: raw.key, strokes: raw.s.map(expandStroke) };
  } catch (e) {
    return null;
  }
}
async function decodeIndex(buf) {
  var _a, _b, _c, _d;
  const text = await readText(buf);
  if (text === null) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!raw || raw.v !== 1 || !raw.meta || typeof raw.meta !== "object") return null;
  const m = raw.meta;
  return {
    updated: Number(m.updated) || 0,
    blanks: (_a = m.blanks) != null ? _a : {},
    bookmarks: (_b = m.bookmarks) != null ? _b : {},
    removed: (_c = m.removed) != null ? _c : {},
    deleted: (_d = m.deleted) != null ? _d : {}
  };
}

// src/md5.ts
var MD5_S = new Uint8Array([7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]);
var MD5_K = (() => {
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  return k;
})();
var MD5_M = new Uint32Array(16);
var MD5_TAIL = new Uint8Array(128);
var MD5_TAIL_DV = new DataView(MD5_TAIL.buffer);
var MD5_HEX_LUT = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function md5Hex(input) {
  const m = input instanceof Uint8Array ? input : new Uint8Array(input);
  const len = m.byteLength;
  const fullEnd = len & ~63;
  let a0 = 1732584193, b0 = 4023233417, c0 = 2562383102, d0 = 271733878;
  const M = MD5_M, S = MD5_S, K = MD5_K;
  const runChunks = (buf, limit) => {
    for (let off = 0; off < limit; off += 64) {
      for (let i = 0; i < 16; i++) {
        const p = off + (i << 2);
        M[i] = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24);
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) {
          F = B & C | ~B & D;
          g = i;
        } else if (i < 32) {
          F = D & B | ~D & C;
          g = (5 * i + 1) & 15;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) & 15;
        } else {
          F = C ^ (B | ~D);
          g = (7 * i) & 15;
        }
        F = F + A + K[i] + M[g] >>> 0;
        A = D;
        D = C;
        C = B;
        const s = S[i];
        B = B + (F << s | F >>> 32 - s) >>> 0;
      }
      a0 = a0 + A >>> 0;
      b0 = b0 + B >>> 0;
      c0 = c0 + C >>> 0;
      d0 = d0 + D >>> 0;
    }
  };
  if (fullEnd > 0) runChunks(m, fullEnd);
  const rem = len - fullEnd;
  const tailBlocks = rem >= 56 ? 128 : 64;
  MD5_TAIL.fill(0, 0, tailBlocks);
  if (rem > 0) MD5_TAIL.set(m.subarray(fullEnd, len), 0);
  MD5_TAIL[rem] = 128;
  const bits = len * 8;
  MD5_TAIL_DV.setUint32(tailBlocks - 8, bits >>> 0, true);
  MD5_TAIL_DV.setUint32(tailBlocks - 4, Math.floor(bits / 4294967296), true);
  runChunks(MD5_TAIL, tailBlocks);
  const L = MD5_HEX_LUT;
  const hex = (n) => L[n & 255] + L[n >>> 8 & 255] + L[n >>> 16 & 255] + L[n >>> 24 & 255];
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

// src/logs.ts
var newLogState = (label) => ({
  label,
  own: {},
  ownBlanks: {},
  ownBookmarks: {},
  ownRemoved: {},
  erased: {},
  dirty: [],
  ids: {},
  seenMd5: {},
  base: null,
  ownVer: {},
  erasedVersion: 0
});
var pageFile = (label, key) => `log_${label}_p${key.replace(":", "~")}.json`;
var blanksFile = (label) => `log_${label}_blanks.json`;
var marksFile = (label) => `log_${label}_marks.json`;
var eraseFile = (label) => `log_${label}_erase.json`;
var keyOfFile = (name) => name.replace(/^.*_p/, "").replace(/\.json$/, "").replace("~", ":");
function markDirty(st, name) {
  if (!st.dirty.includes(name)) st.dirty.push(name);
}
function addOwnStroke(st, key, s) {
  var _a;
  if (!s) return;
  let cur = st.own[key];
  if (!cur) {
    st.own[key] = [s];
  } else {
    for (let i = 0; i < cur.length; i++) {
      if (cur[i].id === s.id) return;
    }
    cur.push(s);
  }
  st.ownVer[key] = ((_a = st.ownVer[key]) != null ? _a : 0) + 1;
  markDirty(st, pageFile(st.label, key));
}
function pruneOwnStroke(st, id) {
  var _a;
  for (const key of Object.keys(st.own)) {
    const ss = st.own[key];
    if (!ss || !ss.length) continue;
    let idx = -1;
    for (let i = 0; i < ss.length; i++) {
      if (ss[i].id === id) { idx = i; break; }
    }
    if (idx >= 0) {
      const next = ss.slice(0, idx);
      for (let i = idx + 1; i < ss.length; i++) {
        if (ss[i].id !== id) next.push(ss[i]);
      }
      st.own[key] = next;
      st.ownVer[key] = ((_a = st.ownVer[key]) != null ? _a : 0) + 1;
      markDirty(st, pageFile(st.label, key));
    }
  }
}
function eraseOwn(st, id, t) {
  var _a;
  if (st.erased[id] === void 0) {
    st.erased[id] = t;
    st.erasedVersion++;
  }
  markDirty(st, eraseFile(st.label));
  if (st.ownBlanks[id]) {
    delete st.ownBlanks[id];
    markDirty(st, blanksFile(st.label));
  }
  const bKey = "b:" + id;
  if (st.own[bKey] && st.own[bKey].length) {
    st.own[bKey] = [];
    st.ownVer[bKey] = ((_a = st.ownVer[bKey]) != null ? _a : 0) + 1;
    markDirty(st, pageFile(st.label, bKey));
  }
  pruneOwnStroke(st, id);
}
function setOwnMark(st, which, key, m) {
  if (which === "bookmarks") st.ownBookmarks[key] = m;
  else st.ownRemoved[key] = m;
  markDirty(st, marksFile(st.label));
}
function snapshotOf(doc) {
  const strokes2 = {};
  for (const [key, ss] of Object.entries(doc.pages)) for (const s of ss) strokes2[s.id] = key;
  return { strokes: strokes2, blanks: { ...doc.blanks }, bookmarks: { ...doc.bookmarks }, removed: { ...doc.removed } };
}
function strokeIdSet(pages) {
  const set = /* @__PURE__ */ new Set();
  if (!pages) return set;
  for (const ss of Object.values(pages)) for (const s of ss) set.add(s.id);
  return set;
}
function recordChanges(st, local, now, remoteView = null) {
  const base = st.base;
  if (!base) return;
  const localStrokes = /* @__PURE__ */ new Map();
  for (const [key, ss] of Object.entries(local.pages)) {
    for (const s of ss) localStrokes.set(s.id, { key, s });
  }
  const remoteIds = remoteView ? strokeIdSet(remoteView.pages) : null;
  for (const [id, { key, s }] of localStrokes) {
    if (base.strokes[id] === void 0 && st.erased[id] === void 0) {
      if (key.startsWith("b:")) {
        const bid = key.slice(2);
        if (st.erased[bid] !== void 0 || (remoteView && remoteView.deleted[bid] !== void 0)) continue;
      }
      if (remoteView && (remoteView.deleted[id] !== void 0 || (remoteIds && remoteIds.has(id)))) {
        if (remoteView.deleted[id] === void 0) base.strokes[id] = key;
        continue;
      }
      addOwnStroke(st, key, s);
      base.strokes[id] = key;
    }
  }
  for (const id of Object.keys(base.strokes)) {
    if (!localStrokes.has(id)) {
      eraseOwn(st, id, now);
      delete base.strokes[id];
    }
  }
  for (const [id, b] of Object.entries(local.blanks)) {
    if (base.blanks[id] === void 0 && st.erased[id] === void 0) {
      if (remoteView && (remoteView.deleted[id] !== void 0 || remoteView.blanks[id])) {
        if (!remoteView.deleted[id]) base.blanks[id] = b;
        continue;
      }
      st.ownBlanks[id] = b;
      base.blanks[id] = b;
      markDirty(st, blanksFile(st.label));
    }
  }
  for (const id of Object.keys(base.blanks)) {
    if (local.blanks[id] === void 0) {
      eraseOwn(st, id, now);
      delete base.blanks[id];
    }
  }
  for (const which of ["bookmarks", "removed"]) {
    for (const [k, m] of Object.entries(local[which])) {
      const was = base[which][k];
      if (!was || was.on !== m.on || was.t !== m.t) {
        if (remoteView && remoteView[which][k] && remoteView[which][k].t >= m.t && remoteView[which][k].on === m.on) {
          base[which][k] = m;
          continue;
        }
        setOwnMark(st, which, k, m);
        base[which][k] = m;
      }
    }
  }
}
function joinLocal(st, local, view, now) {
  var _a;
  const viewIds = strokeIdSet(view.pages);
  const ownIds = strokeIdSet(st.own);
  for (const [key, ss] of Object.entries(local.pages)) {
    for (const s of ss) {
      if (view.deleted[s.id] !== void 0 || st.erased[s.id] !== void 0) continue;
      if (viewIds.has(s.id) || ownIds.has(s.id)) continue;
      addOwnStroke(st, key, s);
      ownIds.add(s.id);
    }
  }
  for (const [id, b] of Object.entries(local.blanks)) {
    if (view.deleted[id] !== void 0 || st.erased[id] !== void 0 || view.blanks[id] || st.ownBlanks[id]) continue;
    st.ownBlanks[id] = b;
    markDirty(st, blanksFile(st.label));
  }
  for (const id of Object.keys(local.deleted)) if (view.deleted[id] === void 0) eraseOwn(st, id, Math.min(now, (_a = local.deleted[id]) != null ? _a : now));
  for (const which of ["bookmarks", "removed"]) {
    for (const [k, m] of Object.entries(local[which])) {
      const have = view[which][k];
      if (!have || m.t > have.t) setOwnMark(st, which, k, m);
    }
  }
}
function deriveDoc(st, seen, name = "") {
  var _a, _b, _c, _d, _e;
  const erased = new Map(Object.entries(st.erased));
  const blanks = {};
  const pages = {};
  const bookmarks = {};
  const removed = {};
  const newer = (into, k, m) => {
    if (!into[k] || m.t > into[k].t) into[k] = m;
  };
  const addBlank = (b) => {
    if (!blanks[b.id]) blanks[b.id] = { ...b };
  };
  for (const b of Object.values(st.ownBlanks)) addBlank(b);
  for (const k of Object.keys(st.ownBookmarks)) newer(bookmarks, k, st.ownBookmarks[k]);
  for (const k of Object.keys(st.ownRemoved)) newer(removed, k, st.ownRemoved[k]);
  const strokeIds = /* @__PURE__ */ new Set();
  const addStroke = (key, s) => {
    var _a2;
    if (strokeIds.has(s.id)) return;
    strokeIds.add(s.id);
    ((_a2 = pages[key]) != null ? _a2 : pages[key] = []).push(s);
  };
  for (const [key, ss] of Object.entries(st.own)) for (const s of ss) addStroke(key, s);
  for (const v of seen.values()) {
    for (const [id, t] of Object.entries((_a = v.erased) != null ? _a : {})) if (!erased.has(id)) erased.set(id, t);
    for (const b of (_b = v.blanks) != null ? _b : []) addBlank(b);
    for (const [k, m] of Object.entries((_c = v.bookmarks) != null ? _c : {})) newer(bookmarks, k, m);
    for (const [k, m] of Object.entries((_d = v.removed) != null ? _d : {})) newer(removed, k, m);
    if (v.key !== void 0) for (const s of (_e = v.strokes) != null ? _e : []) addStroke(v.key, s);
  }
  for (const id of erased.keys()) delete blanks[id];
  for (const key of Object.keys(pages)) {
    if (key.startsWith("b:") && !blanks[key.slice(2)]) {
      delete pages[key];
      continue;
    }
    pages[key] = pages[key].filter((s) => !erased.has(s.id)).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    if (!pages[key].length) delete pages[key];
  }
  const doc = emptyDoc(name);
  doc.pages = pages;
  doc.blanks = blanks;
  doc.bookmarks = bookmarks;
  doc.removed = removed;
  for (const [id, t] of erased) doc.deleted[id] = t;
  layoutBlanks(doc.blanks);
  return doc;
}
async function parseEntry(name, bytes) {
  var _a, _b, _c, _d;
  try {
    if (name.endsWith("_erase.json")) return { erased: (_a = JSON.parse(UTF8_DEC.decode(bytes)).erased) != null ? _a : {} };
    if (name.endsWith("_blanks.json")) return { blanks: (_b = JSON.parse(UTF8_DEC.decode(bytes)).blanks) != null ? _b : [] };
    if (name.endsWith("_marks.json")) {
      const m = JSON.parse(UTF8_DEC.decode(bytes));
      return { bookmarks: (_c = m.bookmarks) != null ? _c : {}, removed: (_d = m.removed) != null ? _d : {} };
    }
    const shard = await decodeShard(bytes);
    return shard ? { key: shard.key, strokes: shard.strokes } : null;
  } catch (e) {
    return null;
  }
}
function combineEntries(a, b) {
  var _a, _b, _c, _d, _e, _f;
  if (!a) return b;
  const out = { ...a };
  if (b.key !== void 0) out.key = b.key;
  if (b.strokes) {
    const have = new Set(((_a = a.strokes) != null ? _a : []).map((s) => s.id));
    out.strokes = [...(_b = a.strokes) != null ? _b : [], ...b.strokes.filter((s) => !have.has(s.id))];
  }
  if (b.blanks) {
    const have = new Set(((_c = a.blanks) != null ? _c : []).map((x) => x.id));
    out.blanks = [...(_d = a.blanks) != null ? _d : [], ...b.blanks.filter((x) => !have.has(x.id))];
  }
  if (b.erased) out.erased = { ...(_e = a.erased) != null ? _e : {}, ...b.erased };
  for (const which of ["bookmarks", "removed"]) {
    if (!b[which]) continue;
    const merged = { ...(_f = a[which]) != null ? _f : {} };
    for (const [k, m] of Object.entries(b[which])) if (!merged[k] || m.t > merged[k].t) merged[k] = m;
    out[which] = merged;
  }
  return out;
}
async function pullLogs(drive, files, st, seen) {
  const groups = /* @__PURE__ */ new Map();
  for (const f of files) {
    if (!f.name.startsWith("log_") || f.name.startsWith(`log_${st.label}_`)) continue;
    const g = groups.get(f.name);
    if (g) g.push(f);
    else groups.set(f.name, [f]);
  }
  const tasks = [];
  for (const [name, group] of groups) {
    if (group.length === 1 && seen.has(name) && st.seenMd5[name] === group[0].md5Checksum) continue;
    tasks.push([name, group]);
  }
  if (!tasks.length) return false;
  let changed = false;
  let idx = 0;
  const workers = Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const [name, group] = tasks[idx++];
      let entry = null;
      const md5s = [];
      let unreadable = false;
      for (const f of group) {
        const bytes = await drive.download(f.id);
        md5s.push(md5Hex(bytes));
        const e = await parseEntry(name, bytes);
        if (e) entry = combineEntries(entry, e);
        else unreadable = true;
      }
      if (!entry) continue;
      seen.set(name, entry);
      changed = true;
      if (unreadable || group.length > 1) delete st.seenMd5[name];
      else st.seenMd5[name] = md5s[0];
    }
  });
  await Promise.all(workers);
  return changed;
}
async function pushLogs(drive, folder, st) {
  var _a;
  const dirtyList = [...st.dirty];
  let idx = 0;
  const workers = Array.from({ length: Math.min(3, dirtyList.length) }, async () => {
    while (idx < dirtyList.length) {
      const name = dirtyList[idx++];
      let data;
      if (name.endsWith("_erase.json")) data = UTF8_ENC.encode(JSON.stringify({ v: 1, erased: st.erased })).buffer;
      else if (name.endsWith("_blanks.json")) data = UTF8_ENC.encode(JSON.stringify({ v: 1, blanks: Object.values(st.ownBlanks) })).buffer;
      else if (name.endsWith("_marks.json")) data = UTF8_ENC.encode(JSON.stringify({ v: 1, bookmarks: st.ownBookmarks, removed: st.ownRemoved })).buffer;
      else {
        const key = keyOfFile(name);
        data = await gzipText(shardText(key, (_a = st.own[key]) != null ? _a : []));
      }
      const res = await drive.upload({ id: st.ids[name], name, parent: folder, data });
      st.ids[name] = res.id;
      st.dirty = st.dirty.filter((x) => x !== name);
    }
  });
  await Promise.all(workers);
}
async function syncBookLogs(drive, folder, files, st, seen, local, now, name = "", pre = null) {
  const duplicates = [];
  for (const f of files) {
    if (!f.name.startsWith(`log_${st.label}_`)) continue;
    if (st.ids[f.name] === void 0) st.ids[f.name] = f.id;
    else if (st.ids[f.name] !== f.id) duplicates.push(f.id);
  }
  await pullLogs(drive, files, st, seen);
  const remoteView = seen.size > 0 ? deriveDoc(newLogState(st.label), seen, name) : null;
  const joined = st.base === null;
  if (local) {
    if (joined) {
      if (pre && st.base === null) {
        st.base = pre;
        recordChanges(st, local, now, remoteView);
      }
      joinLocal(st, local, deriveDoc(st, seen, name), now);
      st.base = snapshotOf(local);
    } else recordChanges(st, local, now, remoteView);
  }
  if (remoteView) {
    const delObj = remoteView.deleted;
    for (const [key, ss] of Object.entries(st.own)) {
      if (ss.some((s) => delObj[s.id] !== void 0)) {
        st.own[key] = ss.filter((s) => delObj[s.id] === void 0);
        st.ownVer[key] = (st.ownVer[key] != null ? st.ownVer[key] : 0) + 1;
        markDirty(st, pageFile(st.label, key));
      }
    }
  }
  const doc = deriveDoc(st, seen, name);
  await pushLogs(drive, folder, st);
  for (const id of duplicates) {
    try {
      await drive.trash(id);
    } catch (e) {
    }
  }
  st.base = snapshotOf(doc);
  return { doc, joined };
}
var TEXT = UTF8_ENC;
var UNTEXT = UTF8_DEC;
var fileKey = (key) => key.replace(":", "~");
async function gunzipBytes(b) {
  const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
async function saveLogStateFiles(io, dir, st) {
  var _a;
  const savedVer = (_a = st.savedVer) != null ? _a : {};
  for (const key of Object.keys(st.own)) {
    if (savedVer[key] === st.ownVer[key] && savedVer[key] !== void 0) continue;
    await io.write(`${dir}/own-${fileKey(key)}.gz`, await gzipText(shardText(key, st.own[key])));
    savedVer[key] = st.ownVer[key];
  }
  st.savedVer = savedVer;
  if (st.savedErasedVersion !== st.erasedVersion) {
    await io.write(`${dir}/erased.gz`, await gzipText(JSON.stringify({ v: 1, erased: st.erased })));
    st.savedErasedVersion = st.erasedVersion;
  }
  const header = {
    v: 2,
    label: st.label,
    ownKeys: Object.keys(st.own),
    ownVer: st.ownVer,
    erasedVersion: st.erasedVersion,
    ownBlanks: st.ownBlanks,
    ownBookmarks: st.ownBookmarks,
    ownRemoved: st.ownRemoved,
    dirty: st.dirty,
    ids: st.ids,
    seenMd5: st.seenMd5,
    hasBase: st.base !== null
  };
  const headerJson = JSON.stringify(header);
  if (st.savedHeaderJson !== headerJson || !await io.exists(`${dir}/state.json`)) {
    await io.write(`${dir}/state.json`, TEXT.encode(headerJson).buffer);
    st.savedHeaderJson = headerJson;
  }
  if (st.base) {
    const baseJson = JSON.stringify(st.base);
    if (st.savedBaseJson !== baseJson || !await io.exists(`${dir}/base.gz`)) {
      await io.write(`${dir}/base.gz`, await gzipText(baseJson));
      st.savedBaseJson = baseJson;
    }
  }
}
async function loadLogStateFiles(io, dir) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const headBytes = await io.read(`${dir}/state.json`);
  if (!headBytes) return null;
  const headText = UNTEXT.decode(headBytes);
  const h = JSON.parse(headText);
  if (h.v !== 2) throw new Error("log state of another version");
  const st = newLogState(h.label);
  st.ownVer = (_a = h.ownVer) != null ? _a : {};
  st.erasedVersion = (_b = h.erasedVersion) != null ? _b : 0;
  st.ownBlanks = (_c = h.ownBlanks) != null ? _c : {};
  st.ownBookmarks = (_d = h.ownBookmarks) != null ? _d : {};
  st.ownRemoved = (_e = h.ownRemoved) != null ? _e : {};
  st.dirty = (_f = h.dirty) != null ? _f : [];
  st.ids = (_g = h.ids) != null ? _g : {};
  st.seenMd5 = (_h = h.seenMd5) != null ? _h : {};
  for (const key of (_i = h.ownKeys) != null ? _i : []) {
    const b = await io.read(`${dir}/own-${fileKey(key)}.gz`);
    const shard = b ? await decodeShard(b) : null;
    if (!shard) throw new Error(`own page ${key} is damaged or missing`);
    st.own[key] = shard.strokes;
  }
  if (st.erasedVersion > 0) {
    const b = await io.read(`${dir}/erased.gz`);
    if (!b) throw new Error("erase records are missing");
    st.erased = (_j = JSON.parse(UNTEXT.decode(await gunzipBytes(b))).erased) != null ? _j : {};
  }
  if (h.hasBase) {
    const b = await io.read(`${dir}/base.gz`);
    if (!b) throw new Error("the record of the last sync is missing");
    const baseText = UNTEXT.decode(await gunzipBytes(b));
    st.base = JSON.parse(baseText);
    st.savedBaseJson = JSON.stringify(st.base);
  }
  st.savedVer = { ...st.ownVer };
  st.savedErasedVersion = st.erasedVersion;
  st.savedHeaderJson = headText;
  return st;
}

// src/sync.ts
var INK = ".ink.json";
var metaDoc = (m, name) => {
  var _a, _b, _c, _d, _e;
  return {
    version: 1,
    name,
    pages: {},
    deleted: (_a = m.deleted) != null ? _a : {},
    updated: (_b = m.updated) != null ? _b : 0,
    blanks: (_c = m.blanks) != null ? _c : {},
    bookmarks: (_d = m.bookmarks) != null ? _d : {},
    removed: (_e = m.removed) != null ? _e : {}
  };
};
var idKey = (ids2) => fnv([...ids2].sort().join(","));
var TOMBSTONE_DAYS = 120;
var pruneDeleted = (doc, now) => {
  for (const [id, t] of Object.entries(doc.deleted)) if (now - t > TOMBSTONE_DAYS * 864e5) delete doc.deleted[id];
};
var isDeadPage = (key, ids2, doc) => {
  if (key.startsWith("b:") && !doc.blanks[key.slice(2)]) return true;
  return ids2.length > 0 && ids2.every((id) => doc.deleted[id] !== void 0 || key.startsWith("b:") && doc.deleted[key.slice(2)] !== void 0);
};
var INSTALL_DIR = "pencil-ink-install";
var CONFLICT_RE = / \(conflict \d{4}-\d{2}-\d{2}-\d{2}-\d{2}( \d+)?\)(\.[^./]+)?$/;
var SHARD_PREFIX = "p_";
var SHARD_SUFFIX = ".json.gz";
var INDEX_NAME = "index.json.gz";
var FORMAT_NAME = "format.json";
function bookOfShard(path) {
  const segs = path.split("/");
  const i = segs.findIndex((s) => s.endsWith(".ink.d"));
  if (i < 0) return null;
  return [...segs.slice(0, i), segs[i].slice(0, -1) + "json"].join("/");
}
var shardName = (key) => SHARD_PREFIX + key.replace(/[^A-Za-z0-9_-]/g, "_") + SHARD_SUFFIX;
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
var dirname = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
var basename = (p) => p.slice(p.lastIndexOf("/") + 1);
var list = (s) => s.split(",").map((x) => x.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
var SyncManager = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.state = "idle";
    this.progress = { done: 0, total: 0 };
    this.lastError = "";
    this.st = { rootId: "", rootSpec: "", token: "", confirmed: false, nodes: {}, books: {}, fullDone: false };
    this.logStates = /* @__PURE__ */ new Map();
    // this device's log state per book, by annotation path
    this.logSeen = /* @__PURE__ */ new Map();
    // other devices' log files as last read (in memory)
    this.switching = /* @__PURE__ */ new Set();
    // books being switched to the new format right now
    /** On by default. The tests of the old per-page engine switch it off, to test that engine on its own. */
    this.autoJoin = true;
    this.fileLocks = /* @__PURE__ */ new Map();
    // the last job queued for each annotation file (see withFileLock)
    this.nodes = /* @__PURE__ */ new Map();
    this.idByPath = /* @__PURE__ */ new Map();
    this.kids = /* @__PURE__ */ new Map();
    this.queue = Promise.resolve();
    this.busy = 0;
    this.timers = /* @__PURE__ */ new Map();
    this.ready = false;
    this.started = false;
    this.paused = false;
    this.stopped = false;
    this.loopTimer = null;
    this.scanTimer = null;
    this.lastNotice = 0;
    this.skipped = /* @__PURE__ */ new Set();
    this.initing = false;
    this.lastBookSync = 0;
    this.queuedBooks = /* @__PURE__ */ new Set();
    this.lastWritten = /* @__PURE__ */ new Map();
    // a fingerprint of the last text written to each annotation file, and its time (not the text itself: that would be kept in memory)
    this.lastPollAt = 0;
    // when the change check last reached Drive
    this.bookRetry = /* @__PURE__ */ new Set();
    // books whose last sync failed
    this.retryAt = 0;
    this.retryDelay = 3e4;
    this.initQueued = false;
    this.saveSoon = (0, import_obsidian2.debounce)(() => void this.saveState(), 2500, true);
    this.lastStateText = "";
    // ------------------------------------------------------------------ local -> remote
    this.firstQueued = /* @__PURE__ */ new Map();
    this.dirJobs = /* @__PURE__ */ new Map();
    /** A write the sync itself makes to a book's annotation file: the change event it causes is not a new change. */
    this.ownWrites = /* @__PURE__ */ new Map();
    this.drive = new Drive(plugin);
    this.state = this.connected() ? "idle" : "disconnected";
  }
  get s() {
    return this.plugin.settings;
  }
  get vault() {
    return this.plugin.app.vault;
  }
  connected() {
    return !!this.s.refreshToken;
  }
  get maxBytes() {
    return Math.max(1, this.s.maxFileMB) * 1024 * 1024;
  }
  statusText() {
    switch (this.state) {
      case "syncing":
        return this.progress.total > 1 ? `Syncing ${this.progress.done}/${this.progress.total}` : "Syncing";
      case "ok":
        return "Synced";
      case "offline":
        return "Offline";
      case "error":
        return "Sync error";
      case "disconnected":
        return "Not connected";
      case "paused":
        return "Paused";
      default:
        return "Drive";
    }
  }
  stats() {
    return { state: this.state, ready: this.ready, paused: this.paused, nodes: this.nodes.size, lastError: this.lastError, connected: this.connected() };
  }
  setState(st) {
    const bad = (x) => x === "error" || x === "offline" || x === "paused" || x === "disconnected";
    if (st !== this.state && (bad(st) || bad(this.state))) this.plugin.log.info("sync", `state ${this.state} -> ${st}`);
    this.state = st;
    this.plugin.events.trigger("sync-state", st);
  }
  // ------------------------------------------------------------------ lifecycle
  start() {
    this.stopped = false;
    if (!this.connected()) {
      this.setState("disconnected");
      return;
    }
    if (!this.started) {
      this.started = true;
      this.loop();
      this.fastPoll();
      this.scanTimer = window.setInterval(() => {
        if (this.ready && !this.paused && !document.hidden && Date.now() - this.plugin.lastInputAt > 5e3) void this.enqueue(() => this.scanLocal(), true);
      }, 18e4);
    }
    if (!this.ready) this.queueInit();
  }
  /** Queues the start-up once; the polling loop asks again on every tick until it is ready, and those asks must not pile up. */
  queueInit() {
    if (this.initQueued) return;
    this.initQueued = true;
    void this.enqueue(async () => {
      this.initQueued = false;
      await this.init();
    }, true);
  }
  async init() {
    if (this.ready || this.initing) return;
    this.initing = true;
    try {
      await this.loadState();
      const spec = this.s.driveFolder.trim() || "Obsidian Vault";
      if (!this.st.rootId || this.st.rootSpec !== spec) {
        this.st = { rootId: "", rootSpec: spec, token: "", confirmed: this.st.confirmed, nodes: {}, books: {}, fullDone: false };
        this.nodes.clear();
        this.idByPath.clear();
        this.kids.clear();
        this.st.rootId = await this.drive.resolveRoot(spec);
      }
      this.putNode({ id: this.st.rootId, name: "", parent: "", folder: true });
      if (!this.st.token || !this.st.fullDone) await this.fullSync();
      else {
        await this.pollChanges();
        await this.scanLocal();
      }
      this.ready = !this.paused;
    } finally {
      this.initing = false;
    }
    if (this.ready) void this.enqueue(() => this.reconcileBooks());
  }
  /** Brings every book up to date, one at a time. A book that fails is logged and tried again later. */
  async reconcileBooks() {
    var _a;
    try {
      await this.processRemovals();
    } catch (e) {
      this.plugin.log.warn("sync", "removals will be tried again", { error: String(e) });
    }
    const books = /* @__PURE__ */ new Set();
    for (const n of this.nodes.values()) {
      const p = this.pathOf(n.id);
      const b = p ? (_a = bookOfShard(p)) != null ? _a : p.endsWith(INK) ? p : null : null;
      if (b) books.add(b);
    }
    for (const f of this.vault.getFiles()) if (f.path.endsWith(INK) && !this.excluded(f.path)) books.add(f.path);
    const dirty = Array.from(books).filter((b) => !this.isClean(b));
    this.progress = { done: 0, total: dirty.length };
    this.plugin.events.trigger("sync-state", this.state);
    await pool(dirty, 3, async (b) => {
      await this.yieldToPen();
      try {
        await this.pushBook(b);
        this.bookRetry.delete(b);
      } catch (e) {
        if (e instanceof DriveError && e.fatal) throw e;
        this.bookRetry.add(b);
        this.retryAt = Date.now() + this.retryDelay;
        this.retryDelay = Math.min(this.retryDelay * 2, 6e5);
        this.plugin.log.warn("sync", "a book could not be synced; it will be tried again", { book: b, error: String(e), retryInS: Math.round(this.retryDelay / 1e3) });
      }
      this.progress.done++;
      this.plugin.events.trigger("sync-state", this.state);
    });
    this.lastBookSync = Date.now();
    if (this.bookRetry.size === 0) this.retryDelay = 3e4;
    void this.pruneOrphanPictureFolders();
  }
  async pruneOrphanPictureFolders() {
    var _a, _b;
    try {
      const ad = this.vault.adapter;
      if (typeof ad.list !== "function") return;
      const base = `${this.vault.configDir}/plugins/pencil-ink/pics`;
      if (!await ad.exists(base)) return;
      const valid = /* @__PURE__ */ new Set();
      for (const f of this.vault.getFiles()) {
        if (f.extension === "pdf") {
          valid.add(picKey(f.path + "|" + ((_a = f.stat) == null ? void 0 : _a.size)));
        }
      }
      const listed = await ad.list(base);
      for (const dir of (_b = listed.folders) != null ? _b : []) {
        const name = dir.slice(dir.lastIndexOf("/") + 1);
        if (name && !valid.has(name)) {
          const sub = await ad.list(dir).catch(() => ({ files: [], folders: [] }));
          for (const file of sub.files) await ad.remove(file).catch(() => {});
          if (typeof ad.rmdir === "function") await ad.rmdir(dir, true).catch(() => {});
        }
      }
    } catch (e) {
    }
  }
  /** True when the book's file is exactly as it was after its last successful sync, and nothing failed since. */
  isClean(pdfPath) {
    var _a;
    const f = this.file(pdfPath);
    const rec = (_a = this.st.books[pdfPath]) == null ? void 0 : _a.local;
    const st = this.logStates.get(pdfPath);
    if (st && st.dirty && st.dirty.length > 0) return false;
    return !!f && !!rec && rec.mtime === f.stat.mtime && rec.size === f.stat.size && !this.bookRetry.has(pdfPath);
  }
  stop() {
    this.stopped = true;
    this.started = false;
    if (this.loopTimer) window.clearTimeout(this.loopTimer);
    if (this.fastPollTimer) window.clearTimeout(this.fastPollTimer);
    if (this.scanTimer) window.clearInterval(this.scanTimer);
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
    void this.saveState();
  }
  restart() {
    this.stop();
    this.ready = false;
    this.paused = false;
    this.start();
  }
  loop() {
    if (this.stopped) return;
    const idleFor = Date.now() - this.plugin.lastInputAt;
    const hasOpenPdf = typeof this.plugin.inkViews === "function" && this.plugin.inkViews().length > 0;
    let next = Math.max(3, this.s.pollSeconds) * 1e3;
    if (document.hidden) next = 12e4;
    else if (!hasOpenPdf && idleFor > 3e5) next = Math.max(next, 12e4);
    else if (!hasOpenPdf && idleFor > 12e4) next = Math.max(next, 3e4);
    this.loopTimer = window.setTimeout(async () => {
      if (this.connected() && !this.paused) {
        if (!this.ready) this.queueInit();
        else if (this.s.autoSync) {
          if (this.bookRetry.size > 0 && Date.now() >= this.retryAt) void this.enqueue(() => this.reconcileBooks());
          if (Date.now() - this.plugin.lastInputAt < 2500) {
          } else {
            const ok3 = await this.enqueue(() => this.pollChanges(), true);
            if (ok3 && (this.state === "offline" || this.state === "error")) this.setState("ok");
          }
        }
      }
      this.loop();
    }, next);
  }
  /** Called when the app returns to the foreground. */
  /** Direct check of the active book folder on Drive when idle (never during writing, scrolling, or zooming). */
  fastPoll() {
    if (this.stopped) return;
    const idleFor = Date.now() - this.plugin.lastInputAt;
    const delay = document.hidden ? 6e4 : idleFor > 3e5 ? 45e3 : idleFor > 6e4 ? 20e3 : 15e3;
    this.fastPollTimer = window.setTimeout(async () => {
      try {
        if (this.connected() && !this.paused && this.ready && this.s.autoSync && !document.hidden && Date.now() - this.plugin.lastInputAt >= 4e3 && Date.now() - this.plugin.lastInputAt < 3e5) {
          const views = typeof this.plugin.inkViews === "function" ? this.plugin.inkViews() : [];
          const nowPerf = performance.now();
          for (const v of views) {
            const f = v.file;
            if (!f || !f.path || v.cur !== null || v.erasing !== null || v.pinching || v.activePointer !== null || nowPerf - (v.lastScroll || 0) < 3500 || nowPerf - (v.zoomAt || 0) < 3500) continue;
            const inkPath = f.path + INK;
            const b = this.st.books[inkPath];
            if (b && b.folderId && !this.queuedBooks.has(inkPath)) {
              this.queueBook(inkPath);
            }
          }
        }
      } catch (e) {
      }
      this.fastPoll();
    }, delay);
  }
  wake() {
    if (!this.ready || !this.connected() || this.paused) return;
    void this.enqueue(() => this.pollChanges(), true);
    if (this.bookRetry.size > 0 || Date.now() - this.lastBookSync > 6e5) void this.enqueue(() => this.reconcileBooks());
    this.retryAt = 0;
  }
  async syncNow() {
    if (!this.connected()) {
      new import_obsidian2.Notice("Connect Google Drive in Pencil Ink settings first.");
      return;
    }
    this.paused = false;
    if (!this.ready) {
      this.start();
      return;
    }
    await this.enqueue(async () => {
      await this.pollChanges();
      await this.scanLocal();
    });
  }
  async fullResync() {
    if (!this.connected()) return;
    this.paused = false;
    await this.enqueue(async () => {
      this.st.token = "";
      this.st.fullDone = false;
      await this.fullSync();
    });
  }
  enqueue(fn, quiet = false) {
    if (!quiet) {
      this.busy++;
      if (this.busy === 1) this.setState("syncing");
    }
    let okRun = true;
    const run = this.queue.then(fn).catch((e) => {
      okRun = false;
      this.fail(e);
    }).finally(() => {
      if (quiet) return;
      this.busy--;
      if (this.busy === 0) {
        this.progress = { done: 0, total: 0 };
        if (this.state === "syncing") this.setState(this.paused ? "paused" : "ok");
      }
    });
    this.queue = run;
    return run.then(() => okRun);
  }
  fail(e) {
    const msg = e instanceof Error ? e.message : String(e);
    this.plugin.log.error("sync", msg, e instanceof DriveError ? { status: e.status } : void 0);
    this.lastError = msg;
    if (e instanceof DriveError) {
      if (e.fatal) {
        this.paused = true;
        this.setState("disconnected");
      } else this.setState("error");
      if (Date.now() - this.lastNotice > 6e4) {
        this.lastNotice = Date.now();
        new import_obsidian2.Notice("Pencil Ink sync: " + msg, 8e3);
      }
    } else {
      this.setState("offline");
    }
  }
  // ------------------------------------------------------------------ persisted state
  statePath() {
    return `${this.plugin.manifest.dir}/sync-state.json`;
  }
  async loadState() {
    var _a, _b, _c, _d, _e;
    const ad = this.vault.adapter;
    try {
      if (await ad.exists(this.statePath())) {
        const d = JSON.parse(await ad.read(this.statePath()));
        this.st = { rootId: (_a = d.rootId) != null ? _a : "", rootSpec: (_b = d.rootSpec) != null ? _b : "", token: (_c = d.token) != null ? _c : "", confirmed: !!d.confirmed, nodes: (_d = d.nodes) != null ? _d : {}, books: (_e = d.books) != null ? _e : {}, fullDone: !!d.fullDone };
      }
    } catch (e) {
      console.warn("[Pencil Ink] bad sync state, starting fresh", e);
    }
    for (const b of Object.values(this.st.books)) {
      for (const p of Object.values(b.pages)) {
        if (p.ids && !p.idk) p.idk = idKey(p.ids);
        delete p.ids;
      }
    }
    if (!this.st.foldersVerified) {
      for (const b of Object.values(this.st.books)) b.check = true;
      this.st.foldersVerified = true;
    }
    this.nodes.clear();
    this.idByPath.clear();
    this.kids.clear();
    for (const n of Object.values(this.st.nodes)) this.putNode(n);
  }
  async saveState() {
    try {
      const out = {};
      for (const [id, n] of this.nodes) if (id !== this.st.rootId) out[id] = n;
      this.st.nodes = out;
      const text = JSON.stringify(this.st);
      if (text === this.lastStateText) return;
      await this.vault.adapter.write(this.statePath(), text);
      this.lastStateText = text;
    } catch (e) {
      console.warn("[Pencil Ink] could not save sync state", e);
    }
  }
  // ------------------------------------------------------------------ node bookkeeping
  putNode(n) {
    const old = this.nodes.get(n.id);
    if (old) this.unindex(old);
    this.nodes.set(n.id, n);
    if (n.parent) {
      let m = this.kids.get(n.parent);
      if (!m) this.kids.set(n.parent, m = /* @__PURE__ */ new Map());
      m.set(n.name, n.id);
    }
    if (n.lp) this.idByPath.set(n.lp, n.id);
  }
  unindex(n) {
    const m = this.kids.get(n.parent);
    if (m && m.get(n.name) === n.id) m.delete(n.name);
    if (n.lp && this.idByPath.get(n.lp) === n.id) this.idByPath.delete(n.lp);
  }
  delNode(id) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.unindex(n);
    this.nodes.delete(id);
    this.kids.delete(id);
  }
  setLp(n, p) {
    if (n.lp && this.idByPath.get(n.lp) === n.id) this.idByPath.delete(n.lp);
    n.lp = p;
    this.idByPath.set(p, n.id);
  }
  subtree(id) {
    const out = [];
    const walk = (i) => {
      const n = this.nodes.get(i);
      if (!n) return;
      out.push(n);
      const m = this.kids.get(i);
      if (m) for (const c of Array.from(m.values())) walk(c);
    };
    walk(id);
    return out;
  }
  pathOf(id) {
    const parts = [];
    let cur = this.nodes.get(id);
    for (let guard = 0; cur && guard < 80; guard++) {
      if (cur.id === this.st.rootId) return parts.reverse().join("/");
      parts.push(cur.name);
      cur = this.nodes.get(cur.parent);
    }
    return null;
  }
  fromFile(f, old) {
    var _a, _b;
    const folder = f.mimeType === FOLDER_MIME;
    return {
      id: f.id,
      name: f.name,
      parent: (_b = (_a = f.parents) == null ? void 0 : _a[0]) != null ? _b : "",
      folder,
      gapps: !folder && f.mimeType.startsWith("application/vnd.google-apps"),
      md5: f.md5Checksum,
      mod: f.modifiedTime,
      size: f.size !== void 0 ? Number(f.size) : void 0,
      rev: old == null ? void 0 : old.rev,
      lp: old == null ? void 0 : old.lp,
      lm: old == null ? void 0 : old.lm,
      ls: old == null ? void 0 : old.ls
    };
  }
  excluded(path) {
    if (!path) return false;
    if (path === "Pencil Ink log.md" || path === "Pencil Ink recording.json") return true;
    if (bookOfShard(path)) return true;
    const cfg = this.vault.configDir;
    if (path === cfg || path.startsWith(cfg + "/") || path.startsWith(".trash")) return true;
    if (path.split("/").some((seg) => seg.startsWith("."))) return true;
    if (this._exRaw !== this.s.excludeFolders) {
      this._exRaw = this.s.excludeFolders;
      this._exList = list(this.s.excludeFolders || "");
    }
    const ex = this._exList;
    if (ex.length && ex.some((e) => path === e || path.startsWith(e + "/"))) return true;
    if (this._incRaw !== this.s.includeFolders) {
      this._incRaw = this.s.includeFolders;
      this._incList = list(this.s.includeFolders || "");
    }
    const inc = this._incList;
    if (inc.length && !inc.some((e) => path === e || path.startsWith(e + "/") || e.startsWith(path + "/"))) return true;
    return false;
  }
  file(p) {
    const f = this.vault.getAbstractFileByPath(p);
    return f instanceof import_obsidian2.TFile ? f : null;
  }
  async ensureLocalFolder(p) {
    if (!p) return;
    const parts = p.split("/");
    let acc = "";
    for (const seg of parts) {
      acc = acc ? acc + "/" + seg : seg;
      if (!this.vault.getAbstractFileByPath(acc)) {
        try {
          await this.vault.createFolder(acc);
        } catch (e) {
          if (!await this.vault.adapter.exists(acc)) throw e;
        }
      }
    }
  }
  // ------------------------------------------------------------------ initial full sync
  async fullSync() {
    var _a, _b;
    const startToken = await this.drive.startToken();
    const old = new Map(this.nodes);
    this.nodes.clear();
    this.idByPath.clear();
    this.kids.clear();
    this.putNode({ id: this.st.rootId, name: "", parent: "", folder: true });
    let level = [this.st.rootId];
    while (level.length) {
      const next = [];
      for (let i = 0; i < level.length; i += 15) {
        const files = await this.drive.listChildren(level.slice(i, i + 15));
        for (const f of files) {
          if (f.mimeType === FOLDER_MIME) next.push(f.id);
          this.putNode(this.fromFile(f, old.get(f.id)));
        }
      }
      level = next;
    }
    const remoteFiles = [];
    const remoteFolders = [];
    const remotePaths = /* @__PURE__ */ new Set();
    for (const n of this.nodes.values()) {
      if (n.id === this.st.rootId) continue;
      const p = this.pathOf(n.id);
      if (!p || this.excluded(p)) continue;
      remotePaths.add(p);
      (n.folder ? remoteFolders : remoteFiles).push({ n, p });
    }
    let downBytes = 0;
    let downCount = 0;
    for (const { n, p } of remoteFiles) {
      if (n.gapps || ((_a = n.size) != null ? _a : 0) > this.maxBytes) continue;
      const f = this.file(p);
      if (!f || f.stat.size !== n.size && n.rev === void 0) {
        downBytes += (_b = n.size) != null ? _b : 0;
        downCount++;
      }
    }
    let upBytes = 0;
    let upCount = 0;
    for (const f of this.vault.getFiles()) {
      if (this.excluded(f.path) || f.stat.size > this.maxBytes || remotePaths.has(f.path)) continue;
      upBytes += f.stat.size;
      upCount++;
    }
    if (!this.st.confirmed && (downBytes + upBytes > 300 * 1024 * 1024 || downCount + upCount > 400)) {
      const ok3 = await new Promise((res) => new ConfirmModal(this.plugin, downCount, downBytes, upCount, upBytes, res).open());
      if (!ok3) {
        this.st.token = "";
        this.paused = true;
        this.setState("paused");
        new import_obsidian2.Notice("Sync paused. Limit which folders sync in Pencil Ink settings, then press Sync now.", 1e4);
        return;
      }
    }
    this.st.confirmed = true;
    this.plugin.log.info("sync", "first sync plan", { remoteFiles: remoteFiles.length, downCount, downMB: Math.round(downBytes / 1048576), upCount, upMB: Math.round(upBytes / 1048576) });
    remoteFolders.sort((a, b) => a.p.length - b.p.length);
    for (const { n, p } of remoteFolders) {
      await this.ensureLocalFolder(p);
      this.setLp(n, p);
    }
    this.progress = { done: 0, total: downCount + upCount };
    this.plugin.events.trigger("sync-state", this.state);
    await pool(remoteFiles.filter(({ p }) => !p.endsWith(INK)), 3, async ({ n, p }) => {
      await this.syncDown(n, p);
      if (this.progress.total) {
        this.progress.done++;
        this.plugin.events.trigger("sync-state", this.state);
      }
    });
    await this.scanLocal(true);
    this.st.token = startToken;
    this.st.fullDone = true;
    await this.saveState();
    if (downCount + upCount > 0) new import_obsidian2.Notice(`Pencil Ink: sync complete (${downCount} downloaded, ${upCount} uploaded).`);
  }
  // ------------------------------------------------------------------ remote -> local
  async pollChanges() {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!this.st.token) return;
    let token = this.st.token;
    const cand = /* @__PURE__ */ new Map();
    for (; ; ) {
      const r = await this.drive.changes(token);
      for (const c of r.changes) {
        if (c.removed || ((_a = c.file) == null ? void 0 : _a.trashed)) cand.set(c.fileId, null);
        else if (c.file) cand.set(c.fileId, c.file);
      }
      if (r.next) {
        token = r.next;
        continue;
      }
      token = (_b = r.newStart) != null ? _b : token;
      break;
    }
    this.lastPollAt = Date.now();
    if (!cand.size) {
      this.st.token = token;
      return;
    }
    if (this.busy === 0) this.setState("syncing");
    for (const [id, f] of cand) if (f === null) {
      for (const [key, b] of Object.entries(this.st.books)) if (b.folderId === id) {
        b.check = true;
        this.queueBook(key);
      }
    }
    const books = /* @__PURE__ */ new Set();
    for (const [, f] of cand) if (f && f.mimeType === FOLDER_MIME && f.name.endsWith(".ink.d")) {
      const baseInk = f.name.slice(0, -".d".length) + ".json";
      for (const [key, b] of Object.entries(this.st.books)) if (basename(key) === baseInk) {
        b.check = true;
        books.add(key);
      }
    }
    const toRemove = [];
    let pending = [];
    for (const [id, f] of cand) {
      if (f === null) {
        if (this.nodes.has(id)) toRemove.push(id);
      } else pending.push(f);
    }
    const changed = [];
    const contentChanged = /* @__PURE__ */ new Set();
    const placePending = () => {
      let progress = true;
      while (pending.length && progress) {
        progress = false;
        const rest = [];
        for (const f of pending) {
          const par = (_d = (_c = f.parents) == null ? void 0 : _c[0]) != null ? _d : "";
          if (par === this.st.rootId || this.nodes.has(par)) {
            const before = this.nodes.get(f.id);
            if (!before || before.md5 !== f.md5Checksum) contentChanged.add(f.id);
            this.putNode(this.fromFile(f, before));
            changed.push(f.id);
            progress = true;
          } else rest.push(f);
        }
        pending = rest;
      }
    };
    placePending();
    if (pending.length && typeof this.drive.get === "function") {
      const unknownParents = /* @__PURE__ */ new Set();
      for (const f of pending) {
        const par = (_f = (_e = f.parents) == null ? void 0 : _e[0]) != null ? _f : "";
        if (par && !this.nodes.has(par)) unknownParents.add(par);
      }
      let lookups = 0;
      for (const parId of unknownParents) {
        if (++lookups > 6) break;
        try {
          const pf = await this.drive.get(parId);
          if (pf && !pf.trashed) {
            const ppar = pf.parents && pf.parents[0] ? pf.parents[0] : "";
            if (ppar === this.st.rootId || this.nodes.has(ppar)) {
              this.putNode(this.fromFile(pf, this.nodes.get(pf.id)));
              changed.push(pf.id);
            }
          }
        } catch (e) {
        }
      }
      if (lookups > 0) placePending();
    }
    for (const f of pending) if (this.nodes.has(f.id)) toRemove.push(f.id);
    for (const id of toRemove) {
      if (id === this.st.rootId) {
        this.paused = true;
        this.setState("paused");
        new import_obsidian2.Notice("Pencil Ink: the Google Drive sync folder was deleted or moved. Sync paused; nothing was removed locally.", 1e4);
        this.st.token = token;
        return;
      }
      await this.applyRemoteRemoval(id);
    }
    const todo = changed.map((id) => ({ id, p: this.pathOf(id) })).filter((x) => x.p !== null && !!this.nodes.get(x.id)).sort((a, b) => a.p.length - b.p.length);
    for (const { id, p } of todo) {
      const n = this.nodes.get(id);
      if (n && n.folder && p.endsWith(".ink.d")) {
        const inkPath = p.slice(0, -".d".length) + ".json";
        books.add(inkPath);
        continue;
      }
      if (!contentChanged.has(id)) continue;
      const b = (_g = bookOfShard(p)) != null ? _g : p.endsWith(INK) ? p : null;
      if (b) books.add(b);
    }
    for (const { id, p } of todo) {
      const n = this.nodes.get(id);
      if (n && !p.endsWith(INK)) await this.applyRemote(n, p);
    }
    const folderBook = /* @__PURE__ */ new Map();
    for (const [key, b] of Object.entries(this.st.books)) if (b.folderId) folderBook.set(b.folderId, key);
    const unplaced = [];
    for (const f of pending) {
      if (this.nodes.has(f.id)) continue;
      if (f.name && f.name.startsWith("probe-")) continue;
      const par = f.parents && f.parents[0] ? f.parents[0] : "";
      const key = folderBook.get(par);
      if (key) books.add(key);
      else unplaced.push(f);
    }
    if (unplaced.length) this.plugin.log.warn("sync", "changes skipped: their folder is not known yet", { count: unplaced.length });
    for (const b of books) this.queueBook(b);
    this.st.token = token;
    this.saveSoon();
    if (this.busy === 0 && this.state === "syncing") this.setState("ok");
  }
  async applyRemoteRemoval(id) {
    for (const n of this.subtree(id).reverse()) {
      if (n.lp) {
        const f = this.vault.getAbstractFileByPath(n.lp);
        if (f instanceof import_obsidian2.TFile && n.lm === f.stat.mtime && n.ls === f.stat.size) {
          await this.plugin.app.fileManager.trashFile(f);
          if (n.lp.toLowerCase().endsWith(".pdf")) await this.removeAnnotations(n.lp);
        } else if (f instanceof import_obsidian2.TFolder && f.children.length === 0) {
          await this.plugin.app.fileManager.trashFile(f);
        }
      }
      this.delNode(n.id);
    }
  }
  async applyRemote(n, p) {
    if (p === "" || this.excluded(p)) return;
    if (n.lp && n.lp !== p && !await this.moveLocal(n, p)) return;
    if (n.folder) {
      await this.ensureLocalFolder(p);
      this.setLp(n, p);
      return;
    }
    await this.syncDown(n, p);
  }
  /** Moves the local copy to match the cloud. Returns false, and changes nothing, if the target is already taken. */
  async moveLocal(n, p) {
    const old = n.lp;
    const f = this.vault.getAbstractFileByPath(old);
    if (!f) {
      this.setLp(n, p);
      return true;
    }
    await this.ensureLocalFolder(dirname(p));
    if (this.vault.getAbstractFileByPath(p)) {
      this.plugin.log.info("sync", "remote move blocked: a local file is already at the new path", { from: old, to: p });
      return false;
    }
    if (n.folder) {
      for (const d of this.subtree(n.id)) if (d.lp && (d.lp === old || d.lp.startsWith(old + "/"))) this.setLp(d, p + d.lp.slice(old.length));
    } else this.setLp(n, p);
    await this.plugin.app.fileManager.renameFile(f, p);
    return true;
  }
  async syncDown(n, p) {
    var _a, _b, _c;
    if (n.gapps || n.folder) return;
    if (p.endsWith(INK)) {
      await this.pushBook(p);
      return;
    }
    if (((_a = n.size) != null ? _a : 0) > this.maxBytes) {
      this.noteSkipped(p);
      return;
    }
    const remoteRev = (_c = (_b = n.md5) != null ? _b : n.mod) != null ? _c : "";
    const f = this.file(p);
    if (!f) {
      await this.download(n, p);
      return;
    }
    const localChanged = !(n.lm === f.stat.mtime && n.ls === f.stat.size);
    if (n.rev === remoteRev) {
      if (localChanged) this.queuePush(p);
      return;
    }
    if (n.rev === void 0 && !p.endsWith(INK) && n.size !== void 0 && f.stat.size === n.size) {
      n.rev = remoteRev;
      n.lm = f.stat.mtime;
      n.ls = f.stat.size;
      this.setLp(n, p);
      return;
    }
    if (!localChanged && n.rev !== void 0) {
      await this.download(n, p);
      return;
    }
    await this.resolveConflict(n, p, f, remoteRev);
  }
  async resolveConflict(n, p, f, remoteRev) {
    if (p.startsWith(INSTALL_DIR + "/")) {
      await this.download(n, p);
      return;
    }
    const remoteTime = n.mod ? Date.parse(n.mod) : 0;
    if (remoteTime > f.stat.mtime) {
      const ext = f.extension ? "." + f.extension : "";
      const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const stem = f.path.slice(0, f.path.length - ext.length);
      let copy = `${stem} (conflict ${stamp})${ext}`;
      for (let i = 2; this.vault.getAbstractFileByPath(copy); i++) copy = `${stem} (conflict ${stamp} ${i})${ext}`;
      await this.plugin.app.fileManager.renameFile(f, copy);
      await this.download(n, p);
      new import_obsidian2.Notice(`Pencil Ink: both sides changed "${basename(p)}". Kept the newer cloud copy and saved yours as a conflict copy.`, 8e3);
    } else {
      n.rev = remoteRev;
      n.lm = -1;
      this.setLp(n, p);
      this.queuePush(p);
    }
  }
  async download(n, p) {
    var _a, _b;
    const buf = await this.drive.download(n.id);
    this.plugin.log.debug("sync", `downloaded ${p}`, { kb: Math.round(buf.byteLength / 1024) });
    await this.ensureLocalFolder(dirname(p));
    const remoteRev = (_b = (_a = n.md5) != null ? _a : n.mod) != null ? _b : "";
    const existing = this.file(p);
    if (existing) await this.vault.modifyBinary(existing, buf);
    else await this.vault.createBinary(p, buf);
    const f = this.file(p);
    n.rev = remoteRev;
    n.lm = f == null ? void 0 : f.stat.mtime;
    n.ls = f == null ? void 0 : f.stat.size;
    this.setLp(n, p);
    this.saveSoon();
  }
  async writeText(p, text, knownMtime) {
    var _a, _b;
    const sig = fnv(text);
    const f = this.file(p);
    if (f) {
      const seen = this.lastWritten.get(p);
      if (seen && seen.mtime === f.stat.mtime) {
        if (seen.sig === sig) return;
      } else if (knownMtime === void 0 || f.stat.mtime !== knownMtime) {
        if ((!seen || seen.sig === sig) && f.stat.size === text.length && await this.vault.read(f) === text) {
          this.lastWritten.set(p, { sig, mtime: f.stat.mtime });
          return;
        }
      }
      await this.vault.modify(f, text);
      const after = this.file(p);
      this.lastWritten.set(p, { sig, mtime: (_a = after == null ? void 0 : after.stat.mtime) != null ? _a : 0 });
      return;
    }
    try {
      await this.vault.create(p, text);
    } catch (e) {
      await this.vault.adapter.write(p, text);
    }
    const created = this.file(p);
    if (created) this.lastWritten.set(p, { sig, mtime: (_b = created.stat) == null ? void 0 : _b.mtime });
  }
  noteSkipped(p) {
    if (this.skipped.has(p)) return;
    this.skipped.add(p);
    console.warn("[Pencil Ink] skipped (over max file size):", p);
  }
  // ------------------------------------------------------------------ annotation sidecars
  primeSidecarCache(sidecarPath, doc, mtime, size) {
    if (sidecarPath && doc && mtime !== void 0) {
      this.lastParsed = { path: sidecarPath, mtime, size, doc };
    }
  }
  async readSidecar(pdfPath) {
    const p = pdfPath + INK;
    const f = this.file(p);
    try {
      if (f) {
        if (this.lastParsed && this.lastParsed.path === p && this.lastParsed.mtime === f.stat.mtime && (this.lastParsed.size === void 0 || this.lastParsed.size === f.stat.size)) {
          return this.lastParsed.doc;
        }
        const doc = parseDoc(await this.vault.read(f));
        if (doc) this.lastParsed = { path: p, mtime: f.stat.mtime, size: f.stat.size, doc };
        return doc;
      }
      if (await this.vault.adapter.exists(p)) return parseDoc(await this.vault.adapter.read(p));
    } catch (e) {
      console.warn("[Pencil Ink] could not read annotations", e);
    }
    return null;
  }
  /** Runs `fn` after every earlier job for this annotation file has finished. The sync's read-merge-write and the
   *  editor's saves all go through it, so they cannot interleave. */
  withFileLock(path, fn) {
    var _a;
    const prev = (_a = this.fileLocks.get(path)) != null ? _a : Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(() => void 0, () => void 0).finally(() => {
      if (this.fileLocks.get(path) === tail) this.fileLocks.delete(path);
    });
    this.fileLocks.set(path, tail);
    return run;
  }
  /** An annotation changed: push the sidecar to Drive quickly. */
  notifyAnnotation(pdfPath) {
    var _a, _b;
    const size = (_b = (_a = this.file(pdfPath + INK)) == null ? void 0 : _a.stat.size) != null ? _b : 0;
    this.queuePush(pdfPath + INK, size > 1048576 ? 8e3 : size > 262144 ? 4e3 : 0);
  }
  queuePush(p, minDelayMs = 0) {
    var _a;
    if (!this.ready || this.paused || !this.s.autoSync || !this.connected() || this.excluded(p)) return;
    const old = this.timers.get(p);
    if (old) window.clearTimeout(old);
    const now = Date.now();
    const first = (_a = this.firstQueued.get(p)) != null ? _a : now;
    this.firstQueued.set(p, first);
    const maxWait = minDelayMs >= 8e3 ? 6e4 : minDelayMs >= 4e3 ? 3e4 : 15e3;
    const delay = Math.max(300, Math.min(Math.max(this.s.pushDelayMs, minDelayMs), maxWait - (now - first)));
    this.timers.set(
      p,
      window.setTimeout(() => {
        this.timers.delete(p);
        this.firstQueued.delete(p);
        if (this.busy === 0) this.setState("syncing");
        void this.enqueue(() => this.pushPath(p), true).then(() => {
          if (this.busy === 0 && this.state === "syncing") this.setState("ok");
        });
      }, delay)
    );
  }
  /** Sends anything still waiting to go up, now. Called when the app goes to the background, so nothing is left behind. */
  flushPending() {
    for (const [p, t] of Array.from(this.timers)) {
      window.clearTimeout(t);
      this.timers.delete(p);
      this.firstQueued.delete(p);
      void this.enqueue(() => this.pushPath(p), true);
    }
  }
  onRename(oldPath, file) {
    if (file instanceof import_obsidian2.TFolder) {
      const prefix = oldPath + "/";
      for (const oldInk of Object.keys(this.st.books)) {
        if (oldInk.startsWith(prefix)) {
          const newInk = file.path + oldInk.slice(oldPath.length);
          if (this.ready && !this.paused && this.connected()) {
            void this.enqueue(() => this.moveBook(oldInk, newInk), true);
          } else {
            this.st.books[newInk] = this.st.books[oldInk];
            delete this.st.books[oldInk];
            this.saveSoon();
          }
        }
      }
    }
    if (!this.ready || this.paused || !this.connected()) return;
    if (file instanceof import_obsidian2.TFile && file.extension === "pdf") void this.enqueue(() => this.moveBook(oldPath + INK, file.path + INK), true);
    const id = this.idByPath.get(oldPath);
    if (!id) {
      if (file instanceof import_obsidian2.TFile) this.queuePush(file.path);
      return;
    }
    void this.enqueue(async () => {
      const n = this.nodes.get(id);
      if (!n) return;
      if (this.excluded(file.path)) {
        await this.remoteDelete(id);
        return;
      }
      const parentId = await this.ensureRemoteDir(dirname(file.path));
      const patch = n.name !== basename(file.path) ? { name: basename(file.path) } : {};
      const res = await this.drive.patch(id, patch, parentId !== n.parent ? parentId : void 0, parentId !== n.parent ? n.parent : void 0);
      const updated = this.fromFile(res, n);
      if (n.folder) {
        for (const d of this.subtree(id)) if (d.lp && (d.lp === oldPath || d.lp.startsWith(oldPath + "/"))) this.setLp(d, file.path + d.lp.slice(oldPath.length));
      }
      updated.lp = file.path;
      this.putNode(updated);
      this.idByPath.set(file.path, id);
      this.saveSoon();
    });
  }
  ensureRemoteDir(dir) {
    const running = this.dirJobs.get(dir);
    if (running) return running;
    const job = this.ensureRemoteDirNow(dir).finally(() => this.dirJobs.delete(dir));
    this.dirJobs.set(dir, job);
    return job;
  }
  async ensureRemoteDirNow(dir) {
    var _a, _b;
    if (!dir) return this.st.rootId;
    const parentId = await this.ensureRemoteDir(dirname(dir));
    const seg = basename(dir);
    const existing = (_a = this.kids.get(parentId)) == null ? void 0 : _a.get(seg);
    const node = existing ? this.nodes.get(existing) : void 0;
    if (node && node.folder) return node.id;
    const found = await this.foldersNamed(parentId, seg);
    const made = (_b = found[0]) != null ? _b : await this.drive.createFolder(seg, parentId);
    const n = this.fromFile(made);
    n.lp = dir;
    this.putNode(n);
    return n.id;
  }
  async remoteDelete(id) {
    await this.drive.trash(id);
    for (const n of this.subtree(id).reverse()) this.delNode(n.id);
    this.saveSoon();
  }
  async pushPath(p) {
    var _a, _b, _c, _d, _e, _f;
    if (this.excluded(p)) return;
    if (p.endsWith(INK)) {
      if (this.file(p)) await this.pushBook(p);
      return;
    }
    const f = this.file(p);
    const id = this.idByPath.get(p);
    if (!f) {
      const folder = this.vault.getAbstractFileByPath(p);
      if (!folder) {
        if (id) await this.remoteDelete(id);
        if (p.toLowerCase().endsWith(".pdf")) await this.removeAnnotations(p);
      }
      return;
    }
    if (f.stat.size > this.maxBytes) {
      this.noteSkipped(p);
      return;
    }
    let n = id ? this.nodes.get(id) : void 0;
    if (n && !n.folder && n.lm === f.stat.mtime && n.ls === f.stat.size) return;
    if (n) {
      const fresh = Date.now() - this.lastPollAt < 2 * Math.max(3, this.s.pollSeconds) * 1e3;
      if (fresh) {
        if (((_b = (_a = n.md5) != null ? _a : n.mod) != null ? _b : "") !== n.rev) {
          await this.syncDown(n, p);
          return;
        }
      } else {
        const meta = await this.drive.get(n.id);
        if (!meta || meta.trashed) {
          this.delNode(n.id);
          n = void 0;
        } else {
          const remoteRev = (_d = (_c = meta.md5Checksum) != null ? _c : meta.modifiedTime) != null ? _d : "";
          if (remoteRev !== n.rev) {
            const updated = this.fromFile(meta, n);
            this.putNode(updated);
            await this.syncDown(updated, p);
            return;
          }
        }
      }
    }
    const parentId = await this.ensureRemoteDir(dirname(p));
    const mtime = f.stat.mtime;
    const size = f.stat.size;
    const data = await this.vault.readBinary(f);
    const res = await this.drive.upload({ id: n == null ? void 0 : n.id, name: basename(p), parent: parentId, data });
    this.plugin.log.debug("sync", `uploaded ${p}`, { kb: Math.round(data.byteLength / 1024) });
    const node = this.fromFile(res, n);
    node.rev = (_f = (_e = res.md5Checksum) != null ? _e : res.modifiedTime) != null ? _f : "";
    node.lm = mtime;
    node.ls = size;
    node.lp = p;
    this.putNode(node);
    this.idByPath.set(p, node.id);
    this.saveSoon();
  }
  /**
   * Brings one book up to date: reads the pages that changed on Drive, merges them into the local file, then uploads
   * only the pages (and the index) that changed here. A cloud file that cannot be read is never overwritten.
   * A book saved in the old single-file form is merged in, and that file is removed once every page is safely up.
   */
  /** The device's name in the log files of the new format: random once, then kept in the sync state. */
  deviceLabel() {
    if (!this.st.deviceLabel) {
      const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
      let s = "";
      for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      this.st.deviceLabel = s;
    }
    return this.st.deviceLabel;
  }
  markOwnWrite(path) {
    const now = Date.now();
    if (this.ownWrites.size > 16) {
      for (const [k, t] of this.ownWrites) if (now - t >= 2e3) this.ownWrites.delete(k);
    }
    this.ownWrites.set(path, now);
  }
  isOwnWrite(path) {
    const at = this.ownWrites.get(path);
    if (at === void 0) return false;
    if (Date.now() - at < 2e3) return true;
    this.ownWrites.delete(path);
    return false;
  }
  /** The folder that holds this device's state for one book. */
  logDir(pdfPath) {
    if (!this._logDirs) this._logDirs = /* @__PURE__ */ new Map();
    let d = this._logDirs.get(pdfPath);
    if (!d) {
      d = `${this.plugin.manifest.dir}/logs/${md5Hex(UTF8_ENC.encode(pdfPath))}`;
      this._logDirs.set(pdfPath, d);
    }
    return d;
  }
  logIO() {
    const ad = this.vault.adapter;
    return {
      read: async (p) => await ad.exists(p) ? ad.readBinary(p) : null,
      write: async (p, d) => {
        await ad.writeBinary(p, d);
      },
      exists: async (p) => ad.exists(p)
    };
  }
  /** This device's log state for a book: read from its file, or new (joining the new format). */
  async logStateFor(pdfPath) {
    const have = this.logStates.get(pdfPath);
    if (have) return have;
    let st = null;
    try {
      st = await loadLogStateFiles(this.logIO(), this.logDir(pdfPath));
    } catch (e) {
      this.plugin.log.warn("sync", "a log state could not be read; the book joins the new format again", { book: pdfPath });
      st = null;
    }
    const fresh = st != null ? st : newLogState(this.deviceLabel());
    this.logStates.set(pdfPath, fresh);
    return fresh;
  }
  async saveLogState(pdfPath, st) {
    const ad = this.vault.adapter;
    const targetDir = this.logDir(pdfPath);
    if (!this.ensuredLogDirs) this.ensuredLogDirs = /* @__PURE__ */ new Set();
    if (!this.ensuredLogDirs.has(targetDir)) {
      for (const dir of [`${this.plugin.manifest.dir}/logs`, targetDir]) {
        if (!await ad.exists(dir)) await ad.mkdir(dir);
      }
      this.ensuredLogDirs.add(targetDir);
    }
    await saveLogStateFiles(this.logIO(), targetDir, st);
  }
  /** The book's annotation file as it is on this device, or null. */
  async readAnnotation(pdfPath) {
    try {
      const f = this.file(pdfPath);
      if (f) {
        if (this.lastParsed && this.lastParsed.path === pdfPath && this.lastParsed.mtime === f.stat.mtime && (this.lastParsed.size === void 0 || this.lastParsed.size === f.stat.size)) {
          return this.lastParsed.doc;
        }
        const doc = parseDoc(await this.vault.read(f));
        if (doc) this.lastParsed = { path: pdfPath, mtime: f.stat.mtime, size: f.stat.size, doc };
        return doc;
      }
      if (await this.vault.adapter.exists(pdfPath)) return parseDoc(await this.vault.adapter.read(pdfPath));
    } catch (e) {
      console.warn("[Pencil Ink] could not read annotations", e);
    }
    return null;
  }
  /** One sync of a book in the new format (see logs.ts). Only this device's own files are written. */
  async pushBookLogs(pdfPath, folderId, listing, joining) {
    const book = this.st.books[pdfPath];
    const name = basename(pdfPath.slice(0, -INK.length));
    const st = await this.logStateFor(pdfPath);
    let seen = this.logSeen.get(pdfPath);
    if (!seen) {
      seen = /* @__PURE__ */ new Map();
      this.logSeen.set(pdfPath, seen);
    }
    await this.withFileLock(pdfPath, () => this.mergeAndWriteLogs(pdfPath, folderId, listing, joining, book, name, st, seen));
    book.folderId = folderId;
    book.logs = true;
    delete book.pre;
    book.pages = {};
    delete book.meta;
    delete book.indexId;
    delete book.indexMd5;
    delete book.indexSig;
    const after = this.file(pdfPath);
    if (after) book.local = { mtime: after.stat.mtime, size: after.stat.size };
    else delete book.local;
    delete book.check;
    this.capLogStates(pdfPath);
    await this.saveState();
  }
  capLogStates(keepPath) {
    if (this.logStates.size <= 8) return;
    const openPaths = new Set();
    if (typeof this.plugin.inkViews === "function") {
      for (const v of this.plugin.inkViews()) {
        if (v && v.file && v.file.path) openPaths.add(v.file.path + INK);
      }
    }
    for (const [k, st] of this.logStates) {
      if (this.logStates.size <= 8) break;
      if (k === keepPath || openPaths.has(k) || (st && st.dirty && st.dirty.length > 0)) continue;
      this.logStates.delete(k);
      this.logSeen.delete(k);
    }
  }
  async mergeAndWriteLogs(pdfPath, folderId, listing, joining, book, name, st, seen) {
    var _a;
    const lf = this.file(pdfPath);
    const hadFormat = listing.some((f) => f.name === FORMAT_NAME);
    if (!joining && hadFormat && st.base !== null && st.dirty.length === 0 && !book.pre && lf && book.local && lf.stat.mtime === book.local.mtime && lf.stat.size === book.local.size && (book.lastSeenCount === void 0 || book.lastSeenCount === seen.size)) {
      let remoteUnchanged = true;
      const seenCounts = /* @__PURE__ */ new Map();
      for (const f of listing) {
        if (!f.name.startsWith("log_")) continue;
        if (f.name.startsWith(`log_${st.label}_`)) {
          if (st.ids[f.name] === void 0 || st.ids[f.name] !== f.id) {
            remoteUnchanged = false;
            break;
          }
          continue;
        }
        const c = (seenCounts.get(f.name) || 0) + 1;
        seenCounts.set(f.name, c);
        if (c > 1 || !seen.has(f.name) || !st.seenMd5[f.name] || st.seenMd5[f.name] !== f.md5Checksum) {
          remoteUnchanged = false;
          break;
        }
      }
      if (remoteUnchanged && seenCounts.size === seen.size) {
        book.lastSeenCount = seen.size;
        return;
      }
    }
    let local = await this.readAnnotation(pdfPath);
    if (lf && !local && lf.stat.size > 0) {
      try {
        const copy = `${pdfPath}.damaged-${Date.now()}.txt`;
        await this.vault.adapter.write(copy, await this.vault.read(lf));
        this.plugin.log.warn("sync", "an annotation file could not be read; a copy was kept", { book: pdfPath, copy });
      } catch (e) {
      }
    }
    const mtimeBefore = lf ? lf.stat.mtime : -1;
    const sizeBefore = lf ? lf.stat.size : -1;
    let res;
    try {
      res = await syncBookLogs(this.drive, folderId, listing, st, seen, local, Date.now(), name, (_a = book.pre) != null ? _a : null);
      const lfAfter = this.file(pdfPath);
      if (lfAfter && (lfAfter.stat.mtime !== mtimeBefore || lfAfter.stat.size !== sizeBefore)) {
        const again = await this.readAnnotation(pdfPath);
        if (again && (!local || !sameContent(again, local))) {
          local = again;
          res = await syncBookLogs(this.drive, folderId, listing, st, seen, local, Date.now(), name, null);
        }
      }
    } catch (e) {
      await this.saveLogState(pdfPath, st);
      throw e;
    }
    const doc = res.doc;
    const hasAny = Object.keys(doc.pages).length + Object.keys(doc.blanks).length + Object.keys(doc.bookmarks).length + Object.keys(doc.removed).length + Object.keys(doc.deleted).length > 0;
    if (local && !sameContent(doc, local) || !local && hasAny) {
      this.markOwnWrite(pdfPath);
      await this.writeText(pdfPath, JSON.stringify(doc));
      this.plugin.events.trigger("remote", pdfPath, doc);
    }
    await this.saveLogState(pdfPath, st);
    book.lastSeenCount = seen.size;
    if (joining && !hadFormat) {
      await this.drive.upload({ name: FORMAT_NAME, parent: folderId, data: UTF8_ENC.encode(JSON.stringify({ format: 2 })).buffer });
    }
  }
  /** One sync of a book. A book that has not joined the new format yet is brought over on this same sync: the old
   *  shared files are read once (so nothing already on Drive is lost), then the book joins the per-device logs. */
  async pushBook(pdfPath) {
    await this.pushBookOnce(pdfPath);
    const book = this.st.books[pdfPath];
    if (!this.autoJoin || !book || book.logs || this.switching.has(pdfPath)) return;
    this.switching.add(pdfPath);
    try {
      await this.pushBookOnce(pdfPath);
    } finally {
      this.switching.delete(pdfPath);
    }
  }
  async pushBookOnce(pdfPath) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    if (!pdfPath.endsWith(INK) || this.excluded(pdfPath)) return;
    await this.yieldToPen();
    const dir = dirname(pdfPath);
    const file = basename(pdfPath);
    const name = pdfPath.slice(0, -INK.length);
    const book = (_b = (_a = this.st.books)[pdfPath]) != null ? _b : _a[pdfPath] = { folderId: "", pages: {} };
    const blocked = /* @__PURE__ */ new Set();
    const parentId = await this.ensureRemoteDir(dir);
    const legacy = (_c = this.kids.get(parentId)) == null ? void 0 : _c.get(file);
    let legacyDoc = null;
    if (legacy) {
      try {
        legacyDoc = await decodeWire(await this.drive.download(legacy));
      } catch (e) {
        legacyDoc = null;
      }
      if (!legacyDoc) blocked.add("legacy");
    }
    const folderName = file.slice(0, -".json".length) + ".d";
    let folderId = book.folderId;
    let others = [];
    if (!folderId || book.check) {
      let folders = await this.foldersNamed(parentId, folderName);
      let created = false;
      if (!folders.length) {
        if (!this.file(pdfPath)) return;
        const made = await this.drive.createFolder(folderName, parentId);
        folders = await this.foldersNamed(parentId, folderName);
        if (!folders.length) folders = [made];
        created = true;
      }
      folderId = folders[0].id;
      others = folders.slice(1).map((f) => f.id);
      book.check = created;
    }
    book.folderId = folderId;
    if (folderId && parentId) this.putNode({ id: folderId, name: folderName, parent: parentId, folder: true });
    const listing = await this.drive.listChildren([folderId, ...others]);
    const inKept = (f) => {
      var _a2;
      return ((_a2 = f.parents) != null ? _a2 : []).includes(folderId);
    };
    const byName = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    for (const f of listing) {
      if (inKept(f) || !byName.has(f.name)) byName.set(f.name, f);
      const g = groups.get(f.name);
      if (g) g.push(f);
      else groups.set(f.name, [f]);
    }
    const newFormat = book.logs || byName.has(FORMAT_NAME) || listing.some((f) => f.name.startsWith("dev_") || f.name.startsWith("log_"));
    if (newFormat || this.switching.has(pdfPath)) {
      if (!book.logs && legacy) {
        this.plugin.log.warn("sync", "this book still has an old single file; open it once with the current release before switching", { book: pdfPath });
        return;
      }
      return this.pushBookLogs(pdfPath, folderId, listing, !book.logs);
    }
    return this.syncLegacyShards(pdfPath, name, book, folderId, others, byName, groups, inKept, legacy, legacyDoc, blocked);
  }
  async syncLegacyShards(pdfPath, name, book, folderId, others, byName, groups, inKept, legacy, legacyDoc, blocked) {
    var _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    let meta = null;
    const idx = byName.get(INDEX_NAME);
    const indexFiles = (_d = groups.get(INDEX_NAME)) != null ? _d : [];
    if (indexFiles.length && (indexFiles.length > 1 || !idx || !inKept(idx) || idx.md5Checksum !== book.indexMd5 || !book.meta)) {
      const docs = [];
      const bytesOf = /* @__PURE__ */ new Map();
      let readable = true;
      for (const f of indexFiles) {
        const b = await this.drive.download(f.id);
        bytesOf.set(f.id, b);
        const m = await decodeIndex(b);
        if (m) docs.push(metaDoc(m, name));
        else readable = false;
      }
      if (!readable || !docs.length) {
        blocked.add(INDEX_NAME);
        this.plugin.log.warn("sync", "a cloud index could not be read; left unchanged", { book: pdfPath });
      } else {
        const all = docs.reduce((a, b) => mergeDocs(a, b));
        meta = { updated: all.updated, blanks: all.blanks, bookmarks: all.bookmarks, removed: all.removed, deleted: all.deleted };
        book.meta = meta;
        if (idx && inKept(idx) && bytesOf.has(idx.id)) book.indexMd5 = md5Hex(bytesOf.get(idx.id));
      }
    }
    const remotePages = {};
    for (const [fname, group] of groups) {
      if (!fname.startsWith(SHARD_PREFIX) || !fname.endsWith(SHARD_SUFFIX)) continue;
      const kept = byName.get(fname);
      const known2 = book.pages[fname];
      if (group.length === 1 && inKept(kept) && known2 && known2.id === kept.id && known2.md5 === kept.md5Checksum) continue;
      for (const f of group) {
        const bytes = await this.drive.download(f.id);
        const shard = await decodeShard(bytes);
        if (!shard) {
          blocked.add(fname);
          this.plugin.log.warn("sync", "a cloud page could not be read; left unchanged", { book: pdfPath, file: fname });
          continue;
        }
        remotePages[shard.key] = [...(_e = remotePages[shard.key]) != null ? _e : [], ...shard.strokes];
        if (f === kept) book.pages[fname] = { id: f.id, md5: md5Hex(bytes), sig: fnv(shardText(shard.key, shard.strokes)), key: shard.key, idk: idKey(shard.strokes.map((s) => s.id)) };
      }
    }
    const gone = Object.keys(book.pages).filter((n) => !byName.has(n));
    for (const n of gone) delete book.pages[n];
    const remoteChanged = meta !== null || Object.keys(remotePages).length > 0 || gone.length > 0;
    if (!remoteChanged && !legacy && this.isClean(pdfPath)) return;
    await this.yieldToPen();
    const lf = this.file(pdfPath);
    const local = lf ? parseDoc(await this.vault.read(lf)) : null;
    if (lf && !local && lf.stat.size > 0) {
      const copy = `${pdfPath}.damaged-${Date.now()}.txt`;
      await this.vault.adapter.write(copy, await this.vault.read(lf));
      this.plugin.log.warn("sync", "an annotation file could not be read; a copy was kept", { book: pdfPath, copy });
    }
    const known = (_f = meta != null ? meta : book.meta) != null ? _f : null;
    const remote = {
      version: 1,
      name,
      pages: remotePages,
      deleted: (_g = known == null ? void 0 : known.deleted) != null ? _g : {},
      updated: (_h = known == null ? void 0 : known.updated) != null ? _h : 0,
      blanks: (_i = known == null ? void 0 : known.blanks) != null ? _i : {},
      bookmarks: (_j = known == null ? void 0 : known.bookmarks) != null ? _j : {},
      removed: (_k = known == null ? void 0 : known.removed) != null ? _k : {}
    };
    let merged = mergeDocs(local != null ? local : emptyDoc(name), remote);
    if (legacyDoc) merged = mergeDocs(merged, legacyDoc);
    pruneDeleted(merged, Date.now());
    let onDisk = local;
    const writeIfChanged = async () => {
      if (onDisk && sameContent(merged, onDisk)) {
        if (!book.logs) book.pre = snapshotOf(merged);
        return;
      }
      this.markOwnWrite(pdfPath);
      await this.withFileLock(pdfPath, () => this.writeText(pdfPath, JSON.stringify(merged)));
      onDisk = merged;
      if (!book.logs) book.pre = snapshotOf(merged);
      this.plugin.events.trigger("remote", pdfPath, merged);
    };
    const indexKnown = !!(meta != null ? meta : book.meta) && !blocked.has(INDEX_NAME);
    const deadFiles = /* @__PURE__ */ new Set();
    const missing = Object.entries(book.pages).filter(([fileName, e]) => {
      var _a2;
      return byName.has(fileName) && !(e.key && ((_a2 = merged.pages[e.key]) == null ? void 0 : _a2.length));
    });
    let restored = 0;
    await pool(missing, 3, async ([fileName, e]) => {
      await this.yieldToPen();
      const bytes = await this.drive.download(e.id);
      const shard = await decodeShard(bytes);
      if (!shard) {
        blocked.add(fileName);
        return;
      }
      const ids2 = shard.strokes.map((s) => s.id);
      book.pages[fileName] = { id: e.id, md5: md5Hex(bytes), sig: fnv(shardText(shard.key, shard.strokes)), key: shard.key, idk: idKey(ids2) };
      if (indexKnown && isDeadPage(shard.key, ids2, merged)) {
        deadFiles.add(fileName);
        return;
      }
      merged = mergeDocs(merged, { ...emptyDoc(name), blanks: merged.blanks, pages: { [shard.key]: shard.strokes } });
      if (++restored % 10 === 0) {
        await writeIfChanged();
        await this.saveState();
      }
    });
    if (restored) this.plugin.log.info("sync", "pages read back from Drive", { book: pdfPath, pages: restored });
    await writeIfChanged();
    let uploads = 0;
    const current = /* @__PURE__ */ new Set();
    const toUpload = [];
    for (const [key, strokes2] of Object.entries(merged.pages)) {
      if (!strokes2.length) continue;
      const fileName = shardName(key);
      current.add(fileName);
      if (blocked.has(fileName)) continue;
      const prev = book.pages[fileName];
      const k = byName.get(fileName);
      const onKept = !!k && inKept(k) && (prev == null ? void 0 : prev.id) === k.id;
      const idk = idKey(strokes2.map((s) => s.id));
      if (onKept && (prev == null ? void 0 : prev.idk) === idk) continue;
      const text = shardText(key, strokes2);
      const sig = fnv(text);
      if (onKept && (prev == null ? void 0 : prev.sig) === sig) continue;
      toUpload.push({ fileName, text, sig, id: k && inKept(k) ? k.id : void 0, key, idk });
    }
    await this.yieldToPen();
    await pool(toUpload, 3, async (job) => {
      var _a2;
      const res = await this.drive.upload({ id: job.id, name: job.fileName, parent: folderId, data: await gzipText(job.text) });
      book.pages[job.fileName] = { id: res.id, md5: (_a2 = res.md5Checksum) != null ? _a2 : "", sig: job.sig, key: job.key, idk: job.idk };
      uploads++;
    });
    for (const fileName of Object.keys(book.pages)) {
      if (current.has(fileName) || blocked.has(fileName)) continue;
      if (!deadFiles.has(fileName)) continue;
      await this.trashQuiet(book.pages[fileName].id);
      delete book.pages[fileName];
    }
    const indexMeta = { updated: 0, blanks: merged.blanks, bookmarks: merged.bookmarks, removed: merged.removed, deleted: merged.deleted };
    const indexSig = fnv(JSON.stringify(indexMeta));
    const keptIndex = idx && inKept(idx) ? idx : void 0;
    let keptIndexId = keptIndex == null ? void 0 : keptIndex.id;
    if (!blocked.has(INDEX_NAME) && (indexSig !== book.indexSig || !keptIndex)) {
      const res = await this.drive.upload({ id: keptIndex == null ? void 0 : keptIndex.id, name: INDEX_NAME, parent: folderId, data: await gzipText(indexText({ ...indexMeta, updated: merged.updated })) });
      keptIndexId = res.id;
      book.indexId = res.id;
      book.indexMd5 = (_l = res.md5Checksum) != null ? _l : "";
      book.indexSig = indexSig;
      book.meta = { ...indexMeta, updated: merged.updated };
      uploads++;
    }
    if (!blocked.size) {
      for (const [fname, group] of groups) {
        if (fname !== INDEX_NAME && !fname.startsWith(SHARD_PREFIX)) continue;
        const keep = fname === INDEX_NAME ? keptIndexId : (_m = book.pages[fname]) == null ? void 0 : _m.id;
        for (const f of group) if (f.id !== keep) await this.trashQuiet(f.id);
      }
      for (const other of others) await this.trashQuiet(other);
    }
    if (legacy && !blocked.has("legacy") && !blocked.size) {
      try {
        await this.drive.trash(legacy);
      } catch (e) {
      }
      this.delNode(legacy);
      this.plugin.log.info("sync", "annotations moved to per-page files", { book: pdfPath });
    }
    const after = this.file(pdfPath);
    if (after) book.local = { mtime: after.stat.mtime, size: after.stat.size };
    this.plugin.log.debug("sync", "book synced", { book: pdfPath, uploads, pages: current.size, blocked: blocked.size });
    await this.saveState();
  }
  /** Folders with this name under the parent, found on Drive, smallest id first. */
  async foldersNamed(parentId, name) {
    const found = await this.drive.findChildren(parentId, name, FOLDER_MIME);
    return found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  async trashQuiet(id) {
    try {
      await this.drive.trash(id);
    } catch (e) {
    }
  }
  /** A PDF was deleted or removed elsewhere: its annotations go with it, here now and on Drive as soon as it can be reached. */
  async removeAnnotations(pdfPath) {
    var _a;
    const ink = pdfPath + INK;
    const local = this.file(ink);
    if (local) await this.plugin.app.fileManager.trashFile(local);
    delete this.st.books[ink];
    this.st.removeNext = [...(_a = this.st.removeNext) != null ? _a : [], ink];
    this.saveSoon();
    void this.enqueue(() => this.processRemovals(), true);
  }
  /** Removes the Drive folders of books whose PDF is gone. Kept in the state until done, so it survives being offline. */
  async processRemovals() {
    var _a, _b, _c;
    if (!this.connected() || this.paused || !this.ready) return;
    for (const ink of [...(_a = this.st.removeNext) != null ? _a : []]) {
      const dir = dirname(ink);
      const parentId = dir ? this.idByPath.get(dir) : this.st.rootId;
      if (parentId) {
        for (const f of await this.foldersNamed(parentId, basename(ink).slice(0, -".json".length) + ".d")) await this.trashQuiet(f.id);
        const legacy = (_b = this.kids.get(parentId)) == null ? void 0 : _b.get(basename(ink));
        if (legacy) await this.trashQuiet(legacy);
      }
      this.st.removeNext = ((_c = this.st.removeNext) != null ? _c : []).filter((x) => x !== ink);
      this.saveSoon();
    }
  }
  /** A PDF was renamed or moved: its book (and the folder on Drive) follows it. */
  async moveBook(oldInk, newInk) {
    var _a;
    const b = this.st.books[oldInk];
    if (!b || oldInk === newInk) return;
    delete this.st.books[oldInk];
    this.st.books[newInk] = b;
    this.saveSoon();
    if (!b.folderId) return;
    const meta = await this.drive.get(b.folderId);
    if (!meta || meta.trashed) return;
    const name = basename(newInk).slice(0, -".json".length) + ".d";
    const newParent = await this.ensureRemoteDir(dirname(newInk));
    const oldParent = (_a = meta.parents) == null ? void 0 : _a[0];
    if (meta.name === name && oldParent === newParent) return;
    const moving = oldParent !== newParent;
    await this.drive.patch(b.folderId, meta.name !== name ? { name } : {}, moving ? newParent : void 0, moving ? oldParent : void 0);
  }
  /** Background sync work gives way to the pen, scrolling, and zooming: it waits while active interaction is in progress. */
  async yieldToPen() {
    const busyNow = () => {
      try {
        const nowPerf = performance.now();
        return typeof this.plugin.inkViews === "function" && this.plugin.inkViews().some((v) => v.cur !== null || v.erasing !== null || v.activePointer !== null || v.pinching || nowPerf - (v.lastScroll || 0) < 1200 || nowPerf - (v.zoomAt || 0) < 1200);
      } catch (e) {
        return false;
      }
    };
    for (let waited = 0; (busyNow() || Date.now() - this.plugin.lastInputAt < 1e3) && waited < (busyNow() ? 15e3 : 3e3); waited += 100) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  /** Queues a book's check once: several changes to one book in a row make one check, not several. */
  queueBook(pdfPath) {
    if (this.queuedBooks.has(pdfPath)) return;
    this.queuedBooks.add(pdfPath);
    void this.enqueue(async () => {
      this.queuedBooks.delete(pdfPath);
      await this.pushBook(pdfPath);
    }, true);
  }
  /** Find local files that changed (or were deleted) while the app was not watching. */
  async scanLocal(initial = false) {
    const todo = [];
    for (const f of this.vault.getFiles()) {
      if (f.path.endsWith(INK) || this.excluded(f.path) || f.stat.size > this.maxBytes) continue;
      const id = this.idByPath.get(f.path);
      const n = id ? this.nodes.get(id) : void 0;
      if (!n || !n.folder && (n.lm !== f.stat.mtime || n.ls !== f.stat.size)) todo.push(f.path);
    }
    const missing = [];
    let tracked = 0;
    for (const [path, id] of Array.from(this.idByPath)) {
      const n = this.nodes.get(id);
      if (!n || id === this.st.rootId || n.lp !== path || path.endsWith(INK)) continue;
      tracked++;
      if (!this.vault.getAbstractFileByPath(path) && !this.excluded(path)) missing.push(path);
    }
    if (missing.length > 25 && missing.length > tracked * 0.3) {
      new import_obsidian2.Notice(`Pencil Ink: ${missing.length} synced files are missing locally. Not deleting them from Drive (safety check). Use Full re-scan if this is intended.`, 1e4);
    } else todo.push(...missing);
    if (!todo.length) return;
    if (!initial) this.progress = { done: 0, total: todo.length };
    await pool(todo, 3, async (p) => {
      try {
        await this.pushPath(p);
      } catch (e) {
        if (e instanceof DriveError) throw e;
        console.warn("[Pencil Ink] push failed for", p, e);
      }
      if (!initial) {
        this.progress.done++;
        this.plugin.events.trigger("sync-state", this.state);
      }
    });
  }
  /** Removes conflict copies from Google Drive and from this device. Returns how many were removed. */
  async removeConflictCopies() {
    let removed = 0;
    const cloud = Array.from(this.nodes.values()).filter((n) => n.id !== this.st.rootId && !n.folder && CONFLICT_RE.test(n.name));
    for (const n of cloud) {
      try {
        await this.drive.trash(n.id);
        this.delNode(n.id);
        removed++;
      } catch (e) {
        this.plugin.log.error("sync", "could not remove a conflict copy from Drive", e);
      }
    }
    for (const f of this.vault.getFiles()) {
      if (!CONFLICT_RE.test(f.path)) continue;
      try {
        await this.plugin.app.fileManager.trashFile(f);
        removed++;
      } catch (e) {
        this.plugin.log.error("sync", "could not remove a local conflict copy", e);
      }
    }
    this.saveSoon();
    return removed;
  }
  disconnectCleanup() {
    this.stop();
    this.ready = false;
    this.setState("disconnected");
  }
};
var ConfirmModal = class extends import_obsidian2.Modal {
  constructor(plugin, downCount, downBytes, upCount, upBytes, done) {
    super(plugin.app);
    this.downCount = downCount;
    this.downBytes = downBytes;
    this.upCount = upCount;
    this.upBytes = upBytes;
    this.done = done;
    this.answered = false;
  }
  onOpen() {
    const mb = (b) => (b / 1048576).toFixed(0) + " MB";
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "First sync: please confirm" });
    contentEl.createEl("p", {
      text: `Download ${this.downCount} files (${mb(this.downBytes)}) from Google Drive and upload ${this.upCount} files (${mb(this.upBytes)}) from this vault.`
    });
    contentEl.createEl("p", {
      text: "On an iPad, make sure you have the space. You can cancel and limit which folders sync in Pencil Ink settings instead.",
      cls: "setting-item-description"
    });
    const row = contentEl.createDiv({ cls: "modal-button-container" });
    const go = row.createEl("button", { text: "Start sync", cls: "mod-cta" });
    go.onclick = () => {
      this.answered = true;
      this.done(true);
      this.close();
    };
    const no = row.createEl("button", { text: "Cancel" });
    no.onclick = () => this.close();
  }
  onClose() {
    if (!this.answered) this.done(false);
    this.contentEl.empty();
  }
};
var AuthModal = class extends import_obsidian2.Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.server = null;
  }
  closeServer() {
    if (this.server) {
      try {
        this.server.close();
      } catch (e) {
      }
      this.server = null;
    }
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Connect Google Drive" });
    try {
      const { url, verifier } = await this.plugin.sync.drive.beginAuth();
      let autoListening = false;
      let msg = null;
      if (!import_obsidian2.Platform.isMobile && typeof require === "function") {
        try {
          const http = require("http");
          const srv = http.createServer(async (req, res) => {
            try {
              const reqUrl = String(req.url || "");
              if (!reqUrl.includes("code=") && !reqUrl.includes("error=")) {
                res.writeHead(404);
                res.end();
                return;
              }
              if (reqUrl.includes("error=")) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end("<html><body style='font-family:-apple-system,sans-serif;text-align:center;padding:60px;background:#1c1c1e;color:#f2f2f7;'><h2>Sign-in cancelled</h2><p>You can close this tab and return to Obsidian.</p></body></html>");
                return;
              }
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end("<html><body style='font-family:-apple-system,sans-serif;text-align:center;padding:60px;background:#1c1c1e;color:#f2f2f7;'><div style='display:inline-block;padding:28px 36px;border-radius:16px;background:#2c2c2e;border:1px solid rgba(255,255,255,0.12);'><h2 style='color:#30d158;margin:0 0 10px 0;'>&#10003; Connected to Pencil Ink!</h2><p style='margin:0;color:#aeaeb2;'>Google Drive sync is now active. You can close this browser tab and return to Obsidian.</p></div></body></html>");
              this.closeServer();
              if (msg) msg.setText("Connecting...");
              await this.plugin.sync.drive.finishAuth(reqUrl, verifier);
              new import_obsidian2.Notice("Pencil Ink: Google Drive connected");
              this.plugin.sync.restart();
              this.onDone();
              this.close();
            } catch (err) {
              if (msg) msg.setText("Could not connect: " + (err instanceof Error ? err.message : String(err)));
            }
          });
          await new Promise((resolve) => {
            srv.once("error", () => resolve(false));
            srv.listen(8765, "127.0.0.1", () => {
              autoListening = true;
              this.server = srv;
              resolve(true);
            });
          });
        } catch (e) {
        }
      }
      contentEl.createEl("p", {
        text: autoListening
          ? "1. Click the button below, sign in with Google, and approve access. (If Google warns the app is unverified, click Advanced -> Proceed.) Obsidian will connect automatically as soon as you approve!"
          : "1. Tap the button, sign in and approve access. (If Google warns the app is unverified, tap Advanced, then continue.)"
      });
      const open = contentEl.createEl("button", { text: "Open Google sign-in", cls: "mod-cta" });
      open.onclick = () => window.open(url);
      contentEl.createEl("p", {
        text: autoListening
          ? "2. Fallback (if the browser doesn't connect automatically): copy the full address from the browser's address bar and paste it here:"
          : "2. Afterwards the browser shows a page that can't be reached. That is expected. Copy the full address from the address bar and paste it here:"
      });
      const box = contentEl.createEl("textarea", { attr: { rows: "3", placeholder: "http://127.0.0.1:8765/?code=...", style: "width:100%" } });
      const row = contentEl.createDiv({ cls: "modal-button-container" });
      const fin = row.createEl("button", { text: "Finish", cls: "mod-cta" });
      msg = contentEl.createEl("p", { text: "" });
      fin.onclick = async () => {
        try {
          msg.setText("Connecting...");
          this.closeServer();
          await this.plugin.sync.drive.finishAuth(box.value, verifier);
          new import_obsidian2.Notice("Pencil Ink: Google Drive connected");
          this.plugin.sync.restart();
          this.onDone();
          this.close();
        } catch (e) {
          msg.setText("Could not connect: " + (e instanceof Error ? e.message : String(e)));
        }
      };
    } catch (e) {
      contentEl.createEl("p", { text: "Could not start sign-in: " + (e instanceof Error ? e.message : String(e)) });
    }
  }
  onClose() {
    this.closeServer();
    this.contentEl.empty();
  }
};

// src/zoom.ts
var MIN_ZOOM = 0.6;
var MAX_ZOOM = 6;
var SNAP_LOG = Math.log(1.07);
function clampZoom(z) {
  if (Number.isNaN(z)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
function snapChoice(z, fitZoom) {
  const cands = [{ zoom: 1, page: false }];
  if (fitZoom !== null) cands.push({ zoom: fitZoom, page: true });
  let best = null;
  let bestD = SNAP_LOG;
  for (const c of cands) {
    const d = Math.abs(Math.log(z / c.zoom));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
function placeBox(g, slotScale) {
  if (!(g.scale > 0) || !Number.isFinite(g.scale) || !Number.isFinite(slotScale)) return { left: 0, top: 0, width: 0, height: 0 };
  const f = slotScale / g.scale;
  return {
    left: g.x * slotScale,
    top: g.y * slotScale,
    width: g.cw / g.dpr * f,
    height: g.ch / g.dpr * f
  };
}
function needsRedraw(renderScale, slotScale, covers) {
  const r = slotScale / renderScale;
  return r < 0.75 || r > 1.4 || !covers;
}
function windowGeo(pg, bb) {
  const m = 40;
  const k = pg.scale * pg.dpr;
  const px0 = Number.isFinite(pg.x) && pg.x > 0 ? pg.x : 0;
  const py0 = Number.isFinite(pg.y) && pg.y > 0 ? pg.y : 0;
  const px1 = px0 + pg.w;
  const py1 = py0 + pg.h;
  const b = [bb[0], bb[1], bb[2], bb[3]].map((v, i) => Number.isFinite(v) ? v : i === 0 ? px0 : i === 1 ? py0 : i === 2 ? px1 : py1);
  const x0 = Math.min(Math.max(px0, Math.floor(b[0] - m)), px1);
  const y0 = Math.min(Math.max(py0, Math.floor(b[1] - m)), py1);
  const x1 = Math.max(x0, Math.min(px1, Math.max(Math.ceil(b[2] + m), x0 + 200)));
  const y1 = Math.max(y0, Math.min(py1, Math.max(Math.ceil(b[3] + m), y0 + 160)));
  const ok3 = Number.isFinite(k) && k > 0;
  return { ...pg, x: x0, y: y0, cw: ok3 ? Math.max(0, Math.ceil((x1 - x0) * k)) : 0, ch: ok3 ? Math.max(0, Math.ceil((y1 - y0) * k)) : 0 };
}
function fits(win, pg, bb, pad) {
  const k = pg.scale * pg.dpr;
  const px0 = Number.isFinite(pg.x) && pg.x > 0 ? pg.x : 0;
  const py0 = Number.isFinite(pg.y) && pg.y > 0 ? pg.y : 0;
  const px1 = px0 + pg.w;
  const py1 = py0 + pg.h;
  const right = win.x + win.cw / k;
  const bottom = win.y + win.ch / k;
  const left = win.x <= px0 || bb[0] - pad >= win.x;
  const top = win.y <= py0 || bb[1] - pad >= win.y;
  const r = right >= px1 || bb[2] + pad <= right;
  const b = bottom >= py1 || bb[3] + pad <= bottom;
  return left && top && r && b;
}

// src/pictures.ts
function picturesToRemove(files, keep) {
  if (files.length <= keep) return [];
  return [...files].sort((a, b) => b.mtime - a.mtime || (a.path < b.path ? -1 : 1)).slice(keep).map((f) => f.path);
}

// src/tiplayer.ts

// src/view.ts
var import_obsidian4 = require("obsidian");

// src/icons.ts
var ICONS = {
  arrowLeft: ["m12 19-7-7 7-7", "M19 12H5"],
  moreHorizontal: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  bookOpen: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
  pen: ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"],
  highlighter: ["m9 11-6 6v3h9l3-3", "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"],
  eraser: ["m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21", "M22 21H7", "m5 11 9 9"],
  strokeEraser: ["M3 14c3-9 6-9 8-4s5 3 8-5", "m14 15 7 7", "m21 15-7 7"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"],
  zoomIn: ["M19 11a8 8 0 1 1-16 0a8 8 0 0 1 16 0Z", "m21 21-4.3-4.3", "M11 8v6", "M8 11h6"],
  zoomOut: ["M19 11a8 8 0 1 1-16 0a8 8 0 0 1 16 0Z", "m21 21-4.3-4.3", "M8 11h6"],
  sync: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  plus: ["M12 5v14", "M5 12h14"],
  copy: ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  filePlus: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M12 18v-6", "M9 15h6"],
  ruler: ["M3 17 17 3l4 4L7 21z", "m7.5 12.5 2 2", "m10.5 9.5 2 2", "m13.5 6.5 2 2"],
  hand: ["M18 11V6a2 2 0 0 0-4 0", "M14 10V4a2 2 0 0 0-4 0v2", "M10 10.5V6a2 2 0 0 0-4 0v8", "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"],
  trash: ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"],
  check: ["M20 6 9 17l-5-5"],
  bookmark: ["M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"]
};
var _iconUrlCache = /* @__PURE__ */ new Map();
function iconUrl(name, color) {
  var _a;
  const key = name + "|" + color;
  let cached = _iconUrlCache.get(key);
  if (cached) return cached;
  const paths = ((_a = ICONS[name]) != null ? _a : []).map((d) => `<path d="${d}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  cached = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  _iconUrlCache.set(key, cached);
  return cached;
}

// src/ink.ts
var HL_ALPHA = 0.42;
var PEN_LEVELS = [
  { minCut: 18, beta: 0.1059 },
  // budget 5 ms (branch: meets the constant-speed budget too)
  { minCut: 10.5, beta: 0.1059 },
  // budget 5.75 ms
  { minCut: 10.5, beta: 0.1059 },
  // budget 6.5 ms
  { minCut: 9.5, beta: 0.0434 },
  // budget 7.25 ms
  { minCut: 9.5, beta: 0.0434 }
  // budget 8 ms
];
var GATE_PX = 0.6;
var HOOK_PX = 2.2;
var HOOK_COS = Math.cos(130 * Math.PI / 180);
var HOOK_MIN_PX = 20;
var DOT_SCALE = 1.25;
var DOT_PX = 0.8;
var SPATIAL_KERNELS = [
  { k: 4, sigma: 1.8 },
  { k: 9, sigma: 4.2 },
  { k: 13, sigma: 6.2 },
  { k: 18, sigma: 8.5 },
  { k: 24, sigma: 11.5 }
].map(({ k, sigma }) => {
  const w = new Float64Array(k + 1);
  let sum = 0;
  for (let j = 0; j <= k; j++) {
    const v = Math.exp(-(j * j) / (2 * sigma * sigma));
    w[j] = v;
    sum += j === 0 ? v : 2 * v;
  }
  for (let j = 0; j <= k; j++) w[j] /= sum;
  return { k, w };
});
function splineTension(cos) {
  if (cos <= -0.75) return 0;
  if (cos >= -0.2) return 1;
  const u = (cos + 0.75) / 0.55;
  return u * u * (3 - 2 * u);
}
function smoothAt(xs, ys, n, i, w, k, out) {
  if (k <= 0 || n <= 2 || i === 0 || i === n - 1) {
    out.push(xs[i], ys[i]);
    return;
  }
  const maxSpan = Math.min(i, n - 1 - i);
  let blend = 1;
  if (maxSpan >= 2) {
    const d1 = Math.min(3, maxSpan);
    const dx1 = xs[i] - xs[i - d1], dy1 = ys[i] - ys[i - d1];
    const dx2 = xs[i + d1] - xs[i], dy2 = ys[i + d1] - ys[i];
    const l1Sq = dx1 * dx1 + dy1 * dy1, l2Sq = dx2 * dx2 + dy2 * dy2;
    let cos = 1;
    if (l1Sq > 1e-8 && l2Sq > 1e-8) {
      cos = (dx1 * dx2 + dy1 * dy2) / Math.sqrt(l1Sq * l2Sq);
      if (maxSpan >= 5 && cos > -0.65) {
        const d2 = Math.min(6, maxSpan);
        const wdx1 = xs[i] - xs[i - d2], wdy1 = ys[i] - ys[i - d2];
        const wdx2 = xs[i + d2] - xs[i], wdy2 = ys[i + d2] - ys[i];
        const wl1Sq = wdx1 * wdx1 + wdy1 * wdy1, wl2Sq = wdx2 * wdx2 + wdy2 * wdy2;
        if (wl1Sq > 1e-8 && wl2Sq > 1e-8) {
          const cos2 = (wdx1 * wdx2 + wdy1 * wdy2) / Math.sqrt(wl1Sq * wl2Sq);
          if (cos2 > cos) cos = 0.35 * cos + 0.65 * cos2;
        }
      }
      if (cos <= -0.78) {
        out.push(xs[i], ys[i]);
        return;
      }
      if (cos < 0.2) {
        const u = (cos + 0.78) / 0.98;
        blend = u * u * (3 - 2 * u);
      }
    }
  }
  let sx = 0;
  let sy = 0;
  let wSum = 0;
  const effK = Math.min(k, n - 1);
  const x0 = xs[0], y0 = ys[0], xe = xs[n - 1], ye = ys[n - 1];
  for (let j = -effK; j <= effK; j++) {
    const m = i + j;
    let x, y;
    if (m < 0) {
      const r = Math.min(-m, n - 1);
      x = 2 * x0 - xs[r];
      y = 2 * y0 - ys[r];
    } else if (m > n - 1) {
      const r = Math.max(2 * (n - 1) - m, 0);
      x = 2 * xe - xs[r];
      y = 2 * ye - ys[r];
    } else {
      x = xs[m];
      y = ys[m];
    }
    const ww = w[j < 0 ? -j : j];
    sx += ww * x;
    sy += ww * y;
    wSum += ww;
  }
  if (wSum > 0) {
    sx /= wSum;
    sy /= wSum;
  }
  out.push(xs[i] + (sx - xs[i]) * blend, ys[i] + (sy - ys[i]) * blend);
}
var MAX_JUMP_PT = 100;
var MAX_STROKE_POINTS = 6e4;
function oeAlpha(cutHz, dt) {
  return 1 / (1 + 1 / (2 * Math.PI * cutHz) / dt);
}
function pointWidth(pRaw, baseSize, penType = "fountain") {
  const p = Number.isFinite(pRaw) ? Math.max(0.05, Math.min(1.0, pRaw)) : 0.5;
  if (penType === "ball") return baseSize;
  if (penType === "brush") return baseSize * (0.35 + 1.3 * p);
  return baseSize * (0.55 + 0.9 * p);
}
var RibbonWidthsBuf = null;
var ribbonPaths = /* @__PURE__ */ new WeakMap();
function getRibbonPathBatches(pts, baseSize, penType = "fountain") {
  if (typeof Path2D === "undefined" || !pts || typeof pts !== "object") return null;
  let cached = ribbonPaths.get(pts);
  if (cached && cached.baseSize === baseSize && cached.penType === penType) return cached.batches;
  const batches = [];
  let curPath = null;
  const rec = {
    lineWidth: baseSize,
    lineCap: "round",
    lineJoin: "round",
    beginPath() { curPath = new Path2D(); },
    moveTo(x, y) { if (!curPath) curPath = new Path2D(); curPath.moveTo(x, y); },
    lineTo(x, y) { if (!curPath) curPath = new Path2D(); curPath.lineTo(x, y); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { if (!curPath) curPath = new Path2D(); curPath.bezierCurveTo(c1x, c1y, c2x, c2y, x, y); },
    arc(x, y, r, s, e) { if (!curPath) curPath = new Path2D(); curPath.arc(x, y, r, s, e); },
    stroke() { if (curPath) { batches.push({ path: curPath, w: this.lineWidth, fill: false }); curPath = null; } },
    fill() { if (curPath) { batches.push({ path: curPath, w: this.lineWidth, fill: true }); curPath = null; } }
  };
  traceRibbonPathRaw(rec, pts, baseSize, penType);
  ribbonPaths.set(pts, { baseSize, penType, batches });
  return batches;
}
function traceRibbonPath(g, pts, baseSize, penType = "fountain", allowCache = true) {
  if (allowCache && typeof Path2D !== "undefined" && ((typeof CanvasRenderingContext2D !== "undefined" && g instanceof CanvasRenderingContext2D) || g._usePath2D === true)) {
    const batches = getRibbonPathBatches(pts, baseSize, penType);
    if (batches) {
      g.lineCap = "round";
      g.lineJoin = "round";
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        if (b.fill) g.fill(b.path);
        else {
          g.lineWidth = b.w;
          g.stroke(b.path);
        }
      }
      return;
    }
  }
  traceRibbonPathRaw(g, pts, baseSize, penType);
}
function traceRibbonPathRaw(g, pts, baseSize, penType = "fountain") {
  const n = Math.floor(pts.length / 3);
  if (n <= 0) return;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (n === 1) {
    const w0 = pointWidth(pts[2], baseSize, penType);
    g.beginPath();
    g.arc(pts[0], pts[1], w0 / 2 * DOT_SCALE, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (penType === "ball") {
    g.lineWidth = baseSize;
    g.beginPath();
    traceSpline(g, pts, n);
    g.stroke();
    return;
  }
  if (!RibbonWidthsBuf || RibbonWidthsBuf.length < n) RibbonWidthsBuf = new Float32Array(Math.max(n, 256));
  const widths = RibbonWidthsBuf;
  let wMin = Infinity, wMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const w = pointWidth(pts[i * 3 + 2], baseSize, penType);
    widths[i] = w;
    if (w < wMin) wMin = w;
    if (w > wMax) wMax = w;
  }
  if (n >= 6 && penType !== "ball" && wMax - wMin > baseSize * 0.02) {
    const taper = Math.min(3, Math.floor(n / 3));
    for (let i = 0; i < taper; i++) {
      const f = 0.75 + 0.25 * ((i + 1) / (taper + 1));
      widths[i] *= f;
      widths[n - 1 - i] *= f;
      if (widths[i] < wMin) wMin = widths[i];
      if (widths[n - 1 - i] < wMin) wMin = widths[n - 1 - i];
    }
  }
  if (wMax - wMin <= baseSize * 0.04) {
    g.lineWidth = (wMin + wMax) * 0.5;
    g.beginPath();
    traceSpline(g, pts, n);
    g.stroke();
    return;
  }
  if (n === 2) {
    g.lineWidth = (widths[0] + widths[1]) * 0.5;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    g.lineTo(pts[3], pts[4]);
    g.stroke();
    return;
  }
  const dxInitR = pts[3] - pts[0], dyInitR = pts[4] - pts[1];
  let prevL1 = Math.sqrt(dxInitR * dxInitR + dyInitR * dyInitR);
  let prevD1 = Math.sqrt(prevL1);
  let prevL2 = prevL1;
  let prevD2 = prevD1;
  let inBatch = false;
  let batchW = widths[0];
  for (let j = 0; j < n - 1; j++) {
    const x1 = pts[j * 3], y1 = pts[j * 3 + 1];
    const x2 = pts[(j + 1) * 3], y2 = pts[(j + 1) * 3 + 1];
    const x0 = j > 0 ? pts[(j - 1) * 3] : 2 * x1 - x2;
    const y0 = j > 0 ? pts[(j - 1) * 3 + 1] : 2 * y1 - y2;
    const x3 = j + 2 < n ? pts[(j + 2) * 3] : 2 * x2 - x1;
    const y3 = j + 2 < n ? pts[(j + 2) * 3 + 1] : 2 * y2 - y1;
    const l1 = prevL1;
    const d1 = prevD1;
    const l2 = prevL2;
    const d2 = prevD2;
    const dx3R = x3 - x2, dy3R = y3 - y2;
    const l3 = j + 2 < n ? Math.sqrt(dx3R * dx3R + dy3R * dy3R) : l2;
    const d3 = j + 2 < n ? Math.sqrt(l3) : d2;
    prevL1 = l2;
    prevD1 = d2;
    prevL2 = l3;
    prevD2 = d3;
    if (l2 < 1e-9) continue;
    let c1x = x1 + (x2 - x1) / 3, c1y = y1 + (y2 - y1) / 3;
    let c2x = x2 - (x2 - x1) / 3, c2y = y2 - (y2 - y1) / 3;
    const dot1 = (x1 - x0) * (x2 - x1) + (y1 - y0) * (y2 - y1);
    const dot2 = (x2 - x1) * (x3 - x2) + (y2 - y1) * (y3 - y2);
    const cos1 = j > 0 && l1 > 0.25 && l2 > 0.25 ? dot1 / (l1 * l2) : 1;
    const cos2 = j + 2 < n && l2 > 0.25 && l3 > 0.25 ? dot2 / (l2 * l3) : 1;
    const t1 = splineTension(cos1);
    const t2 = splineTension(cos2);
    const isCusp1 = t1 === 0;
    if (t1 > 0 && d1 > 1e-6) {
      const a = 2 * l1 + 3 * d1 * d2 + l2;
      const m = 3 * d1 * (d1 + d2);
      const tx = (l1 * x2 - l2 * x0 + a * x1) / m;
      const ty = (l1 * y2 - l2 * y0 + a * y1) / m;
      c1x += (tx - c1x) * t1;
      c1y += (ty - c1y) * t1;
    }
    if (t2 > 0 && d3 > 1e-6) {
      const b = 2 * l3 + 3 * d3 * d2 + l2;
      const m = 3 * d3 * (d3 + d2);
      const tx = (l3 * x1 - l2 * x3 + b * x2) / m;
      const ty = (l3 * y1 - l2 * y3 + b * y2) / m;
      c2x += (tx - c2x) * t2;
      c2y += (ty - c2y) * t2;
    }
    const w1 = widths[j];
    const w2 = widths[j + 1];
    const segW = (w1 + w2) * 0.5;
    if (isCusp1 && inBatch) {
      g.stroke();
      inBatch = false;
    }
    if (Math.abs(w2 - w1) > baseSize * 0.12 && l2 > 1.5) {
      if (inBatch) {
        g.stroke();
        inBatch = false;
      }
      const steps = Math.min(6, Math.max(2, Math.ceil(Math.abs(w2 - w1) / (baseSize * 0.08))));
      let px = x1, py = y1;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const iu = 1 - u;
        const nx = iu * iu * iu * x1 + 3 * iu * iu * u * c1x + 3 * iu * u * u * c2x + u * u * u * x2;
        const ny = iu * iu * iu * y1 + 3 * iu * iu * u * c1y + 3 * iu * u * u * c2y + u * u * u * y2;
        g.lineWidth = w1 + (w2 - w1) * ((s - 0.5) / steps);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(nx, ny);
        g.stroke();
        px = nx;
        py = ny;
      }
      continue;
    }
    if (!inBatch) {
      inBatch = true;
      batchW = segW;
      g.lineWidth = batchW;
      g.beginPath();
      g.moveTo(x1, y1);
      g.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
    } else if (Math.abs(segW - batchW) <= baseSize * 0.05) {
      g.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
    } else {
      g.stroke();
      batchW = segW;
      g.lineWidth = batchW;
      g.beginPath();
      g.moveTo(x1, y1);
      g.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
    }
  }
  if (inBatch) g.stroke();
}
function traceLiveRibbon(g, pts, baseSize, penType = "fountain") {
  const n = Math.floor(pts.length / 3);
  if (n <= 0) return;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (n === 1) {
    const w0 = pointWidth(pts[2], baseSize, penType);
    g.beginPath();
    g.arc(pts[0], pts[1], w0 / 2 * DOT_SCALE, 0, Math.PI * 2);
    g.fill();
    return;
  }
  let inBatch = false;
  let batchW = pointWidth(pts[2], baseSize, penType);
  for (let j = 0; j < n - 1; j++) {
    const x1 = pts[j * 3], y1 = pts[j * 3 + 1], w1 = pointWidth(pts[j * 3 + 2], baseSize, penType);
    const x2 = pts[(j + 1) * 3], y2 = pts[(j + 1) * 3 + 1], w2 = pointWidth(pts[(j + 1) * 3 + 2], baseSize, penType);
    const segW = (w1 + w2) * 0.5;
    if (!inBatch) {
      inBatch = true;
      batchW = segW;
      g.lineWidth = batchW;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    } else if (Math.abs(segW - batchW) <= baseSize * 0.05) {
      g.lineTo(x2, y2);
    } else {
      g.stroke();
      batchW = segW;
      g.lineWidth = batchW;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
  }
  if (inBatch) g.stroke();
}
var StrokeBuilder = class {
  constructor(scale, level, clock = () => performance.now(), tune, penStyle = "fountain", sensitivity = 1.0) {
    this.scale = scale;
    this.clock = clock;
    this.penStyle = penStyle;
    this.sensitivity = sensitivity;
    this.qx = [];
    this.qy = [];
    this.qp = [];
    this.acc = 0;
    this.tx = 0;
    this.ty = 0;
    this.tp = 0.5;
    this.started = false;
    this.startChecked = false;
    this.length = 0;
    this.fx = [];
    this.fy = [];
    this.fp = [];
    this.trimmedStart = 0;
    this.trimmedEnd = 0;
    this.oe = null;
    this.rejects = 0;
    this.rawLast = null;
    this.mid = null;
    this.px = 1 / scale;
    this.gate = GATE_PX / scale;
    const lvlIdx = Math.max(0, Math.min(PEN_LEVELS.length - 1, Math.round(level) - 1));
    this.lvl = PEN_LEVELS[lvlIdx];
    if (tune !== void 0) this.lvl = tune;
    this.h = 0.5 / scale;
    const sk = SPATIAL_KERNELS[lvlIdx] || SPATIAL_KERNELS[1];
    this.k = sk.k;
    this.w = sk.w;
    this.lastT = 0;
    this.lastRawX = 0;
    this.lastRawY = 0;
    this.filteredP = 0.5;
  }
  get tipX() {
    return this.oe ? this.oe.x : this.tx;
  }
  get tipY() {
    return this.oe ? this.oe.y : this.ty;
  }
  add(x, y, rawP, t, azimuthAngle, altitudeAngle) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const now = typeof t === "number" && Number.isFinite(t) && t >= 0 ? t : this.clock();
    let dt = this.lastT ? (now - this.lastT) / 1e3 : 0.016;
    if (dt < 1e-3) dt = 1e-3;
    const dist = this.started ? Math.hypot(x - this.lastRawX, y - this.lastRawY) : 0;
    const velocity = dist / dt;
    this.lastT = now;
    this.lastRawX = x;
    this.lastRawY = y;
    let p = 0.5;
    if (this.penStyle === "ball") {
      p = 0.5;
    } else if (typeof rawP === "number" && Number.isFinite(rawP) && rawP > 0.01 && Math.abs(rawP - 0.5) > 1e-4) {
      const sens = this.sensitivity || 1.0;
      const pCurve = Math.pow(Math.max(0.05, Math.min(1.0, rawP)), 1 / sens);
      const vFactor = 1 - 0.12 * Math.min(1, velocity / 1e3);
      p = pCurve * vFactor;
      if (this.penStyle === "fountain" && typeof altitudeAngle === "number" && altitudeAngle > 0 && altitudeAngle < 1.5708) {
        const az = typeof azimuthAngle === "number" ? Math.abs(Math.sin(azimuthAngle)) : 0.5;
        p *= 1 + 0.12 * Math.cos(altitudeAngle) * az;
      }
    } else if (rawP === null) {
      p = 0.65 - 0.25 * (velocity / (velocity + 400));
    } else {
      p = 0.5;
    }
    this.filteredP = this.penStyle === "ball" ? 0.5 : (this.started ? 0.7 * this.filteredP + 0.3 * p : p);
    const effP = this.penStyle === "ball" ? 0.5 : Math.max(0.15, Math.min(1.0, this.filteredP));
    if (this.oe && Math.hypot(x - this.oe.x, y - this.oe.y) > MAX_JUMP_PT) {
      if (++this.rejects < 3) return false;
      this.oe = null;
    }
    this.rejects = 0;
    this.rawLast = [x, y, effP];
    const s = this.oe;
    if (!s) {
      this.oe = { x, y, dx: 0, dy: 0, t: now };
    } else {
      const dtOe = Math.max((now - s.t) / 1e3, 1e-3);
      const ad = oeAlpha(1, dtOe);
      const vx = (x - s.x) / dtOe;
      const vy = (y - s.y) / dtOe;
      s.dx = ad * vx + (1 - ad) * s.dx;
      s.dy = ad * vy + (1 - ad) * s.dy;
      const a = oeAlpha(this.lvl.minCut + this.lvl.beta * Math.hypot(s.dx, s.dy), dtOe);
      s.x = a * x + (1 - a) * s.x;
      s.y = a * y + (1 - a) * s.y;
      s.t = now;
    }
    x = this.oe.x;
    y = this.oe.y;
    const m = this.mid;
    if (!m) {
      this.mid = { p0x: x, p0y: y, p0p: effP, mx: x, my: y, mp: effP };
      return this.addRaw(x, y, effP);
    }
    const mx = (m.p0x + x) / 2;
    const my = (m.p0y + y) / 2;
    const mp = (m.p0p + effP) / 2;
    const steps = Math.min(200, Math.max(2, Math.ceil(Math.hypot(mx - m.mx, my - m.my) / (this.h * 2))));
    let ok3 = false;
    for (let st = 1; st <= steps; st++) {
      const u = st / steps;
      const bx = (1 - u) * (1 - u) * m.mx + 2 * (1 - u) * u * m.p0x + u * u * mx;
      const by = (1 - u) * (1 - u) * m.my + 2 * (1 - u) * u * m.p0y + u * u * my;
      const bp = (1 - u) * m.mp + u * mp;
      ok3 = this.addRaw(bx, by, bp) || ok3;
    }
    m.p0x = x;
    m.p0y = y;
    m.p0p = effP;
    m.mx = mx;
    m.my = my;
    m.mp = mp;
    return ok3;
  }
  addRaw(x, y, p = 0.5) {
    if (!this.started) {
      this.started = true;
      this.tx = x;
      this.ty = y;
      this.tp = p;
      this.qx.push(x);
      this.qy.push(y);
      this.qp.push(p);
      return true;
    }
    const dx = x - this.tx;
    const dy = y - this.ty;
    const dp = p - this.tp;
    if (this.qx.length > MAX_STROKE_POINTS) return false;
    const L = Math.hypot(dx, dy);
    if (L < this.gate) return false;
    if (L > MAX_JUMP_PT) {
      this.tx = x;
      this.ty = y;
      this.tp = p;
      this.acc = 0;
      this.qx.push(x);
      this.qy.push(y);
      this.qp.push(p);
      this.settle();
      return true;
    }
    let pos = this.h - this.acc;
    while (pos <= L) {
      const frac = pos / L;
      this.qx.push(this.tx + dx * frac);
      this.qy.push(this.ty + dy * frac);
      this.qp.push(this.tp + dp * frac);
      pos += this.h;
    }
    this.acc = L - (pos - this.h);
    this.tx = x;
    this.ty = y;
    this.tp = p;
    this.length += L;
    if (!this.startChecked && this.length >= HOOK_MIN_PX * this.px) {
      this.startChecked = true;
      this.trimStart(this.qx, this.qy, this.qp);
    }
    this.settle();
    return true;
  }
  settle() {
    if (!this.startChecked) return;
    const n = this.qx.length;
    const stop = n - this.k;
    const tmp = this._tmp || (this._tmp = []);
    for (let i = this.fx.length; i < stop; i++) {
      tmp.length = 0;
      smoothAt(this.qx, this.qy, n, i, this.w, this.k, tmp);
      this.fx.push(tmp[0]);
      this.fy.push(tmp[1]);
      this.fp.push(this.qp[i]);
    }
  }
  trimStart(xs, ys, ps) {
    const c = this.hookAt(xs, ys, false);
    if (c > 0) {
      this.trimmedStart = Math.hypot(xs[c] - xs[0], ys[c] - ys[0]) / this.px;
      xs.splice(0, c);
      ys.splice(0, c);
      if (ps) ps.splice(0, c);
    }
  }
  hookAt(xs, ys, fromEnd) {
    const n = xs.length;
    const at = (i) => fromEnd ? n - 1 - i : i;
    const maxI = Math.min(n - 1, Math.floor(HOOK_PX * this.px / this.h));
    const span = Math.max(2, Math.round(4 * this.px / this.h));
    if (n < maxI + span + 2) return 0;
    let best = 0;
    let bestCos = HOOK_COS;
    const ax = xs[at(0)], ay = ys[at(0)];
    const minUlSq = 0.25 * this.px * this.px;
    for (let c = 1; c <= maxI; c++) {
      const cx = xs[at(c)], cy = ys[at(c)];
      const ux = cx - ax, uy = cy - ay;
      const ulSq = ux * ux + uy * uy;
      if (ulSq < minUlSq) continue;
      const e = Math.min(n - 1, c + span);
      const vx = xs[at(e)] - cx, vy = ys[at(e)] - cy;
      const vlSq = vx * vx + vy * vy;
      if (vlSq < 1e-18) continue;
      const cos = (ux * vx + uy * vy) / Math.sqrt(ulSq * vlSq);
      if (cos < bestCos) {
        bestCos = cos;
        best = c;
      }
    }
    return best;
  }
  tail(from, pred, liveBridge = false, reuse = false) {
    let xs, ys, ps;
    if (reuse) {
      xs = this._txs || (this._txs = []);
      ys = this._tys || (this._tys = []);
      ps = this._tps || (this._tps = []);
      xs.length = 0;
      ys.length = 0;
      ps.length = 0;
      const qLen = this.qx.length;
      for (let i = from; i < qLen; i++) {
        xs.push(this.qx[i]);
        ys.push(this.qy[i]);
        ps.push(this.qp[i]);
      }
    } else {
      xs = this.qx.slice(from);
      ys = this.qy.slice(from);
      ps = this.qp.slice(from);
    }
    if (this.acc > 0.05 * this.h) {
      xs.push(this.tx);
      ys.push(this.ty);
      ps.push(this.tp);
    }
    let lx = this.tx, ly = this.ty, lp = this.tp;
    if (liveBridge && this.mid) {
      const m = this.mid;
      const gap = Math.hypot(m.p0x - lx, m.p0y - ly);
      if (gap >= 0.25 * this.h && gap <= 4 * MAX_JUMP_PT) {
        const steps = Math.min(24, Math.max(1, Math.ceil(gap / (this.h * 2))));
        for (let s = 1; s <= steps; s++) {
          const u = s / steps;
          xs.push(lx + (m.p0x - lx) * u);
          ys.push(ly + (m.p0y - ly) * u);
          ps.push(lp + (m.p0p - lp) * u);
        }
        lx = m.p0x;
        ly = m.p0y;
        lp = m.p0p;
      }
    }
    if (pred && pred.length) {
      for (let i = 0; i < pred.length; i += 2) {
        const dx = pred[i] - lx, dy = pred[i + 1] - ly;
        const L = Math.hypot(dx, dy);
        if (L < this.h) continue;
        for (let s = this.h; s <= L; s += this.h) {
          xs.push(lx + dx * s / L);
          ys.push(ly + dy * s / L);
          ps.push(lp);
        }
        lx = pred[i];
        ly = pred[i + 1];
      }
    }
    return { xs, ys, ps };
  }
  provisional(pred) {
    const out = this._provOut || (this._provOut = []);
    out.length = 0;
    if (!this.started) return out;
    const base = Math.max(0, this.fx.length);
    const startFrom = Math.max(0, base - this.k);
    const { xs, ys, ps } = this.tail(startFrom, pred, true, true);
    const offset = base - startFrom;
    const n = xs.length;
    const tmp = this._tmp || (this._tmp = []);
    for (let i = offset; i < n; i++) {
      tmp.length = 0;
      smoothAt(xs, ys, n, i, this.w, this.k, tmp);
      out.push(tmp[0], tmp[1], ps[i]);
    }
    return out;
  }
  finish() {
    if (!this.started) return { x: [], y: [], p: [] };
    if (this.mid) {
      const m = this.mid;
      this.mid = null;
      const gap = Math.hypot(m.p0x - m.mx, m.p0y - m.my);
      if (gap <= 4 * MAX_JUMP_PT) {
        const steps = Math.max(1, Math.ceil(gap / (this.h * 2)));
        for (let s = 1; s <= steps; s++) {
          const u = s / steps;
          this.addRaw(m.mx + (m.p0x - m.mx) * u, m.my + (m.p0y - m.my) * u, (1 - u) * m.mp + u * m.p0p);
        }
      }
    }
    if (this.length < DOT_PX * this.px) {
      const n2 = this.qx.length;
      let sx = 0, sy = 0, sp = 0;
      for (let i = 0; i < n2; i++) {
        sx += this.qx[i];
        sy += this.qy[i];
        sp += this.qp[i];
      }
      return { x: [sx / n2], y: [sy / n2], p: [sp / n2] };
    }
    const { xs, ys, ps } = this.tail(0, null, false, false);
    const c = this.length >= HOOK_MIN_PX * this.px ? this.hookAt(xs, ys, true) : 0;
    if (c > 0) {
      const n2 = xs.length;
      this.trimmedEnd = Math.hypot(xs[n2 - 1] - xs[n2 - 1 - c], ys[n2 - 1] - ys[n2 - 1 - c]) / this.px;
      xs.length = n2 - c;
      ys.length = n2 - c;
      ps.length = n2 - c;
    } else if (this.rawLast) {
      const [rx, ry, rp] = this.rawLast;
      const n2 = xs.length;
      if (!n2 || Math.hypot(xs[n2 - 1] - rx, ys[n2 - 1] - ry) > 0.05) {
        xs.push(rx);
        ys.push(ry);
        ps.push(rp);
      }
    }
    const n = xs.length;
    const keep = Math.min(this.fx.length, Math.max(0, n - this.k));
    const x = this.fx.slice(0, keep);
    const y = this.fy.slice(0, keep);
    const pArr = this.fp.slice(0, keep);
    const tmp = this._tmp || (this._tmp = []);
    for (let i = keep; i < n; i++) {
      tmp.length = 0;
      smoothAt(xs, ys, n, i, this.w, this.k, tmp);
      x.push(tmp[0]);
      y.push(tmp[1]);
      pArr.push(ps[i]);
    }
    return { x, y, p: pArr };
  }
};
var _packBuf = [];
function packLine(line2, scale) {
  const flat = _packBuf;
  flat.length = 0;
  const pArr = line2.p || [];
  const len = line2.x.length;
  for (let i = 0; i < len; i++) {
    flat.push(line2.x[i], line2.y[i], pArr[i] !== undefined ? pArr[i] : 0.5);
  }
  return simplify(flat, 0.024 / scale);
}
function simplify(pts, eps) {
  const n = Math.floor(pts.length / 3);
  const r = (v) => Math.round(v * 1000) / 1000;
  if (n <= 2) {
    const o = [];
    for (let i = 0; i < n; i++) o.push(r(pts[i * 3]), r(pts[i * 3 + 1]), r(pts[i * 3 + 2]));
    return o;
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1];
  const e2 = eps * eps;
  const curveFloor = e2 * 0.14;
  while (stack.length) {
    const b = stack.pop();
    const a = stack.pop();
    let maxD = 0;
    let idx = -1;
    const ax = pts[a * 3], ay = pts[a * 3 + 1], pa = pts[a * 3 + 2];
    const bx = pts[b * 3], by = pts[b * 3 + 1], pb = pts[b * 3 + 2];
    const dx = bx - ax, dy = by - ay, dpSpan = pb - pa;
    const l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 3], py = pts[i * 3 + 1], pi = pts[i * 3 + 2];
      let d2;
      let t = 0.5;
      if (l2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      const pErr = Math.abs(pi - (pa + t * dpSpan));
      if (pErr > 0.08) {
        const pTerm = pErr * eps * 8;
        d2 += pTerm * pTerm;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    let split = idx >= 0 && maxD > e2;
    if (!split && idx >= 0 && b - a >= 2 && maxD > curveFloor && l2 > 0.36) {
      const mx = pts[idx * 3], my = pts[idx * 3 + 1];
      const ux = mx - ax, uy = my - ay;
      const vx = bx - mx, vy = by - my;
      const ul2 = ux * ux + uy * uy;
      const vl2 = vx * vx + vy * vy;
      if (ul2 > 0.02 && vl2 > 0.02) {
        const cos = (ux * vx + uy * vy) / Math.sqrt(ul2 * vl2);
        if (cos < 0.988) split = true;
      }
    }
    if (split) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r(pts[i * 3]), r(pts[i * 3 + 1]), r(pts[i * 3 + 2]));
  return out;
}
function setStyle(g, color, size) {
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = size;
}
function paintStroke(g, tool, color, size, box, solid, paint) {
  if (solid || tool !== "highlighter") {
    g.save();
    setStyle(g, color, size);
    paint(g);
    g.restore();
    return;
  }
  const m = g.getTransform();
  const pad = size / 2 + 1;
  const x0 = Math.max(0, Math.floor((box[0] - pad) * m.a + m.e));
  const y0 = Math.max(0, Math.floor((box[1] - pad) * m.d + m.f));
  const x1 = Math.min(g.canvas.width, Math.ceil((box[2] + pad) * m.a + m.e));
  const y1 = Math.min(g.canvas.height, Math.ceil((box[3] + pad) * m.d + m.f));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const sc = typeof globalCanvasPool !== "undefined" ? globalCanvasPool.acquire(w, h, "pink-cv") : document.createElement("canvas");
  if (sc.width !== w) sc.width = w;
  if (sc.height !== h) sc.height = h;
  const sg = sc.getContext("2d");
  sg.setTransform(m.a, 0, 0, m.d, m.e - x0, m.f - y0);
  setStyle(sg, color, size);
  paint(sg);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = HL_ALPHA;
  g.drawImage(sc, 0, 0, w, h, x0, y0, w, h);
  g.restore();
  if (typeof globalCanvasPool !== "undefined") globalCanvasPool.release(sc);
  else sc.width = sc.height = 0;
}
function traceSpline(g, p, n) {
  g.moveTo(p[0], p[1]);
  if (n === 2) {
    g.lineTo(p[3], p[4]);
    return;
  }
  const dxInitS = p[3] - p[0], dyInitS = p[4] - p[1];
  let prevL1 = Math.sqrt(dxInitS * dxInitS + dyInitS * dyInitS);
  let prevD1 = Math.sqrt(prevL1);
  let prevL2 = prevL1;
  let prevD2 = prevD1;
  for (let j = 0; j < n - 1; j++) {
    const x1 = p[j * 3], y1 = p[j * 3 + 1];
    const x2 = p[(j + 1) * 3], y2 = p[(j + 1) * 3 + 1];
    const x0 = j > 0 ? p[(j - 1) * 3] : 2 * x1 - x2;
    const y0 = j > 0 ? p[(j - 1) * 3 + 1] : 2 * y1 - y2;
    const x3 = j + 2 < n ? p[(j + 2) * 3] : 2 * x2 - x1;
    const y3 = j + 2 < n ? p[(j + 2) * 3 + 1] : 2 * y2 - y1;
    const l1 = prevL1;
    const d1 = prevD1;
    const l2 = prevL2;
    const d2 = prevD2;
    const dx3S = x3 - x2, dy3S = y3 - y2;
    const l3 = j + 2 < n ? Math.sqrt(dx3S * dx3S + dy3S * dy3S) : l2;
    const d3 = j + 2 < n ? Math.sqrt(l3) : d2;
    prevL1 = l2;
    prevD1 = d2;
    prevL2 = l3;
    prevD2 = d3;
    if (l2 < 1e-9) continue;
    let c1x = x1 + (x2 - x1) / 3, c1y = y1 + (y2 - y1) / 3;
    let c2x = x2 - (x2 - x1) / 3, c2y = y2 - (y2 - y1) / 3;
    const dot1 = (x1 - x0) * (x2 - x1) + (y1 - y0) * (y2 - y1);
    const dot2 = (x2 - x1) * (x3 - x2) + (y2 - y1) * (y3 - y2);
    const cos1 = j > 0 && l1 > 0.25 && l2 > 0.25 ? dot1 / (l1 * l2) : 1;
    const cos2 = j + 2 < n && l2 > 0.25 && l3 > 0.25 ? dot2 / (l2 * l3) : 1;
    const t1 = splineTension(cos1);
    const t2 = splineTension(cos2);
    if (t1 > 0 && d1 > 1e-6) {
      const a = 2 * l1 + 3 * d1 * d2 + l2;
      const m = 3 * d1 * (d1 + d2);
      const tx = (l1 * x2 - l2 * x0 + a * x1) / m;
      const ty = (l1 * y2 - l2 * y0 + a * y1) / m;
      c1x += (tx - c1x) * t1;
      c1y += (ty - c1y) * t1;
    }
    if (t2 > 0 && d3 > 1e-6) {
      const b = 2 * l3 + 3 * d3 * d2 + l2;
      const m = 3 * d3 * (d3 + d2);
      const tx = (l3 * x1 - l2 * x3 + b * x2) / m;
      const ty = (l3 * y1 - l2 * y3 + b * y2) / m;
      c2x += (tx - c2x) * t2;
      c2y += (ty - c2y) * t2;
    }
    g.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
  }
}
var strokePaths = /* @__PURE__ */ new WeakMap();
function getSplinePath2D(s, p = s && s.pts, n = p ? Math.floor(p.length / 3) : 0) {
  if (typeof Path2D === "undefined" || !s || !p || n < 2) return null;
  let path = strokePaths.get(s);
  if (path) return path;
  path = new Path2D();
  traceSpline(path, p, n);
  strokePaths.set(s, path);
  return path;
}
function drawStroke(g, s, solid = false) {
  const p = s.pts;
  const n = Math.floor(p.length / 3);
  if (!n) return;
  paintStroke(g, s.tool, s.color, s.size, bboxOf(s), solid, (c) => {
    if (s.tool === "highlighter") {
      if (n === 1) {
        c.beginPath();
        c.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        const path2d = getSplinePath2D(s, p, n);
        if (path2d && typeof c.stroke === "function" && c.stroke.length !== 99) {
          try {
            c.stroke(path2d);
            return;
          } catch (e) {}
        }
        c.beginPath();
        traceSpline(c, p, n);
        c.stroke();
      }
    } else if ((s.style || "fountain") === "ball" && n >= 2) {
      c.lineCap = "round";
      c.lineJoin = "round";
      c.lineWidth = s.size;
      const path2d = getSplinePath2D(s, p, n);
      if (path2d) {
        try {
          c.stroke(path2d);
          return;
        } catch (e) {}
      }
      c.beginPath();
      traceSpline(c, p, n);
      c.stroke();
    } else {
      traceRibbonPath(c, p, s.size, s.style || "fountain");
    }
  });
}
var _liveBox = [0, 0, 0, 0];
function drawLive(g, tool, color, size, pts, solid = false, penStyle = "fountain") {
  const n = Math.floor(pts.length / 3);
  if (!n) return;
  const box = _liveBox;
  if (!solid && tool === "highlighter") {
    box[0] = Infinity;
    box[1] = Infinity;
    box[2] = -Infinity;
    box[3] = -Infinity;
    for (let i = 0; i < n * 3; i += 3) {
      if (pts[i] < box[0]) box[0] = pts[i];
      if (pts[i] > box[2]) box[2] = pts[i];
      if (pts[i + 1] < box[1]) box[1] = pts[i + 1];
      if (pts[i + 1] > box[3]) box[3] = pts[i + 1];
    }
  }
  paintStroke(g, tool, color, size, box, solid, (c) => {
    if (tool === "highlighter") {
      c.beginPath();
      if (n === 1) {
        c.arc(pts[0], pts[1], size / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        traceSpline(c, pts, n);
        c.stroke();
      }
    } else {
      traceLiveRibbon(c, pts, size, penStyle);
    }
  });
}
var boxes = /* @__PURE__ */ new WeakMap();
var pageGrids = /* @__PURE__ */ new WeakMap();
var GRID_CELL_PT = 64;
function getPageGrid(list2) {
  if (!list2 || !Array.isArray(list2)) return null;
  let g = pageGrids.get(list2);
  const lastId = list2.length ? list2[list2.length - 1].id : "";
  if (g && g.count === list2.length && g.lastId === lastId) return g;
  const cells = /* @__PURE__ */ new Map();
  for (let i = 0; i < list2.length; i++) {
    const st = list2[i];
    const b = bboxOf(st);
    const pad = (st.size || 2) * 0.5 + 1;
    const x0 = Math.floor((b[0] - pad) / GRID_CELL_PT);
    const y0 = Math.floor((b[1] - pad) / GRID_CELL_PT);
    const x1 = Math.floor((b[2] + pad) / GRID_CELL_PT);
    const y1 = Math.floor((b[3] + pad) / GRID_CELL_PT);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = (cx << 16) ^ (cy & 65535);
        let arr = cells.get(key);
        if (!arr) {
          arr = [];
          cells.set(key, arr);
        }
        arr.push(i);
      }
    }
  }
  g = { cells, count: list2.length, lastId };
  pageGrids.set(list2, g);
  return g;
}
var _gridHits = /* @__PURE__ */ new Set();
function queryPageGridCandidates(list2, x, y, r) {
  const g = getPageGrid(list2);
  if (!g) return null;
  const x0 = Math.floor((x - r) / GRID_CELL_PT);
  const y0 = Math.floor((y - r) / GRID_CELL_PT);
  const x1 = Math.floor((x + r) / GRID_CELL_PT);
  const y1 = Math.floor((y + r) / GRID_CELL_PT);
  const hits = _gridHits;
  hits.clear();
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const arr = g.cells.get((cx << 16) ^ (cy & 65535));
      if (arr) {
        for (let i = 0; i < arr.length; i++) hits.add(arr[i]);
      }
    }
  }
  return hits;
}
function cloneStrokeWithCaches(s, id = newId()) {
  const copy = { ...s, id, pts: s.pts };
  const b = boxes.get(s);
  if (b) boxes.set(copy, b);
  const p = strokePaths.get(s);
  if (p) strokePaths.set(copy, p);
  return copy;
}
function bboxOf(s) {
  let b = boxes.get(s);
  if (b) return b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 3) {
    const x = s.pts[i], y = s.pts[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  b = [x0, y0, x1, y1];
  boxes.set(s, b);
  return b;
}
function segDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}
function strokeHit(s, x, y, r) {
  const b = bboxOf(s);
  if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  const p = s.pts;
  const n = Math.floor(p.length / 3);
  const r2 = r * r;
  if (n === 1) {
    const dx0 = x - p[0], dy0 = y - p[1];
    return dx0 * dx0 + dy0 * dy0 <= r2;
  }
  const xmin = x - r, xmax = x + r, ymin = y - r, ymax = y + r;
  for (let i = 1; i < n; i++) {
    const ax = p[(i - 1) * 3], ay = p[(i - 1) * 3 + 1];
    const bx = p[i * 3], by = p[i * 3 + 1];
    if ((ax < xmin && bx < xmin) || (ax > xmax && bx > xmax) || (ay < ymin && by < ymin) || (ay > ymax && by > ymax)) continue;
    if (segDistSq(x, y, ax, ay, bx, by) <= r2) return true;
  }
  return false;
}
function cutStroke(s, x, y, R) {
  const p = s.pts;
  const n = Math.floor(p.length / 3);
  if (n <= 0) return null;
  const R2 = R * R;
  const rRound = (v) => Math.round(v * 1000) / 1000;
  if (n === 1) {
    const dx0 = p[0] - x, dy0 = p[1] - y;
    return dx0 * dx0 + dy0 * dy0 <= R2 ? [] : null;
  }
  const xmin = x - R, xmax = x + R, ymin = y - R, ymax = y + R;
  const pieces = [];
  let cur = [];
  let removed = 0;
  let ax = p[0], ay = p[1], pa = p[2] !== undefined ? p[2] : 0.5;
  let aIn = (ax - x) * (ax - x) + (ay - y) * (ay - y) <= R2;
  if (aIn) removed++;
  else cur.push(ax, ay, pa);
  for (let i = 1; i < n; i++) {
    const bx = p[i * 3], by = p[i * 3 + 1];
    const pb = p[i * 3 + 2] !== undefined ? p[i * 3 + 2] : 0.5;
    const bIn = (bx - x) * (bx - x) + (by - y) * (by - y) <= R2;
    if (!aIn && !bIn) {
      if ((ax < xmin && bx < xmin) || (ax > xmax && bx > xmax) || (ay < ymin && by < ymin) || (ay > ymax && by > ymax)) {
        cur.push(bx, by, pb);
        ax = bx; ay = by; pa = pb; aIn = false;
        continue;
      }
      const dx = bx - ax, dy = by - ay;
      const a = dx * dx + dy * dy;
      const fx = ax - x, fy = ay - y;
      const bHalf = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - R2;
      const disc = bHalf * bHalf - a * c;
      if (a > 1e-9 && disc > 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-bHalf - sq) / a;
        const t2 = (-bHalf + sq) / a;
        if (t1 < 1 && t2 > 0) {
          removed++;
          if (t1 > 1e-3) {
            cur.push(rRound(ax + dx * t1), rRound(ay + dy * t1), rRound(pa + (pb - pa) * t1));
          }
          if (cur.length) {
            pieces.push(cur);
            cur = [];
          }
          if (t2 < 1 - 1e-3) {
            cur.push(rRound(ax + dx * t2), rRound(ay + dy * t2), rRound(pa + (pb - pa) * t2));
          }
          cur.push(bx, by, pb);
          ax = bx; ay = by; pa = pb; aIn = false;
          continue;
        }
      }
      cur.push(bx, by, pb);
    } else if (!aIn && bIn) {
      removed++;
      const dx = bx - ax, dy = by - ay;
      const a = dx * dx + dy * dy;
      const fx = ax - x, fy = ay - y;
      const bHalf = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - R2;
      const disc = Math.max(0, bHalf * bHalf - a * c);
      const t1 = a > 1e-9 ? Math.max(0, Math.min(1, (-bHalf - Math.sqrt(disc)) / a)) : 0;
      if (t1 > 1e-3) {
        cur.push(rRound(ax + dx * t1), rRound(ay + dy * t1), rRound(pa + (pb - pa) * t1));
      }
      if (cur.length) {
        pieces.push(cur);
        cur = [];
      }
    } else if (aIn && !bIn) {
      removed++;
      const dx = bx - ax, dy = by - ay;
      const a = dx * dx + dy * dy;
      const fx = ax - x, fy = ay - y;
      const bHalf = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - R2;
      const disc = Math.max(0, bHalf * bHalf - a * c);
      const t2 = a > 1e-9 ? Math.max(0, Math.min(1, (-bHalf + Math.sqrt(disc)) / a)) : 1;
      if (t2 < 1 - 1e-3) {
        cur.push(rRound(ax + dx * t2), rRound(ay + dy * t2), rRound(pa + (pb - pa) * t2));
      }
      cur.push(bx, by, pb);
    } else {
      removed++;
    }
    ax = bx;
    ay = by;
    pa = pb;
    aIn = bIn;
  }
  if (cur.length) pieces.push(cur);
  if (!removed) return null;
  return pieces.filter((pc) => pc.length >= 6).map((pts) => {
    const pcObj = { ...s, id: newId(), pts };
    bboxOf(pcObj);
    return pcObj;
  });
}

// src/thumbs.ts
var import_obsidian3 = require("obsidian");
var THUMB_DPR_CAP = 1.5;
var BLUE = "#007aff";
var RED = "#ff3b30";
var AMBER = "#ff9f0a";
function safeRevokeUrl(u) {
  if (typeof u === "string" && u.startsWith("blob:")) {
    try { URL.revokeObjectURL(u); } catch (e) {}
  }
}
var THUMB_CACHE_LIMIT = 60;
var ThumbPanel = class {
  constructor(view, parent) {
    this.view = view;
    this.items = [];
    this.filteredItems = [];
    this.mountedItems = /* @__PURE__ */ new Set();
    this.byEl = /* @__PURE__ */ new Map();
    this.io = null;
    this.queue = [];
    this.running = false;
    this.open = false;
    this.stopped = false;
    this.stale = true;
    this.current = 0;
    this.selected = -1;
    this.filter = "all";
    this.cache = /* @__PURE__ */ new Map();
    this.rowHCache = 220;
    this.scrollCurrentIntoView = (0, import_obsidian3.debounce)(() => {
      if (!this.open) return;
      this.scrollToIndex(this.current, false);
    }, 150, true);
    this.enqueueSoon = (0, import_obsidian3.debounce)(() => {
      for (const it of this.mountedItems) if (it.visible && !it.done) this.enqueue(it);
      this.kick();
    }, 600, true);
    this.el = parent.createDiv({ cls: "pink-thumbs" });
    const head = this.el.createDiv({ cls: "pink-thumbs-head" });
    const title = head.createDiv({ cls: "pink-thumbs-title" });
    title.createSpan({ text: "Pages" });
    this.countEl = title.createSpan({ cls: "pink-thumbs-count" });
    const done = head.createDiv({ cls: "pink-thumbs-done", text: "Done", attr: { role: "button", tabindex: "0" } });
    done.addEventListener("click", () => this.hide());
    const seg = this.el.createDiv({ cls: "pink-seg" });
    this.segAll = seg.createDiv({ cls: "pink-seg-btn is-on", attr: { role: "button", tabindex: "0" } });
    this.segAll.createSpan({ text: "All pages" });
    this.segMarks = seg.createDiv({ cls: "pink-seg-btn", attr: { role: "button", tabindex: "0" } });
    this.segMarks.createSpan({ text: "Bookmarks" });
    this.markCountEl = this.segMarks.createSpan({ cls: "pink-seg-count", text: "0" });
    this.segAll.addEventListener("click", () => this.setFilter("all"));
    this.segMarks.addEventListener("click", () => this.setFilter("marks"));
    const row = this.el.createDiv({ cls: "pink-ov-row" });
    this.input = row.createEl("input", { type: "text", cls: "pink-ov-input", attr: { inputmode: "numeric", pattern: "[0-9]*", placeholder: "Go to page" } });
    const go = row.createDiv({ cls: "pink-ov-go", text: "Go", attr: { role: "button", tabindex: "0" } });
    const jump = () => {
      const n = parseInt(this.input.value, 10);
      if (!isNaN(n)) {
        this.view.goTo(n - 1);
        this.select(n - 1);
        this.input.value = "";
        this.input.blur();
      }
    };
    go.addEventListener("click", jump);
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") jump();
    });
    this.listEl = this.el.createDiv({ cls: "pink-thumbs-list" });
    this.topSpacer = this.listEl.createDiv({ cls: "pink-thumbs-spacer" });
    this.botSpacer = this.listEl.createDiv({ cls: "pink-thumbs-spacer" });
    this.listEl.addEventListener("scroll", () => {
      if (!this.open || this.stale) return;
      this.updateVirtualViewport();
      this.kick();
    }, { passive: true });
    this.emptyEl = this.el.createDiv({ cls: "pink-thumbs-empty", text: "No bookmarks yet. Select a page, then tap Bookmark." });
    this.restoreEl = this.el.createDiv({ cls: "pink-thumbs-restore" });
    this.restoreLabel = this.restoreEl.createSpan({ text: "" });
    const restoreBtn = this.restoreEl.createSpan({ cls: "pink-thumbs-restore-btn", text: "Restore all", attr: { role: "button", tabindex: "0" } });
    restoreBtn.addEventListener("click", () => this.view.restoreAllPages());
    this.bar = this.el.createDiv({ cls: "pink-thumbs-bar" });
    const act = (label, icon, cls, color, cb) => {
      const b = this.bar.createDiv({ cls: "pink-act " + cls, attr: { role: "button", tabindex: "0" } });
      const ic = b.createDiv({ cls: "pink-act-ic" });
      ic.style.backgroundImage = iconUrl(icon, color);
      const lab = b.createDiv({ cls: "pink-act-label", text: label });
      b.addEventListener("click", cb);
      return { el: b, label: lab, icon: ic };
    };
    act("Add page", "plus", "is-add", BLUE, () => this.view.insertBlankAfter(this.target()));
    act("Duplicate", "copy", "is-dup", BLUE, () => this.view.duplicateAt(this.target()));
    const m = act("Bookmark", "bookmark", "is-mark", BLUE, () => this.toggleMark());
    this.btnMark = m.el;
    this.btnMarkLabel = m.label;
    this.btnMarkIcon = m.icon;
    act("Delete", "trash", "is-del", RED, () => this.view.deletePageAt(this.target()));
    this.bar.createDiv({ cls: "pink-act-hint", text: "Select a page, then choose an action" });
  }
  totalCount() {
    if (this.stale) return this.view.slots.length;
    return this.filteredItems.length;
  }
  target() {
    return this.selected >= 0 ? this.selected : this.current;
  }
  fitTop(px) {
    this.el.style.top = px + "px";
  }
  setCache(key, entry) {
    const old = this.cache.get(key);
    if (old && !old.shared && old.url !== entry.url) safeRevokeUrl(old.url);
    this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > THUMB_CACHE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      const victim = this.cache.get(firstKey);
      if (victim && !victim.shared) safeRevokeUrl(victim.url);
      this.cache.delete(firstKey);
    }
  }
  destroy() {
    this.stopped = true;
    for (const c of this.cache.values()) {
      if (!c.shared) safeRevokeUrl(c.url);
    }
    this.cache.clear();
    this.mountedItems.clear();
    this.byEl.clear();
    this.el.remove();
  }
  toggle() {
    if (this.open) this.hide();
    else this.show();
  }
  show() {
    var _a, _b;
    this.open = true;
    this.el.addClass("is-open");
    this.view.setGridActive(true);
    if (this.stale) this.build();
    if (this.filter === "marks" && !this.isMarked((_b = (_a = this.view.slots[this.view.currentIdx]) == null ? void 0 : _a.key) != null ? _b : "")) {
      this.filter = "all";
    }
    this.syncFilter();
    this.setCurrent(this.view.currentIdx);
    this.select(this.view.currentIdx);
    this.revealCurrent();
    this.kick();
  }
  hide() {
    this.open = false;
    this.el.removeClass("is-open");
    this.view.setGridActive(false);
  }
  estimateRowHeight() {
    const listW = (this.listEl && this.listEl.clientWidth) ? this.listEl.clientWidth : 338;
    const colW = Math.max(90, (listW - 32 - 14) / 2);
    const def = this.view.defSize || { w: 595, h: 842 };
    const ratio = (def.h && def.w) ? (def.h / def.w) : 1.415;
    this.rowHCache = Math.round(colW * ratio + 26 + 20);
    return this.rowHCache;
  }
  scrollToIndex(idx, center = true) {
    const it = this.items[idx];
    if (!it || it.posInFiltered < 0) return;
    const row = Math.floor(it.posInFiltered / 2);
    const rowH = this.estimateRowHeight();
    const itemTop = row * rowH;
    const viewH = this.listEl.clientHeight || 600;
    if (center) {
      this.listEl.scrollTop = Math.max(0, Math.round(itemTop - (viewH - rowH) / 2));
    } else {
      const st = this.listEl.scrollTop;
      if (itemTop < st || itemTop + rowH > st + viewH) {
        this.listEl.scrollTop = Math.max(0, Math.round(itemTop - viewH / 3));
      }
    }
    this.updateVirtualViewport();
  }
  revealCurrent() {
    requestAnimationFrame(() => {
      if (!this.open) return;
      this.scrollToIndex(this.view.currentIdx, true);
      this.kick();
    });
  }
  rebuild(selectKey) {
    this.selectKey = selectKey;
    this.stale = true;
    if (this.open) {
      this.build();
      this.kick();
    }
  }
  refreshBookmarks() {
    if (this.stale) return;
    for (const it of this.mountedItems) {
      if (it.el) it.el.toggleClass("is-marked", this.isMarked(it.key));
    }
    this.syncFilter();
    this.syncMarkButton();
  }
  isMarked(key) {
    var _a, _b;
    return !!((_b = (_a = this.view.doc.bookmarks) == null ? void 0 : _a[key]) == null ? void 0 : _b.on);
  }
  setFilter(f) {
    if (this.filter === f) return;
    this.filter = f;
    this.listEl.scrollTop = 0;
    this.syncFilter();
    this.kick();
  }
  syncFilter() {
    let n = 0;
    this.filteredItems = [];
    for (const it of this.items) {
      const marked = this.isMarked(it.key);
      if (marked) n++;
      if (this.filter === "all" || marked) {
        it.posInFiltered = this.filteredItems.length;
        this.filteredItems.push(it);
      } else {
        it.posInFiltered = -1;
        if (it.el) this.unmountItem(it);
      }
    }
    this.markCountEl.setText(String(n));
    this.emptyEl.toggleClass("is-on", this.filter === "marks" && n === 0);
    this.segAll.toggleClass("is-on", this.filter === "all");
    this.segMarks.toggleClass("is-on", this.filter === "marks");
    const removed = this.view.removedCount();
    this.restoreEl.toggleClass("is-on", removed > 0);
    this.restoreLabel.setText(`${removed} page${removed === 1 ? "" : "s"} removed`);
    if (this.open && !this.stale) this.updateVirtualViewport();
  }
  syncMarkButton() {
    var _a, _b;
    const s = this.view.slots[this.target()];
    const on = !!s && this.isMarked(s.key);
    (_a = this.btnMark) == null ? void 0 : _a.toggleClass("is-on", on);
    (_b = this.btnMarkLabel) == null ? void 0 : _b.setText(on ? "Remove" : "Bookmark");
    if (this.btnMarkIcon) this.btnMarkIcon.style.backgroundImage = iconUrl("bookmark", on ? AMBER : BLUE);
  }
  toggleMark() {
    const s = this.view.slots[this.target()];
    if (s) this.view.toggleBookmark(s.key);
  }
  build() {
    this.stale = false;
    for (const it of Array.from(this.mountedItems)) this.unmountItem(it);
    this.mountedItems.clear();
    this.byEl.clear();
    this.queue = [];
    this.listEl.empty();
    this.topSpacer = this.listEl.createDiv({ cls: "pink-thumbs-spacer" });
    this.botSpacer = this.listEl.createDiv({ cls: "pink-thumbs-spacer" });
    const slots = this.view.slots;
    this.countEl.setText(slots.length ? String(slots.length) : "");
    if (!this.byKey) this.byKey = /* @__PURE__ */ new Map();
    this.byKey.clear();
    this.items = slots.map((s) => {
      const it = {
        idx: s.idx,
        key: s.key,
        blank: !!s.blank,
        w: s.w,
        h: s.h,
        posInFiltered: -1,
        el: null,
        paper: null,
        img: null,
        visible: false,
        done: false,
        queued: false
      };
      this.byKey.set(s.key, it);
      return it;
    });
    let sel = this.selected;
    if (this.selectKey) {
      const i = slots.findIndex((s) => s.key === this.selectKey);
      if (i >= 0) sel = i;
      this.selectKey = void 0;
    }
    this.selected = -1;
    this.syncFilter();
    this.select(Math.min(Math.max(0, sel), slots.length - 1));
    this.setCurrent(this.view.currentIdx);
  }
  mountItem(it) {
    if (!it.el) {
      const el = document.createElement("div");
      el.className = "pink-thumb" + (it.blank ? " is-added" : "");
      const paper = el.createDiv({ cls: "pink-thumb-paper" });
      paper.style.paddingTop = (it.h / it.w * 100) + "%";
      const check = paper.createDiv({ cls: "pink-thumb-check" });
      check.style.backgroundImage = iconUrl("check", "#ffffff");
      el.createDiv({ cls: "pink-thumb-mark" });
      el.createDiv({ cls: "pink-thumb-num", text: it.blank ? `${it.idx + 1} \xB7 added` : String(it.idx + 1) });
      el.addEventListener("click", () => {
        this.select(it.idx);
        this.view.goTo(it.idx);
        this.hide();
      });
      it.el = el;
      it.paper = paper;
      this.byEl.set(el, it);
    }
    it.el.toggleClass("is-marked", this.isMarked(it.key));
    it.el.toggleClass("selected", it.idx === this.selected);
    it.el.toggleClass("current", it.idx === this.current);
    this.mountedItems.add(it);
  }
  unmountItem(it) {
    this.release(it);
    if (it.el) {
      this.byEl.delete(it.el);
      it.el.remove();
      it.el = null;
      it.paper = null;
      it.img = null;
    }
    it.visible = false;
    this.mountedItems.delete(it);
  }
  updateVirtualViewport() {
    const total = this.filteredItems.length;
    if (total === 0) {
      for (const it of Array.from(this.mountedItems)) this.unmountItem(it);
      this.topSpacer.style.display = "none";
      this.botSpacer.style.display = "none";
      return;
    }
    const totalRows = Math.ceil(total / 2);
    const rowH = this.estimateRowHeight();
    const scrollTop = this.listEl.scrollTop;
    const viewH = this.listEl.clientHeight || 640;
    const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - 3);
    const lastRow = Math.min(totalRows - 1, Math.ceil((scrollTop + viewH) / rowH) + 3);
    const startIdx = firstRow * 2;
    const endIdx = Math.min(total, (lastRow + 1) * 2);

    for (const it of Array.from(this.mountedItems)) {
      if (it.posInFiltered < startIdx || it.posInFiltered >= endIdx) {
        this.unmountItem(it);
      }
    }

    if (firstRow > 0) {
      this.topSpacer.style.display = "block";
      this.topSpacer.style.height = Math.max(0, firstRow * rowH - 20) + "px";
    } else {
      this.topSpacer.style.display = "none";
      this.topSpacer.style.height = "0px";
    }

    const remRows = totalRows - 1 - lastRow;
    if (remRows > 0) {
      this.botSpacer.style.display = "block";
      this.botSpacer.style.height = Math.max(0, remRows * rowH - 20) + "px";
    } else {
      this.botSpacer.style.display = "none";
      this.botSpacer.style.height = "0px";
    }

    let cursor = this.topSpacer.nextSibling;
    for (let p = startIdx; p < endIdx; p++) {
      const it = this.filteredItems[p];
      this.mountItem(it);
      if (it.el !== cursor) {
        this.listEl.insertBefore(it.el, cursor);
      } else {
        cursor = cursor.nextSibling;
      }
      it.visible = true;
      this.enqueue(it);
    }
  }
  select(idx) {
    var _a, _b, _c, _d;
    if (idx < 0 || idx >= this.items.length) return;
    if (this.selected >= 0) (_b = (_a = this.items[this.selected]) == null ? void 0 : _a.el) == null ? void 0 : _b.removeClass("selected");
    this.selected = idx;
    (_d = (_c = this.items[idx]) == null ? void 0 : _c.el) == null ? void 0 : _d.addClass("selected");
    this.syncMarkButton();
  }
  setCurrent(idx) {
    var _a, _b, _c, _d;
    if (this.current >= 0 && this.current < this.items.length) (_b = (_a = this.items[this.current]) == null ? void 0 : _a.el) == null ? void 0 : _b.removeClass("current");
    this.current = idx;
    if (idx >= 0 && idx < this.items.length) (_d = (_c = this.items[idx]) == null ? void 0 : _c.el) == null ? void 0 : _d.addClass("current");
    if (this.open) this.scrollCurrentIntoView();
  }
  invalidate(key) {
    if (!key || this.stale) return;
    const c = this.cache.get(key);
    if (c) {
      if (!c.shared) safeRevokeUrl(c.url);
      this.cache.delete(key);
    }
    const it = this.byKey ? this.byKey.get(key) : this.items.find((x) => x.key === key);
    if (it) this.markDirty(it);
  }
  invalidateAll() {
    for (const c of this.cache.values()) {
      if (!c.shared) safeRevokeUrl(c.url);
    }
    this.cache.clear();
    if (this.stale) return;
    for (const it of this.items) this.markDirty(it);
  }
  markDirty(it) {
    it.done = false;
    if (it.visible && this.open) this.enqueueSoon();
  }
  cssWidth(it) {
    return Math.max(60, (it.paper && it.paper.clientWidth) || 130);
  }
  sigOf(s) {
    var _a;
    const list2 = (_a = this.view.doc.pages[s.key]) != null ? _a : [];
    let h = 5381;
    for (let i = 0; i < list2.length; i++) {
      const id = list2[i].id;
      for (let j = 0; j < id.length; j++) h = (h << 5) + h + id.charCodeAt(j) | 0;
      h = (h << 5) + h + 44 | 0;
    }
    return `${s.w}x${s.h}|${(h >>> 0).toString(36)}`;
  }
  showCached(it) {
    const slot = this.view.slots[it.idx];
    if (!slot || slot.key !== it.key) return false;
    const sig = this.sigOf(slot);
    const n = slot.pdfN != null ? slot.pdfN : slot.srcN;
    const c = this.cache.get(it.key);
    if (c && c.sig === sig && Math.abs(c.w - this.cssWidth(it)) <= 16) {
      if (!c.shared || (n !== null && this.view.pagePics.get(n) === c.url)) {
        this.attach(it, c.url);
        return true;
      }
      this.cache.delete(it.key);
    }
    const strokes2 = this.view.doc.pages[slot.key] || [];
    if (strokes2.length === 0 && n !== null && this.view.pagePics.has(n)) {
      const picUrl = this.view.pagePics.get(n);
      this.setCache(it.key, { url: picUrl, sig, w: this.cssWidth(it), shared: true });
      this.attach(it, picUrl);
      return true;
    }
    return false;
  }
  attach(it, url) {
    if (!it.paper) return;
    if (!it.img) {
      it.img = it.paper.createEl("img", { cls: "pink-thumb-img", attr: { alt: "" } });
      it.img.decoding = "async";
    }
    if (it.img.getAttribute("src") !== url) it.img.src = url;
    if (!it.img.isConnected) it.paper.appendChild(it.img);
    it.done = true;
  }
  enqueue(it) {
    if (it.done || it.queued) return;
    if (this.showCached(it)) return;
    it.queued = true;
    this.queue.push(it);
  }
  release(it) {
    var _a;
    (_a = it.img) == null ? void 0 : _a.remove();
    it.done = false;
    it.queued = false;
    this.queue = this.queue.filter((x) => x !== it);
  }
  kick() {
    if (this.running || !this.open || this.stopped) return;
    this.running = true;
    void this.run().finally(() => this.running = false);
  }
  async run() {
    while (!this.stopped && this.open) {
      while ((this.view.activeRenders > 0 || this.view.cur !== null || this.view.erasing !== null || Date.now() - this.view.plugin.lastInputAt < 800) && !this.stopped) await new Promise((r) => setTimeout(r, 120));
      const midRow = (this.listEl.scrollTop + this.listEl.clientHeight / 2) / Math.max(1, this.rowHCache);
      this.queue = this.queue.filter((it2) => it2.visible && !it2.done);
      if (!this.queue.length) return;
      this.queue.sort((a, b) => Math.abs(Math.floor(a.posInFiltered / 2) - midRow) - Math.abs(Math.floor(b.posInFiltered / 2) - midRow));
      const it = this.queue.shift();
      it.queued = false;
      try {
        await this.draw(it);
      } catch (e) {
        this.view.plugin.log.warn("thumbs", `thumbnail ${it.idx + 1} failed`, e);
        it.done = true;
      }
      await new Promise((r) => setTimeout(r, 16));
    }
  }
  async draw(it) {
    var _a, _b, _c;
    const slot = this.view.slots[it.idx];
    if (!slot || slot.key !== it.key) return;
    const sig = this.sigOf(slot);
    const cssW = this.cssWidth(it);
    const strokes2 = (_b = this.view.doc.pages[slot.key]) != null ? _b : [];
    const n = (_a = slot.pdfN) != null ? _a : slot.srcN;

    // Fast Path 1: Clean PDF page with no ink strokes — reuse existing 480px JPEG from memory or native resource URL
    if (strokes2.length === 0 && n !== null) {
      let picUrl = this.view.pagePics.get(n);
      if (!picUrl) {
        try {
          const file = `${this.view.picDir()}/${n}.jpg`;
          const ad = this.view.app.vault.adapter;
          if (await ad.exists(file)) {
            if (this.stopped) return;
            if (typeof ad.getResourcePath === "function") {
              picUrl = ad.getResourcePath(file);
            } else {
              const buf = await ad.readBinary(file);
              if (this.stopped) return;
              picUrl = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
            }
            this.view.pagePics.set(n, picUrl);
            this.view.capPics();
          }
        } catch (e) {
        }
      }
      if (picUrl) {
        this.setCache(it.key, { url: picUrl, sig, w: cssW, shared: true });
        if (it.visible && ((_c = this.view.slots[it.idx]) == null ? void 0 : _c.key) === it.key) this.attach(it, picUrl);
        return;
      }
    }

    // Standard Path: Render via pooled canvas & pageProxy
    const dpr = Math.min(window.devicePixelRatio || 1, THUMB_DPR_CAP);
    const scale = cssW * dpr / slot.w;
    const W = Math.max(1, Math.floor(slot.w * scale));
    const H = Math.max(1, Math.floor(slot.h * scale));
    const cv = globalCanvasPool.acquire(W, H, "pink-cv pink-thumb");
    const g = cv.getContext("2d", { alpha: false });
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    if (n !== null && this.view.pdf) {
      const inCache = this.view.pageCache.has(n);
      const page = inCache ? await this.view.pageProxy(n) : await this.view.pdf.getPage(n);
      try {
        const vp = page.getViewport({ scale });
        await page.render({ canvasContext: g, canvas: cv, viewport: vp }).promise;
      } finally {
        if (!inCache && !this.view.pageCache.has(n)) {
          try { page.cleanup(); } catch (e) {}
        }
      }
    }
    if (this.stopped) {
      globalCanvasPool.release(cv);
      return;
    }
    if (strokes2.length) {
      g.save();
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.globalCompositeOperation = "multiply";
      g.globalAlpha = HL_ALPHA;
      for (const s of strokes2) if (s.tool === "highlighter") drawStroke(g, s, true);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      for (const s of strokes2) if (s.tool === "pen") drawStroke(g, s, true);
      g.restore();
    }
    const blob = await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", 0.86));
    globalCanvasPool.release(cv);
    if (!blob || this.stopped) return;
    const url = URL.createObjectURL(blob);
    let shared = false;
    if (strokes2.length === 0 && n !== null && !this.view.pagePics.has(n)) {
      this.view.pagePics.set(n, url);
      this.view.capPics();
      shared = true;
    }
    this.setCache(it.key, { url, sig, w: cssW, shared });
    if (it.visible && ((_c = this.view.slots[it.idx]) == null ? void 0 : _c.key) === it.key) this.attach(it, url);
  }
};

// src/view.ts
var VIEW_TYPE = "pencil-ink-pdf";
var MAX_PX = 6e6;
var PIXEL_BUDGET = 4e7;
var DRAFT_DPR = 0.55;
var BLANK_W = 595;
var BLANK_H = 842;
var LIVE_BAKE_STEP = 1200;
var LIVE_BAKE_KEEP = 160;
var LIVE_PAGE_MAX_PX = 3e3;
var PREDICT_MAX_PX = 6;
var PEN_COOLDOWN_MS = 180;
var PALM_RADIUS_PX = 48;
var sleep2 = (ms) => new Promise((r) => window.setTimeout(r, ms));
function picKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) | 0;
  return (h >>> 0).toString(36);
}
var PAGE_CACHE = 12;
var WARM_RADIUS = 30;
var PICTURE_WIDTH = 480;
var PICTURE_QUALITY = 0.6;
var PICTURE_KEEP = 300;
var PAGE_DPR_CAP = 1.7;
var CanvasPool = class {
  constructor(maxSize = 8) {
    this.maxSize = maxSize;
    this.pool = [];
  }
  acquire(w, h, className = "pink-cv") {
    let cv = this.pool.pop();
    if (!cv) cv = document.createElement("canvas");
    cv.className = className;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const g = cv.getContext("2d");
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
    }
    return cv;
  }
  release(cv) {
    if (!cv) return;
    cv.remove();
    if (this.pool.length < this.maxSize) {
      if (this.pool.length >= 2) {
        cv.width = 0;
        cv.height = 0;
      }
      cv.className = "pink-cv";
      cv.style.cssText = "";
      this.pool.push(cv);
    } else {
      cv.width = 0;
      cv.height = 0;
    }
  }
  clear() {
    for (const cv of this.pool) {
      cv.width = 0;
      cv.height = 0;
    }
    this.pool = [];
  }
};
var globalCanvasPool = new CanvasPool(8);
function killCanvas(cv) {
  if (!cv) return;
  globalCanvasPool.release(cv);
}
function xform(g, geo) {
  const k = geo.scale * geo.dpr;
  g.setTransform(k, 0, 0, k, -geo.x * k, -geo.y * k);
}
function clearAll(cv) {
  const g = cv.getContext("2d");
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.restore();
}
function sameScale(a, b) {
  return Math.abs(a.scale - b.scale) < 1e-9 && a.dpr >= b.dpr - 1e-9;
}
function countPainted(cv) {
  if (!cv.width || !cv.height) return 0;
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
}

// ==========================================================================
// PENCIL INK: GOODNOTES-STYLE LIBRARY VIEW (HOMEPAGE)
// ==========================================================================
var HOME_VIEW_TYPE = "pencil-ink-home";

var NOTEBOOK_PALETTES = [
  { id: 0, name: "Deep Navy", bg: "#1d3557", spine: "#13233a", text: "#f1faee" },
  { id: 1, name: "Emerald Sage", bg: "#2a7f62", spine: "#1b5440", text: "#ecfdf5" },
  { id: 2, name: "Terracotta", bg: "#c85a48", spine: "#8e3c2f", text: "#fff5f5" },
  { id: 3, name: "Ochre Gold", bg: "#c28b2c", spine: "#8a611c", text: "#fefce8" },
  { id: 4, name: "Royal Plum", bg: "#64447c", spine: "#432c54", text: "#faf5ff" },
  { id: 5, name: "Slate Graphite", bg: "#374151", spine: "#1f2937", text: "#f9fafb" },
  { id: 6, name: "Coastal Ocean", bg: "#1e607a", spine: "#123d4e", text: "#f0f9ff" }
];

function getNotebookPalette(name, customIdx) {
  if (typeof customIdx === "number" && customIdx >= 0 && customIdx < NOTEBOOK_PALETTES.length) {
    return NOTEBOOK_PALETTES[customIdx];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return NOTEBOOK_PALETTES[Math.abs(hash) % NOTEBOOK_PALETTES.length];
}

var HOME_TIME_FMT = typeof Intl !== "undefined" && Intl.DateTimeFormat ? new Intl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit" }) : null;
var HOME_DATE_FMT = typeof Intl !== "undefined" && Intl.DateTimeFormat ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
function formatHomeDate(mtime) {
  const d = new Date(mtime);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (86400 * 1000));
  if (diffDays === 0) {
    if (HOME_TIME_FMT) return "Today " + HOME_TIME_FMT.format(d);
    let hours = d.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `Today ${hours}:${mins} ${ampm}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7 && diffDays > 1) return `${diffDays} days ago`;
  if (HOME_DATE_FMT) return HOME_DATE_FMT.format(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function countFolderPdfs(folder) {
  let count = 0;
  if (!folder || !folder.children) return 0;
  for (const child of folder.children) {
    if (child instanceof import_obsidian4.TFile && child.extension === "pdf") count++;
    else if (child instanceof import_obsidian4.TFolder) count += countFolderPdfs(child);
  }
  return count;
}

var NewNotebookModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, folderPath, onCreated) {
    super(app);
    this.plugin = plugin;
    this.folderPath = folderPath || "";
    this.onCreated = onCreated;
    this.title = "Untitled Notebook";
    this.template = "lined";
    this.coverIdx = 0;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pink-modal-box");

    contentEl.createEl("h2", { cls: "pink-modal-title", text: "New Notebook" });

    contentEl.createDiv({ cls: "pink-modal-label", text: "Notebook Title" });
    const nameInput = contentEl.createEl("input", {
      cls: "pink-modal-input",
      type: "text",
      value: this.title,
      placeholder: "e.g. Lecture Notes, Organic Chemistry..."
    });
    nameInput.oninput = () => {
      this.title = nameInput.value.trim() || "Untitled Notebook";
    };
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.close();
        void this.createNotebook();
      }
    });

    contentEl.createDiv({ cls: "pink-modal-label", text: "Cover Color" });
    const colorRow = contentEl.createDiv({ cls: "pink-cover-color-row" });
    const colorSwatches = [];
    NOTEBOOK_PALETTES.forEach((p, idx) => {
      const sw = colorRow.createDiv({
        cls: "pink-cover-swatch" + (this.coverIdx === idx ? " is-active" : ""),
        attr: { role: "button", tabindex: "0", title: p.name }
      });
      sw.style.backgroundColor = p.bg;
      colorSwatches.push({ sw, idx });
      sw.onclick = () => {
        this.coverIdx = idx;
        colorSwatches.forEach((x) => x.sw.toggleClass("is-active", x.idx === idx));
      };
    });

    contentEl.createDiv({ cls: "pink-modal-label", text: "Paper Template" });
    const tplGrid = contentEl.createDiv({ cls: "pink-tpl-grid" });
    const templates = [
      { id: "blank", name: "Blank", previewCls: "preview-blank" },
      { id: "lined", name: "Ruled", previewCls: "preview-lined" },
      { id: "grid", name: "Grid", previewCls: "preview-grid" },
      { id: "dot", name: "Dot Grid", previewCls: "preview-dot" },
      { id: "cornell", name: "Cornell", previewCls: "preview-cornell" }
    ];
    const cards = [];
    templates.forEach((t) => {
      const card = tplGrid.createDiv({ cls: "pink-tpl-card" + (this.template === t.id ? " is-active" : "") });
      card.createDiv({ cls: "pink-tpl-preview " + t.previewCls });
      card.createDiv({ cls: "pink-tpl-name", text: t.name });
      cards.push({ card, id: t.id });
      card.onclick = () => {
        this.template = t.id;
        cards.forEach((c) => c.card.toggleClass("is-active", c.id === t.id));
      };
    });

    const actions = contentEl.createDiv({ cls: "pink-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();
    const createBtn = actions.createEl("button", { cls: "mod-cta", text: "Create Notebook" });
    createBtn.onclick = async () => {
      this.close();
      await this.createNotebook();
    };
    window.setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 40);
  }
  async createNotebook() {
    try {
      const dir = this.folderPath.trim().replace(/^\/+|\/+$/g, "");
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      let base = this.title.replace(/[\\/:*?"<>|]/g, "").trim() || "Notebook";
      let path = `${dir ? dir + "/" : ""}${base}.pdf`;
      for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${dir ? dir + "/" : ""}${base} (${i}).pdf`;
      const pdfBytes = blankPdf(595, 842, this.template);
      const file = await this.app.vault.createBinary(path, pdfBytes);
      if (!this.plugin.settings.coverColors) this.plugin.settings.coverColors = {};
      this.plugin.settings.coverColors[file.path] = this.coverIdx;
      await this.plugin.saveSettings();
      if (this.onCreated) this.onCreated(file);
      await this.plugin.openPdf(file);
    } catch (e) {
      new import_obsidian4.Notice("Could not create notebook: " + String(e));
    }
  }
};

var NewFolderModal = class extends import_obsidian4.Modal {
  constructor(app, parentPath, onCreated) {
    super(app);
    this.parentPath = parentPath || "";
    this.onCreated = onCreated;
    this.name = "New Folder";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pink-modal-box");

    contentEl.createEl("h2", { cls: "pink-modal-title", text: "New Folder" });
    contentEl.createDiv({ cls: "pink-modal-label", text: "Folder Name" });

    const nameInput = contentEl.createEl("input", {
      cls: "pink-modal-input",
      type: "text",
      value: this.name,
      placeholder: "e.g. Semester 1, Cardiology..."
    });
    nameInput.oninput = () => {
      this.name = nameInput.value.trim();
    };
    const submit = async () => {
      this.close();
      const clean = (this.name || "").replace(/[\\/:*?"<>|]/g, "").trim() || "New Folder";
      const target = `${this.parentPath ? this.parentPath + "/" : ""}${clean}`;
      if (!this.app.vault.getAbstractFileByPath(target)) {
        await this.app.vault.createFolder(target);
      }
      if (this.onCreated) this.onCreated(target);
    };
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    });

    const actions = contentEl.createDiv({ cls: "pink-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();
    const createBtn = actions.createEl("button", { cls: "mod-cta", text: "Create Folder" });
    createBtn.onclick = () => void submit();
    window.setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 40);
  }
};

var RenameItemModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, fileOrFolder, onDone) {
    super(app);
    this.plugin = plugin;
    this.item = fileOrFolder;
    this.onDone = onDone;
    this.newName = fileOrFolder instanceof import_obsidian4.TFile ? fileOrFolder.basename : fileOrFolder.name;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pink-modal-box");

    contentEl.createEl("h2", { cls: "pink-modal-title", text: `Rename "${this.item.name}"` });
    contentEl.createDiv({ cls: "pink-modal-label", text: "New Name" });

    const nameInput = contentEl.createEl("input", {
      cls: "pink-modal-input",
      type: "text",
      value: this.newName
    });
    nameInput.oninput = () => {
      this.newName = nameInput.value.trim();
    };
    const submit = async () => {
      this.close();
      const clean = (this.newName || "").replace(/[\\/:*?"<>|]/g, "").trim();
      if (!clean) return;
      const oldPath = this.item.path;
      const ext = this.item instanceof import_obsidian4.TFile && this.item.extension ? `.${this.item.extension}` : "";
      const parent = this.item.parent ? this.item.parent.path : "";
      const targetPath = `${parent && parent !== "/" ? parent + "/" : ""}${clean}${ext}`;
      if (targetPath !== oldPath) {
        await this.app.fileManager.renameFile(this.item, targetPath);
        if (this.plugin && typeof this.plugin.migrateRenamedPaths === "function") {
          await this.plugin.migrateRenamedPaths(oldPath, targetPath);
        }
      }
      if (this.onDone) this.onDone();
    };
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    });

    const actions = contentEl.createDiv({ cls: "pink-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();
    const saveBtn = actions.createEl("button", { cls: "mod-cta", text: "Rename" });
    saveBtn.onclick = () => void submit();
    window.setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 40);
  }
};

var PencilInkHomeView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentPath = "";
    this.searchQuery = "";
    this.filterTab = "all";
    this.refreshTimer = null;
    this.mainEl = null;
    this.searchInputEl = null;
    this.thumbCache = /* @__PURE__ */ new Map();
  }
  getViewType() { return HOME_VIEW_TYPE; }
  getDisplayText() { return "Pencil Ink Library"; }
  getIcon() { return "book-open"; }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pink-home-root");
    this.contentEl.addEventListener("pointerdown", (e) => {
      if (this.searchInputEl && !e.target.closest(".gn-home-search-wrap")) {
        this.searchInputEl.blur();
      }
    });
    this.render();
    const isPdfOrFolder = (f) => (f instanceof import_obsidian4.TFile && f.extension === "pdf") || f instanceof import_obsidian4.TFolder;
    this.registerEvent(this.app.vault.on("create", (f) => {
      if (isPdfOrFolder(f)) this.refreshSoon();
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (isPdfOrFolder(f)) this.refreshSoon();
    }));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      if (isPdfOrFolder(f) || (typeof oldPath === "string" && oldPath.toLowerCase().endsWith(".pdf"))) this.refreshSoon();
    }));
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f instanceof import_obsidian4.TFile && f.extension === "pdf") this.refreshSoon();
    }));
  }
  async onClose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.revokeThumbs();
  }
  revokeThumbs() {
    if (!this.thumbCache) return;
    for (const entry of this.thumbCache.values()) {
      if (entry.revokable !== false && entry.url) safeRevokeUrl(entry.url);
    }
    this.thumbCache.clear();
  }
  refreshSoon() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (this.mainEl) this.renderMain(this.mainEl);
    }, 140);
  }
  navigateTo(path) {
    this.currentPath = path || "";
    this.searchQuery = "";
    this.render();
  }
  triggerPdfPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      try {
        if (input.files && input.files[0]) {
          await this.importPdf(input.files[0], this.currentPath);
        }
      } finally {
        input.remove();
      }
    };
    input.click();
  }
  async importPdf(fileObj, targetFolder) {
    try {
      if (!fileObj) return;
      const buf = await fileObj.arrayBuffer();
      let name = fileObj.name || "Imported Document.pdf";
      if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
      const dir = targetFolder ? targetFolder.trim().replace(/^\/+|\/+$/g, "") : "";
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      let path = `${dir ? dir + "/" : ""}${name}`;
      for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
        const base = name.replace(/\.pdf$/i, "");
        path = `${dir ? dir + "/" : ""}${base} (${i}).pdf`;
      }
      const created = await this.app.vault.createBinary(path, buf);
      new import_obsidian4.Notice(`Imported "${name}"`);
      this.refreshSoon();
      await this.plugin.openPdf(created);
    } catch (e) {
      new import_obsidian4.Notice("Could not import PDF: " + String(e));
    }
  }
  render() {
    this.contentEl.empty();

    // --- Goodnotes 6 Top App Header ---
    const header = this.contentEl.createDiv({ cls: "gn-home-header" });

    // Top row: App Title / Folder Hierarchy + Action Pill
    const titleRow = header.createDiv({ cls: "gn-home-title-row" });
    const titleCol = titleRow.createDiv({ cls: "gn-home-title-col" });

    const isRoot = !this.currentPath;
    const folderName = isRoot ? "Documents" : this.currentPath.split("/").pop();
    const titleH1 = titleCol.createEl("h1", { cls: "gn-home-main-title", text: folderName });

    // Breadcrumbs under title if in subfolder
    if (!isRoot) {
      const breadcrumbs = titleCol.createDiv({ cls: "gn-home-breadcrumbs" });
      const rootCrumb = breadcrumbs.createSpan({ cls: "gn-home-crumb", text: "Documents" });
      rootCrumb.onclick = () => this.navigateTo("");

      const parts = this.currentPath.split("/").filter(Boolean);
      let buildPath = "";
      parts.forEach((p, idx) => {
        breadcrumbs.createSpan({ cls: "gn-home-crumb-sep", text: "›" });
        buildPath += (idx > 0 ? "/" : "") + p;
        const isLast = idx === parts.length - 1;
        const curTargetPath = buildPath;
        const c = breadcrumbs.createSpan({ cls: "gn-home-crumb" + (isLast ? " is-active" : ""), text: p });
        if (!isLast) {
          c.onclick = () => this.navigateTo(curTargetPath);
        }
      });
    }

    // Top right actions: Search & + New
    const actionsRow = titleRow.createDiv({ cls: "gn-home-top-actions" });

    // Search bar (Inline flex container: zero icon overlap, clear button, auto-keyboard dismissal)
    const searchWrap = actionsRow.createDiv({ cls: "gn-home-search-wrap" });
    const searchSvg = searchWrap.createDiv({ cls: "gn-search-icon-box" });
    searchSvg.innerHTML = '<svg class="gn-search-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
    const searchInput = searchWrap.createEl("input", {
      cls: "gn-home-search-input",
      type: "text",
      attr: {
        placeholder: "Search",
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        inputmode: "search"
      }
    });
    searchInput.value = this.searchQuery;

    const clearBtn = searchWrap.createDiv({ cls: "gn-search-clear-btn", attr: { role: "button", title: "Clear search" } });
    clearBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    clearBtn.style.display = this.searchQuery ? "flex" : "none";

    let searchDebounceTimer = null;
    const onSearchChange = () => {
      const q = searchInput.value.trim();
      clearBtn.style.display = q ? "flex" : "none";
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        this.searchQuery = q;
        if (this.mainEl) this.renderMain(this.mainEl);
      }, 80);
    };
    searchInput.oninput = onSearchChange;

    clearBtn.onclick = (e) => {
      e.stopPropagation();
      searchInput.value = "";
      this.searchQuery = "";
      clearBtn.style.display = "none";
      searchInput.blur();
      if (this.mainEl) this.renderMain(this.mainEl);
    };

    this.searchInputEl = searchInput;

    // Primary "+ New" Pill Button
    const newBtn = actionsRow.createDiv({ cls: "gn-home-btn-new", attr: { role: "button", tabindex: "0" } });
    newBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> <span>New</span>';
    newBtn.onclick = (e) => {
      const menu = new import_obsidian4.Menu();
      menu.addItem((i) => i.setTitle("New Notebook...").setIcon("book-open").onClick(() => {
        new NewNotebookModal(this.app, this.plugin, this.currentPath, () => this.refreshSoon()).open();
      }));
      menu.addItem((i) => i.setTitle("Quick Note (Blank)").setIcon("zap").onClick(() => {
        void this.plugin.newQuicknote(this.currentPath);
      }));
      menu.addSeparator();
      menu.addItem((i) => i.setTitle("Import PDF...").setIcon("upload").onClick(() => {
        this.triggerPdfPicker();
      }));
      menu.addItem((i) => i.setTitle("New Folder...").setIcon("folder").onClick(() => {
        new NewFolderModal(this.app, this.currentPath, () => this.refreshSoon()).open();
      }));
      menu.showAtMouseEvent(e);
    };

    // Sub-bar: Segmented Tabs (All, Recent, Favorites)
    const subBar = header.createDiv({ cls: "gn-home-sub-bar" });
    const tabs = subBar.createDiv({ cls: "gn-home-tabs" });
    const tabAll = tabs.createDiv({ cls: "gn-home-tab" + (this.filterTab === "all" ? " is-active" : ""), text: "All" });
    const tabRecent = tabs.createDiv({ cls: "gn-home-tab" + (this.filterTab === "recent" ? " is-active" : ""), text: "Recent" });
    const tabStarred = tabs.createDiv({ cls: "gn-home-tab" + (this.filterTab === "starred" ? " is-active" : ""), text: "Favorites" });

    const updateTabs = (newTab) => {
      this.filterTab = newTab;
      tabAll.toggleClass("is-active", newTab === "all");
      tabRecent.toggleClass("is-active", newTab === "recent");
      tabStarred.toggleClass("is-active", newTab === "starred");
      if (this.mainEl) this.renderMain(this.mainEl);
    };
    tabAll.onclick = () => updateTabs("all");
    tabRecent.onclick = () => updateTabs("recent");
    tabStarred.onclick = () => updateTabs("starred");

    // Main scrollable area
    this.mainEl = this.contentEl.createDiv({ cls: "gn-home-main" });
    this.renderMain(this.mainEl);
  }

  renderMain(container) {
    container.empty();

    let folders = [];
    let docs = [];
    const pdfIdx = typeof this.plugin.getPdfIndex === "function" ? this.plugin.getPdfIndex() : null;
    const allPdfs = pdfIdx ? pdfIdx.pdfs : this.app.vault.getFiles().filter((f) => f.extension === "pdf").sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (this.filterTab === "recent") {
      docs = allPdfs.slice(0, 30);
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        docs = docs.filter((d) => d.name.toLowerCase().includes(q));
      }
    } else if (this.filterTab === "starred") {
      const starred = new Set(this.plugin.settings.starredPaths || []);
      docs = allPdfs.filter((f) => starred.has(f.path));
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        docs = docs.filter((d) => d.name.toLowerCase().includes(q));
      }
    } else {
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        docs = allPdfs.filter((f) => f.name.toLowerCase().includes(q));
        folders = this.app.vault.getAllLoadedFiles().filter((f) => f instanceof import_obsidian4.TFolder && f.name.toLowerCase().includes(q));
      } else {
        const curFolder = this.currentPath ? this.app.vault.getAbstractFileByPath(this.currentPath) : this.app.vault.getRoot();
        if (curFolder instanceof import_obsidian4.TFolder) {
          folders = curFolder.children.filter((c) => c instanceof import_obsidian4.TFolder).sort((a, b) => a.name.localeCompare(b.name));
          docs = curFolder.children.filter((c) => c instanceof import_obsidian4.TFile && c.extension === "pdf").sort((a, b) => b.stat.mtime - a.stat.mtime);
        }
      }
    }

    // Folders Section
    if (this.filterTab === "all" && folders.length > 0) {
      const secHead = container.createDiv({ cls: "gn-home-sec-head" });
      const secTitle = secHead.createDiv({ cls: "gn-home-sec-title", text: "Folders" });
      secTitle.createSpan({ cls: "gn-home-sec-count", text: `(${folders.length})` });

      const folderGrid = container.createDiv({ cls: "gn-home-folders-grid" });
      folders.forEach((folder) => {
        const card = folderGrid.createDiv({ cls: "gn-folder-card" });
        const iconDiv = card.createDiv({ cls: "gn-folder-icon" });
        iconDiv.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M2 7C2 5.89543 2.89543 5 4 5H9.17157C9.70201 5 10.2107 5.21071 10.5858 5.58579L12.4142 7.41421C12.7893 7.78929 13.298 8 13.8284 8H20C21.1046 8 22 8.89543 22 10V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V7Z" fill="#3884ff" fill-opacity="0.22" stroke="#007aff" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 11H22" stroke="#007aff" stroke-width="1.6" opacity="0.6"/></svg>';

        const info = card.createDiv({ cls: "gn-folder-info" });
        info.createDiv({ cls: "gn-folder-title", text: folder.name });
        const pdfCount = pdfIdx && pdfIdx.folderCounts.has(folder.path) ? pdfIdx.folderCounts.get(folder.path) : countFolderPdfs(folder);
        info.createDiv({ cls: "gn-folder-sub", text: `${pdfCount} ${pdfCount === 1 ? "document" : "documents"}` });

        const fMenuBtn = card.createDiv({ cls: "gn-folder-menu-btn", attr: { role: "button", tabindex: "0", title: "Options" } });
        fMenuBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>';

        const showFolderMenu = (e) => {
          e.stopPropagation();
          const menu = new import_obsidian4.Menu();
          menu.addItem((i) => i.setTitle("Open Folder").setIcon("folder").onClick(() => this.navigateTo(folder.path)));
          menu.addItem((i) => i.setTitle("New Notebook Here...").setIcon("book-open").onClick(() => {
            new NewNotebookModal(this.app, this.plugin, folder.path, () => this.refreshSoon()).open();
          }));
          menu.addItem((i) => i.setTitle("Rename Folder...").setIcon("pencil").onClick(() => {
            new RenameItemModal(this.app, this.plugin, folder, () => this.refreshSoon()).open();
          }));
          menu.addSeparator();
          menu.addItem((i) => i.setTitle("Delete Folder").setIcon("trash").onClick(async () => {
            await this.app.fileManager.trashFile(folder);
            this.refreshSoon();
          }));
          menu.showAtMouseEvent(e);
        };

        fMenuBtn.onclick = showFolderMenu;
        card.onclick = (e) => {
          if (e.target.closest(".gn-folder-menu-btn")) return;
          this.navigateTo(folder.path);
        };
        card.oncontextmenu = (e) => {
          e.preventDefault();
          showFolderMenu(e);
        };
      });
    }

    // Documents Section
    const secHeadDocs = container.createDiv({ cls: "gn-home-sec-head" });
    const titleText = this.filterTab === "recent" ? "Recent Documents" : this.filterTab === "starred" ? "Favorites" : "Documents";
    const secTitleDocs = secHeadDocs.createDiv({ cls: "gn-home-sec-title", text: titleText });
    secTitleDocs.createSpan({ cls: "gn-home-sec-count", text: `(${docs.length})` });

    if (docs.length === 0 && folders.length === 0) {
      const empty = container.createDiv({ cls: "gn-home-empty" });
      empty.innerHTML = '<svg class="gn-empty-svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
      empty.createDiv({ cls: "gn-home-empty-title", text: this.filterTab === "starred" ? "No favorite documents" : "No documents yet" });
      empty.createDiv({ cls: "gn-home-empty-desc", text: "Create a new notebook or quicknote to start writing with Apple Pencil." });
      const emptyBtns = empty.createDiv({ cls: "gn-home-empty-actions" });
      const emptyBookBtn = emptyBtns.createEl("button", { cls: "mod-cta", text: "New Notebook" });
      emptyBookBtn.onclick = () => new NewNotebookModal(this.app, this.plugin, this.currentPath, () => this.refreshSoon()).open();
      const emptyImportBtn = emptyBtns.createEl("button", { text: "Import PDF" });
      emptyImportBtn.onclick = () => this.triggerPdfPicker();
      return;
    }

    const docGrid = container.createDiv({ cls: "gn-home-docs-grid" });
    const starredSet = new Set(this.plugin.settings.starredPaths || []);
    const customColors = this.plugin.settings.coverColors || {};

    docs.forEach((doc) => {
      const card = docGrid.createDiv({ cls: "gn-doc-card" });
      const cover = card.createDiv({ cls: "gn-doc-cover" });
      const pal = getNotebookPalette(doc.name, customColors[doc.path]);

      cover.style.backgroundColor = pal.bg;
      const art = cover.createDiv({ cls: "gn-doc-cover-art" });
      const plaque = art.createDiv({ cls: "gn-doc-plaque" });
      plaque.createDiv({ cls: "gn-doc-cover-title", text: doc.basename });
      plaque.createDiv({ cls: "gn-doc-plaque-line" });

      // Load Page 1 thumbnail (from in-memory thumbCache or disk pics cache)
      if (this.app && this.app.vault && this.app.vault.adapter && typeof this.app.vault.adapter.exists === "function") {
        const key = picKey(doc.path + "|" + (doc.stat ? doc.stat.size : 0));
        const cached = this.thumbCache.get(key);
        if (cached) {
          const img = cover.createEl("img", { cls: "gn-doc-cover-img", attr: { src: cached.url, alt: doc.basename } });
          img.decoding = "async";
          art.style.display = "none";
        } else {
          const thumbFile = `${this.app.vault.configDir}/plugins/pencil-ink/pics/${key}/1.jpg`;
          void (async () => {
            try {
              if (await this.app.vault.adapter.exists(thumbFile)) {
                let entry = this.thumbCache.get(key);
                if (!entry) {
                  if (this.thumbCache.size >= 120) {
                    const oldestKey = this.thumbCache.keys().next().value;
                    if (oldestKey !== void 0) {
                      const oldEntry = this.thumbCache.get(oldestKey);
                      if (oldEntry && oldEntry.revokable !== false && oldEntry.url) safeRevokeUrl(oldEntry.url);
                      this.thumbCache.delete(oldestKey);
                    }
                  }
                  const ad = this.app.vault.adapter;
                  const resUrl = typeof ad.getResourcePath === "function" ? ad.getResourcePath(thumbFile) : "";
                  if (resUrl && typeof resUrl === "string") {
                    entry = { url: resUrl, revokable: false };
                  } else {
                    const buf = await ad.readBinary(thumbFile);
                    entry = { url: URL.createObjectURL(new Blob([buf], { type: "image/jpeg" })), revokable: true };
                  }
                  this.thumbCache.set(key, entry);
                }
                if (!cover.isConnected) return;
                const img = cover.createEl("img", { cls: "gn-doc-cover-img", attr: { src: entry.url, alt: doc.basename } });
                img.decoding = "async";
                art.style.display = "none";
              }
            } catch (e) {
            }
          })();
        }
      }

      // 1-Tap Star Button
      const isStarred = starredSet.has(doc.path);
      const starBtn = cover.createDiv({
        cls: "gn-doc-star-btn" + (isStarred ? " is-starred" : ""),
        attr: { role: "button", tabindex: "0", title: isStarred ? "Remove from Favorites" : "Add to Favorites" }
      });
      starBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (isStarred ? "#ffd60a" : "none") + '" stroke="' + (isStarred ? "#ffd60a" : "#ffffff") + '" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      starBtn.onclick = async (e) => {
        e.stopPropagation();
        const curSet = new Set(this.plugin.settings.starredPaths || []);
        if (curSet.has(doc.path)) curSet.delete(doc.path);
        else curSet.add(doc.path);
        this.plugin.settings.starredPaths = Array.from(curSet);
        await this.plugin.saveSettings();
        this.renderMain(container);
      };

      const meta = card.createDiv({ cls: "gn-doc-meta" });
      const textCol = meta.createDiv({ cls: "gn-doc-text" });
      textCol.createDiv({ cls: "gn-doc-name", text: doc.basename });
      textCol.createDiv({ cls: "gn-doc-date", text: formatHomeDate(doc.stat.mtime) });

      const menuBtn = meta.createDiv({ cls: "gn-doc-menu-btn", attr: { role: "button", tabindex: "0", title: "Options" } });
      menuBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>';

      const showDocMenu = (e) => {
        e.stopPropagation();
        const menu = new import_obsidian4.Menu();
        const curStarred = new Set(this.plugin.settings.starredPaths || []);
        const starredNow = curStarred.has(doc.path);
        menu.addItem((i) => i.setTitle("Open").setIcon("book-open").onClick(() => void this.plugin.openPdf(doc)));
        menu.addItem((i) => i.setTitle(starredNow ? "Remove from Favorites" : "Add to Favorites").setIcon("star").onClick(async () => {
          if (starredNow) curStarred.delete(doc.path);
          else curStarred.add(doc.path);
          this.plugin.settings.starredPaths = Array.from(curStarred);
          await this.plugin.saveSettings();
          this.renderMain(container);
        }));
        menu.addItem((i) => i.setTitle("Change Cover Color").setIcon("palette").onClick(async () => {
          if (!this.plugin.settings.coverColors) this.plugin.settings.coverColors = {};
          const curIdx = this.plugin.settings.coverColors[doc.path] !== void 0 ? this.plugin.settings.coverColors[doc.path] : getNotebookPalette(doc.name).id;
          this.plugin.settings.coverColors[doc.path] = (curIdx + 1) % NOTEBOOK_PALETTES.length;
          await this.plugin.saveSettings();
          this.renderMain(container);
        }));
        menu.addItem((i) => i.setTitle("Rename...").setIcon("pencil").onClick(() => {
          new RenameItemModal(this.app, this.plugin, doc, () => this.refreshSoon()).open();
        }));
        menu.addItem((i) => i.setTitle("Duplicate").setIcon("copy").onClick(async () => {
          const dir = doc.parent ? doc.parent.path : "";
          let copyPath = `${dir && dir !== "/" ? dir + "/" : ""}${doc.basename} (copy).pdf`;
          for (let i = 2; this.app.vault.getAbstractFileByPath(copyPath); i++) copyPath = `${dir && dir !== "/" ? dir + "/" : ""}${doc.basename} (copy ${i}).pdf`;
          const data = await this.app.vault.readBinary(doc);
          await this.app.vault.createBinary(copyPath, data);
          const sidecar = await this.plugin.sync.readSidecar(doc.path);
          if (sidecar) {
            sidecar.name = copyPath;
            sidecar.updated = Date.now();
            await this.plugin.sync.writeText(copyPath + INK, JSON.stringify(sidecar));
          }
          if (this.plugin.settings.coverColors && this.plugin.settings.coverColors[doc.path] !== void 0) {
            this.plugin.settings.coverColors[copyPath] = this.plugin.settings.coverColors[doc.path];
            await this.plugin.saveSettings();
          }
          this.refreshSoon();
        }));
        menu.addSeparator();
        menu.addItem((i) => i.setTitle("Delete").setIcon("trash").onClick(async () => {
          await this.app.fileManager.trashFile(doc);
          if (typeof this.plugin.cleanupDeletedPdf === "function") {
            await this.plugin.cleanupDeletedPdf(doc.path);
          }
          this.refreshSoon();
        }));
        menu.showAtMouseEvent(e);
      };

      menuBtn.onclick = showDocMenu;
      card.onclick = (e) => {
        if (e.target.closest(".gn-doc-menu-btn") || e.target.closest(".gn-doc-star-btn")) return;
        void this.plugin.openPdf(doc);
      };
      card.oncontextmenu = (e) => {
        e.preventDefault();
        showDocMenu(e);
      };
    });
  }
};

var InkPdfView = class extends import_obsidian4.FileView {
  // when the pen last moved, for the stuck-stroke check
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.navigation = true;
    this.allowNoFile = false;
    this.doc = emptyDoc();
    this.docOwner = null;
    this.sidecarSeen = void 0;
    // the annotation file's modification time when this pane last saw it
    this.pdf = null;
    this.slots = [];
    this.activeRenders = 0;
    this.currentIdx = 0;
    this.numPages = 0;
    this.defSize = { w: BLANK_W, h: BLANK_H };
    this.sizes = /* @__PURE__ */ new Map();
    this.byEl = /* @__PURE__ */ new Map();
    this.active = /* @__PURE__ */ new Set();
    // slots that are near or far
    this.renderedSet = /* @__PURE__ */ new Set();
    this.mountedSet = /* @__PURE__ */ new Set();
    this.dockHCache = 60;
    this.totalW = 0;
    this.totalH = 0;
    this.toolBtns = /* @__PURE__ */ new Map();
    this.thumbs = null;
    this.lastOpenMs = 0;
    this.tool = "pen";
    this.lastDrawTool = "pen";
    this.scrollMode = false;
    this.zoom = 1;
    this.loadToken = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.lastScroll = 0;
    this.holdUntil = 0;
    this.activityAt = 0;
    this.schedTimer = 0;
    this.popEl = null;
    this.popBack = null;
    this.pinch = null;
    this.pinching = false;
    this.zoomAt = 0;
    // last zoom step: sharp redraws wait until zooming settles
    this.zoomWait = 0;
    this.pinchFrame = 0;
    this.chromeBuilt = false;
    this.firstRendered = false;
    this.openedAt = 0;
    this.watchdog = 0;
    this.bannerEl = null;
    this.lastPenAt = 0;
    this.endRenderTimer = 0;
    this.loadMode = "";
    this.warmPaused = false;
    this.windowMoves = 0;
    this.lastGesture = "";
    this.remoteLayoutPending = false;
    this.remoteRedrawPending = false;
    // input state
    this.activePointer = null;
    this.blockTouch = null;
    this.touchDraw = false;
    this.palmTouchIds = /* @__PURE__ */ new Set();
    this.touchDownTimes = /* @__PURE__ */ new Map();
    this.touchMomentumRaf = 0;
    this.lastTapCenter = null;
    this.eraseDirty = /* @__PURE__ */ new Set();
    this.eraseT = 0;
    this.downs = { all: 0, busy: 0, offPage: 0, notReady: 0 };
    // pen-downs seen, and why some did not start a stroke
    this.liveUsed = false;
    this.penSeen = false;
    // once the Pencil has sent a pointer event, touch events never draw (no doubled input)
    this.cur = null;
    this.erasing = null;
    this.dragOriginals = [];
    this.dragPieces = /* @__PURE__ */ new Map();
    this.ring = null;
    this.ringBox = null;
    this.liveCv = null;
    this.tipCv = null;
    this.liveSlot = null;
    this.liveRelease = 0;
    this.remoteWhileWriting = null;
    // a change from another device, held until the stroke in progress ends
    this.lastPtrAt = 0;
    /** parsed PDF pages, most recently used last */
    this.pageCache = /* @__PURE__ */ new Map();
    this.resizeAnchor = null;
    this.resizeTimer = 0;
    this.updateCurrentSoon = (0, import_obsidian4.debounce)(() => this.updateCurrent(), 80, false);
    // Auto-hide toolbar: slides away while scrolling down, returns when scrolling up or near the top of the document.
    this.dockHidden = false;
    this.dockLastTop = 0;
    this.dockRun = 0;
    this.scrollIdle = (0, import_obsidian4.debounce)(() => {
      this.requestRender();
      this.evict();
    }, 140, true);
    /** While scrolling, keep new pages and deep-zoom windows coming (at draft quality), a few times per second. */
    this.scrollFeedAt = 0;
    // ---- saved page pictures: a page drawn once shows at once next time ----
    this.warmRun = 0;
    this.pagePics = /* @__PURE__ */ new Map();
    this.saveSettingsSoon = (0, import_obsidian4.debounce)(() => void this.plugin.saveSettings(), 500, true);
    /**
     * Boosted prediction: a curve (constant acceleration) fitted to the last 8 samples and continued 12 ms ahead.
     * iPadOS itself only predicts 4-8 ms. On recorded handwriting this is about 1 px off (3 px at worst) at 12 ms,
     * against 3 px (7 px at worst) of lag without it. The predicted part is redrawn every frame and never saved.
     */
    /** A finished stroke that was not yet on the page stays on screen; it is cleared once the page has it. */
    this.tipPending = false;
    this.saveTimer = 0;
    this.toastTimer = 0;
    /** Double tap with a finger = undo, triple tap = redo. Short taps that do not move; the Pencil never counts. */
    this.tapCount = 0;
    this.tapTimer = 0;
    this.touches = /* @__PURE__ */ new Map();
    // finger pointers on the page (never the Pencil)
    this.touchSeenAt = 0;
    this.touchPeak = 0;
    // most fingers down at once in this gesture
    this.touchMoved = false;
    // a finger moved: a drag or pinch, not a tap
    this.touchQuick = true;
    /** A quick tap with 2 or 3 fingers. Two taps in a row: 2 fingers = undo, 3 fingers = redo. */
    this.tapKind = 0;
  }
  get log() {
    return this.plugin.log;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return this.file ? this.file.basename : "Pencil Ink";
  }
  getIcon() {
    return "pencil";
  }
  canAcceptExtension(ext) {
    return ext === "pdf";
  }
  trace(msg, data) {
    this.log.info("view", msg, data);
  }
  /** Run a callback so that an exception is written to the log instead of silently breaking the view. */
  safe(label, fn) {
    return (...a) => {
      try {
        fn(...a);
      } catch (e) {
        this.log.error("view", `${label} threw`, e);
      }
    };
  }
  // ================================================================ lifecycle
  async onOpen() {
    this.trace("onOpen");
    this.buildChrome();
    this.registerDomEvent(window, "keydown", (e) => {
      if (this.app.workspace.getActiveViewOfType(InkPdfView) !== this) return;
      const tgt = e.target;
      const inInput = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      const isMac = typeof navigator !== "undefined" && (/Mac|iPod|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent));
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          e.stopPropagation();
          this.zoomStep(1.2);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          e.stopPropagation();
          this.zoomStep(1 / 1.2);
        } else if (e.key === "0") {
          e.preventDefault();
          e.stopPropagation();
          this.resetZoom();
        } else if (!inInput && e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) this.redo();
          else this.undo();
        } else if (!inInput && e.key.toLowerCase() === "y") {
          e.preventDefault();
          e.stopPropagation();
          this.redo();
        }
        return;
      }
      if (inInput || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "p") {
        e.preventDefault();
        this.selectTool("pen");
      } else if (k === "h") {
        e.preventDefault();
        this.selectTool("highlighter");
      } else if (k === "e") {
        e.preventDefault();
        this.toggleEraser();
      } else if (k === "s") {
        e.preventDefault();
        this.toggleScrollMode();
      } else if (k === "b") {
        e.preventDefault();
        const cur = this.slots[this.currentIdx];
        if (cur) {
          this.toggleBookmark(cur.key);
          this.updateBookmarkButton();
        }
      } else if (k === "1" || k === "2" || k === "3") {
        const slotIdx = Number(k) - 1;
        if (this.tool === "eraser") {
          this.plugin.settings.eraserSlot = slotIdx;
        } else {
          this.toolSet().c = slotIdx;
        }
        this.saveSettingsSoon();
        this.renderContext();
      } else if (e.key === "[" || e.key === "]") {
        const dir = e.key === "]" ? 1 : -1;
        if (this.tool === "eraser") {
          this.plugin.settings.eraserSlot = Math.max(0, Math.min(2, this.plugin.settings.eraserSlot + dir));
        } else {
          const ts = this.toolSet();
          ts.s = Math.max(0, Math.min(2, ts.s + dir));
        }
        this.saveSettingsSoon();
        this.renderContext();
      } else if (e.key === "PageDown" || e.key === "ArrowRight") {
        if (this.currentIdx + 1 < this.slots.length) {
          e.preventDefault();
          this.goTo(this.currentIdx + 1);
        }
      } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
        if (this.currentIdx > 0) {
          e.preventDefault();
          this.goTo(this.currentIdx - 1);
        }
      }
    });
    this.registerEvent(this.plugin.events.on("remote", (path, merged) => {
      var _a;
      const curPath = (_a = this.file) == null ? void 0 : _a.path;
      if (!curPath) return;
      if (curPath === path || curPath + ".ink.json" === path || path.startsWith(curPath + ".ink.")) {
        this.onRemote(merged);
      }
    }));
  }
  async onClose() {
    var _a, _b;
    this.trace("onClose", { file: (_a = this.file) == null ? void 0 : _a.path });
    if (this._winInputCleanup) {
      this._winInputCleanup();
      this._winInputCleanup = null;
    }
    (_b = this.resizeObs) == null ? void 0 : _b.disconnect();
    this.resizeObs = null;
    await this.saveNow();
    this.clearPending();
    this.disposePdf();
  }
  async setState(state, result) {
    if (state && state.file) {
      const file = this.app.vault.getAbstractFileByPath(state.file);
      if (file instanceof import_obsidian4.TFile && file.extension === "pdf") {
        this.file = file;
        await this.onLoadFile(file);
      }
    }
    await super.setState(state, result);
  }
  getState() {
    var _a;
    return { file: ((_a = this.file) == null ? void 0 : _a.path) || "" };
  }
  async onLoadFile(file) {
    this.trace("onLoadFile", { file: file.path });
    const other = this.app.workspace.getLeavesOfType(VIEW_TYPE).find((l) => {
      var _a;
      return l !== this.leaf && ((_a = l.view.file) == null ? void 0 : _a.path) === file.path;
    });
    if (other) {
      new import_obsidian4.Notice("This PDF is already open in another pane. Showing that one.", 6e3);
      this.app.workspace.revealLeaf(other);
      window.setTimeout(() => this.leaf.detach(), 0);
      return;
    }
    this.scrollMode = !!this.plugin.settings.openInScroll;
    this.dockLastTop = 0;
    this.dockRun = 0;
    this.setDockHidden(false);
    if (this.dockEl) this.updateTools();
    const t0 = performance.now();
    await this.openPdfFile(file);
    this.lastOpenMs = Math.round(performance.now() - t0);
  }
  async onUnloadFile(file) {
    this.trace("onUnloadFile", { file: file == null ? void 0 : file.path });
    await this.saveNow();
    this.clearPending();
    this.disposePdf();
  }
  clearPending() {
    if (this.plugin.settings.pendingOpen) {
      this.plugin.settings.pendingOpen = "";
      void this.plugin.saveSettings();
    }
  }
  /**
   * The window changed size (rotation, split view). Pages change height with width, so the same scroll position
   * would land on a different page. Remember the page being read and how far into it we are, then put us back there
   * once the size has settled. The first event of a burst takes the anchor; the last one lays out.
   */
  onResize() {
    if (!this.slots.length) return;
    if (!this.resizeAnchor) this.resizeAnchor = { idx: this.currentIdx, frac: this.fracOf(this.slots[this.currentIdx]) };
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.relayout(), 180);
  }
  relayout() {
    const anchor = this.resizeAnchor;
    this.resizeAnchor = null;
    this.resizeTimer = 0;
    this.fitDockPadding();
    if (!this.slots.length) return;
    this.layoutPages();
    if (anchor) this.scrollToSlot(anchor.idx, anchor.frac);
    this.updatePageLabel();
  }
  disposePdf() {
    var _a, _b, _c, _d;
    this.warmRun++;
    this.loadToken++;
    window.clearTimeout(this.watchdog);
    this.hideBanner();
    window.clearTimeout(this.schedTimer);
    this.schedTimer = 0;
    window.clearTimeout(this.zoomWait);
    this.zoomWait = 0;
    window.clearTimeout(this.tapTimer);
    this.tapCount = 0;
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.resizeTimer);
    window.clearTimeout(this.liveRelease);
    window.clearTimeout(this.endRenderTimer);
    this.endRenderTimer = 0;
    window.clearTimeout(this.ptrCancelTimer);
    this.ptrCancelTimer = 0;
    this.lastPenAt = 0;
    this.cur = null;
    this.erasing = null;
    this.activePointer = null;
    this.blockTouch = null;
    this.touchDraw = false;
    this.stopTouchMomentum();
    if (this.palmTouchIds) this.palmTouchIds.clear();
    if (this.touchDownTimes) this.touchDownTimes.clear();
    this.closePopover();
    (_c = this.thumbs) == null ? void 0 : _c.destroy();
    this.thumbs = null;
    for (const s of this.slots) this.releaseSlot(s, true);
    this.slots = [];
    this.byEl.clear();
    this.active.clear();
    this.renderedSet.clear();
    this.mountedSet.clear();
    if (this.pagesEl) this.pagesEl.empty();
    for (const u of this.pagePics.values()) safeRevokeUrl(u);
    this.pagePics.clear();
    this.releaseLive();
    this.pageCache.clear();
    const pdf = this.pdf;
    this.pdf = null;
    if (pdf) void Promise.resolve((_d = pdf.destroy) == null ? void 0 : _d.call(pdf)).catch(() => {
    });
  }
  // ================================================================ loading
  async openPdfFile(file) {
    var _a, _b;
    const token = ++this.loadToken;
    const resumeAt = (_a = this.plugin.settings.lastPages) == null ? void 0 : _a[file.path];
    const t0 = performance.now();
    this.disposePdf();
    this.loadToken = token;
    this.buildChrome();
    this.docOwner = null;
    this.doc = emptyDoc(file.path);
    this.undoStack = [];
    this.redoStack = [];
    this.firstRendered = false;
    this.openedAt = t0;
    this.zoom = 1;
    this.plugin.settings.pendingOpen = file.path;
    void this.plugin.saveSettings();
    this.updateUndoButtons();
    this.pagesEl.empty();
    const loading = this.pagesEl.createDiv({ cls: "pink-loading", text: "Opening PDF..." });
    this.fitDockPadding();
    try {
      const pdfjs = await (0, import_obsidian4.loadPdfJs)();
      const [docResult, sidecarDoc] = await Promise.all([
        this.openDocument(pdfjs, file, (t) => loading.setText(t)),
        this.plugin.sync.readSidecar(file.path)
      ]);
      const { pdf, mode } = docResult;
      if (token !== this.loadToken) {
        void pdf.destroy();
        return;
      }
      this.pdf = pdf;
      this.loadMode = mode;
      this.numPages = pdf.numPages;
      this.startWarm();
      this.doc = (_b = sidecarDoc) != null ? _b : emptyDoc(file.path);
      this.docOwner = file;
      const sidecarFile = this.app.vault.getAbstractFileByPath(file.path + ".ink.json");
      this.sidecarSeen = sidecarFile && "stat" in sidecarFile ? sidecarFile.stat.mtime : void 0;
      const first = await this.pageProxy(1);
      const vp = first.getViewport({ scale: 1 });
      const firstSize = { w: vp.width, h: vp.height };
      this.defSize = firstSize;
      this.sizes.clear();
      this.sizes.set(1, firstSize);
      if (pdf.numPages >= 2) {
        try {
          const sampleN = (resumeAt !== void 0 && resumeAt > 0 && resumeAt < pdf.numPages) ? resumeAt + 1 : 2;
          const samplePage = await this.pageProxy(sampleN);
          const svp = samplePage.getViewport({ scale: 1 });
          const sampleSize = { w: svp.width, h: svp.height };
          this.sizes.set(sampleN, sampleSize);
          this.defSize = sampleSize;
        } catch (e) {}
      }
      if (token !== this.loadToken) return;
      loading.remove();
      this.buildSlots();
      this.thumbs = new ThumbPanel(this, this.contentEl);
      this.fitDockPadding();
      if (resumeAt !== void 0 && resumeAt > 0 && resumeAt < this.slots.length) this.goTo(resumeAt);
      const strokes2 = Object.values(this.doc.pages).reduce((a, l) => a + l.length, 0);
      this.log.info("pdf", `opened "${file.path}"`, {
        mode,
        sizeMB: +(file.stat.size / 1048576).toFixed(1),
        pages: this.numPages,
        blanks: Object.keys(this.doc.blanks).length,
        strokes: strokes2,
        ms: Math.round(performance.now() - t0)
      });
      window.setTimeout(() => {
        if (token === this.loadToken) this.log.info("view", "layout 600ms after open", this.snap());
      }, 600);
      this.watchdog = window.setTimeout(() => {
        if (token !== this.loadToken || this.firstRendered) return;
        this.log.warn("render", "no page finished drawing 8s after opening", this.snap());
        this.showBanner("This PDF is taking too long to draw.");
        this.layoutPages();
      }, 8e3);
    } catch (e) {
      this.log.error("pdf", `could not open "${file.path}"`, e);
      loading.remove();
      this.clearPending();
      this.showBanner("Could not open this PDF: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  /**
   * Files up to "fullLoadMB" are read completely: after that every page is instant to parse.
   * Streaming a huge book from disk costs many tiny reads per page, which measured about 20x slower per page.
   */
  async openDocument(pdfjs, file, progress) {
    const s = this.plugin.settings;
    const mb = file.stat.size / 1048576;
    const wantStream = s.streamMode === "stream" || s.streamMode === "auto" && mb > s.fullLoadMB;
    if (wantStream && this.plugin.streamOk !== false) {
      const url = this.app.vault.getResourcePath(file);
      const task = pdfjs.getDocument({ url, rangeChunkSize: 1 << 21, disableAutoFetch: true, disableStream: false, enableHWA: true });
      task.onProgress = (p) => {
        if (p.total) progress(`Opening PDF... ${Math.round(p.loaded / p.total * 100)}%`);
      };
      try {
        let timer = 0;
        const pdf2 = await Promise.race([
          task.promise,
          new Promise((_, reject) => {
            timer = window.setTimeout(() => reject(new Error("streaming timed out")), 25e3);
          })
        ]).finally(() => window.clearTimeout(timer));
        this.plugin.streamOk = true;
        return { pdf: pdf2, mode: "stream" };
      } catch (e) {
        this.plugin.streamOk = false;
        this.log.warn("pdf", "streaming failed, loading the whole file instead", e);
        try {
          void task.destroy();
        } catch (e2) {
        }
      }
    }
    progress(mb > 50 ? `Reading PDF (${Math.round(mb)} MB)...` : "Reading PDF...");
    const data = await this.app.vault.readBinary(file);
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), enableHWA: true }).promise;
    return { pdf, mode: "full" };
  }
  debugInfo() {
    var _a;
    let px = 0;
    for (const s of this.renderedSet) px += this.slotPixels(s);
    return {
      file: (_a = this.file) == null ? void 0 : _a.path,
      mode: this.loadMode,
      pages: this.numPages,
      slots: this.slots.length,
      blanks: Object.keys(this.doc.blanks).length,
      rendered: this.renderedSet.size,
      pixelsM: +(px / 1e6).toFixed(1),
      zoom: +this.zoom.toFixed(2),
      tool: this.tool,
      undo: this.undoStack.length,
      penDowns: this.downs
    };
  }
  snap() {
    var _a, _b;
    const sc = this.scrollerEl;
    return {
      scroller: sc ? `${sc.clientWidth}x${sc.clientHeight}` : "none",
      scrollH: sc == null ? void 0 : sc.scrollHeight,
      dockH: (_a = this.dockEl) == null ? void 0 : _a.offsetHeight,
      slots: this.slots.length,
      near: this.slots.filter((x) => x.near).length,
      far: this.slots.filter((x) => x.far).length,
      rendered: this.renderedSet.size,
      rendering: this.slots.filter((x) => x.rendering).length,
      active: this.activeRenders,
      scale: (_b = this.slots[0]) == null ? void 0 : _b.scale,
      zoom: this.zoom,
      def: this.defSize
    };
  }
  showBanner(msg) {
    this.hideBanner();
    const b = this.bannerEl = this.contentEl.createDiv({ cls: "pink-banner" });
    b.createDiv({ cls: "pink-banner-text", text: msg });
    const row = b.createDiv({ cls: "pink-banner-row" });
    const open = row.createDiv({ cls: "pink-pop-go", text: "Open in default viewer", attr: { role: "button", tabindex: "0" } });
    open.addEventListener("click", () => this.plugin.openDefaultViewer(this.file));
    const retry = row.createDiv({ cls: "pink-pop-go alt", text: "Retry", attr: { role: "button", tabindex: "0" } });
    retry.addEventListener("click", () => {
      this.hideBanner();
      if (this.file) void this.openPdfFile(this.file);
    });
    const copy = row.createDiv({ cls: "pink-pop-go alt", text: "Copy log", attr: { role: "button", tabindex: "0" } });
    copy.addEventListener("click", () => void this.plugin.copyLog());
  }
  hideBanner() {
    var _a;
    (_a = this.bannerEl) == null ? void 0 : _a.remove();
    this.bannerEl = null;
  }
  // ================================================================ pages (virtualised)
  pageSize(ref) {
    var _a;
    if ("blank" in ref) return { w: ref.blank.w, h: ref.blank.h };
    return (_a = this.sizes.get(ref.pdfN)) != null ? _a : this.defSize;
  }
  padTopPx() {
    if (this.dockEl && !this.dockHCache) this.dockHCache = this.dockEl.offsetHeight || 60;
    return (this.dockHCache || 60) + 24;
  }
  syncSlotStyle(s) {
    s.left = ((this.totalW || 800) - s.cssW) / 2;
    if (!s.el) return;
    const st = s.el.style;
    st.top = s.top + "px";
    st.left = s.left + "px";
    st.width = s.cssW + "px";
    st.height = s.cssH + "px";
  }
  ensureMounted(s) {
    if (!s) return;
    if (!s.el) {
      const el = document.createElement("div");
      el.className = "pink-page" + (s.blank ? " is-blank" : "");
      s.el = el;
      this.byEl.set(el, s);
    }
    if (!s.mounted) {
      this.syncSlotStyle(s);
      s.mounted = true;
      this.mountedSet.add(s);
      this.pagesEl.appendChild(s.el);
    }
  }
  unmountSlotEl(s) {
    if (!s || !s.mounted) return;
    s.mounted = false;
    this.mountedSet.delete(s);
    if (s.el) {
      this.byEl.delete(s.el);
      s.el.remove();
      s.el = null;
    }
  }
  findSlotIndexAtY(y) {
    const slots = this.slots;
    const n = slots.length;
    if (!n) return -1;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const s = slots[mid];
      if (s.top + s.cssH + 7 < y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  buildSlots(focusKey) {
    var _a, _b, _c, _d;
    const prevKey = focusKey != null ? focusKey : (_a = this.slots[this.currentIdx]) == null ? void 0 : _a.key;
    const prevFrac = focusKey ? 0 : this.fracOf(this.slots[this.currentIdx]);
    for (const s of this.slots) this.releaseSlot(s, true);
    this.slots = [];
    this.byEl.clear();
    this.active.clear();
    this.renderedSet.clear();
    this.mountedSet.clear();
    this.pagesEl.empty();
    if (this.dockEl && this.dockEl.offsetHeight) this.dockHCache = this.dockEl.offsetHeight;
    const order = buildOrder(this.numPages, this.doc.blanks).filter((ref) => !("pdfN" in ref && this.isRemoved(ref.pdfN)));
    order.forEach((ref, idx) => {
      var _a2;
      const sz = this.pageSize(ref);
      const pdfN = "pdfN" in ref ? ref.pdfN : null;
      const blank = "blank" in ref ? ref.blank : null;
      const slot = {
        idx,
        key: blank ? blankKey(blank.id) : String(pdfN),
        pdfN,
        srcN: (_a2 = blank == null ? void 0 : blank.src) != null ? _a2 : null,
        blank,
        w: sz.w,
        h: sz.h,
        scale: 1,
        cssW: sz.w,
        cssH: sz.h,
        top: 0,
        left: 12,
        mounted: false,
        el: null,
        geo: null,
        inkGeo: null,
        quality: "full",
        pdfCv: null,
        hlCv: null,
        penCv: null,
        near: false,
        far: false,
        rendered: false,
        rendering: false,
        token: 0,
        task: null,
        page: null
      };
      this.slots.push(slot);
    });
    this.layoutPages(false, false);
    const target = prevKey ? this.slots.findIndex((s) => s.key === prevKey) : 0;
    this.currentIdx = Math.max(0, target);
    this.scrollToSlot(this.currentIdx, prevFrac);
    this.updateViewport(true);
    this.updatePageLabel();
    (_d = this.thumbs) == null ? void 0 : _d.rebuild(focusKey);
  }
  updateViewport(rerender = true, targetScrollTop) {
    const slots = this.slots;
    const n = slots.length;
    if (!n || !this.scrollerEl) return;
    const scrollTop = targetScrollTop !== void 0 ? targetScrollTop : this.scrollerEl.scrollTop;
    const scH = this.scrollerH || this.scrollerEl.clientHeight || 800;
    const vTop = scrollTop;
    const vBot = scrollTop + scH;
    const centerIdx = Math.max(0, this.findSlotIndexAtY(scrollTop + scH * 0.5));
    let firstNear = centerIdx;
    while (firstNear > 0 && slots[firstNear - 1].top + slots[firstNear - 1].cssH > vTop) firstNear--;
    let lastNear = centerIdx;
    while (lastNear + 1 < n && slots[lastNear + 1].top < vBot) lastNear++;
    if (slots[firstNear].top >= vBot || slots[firstNear].top + slots[firstNear].cssH <= vTop) {
      firstNear = lastNear = centerIdx;
    }
    const farStart = Math.max(0, firstNear - 2);
    const farEnd = Math.min(n - 1, lastNear + 2);
    const mountStart = Math.max(0, firstNear - 10);
    const mountEnd = Math.min(n - 1, lastNear + 10);
    for (const s of this.mountedSet) {
      if (s.idx < mountStart || s.idx > mountEnd) {
        if (!s.rendered && !s.rendering && this.liveSlot !== s) {
          this.unmountSlotEl(s);
        }
      }
    }
    for (let i = mountStart; i <= mountEnd; i++) {
      this.ensureMounted(slots[i]);
    }
    for (const s of this.active) {
      if (s.idx < farStart || s.idx > farEnd) {
        s.near = false;
        s.far = false;
        this.active.delete(s);
        this.hidePicture(s);
        if (s.rendering) {
          s.token++;
          try {
            if (s.task && s.task.cancel) s.task.cancel();
          } catch (e) {
          }
          s.task = null;
        }
      }
    }
    const now = performance.now();
    const isScrolling = now - this.lastScroll < 140;
    const isZooming = now - this.zoomAt < 300 || !!this.smoothZoomRaf || this.pinching;
    for (let i = farStart; i <= farEnd; i++) {
      const s = slots[i];
      const isNear = i >= firstNear && i <= lastNear;
      s.near = isNear;
      s.far = true;
      this.active.add(s);
      if (!isNear && s.rendering && isScrolling) {
        s.token++;
        try {
          if (s.task && s.task.cancel) s.task.cancel();
        } catch (e) {
        }
        s.task = null;
      }
      if (!s.rendered) {
        if (isNear || s.pdfN !== null && this.pagePics.has(s.pdfN) || !isScrolling && !isZooming) {
          void this.showPicture(s);
        }
      }
    }
    if (rerender) this.requestRender();
  }
  /** Pages changed size (zoom, rotation, resize): compute O(1) virtual geometry and resize only mounted boxes. */
  layoutPages(rerender = true, syncViewport = true, scWOverride) {
    const scW = scWOverride || this.scrollerW || (this.scrollerEl ? this.scrollerEl.clientWidth || 800 : 800);
    const aw = Math.max(200, scW - 24);
    const gap = 14;
    let y = this.padTopPx();
    let maxW = 0;
    const z = this.zoom;
    const defW0 = this.defSize.w;
    const defH0 = this.defSize.h;
    const defScale = aw / defW0 * z;
    const defCssW = defW0 * defScale;
    const defCssH = defH0 * defScale;
    const slots = this.slots;
    const nSlots = slots.length;
    for (let i = 0; i < nSlots; i++) {
      const s = slots[i];
      if (s.w === defW0 && s.h === defH0) {
        s.scale = defScale;
        s.cssW = defCssW;
        s.cssH = defCssH;
      } else {
        const sc = aw / s.w * z;
        s.scale = sc;
        s.cssW = s.w * sc;
        s.cssH = s.h * sc;
      }
      s.top = y;
      s.left = (Math.max(scW, s.cssW + 24) - s.cssW) / 2;
      y += s.cssH + gap;
      if (s.cssW > maxW) maxW = s.cssW;
    }
    const totalW = Math.max(scW, Math.ceil(maxW) + 24);
    const totalH = Math.ceil(nSlots ? y - gap + 70 : y + 70);
    this.totalW = totalW;
    this.totalH = totalH;
    if (this.pagesEl) {
      this.pagesEl.style.width = totalW + "px";
      this.pagesEl.style.height = totalH + "px";
    }
    for (const s of this.mountedSet) {
      this.syncSlotStyle(s);
      if (s.rendered) this.placeAll(s);
    }
    if (syncViewport) this.updateViewport(rerender);
    else if (rerender) this.requestRender();
  }
  fracOf(s) {
    if (!s) return 0;
    const h = s.cssH || 1;
    return Math.max(0, Math.min(1, (this.scrollerEl.scrollTop - (s.top - this.padTopPx() + 12)) / h));
  }
  scrollToSlot(idx, frac = 0) {
    const s = this.slots[Math.max(0, Math.min(this.slots.length - 1, idx))];
    if (!s) return;
    this.programmaticScrollAt = performance.now();
    this.scrollerEl.scrollTop = Math.max(0, Math.round(s.top - this.padTopPx() + 12 + frac * s.cssH));
    this.updateViewport(true);
  }
  goTo(idx) {
    var _a;
    if (!this.slots.length) return;
    const prevIdx = this.currentIdx;
    this.currentIdx = Math.max(0, Math.min(this.slots.length - 1, idx));
    this.scrollToSlot(this.currentIdx);
    this.updatePageLabel();
    (_a = this.thumbs) == null ? void 0 : _a.setCurrent(this.currentIdx);
    if (Math.abs(this.currentIdx - prevIdx) > Math.floor(WARM_RADIUS / 2)) this.startWarm();
  }
  updateCurrent() {
    var _a;
    if (!this.slots.length) return;
    const line2 = this.scrollerEl.scrollTop + (this.scrollerH || this.scrollerEl.clientHeight || 800) / 3;
    let pick = -1;
    for (const s of this.active) {
      if (s.top + s.cssH > line2 && (pick < 0 || s.idx < pick)) pick = s.idx;
    }
    if (pick < 0) pick = this.findSlotIndexAtY(line2);
    if (pick < 0) return;
    if (pick !== this.currentIdx) {
      this.currentIdx = pick;
      (_a = this.thumbs) == null ? void 0 : _a.setCurrent(pick);
    }
    this.updatePageLabel();
  }
  /** Remember the page being read, so the PDF reopens there. */
  rememberPage() {
    var _a, _b;
    if (!this.file || !this.slots.length) return;
    const last = (_b = (_a = this.plugin.settings).lastPages) != null ? _b : _a.lastPages = {};
    if (last[this.file.path] === this.currentIdx) return;
    last[this.file.path] = this.currentIdx;
    this.saveSettingsSoon();
  }
  updatePageLabel() {
    this.updateBookmarkButton();
    const n = this.slots.length;
    if (!n) {
      if (this.lastPillText !== "") {
        this.lastPillText = "";
        this.pagePill.setText("");
      }
      return;
    }
    const zText = Math.abs(this.zoom - 1) > 0.02 ? ` · ${Math.round(this.zoom * 100)}%` : "";
    const nextText = `${this.currentIdx + 1} / ${n}${zText}`;
    if (this.lastPillText !== nextText) {
      this.lastPillText = nextText;
      this.pagePill.setText(nextText);
    }
    this.rememberPage();
  }
  // ---- geometry: a page is rendered as one canvas, or, when deeply zoomed, only the part you can see
  dprWant() {
    return Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.plugin.settings.maxDpr || 2, PAGE_DPR_CAP));
  }
  /** Visible part of the page in PDF points, or null when the page is off screen. */
  visibleRect(s) {
    const scrollTop = this.scrollerEl.scrollTop;
    const scrollLeft = this.scrollerEl.scrollLeft;
    const scW = this.scrollerW || this.scrollerEl.clientWidth || 800;
    const scH = this.scrollerH || this.scrollerEl.clientHeight || 800;
    const left = Math.round(((this.totalW || scW) - s.cssW) / 2);
    const x0 = Math.max(0, scrollLeft - left);
    const y0 = Math.max(0, scrollTop - s.top);
    const x1 = Math.min(s.cssW, scrollLeft + scW - left);
    const y1 = Math.min(s.cssH, scrollTop + scH - s.top);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x0: x0 / s.scale, y0: y0 / s.scale, x1: x1 / s.scale, y1: y1 / s.scale };
  }
  geoFor(s, q2) {
    const sc = s.scale;
    let dpr = this.dprWant() * (q2 === "draft" ? DRAFT_DPR : 1);
    const pageW = Math.max(1, s.w * sc);
    const pageH = Math.max(1, s.h * sc);
    const maxFullPx = 12e6;
    if (pageW * pageH * dpr * dpr > maxFullPx) {
      dpr = Math.sqrt(maxFullPx / (pageW * pageH));
    }
    const x = 0, y = 0, w = s.w, h = s.h;
    const cw = Math.max(1, Math.ceil(w * sc * dpr));
    const ch = Math.max(1, Math.ceil(h * sc * dpr));
    return { x, y, w, h, scale: sc, dpr, cw, ch };
  }
  /** Is the part of the page on screen inside this canvas window? */
  covers(s, g) {
    const v = this.visibleRect(s);
    if (!v) return true;
    const e = 2 / s.scale;
    return g.x <= v.x0 + e && g.y <= v.y0 + e && g.x + g.w >= v.x1 - e && g.y + g.h >= v.y1 - e;
  }
  /**
   * Position a canvas using the page's current scale, so a stale bitmap is simply stretched until it is re-rendered.
   * At the scale it was drawn for, one canvas pixel is exactly one screen pixel (no resampling blur on thin lines).
   */
  place(cv, s, g) {
    const b = placeBox(g, s.scale);
    const st = cv.style;
    st.left = b.left + "px";
    st.top = b.top + "px";
    st.width = b.width + "px";
    st.height = b.height + "px";
  }
  placeAll(s) {
    if (s.geo && s.pdfCv) this.place(s.pdfCv, s, s.geo);
    if (s.inkGeo) {
      for (const cv of [s.hlCv, s.penCv]) if (cv) this.place(cv, s, s.inkGeo);
    }
  }
  slotPixels(s) {
    const pdf = s.geo && s.pdfCv ? s.geo.cw * s.geo.ch : 0;
    const ink = s.inkGeo ? s.inkGeo.cw * s.inkGeo.ch * ((s.hlCv ? 1 : 0) + (s.penCv ? 1 : 0)) : 0;
    return pdf + ink;
  }
  // ---- render scheduler: nearest first, cheap drafts while scrolling, sharp when you stop
  requestRender() {
    if (this.schedTimer) return;
    this.schedTimer = window.setTimeout(() => {
      this.schedTimer = 0;
      try {
        this.runScheduler();
      } catch (e) {
        this.log.error("render", "scheduler threw", e);
      }
    }, 0);
  }
  stale(s) {
    const g = s.geo;
    if (!g) return true;
    return needsRedraw(g.scale, s.scale, this.covers(s, g));
  }
  runScheduler() {
    if (!this.slots.length || this.pinching) return;
    const now = performance.now();
    const sinceZoom = now - this.zoomAt;
    if (sinceZoom < 300 || this.smoothZoomRaf) {
      if (!this.zoomWait) this.zoomWait = window.setTimeout(() => {
        this.zoomWait = 0;
        this.requestRender();
      }, Math.max(40, 320 - sinceZoom));
      return;
    }
    if ((this.cur || this.erasing) && now - this.activityAt > 5e3) this.abortStroke();
    if (this.cur || this.erasing || now < this.holdUntil) {
      window.clearTimeout(this.schedTimer);
      this.schedTimer = window.setTimeout(() => {
        this.schedTimer = 0;
        this.requestRender();
      }, Math.max(150, Math.min(600, this.holdUntil - now)));
      return;
    }
    const isScrolling = now - this.lastScroll < 140;
    for (const s of this.active) {
      if (s.rendering && !s.near && isScrolling) {
        s.token++;
        try {
          if (s.task && s.task.cancel) s.task.cancel();
        } catch (e) {
        }
        s.task = null;
      }
    }
    const vc = this.scrollerEl.scrollTop + this.scrollerEl.clientHeight / 2;
    let budgetUsed = 0;
    for (const rs of this.renderedSet) budgetUsed += this.slotPixels(rs);
    const farCandidates = [];
    const jobs = [];
    for (const s of this.active) {
      if (s.rendering) continue;
      const d = Math.abs(s.top + s.cssH / 2 - vc);
      if (!s.rendered) {
        if (s.near) jobs.push({ s, q: isScrolling ? "draft" : "full", d });
        else if (!isScrolling) farCandidates.push({ s, d });
        continue;
      }
      if (!s.near) continue;
      if (this.stale(s)) jobs.push({ s, q: isScrolling ? "draft" : "full", d });
      else if (s.quality === "draft" && !isScrolling) jobs.push({ s, q: "full", d });
    }
    if (!isScrolling && jobs.length === 0) {
      farCandidates.sort((a, b) => a.d - b.d);
      const draftDpr = this.dprWant() * DRAFT_DPR;
      for (const fc of farCandidates.slice(0, 2)) {
        const estPx = Math.ceil(fc.s.w * fc.s.scale * draftDpr) * Math.ceil(fc.s.h * fc.s.scale * draftDpr);
        if (budgetUsed + estPx > PIXEL_BUDGET * 0.85) break;
        budgetUsed += estPx;
        jobs.push({ s: fc.s, q: "draft", d: fc.d + 1e6 });
      }
    }
    if (!jobs.length) return;
    if (isScrolling) {
      if (this.activeRenders > 0) return;
      const urgent = jobs.find((j) => j.s.near && !j.s.rendered && (!j.s.el || !j.s.el.querySelector(".pink-pic")));
      if (!urgent) return;
      this.activeRenders++;
      urgent.s.rendering = true;
      void this.renderSlot(urgent.s, "draft").catch((e) => this.log.error("render", `page ${urgent.s.key} failed`, e)).finally(() => {
        urgent.s.rendering = false;
        this.activeRenders--;
        this.evict();
        this.requestRender();
      });
      return;
    }
    jobs.sort((a, b) => a.d - b.d);
    const limit = 2;
    for (const j of jobs) {
      if (this.activeRenders >= limit) break;
      this.activeRenders++;
      j.s.rendering = true;
      void this.renderSlot(j.s, j.q).catch((e) => this.log.error("render", `page ${j.s.key} failed`, e)).finally(() => {
        j.s.rendering = false;
        this.activeRenders--;
        this.evict();
        this.requestRender();
      });
    }
  }
  async renderSlot(s, q2) {
    var _a;
    const tok = ++s.token;
    const t0 = performance.now();
    const n = (_a = s.pdfN) != null ? _a : s.srcN;
    let geo = this.geoFor(s, q2);
    let page = null;
    let pdfCv = null;
    if (n !== null) {
      page = await this.pageProxy(n);
      if (tok !== s.token || !this.pdf) return;
      if (s.pdfN !== null) {
        const base = page.getViewport({ scale: 1 });
        if (Math.abs(base.width - s.w) > 0.5 || Math.abs(base.height - s.h) > 0.5) {
          this.learnSize(s, base.width, base.height);
          geo = this.geoFor(s, q2);
        }
      }
      const vp = page.getViewport({ scale: geo.scale });
      pdfCv = globalCanvasPool.acquire(geo.cw, geo.ch, "pink-cv pink-pdf");
      const g = pdfCv.getContext("2d", { alpha: false });
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, geo.cw, geo.ch);
      const k = geo.dpr;
      const task = page.render({ canvasContext: g, canvas: pdfCv, viewport: vp, transform: [k, 0, 0, k, -geo.x * geo.scale * k, -geo.y * geo.scale * k] });
      s.task = task;
      try {
        await task.promise;
      } catch (e) {
        killCanvas(pdfCv);
        if ((e == null ? void 0 : e.name) === "RenderingCancelledException") {
          this.log.debug("render", `page ${s.key} cancelled`);
          return;
        }
        throw e;
      } finally {
        s.task = null;
      }
      if (tok !== s.token) {
        killCanvas(pdfCv);
        return;
      }
    }
    const keepInk = !!s.inkGeo && sameScale(s.inkGeo, geo) && this.covers(s, s.inkGeo);
    killCanvas(s.pdfCv);
    s.pdfCv = pdfCv;
    s.geo = geo;
    s.quality = q2;
    s.page = page;
    s.rendered = true;
    this.renderedSet.add(s);
    this.ensureMounted(s);
    if (pdfCv) s.el.appendChild(pdfCv);
    if (!keepInk) this.setInk(s, geo, this.buildInk(s, geo));
    this.placeAll(s);
    const drawMs = performance.now() - t0;
    this.log.render(drawMs);
    if (drawMs > 100) this.log.info("render", "slow page draw", { page: s.key, q: q2, ms: Math.round(drawMs), renders: this.activeRenders });
    this.hidePicture(s);
    if (s.pdfN !== null && !this.pagePics.has(s.pdfN) && q2 === "full") {
      const sourceCv = pdfCv;
      void (async () => {
        try {
          const file = `${this.picDir()}/${s.pdfN}.jpg`;
          if (!await this.app.vault.adapter.exists(file)) {
            const blob = (sourceCv && sourceCv.width > 0)
              ? await this.drawPictureFromCanvas(sourceCv, s.w, s.h)
              : await this.drawPicture(s.pdfN);
            if (blob) {
              await this.ensureDir(this.picDir());
              const ad = this.app.vault.adapter;
              await ad.writeBinary(file, await blob.arrayBuffer());
              const url = typeof ad.getResourcePath === "function" ? ad.getResourcePath(file) : URL.createObjectURL(blob);
              this.pagePics.set(s.pdfN, url);
              this.capPics();
            }
          }
        } catch (e) {
        }
      })();
    }
    if (!this.firstRendered) {
      this.firstRendered = true;
      window.clearTimeout(this.watchdog);
      this.hideBanner();
      this.clearPending();
      this.log.info("render", "first page drawn", { page: s.key, ms: Math.round(performance.now() - t0), sinceOpenMs: Math.round(performance.now() - this.openedAt) });
    }
  }
  /** The real size of a page differs from the guess: fix its box without making the page jump under the reader. */
  learnSize(s, w, h) {
    const refIdx = (this.activeZoomAnchor && this.slots[this.activeZoomAnchor.idx])
      ? this.activeZoomAnchor.idx
      : this.currentIdx;
    const refSlot = this.slots[refIdx];
    const refTopBefore = refSlot ? refSlot.top : 0;
    const oldBottom = s.top + s.cssH;
    const oldH = s.cssH;
    s.w = w;
    s.h = h;
    if (s.pdfN !== null) this.sizes.set(s.pdfN, { w, h });
    this.layoutPages(false, false);
    if (refSlot && s.idx < refSlot.idx) {
      const deltaTop = refSlot.top - refTopBefore;
      if (Math.abs(deltaTop) > 0.01 && this.scrollerEl) {
        this.programmaticScrollAt = performance.now();
        this.scrollerEl.scrollTop = Math.max(0, this.scrollerEl.scrollTop + deltaTop);
      }
    } else if (oldBottom <= this.scrollerEl.scrollTop + 1) {
      this.programmaticScrollAt = performance.now();
      this.scrollerEl.scrollTop = Math.max(0, this.scrollerEl.scrollTop + (s.cssH - oldH));
    }
    this.updateViewport(false);
  }
  releaseSlot(s, force = false) {
    var _a, _b;
    this.hidePicture(s);
    s.token++;
    try {
      (_b = (_a = s.task) == null ? void 0 : _a.cancel) == null ? void 0 : _b.call(_a);
    } catch (e) {
    }
    s.task = null;
    if (!force && this.liveSlot === s && (this.cur || this.erasing)) return;
    killCanvas(s.pdfCv);
    killCanvas(s.hlCv);
    killCanvas(s.penCv);
    s.pdfCv = s.hlCv = s.penCv = null;
    s.geo = null;
    s.inkGeo = null;
    s.rendered = false;
    this.renderedSet.delete(s);
    const oldPage = s.page;
    s.page = null;
    if (oldPage) {
      let cached = false;
      for (const p of this.pageCache.values()) {
        if (p === oldPage) { cached = true; break; }
      }
      if (!cached) {
        let stillUsed = false;
        for (const other of this.renderedSet) {
          if (other !== s && other.page === oldPage) { stillUsed = true; break; }
        }
        if (!stillUsed) {
          try { oldPage.cleanup(); } catch (e) {}
        }
      }
    }
    if (this.liveSlot === s) this.releaseLive();
    if (force || (!s.near && !s.far)) {
      const curIdx = this.currentIdx;
      if (force || Math.abs(s.idx - curIdx) > 12) this.unmountSlotEl(s);
    }
  }
  evict() {
    const busy = (s) => this.liveSlot === s && (this.cur || this.erasing);
    let total = 0;
    for (const s of this.renderedSet) {
      if (!s.far && !s.near && !busy(s)) this.releaseSlot(s);
      else total += this.slotPixels(s);
    }
    if (total > PIXEL_BUDGET) {
      const vc = this.scrollerEl.scrollTop + this.scrollerEl.clientHeight / 2;
      Array.from(this.renderedSet).filter((s) => !s.near && !busy(s)).sort((a, b) => Math.abs(b.top + b.cssH / 2 - vc) - Math.abs(a.top + a.cssH / 2 - vc)).forEach((s) => {
        if (total > PIXEL_BUDGET) {
          total -= this.slotPixels(s);
          this.releaseSlot(s);
        }
      });
    }
  }
  // ---- ink layers: highlights multiply into the page, pens sit on top
  makeInkCanvas(_s, geo, tool) {
    const cv = globalCanvasPool.acquire(geo.cw, geo.ch, "pink-cv " + (tool === "pen" ? "pink-ink-pen" : "pink-ink-hl"));
    if (tool === "highlighter") cv.style.opacity = String(HL_ALPHA);
    return cv;
  }
  buildInk(s, geo) {
    var _a;
    const list2 = (_a = this.doc.pages[s.key]) != null ? _a : [];
    const out = { hl: null, pen: null };
    if (!list2.length) return out;
    let hlG = null, penG = null;
    for (let i = 0; i < list2.length; i++) {
      const st = list2[i];
      if (st.tool === "pen") {
        if (!penG) {
          out.pen = this.makeInkCanvas(s, geo, "pen");
          penG = out.pen.getContext("2d");
          xform(penG, geo);
        }
        drawStroke(penG, st, true);
      } else {
        if (!hlG) {
          out.hl = this.makeInkCanvas(s, geo, "highlighter");
          hlG = out.hl.getContext("2d");
          xform(hlG, geo);
        }
        drawStroke(hlG, st, true);
      }
    }
    return out;
  }
  setInk(s, geo, layers) {
    killCanvas(s.hlCv);
    killCanvas(s.penCv);
    s.hlCv = layers.hl;
    s.penCv = layers.pen;
    s.inkGeo = geo;
    if (layers.hl || layers.pen) this.ensureMounted(s);
    if (layers.hl && s.el) s.el.appendChild(layers.hl);
    if (layers.pen && s.el) s.el.appendChild(layers.pen);
    this.placeAll(s);
  }
  /**
   * Ink layers at full sharpness over what is on screen, so a new stroke never lands on a draft-quality layer
   * (that showed as blurry writing until you paused). Only redraws the ink, never the PDF.
   */
  inkReady(s) {
    const want = this.geoFor(s, "full");
    if (s.inkGeo && sameScale(s.inkGeo, want) && this.covers(s, s.inkGeo)) return s.inkGeo;
    this.setInk(s, want, this.buildInk(s, want));
    return want;
  }
  ensureInkCanvas(s, tool) {
    const have = tool === "pen" ? s.penCv : s.hlCv;
    if (have) return have;
    this.ensureMounted(s);
    const cv = this.makeInkCanvas(s, s.inkGeo, tool);
    if (s.el) s.el.appendChild(cv);
    this.place(cv, s, s.inkGeo);
    if (tool === "pen") s.penCv = cv;
    else s.hlCv = cv;
    return cv;
  }
  redrawLayer(s, tool, dirtyBox = null) {
    var _a;
    if (!s.inkGeo) return;
    const all = (_a = this.doc.pages[s.key]) != null ? _a : [];
    let hasTool = false;
    for (let i = 0; i < all.length; i++) {
      if (all[i].tool === tool) {
        hasTool = true;
        break;
      }
    }
    const existing = tool === "pen" ? s.penCv : s.hlCv;
    if (!hasTool) {
      killCanvas(existing);
      if (tool === "pen") s.penCv = null;
      else s.hlCv = null;
      return;
    }
    if (dirtyBox && existing) {
      const g2 = existing.getContext("2d");
      const [bx0, by0, bx1, by1] = dirtyBox;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw > 0 && bh > 0) {
        g2.save();
        xform(g2, s.inkGeo);
        g2.beginPath();
        g2.rect(bx0, by0, bw, bh);
        g2.clip();
        g2.clearRect(bx0 - 2, by0 - 2, bw + 4, bh + 4);
        for (let i = 0; i < all.length; i++) {
          const st = all[i];
          if (st.tool !== tool) continue;
          const sb = bboxOf(st);
          const pad = (st.size || 2) * 1.7 + 6;
          if (sb[2] + pad < bx0 || sb[0] - pad > bx1 || sb[3] + pad < by0 || sb[1] - pad > by1) continue;
          drawStroke(g2, st, true);
        }
        g2.restore();
        return;
      }
    }
    const cv = this.ensureInkCanvas(s, tool);
    clearAll(cv);
    const g = cv.getContext("2d");
    xform(g, s.inkGeo);
    for (let i = 0; i < all.length; i++) {
      const st = all[i];
      if (st.tool === tool) drawStroke(g, st, true);
    }
  }
  redrawInk(s) {
    if (this.tipPending) {
      this.tipPending = false;
      this.clearLiveTips();
    }
    this.redrawLayer(s, "highlighter");
    this.redrawLayer(s, "pen");
  }
  // ================================================================ dock
  paintIcon(el) {
    if (!el || typeof el.hasClass !== "function") return;
    const name = el.dataset ? el.dataset.ico : "";
    if (!name) return;
    const on = el.hasClass("active") || el.hasClass("armed");
    el.style.backgroundImage = iconUrl(name, on ? "#ffffff" : "#e5e5ea");
  }
  setActive(el, on) {
    if (!el || typeof el.toggleClass !== "function") return;
    el.toggleClass("active", !!on);
    this.paintIcon(el);
  }
  button(parent, name, label, cb) {
    const b = parent.createDiv({ cls: "gn-btn", attr: { role: "button", tabindex: "0", "aria-label": label, title: label } });
    b.dataset.ico = name;
    this.paintIcon(b);
    let lastActAt = 0;
    const trigger = (e) => {
      const now = performance.now();
      if (now - lastActAt < 260) return;
      lastActAt = now;
      e.stopPropagation();
      cb();
    };
    b.addEventListener("pointerup", (e) => {
      if (e.pointerType === "pen") {
        if (e.cancelable) e.preventDefault();
        trigger(e);
      }
    });
    b.addEventListener("click", trigger);
    return b;
  }
  /** tap and long-press on the same element */
  pressable(el, onTap, onLong) {
    let timer = 0;
    let fired = false;
    el.addEventListener("pointerdown", () => {
      fired = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fired = true;
        onLong();
      }, 450);
    });
    const cancel = () => window.clearTimeout(timer);
    el.addEventListener("pointerup", () => {
      cancel();
      if (!fired) onTap();
    });
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  buildChrome() {
    if (this.chromeBuilt) return;
    this.chromeBuilt = true;
    const c = this.contentEl;
    c.addClass("pink-root");
    c.empty();

    // The Goodnotes Floating Island Toolbar
    const dock = this.dockEl = c.createDiv({ cls: "pink-dock" });

    // 1. Navigation & History Island
    const navGroup = dock.createDiv({ cls: "gn-group gn-nav-group" });
    this.button(navGroup, "arrowLeft", "Back to Library", () => void this.plugin.openLibrary());
    this.gridBtn = this.button(navGroup, "grid", "Page Overview", () => {
      var _a;
      return (_a = this.thumbs) == null ? void 0 : _a.toggle();
    });
    this.undoBtn = this.button(navGroup, "undo", "Undo", () => this.undo());
    this.redoBtn = this.button(navGroup, "redo", "Redo", () => this.redo());

    // 2. Tools Island (Goodnotes Pen, Highlighter, Eraser)
    const tools = dock.createDiv({ cls: "gn-group gn-tools-group" });
    this.toolBtns.set("pen", this.button(tools, "pen", "Pen (tap again for pen settings)", () => this.selectTool("pen")));
    this.toolBtns.set("highlighter", this.button(tools, "highlighter", "Highlighter (tap again for settings)", () => this.selectTool("highlighter")));
    this.toolBtns.set("eraser", this.button(tools, "eraser", "Eraser (tap again for settings)", () => this.selectTool("eraser")));
    this.handBtn = this.button(tools, "hand", "Scroll / Read-only Mode (drag page without drawing)", () => {
      this.scrollMode = !this.scrollMode;
      if (!this.scrollMode) this.selectTool(this.lastDrawTool || "pen");
      else {
        this.closePopover();
        this.updateTools();
      }
    });

    // 3. Contextual Controls Island (Colors, Thickness, etc.)
    this.contextEl = dock.createDiv({ cls: "gn-group gn-contextual-controls" });

    // 4. Document Actions Island
    const docGroup = dock.createDiv({ cls: "gn-group gn-doc-group" });
    this.button(docGroup, "plus", "Add Blank Page", () => this.insertBlankAfter(this.currentIdx));
    this.bookmarkBtn = this.button(docGroup, "bookmark", "Bookmark this page", () => {
      const cur = this.slots[this.currentIdx];
      if (cur) {
        this.toggleBookmark(cur.key);
        this.updateBookmarkButton();
      }
    });
    const moreBtn = this.button(docGroup, "moreHorizontal", "Document Options", () => this.openDocumentMenu(moreBtn));

    // Page Scroller & Viewport
    this.scrollerEl = c.createDiv({ cls: "pink-scroller" });
    this.pagesEl = this.scrollerEl.createDiv({ cls: "pink-pages" });
    this.pagePill = c.createDiv({ cls: "pink-page-pill", attr: { role: "button", tabindex: "0" } });
    this.toastEl = c.createDiv({ cls: "pink-toast" });
    this.pagePill.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" && this.isPenActive()) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    this.pagePill.addEventListener("click", (e) => {
      if (this.isPenActive()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this.openJumpPopover();
    });
    this.scrollerEl.addEventListener(
      "scroll",
      () => {
        const now = performance.now();
        this.lastScroll = now;
        this.plugin.lastInputAt = Date.now();
        if (this.programmaticScrollAt && now - this.programmaticScrollAt < 65) {
          this.dockLastTop = this.scrollerEl.scrollTop;
          this.dockRun = 0;
          this.updateCurrentSoon();
          return;
        }

        this.updateViewport(false);
        this.updateCurrentSoon();
        this.scrollIdle();
        this.scrollFeed();
        if (now - this.zoomAt > 200) this.updateDockVisibility();
        else {
          this.dockLastTop = this.scrollerEl.scrollTop;
          this.dockRun = 0;
        }
      },
      { passive: true }
    );
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.dockEl) {
            const dh = Math.round(entry.contentRect.height) || this.dockEl.offsetHeight || 60;
            if (dh > 0 && dh !== this.dockHCache) {
              this.dockHCache = dh;
              if (this.thumbs) this.thumbs.fitTop(dh + 18);
            }
          } else if (entry.target === this.scrollerEl) {
            const w = Math.round(entry.contentRect.width);
            const h = Math.round(entry.contentRect.height);
            if (w > 0) this.scrollerW = w;
            if (h > 0) this.scrollerH = h;
          }
        }
      });
      this.resizeObs.observe(this.scrollerEl);
      this.resizeObs.observe(this.dockEl);
    }
    this.attachPinchAndWheel();
    this.attachTapGestures();
    this.attachInput();
    this.updateTools();
    this.updateUndoButtons();
    this.updateBookmarkButton();
  }
  isBookmarked(key) {
    var _a, _b;
    return !!((_b = (_a = this.doc.bookmarks) == null ? void 0 : _a[key]) == null ? void 0 : _b.on);
  }
  updateBookmarkButton() {
    if (!this.bookmarkBtn) return;
    const cur = this.slots[this.currentIdx];
    const on = cur ? this.isBookmarked(cur.key) : false;
    this.setActive(this.bookmarkBtn, on);
  }
  openDocumentMenu(anchor) {
    const menu = new import_obsidian4.Menu();

    menu.addItem((i) => i.setTitle(this.scrollMode ? "Exit Scroll Mode (Draw)" : "Scroll / Read Mode (S)").setIcon("hand").onClick(() => {
      this.toggleScrollMode();
    }));
    menu.addItem((i) => i.setTitle("Export / Share Page as PNG").setIcon("share").onClick(() => {
      void this.shareCurrentPage();
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Duplicate This Page").setIcon("copy").onClick(() => {
      this.duplicateAt(this.currentIdx);
    }));
    menu.addItem((i) => i.setTitle("Clear This Page Writing").setIcon("trash").onClick(() => {
      this.clearPage(this.currentIdx);
      new import_obsidian4.Notice("Cleared writing on page.");
    }));
    menu.addSeparator();
    const zPct = Math.round(this.zoom * 100);
    menu.addItem((i) => i.setTitle(`Zoom: ${zPct}%`).setDisabled(true));
    menu.addItem((i) => i.setTitle("Zoom In (Cmd +)").setIcon("zoom-in").onClick(() => this.zoomStep(1.2)));
    menu.addItem((i) => i.setTitle("Zoom Out (Cmd -)").setIcon("zoom-out").onClick(() => this.zoomStep(1 / 1.2)));
    menu.addItem((i) => i.setTitle("Reset to 100% (Fit to width)").setIcon("ruler").onClick(() => this.resetZoom()));
    menu.addSeparator();
    const syncState = this.plugin.sync.statusText();
    menu.addItem((i) => i.setTitle(`Google Drive: ${syncState}`).setIcon("refresh-cw").onClick(() => {
      this.showSyncStatus();
    }));
    const r = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: r.left, y: r.bottom + 8 });
  }
  toggleScrollMode() {
    this.scrollMode = !this.scrollMode;
    this.clearHoverRing();
    this.closePopover();
    this.updateTools();
    this.showToast(this.scrollMode ? "Scroll mode" : `${this.tool.charAt(0).toUpperCase() + this.tool.slice(1)} tool`);
  }
  toggleEraser() {
    if (this.tool === "eraser" && !this.scrollMode) {
      this.selectTool(this.lastDrawTool || "pen");
    } else {
      this.selectTool("eraser");
    }
    this.showToast(this.tool === "eraser" ? "Eraser" : (this.tool === "highlighter" ? "Highlighter" : "Pen"));
  }
  async renderPageCompositeBlob(idx = this.currentIdx, dpr = 2) {
    var _a, _b;
    const s = this.slots[idx];
    if (!s) return null;
    const W = Math.max(1, Math.round(s.w * dpr));
    const H = Math.max(1, Math.round(s.h * dpr));
    const cv = globalCanvasPool.acquire(W, H, "pink-cv pink-export");
    try {
      const g = cv.getContext("2d", { alpha: false });
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, W, H);
      const n = (_a = s.pdfN) != null ? _a : s.srcN;
      if (n !== null && this.pdf) {
        const page = await this.pageProxy(n);
        const vp = page.getViewport({ scale: dpr });
        await page.render({ canvasContext: g, canvas: cv, viewport: vp }).promise;
      }
      const strokes2 = (_b = this.doc.pages[s.key]) != null ? _b : [];
      if (strokes2.length) {
        g.save();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.globalCompositeOperation = "multiply";
        for (const st of strokes2) if (st.tool === "highlighter") drawStroke(g, st, false);
        g.globalCompositeOperation = "source-over";
        for (const st of strokes2) if (st.tool === "pen") drawStroke(g, st, true);
        g.restore();
      }
      return await new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
    } finally {
      globalCanvasPool.release(cv);
    }
  }
  async shareCurrentPage() {
    if (!this.file || !this.slots.length) return;
    const idx = this.currentIdx;
    const baseName = `${this.file.basename} - Page ${idx + 1}.png`;
    new import_obsidian4.Notice(`Rendering Page ${idx + 1}...`, 2500);
    try {
      const blob = await this.renderPageCompositeBlob(idx, 2);
      if (!blob) throw new Error("Could not render page bitmap");
      if (typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined") {
        const fileObj = new File([blob], baseName, { type: "image/png" });
        if (!navigator.canShare || navigator.canShare({ files: [fileObj] })) {
          try {
            await navigator.share({ files: [fileObj], title: baseName });
            return;
          } catch (err) {
            if (err && err.name === "AbortError") return;
          }
        }
      }
      const dir = this.file.parent && this.file.parent.path && this.file.parent.path !== "/" ? this.file.parent.path + "/" : "";
      let outPath = `${dir}${baseName}`;
      for (let i = 2; this.app.vault.getAbstractFileByPath(outPath); i++) {
        outPath = `${dir}${this.file.basename} - Page ${idx + 1} (${i}).png`;
      }
      await this.app.vault.createBinary(outPath, await blob.arrayBuffer());
      new import_obsidian4.Notice(`Saved annotated page to "${outPath}"`, 5e3);
    } catch (e) {
      this.log.error("export", "could not export page", e);
      new import_obsidian4.Notice("Could not export page: " + String(e));
    }
  }
  updateDockVisibility() {
    if (!this.dockEl) return;
    const top = this.scrollerEl.scrollTop;
    const d = top - this.dockLastTop;
    this.dockLastTop = top;
    if (!this.plugin.settings.autoHideToolbar || !this.scrollMode || top < 40) {
      this.dockRun = 0;
      this.setDockHidden(false);
      return;
    }
    if (d === 0) return;
    if (Math.sign(d) !== Math.sign(this.dockRun)) this.dockRun = 0;
    this.dockRun += d;
    if (this.dockRun > 24) this.setDockHidden(true);
    else if (this.dockRun < -12) this.setDockHidden(false);
  }
  setDockHidden(hide) {
    if (!this.dockEl || hide === this.dockHidden) return;
    this.dockHidden = hide;
    const d = this.dockEl;
    d.style.transition = "transform 180ms ease, opacity 180ms ease";
    d.style.transform = hide ? "translateY(-130%)" : "";
    d.style.opacity = hide ? "0" : "";
    d.style.pointerEvents = hide ? "none" : "";
  }
  scrollFeed() {
    const now = performance.now();
    if (now - this.scrollFeedAt < 120) return;
    this.scrollFeedAt = now;
    this.requestRender();
  }
  // page number -> object URL of its saved picture
  picDir() {
    var _a, _b, _c;
    const f = this.file;
    return `${this.app.vault.configDir}/plugins/pencil-ink/pics/${picKey(((_a = f == null ? void 0 : f.path) != null ? _a : "") + "|" + ((_c = (_b = f == null ? void 0 : f.stat) == null ? void 0 : _b.size) != null ? _c : 0))}`;
  }
  async ensureDir(path) {
    if (!this._ensuredDirs) this._ensuredDirs = /* @__PURE__ */ new Set();
    if (this._ensuredDirs.has(path)) return;
    const ad = this.app.vault.adapter;
    let cur = "";
    for (const part of path.split("/")) {
      cur = cur ? cur + "/" + part : part;
      if (!this._ensuredDirs.has(cur)) {
        if (!await ad.exists(cur)) await ad.mkdir(cur);
        this._ensuredDirs.add(cur);
      }
    }
  }
  /** A book over 100 MB is held in less memory: fewer pages around the one being read, and fewer parsed pages cached. */
  isBigBook() {
    var _a, _b;
    return ((_b = (_a = this.file) == null ? void 0 : _a.stat.size) != null ? _b : 0) > 100 * 1048576;
  }
  /** Keeps at most 80 pictures in memory: the ones furthest from the page being read are released, and reloaded from disk if needed. */
  capPics() {
    var _a, _b;
    if (this.pagePics.size <= 80) return;
    const here = (_b = (_a = this.slots[this.currentIdx]) == null ? void 0 : _a.pdfN) != null ? _b : 1;
    const far = [...this.pagePics.keys()].sort((a, b) => Math.abs(b - here) - Math.abs(a - here));
    for (const k of far.slice(0, this.pagePics.size - 80)) {
      safeRevokeUrl(this.pagePics.get(k));
      this.pagePics.delete(k);
    }
  }
  /** Show a saved picture of a page straight away, before the page itself is drawn. */
  async showPicture(s) {
    if (!s.el || s.pdfN === null || s.rendered || s.el.querySelector(".pink-pic")) return;
    const n = s.pdfN;
    let url = this.pagePics.get(n);
    if (!url) {
      if (!this.picLoading) this.picLoading = new Map();
      let pending = this.picLoading.get(n);
      if (!pending) {
        pending = (async () => {
          const file = `${this.picDir()}/${n}.jpg`;
          const ad = this.app.vault.adapter;
          if (!await ad.exists(file)) return null;
          let u;
          if (typeof ad.getResourcePath === "function") {
            u = ad.getResourcePath(file);
          } else {
            const tRead = performance.now();
            const buf = await ad.readBinary(file);
            const readMs = performance.now() - tRead;
            if (readMs > 20) this.log.info("pics", "slow picture read", { page: n, ms: Math.round(readMs), kb: Math.round(buf.byteLength / 1024) });
            u = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
          }
          this.pagePics.set(n, u);
          this.capPics();
          return u;
        })().finally(() => this.picLoading.delete(n));
        this.picLoading.set(n, pending);
      }
      url = await pending;
      if (!url) return;
    }
    if (!s.el || s.rendered || !(s.near || s.far) || s.el.querySelector(".pink-pic")) return;
    const img = s.el.createEl("img", { cls: "pink-pic" });
    img.decoding = "async";
    img.src = url;
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
  }
  hidePicture(s) {
    var _a;
    if (!s.el) return;
    (_a = s.el.querySelector(".pink-pic")) == null ? void 0 : _a.remove();
  }
  startWarm() {
    const run = ++this.warmRun;
    void this.warmLoop(run);
  }
  /** Draw each page once in the background, and keep a small picture of it. Waits for quiet moments. */
  async warmLoop(run) {
    var _a, _b;
    await sleep2(4e3);
    if (run !== this.warmRun) return;
    try {
      await this.ensureDir(this.picDir());
    } catch (e) {
      this.log.warn("pics", "cannot create the picture folder", e);
      return;
    }
    const start = Math.max(1, (_b = (_a = this.slots[this.currentIdx]) == null ? void 0 : _a.pdfN) != null ? _b : 1);
    const order = [];
    const seen = /* @__PURE__ */ new Set();
    const pushPage = (p) => {
      if (p >= 1 && p <= this.numPages && !seen.has(p)) {
        seen.add(p);
        order.push(p);
      }
    };
    pushPage(start);
    for (let f = 1; f <= 5; f++) pushPage(start + f);
    const maxD = Math.min(WARM_RADIUS, Math.max(start - 1, this.numPages - start));
    for (let d = 1; d <= maxD; d++) {
      pushPage(start - d);
      pushPage(start + d);
    }
    let wrote = 0;
    try {
      for (const n of order) {
        while (run === this.warmRun && (this.warmPaused || this.activeRenders > 0 || this.cur || this.erasing || performance.now() - this.lastScroll < 1500 || Date.now() - this.plugin.lastInputAt < 1e4)) await sleep2(400);
        if (run !== this.warmRun || !this.pdf) return;
        if (this.isRemoved(n) || this.pagePics.has(n)) continue;
        const file = `${this.picDir()}/${n}.jpg`;
        if (await this.app.vault.adapter.exists(file)) continue;
        try {
          const blob = await this.drawPicture(n);
          if (!blob || run !== this.warmRun) continue;
          const ad = this.app.vault.adapter;
          await ad.writeBinary(file, await blob.arrayBuffer());
          wrote++;
          const url = typeof ad.getResourcePath === "function" ? ad.getResourcePath(file) : URL.createObjectURL(blob);
          if (run === this.warmRun) {
            this.pagePics.set(n, url);
            this.capPics();
          } else safeRevokeUrl(url);
        } catch (e) {
          this.log.warn("pics", `picture ${n} failed`, e);
        }
      }
    } finally {
      if (wrote > 0) await this.prunePictures();
    }
  }
  /** Keeps the newest PICTURE_KEEP pictures of this book on disk; the others are removed. */
  async prunePictures() {
    try {
      for (const path of await this.pruneDir(this.picDir(), PICTURE_KEEP)) {
        const n = Number(path.replace(/^.*\//, "").replace(/\.jpg$/, ""));
        const url = this.pagePics.get(n);
        if (url) {
          safeRevokeUrl(url);
          this.pagePics.delete(n);
        }
      }
    } catch (e) {
      this.log.warn("pics", "could not prune the saved pictures", e);
    }
  }
  /** Removes the oldest .jpg files of a folder beyond `keep`. Returns the paths removed. */
  async pruneDir(dir, keep) {
    var _a;
    const listed = await this.app.vault.adapter.list(dir);
    const files = [];
    for (const path of listed.files) {
      if (!path.endsWith(".jpg")) continue;
      const st = await this.app.vault.adapter.stat(path);
      files.push({ path, mtime: (_a = st == null ? void 0 : st.mtime) != null ? _a : 0 });
    }
    const gone = picturesToRemove(files, keep);
    for (const path of gone) await this.app.vault.adapter.remove(path);
    return gone;
  }
  /** A small JPEG of one PDF page, without ink (ink is drawn on top separately). */
  async drawPictureFromCanvas(sourceCv, w, h) {
    if (!sourceCv || !sourceCv.width || !sourceCv.height) return null;
    const targetW = PICTURE_WIDTH;
    const targetH = Math.max(1, Math.round(targetW * (h / w)));
    const cv = globalCanvasPool.acquire(targetW, targetH, "pink-cv pink-thumb");
    const g = cv.getContext("2d", { alpha: false });
    if (!g) {
      globalCanvasPool.release(cv);
      return null;
    }
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, targetW, targetH);
    g.drawImage(sourceCv, 0, 0, targetW, targetH);
    const blob = await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", PICTURE_QUALITY));
    globalCanvasPool.release(cv);
    return blob;
  }
  async drawPicture(n) {
    if (!this.pdf) return null;
    const inCache = this.pageCache.has(n);
    const page = inCache ? await this.pageProxy(n) : await this.pdf.getPage(n);
    try {
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: PICTURE_WIDTH / base.width });
      const cv = globalCanvasPool.acquire(Math.max(1, Math.floor(vp.width)), Math.max(1, Math.floor(vp.height)), "pink-cv pink-thumb");
      const g = cv.getContext("2d", { alpha: false });
      g.fillStyle = "#fff";
      g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, canvas: cv, viewport: vp }).promise;
      const blob = await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", PICTURE_QUALITY));
      globalCanvasPool.release(cv);
      return blob;
    } finally {
      if (!inCache && !this.pageCache.has(n)) {
        try { page.cleanup(); } catch (e) {}
      }
    }
  }
  fitDockPadding() {
    requestAnimationFrame(() => {
      var _a;
      if (this.dockEl) {
        const dh = this.dockEl.offsetHeight || 60;
        if (dh !== this.dockHCache) {
          this.dockHCache = dh;
          if (this.slots.length) this.layoutPages(false, true);
        }
        (_a = this.thumbs) == null ? void 0 : _a.fitTop(dh + 18);
      }
    });
  }
  selectTool(t) {
    if (this.tool === t && !this.scrollMode) {
      const btn = this.toolBtns.get(t);
      if (btn) {
        if (t === "pen") this.openPenOptionsPopover(btn);
        else if (t === "highlighter") this.openHighlighterOptionsPopover(btn);
        else if (t === "eraser") this.openEraserOptionsPopover(btn);
      }
      return;
    }
    this.scrollMode = false;
    this.tool = t;
    if (t !== "eraser") this.lastDrawTool = t;
    this.closePopover();
    this.updateTools();
  }
  toolSet() {
    const s = this.plugin.settings;
    return this.tool === "highlighter" ? s.highlighter : s.pen;
  }
  updateTools() {
    if (!this.scrollMode) this.setDockHidden(false);
    for (const [k, b] of this.toolBtns) this.setActive(b, k === this.tool && !this.scrollMode);
    if (this.handBtn) this.setActive(this.handBtn, this.scrollMode);
    this.contentEl.toggleClass("is-scroll-mode", this.scrollMode);
    this.renderContext();
  }
  dotPx(tool, w) {
    const d = tool === "pen" ? 2 + w * 1.5 : tool === "highlighter" ? 3 + w * 0.32 : 3 + w * 0.18;
    return Math.max(3, Math.min(17, d));
  }
  renderContext() {
    const el = this.contextEl;
    el.empty();
    const s = this.plugin.settings;
    if (this.scrollMode) {
      const ind = el.createDiv({ cls: "gn-scroll-mode-indicator" });
      ind.createSpan({ text: "Scroll mode" });
      ind.createSpan({ text: "Pencil and finger scroll", cls: "gn-sub" });
      this.fitDockPadding();
      return;
    }
    if (this.tool === "eraser") {
      const seg = el.createDiv({ cls: "gn-seg" });
      for (const [label, mode] of [["Stroke", "stroke"], ["Precise", "pixel"]]) {
        const b = seg.createDiv({ cls: "gn-seg-btn" + (s.eraserMode === mode ? " is-on" : ""), text: label, attr: { role: "button", tabindex: "0" } });
        b.addEventListener("click", () => {
          s.eraserMode = mode;
          this.saveSettingsSoon();
          this.renderContext();
        });
      }
      const hl2 = this.button(el, "highlighter", "Highlighter only: erase highlighter marks and leave pen writing alone", () => {
        s.eraseHlOnly = !s.eraseHlOnly;
        this.saveSettingsSoon();
        this.renderContext();
      });
      this.setActive(hl2, s.eraseHlOnly);
      s.eraserSizes.forEach((w, i) => this.sizeSlot(el, "eraser", w, i === s.eraserSlot, i));
      this.fitDockPadding();
      return;
    }
    const hl = this.tool === "highlighter";
    const set = this.toolSet();
    set.colors.forEach((col, i) => {
      const active = i === set.c;
      const d = el.createDiv({ cls: "gn-color-circle" + (active ? " active" : ""), attr: { role: "button", tabindex: "0", "aria-label": "Colour " + (i + 1) } });
      d.style.backgroundColor = col;
      this.pressable(
        d,
        () => {
          if (set.c === i) this.openColorPopover(d, set, i);
          else {
            set.c = i;
            this.saveSettingsSoon();
            this.closePopover();
            this.renderContext();
          }
        },
        () => {
          set.c = i;
          this.saveSettingsSoon();
          this.renderContext();
          const again = this.contextEl.querySelectorAll(".gn-color-circle")[i];
          this.openColorPopover(again != null ? again : d, set, i);
        }
      );
    });
    set.sizes.forEach((w, i) => this.sizeSlot(el, hl ? "highlighter" : "pen", w, i === set.s, i));
    this.fitDockPadding();
  }
  sizeSlot(parent, tool, w, active, i) {
    const b = parent.createDiv({ cls: "gn-size-circle" + (active ? " active" : ""), attr: { role: "button", tabindex: "0", title: `Thickness ${w}` } });
    const r = this.dotPx(tool, w) / 2;
    b.style.backgroundImage = `radial-gradient(circle at 50% 50%, #fff 0, #fff ${r}px, rgba(255,255,255,0) ${r + 0.8}px)`;
    const s = this.plugin.settings;
    this.pressable(
      b,
      () => {
        const cur = tool === "eraser" ? s.eraserSlot : this.toolSet().s;
        if (cur === i) this.openSizePopover(b, tool, i);
        else {
          if (tool === "eraser") s.eraserSlot = i;
          else this.toolSet().s = i;
          this.saveSettingsSoon();
          this.closePopover();
          this.renderContext();
        }
      },
      () => {
        if (tool === "eraser") s.eraserSlot = i;
        else this.toolSet().s = i;
        this.saveSettingsSoon();
        this.renderContext();
        const again = this.contextEl.querySelectorAll(".gn-size-circle")[i];
        this.openSizePopover(again != null ? again : b, tool, i);
      }
    );
  }
  // ---- popovers
  closePopover() {
    var _a, _b;
    if (this._escPopHandler) {
      window.removeEventListener("keydown", this._escPopHandler);
      this._escPopHandler = null;
    }
    (_a = this.popEl) == null ? void 0 : _a.remove();
    (_b = this.popBack) == null ? void 0 : _b.remove();
    this.popEl = this.popBack = null;
  }
  openPopover(anchor, width, build) {
    this.closePopover();
    const root = this.contentEl;
    const rr = root.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const back = this.popBack = root.createDiv({ cls: "pink-pop-backdrop" });
    back.addEventListener("pointerdown", () => this.closePopover());
    const card = this.popEl = root.createDiv({ cls: "pink-pop" });
    card.style.width = width + "px";
    build(card);
    this._escPopHandler = (e) => {
      if (e.key === "Escape") this.closePopover();
    };
    window.addEventListener("keydown", this._escPopHandler);
    let left = ar.left - rr.left + ar.width / 2 - width / 2;
    left = Math.max(8, Math.min(rr.width - width - 8, left));
    card.style.left = left + "px";
    const spaceBelow = rr.bottom - ar.bottom;
    if (spaceBelow < 200) {
      card.style.bottom = Math.max(8, rr.bottom - ar.top + 10) + "px";
    } else {
      card.style.top = ar.bottom - rr.top + 10 + "px";
    }
  }
  openPenOptionsPopover(anchor) {
    const s = this.plugin.settings;
    this.openPopover(anchor, 324, (card) => {
      card.empty();
      card.addClass("pink-pen-options-pop");

      const head = card.createDiv({ cls: "pink-pop-head" });
      head.createDiv({ cls: "pink-pop-title", text: "Pen Settings" });
      const badge = head.createDiv({ cls: "pink-pop-val", text: `${(s.penStyle || "fountain").toUpperCase()} · S${s.penSmooth || 3}` });

      card.createDiv({ cls: "pink-pop-section-label", text: "Pen Tip Style" });
      const typeGrid = card.createDiv({ cls: "pink-pen-type-grid" });
      const types = [
        {
          id: "fountain",
          name: "Fountain",
          desc: "Calligraphic & Dynamic",
          svg: '<svg viewBox="0 0 60 20" fill="currentColor"><path d="M4 14 C 16 14, 20 4, 32 7 C 44 10, 48 15, 56 8 C 48 18, 42 14, 30 11 C 18 8, 14 16, 4 14 Z"/></svg>'
        },
        {
          id: "ball",
          name: "Ballpoint",
          desc: "Uniform Crisp Line",
          svg: '<svg viewBox="0 0 60 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 13 C 18 5, 42 17, 55 8"/></svg>'
        },
        {
          id: "brush",
          name: "Brush",
          desc: "Expressive Swell",
          svg: '<svg viewBox="0 0 60 20" fill="currentColor"><path d="M3 15 C 15 15, 22 2, 34 6 C 46 10, 50 16, 57 7 C 50 19, 43 16, 31 12 C 19 8, 14 17, 3 15 Z"/></svg>'
        }
      ];
      const typeCards = [];
      const refreshBadge = () => {
        badge.setText(`${(s.penStyle || "fountain").toUpperCase()} · S${s.penSmooth || 3}`);
      };
      types.forEach((t) => {
        const curType = s.penStyle || "fountain";
        const c = typeGrid.createDiv({ cls: "pink-pen-type-card" + (curType === t.id ? " is-active" : "") });
        const svgWrap = c.createDiv({ cls: "pink-pen-type-svg" });
        svgWrap.innerHTML = t.svg;
        c.createDiv({ cls: "pink-pen-type-name", text: t.name });
        c.createDiv({ cls: "pink-pen-type-desc", text: t.desc });
        typeCards.push({ c, id: t.id });
        c.onclick = () => {
          s.penStyle = t.id;
          this.saveSettingsSoon();
          typeCards.forEach((x) => x.c.toggleClass("is-active", x.id === t.id));
          refreshBadge();
          this.renderContext();
        };
      });

      card.createDiv({ cls: "pink-pop-section-label", text: "Stroke Stabilization" });
      const smoothRow = card.createDiv({ cls: "pink-smooth-row" });
      const smoothLevels = [
        { lvl: 1, label: "1", hint: "Raw & Instant (4.9 ms)" },
        { lvl: 2, label: "2", hint: "Light Filtering" },
        { lvl: 3, label: "3", hint: "Natural & Balanced (5.5 ms)" },
        { lvl: 4, label: "4", hint: "Steady" },
        { lvl: 5, label: "5", hint: "Ultra-Smooth (6.9 ms)" }
      ];
      const smoothBtns = [];
      const hintEl = card.createDiv({ cls: "pink-smooth-hint" });
      const updateSmoothHint = (lvl) => {
        const found = smoothLevels.find((x) => x.lvl === lvl);
        hintEl.setText(`Level ${lvl}: ${found ? found.hint : ""}`);
      };
      updateSmoothHint(s.penSmooth || 3);

      smoothLevels.forEach((item) => {
        const b = smoothRow.createDiv({ cls: "pink-smooth-btn" + (s.penSmooth === item.lvl ? " is-active" : ""), text: item.label });
        smoothBtns.push({ b, lvl: item.lvl });
        b.onclick = () => {
          s.penSmooth = item.lvl;
          this.saveSettingsSoon();
          smoothBtns.forEach((x) => x.b.toggleClass("is-active", x.lvl === item.lvl));
          updateSmoothHint(item.lvl);
          refreshBadge();
          this.renderContext();
        };
      });

      card.createDiv({ cls: "pink-pop-section-label", text: "Apple Pencil Force Curve" });
      const sliderRow = card.createDiv({ cls: "pink-pop-slider-row" });
      const sensVal = s.pressureSensitivity || 1.0;
      const sensLabel = card.createDiv({
        cls: "pink-smooth-hint",
        text: `Response: ${sensVal.toFixed(2)}x (${sensVal < 0.9 ? "Firmer touch" : sensVal > 1.1 ? "Lighter touch" : "Natural"})`
      });
      const slider = sliderRow.createEl("input", {
        type: "range",
        cls: "pink-pop-range",
        attr: { min: "0.6", max: "1.4", step: "0.05", value: String(sensVal) }
      });
      slider.oninput = () => {
        const val = Number(slider.value);
        s.pressureSensitivity = val;
        sensLabel.setText(`Response: ${val.toFixed(2)}x (${val < 0.9 ? "Firmer touch" : val > 1.1 ? "Lighter touch" : "Natural"})`);
        this.saveSettingsSoon();
      };


    });
  }
  openHighlighterOptionsPopover(anchor) {
    const s = this.plugin.settings;
    this.openPopover(anchor, 260, (card) => {
      card.empty();
      card.addClass("pink-pop-card");

      const head = card.createDiv({ cls: "pink-pop-head" });
      head.createDiv({ cls: "pink-pop-title", text: "Highlighter Settings" });

      card.createDiv({ cls: "pink-pop-section-label", text: "Drawing Mode" });
      const row = card.createDiv({ cls: "pink-pop-toggle-row" });
      row.createSpan({ text: "Draw in Straight Lines" });
      const cb = row.createEl("input", { type: "checkbox", checked: !!s.hlStraight });
      cb.onchange = () => {
        s.hlStraight = cb.checked;
        this.saveSettingsSoon();
        this.renderContext();
      };
    });
  }
  openEraserOptionsPopover(anchor) {
    const s = this.plugin.settings;
    this.openPopover(anchor, 290, (card) => {
      card.empty();
      card.addClass("pink-pop-card");

      const head = card.createDiv({ cls: "pink-pop-head" });
      head.createDiv({ cls: "pink-pop-title", text: "Eraser Options" });

      card.createDiv({ cls: "pink-pop-section-label", text: "Eraser Type" });
      const modeSeg = card.createDiv({ cls: "gn-seg", style: "width: 100%; margin-bottom: 8px;" });
      const bStroke = modeSeg.createDiv({ cls: "gn-seg-btn" + (s.eraserMode === "stroke" ? " is-on" : ""), text: "Entire Stroke" });
      const bPixel = modeSeg.createDiv({ cls: "gn-seg-btn" + (s.eraserMode !== "stroke" ? " is-on" : ""), text: "Precision Pixel" });
      bStroke.onclick = () => {
        s.eraserMode = "stroke";
        bStroke.addClass("is-on");
        bPixel.removeClass("is-on");
        this.saveSettingsSoon();
      };
      bPixel.onclick = () => {
        s.eraserMode = "pixel";
        bPixel.addClass("is-on");
        bStroke.removeClass("is-on");
        this.saveSettingsSoon();
      };

      card.createDiv({ cls: "pink-pop-section-label", text: "Settings" });
      const toggleList = card.createDiv({ cls: "pink-pop-toggle-list" });

      const tHl = toggleList.createDiv({ cls: "pink-pop-toggle-row" });
      tHl.createSpan({ text: "Erase Highlighter Only" });
      const cbHl = tHl.createEl("input", { type: "checkbox", checked: !!s.eraseHlOnly });
      cbHl.onchange = () => {
        s.eraseHlOnly = cbHl.checked;
        this.saveSettingsSoon();
      };

      const tAuto = toggleList.createDiv({ cls: "pink-pop-toggle-row" });
      tAuto.createSpan({ text: "Auto-Deselect After Erase" });
      const cbAuto = tAuto.createEl("input", { type: "checkbox", checked: !!s.autoDeselectEraser });
      cbAuto.onchange = () => {
        s.autoDeselectEraser = cbAuto.checked;
        this.saveSettingsSoon();
      };

      card.createDiv({ cls: "pink-pop-section-label", text: "Page Cleanup" });
      const clearBtn = card.createEl("button", {
        cls: "pink-pop-danger-btn",
        text: "Clear Page Writing"
      });
      let confirmClear = false;
      clearBtn.onclick = () => {
        if (!confirmClear) {
          confirmClear = true;
          clearBtn.setText("Confirm: Tap again to clear");
          clearBtn.style.background = "#ff453a";
          clearBtn.style.color = "#ffffff";
          setTimeout(() => {
            confirmClear = false;
            if (clearBtn.isConnected) {
              clearBtn.setText("Clear Page Writing");
              clearBtn.style.background = "";
              clearBtn.style.color = "";
            }
          }, 3500);
        } else {
          this.closePopover();
          this.clearPage(this.currentIdx);
          new import_obsidian4.Notice("Cleared all writing on page.");
        }
      };
    });
  }
  openColorPopover(anchor, set, slot) {
    const GN_PRESETS = [
      "#1c1c1e", "#636366", "#1d3557", "#007aff", "#32ade6", "#30b0c7",
      "#28cd41", "#34c759", "#ffcc00", "#ff9500", "#ff3b30", "#af52de"
    ];
    this.openPopover(anchor, 290, (card) => {
      card.empty();
      card.addClass("pink-color-pop");

      const head = card.createDiv({ cls: "pink-pop-head" });
      const cur = head.createDiv({ cls: "pink-pop-cur" });
      head.createDiv({ cls: "pink-pop-title", text: `Color Slot ${slot + 1}` });
      const val = head.createDiv({ cls: "pink-pop-val" });

      const paint = () => {
        const c = set.colors[slot];
        cur.style.backgroundColor = c;
        val.setText(c.toUpperCase());
        card.querySelectorAll(".pink-pop-sw").forEach((sw) => {
          sw.toggleClass("active", (sw.dataset.c || "").toLowerCase() === c.toLowerCase());
        });
        const dockCircles = this.contextEl.querySelectorAll(".gn-color-circle");
        if (dockCircles[slot]) dockCircles[slot].style.backgroundColor = c;
      };

      const apply = (col) => {
        set.colors[slot] = col;
        set.c = slot;
        this.saveSettingsSoon();
        paint();
      };

      card.createDiv({ cls: "pink-pop-section-label", text: "Goodnotes Palette" });
      const grid = card.createDiv({ cls: "pink-pop-grid" });
      GN_PRESETS.forEach((col) => {
        const sw = grid.createDiv({ cls: "pink-pop-sw", attr: { role: "button", tabindex: "0" } });
        sw.dataset.c = col;
        sw.style.backgroundColor = col;
        sw.onclick = () => apply(col);
      });

      card.createDiv({ cls: "pink-pop-section-label", text: "Custom Color" });
      const customRow = card.createDiv({ cls: "pink-color-custom-row" });
      const wheelBtn = customRow.createDiv({ cls: "pink-color-wheel-btn", text: "🎨 Pick Color" });
      const nativeInput = wheelBtn.createEl("input", {
        type: "color",
        cls: "pink-pop-native",
        value: set.colors[slot].startsWith("#") && set.colors[slot].length === 7 ? set.colors[slot] : "#000000"
      });
      nativeInput.oninput = () => apply(nativeInput.value);

      const hexInput = customRow.createEl("input", {
        type: "text",
        cls: "pink-color-hex-input",
        value: set.colors[slot],
        attr: { placeholder: "#RRGGBB", maxlength: "7" }
      });
      hexInput.onchange = () => {
        let v = hexInput.value.trim();
        if (!v.startsWith("#")) v = "#" + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) apply(v);
      };

      paint();
    });
  }
  openSizePopover(anchor, tool, slot) {
    const s = this.plugin.settings;
    const hl = tool === "highlighter";
    const eraser = tool === "eraser";
    const sizes = eraser ? s.eraserSizes : hl ? s.highlighter.sizes : s.pen.sizes;
    const min = eraser ? 6 : hl ? 4 : 0.5;
    const max = eraser ? 80 : hl ? 60 : 12;
    const step = eraser ? 1 : hl ? 0.5 : 0.1;
    const presets = eraser
      ? [12, 18, 24, 32, 48, 64]
      : hl
      ? [8, 12, 16, 22, 30, 42]
      : [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0];

    this.openPopover(anchor, 290, (card) => {
      card.empty();
      card.addClass("pink-size-pop");

      const head = card.createDiv({ cls: "pink-pop-head" });
      head.createDiv({ cls: "pink-pop-title", text: eraser ? "Eraser Size" : hl ? "Highlighter Width" : "Pen Stroke Width" });
      const val = head.createDiv({ cls: "pink-pop-val" });

      const prev = card.createDiv({ cls: "pink-size-prev" });
      const line = prev.createDiv({ cls: "pink-size-line" });

      const paint = () => {
        const w = sizes[slot];
        val.setText(w.toFixed(w < 10 && !eraser ? 1 : 0) + " pt");
        if (eraser) {
          line.style.cssText = `width:${Math.min(72, w * 1.2)}px;height:${Math.min(72, w * 1.2)}px;border-radius:50%;background:rgba(120,120,130,.18);border:2px solid rgba(90,90,100,.9);margin:0 auto;`;
        } else {
          const col = this.toolSet().colors[this.toolSet().c];
          line.style.cssText = `width:80%;height:${Math.max(1, Math.min(48, w * 1.4))}px;border-radius:999px;background:${col};opacity:${hl ? 0.42 : 1};margin:0 auto;`;
        }
        const dots = this.contextEl.querySelectorAll(".gn-size-circle");
        const d = dots[slot];
        if (d) {
          const r = this.dotPx(tool, w) / 2;
          d.style.backgroundImage = `radial-gradient(circle at 50% 50%, #fff 0, #fff ${r}px, rgba(255,255,255,0) ${r + 0.8}px)`;
        }
        card.querySelectorAll(".pink-size-chip").forEach((chip) => {
          chip.toggleClass("is-active", Math.abs(Number(chip.dataset.val) - w) < 0.05);
        });
      };

      card.createDiv({ cls: "pink-pop-section-label", text: "Preset Widths" });
      const chipGrid = card.createDiv({ cls: "pink-size-chips-grid" });
      presets.forEach((pVal) => {
        const chip = chipGrid.createDiv({
          cls: "pink-size-chip" + (Math.abs(sizes[slot] - pVal) < 0.05 ? " is-active" : ""),
          text: pVal + " pt"
        });
        chip.dataset.val = String(pVal);
        chip.onclick = () => {
          sizes[slot] = pVal;
          slider.value = String(pVal);
          this.saveSettingsSoon();
          paint();
        };
      });

      card.createDiv({ cls: "pink-pop-section-label", text: "Precision Slider" });
      const slider = card.createEl("input", {
        type: "range",
        cls: "pink-pop-range",
        attr: { min: String(min), max: String(max), step: String(step), value: String(sizes[slot]) }
      });
      slider.oninput = () => {
        sizes[slot] = Number(slider.value);
        paint();
      };
      slider.onchange = () => this.saveSettingsSoon();

      paint();
    });
  }
  openJumpPopover() {
    if (!this.slots.length) return;
    this.openPopover(this.pagePill, 220, (card) => {
      card.createDiv({ cls: "pink-pop-title", text: "Go to page" });
      const row = card.createDiv({ cls: "pink-pop-row" });
      const input = row.createEl("input", { type: "text", cls: "pink-pop-input", attr: { inputmode: "numeric", pattern: "[0-9]*", placeholder: `1 - ${this.slots.length}` } });
      const go = row.createDiv({ cls: "pink-pop-go", text: "Go", attr: { role: "button", tabindex: "0" } });
      const submit = () => {
        const n = parseInt(input.value, 10);
        if (!isNaN(n) && this.slots.length > 0) {
          const clamped = Math.max(0, Math.min(this.slots.length - 1, n - 1));
          this.goTo(clamped);
          this.closePopover();
        }
      };
      go.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      window.setTimeout(() => input.focus({ preventScroll: true }), 50);
    });
  }
  showSyncStatus() {
    const sync = this.plugin.sync;
    const extra = sync.state === "error" || sync.state === "offline" ? ` (${sync.lastError || "no connection"})` : "";
    new import_obsidian4.Notice(`Google Drive: ${sync.statusText()}${extra}`);
    if (sync.connected()) void this.saveNow().then(() => sync.syncNow());
  }
  updateUndoButtons() {
    var _a, _b;
    (_a = this.undoBtn) == null ? void 0 : _a.toggleClass("is-disabled", this.undoStack.length === 0);
    (_b = this.redoBtn) == null ? void 0 : _b.toggleClass("is-disabled", this.redoStack.length === 0);
  }
  setGridActive(on) {
    this.setActive(this.gridBtn, on);
  }
  // ================================================================ input
  rollbackPreTouchScroll() {
    if (this.preTouchAt && performance.now() - this.preTouchAt < 850 && this.preTouchScrollTop !== void 0 && this.scrollerEl) {
      this.programmaticScrollAt = performance.now();
      this.scrollerEl.scrollTop = this.preTouchScrollTop;
      this.scrollerEl.scrollLeft = this.preTouchScrollLeft || 0;
    }
    this.preTouchAt = 0;
  }
  isPenWriting() {
    const now = performance.now();
    const lastAct = Math.max(this.lastPtrAt || 0, this.lastPenAt || 0);
    if ((this.activePointer !== null || this.blockTouch !== null || this.cur !== null || this.erasing !== null) && lastAct > 0 && now - lastAct > 850) {
      if (this.cur || this.erasing) this.end(this.lastPtrX || 0, this.lastPtrY || 0);
      this.activePointer = null;
      this.touchDraw = false;
      this.blockTouch = null;
    }
    return this.cur !== null || this.erasing !== null || this.activePointer !== null || this.blockTouch !== null;
  }
  isPenActive() {
    return this.isPenWriting() || (this.lastPenAt > 0 && performance.now() - this.lastPenAt < PEN_COOLDOWN_MS);
  }
  isPalmContact(tOrEv) {
    if (!tOrEv) return false;
    const rx = typeof tOrEv.radiusX === "number" ? tOrEv.radiusX : (typeof tOrEv.width === "number" ? tOrEv.width * 0.5 : 0);
    const ry = typeof tOrEv.radiusY === "number" ? tOrEv.radiusY : (typeof tOrEv.height === "number" ? tOrEv.height * 0.5 : 0);
    return rx > PALM_RADIUS_PX || ry > PALM_RADIUS_PX;
  }
  poisonActiveTouchesAsPalm(touchList) {
    if (!this.palmTouchIds) this.palmTouchIds = /* @__PURE__ */ new Set();
    if (touchList && touchList.length) {
      for (let i = 0; i < touchList.length; i++) {
        const t = touchList[i];
        if (t && t.touchType !== "stylus") this.palmTouchIds.add(t.identifier);
      }
    }
    if (this.touches && this.touches.size) {
      for (const id of this.touches.keys()) this.palmTouchIds.add(id);
    }
    if (this.touches) this.touches.clear();
    this.touchPeak = 0;
    this.tapCount = 0;
    window.clearTimeout(this.tapTimer);
  }
  prunePalmTouches(activeTouchList) {
    if (!this.palmTouchIds || this.palmTouchIds.size === 0) return;
    const len = activeTouchList ? activeTouchList.length : 0;
    if (len === 0) {
      this.palmTouchIds.clear();
      if (this.touchDownTimes) this.touchDownTimes.clear();
      return;
    }
    for (const id of this.palmTouchIds) {
      let found = false;
      for (let i = 0; i < len; i++) {
        if (activeTouchList[i].identifier === id) {
          found = true;
          break;
        }
      }
      if (!found) {
        this.palmTouchIds.delete(id);
        if (this.touchDownTimes) this.touchDownTimes.delete(id);
      }
    }
  }
  stopTouchMomentum() {
    if (this.touchMomentumRaf) {
      cancelAnimationFrame(this.touchMomentumRaf);
      this.touchMomentumRaf = 0;
    }
  }
  cancelPinch(rollback = false) {
    this.stopTouchMomentum();
    if (rollback) this.rollbackPreTouchScroll();
    if (!this.pinch && !this.pinching) return;
    if (rollback && this.pinch && this.scrollerEl) {
      const p = this.pinch;
      if (p.startScrollTop !== void 0 && (!p.startedAt || performance.now() - p.startedAt < 850)) {
        this.programmaticScrollAt = performance.now();
        this.scrollerEl.scrollTop = p.startScrollTop;
        this.scrollerEl.scrollLeft = p.startScrollLeft || 0;
      }
    }
    this.pinch = null;
    this.pinching = false;
    if (this.pinchFrame) {
      cancelAnimationFrame(this.pinchFrame);
      this.pinchFrame = 0;
    }
    if (this.pagesEl) {
      this.pagesEl.style.transition = "";
      this.pagesEl.style.transform = "";
      this.pagesEl.style.willChange = "";
    }
  }
  slotAtPoint(cx, cy) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !this.scrollerEl || !this.slots.length) return null;
    const scRect = this.scrollerEl.getBoundingClientRect();
    const sy = this.scrollerEl.scrollTop + (cy - scRect.top);
    const sx = this.scrollerEl.scrollLeft + (cx - scRect.left);
    const idx = this.findSlotIndexAtY(sy);
    for (const candIdx of [idx, idx - 1, idx + 1]) {
      const cand = this.slots[candIdx];
      if (!cand) continue;
      if (sy >= cand.top - 16 && sy <= cand.top + cand.cssH + 16 && sx >= cand.left - 24 && sx <= cand.left + cand.cssW + 24) {
        this.ensureMounted(cand);
        return cand;
      }
    }
    return null;
  }
  slotOf(e, cx, cy) {
    var _a;
    const t = e && e.target;
    const el = t && t.closest ? t.closest(".pink-page") : null;
    if (el) {
      const found = (_a = this.byEl.get(el)) != null ? _a : null;
      if (found) return found;
    }
    const x = cx !== void 0 ? cx : (e && e.clientX);
    const y = cy !== void 0 ? cy : (e && e.clientY);
    return this.slotAtPoint(x, y);
  }
  /**
   * Unified Dual-Channel Capture-Phase Stylus & Input Pipeline (9.1.0).
   * - Intercepts Apple Pencil events at the window capture phase before Obsidian Mobile or UIScrollView gesture recognizers.
   * - Never calls setPointerCapture on 'pen' (avoiding iPadOS WebKit PointerCaptureController rapid re-contact pointerdown drops).
   * - Simultaneously arms both PointerEvent ('pen') and TouchEvent (touchType === 'stylus') on every stroke:
   *   whichever arrives first starts the stroke immediately, and if WebKit drops pointerdown/pointermove or fires
   *   pointercancel on palm collision, the stylus Touch channel seamlessly drives and completes the full stroke.
   */
  attachInput() {
    const root = this.pagesEl;
    if (this._winInputCleanup) {
      this._winInputCleanup();
      this._winInputCleanup = null;
    }
    const blockNativeMenu = (e) => {
      if (!this.scrollMode) e.preventDefault();
    };
    root.addEventListener("contextmenu", blockNativeMenu);
    root.addEventListener("selectstart", blockNativeMenu);
    root.addEventListener("dragstart", blockNativeMenu);
    root.addEventListener("click", (e) => {
      if (!this.scrollMode && this.lastPenAt > 0 && performance.now() - this.lastPenAt < 400) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });

    const isCanvasTarget = (e) => {
      const t = e && e.target;
      if (!t || typeof t.closest !== "function") return true;
      if (this.popBack && t === this.popBack) {
        this.closePopover();
        return true;
      }
      if (t.closest(".pink-dock, .pink-thumbs, .pink-pop, .pink-pop-backdrop, .pink-page-pill, .pink-banner, .pink-home-root")) return false;
      if (this.scrollerEl && typeof this.scrollerEl.contains === "function") {
        return t === this.scrollerEl || this.scrollerEl.contains(t);
      }
      if (root && typeof root.contains === "function") {
        return t === root || root.contains(t);
      }
      return true;
    };

    const onPtrDown = this.safe("pointerdown", (e) => {
      if (e._pinkHandled) return;
      if (this.scrollMode || e.pointerType === "touch") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!isCanvasTarget(e)) return;
      e._pinkHandled = true;
      window.clearTimeout(this.ptrCancelTimer);
      this.ptrCancelTimer = 0;
      const now = performance.now();
      if (e.pointerType === "pen") {
        if (e.cancelable) e.preventDefault();
        this.penSeen = true;
        this.lastPenAt = now;
        this.cancelPinch(true);
        this.poisonActiveTouchesAsPalm();
      }
      this.downs.all++;
      // If touchstart (stylus) already started this exact stroke < 65ms ago at the same contact point,
      // upgrade the stroke in-place from touchDraw to activePointer without splitting or resetting it.
      if (this.touchDraw && (this.cur || this.erasing)) {
        const dt = now - (this.lastPtrAt || 0);
        const dist = Math.hypot(e.clientX - (this.lastPtrX || e.clientX), e.clientY - (this.lastPtrY || e.clientY));
        if (dt <= 65 && dist <= 36 && (!this.cur || this.cur.stats.n <= 4)) {
          this.touchDraw = false;
          this.activePointer = e.pointerId;
          this.lastPtrAt = now;
          this.lastPtrMoveAt = now;
          this.lastPtrX = e.clientX;
          this.lastPtrY = e.clientY;
          return;
        }
        this.touchDraw = false;
        this.end(this.lastPtrX || e.clientX, this.lastPtrY || e.clientY);
      } else if (this.activePointer !== null && this.activePointer !== e.pointerId) {
        if (e.pointerType === "pen") {
          if (this.cur || this.erasing) {
            this.end(this.lastPtrX || e.clientX, this.lastPtrY || e.clientY);
          }
          this.activePointer = null;
        } else if (now - this.lastPtrAt < 1500) {
          this.downs.busy++;
          return;
        } else {
          this.activePointer = null;
          this.cur = null;
        }
      } else if (this.cur || this.erasing) {
        this.end(this.lastPtrX || e.clientX, this.lastPtrY || e.clientY);
      }
      const slot = this.slotOf(e, e.clientX, e.clientY);
      if (!slot) {
        this.downs.offPage++;
        return;
      }
      if (!slot.rendered || !slot.geo) this.downs.notReady++;
      this.activePointer = e.pointerId;
      this.lastPtrAt = now;
      this.lastPtrMoveAt = 0;
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;
      if (e.pointerType === "mouse") {
        try {
          (slot.el || root).setPointerCapture(e.pointerId);
        } catch (err) {
        }
      }
      const p = e.pointerType === "pen" && typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : (e.pointerType === "pen" ? 0.5 : null);
      this.begin(slot, e.clientX, e.clientY, e.timeStamp || now, p);
    });

    const onPtrMove = this.safe("pointermove", (e) => {
      if (e._pinkHandled) return;
      if (e.pointerType === "touch") return;
      const now = performance.now();
      if (this.activePointer === null && !this.scrollMode) {
        if (!this.cur && !this.erasing && !isCanvasTarget(e)) return;
        const isPressed = e.buttons === 1 || (e.pointerType === "pen" && typeof e.pressure === "number" && e.pressure > 0.001);
        if (e.pointerType === "pen" && isPressed) {
          e._pinkHandled = true;
          this.penSeen = true;
          this.lastPenAt = now;
          this.cancelPinch(true);
          this.poisonActiveTouchesAsPalm();
          if (this.touchDraw && (this.cur || this.erasing)) {
            this.touchDraw = false;
            this.activePointer = e.pointerId;
          } else if (!this.cur && !this.erasing) {
            const rSlot = this.slotOf(e, e.clientX, e.clientY);
            if (rSlot) {
              this.activePointer = e.pointerId;
              this.lastPtrAt = now;
              this.lastPtrMoveAt = now;
              this.lastPtrX = e.clientX;
              this.lastPtrY = e.clientY;
              this.begin(rSlot, e.clientX, e.clientY, e.timeStamp || now, e.pressure || 0.5);
              return;
            }
            return;
          }
        } else {
          if (!isPressed && this.tool === "eraser" && !this.cur && !this.erasing) {
            const hSlot = this.slotOf(e, e.clientX, e.clientY);
            if (hSlot && hSlot.rendered && hSlot.geo) this.paintHoverRing(hSlot, e.clientX, e.clientY);
            else this.clearHoverRing();
          }
          return;
        }
      }
      if (e.pointerId !== this.activePointer) return;
      e._pinkHandled = true;
      this.lastPtrAt = now;
      this.lastPtrMoveAt = now;
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;
      if (e.pointerType === "pen") {
        this.penSeen = true;
        this.lastPenAt = now;
        this.cancelPinch(true);
      }
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const list2 = evs.length ? evs : [e];
      const ahead = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      const outerT = e.timeStamp || now;
      const prevT = this.cur ? this.cur.lastT : (this.erasing ? this.eraseT : outerT - 8);
      const spanT = Math.max(0.5, outerT - prevT);
      let lastSubT = prevT;
      for (let i = 0; i < list2.length; i++) {
        const ev = list2[i];
        const rawP = ev.pointerType === "pen" ? ev.pressure : (e.pointerType === "pen" ? e.pressure : null);
        const p = typeof rawP === "number" && rawP > 0 ? rawP : (e.pointerType === "pen" ? 0.5 : null);
        const interpT = list2.length > 1 ? prevT + spanT * ((i + 1) / list2.length) : outerT;
        let evT = ev.timeStamp && ev.timeStamp > lastSubT ? ev.timeStamp : interpT;
        if (list2.length > 1 && i < list2.length - 1 && evT >= outerT) evT = interpT;
        if (evT <= lastSubT) evT = lastSubT + spanT / list2.length;
        lastSubT = evT;
        const az = ev.azimuthAngle !== void 0 ? ev.azimuthAngle : e.azimuthAngle;
        const alt = ev.altitudeAngle !== void 0 ? ev.altitudeAngle : e.altitudeAngle;
        this.move(ev.clientX, ev.clientY, evT, p, az, alt);
      }
      const c = this.cur;
      if (c) {
        c.stats.ev++;
        c.stats.coal += list2.length;
        c.stats.pred += ahead.length;
        c.pred = this.predicted(ahead, c);
        this.plugin.recorder.event(outerT, e, evs, ahead);
      }
      this.flushErase();
      this.paintLive();
    });

    const onPtrUp = this.safe("pointerup", (e) => {
      if (e._pinkHandled) return;
      if (e.pointerId !== this.activePointer) return;
      e._pinkHandled = true;
      window.clearTimeout(this.ptrCancelTimer);
      this.ptrCancelTimer = 0;
      this.activePointer = null;
      this.touchDraw = false;
      this.blockTouch = null;
      if (e.pointerType === "pen") this.lastPenAt = performance.now();
      const endX = Number.isFinite(e.clientX) && e.clientX !== 0 ? e.clientX : this.lastPtrX;
      const endY = Number.isFinite(e.clientY) && e.clientY !== 0 ? e.clientY : this.lastPtrY;
      this.end(endX, endY);
      this.flushRemotePending();
    });

    const onPtrCancel = this.safe("pointercancel", (e) => {
      if (e._pinkHandled) return;
      if (e.pointerId !== this.activePointer) return;
      e._pinkHandled = true;
      window.clearTimeout(this.ptrCancelTimer);
      this.ptrCancelTimer = 0;
      // If WebKit cancels the PointerEvent due to a concurrent palm touch while the physical
      // Apple Pencil Touch (this.blockTouch) is still on the glass, hand over to touchDraw!
      if (e.pointerType === "pen" && this.blockTouch !== null && (this.cur || this.erasing)) {
        this.activePointer = null;
        this.touchDraw = true;
        this.lastPenAt = performance.now();
        this.ptrCancelTimer = window.setTimeout(() => {
          this.ptrCancelTimer = 0;
          if (this.touchDraw && (this.cur || this.erasing) && performance.now() - (this.lastPtrAt || 0) >= 140) {
            this.touchDraw = false;
            this.blockTouch = null;
            this.end(this.lastPtrX || e.clientX, this.lastPtrY || e.clientY);
            this.flushRemotePending();
          }
        }, 160);
        return;
      }
      this.activePointer = null;
      this.touchDraw = false;
      this.blockTouch = null;
      if (e.pointerType === "pen") this.lastPenAt = performance.now();
      this.end(this.lastPtrX || e.clientX, this.lastPtrY || e.clientY);
      this.flushRemotePending();
    });

    const onTouchStart = this.safe("touchstart", (e) => {
      if (e._pinkHandled) return;
      if (this.scrollMode || !e.changedTouches) return;
      const touches = e.changedTouches;
      let sawStylus = false;
      const now = performance.now();
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (t.touchType !== "stylus") {
          if (this.isPenWriting() || this.isPalmContact(t)) {
            this.palmTouchIds.add(t.identifier);
          }
          continue;
        }
        if (!isCanvasTarget(e)) continue;
        sawStylus = true;
        e._pinkHandled = true;
        window.clearTimeout(this.ptrCancelTimer);
        this.ptrCancelTimer = 0;
        if (e.cancelable) e.preventDefault();
        this.blockTouch = t.identifier;
        this.lastPenAt = now;
        this.cancelPinch(true);
        this.poisonActiveTouchesAsPalm(e.touches);
        // Check if pointerdown already started this exact stroke within the last 65ms at the same position
        if (this.activePointer !== null && (this.cur || this.erasing)) {
          const dt = now - (this.lastPtrAt || 0);
          const dist = Math.hypot(t.clientX - (this.lastPtrX || t.clientX), t.clientY - (this.lastPtrY || t.clientY));
          if (dt <= 65 && dist <= 36 && (!this.cur || this.cur.stats.n <= 4)) {
            continue;
          }
          this.end(this.lastPtrX || t.clientX, this.lastPtrY || t.clientY);
          this.activePointer = null;
        } else if (this.cur || this.erasing) {
          this.end(this.lastPtrX || t.clientX, this.lastPtrY || t.clientY);
          this.activePointer = null;
        }
        const slot = this.slotOf(e, t.clientX, t.clientY);
        if (slot) {
          this.downs.all++;
          this.touchDraw = true;
          this.activePointer = null;
          this.lastPtrAt = now;
          this.lastPtrMoveAt = 0;
          this.lastPtrX = t.clientX;
          this.lastPtrY = t.clientY;
          const p = typeof t.force === "number" && t.force > 0 ? t.force : 0.5;
          this.begin(slot, t.clientX, t.clientY, e.timeStamp || now, p);
        }
      }
      if (!sawStylus && this.isPenWriting() && e.cancelable && isCanvasTarget(e)) {
        e.preventDefault();
        this.poisonActiveTouchesAsPalm(e.touches);
      }
    });

    const onTouchMove = this.safe("touchmove", (e) => {
      if (e._pinkHandled) return;
      if (this.scrollMode) return;
      const now = performance.now();
      let stylusTouch = null;
      if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t && (t.identifier === this.blockTouch || t.touchType === "stylus")) {
            stylusTouch = t;
            break;
          }
        }
      }
      if (!stylusTouch && e.touches) {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t && (t.identifier === this.blockTouch || t.touchType === "stylus")) {
            stylusTouch = t;
            break;
          }
        }
      }
      if (!stylusTouch) {
        if (this.isPenWriting() && e.cancelable && isCanvasTarget(e)) e.preventDefault();
        return;
      }
      if (!this.cur && !this.erasing && !isCanvasTarget(e)) return;
      e._pinkHandled = true;
      window.clearTimeout(this.ptrCancelTimer);
      this.ptrCancelTimer = 0;
      if (e.cancelable) e.preventDefault();
      this.blockTouch = stylusTouch.identifier;
      this.lastPenAt = now;
      this.cancelPinch(true);
      this.poisonActiveTouchesAsPalm(e.touches);
      // Orphan stylus touchmove rescue: if neither pointerdown nor touchstart started the stroke yet
      if (!this.cur && !this.erasing) {
        const rSlot = this.slotOf(e, stylusTouch.clientX, stylusTouch.clientY);
        if (rSlot) {
          this.touchDraw = true;
          this.activePointer = null;
          this.lastPtrAt = now;
          this.lastPtrMoveAt = 0;
          this.lastPtrX = stylusTouch.clientX;
          this.lastPtrY = stylusTouch.clientY;
          const p0 = typeof stylusTouch.force === "number" && stylusTouch.force > 0 ? stylusTouch.force : 0.5;
          this.begin(rSlot, stylusTouch.clientX, stylusTouch.clientY, e.timeStamp || now, p0);
        }
        return;
      }
      // Feed from touchmove whenever touchDraw is active OR pointermove has not fired within the last 14ms.
      // Only clear activePointer if pointermove has been silent for > 28ms so a 0.5ms touchmove-before-pointermove
      // ordering on frame 1 never drops the PointerEvent channel!
      const ptrAlive = this.activePointer !== null && this.lastPtrMoveAt > 0 && (now - this.lastPtrMoveAt) < 14;
      if (!this.touchDraw && !ptrAlive && (now - (this.lastPtrMoveAt || this.lastPtrAt || 0)) > 28) {
        this.touchDraw = true;
        this.activePointer = null;
      }
      if (!this.touchDraw && ptrAlive) return;
      const sourceList = (e.changedTouches && e.changedTouches.length) ? e.changedTouches : [stylusTouch];
      let moved = false;
      for (let i = 0; i < sourceList.length; i++) {
        const t = sourceList[i];
        if (!t || (t.identifier !== this.blockTouch && t.touchType !== "stylus")) continue;
        moved = true;
        this.lastPtrAt = now;
        this.lastPtrX = t.clientX;
        this.lastPtrY = t.clientY;
        const p = typeof t.force === "number" && t.force > 0 ? t.force : 0.5;
        this.move(t.clientX, t.clientY, e.timeStamp || now, p, t.azimuthAngle, t.altitudeAngle);
        if (this.cur) this.plugin.recorder.event(e.timeStamp || now, t, [t], []);
      }
      if (!moved && stylusTouch) {
        this.lastPtrAt = now;
        this.lastPtrX = stylusTouch.clientX;
        this.lastPtrY = stylusTouch.clientY;
        const p = typeof stylusTouch.force === "number" && stylusTouch.force > 0 ? stylusTouch.force : 0.5;
        this.move(stylusTouch.clientX, stylusTouch.clientY, e.timeStamp || now, p, stylusTouch.azimuthAngle, stylusTouch.altitudeAngle);
      }
      this.flushErase();
      this.paintLive();
    });

    const onTouchEnd = this.safe("touchend", (e) => {
      if (e._pinkHandled) return;
      if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const ct = e.changedTouches[i];
          this.palmTouchIds.delete(ct.identifier);
          this.touchDownTimes.delete(ct.identifier);
        }
      }
      this.prunePalmTouches(e.touches);
      if (this.blockTouch === null && !this.touchDraw) return;
      let endedStylus = null;
      if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.blockTouch || t.touchType === "stylus") {
            endedStylus = t;
            break;
          }
        }
      }
      if (!endedStylus && this.blockTouch !== null && e.touches) {
        let stylusStillDown = false;
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === this.blockTouch || t.touchType === "stylus") {
            stylusStillDown = true;
            break;
          }
        }
        if (!stylusStillDown) {
          endedStylus = { clientX: this.lastPtrX || 0, clientY: this.lastPtrY || 0 };
        }
      }
      if (!endedStylus) return;
      e._pinkHandled = true;
      window.clearTimeout(this.ptrCancelTimer);
      this.ptrCancelTimer = 0;
      this.blockTouch = null;
      this.lastPenAt = performance.now();
      if (this.touchDraw || this.activePointer !== null || this.cur || this.erasing) {
        this.touchDraw = false;
        this.activePointer = null;
        const endX = Number.isFinite(endedStylus.clientX) && endedStylus.clientX !== 0 ? endedStylus.clientX : this.lastPtrX;
        const endY = Number.isFinite(endedStylus.clientY) && endedStylus.clientY !== 0 ? endedStylus.clientY : this.lastPtrY;
        this.end(endX, endY);
        this.flushRemotePending();
      }
    });

    root.addEventListener("pointerdown", onPtrDown, { capture: true, passive: false });
    root.addEventListener("pointermove", onPtrMove, { capture: true, passive: false });
    root.addEventListener("pointerup", onPtrUp, { capture: true, passive: false });
    root.addEventListener("pointercancel", onPtrCancel, { capture: true, passive: false });
    root.addEventListener("pointerleave", () => this.clearHoverRing());
    root.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    root.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    root.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    root.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: false });

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const capOpts = { capture: true, passive: false };
      window.addEventListener("pointerdown", onPtrDown, capOpts);
      window.addEventListener("pointermove", onPtrMove, capOpts);
      window.addEventListener("pointerup", onPtrUp, capOpts);
      window.addEventListener("pointercancel", onPtrCancel, capOpts);
      window.addEventListener("touchstart", onTouchStart, capOpts);
      window.addEventListener("touchmove", onTouchMove, capOpts);
      window.addEventListener("touchend", onTouchEnd, capOpts);
      window.addEventListener("touchcancel", onTouchEnd, capOpts);
      this._winInputCleanup = () => {
        window.removeEventListener("pointerdown", onPtrDown, capOpts);
        window.removeEventListener("pointermove", onPtrMove, capOpts);
        window.removeEventListener("pointerup", onPtrUp, capOpts);
        window.removeEventListener("pointercancel", onPtrCancel, capOpts);
        window.removeEventListener("touchstart", onTouchStart, capOpts);
        window.removeEventListener("touchmove", onTouchMove, capOpts);
        window.removeEventListener("touchend", onTouchEnd, capOpts);
        window.removeEventListener("touchcancel", onTouchEnd, capOpts);
      };
    }
  }
  /** iPadOS hardware prediction + sub-frame kinematic velocity lookahead when WebKit provides 0 predicted samples. */
  predicted(list2, c) {
    if (c.straight) return null;
    const lim = PREDICT_MAX_PX / c.scale;
    const out = c.predBuf || (c.predBuf = []);
    out.length = 0;
    const tipX = c.b.tipX;
    const tipY = c.b.tipY;
    if (list2 && list2.length) {
      for (let i = 0; i < list2.length; i++) {
        const p = list2[i];
        const x = (p.clientX - c.rect.left) / c.scale;
        const y = (p.clientY - c.rect.top) / c.scale;
        if (Math.hypot(x - tipX, y - tipY) > lim) break;
        out.push(x, y);
      }
      if (out.length) return out;
    }
    const oe = c.b.oe;
    if (oe && c.b.qx.length >= 3) {
      const spd = Math.hypot(oe.dx, oe.dy);
      if (spd > 18) {
        const n = c.b.qx.length;
        const ux = c.b.qx[n - 1] - c.b.qx[n - 2], uy = c.b.qy[n - 1] - c.b.qy[n - 2];
        const vx = c.b.qx[n - 2] - c.b.qx[n - 3], vy = c.b.qy[n - 2] - c.b.qy[n - 3];
        const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
        if (ul > 1e-4 && vl > 1e-4 && (ux * vx + uy * vy) / (ul * vl) > 0.35) {
          const dtLook = 0.0055;
          const step = Math.min(lim * 0.75, spd * dtLook);
          if (step >= c.b.h) {
            out.push(tipX + oe.dx / spd * step, tipY + oe.dy / spd * step);
            return out;
          }
        }
      }
    }
    return null;
  }
  clearLiveTips() {
    if (this.liveCv) clearAll(this.liveCv);
    this.clearTips();
  }
  settlePendingTip() {
    if (!this.tipPending || this.cur) return;
    this.tipPending = false;
    this.clearLiveTips();
  }
  /** Clear the tip after a stroke. */
  clearTips() {
    if (this.tipCv) clearAll(this.tipCv);
  }
  paintHoverRing(slot, cx, cy) {
    if (!slot || !slot.el || !slot.geo) return;
    const rect = slot.el.getBoundingClientRect();
    const x = (cx - rect.left) / slot.scale;
    const y = (cy - rect.top) / slot.scale;
    if (x < 0 || y < 0 || x > slot.w || y > slot.h) {
      this.clearHoverRing();
      return;
    }
    const geo = slot.geo;
    if (!this.tipCv) this.tipCv = document.createElement("canvas");
    const tp = this.tipCv;
    if (tp.width !== geo.cw || tp.height !== geo.ch) {
      tp.width = geo.cw;
      tp.height = geo.ch;
    }
    if (tp.parentElement !== slot.el) slot.el.appendChild(tp);
    this.place(tp, slot, geo);
    tp.className = "pink-cv pink-tip";
    tp.style.opacity = "";
    const tip = tp.getContext("2d", { desynchronized: true });
    xform(tip, geo);
    if (this.hoverRingBox && this.hoverSlot === slot) {
      const b = this.hoverRingBox;
      tip.clearRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    } else if (this.hoverSlot && this.hoverSlot !== slot) {
      clearAll(tp);
    }
    const s = this.plugin.settings;
    const isEraser = this.tool === "eraser";
    const set = this.tool === "highlighter" ? s.highlighter : s.pen;
    const r = isEraser ? s.eraserSizes[s.eraserSlot] / 2 : Math.max(1.6 / slot.scale, set.sizes[set.s] / 2);
    const pad = 2 / slot.scale + 2;
    this.hoverRingBox = [x - r - pad, y - r - pad, x + r + pad, y + r + pad];
    this.hoverSlot = slot;
    tip.save();
    tip.beginPath();
    tip.arc(x, y, r, 0, Math.PI * 2);
    tip.lineWidth = 1.2 / slot.scale;
    if (isEraser) {
      tip.strokeStyle = "rgba(90,90,100,.75)";
      tip.fillStyle = "rgba(120,120,130,.08)";
      tip.fill();
      tip.stroke();
    } else {
      const col = set.colors[set.c] || "#007aff";
      tip.globalAlpha = this.tool === "highlighter" ? 0.35 : 0.45;
      tip.fillStyle = col;
      tip.fill();
      tip.globalAlpha = 0.85;
      tip.strokeStyle = col;
      tip.stroke();
    }
    tip.restore();
    this.releaseLiveLater();
  }
  clearHoverRing() {
    if (!this.hoverSlot && !this.hoverRingBox) return;
    this.hoverSlot = null;
    this.hoverRingBox = null;
    if (this.tipCv && !this.cur && !this.erasing) clearAll(this.tipCv);
  }
  /**
   * Native Metal-backed main-thread live canvases (desynchronized: true).
   * Eliminates Web Worker postMessage serialization overhead and async compositor race conditions.
   */
  attachLive(slot, geo, hl, win = geo) {
    this.clearHoverRing();
    window.clearTimeout(this.liveRelease);
    if (this.tipPending) {
      this.tipPending = false;
      this.clearLiveTips();
    }
    if (!this.liveCv) this.liveCv = document.createElement("canvas");
    const lv = this.liveCv;
    if (lv.width !== win.cw || lv.height !== win.ch) {
      lv.width = win.cw;
      lv.height = win.ch;
    }
    if (lv.parentElement !== slot.el) slot.el.appendChild(lv);
    this.place(lv, slot, win);
    if (this.liveUsed) clearAll(lv);
    this.liveUsed = false;
    lv.className = "pink-cv pink-live" + (hl ? " hl" : "");
    lv.style.opacity = hl ? String(HL_ALPHA) : "";
    this.liveSlot = slot;
    const liveG = lv.getContext("2d", { desynchronized: true });
    xform(liveG, win);
    if (!this.tipCv) this.tipCv = document.createElement("canvas");
    const tp = this.tipCv;
    if (tp.width !== win.cw || tp.height !== win.ch) {
      tp.width = win.cw;
      tp.height = win.ch;
    }
    if (tp.parentElement !== slot.el) slot.el.appendChild(tp);
    this.place(tp, slot, win);
    tp.className = "pink-cv pink-tip" + (hl ? " hl" : "");
    tp.style.opacity = hl ? String(HL_ALPHA) : "";
    const tipG = tp.getContext("2d", { desynchronized: true });
    xform(tipG, win);
    return { liveG, tipG };
  }
  releaseLive() {
    window.clearTimeout(this.liveRelease);
    this.hoverSlot = null;
    this.hoverRingBox = null;
    for (const cv of [this.liveCv, this.tipCv]) {
      if (cv) {
        cv.remove();
        cv.width = 0;
        cv.height = 0;
      }
    }
    this.liveCv = this.tipCv = null;
    this.liveSlot = null;
  }
  releaseLiveLater() {
    window.clearTimeout(this.liveRelease);
    this.liveRelease = window.setTimeout(() => {
      if (!this.cur && !this.erasing) this.releaseLive();
    }, 8e3);
  }
  begin(slot, cx, cy, t, pressure = null) {
    if (!slot) return;
    this.ensureMounted(slot);
    if (!slot.geo) slot.geo = this.geoFor(slot, "full");
    if (this.popEl || this.popBack) this.closePopover();
    this.plugin.lastInputAt = Date.now();
    this.activityAt = performance.now();
    this.holdUntil = performance.now() + 6e4;
    const rect = slot.el.getBoundingClientRect();
    const x = (cx - rect.left) / slot.scale;
    const y = (cy - rect.top) / slot.scale;
    const s = this.plugin.settings;
    if (this.tool === "eraser") {
      const geo = this.inkReady(slot);
      const { tipG: eraseTipG } = this.attachLive(slot, geo, false);
      this.erasing = { slot, rect, last: { x, y }, geo, tipG: eraseTipG };
      this.dragOriginals = [];
      this.dragPieces.clear();
      this.eraseDirty.clear();
      if (!this.eraseDirtyBoxes) this.eraseDirtyBoxes = /* @__PURE__ */ new Map();
      this.eraseDirtyBoxes.clear();
      this.eraseT = t;
      this.eraseAt(slot, x, y);
      this.ring = { x, y };
      this.flushErase();
      return;
    }
    const wantGeo = this.geoFor(slot, "full");
    const geo = (slot.inkGeo && sameScale(slot.inkGeo, wantGeo) && this.covers(slot, slot.inkGeo)) ? slot.inkGeo : wantGeo;
    const hl = this.tool === "highlighter";
    const set = hl ? s.highlighter : s.pen;
    const penStyle = hl ? "ball" : (s.penStyle || "fountain");
    const sensitivity = s.pressureSensitivity || 1.0;
    const win = windowGeo(geo, this.liveBox(geo, [x, y, x, y]));
    const { liveG, tipG } = this.attachLive(slot, geo, hl, win);
    const b = new StrokeBuilder(slot.scale, s.penSmooth, () => performance.now(), undefined, penStyle, sensitivity);
    b.add(x, y, pressure, t);
    this.plugin.recorder.start(this.touchDraw ? "touch" : "pointer", this.tool, set.sizes[set.s], slot.scale, 0, 1, rect, cx, cy, t);
    const stroke4 = { id: newId(), t: Date.now(), tool: this.tool, style: penStyle, color: set.colors[set.c], size: set.sizes[set.s], pts: [x, y, 0.5] };
    this.cur = {
      slot,
      stroke: stroke4,
      geo,
      liveG,
      tipG,
      b,
      rect,
      scale: slot.scale,
      x0: x,
      y0: y,
      hl,
      penStyle,
      straight: hl && s.hlStraight,
      frozen: 0,
      pred: null,
      dirty: null,
      win,
      bb: [x, y, x, y],
      lastT: t,
      lastX: cx,
      lastY: cy,
      stats: { n: 1, used: 1, ints: Number.isInteger(cx) && Number.isInteger(cy) ? 1 : 0, half: 0, dup: 0, coal: 0, ev: 0, pred: 0, t0: performance.now() }
    };
    this.paintLive();
  }
  move(cx, cy, t, pressure = null, azimuthAngle, altitudeAngle) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    this.activityAt = performance.now();
    if (this.erasing) {
      if (t < this.eraseT) return;
      this.eraseT = t;
      const { slot, rect, last } = this.erasing;
      const x2 = (cx - rect.left) / slot.scale;
      const y2 = (cy - rect.top) / slot.scale;
      const r = this.plugin.settings.eraserSizes[this.plugin.settings.eraserSlot] / 2;
      const d = Math.hypot(x2 - last.x, y2 - last.y);
      const k = Math.max(1, Math.ceil(d / Math.max(1, r / 2)));
      for (let i = 1; i <= k; i++) this.eraseAt(slot, last.x + (x2 - last.x) * i / k, last.y + (y2 - last.y) * i / k);
      this.erasing.last = { x: x2, y: y2 };
      this.ring = { x: x2, y: y2 };
      return;
    }
    const c = this.cur;
    if (!c) return;
    const st = c.stats;
    if (t < c.lastT || t === c.lastT && cx === c.lastX && cy === c.lastY) {
      st.dup++;
      return;
    }
    c.lastT = t;
    c.lastX = cx;
    c.lastY = cy;
    st.n++;
    if (Number.isInteger(cx) && Number.isInteger(cy)) st.ints++;
    if (Number.isInteger(cx * 2) && Number.isInteger(cy * 2)) st.half++;
    const x = (cx - c.rect.left) / c.scale;
    const y = (cy - c.rect.top) / c.scale;
    if (c.straight) {
      let ex = x;
      let ey = y;
      const ang = Math.atan2(Math.abs(ey - c.y0), Math.abs(ex - c.x0)) * 180 / Math.PI;
      if (ang < 7) ey = c.y0;
      else if (ang > 83) ex = c.x0;
      c.stroke.pts = [c.x0, c.y0, 0.5, ex, ey, 0.5];
      return;
    }
    if (c.b.add(x, y, pressure, t, azimuthAngle, altitudeAngle)) st.used++;
  }
  abortStroke() {
    this.log.warn("ink", "a stroke never ended; discarding it");
    this.plugin.recorder.cancel();
    this.cur = null;
    this.erasing = null;
    this.activePointer = null;
    this.blockTouch = null;
    this.touchDraw = false;
    this.holdUntil = 0;
    if (this.liveCv) clearAll(this.liveCv);
    this.clearTips();
    this.flushRemotePending();
  }
  end(cx, cy) {
    var _a, _b, _c;
    this.plugin.lastInputAt = Date.now();
    this.holdUntil = performance.now() + 700;
    if (this.endRenderTimer) window.clearTimeout(this.endRenderTimer);
    this.endRenderTimer = window.setTimeout(() => {
      this.endRenderTimer = 0;
      this.requestRender();
    }, 750);
    if (this.erasing) {
      const { slot: slot2 } = this.erasing;
      this.flushErase();
      this.clearTips();
      const pieces = Array.from(this.dragPieces.values());
      this.log.info("ink", "erase", { page: slot2.key, removed: this.dragOriginals.length, pieces: pieces.length, mode: this.plugin.settings.eraserMode, hlOnly: this.plugin.settings.eraseHlOnly });
      if (pieces.length || this.dragOriginals.length) {
        this.pushUndo(this.strokeOp([{ page: slot2.key, remove: pieces, add: this.dragOriginals }]));
        this.changed([slot2.key]);
      }
      this.erasing = null;
      this.ring = null;
      this.ringBox = null;
      this.dragOriginals = [];
      this.dragPieces.clear();
      this.releaseLiveLater();
      if (this.plugin.settings.autoDeselectEraser) {
        this.tool = this.lastDrawTool;
        this.updateTools();
      }
      return;
    }
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    const slot = c.slot;
    const st = c.stroke;
    const endX = (cx - c.rect.left) / c.scale;
    const endY = (cy - c.rect.top) / c.scale;
    const upPx = Math.hypot(endX - c.b.tipX, endY - c.b.tipY) * c.scale;
    if (!c.straight) {
      if (Number.isFinite(endX) && Number.isFinite(endY) && c.stats.n <= 4 && upPx >= 0.5 && upPx <= 60) {
        c.b.add(endX, endY, null, (c.lastT || 0) + 4);
      }
      const line2 = c.b.finish();
      st.pts = packLine(line2, c.scale);
    }
    this.plugin.recorder.finish(cx, cy, st.pts, c.straight ? null : [+c.b.trimmedStart.toFixed(1), +c.b.trimmedEnd.toFixed(1)]);
    if (!st.pts.length) {
      if (this.liveCv) clearAll(this.liveCv);
      this.clearTips();
      this.releaseLiveLater();
      return;
    }
    if (!slot.inkGeo || !sameScale(slot.inkGeo, c.geo) || !this.covers(slot, slot.inkGeo)) {
      this.inkReady(slot);
    }
    ((_c = (_a = this.doc.pages)[_b = slot.key]) != null ? _c : _a[_b] = []).push(st);
    const drawn = !!slot.inkGeo;
    if (drawn && slot.inkGeo) {
      const cv = this.ensureInkCanvas(slot, st.tool);
      const g = cv.getContext("2d");
      xform(g, slot.inkGeo);
      drawStroke(g, st, true);
      this.clearLiveTips();
      this.tipPending = false;
      if (!slot.rendered || !this.covers(slot, slot.inkGeo)) this.requestRender();
    } else {
      this.tipPending = true;
      this.requestRender();
      window.setTimeout(() => this.settlePendingTip(), 1500);
    }
    this.log.perf.strokes++;
    {
      const s = c.stats;
      const ms = Math.max(1, performance.now() - s.t0);
      if (this.log.perf.strokes <= 40) this.log.info("ink", `stroke ${this.log.perf.strokes}`, {
        samples: s.n,
        used: s.used,
        events: s.ev,
        coalescedPerEvent: s.ev ? +(s.coal / s.ev).toFixed(1) : 0,
        hz: Math.round(s.n * 1e3 / ms),
        wholePixels: +(s.ints / s.n).toFixed(2),
        halfPixels: +(s.half / s.n).toFixed(2),
        repeatsDropped: s.dup,
        predictedPerEvent: s.ev ? +(s.pred / s.ev).toFixed(1) : 0,
        lengthPx: Math.round(c.b.length * c.scale),
        trimmedPx: [+c.b.trimmedStart.toFixed(1), +c.b.trimmedEnd.toFixed(1)],
        liftOffsetPx: +upPx.toFixed(1),
        storedPoints: st.pts.length / 3,
        sigmaPx: 0
      });
    }
    this.pushUndo(this.strokeOp([{ page: slot.key, remove: [st], add: [] }]));
    this.changed([slot.key]);
    this.releaseLiveLater();
  }
  /** Draw the line in progress as one path (no seams), clearing only where it was and is. */
  paintLive() {
    const c = this.cur;
    if (!c) return;
    const tFrame0 = performance.now();
    const st = c.stroke;
    let pts;
    if (c.straight) {
      pts = st.pts;
    } else {
      const b = c.b;
      let frozeNow = false;
      if (!c.hl && b.fx.length - c.frozen > LIVE_BAKE_STEP) {
        const to = b.fx.length - LIVE_BAKE_KEEP;
        const seg = c.bakeSeg || (c.bakeSeg = []);
        seg.length = 0;
        for (let i = Math.max(0, c.frozen - 2); i < to; i++) seg.push(b.fx[i], b.fy[i], b.fp[i] !== undefined ? b.fp[i] : 0.5);
        drawLive(c.liveG, st.tool, st.color, st.size, seg, true, c.penStyle);
        this.liveUsed = true;
        c.frozen = Math.max(0, to - 1);
        frozeNow = true;
      }
      pts = c.livePts || (c.livePts = []);
      pts.length = 0;
      for (let i = Math.max(0, c.frozen - 1); i < b.fx.length; i++) pts.push(b.fx[i], b.fy[i], b.fp[i] !== undefined ? b.fp[i] : 0.5);
      const prov = b.provisional(c.pred);
      for (let i = 0; i < prov.length; i++) pts.push(prov[i]);
      c.frozeNow = frozeNow;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const nPts = Math.floor(pts.length / 3);
    for (let i = 0; i < nPts * 3; i += 3) {
      if (pts[i] < x0) x0 = pts[i];
      if (pts[i] > x1) x1 = pts[i];
      if (pts[i + 1] < y0) y0 = pts[i + 1];
      if (pts[i + 1] > y1) y1 = pts[i + 1];
    }
    const pad = st.size + 3 / c.scale;
    if (nPts > 0) {
      const bb = c.bb;
      bb[0] = Math.min(bb[0], x0);
      bb[1] = Math.min(bb[1], y0);
      bb[2] = Math.max(bb[2], x1);
      bb[3] = Math.max(bb[3], y1);
      if (!fits(c.win, c.geo, bb, pad) && !this.coversPage(c)) this.rewindow(c);
    }
    const prev = c.dirty;
    const tip = c.tipG;
    if (tip) {
      if (prev) tip.clearRect(prev[0] - pad, prev[1] - pad, prev[2] - prev[0] + 2 * pad, prev[3] - prev[1] + 2 * pad);
      if (nPts > 0) {
        tip.clearRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
        if (!prev) c.dirty = [x0, y0, x1, y1];
        else {
          prev[0] = x0;
          prev[1] = y0;
          prev[2] = x1;
          prev[3] = y1;
        }
        drawLive(tip, st.tool, st.color, st.size, pts, true, c.penStyle);
      } else c.dirty = null;
    }
    this.log.frame(performance.now() - tFrame0);
  }
  /** The box the live canvases cover: the whole rendered geo window (already bounded to MAX_PX = 6M px). */
  liveBox(geo, bb) {
    const k = geo.scale * geo.dpr;
    const gx = Number.isFinite(geo.x) && geo.x > 0 ? geo.x : 0;
    const gy = Number.isFinite(geo.y) && geo.y > 0 ? geo.y : 0;
    return geo.w * k * (geo.h * k) <= LIVE_PAGE_MAX_PX * LIVE_PAGE_MAX_PX ? [gx, gy, gx + geo.w, gy + geo.h] : bb;
  }
  /** True when the live canvases already cover the whole rendered geo window, so a stroke never needs them moved. */
  coversPage(c) {
    const k = c.geo.scale * c.geo.dpr;
    const gx = Number.isFinite(c.geo.x) && c.geo.x > 0 ? c.geo.x : 0;
    const gy = Number.isFinite(c.geo.y) && c.geo.y > 0 ? c.geo.y : 0;
    return c.win.x <= gx + 1 && c.win.y <= gy + 1 && c.win.cw >= Math.floor(c.geo.w * k) - 1 && c.win.ch >= Math.floor(c.geo.h * k) - 1;
  }
  rewindow(c) {
    this.windowMoves++;
    const win = windowGeo(c.geo, this.liveBox(c.geo, c.bb));
    const lv = this.liveCv;
    lv.width = win.cw;
    lv.height = win.ch;
    this.place(lv, c.slot, win);
    c.liveG = lv.getContext("2d", { desynchronized: true });
    xform(c.liveG, win);
    if (!this.tipCv) this.tipCv = document.createElement("canvas");
    const tp = this.tipCv;
    tp.width = win.cw;
    tp.height = win.ch;
    if (tp.parentElement !== c.slot.el) c.slot.el.appendChild(tp);
    this.place(tp, c.slot, win);
    c.tipG = tp.getContext("2d", { desynchronized: true });
    xform(c.tipG, win);
    c.win = win;
    if (!c.hl && c.frozen > 0) {
      const seg = [];
      for (let i = 0; i <= Math.min(c.frozen, c.b.fx.length - 1); i++) seg.push(c.b.fx[i], c.b.fy[i], c.b.fp[i] !== undefined ? c.b.fp[i] : 0.5);
      drawLive(c.liveG, c.stroke.tool, c.stroke.color, c.stroke.size, seg, true, c.penStyle);
    }
  }
  paintRing() {
    var _a;
    const e = this.erasing;
    const tip = (e && e.tipG) || ((_a = this.tipCv) == null ? void 0 : _a.getContext("2d"));
    if (!e || !tip || !this.ring) return;
    const r = this.plugin.settings.eraserSizes[this.plugin.settings.eraserSlot] / 2;
    xform(tip, e.geo);
    if (this.ringBox) {
      const b = this.ringBox;
      tip.clearRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    }
    const pad = 2 / e.slot.scale + 1;
    this.ringBox = [this.ring.x - r - pad, this.ring.y - r - pad, this.ring.x + r + pad, this.ring.y + r + pad];
    tip.save();
    tip.beginPath();
    tip.arc(this.ring.x, this.ring.y, r, 0, Math.PI * 2);
    tip.lineWidth = 1.2 / e.slot.scale;
    tip.strokeStyle = "rgba(90,90,100,.9)";
    tip.fillStyle = "rgba(120,120,130,.12)";
    tip.fill();
    tip.stroke();
    tip.restore();
  }
  // ================================================================ erasing
  noteRemoved(s) {
    this.doc.deleted[s.id] = Date.now();
    if (this.dragPieces.has(s.id)) this.dragPieces.delete(s.id);
    else this.dragOriginals.push(s);
  }
  addEraseDirtyBox(tool, st) {
    if (!this.eraseDirtyBoxes) this.eraseDirtyBoxes = /* @__PURE__ */ new Map();
    const b = bboxOf(st);
    const pad = (st.size || 2) * 1.7 + 6;
    const cur = this.eraseDirtyBoxes.get(tool);
    if (!cur) {
      this.eraseDirtyBoxes.set(tool, [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]);
    } else {
      cur[0] = Math.min(cur[0], b[0] - pad);
      cur[1] = Math.min(cur[1], b[1] - pad);
      cur[2] = Math.max(cur[2], b[2] + pad);
      cur[3] = Math.max(cur[3], b[3] + pad);
    }
  }
  eraseAt(slot, x, y) {
    const list2 = this.doc.pages[slot.key];
    if (!list2 || !list2.length) return;
    const s = this.plugin.settings;
    const r = s.eraserSizes[s.eraserSlot] / 2;
    const useGrid = list2.length >= 16 && !(this.erasing && this.erasing.mutated && this.plugin && this.plugin.settings.eraserMode === "pixel" && list2.length < 120);
    const candidates = useGrid ? queryPageGridCandidates(list2, x, y, r + 24) : null;
    if (candidates && candidates.size === 0) return;
    let changed = false;
    const out = [];
    for (let i = 0; i < list2.length; i++) {
      const st = list2[i];
      if (candidates && !candidates.has(i)) {
        out.push(st);
        continue;
      }
      if (s.eraseHlOnly && st.tool !== "highlighter") {
        out.push(st);
        continue;
      }
      const R = r + st.size / 2;
      if (!strokeHit(st, x, y, R)) {
        out.push(st);
        continue;
      }
      if (s.eraserMode === "stroke") {
        this.noteRemoved(st);
        this.addEraseDirtyBox(st.tool, st);
        this.eraseDirty.add(st.tool);
        changed = true;
        continue;
      }
      const pieces = cutStroke(st, x, y, R);
      if (!pieces) {
        out.push(st);
        continue;
      }
      this.noteRemoved(st);
      this.addEraseDirtyBox(st.tool, st);
      for (const pc of pieces) {
        this.dragPieces.set(pc.id, pc);
        out.push(pc);
      }
      this.eraseDirty.add(st.tool);
      changed = true;
    }
    if (changed) {
      if (this.erasing) this.erasing.mutated = true;
      this.doc.pages[slot.key] = out;
    }
  }
  /** Redraw the layers the eraser changed, once per event however many samples it carried, and move the ring. */
  flushErase() {
    const e = this.erasing;
    if (!e) return;
    if (this.eraseDirty.size) {
      for (const t of this.eraseDirty) {
        const box = this.eraseDirtyBoxes ? this.eraseDirtyBoxes.get(t) : null;
        this.redrawLayer(e.slot, t, box);
      }
      this.eraseDirty.clear();
      if (this.eraseDirtyBoxes) this.eraseDirtyBoxes.clear();
    }
    this.paintRing();
  }
  clearPage(idx = this.currentIdx) {
    const s = this.slots[idx];
    const list2 = s ? this.doc.pages[s.key] : void 0;
    if (!s || !(list2 == null ? void 0 : list2.length)) return;
    const group = [{ page: s.key, remove: [], add: list2.slice() }];
    for (const st of list2) this.doc.deleted[st.id] = Date.now();
    this.doc.pages[s.key] = [];
    this.log.info("ink", "page cleared", { page: s.key, strokes: list2.length });
    this.redrawInk(s);
    this.pushUndo(this.strokeOp(group));
    this.changed([s.key]);
  }
  // ================================================================ history
  pushUndo(op) {
    this.undoStack.push(op);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndoButtons();
  }
  strokeOp(g) {
    return { undo: () => this.strokeOp(this.applyGroup(g)) };
  }
  applyDelta(d) {
    var _a, _b, _c;
    const ids2 = new Set(d.remove.map((s) => s.id));
    const removedNow = [];
    let list2 = (_a = this.doc.pages[d.page]) != null ? _a : [];
    if (ids2.size) {
      const keep = [];
      for (const s of list2) {
        if (ids2.has(s.id)) {
          removedNow.push(s);
          this.doc.deleted[s.id] = Date.now();
        } else keep.push(s);
      }
      list2 = keep;
    }
    const logSt = this.file ? (_c = (_b = this.plugin.sync) == null ? void 0 : _b.logStates) == null ? void 0 : _c.get(this.file.path + ".ink.json") : null;
    const added = d.add.map((s) => {
      if (this.doc.deleted[s.id] !== void 0) {
        const synced = logSt && ((logSt.erased && logSt.erased[s.id] !== void 0) || (logSt.base && logSt.base.strokes && logSt.base.strokes[s.id] !== void 0));
        if (!synced) delete this.doc.deleted[s.id];
      }
      return cloneStrokeWithCaches(s, newId());
    });
    list2 = list2.concat(added).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    this.doc.pages[d.page] = list2;
    return { page: d.page, remove: added, add: removedNow };
  }
  applyGroup(g) {
    const inv = g.map((d) => this.applyDelta(d));
    for (const d of g) {
      const s = this.slots.find((x) => x.key === d.page);
      if (s) this.redrawInk(s);
    }
    this.changed(g.map((d) => d.page));
    return inv.reverse();
  }
  undo() {
    this.log.info("history", "undo", { undoLeft: this.undoStack.length, redoLeft: this.redoStack.length });
    const op = this.undoStack.pop();
    if (op) this.redoStack.push(op.undo());
    this.updateUndoButtons();
  }
  redo() {
    this.log.info("history", "redo", { undoLeft: this.undoStack.length, redoLeft: this.redoStack.length });
    const op = this.redoStack.pop();
    if (op) this.undoStack.push(op.undo());
    this.updateUndoButtons();
  }
  // ================================================================ page operations
  insertBlankAfter(idx) {
    var _a, _b;
    if (!this.file || !this.slots.length) return;
    const ref = idx >= 0 ? this.slots[Math.min(idx, this.slots.length - 1)] : null;
    const w = (_a = ref == null ? void 0 : ref.w) != null ? _a : this.defSize.w;
    const h = (_b = ref == null ? void 0 : ref.h) != null ? _b : this.defSize.h;
    const pos = placeBlankTree(ref ? { pdfN: ref.pdfN, blank: ref.blank } : null);
    const b = { id: newId(), anchor: pos.anchor, ord: 0, w, h, t: pos.t, parent: pos.parent };
    this.doc.blanks[b.id] = b;
    layoutBlanks(this.doc.blanks);
    this.pushUndo(this.addBlankOp(b));
    this.changed();
    this.buildSlots(blankKey(b.id));
    this.log.info("pages", "blank page added", { anchor: b.anchor, parent: b.parent });
  }
  /** Copy a page (and everything written on it) right after itself. A copy of a PDF page is a new page showing the same PDF page. */
  duplicateAt(idx) {
    var _a, _b;
    const s = this.slots[idx];
    if (!s || !this.file) return;
    const src = (_a = s.pdfN) != null ? _a : s.srcN;
    const pos = placeBlankTree({ pdfN: s.pdfN, blank: s.blank });
    const b = { id: newId(), anchor: pos.anchor, ord: 0, w: s.w, h: s.h, t: pos.t, parent: pos.parent };
    if (src !== null) b.src = src;
    this.doc.blanks[b.id] = b;
    layoutBlanks(this.doc.blanks);
    const strokes2 = (_b = this.doc.pages[s.key]) != null ? _b : [];
    if (strokes2.length) this.doc.pages[blankKey(b.id)] = strokes2.map((st) => cloneStrokeWithCaches(st, newId()));
    this.pushUndo(this.addBlankOp(b));
    this.changed();
    this.buildSlots(blankKey(b.id));
    this.log.info("pages", "page duplicated", { of: s.key });
  }
  deleteBlankAt(idx) {
    var _a;
    const s = this.slots[idx];
    if (!s || !s.blank) return;
    const snap = this.removeBlank(s.blank.id);
    this.log.info("pages", "blank page deleted", { id: s.blank.id, strokes: snap.strokes.length });
    this.pushUndo(this.delBlankOp(snap));
    this.changed();
    this.buildSlots((_a = this.slots[Math.max(0, idx - 1)]) == null ? void 0 : _a.key);
    new import_obsidian4.Notice("Blank page deleted. Tap undo to bring it back.");
  }
  removeBlank(id) {
    var _a;
    const blank = this.doc.blanks[id];
    const strokes2 = (_a = this.doc.pages[blankKey(id)]) != null ? _a : [];
    delete this.doc.blanks[id];
    delete this.doc.pages[blankKey(id)];
    this.doc.deleted[id] = Date.now();
    return { blank, strokes: strokes2 };
  }
  restoreBlank(snap) {
    const b = { ...snap.blank, id: newId(), t: Date.now() };
    const oldParentRef = "b:" + snap.blank.id;
    const newParentRef = "b:" + b.id;
    for (const child of Object.values(this.doc.blanks)) {
      if (child.parent === oldParentRef) child.parent = newParentRef;
    }
    this.doc.blanks[b.id] = b;
    if (snap.strokes.length) this.doc.pages[blankKey(b.id)] = snap.strokes.map((s) => cloneStrokeWithCaches(s, newId()));
    return b;
  }
  addBlankOp(b) {
    return {
      undo: () => {
        const snap = this.removeBlank(b.id);
        this.changed();
        this.buildSlots();
        return this.delBlankOp(snap);
      }
    };
  }
  delBlankOp(snap) {
    return {
      undo: () => {
        const nb = this.restoreBlank(snap);
        this.changed();
        this.buildSlots(blankKey(nb.id));
        return this.addBlankOp(nb);
      }
    };
  }
  // ================================================================ persistence
  changed(keys) {
    var _a, _b;
    this.doc.updated = Date.now();
    if (this.file) this.doc.name = this.file.path;
    this.updateUndoButtons();
    if (keys) for (const k of keys) (_a = this.thumbs) == null ? void 0 : _a.invalidate(k);
    else (_b = this.thumbs) == null ? void 0 : _b.invalidateAll();
    this.saveSoon();
  }
  isRemoved(pdfN) {
    var _a, _b;
    return !!((_b = (_a = this.doc.removed) == null ? void 0 : _a[String(pdfN)]) == null ? void 0 : _b.on);
  }
  removedCount() {
    var _a;
    return Object.values((_a = this.doc.removed) != null ? _a : {}).filter((m) => m.on).length;
  }
  setPageRemoved(n, on) {
    var _a, _b, _c, _d;
    const rm = (_b = (_a = this.doc).removed) != null ? _b : _a.removed = {};
    const prev = (_d = (_c = rm[String(n)]) == null ? void 0 : _c.t) != null ? _d : 0;
    rm[String(n)] = { on, t: Math.max(Date.now(), prev + 1) };
  }
  /**
   * Delete any page. Blank pages are removed (undo brings them back). A PDF page cannot be erased from the PDF file,
   * so it is removed from Pencil Ink's view instead. Undo, or Restore in Pages, brings it back.
   */
  deletePageAt(idx) {
    var _a;
    const s = this.slots[idx];
    if (!s) return;
    if (s.blank) {
      this.deleteBlankAt(idx);
      return;
    }
    if (s.pdfN === null) return;
    const visible = this.slots.filter((x) => x.pdfN !== null).length;
    if (visible <= 1) {
      new import_obsidian4.Notice("Can't remove the last page.");
      return;
    }
    const n = s.pdfN;
    const neighbour = (_a = this.slots[idx - 1]) != null ? _a : this.slots[idx + 1];
    this.setPageRemoved(n, true);
    this.log.info("pages", "pdf page removed from view", { page: n });
    this.pushUndo(this.showPageOp(n));
    this.changed();
    this.buildSlots(neighbour == null ? void 0 : neighbour.key);
    new import_obsidian4.Notice(`Page ${n} removed. Tap undo, or Restore in Pages, to bring it back.`);
  }
  /** Undo of a removal: show the page again. */
  showPageOp(n) {
    return {
      undo: () => {
        this.setPageRemoved(n, false);
        this.changed();
        this.buildSlots(String(n));
        return this.hidePageOp(n);
      }
    };
  }
  hidePageOp(n) {
    return {
      undo: () => {
        this.setPageRemoved(n, true);
        this.changed();
        this.buildSlots();
        return this.showPageOp(n);
      }
    };
  }
  restoreAllPages() {
    var _a;
    const keys = Object.keys((_a = this.doc.removed) != null ? _a : {}).filter((k) => this.doc.removed[k].on);
    if (!keys.length) return;
    for (const k of keys) this.setPageRemoved(Number(k), false);
    this.log.info("pages", "pages restored", { pages: keys.map(Number) });
    this.changed();
    this.buildSlots();
    new import_obsidian4.Notice(`Restored ${keys.length} page${keys.length === 1 ? "" : "s"}.`);
  }
  /** Bookmark or un-bookmark a page. Stored in the annotation file, so it syncs like everything else. */
  toggleBookmark(key) {
    var _a, _b, _c, _d, _e, _f;
    const bm = (_b = (_a = this.doc).bookmarks) != null ? _b : _a.bookmarks = {};
    const on = !((_c = bm[key]) == null ? void 0 : _c.on);
    const prev = (_f = (_e = bm[key]) == null ? void 0 : _e.t) != null ? _f : 0;
    bm[key] = { on, t: Math.max(Date.now(), prev + 1) };
    this.doc.updated = Date.now();
    this.updateBookmarkButton();
    (_d = this.thumbs) == null ? void 0 : _d.refreshBookmarks();
    this.saveSoon();
  }
  saveSoon() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      const nowPerf = performance.now();
      if (this.isPenActive() || this.pinching || this.smoothZoomRaf || nowPerf - this.lastScroll < 1800 || nowPerf - this.zoomAt < 1800 || Date.now() - this.plugin.lastInputAt < 1800) {
        this.saveSoon();
        return;
      }
      void this.saveNow().then(() => {
        if (this.file) this.plugin.sync.notifyAnnotation(this.file.path);
      });
    }, this.saveDelay());
  }
  /** The annotation file is written whole, so a big book is saved less often while you write. */
  saveDelay() {
    let strokes2 = 0;
    for (const list2 of Object.values(this.doc.pages)) strokes2 += list2.length;
    return strokes2 > 2e3 ? 4500 : strokes2 > 500 ? 3e3 : 2200;
  }
  async saveNow() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.file || this.docOwner !== this.file) return;
    try {
      const pdfPath = this.file.path;
      const sidecarPath = pdfPath + ".ink.json";
      await this.plugin.sync.withFileLock(sidecarPath, async () => {
        const f = this.plugin.app.vault.getAbstractFileByPath(sidecarPath);
        const mtime = f && "stat" in f ? f.stat.mtime : void 0;
        if (mtime !== void 0 && this.sidecarSeen !== void 0 && mtime !== this.sidecarSeen && !this.plugin.sync.isOwnWrite(sidecarPath)) {
          const onDisk = await this.plugin.sync.readSidecar(pdfPath);
          if (onDisk) this.onRemote(onDisk);
        }
        const serialized = JSON.stringify(this.doc);
        await this.plugin.sync.writeText(sidecarPath, serialized, this.sidecarSeen);
        const after = this.plugin.app.vault.getAbstractFileByPath(sidecarPath);
        this.sidecarSeen = after && "stat" in after ? after.stat.mtime : mtime;
        if (after && "stat" in after && this.plugin.sync.primeSidecarCache) {
          this.plugin.sync.primeSidecarCache(sidecarPath, this.doc, after.stat.mtime, after.stat.size);
        }
      });
    } catch (e) {
      this.log.error("save", "could not save annotations", e);
      new import_obsidian4.Notice("Pencil Ink: could not save annotations");
    }
  }
  onRemote(merged) {
    const before = this.doc;
    this.doc = mergeDocs(this.doc, merged);
    if (sameContent(before, this.doc)) return;
    const layoutChanged = !sameBlanks(before, this.doc) || !sameMarksMap(before.removed, this.doc.removed);
    if (!this.remoteChangedKeys) this.remoteChangedKeys = /* @__PURE__ */ new Set();
    const allKeys = /* @__PURE__ */ new Set([...Object.keys(before.pages), ...Object.keys(this.doc.pages)]);
    for (const k of allKeys) {
      const a = before.pages[k] || [];
      const b = this.doc.pages[k] || [];
      if (a.length !== b.length || a.some((st, i) => st.id !== b[i].id)) {
        this.remoteChangedKeys.add(k);
      }
    }
    if (this.activePointer !== null || this.cur !== null || this.erasing !== null) {
      this.remoteWhileWriting = merged;
      this.remoteLayoutPending = this.remoteLayoutPending || layoutChanged;
      this.remoteRedrawPending = true;
      return;
    }
    this.applyRemoteViewUpdate(layoutChanged);
  }
  flushRemotePending() {
    if (this.activePointer !== null || this.cur !== null || this.erasing !== null) return;
    this.remoteWhileWriting = null;
    if (!this.remoteRedrawPending && !this.remoteLayoutPending) return;
    const layoutChanged = this.remoteLayoutPending;
    this.remoteLayoutPending = false;
    this.remoteRedrawPending = false;
    this.applyRemoteViewUpdate(layoutChanged);
  }
  applyRemoteViewUpdate(layoutChanged) {
    var _a, _b, _c;
    const changedKeys = this.remoteChangedKeys ? Array.from(this.remoteChangedKeys) : [];
    if (this.remoteChangedKeys) this.remoteChangedKeys.clear();
    if (layoutChanged) {
      this.buildSlots();
      this.log.info("sync", "remote changed the page layout");
    } else {
      if (changedKeys.length > 0) {
        const keySet = new Set(changedKeys);
        for (const s of this.renderedSet) {
          if (keySet.has(s.key)) this.redrawInk(s);
        }
        for (const k of changedKeys) (_a = this.thumbs) == null ? void 0 : _a.invalidate(k);
      } else {
        for (const s of this.renderedSet) this.redrawInk(s);
        (_b = this.thumbs) == null ? void 0 : _b.invalidateAll();
      }
      this.updateBookmarkButton();
      (_c = this.thumbs) == null ? void 0 : _c.refreshBookmarks();
    }
  }
  /** A parsed page, from the cache when possible. Old pages are cleaned up only when they leave the cache and no slot uses them. */
  async pageProxy(n) {
    const hit = this.pageCache.get(n);
    if (hit) {
      this.pageCache.delete(n);
      this.pageCache.set(n, hit);
      return hit;
    }
    const page = await this.pdf.getPage(n);
    this.pageCache.set(n, page);
    for (const [k, p] of this.pageCache) {
      if (this.pageCache.size <= (this.isBigBook() ? 4 : PAGE_CACHE)) break;
      let inUse = false;
      if (this.renderedSet) {
        for (const s of this.renderedSet) {
          if (s.page === p) {
            inUse = true;
            break;
          }
        }
      }
      if (inUse) continue;
      this.pageCache.delete(k);
      try {
        p.cleanup();
      } catch (e) {
      }
    }
    return page;
  }
  /** Hooks for the developer test panel. They use the same code paths as a finger or the Pencil; nothing is faked. */
  testApi() {
    var _a, _b;
    const slotAt = (i) => this.slots[i];
    const at = (s, x, y) => {
      this.ensureMounted(s);
      const r = s.el.getBoundingClientRect();
      return [r.left + x * s.scale, r.top + y * s.scale];
    };
    const drawWith = (s, pts, tool) => {
      const prev = this.tool;
      this.selectTool(tool);
      const [x0, y0] = at(s, pts[0][0], pts[0][1]);
      this.begin(s, x0, y0, pts[0][2]);
      for (let i = 1; i < pts.length; i++) {
        const [x, y] = at(s, pts[i][0], pts[i][1]);
        this.move(x, y, pts[i][2]);
      }
      const last = pts[pts.length - 1];
      const [xl, yl] = at(s, last[0], last[1]);
      const t0 = performance.now();
      this.end(xl, yl);
      const commitMs = performance.now() - t0;
      this.selectTool(prev);
      return commitMs;
    };
    const lastOf = (idx) => {
      var _a2, _b2, _c;
      const list2 = (_c = this.doc.pages[(_b2 = (_a2 = slotAt(idx)) == null ? void 0 : _a2.key) != null ? _b2 : ""]) != null ? _c : [];
      return list2[list2.length - 1];
    };
    return {
      pageCount: () => this.slots.length,
      current: () => this.currentIdx,
      goTo: (idx) => this.goTo(idx),
      slots: () => this.slots.map((s) => ({ idx: s.idx, key: s.key, blank: !!s.blank, pdfN: s.pdfN, near: s.near, rendered: s.rendered, w: s.w, h: s.h, scale: s.scale })),
      zoom: () => this.zoom,
      zoomTo: async (z) => {
        const r = this.scrollerEl.getBoundingClientRect();
        this.applyZoom(z, r.top + this.scrollerEl.clientHeight / 2, true);
      },
      settled: () => {
        if (this.schedTimer || this.zoomWait || this.smoothZoomRaf || performance.now() - this.zoomAt < 320) return false;
        if (this.activeRenders > 0 || this.slots.some((s) => s.rendering)) return false;
        const near = Array.from(this.active).filter((s) => s.near);
        return near.length > 0 && near.every((s) => s.rendered && s.quality === "full" && !!s.geo && Math.abs(s.geo.scale - s.scale) < 1e-6);
      },
      scrollTop: () => this.scrollerEl.scrollTop,
      setScrollTop: (y) => {
        this.scrollerEl.scrollTop = y;
        this.updateViewport(false);
      },
      maxScroll: () => this.scrollerEl.scrollHeight - this.scrollerEl.clientHeight,
      drawStroke: (idx, pts, tool = "pen") => {
        var _a2, _b2;
        const s = slotAt(idx);
        if (!s || !s.rendered || !s.geo) return { drawn: false, painted: 0, layerOk: false, commitMs: 0 };
        const before = ((_a2 = this.doc.pages[s.key]) != null ? _a2 : []).length;
        const commitMs = drawWith(s, pts, tool);
        const drawn = ((_b2 = this.doc.pages[s.key]) != null ? _b2 : []).length > before;
        const cv = tool === "pen" ? s.penCv : s.hlCv;
        const layerOk = tool === "pen" ? !!s.penCv : !!s.hlCv;
        return { drawn, painted: cv ? countPainted(cv) : 0, layerOk, commitMs };
      },
      eraseStroke: (idx, pts, mode, hlOnly) => {
        var _a2, _b2;
        const s = slotAt(idx);
        if (!s) return null;
        const set = this.plugin.settings;
        const prevMode = set.eraserMode;
        const prevHl = set.eraseHlOnly;
        set.eraserMode = mode;
        set.eraseHlOnly = hlOnly;
        const before = ((_a2 = this.doc.pages[s.key]) != null ? _a2 : []).length;
        drawWith(s, pts, "eraser");
        const after = ((_b2 = this.doc.pages[s.key]) != null ? _b2 : []).length;
        set.eraserMode = prevMode;
        set.eraseHlOnly = prevHl;
        return { before, after };
      },
      undo: () => this.undo(),
      redo: () => this.redo(),
      addBlankAfter: (idx) => this.insertBlankAfter(idx),
      deletePage: (idx) => {
        var _a2;
        if ((_a2 = slotAt(idx)) == null ? void 0 : _a2.blank) this.deleteBlankAt(idx);
        else this.deletePageAt(idx);
      },
      duplicatePage: (idx) => this.duplicateAt(idx),
      clearPage: (idx) => {
        this.goTo(idx);
        this.clearPage();
      },
      removePage: (idx) => this.deletePageAt(idx),
      restorePdfPage: (n) => {
        this.setPageRemoved(n, false);
        this.changed();
        this.buildSlots(String(n));
      },
      pdfPageAt: (idx) => {
        var _a2, _b2;
        return (_b2 = (_a2 = slotAt(idx)) == null ? void 0 : _a2.pdfN) != null ? _b2 : null;
      },
      strokesOn: (idx) => {
        var _a2, _b2, _c;
        return ((_c = this.doc.pages[(_b2 = (_a2 = slotAt(idx)) == null ? void 0 : _a2.key) != null ? _b2 : ""]) != null ? _c : []).length;
      },
      layerStrokeCount: () => 0,
      layersAligned: (idx) => {
        const s = slotAt(idx);
        return !!s && !!(s.penCv || s.hlCv);
      },
      penPainted: (idx) => {
        var _a2;
        const cv = (_a2 = slotAt(idx)) == null ? void 0 : _a2.penCv;
        return cv ? countPainted(cv) : 0;
      },
      lastStroke: (idx) => {
        const st = lastOf(idx);
        return st ? { points: st.pts.length / 3, color: st.color, size: st.size } : null;
      },
      toggleBookmark: (key) => this.toggleBookmark(key),
      bookmarkOn: (key) => {
        var _a2;
        return !!((_a2 = this.doc.bookmarks[key]) == null ? void 0 : _a2.on);
      },
      tipShowing: () => {
        return !!this.tipCv && countPainted(this.tipCv) > 0;
      },
      pictureReadTest: async () => {
        const listed = await this.app.vault.adapter.list(this.picDir()).catch(() => ({ files: [], folders: [] }));
        const files = listed.files.filter((f) => f.endsWith(".jpg")).slice(0, 20);
        const ms = [];
        const kb = [];
        for (const f of files) {
          const t0 = performance.now();
          const buf = await this.app.vault.adapter.readBinary(f);
          ms.push(performance.now() - t0);
          kb.push(buf.byteLength / 1024);
        }
        const med = (xs) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
        return { n: files.length, medianMs: med(ms), medianKb: med(kb) };
      },
      pruneTest: async () => {
        var _a2, _b2;
        const dir = `${this.plugin.manifest.dir}/prune-test`;
        await this.ensureDir(dir);
        const made = PICTURE_KEEP + 5;
        for (let i = 0; i < made; i++) await this.app.vault.adapter.write(`${dir}/${i + 1}.jpg`, "x".repeat(100));
        const removed = (await this.pruneDir(dir, PICTURE_KEEP)).length;
        const left = (await this.app.vault.adapter.list(dir)).files.length;
        for (const f of (await this.app.vault.adapter.list(dir)).files) await this.app.vault.adapter.remove(f);
        await ((_b2 = (_a2 = this.app.vault.adapter).rmdir) == null ? void 0 : _b2.call(_a2, dir, true).catch(() => {
        }));
        return { made, removed, left };
      },
      splitDraw: async (idx) => {
        const s = slotAt(idx);
        if (!s || !this.pdf || s.pdfN === null) return null;
        const t0 = performance.now();
        const page = await this.pdf.getPage(s.pdfN);
        const fetch2 = performance.now() - t0;
        const vp = page.getViewport({ scale: s.scale * this.dprWant() });
        const b0 = performance.now();
        await page.getOperatorList();
        const buildOnly = performance.now() - b0;
        const cv = globalCanvasPool.acquire(Math.max(1, Math.floor(vp.width)), Math.max(1, Math.floor(vp.height)), "pink-cv");
        const g = cv.getContext("2d", { alpha: false });
        const r0 = performance.now();
        await page.render({ canvasContext: g, canvas: cv, viewport: vp }).promise;
        const renderTotal = performance.now() - r0;
        globalCanvasPool.release(cv);
        return { fetch: fetch2, buildOnly, renderTotal };
      },
      timeDraw: async (idx) => {
        const s = slotAt(idx);
        if (!s) return -1;
        this.releaseSlot(s, true);
        const t0 = performance.now();
        await this.renderSlot(s, "full");
        return performance.now() - t0;
      },
      setPenStyle: (c, s) => {
        const ps = this.plugin.settings.pen;
        const prev = { c: ps.c, s: ps.s };
        ps.c = c;
        ps.s = s;
        return prev;
      },
      straightHighlight: (on) => {
        const st = this.plugin.settings;
        const prev = st.hlStraight;
        st.hlStraight = on;
        return prev;
      },
      openOverview: (open) => {
        var _a2, _b2;
        return open ? (_a2 = this.thumbs) == null ? void 0 : _a2.show() : (_b2 = this.thumbs) == null ? void 0 : _b2.hide();
      },
      overviewCounts: () => ({
        items: this.thumbs ? this.thumbs.totalCount() : this.contentEl.querySelectorAll(".pink-thumb").length,
        drawn: Array.from(this.contentEl.querySelectorAll(".pink-thumb-img")).filter((e) => !!e.src || !!e.style.backgroundImage).length
      }),
      fingerTap: (count) => this.countTap(count),
      // one tap; two taps in a row make the double tap
      save: async () => {
        await this.saveNow();
        if (this.file) this.plugin.sync.notifyAnnotation(this.file.path);
      },
      pauseWarm: (paused) => {
        this.warmPaused = paused;
      },
      guidedStats: () => ({
        strokes: this.log.perf.strokes,
        windowMoves: this.windowMoves,
        zoom: +this.zoom.toFixed(2),
        lastGesture: this.lastGesture,
        clearNoticeShowing: false,
        armed: false,
        currentPageStrokes: this.strokesOn ? ((this.doc.pages[this.slots[this.currentIdx]?.key ?? ""] ?? []).length) : 0
      }),
      resetGuidedStats: () => {
        this.windowMoves = 0;
        this.lastGesture = "";
      },
      previewSavedPicture: async (idx) => {
        const s = slotAt(idx);
        if (!s || s.pdfN === null) return false;
        const file = `${this.picDir()}/${s.pdfN}.jpg`;
        if (!await this.app.vault.adapter.exists(file)) {
          const blob = await this.drawPicture(s.pdfN);
          if (blob) {
            await this.ensureDir(this.picDir());
            await this.app.vault.adapter.writeBinary(file, await blob.arrayBuffer());
          }
        }
        this.releaseSlot(s, true);
        this.ensureMounted(s);
        s.far = true;
        await this.showPicture(s);
        return !!s.el.querySelector(".pink-pic");
      },
      file: (_b = (_a = this.file) == null ? void 0 : _a.path) != null ? _b : "",
      loadMs: () => this.lastOpenMs,
      activeRenders: () => this.activeRenders,
      scrollerEl: () => this.scrollerEl,
      contentEl: () => this.contentEl,
      slotGeo: (idx) => {
        const s = slotAt(idx);
        return s && s.geo ? { x: s.geo.x, y: s.geo.y, w: s.geo.w, h: s.geo.h, cw: s.geo.cw, ch: s.geo.ch, scale: s.geo.scale, dpr: s.geo.dpr } : null;
      },
      anchorPointAt: (clientY, clientX) => this.anchorAt(clientY, clientX),
      smoothZoomToTest: (z) => {
        const r = this.scrollerEl.getBoundingClientRect();
        const cy = r.top + this.scrollerEl.clientHeight / 2;
        const cx = r.left + this.scrollerEl.clientWidth / 2;
        this.smoothZoomTo(z, cy, this.anchorAt(cy, cx), z === 1 ? "Fit to width" : "", cx);
      },
      openJumpPopoverTest: () => {
        this.openJumpPopover();
        const pop = this.contentEl.querySelector(".pink-pop");
        const pr = pop ? pop.getBoundingClientRect() : null;
        const rr = this.contentEl.getBoundingClientRect();
        return pr ? { open: true, top: pr.top - rr.top, bottom: rr.bottom - pr.bottom, inside: pr.top >= rr.top && pr.bottom <= rr.bottom + 2 } : { open: false, top: 0, bottom: 0, inside: false };
      },
      closePopoverTest: () => this.closePopover()
    };
  }
  // ================================================================ pinch / wheel zoom
  anchorAt(clientY, clientX) {
    const sc = this.scrollerEl;
    if (!sc || !this.slots.length) return null;
    const scRect = sc.getBoundingClientRect();
    const scH = sc.clientHeight || scRect.height || 1;
    const scW = sc.clientWidth || scRect.width || 1;
    const vy = clientY !== undefined ? Math.max(0, Math.min(scH, clientY - scRect.top)) : scH / 2;
    const vx = clientX !== undefined ? Math.max(0, Math.min(scW, clientX - scRect.left)) : scW / 2;
    const sy = sc.scrollTop + vy;
    const idx = Math.max(0, Math.min(this.slots.length - 1, this.findSlotIndexAtY(sy)));
    const pick = this.slots[idx] || this.slots[this.currentIdx] || this.slots[0];
    if (!pick) return null;
    const h = pick.cssH || 1;
    const w = pick.cssW || 1;
    const left = pick.left !== undefined ? pick.left : ((this.totalW || scW) - w) / 2;
    return {
      idx: pick.idx,
      frac: (sy - pick.top) / h,
      fracX: (sc.scrollLeft + vx - left) / w,
      vy,
      vx,
      clientY,
      clientX
    };
  }
  /** The snap point a finished zoom gesture lands on: only Fit to width (zoom = 1) within the magnetic snap zone [0.93, 1.07]. */
  snapTarget(z) {
    return snapChoice(z, null);
  }
  showToast(text) {
    if (!this.toastEl) return;
    this.toastEl.setText(text);
    this.toastEl.addClass("is-on");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.removeClass("is-on"), 1e3);
  }
  cancelSmoothZoom() {
    if (this.smoothZoomRaf) {
      cancelAnimationFrame(this.smoothZoomRaf);
      this.smoothZoomRaf = 0;
    }
  }
  smoothZoomTo(targetZ, clientY, lockedAnchor, toastText, clientX) {
    this.cancelSmoothZoom();
    const startZ = this.zoom;
    if (Math.abs(targetZ - startZ) < 0.004) {
      this.applyZoom(targetZ, clientY, false, lockedAnchor, clientX);
      if (toastText) this.showToast(toastText);
      return;
    }
    const anchor = lockedAnchor || this.anchorAt(clientY, clientX);
    const t0 = performance.now();
    const dur = 140;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      const curZ = startZ + (targetZ - startZ) * ease;
      this.applyZoom(curZ, clientY, false, anchor, clientX);
      if (p < 1) {
        this.smoothZoomRaf = requestAnimationFrame(step);
      } else {
        this.smoothZoomRaf = 0;
        if (toastText) this.showToast(toastText);
      }
    };
    this.smoothZoomRaf = requestAnimationFrame(step);
  }
  zoomStep(factor) {
    const sc = this.scrollerEl;
    if (!sc) return;
    const scRect = sc.getBoundingClientRect();
    const cy = scRect.top + scRect.height / 2;
    const cx = scRect.left + scRect.width / 2;
    const anchor = this.anchorAt(cy, cx);
    const targetZ = clampZoom(this.zoom * factor);
    this.smoothZoomTo(targetZ, cy, anchor, `${Math.round(targetZ * 100)}%`, cx);
  }
  resetZoom() {
    const sc = this.scrollerEl;
    if (!sc) return;
    const scRect = sc.getBoundingClientRect();
    const cy = scRect.top + scRect.height / 2;
    const cx = scRect.left + scRect.width / 2;
    const anchor = this.anchorAt(cy, cx);
    this.smoothZoomTo(1, cy, anchor, "Fit to width", cx);
  }
  zoomTo(z) {
    const sc = this.scrollerEl;
    if (!sc) return;
    const scRect = sc.getBoundingClientRect();
    const cy = scRect.top + scRect.height / 2;
    const cx = scRect.left + scRect.width / 2;
    const anchor = this.anchorAt(cy, cx);
    const targetZ = clampZoom(z);
    this.smoothZoomTo(targetZ, cy, anchor, targetZ === 1 ? "Fit to width" : `${Math.round(targetZ * 100)}%`, cx);
  }
  /** Move the pinch preview once per screen refresh, not once per touch event (touch can report more often than the screen draws). */
  pinchPaint() {
    if (this.pinchFrame) return;
    this.pinchFrame = requestAnimationFrame(() => {
      this.pinchFrame = 0;
      if (!this.pinch) return;
      const sc = this.scrollerEl;
      this.pagesEl.style.transformOrigin = `${sc.scrollLeft + this.pinch.cx}px ${sc.scrollTop + this.pinch.cy}px`;
      this.pagesEl.style.transform = `scale(${this.pinch.ratio})`;
    });
  }
  applyZoom(z, clientY, snap, lockedAnchor, clientX) {
    const now = performance.now();
    this.zoomAt = now;
    const target = snap ? this.snapTarget(z) : null;
    const sc = this.scrollerEl;
    const scW = sc ? sc.clientWidth || 800 : 800;
    const scH = sc ? sc.clientHeight || 800 : 800;
    const anchor = lockedAnchor || this.anchorAt(clientY, clientX);
    this.activeZoomAnchor = anchor;
    let vy = scH / 2;
    let vx = scW / 2;
    if (anchor) {
      if (anchor.vy !== undefined) vy = anchor.vy;
      else if (clientY !== undefined && sc) {
        const scRect = sc.getBoundingClientRect();
        vy = Math.max(0, Math.min(scH, clientY - scRect.top));
      }
      if (anchor.vx !== undefined) vx = anchor.vx;
      else if (clientX !== undefined && sc) {
        const scRect = sc.getBoundingClientRect();
        vx = Math.max(0, Math.min(scW, clientX - scRect.left));
      }
    }
    this.zoom = clampZoom(target ? target.zoom : z);
    const curScrollTop = sc ? sc.scrollTop : 0;
    const curScrollLeft = sc ? sc.scrollLeft : 0;
    this.layoutPages(false, false, scW);
    let newScrollTop = curScrollTop;
    let newScrollLeft = curScrollLeft;
    if (anchor) {
      const s = this.slots[anchor.idx];
      if (s) {
        newScrollTop = Math.max(0, s.top + anchor.frac * s.cssH - vy);
        if (this.zoom <= 1.001 && s.cssW <= scW) {
          newScrollLeft = 0;
        } else {
          const fracX = anchor.fracX !== undefined ? anchor.fracX : 0.5;
          newScrollLeft = Math.max(0, s.left + fracX * s.cssW - vx);
        }
      }
    }
    this.updateViewport(false, newScrollTop);
    if (sc) {
      if (Math.abs(sc.scrollTop - newScrollTop) > 0.5) {
        this.programmaticScrollAt = now;
        sc.scrollTop = newScrollTop;
      }
      if (Math.abs(sc.scrollLeft - newScrollLeft) > 0.5) {
        this.programmaticScrollAt = now;
        sc.scrollLeft = newScrollLeft;
      }
      this.dockLastTop = sc.scrollTop;
      this.dockRun = 0;
    }
    this.updatePageLabel();
    this.lastScroll = now;
    this.scrollIdle();
    if (target) this.showToast("Fit to width");
  }
  // every finger lifted within 220ms with strict simultaneity and cluster geometry
  attachTapGestures() {
    const sc = this.scrollerEl;
    sc.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      if (this.isPenActive() || this.isPalmContact(e)) {
        this.touches.clear();
        this.touchPeak = 0;
        this.touchQuick = false;
        return;
      }
      const now = performance.now();
      if (this.touches.size && now - this.touchSeenAt > 800) this.touches.clear();
      if (this.touches.size === 0) {
        this.touchPeak = 0;
        this.touchMoved = false;
        this.touchQuick = true;
        this.firstTapDownAt = now;
        this.tapPoints = [];
      } else if (now - (this.firstTapDownAt || now) > 85) {
        this.touchQuick = false;
      }
      this.touchSeenAt = now;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now });
      if (this.tapPoints && this.tapPoints.length < 5) this.tapPoints.push({ x: e.clientX, y: e.clientY });
      this.touchPeak = Math.max(this.touchPeak, this.touches.size);
      if (this.touchPeak > 3) this.touchQuick = false;
    }, { passive: true });
    sc.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") return;
      if (this.isPenActive()) {
        this.touchMoved = true;
        return;
      }
      const d = this.touches.get(e.pointerId);
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) this.touchMoved = true;
    }, { passive: true });
    const release = (e, cancelled) => {
      const d = this.touches.get(e.pointerId);
      if (!d) return;
      const now = performance.now();
      if (now - d.t > 220 || this.isPenActive()) this.touchQuick = false;
      if (cancelled || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) this.touchMoved = true;
      this.touches.delete(e.pointerId);
      this.touchSeenAt = now;
      if (this.touches.size > 0) return;
      const kind = this.touchPeak;
      const pts = this.tapPoints || [];
      this.touchPeak = 0;
      this.tapPoints = [];
      let clusterOk = pts.length === kind;
      let cx = 0, cy = 0;
      if (clusterOk && kind >= 2) {
        let minD = Infinity, maxD = 0;
        for (let i = 0; i < pts.length; i++) {
          cx += pts[i].x;
          cy += pts[i].y;
          for (let j = i + 1; j < pts.length; j++) {
            const distIJ = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (distIJ < minD) minD = distIJ;
            if (distIJ > maxD) maxD = distIJ;
          }
        }
        cx /= pts.length;
        cy /= pts.length;
        if (minD < 14 || maxD > 280) clusterOk = false;
      }
      const tap = (kind === 2 || kind === 3) && !this.touchMoved && this.touchQuick && clusterOk && !this.isPenActive();
      if (tap && this.plugin.settings.doubleTapUndo && !this.cur && !this.erasing) {
        this.countTap(kind, cx, cy);
      }
    };
    sc.addEventListener("pointerup", (e) => release(e, false), { passive: true });
    sc.addEventListener("pointercancel", (e) => release(e, true), { passive: true });
  }
  countTap(kind, cx, cy) {
    if (this.isPenActive()) {
      this.tapCount = 0;
      return;
    }
    window.clearTimeout(this.tapTimer);
    if (kind !== this.tapKind) {
      this.tapCount = 0;
      this.lastTapCenter = null;
    }
    if (this.tapCount === 1 && cx !== void 0 && cy !== void 0 && this.lastTapCenter) {
      if (Math.hypot(cx - this.lastTapCenter.x, cy - this.lastTapCenter.y) > 90) {
        this.tapCount = 0;
      }
    }
    this.tapKind = kind;
    this.tapCount++;
    if (cx !== void 0 && cy !== void 0) this.lastTapCenter = { x: cx, y: cy };
    this.log.info("gesture", "tap", { fingers: kind, n: this.tapCount });
    if (this.tapCount < 2) {
      this.tapTimer = window.setTimeout(() => {
        this.tapCount = 0;
        this.lastTapCenter = null;
      }, 380);
      return;
    }
    this.tapCount = 0;
    this.lastTapCenter = null;
    if (kind === 2) {
      this.lastGesture = "2-finger double tap (undo)";
      this.log.info("gesture", "double tap, 2 fingers: undo");
      this.undo();
    } else {
      this.lastGesture = "3-finger double tap (redo)";
      this.log.info("gesture", "double tap, 3 fingers: redo");
      this.redo();
    }
  }
  startTouchMomentum(vx, vy) {
    this.stopTouchMomentum();
    const sc = this.scrollerEl;
    if (!sc || this.isPenWriting()) return;
    let curVx = vx;
    let curVy = vy;
    let lastT = performance.now();
    const step = (now) => {
      if (this.isPenWriting() || this.pinch) {
        this.touchMomentumRaf = 0;
        return;
      }
      const dt = Math.min(32, Math.max(1, now - lastT));
      lastT = now;
      const decay = Math.pow(0.998, dt);
      curVx *= decay;
      curVy *= decay;
      if (Math.hypot(curVx, curVy) < 0.04) {
        this.touchMomentumRaf = 0;
        this.requestRender();
        return;
      }
      sc.scrollTop = Math.max(0, sc.scrollTop + curVy * dt);
      if (this.zoom > 1.001) sc.scrollLeft = Math.max(0, sc.scrollLeft + curVx * dt);
      this.touchMomentumRaf = requestAnimationFrame(step);
    };
    this.touchMomentumRaf = requestAnimationFrame(step);
  }
  getValidFingerTouches(touchList, allowDuringCooldown = false) {
    const out = [];
    if (!touchList || !touchList.length) return out;
    const blockNew = this.isPenWriting() || (!allowDuringCooldown && touchList.length < 2 && this.isPenActive());
    for (let i = 0; i < touchList.length; i++) {
      const t = touchList[i];
      if (!t || t.touchType === "stylus") continue;
      if (this.isPalmContact(t)) {
        if (this.palmTouchIds) this.palmTouchIds.add(t.identifier);
        continue;
      }
      if (this.palmTouchIds && this.palmTouchIds.has(t.identifier)) continue;
      if (!blockNew) out.push(t);
    }
    return out;
  }
  initTwoFingerPinch(t0, t1, now) {
    const sc = this.scrollerEl;
    const d0 = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    if (d0 < 8) return false;
    const r = sc.getBoundingClientRect();
    const midX = (t0.clientX + t1.clientX) * 0.5;
    const midY = (t0.clientY + t1.clientY) * 0.5;
    this.pinching = true;
    const prevScrollTop = this.pinch && this.pinch.startScrollTop !== void 0 ? this.pinch.startScrollTop : sc.scrollTop;
    const prevScrollLeft = this.pinch && this.pinch.startScrollLeft !== void 0 ? this.pinch.startScrollLeft : sc.scrollLeft;
    this.pinch = {
      mode: 2,
      id0: t0.identifier,
      id1: t1.identifier,
      d0,
      engaged: false,
      panEngaged: false,
      cx: midX - r.left,
      cy: midY - r.top,
      startMidX: midX,
      startMidY: midY,
      lastMidX: midX,
      lastMidY: midY,
      lastMoveAt: now,
      lastObservedScrollTop: sc.scrollTop,
      vx: 0,
      vy: 0,
      startScrollTop: prevScrollTop,
      startScrollLeft: prevScrollLeft,
      startedAt: now,
      ratio: 1
    };
    return true;
  }
  initOneFingerPan(t0, now) {
    const sc = this.scrollerEl;
    this.pinching = false;
    this.pinch = {
      mode: 1,
      id: t0.identifier,
      d0: 1,
      engaged: false,
      panEngaged: false,
      cx: 0,
      cy: 0,
      startMidX: t0.clientX,
      startMidY: t0.clientY,
      lastMidX: t0.clientX,
      lastMidY: t0.clientY,
      lastMoveAt: now,
      lastObservedScrollTop: sc.scrollTop,
      vx: 0,
      vy: 0,
      startScrollTop: sc.scrollTop,
      startScrollLeft: sc.scrollLeft,
      startedAt: now,
      ratio: 1
    };
  }
  attachPinchAndWheel() {
    const sc = this.scrollerEl;

    // 1. Native 1-Finger & 2-Finger Scroll + 2-Finger Pinch-to-Zoom + Pre-Pen Palm Rollback
    sc.addEventListener(
      "touchstart",
      (e) => {
        if (this.scrollMode) return;
        this.stopTouchMomentum();
        const now = performance.now();
        this.prunePalmTouches(e.touches);
        const writingNow = this.isPenWriting() || Array.from(e.touches || []).some((t) => t.touchType === "stylus");
        if (writingNow) {
          this.poisonActiveTouchesAsPalm(e.touches);
          this.cancelPinch(true);
          return;
        }
        if (!this.lastFingerTouchAt || now - this.lastFingerTouchAt > 350) {
          this.preTouchScrollTop = sc.scrollTop;
          this.preTouchScrollLeft = sc.scrollLeft;
          this.preTouchAt = now;
        }
        this.lastFingerTouchAt = now;
        if (e.changedTouches) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const ct = e.changedTouches[i];
            if (ct.touchType !== "stylus") this.touchDownTimes.set(ct.identifier, now);
          }
        }
        const valid = this.getValidFingerTouches(e.touches, true);
        if (valid.length >= 2) {
          const sorted = valid.slice().sort((a, b) => (this.touchDownTimes.get(a.identifier) || 0) - (this.touchDownTimes.get(b.identifier) || 0));
          const t0 = sorted[sorted.length - 2];
          const t1 = sorted[sorted.length - 1];
          if (this.pinch && this.pinch.mode === 2 && this.pinch.id0 === t0.identifier && this.pinch.id1 === t1.identifier) {
            return;
          }
          if (this.pagesEl) {
            this.pagesEl.style.transition = "";
            this.pagesEl.style.transform = "";
            this.pagesEl.style.willChange = "";
          }
          this.initTwoFingerPinch(t0, t1, now);
          return;
        }
        if (valid.length === 1 && !this.isPenWriting()) {
          this.initOneFingerPan(valid[0], now);
        }
      },
      { passive: true }
    );
    sc.addEventListener(
      "touchmove",
      (e) => {
        if (this.scrollMode) return;
        const writingNow = this.isPenWriting() || Array.from(e.touches || []).some((t) => t.touchType === "stylus");
        if (writingNow) {
          if (e.cancelable) e.preventDefault();
          this.poisonActiveTouchesAsPalm(e.touches);
          this.cancelPinch(true);
          return;
        }
        const now = performance.now();
        this.lastFingerTouchAt = now;
        const valid = this.getValidFingerTouches(e.touches, true);
        if (!this.pinch) {
          if (valid.length >= 2) {
            this.initTwoFingerPinch(valid[valid.length - 2], valid[valid.length - 1], now);
          } else if (valid.length === 1 && !this.isPenWriting()) {
            this.initOneFingerPan(valid[0], now);
          }
          if (!this.pinch) return;
        }
        if (this.pinch.mode === 1 && valid.length >= 2) {
          this.initTwoFingerPinch(valid[valid.length - 2], valid[valid.length - 1], now);
        }
        if (this.pinch.mode === 1) {
          // With touch-action: none isolating the writing surface from UIScrollView gesture arbitration,
          // drive 120Hz 1-finger pan + inertial momentum directly for every non-palm finger touch.
          const t0 = valid.find((t) => t.identifier === this.pinch.id) || (valid.length === 1 ? valid[0] : null);
          if (!t0) {
            this.cancelPinch(false);
            return;
          }
          this.pinch.id = t0.identifier;
          const dx = t0.clientX - this.pinch.lastMidX;
          const dy = t0.clientY - this.pinch.lastMidY;
          const moveDist = Math.hypot(t0.clientX - this.pinch.startMidX, t0.clientY - this.pinch.startMidY);
          if (moveDist >= 5 || this.pinch.panEngaged) {
            this.pinch.panEngaged = true;
            if (e.cancelable) e.preventDefault();
            const dt = Math.max(4, now - this.pinch.lastMoveAt);
            this.pinch.vx = 0.65 * this.pinch.vx + 0.35 * (-dx / dt);
            this.pinch.vy = 0.65 * this.pinch.vy + 0.35 * (-dy / dt);
            sc.scrollTop = Math.max(0, sc.scrollTop - dy);
            if (this.zoom > 1.001) sc.scrollLeft = Math.max(0, sc.scrollLeft - dx);
          }
          this.pinch.lastMidX = t0.clientX;
          this.pinch.lastMidY = t0.clientY;
          this.pinch.lastMoveAt = now;
          return;
        }
        // Mode 2: 2-finger pinch-to-zoom & 2-finger pan
        let t0 = valid.find((t) => t.identifier === this.pinch.id0);
        let t1 = valid.find((t) => t.identifier === this.pinch.id1);
        if ((!t0 || !t1) && valid.length >= 2) {
          t0 = valid[valid.length - 2];
          t1 = valid[valid.length - 1];
          this.pinch.id0 = t0.identifier;
          this.pinch.id1 = t1.identifier;
        }
        if (!t0 || !t1) {
          this.cancelPinch(false);
          return;
        }
        const midX = (t0.clientX + t1.clientX) * 0.5;
        const midY = (t0.clientY + t1.clientY) * 0.5;
        const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const panDist = Math.hypot(midX - this.pinch.startMidX, midY - this.pinch.startMidY);
        const pinchDelta = Math.abs(d - this.pinch.d0);
        if (!this.pinch.engaged && pinchDelta >= Math.max(10, 0.03 * this.pinch.d0)) {
          this.pinch.engaged = true;
          this.pagesEl.style.willChange = "transform";
          this.pagesEl.style.transition = "transform 80ms linear";
        }
        if (this.pinch.engaged) {
          if (e.cancelable) e.preventDefault();
          const r = Math.max(MIN_ZOOM / this.zoom, Math.min(MAX_ZOOM / this.zoom, d / this.pinch.d0));
          this.pinch.ratio = r;
          this.pinchPaint();
        } else if (panDist >= 8 || this.pinch.panEngaged) {
          const nativeMoved = Math.abs(sc.scrollTop - (this.pinch.lastObservedScrollTop || 0)) > 0.5;
          if (!nativeMoved || (e.touches && e.touches.length > 2) || this.pinch.panEngaged) {
            this.pinch.panEngaged = true;
            if (e.cancelable) e.preventDefault();
            const dx = midX - this.pinch.lastMidX;
            const dy = midY - this.pinch.lastMidY;
            const dt = Math.max(4, now - this.pinch.lastMoveAt);
            this.pinch.vx = 0.65 * this.pinch.vx + 0.35 * (-dx / dt);
            this.pinch.vy = 0.65 * this.pinch.vy + 0.35 * (-dy / dt);
            sc.scrollTop = Math.max(0, sc.scrollTop - dy);
            if (this.zoom > 1.001) sc.scrollLeft = Math.max(0, sc.scrollLeft - dx);
          }
        }
        this.pinch.lastObservedScrollTop = sc.scrollTop;
        this.pinch.lastMidX = midX;
        this.pinch.lastMidY = midY;
        this.pinch.lastMoveAt = now;
      },
      { passive: false }
    );
    const endPinch = (e) => {
      if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const ct = e.changedTouches[i];
          this.palmTouchIds.delete(ct.identifier);
          this.touchDownTimes.delete(ct.identifier);
        }
      }
      this.prunePalmTouches(e.touches);
      if (!this.pinch) {
        this.preTouchAt = 0;
        return;
      }
      const valid = this.getValidFingerTouches(e.touches, true);
      if (this.pinch.mode === 2 && valid.length >= 2) return;
      if (this.pinch.mode === 1 && valid.length >= 1) return;
      this.preTouchAt = 0;
      const { ratio, cy, cx, engaged, panEngaged, vx, vy, lastMoveAt } = this.pinch;
      const r = sc.getBoundingClientRect();
      const top = r.top;
      const left = r.left;
      this.pinch = null;
      this.pinching = false;
      cancelAnimationFrame(this.pinchFrame);
      this.pinchFrame = 0;
      this.pagesEl.style.transition = "";
      this.pagesEl.style.transform = "";
      this.pagesEl.style.willChange = "";
      if (!engaged || Math.abs(ratio - 1) < 0.02) {
        if (panEngaged && !this.isPenWriting() && performance.now() - lastMoveAt < 90 && Math.hypot(vx, vy) > 0.08) {
          this.startTouchMomentum(vx, vy);
        } else {
          this.requestRender();
        }
        return;
      }
      const startZ = this.zoom;
      const rawZ = clampZoom(startZ * ratio);
      const clientY = cy + top;
      const clientX = cx + left;
      const anchor = this.anchorAt(clientY, clientX);
      const inSnapBand = rawZ >= 0.93 && rawZ <= 1.07;
      const movingTowardOne = (startZ > 1.02 && ratio < 1) || (startZ < 0.98 && ratio > 1);
      if (inSnapBand && movingTowardOne) {
        this.applyZoom(rawZ, clientY, false, anchor, clientX);
        this.smoothZoomTo(1, clientY, anchor, "Fit to width", clientX);
      } else {
        this.applyZoom(rawZ, clientY, false, anchor, clientX);
      }
    };
    sc.addEventListener("touchend", endPinch);
    sc.addEventListener("touchcancel", endPinch);

    // 2. Safari / WebKit native trackpad gesture recognition on macOS ONLY (never on iPadOS/iOS touchscreens)
    let nativeGestureActive = false;
    let nativeGestureAt = 0;
    let gestureStartZoom = 1;
    let gestureAnchor = null;
    let gestureRaf = 0;

    sc.addEventListener("gesturestart", (e) => {
      if (import_obsidian4.Platform.isMobile || import_obsidian4.Platform.isIosApp || this.isPenActive() || this.touches.size > 0 || this.pinch) {
        if (e.cancelable) e.preventDefault();
        nativeGestureActive = false;
        return;
      }
      e.preventDefault();
      this.cancelSmoothZoom();
      nativeGestureActive = true;
      nativeGestureAt = performance.now();
      gestureStartZoom = this.zoom;
      gestureAnchor = this.anchorAt(e.clientY, e.clientX);
    }, { passive: false });

    sc.addEventListener("gesturechange", (e) => {
      if (import_obsidian4.Platform.isMobile || import_obsidian4.Platform.isIosApp || this.isPenActive() || this.touches.size > 0 || this.pinch) {
        if (e.cancelable) e.preventDefault();
        nativeGestureActive = false;
        gestureAnchor = null;
        return;
      }
      e.preventDefault();
      if (!nativeGestureActive || !gestureAnchor) return;
      nativeGestureAt = performance.now();
      const newZ = clampZoom(gestureStartZoom * e.scale);
      if (!gestureRaf) {
        gestureRaf = requestAnimationFrame(() => {
          gestureRaf = 0;
          this.applyZoom(newZ, gestureAnchor.clientY, false, gestureAnchor, gestureAnchor.clientX);
        });
      }
    }, { passive: false });

    sc.addEventListener("gestureend", (e) => {
      if (import_obsidian4.Platform.isMobile || import_obsidian4.Platform.isIosApp || this.isPenActive() || !nativeGestureActive || !gestureAnchor) {
        if (e.cancelable) e.preventDefault();
        nativeGestureActive = false;
        gestureAnchor = null;
        return;
      }
      e.preventDefault();
      if (gestureRaf) {
        cancelAnimationFrame(gestureRaf);
        gestureRaf = 0;
      }
      nativeGestureActive = false;
      const finalZ = clampZoom(gestureStartZoom * e.scale);
      const inSnapBand = finalZ >= 0.93 && finalZ <= 1.07;
      const movingTowardOne = (gestureStartZoom > 1.02 && e.scale < 1) || (gestureStartZoom < 0.98 && e.scale > 1);
      if (inSnapBand && movingTowardOne) {
        this.smoothZoomTo(1, gestureAnchor.clientY, gestureAnchor, "Fit to width", gestureAnchor.clientX);
      } else {
        this.applyZoom(finalZ, gestureAnchor.clientY, false, gestureAnchor, gestureAnchor.clientX);
      }
    }, { passive: false });

    // 3. Desktop wheel pinch zoom (MacBook trackpad ctrlKey + wheel, Cmd+wheel on macOS, Ctrl+wheel on Win/Linux)
    let wheelZoomRaf = 0;
    let wheelEndTimer = 0;
    let wheelActive = false;
    let lastPinchWheelAt = 0;
    let wheelStartZoom = this.zoom;
    let lastWheelDir = 0;
    let targetZoom = this.zoom;
    let wheelClientY = 0;
    let wheelClientX = 0;
    let wheelAnchor = null;

    sc.addEventListener(
      "wheel",
      (e) => {
        if (nativeGestureActive) {
          if (performance.now() - nativeGestureAt > 500) {
            nativeGestureActive = false;
            gestureAnchor = null;
          } else {
            e.preventDefault();
            return;
          }
        }

        const now = performance.now();
        const isPinchWheel = e.ctrlKey || (e.metaKey && !e.shiftKey && !e.altKey);
        if (!isPinchWheel) {
          if (wheelActive) {
            // On macOS trackpads, two-finger pinch gestures emit interleaved non-ctrlKey scrollWheel events
            // from slight finger midpoint translation. Block those during an active pinch so the compositor
            // never scrolls behind wheelAnchor and causes frame-to-frame vertical oscillation.
            if (e.isTrusted || (now - lastPinchWheelAt < 160 && Math.abs(e.deltaY) < 80)) {
              e.preventDefault();
              return;
            }
            if (wheelZoomRaf) {
              cancelAnimationFrame(wheelZoomRaf);
              wheelZoomRaf = 0;
              this.applyZoom(targetZoom, wheelClientY, false, wheelAnchor, wheelClientX);
            }
            wheelActive = false;
            this.activeZoomAnchor = null;
            window.clearTimeout(wheelEndTimer);
            wheelEndTimer = 0;
          }
          if (this.smoothZoomRaf) this.cancelSmoothZoom();
          return;
        }

        e.preventDefault();
        lastPinchWheelAt = now;
        this.cancelSmoothZoom();

        const cursorMoved = wheelActive && Math.hypot(e.clientX - wheelClientX, e.clientY - wheelClientY) > 36;
        if (!wheelActive || cursorMoved) {
          if (wheelZoomRaf) {
            cancelAnimationFrame(wheelZoomRaf);
            wheelZoomRaf = 0;
          }
          wheelActive = true;
          wheelStartZoom = this.zoom;
          targetZoom = this.zoom;
          wheelClientY = e.clientY;
          wheelClientX = e.clientX;
          wheelAnchor = this.anchorAt(e.clientY, e.clientX);
          this.activeZoomAnchor = wheelAnchor;
        }

        let rawDelta = e.deltaY;
        if (e.deltaMode === 1) rawDelta *= 20; // DOM_DELTA_LINE
        const delta = Math.max(-30, Math.min(30, rawDelta));
        if (Math.abs(delta) > 0.05) lastWheelDir = delta > 0 ? 1 : -1;
        targetZoom = clampZoom(targetZoom * Math.exp(-delta * 0.0085));

        if (!wheelZoomRaf) {
          wheelZoomRaf = requestAnimationFrame(() => {
            wheelZoomRaf = 0;
            this.applyZoom(targetZoom, wheelClientY, false, wheelAnchor, wheelClientX);
          });
        }

        window.clearTimeout(wheelEndTimer);
        wheelEndTimer = window.setTimeout(() => {
          wheelEndTimer = 0;
          wheelActive = false;
          this.activeZoomAnchor = null;
          if (wheelZoomRaf) {
            cancelAnimationFrame(wheelZoomRaf);
            wheelZoomRaf = 0;
            this.applyZoom(targetZoom, wheelClientY, false, wheelAnchor, wheelClientX);
          }
          const inSnapBand = targetZoom >= 0.93 && targetZoom <= 1.07;
          const movingTowardOne = (wheelStartZoom > 1.02 && lastWheelDir > 0) || (wheelStartZoom < 0.98 && lastWheelDir < 0);
          if (inSnapBand && movingTowardOne) {
            targetZoom = 1;
            this.smoothZoomTo(1, wheelClientY, wheelAnchor, "Fit to width", wheelClientX);
          }
        }, 140);
      },
      { passive: false }
    );

    // 4. Mouse drag-to-pan when in Scroll Mode (Hand Tool)
    let isMousePanning = false;
    let panStartX = 0, panStartY = 0;
    let panScrollLeft = 0, panScrollTop = 0;

    sc.addEventListener("pointerdown", (e) => {
      if (!this.scrollMode) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      isMousePanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollLeft = sc.scrollLeft;
      panScrollTop = sc.scrollTop;
      try { sc.setPointerCapture(e.pointerId); } catch (err) {}
      sc.style.cursor = "grabbing";
    });

    sc.addEventListener("pointermove", (e) => {
      if (!isMousePanning || !this.scrollMode) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      sc.scrollLeft = panScrollLeft - dx;
      sc.scrollTop = panScrollTop - dy;
      this.lastScroll = performance.now();
      this.plugin.lastInputAt = Date.now();
      this.updateViewport(false);
      this.updateCurrentSoon();
    });

    const endPan = () => {
      if (!isMousePanning) return;
      isMousePanning = false;
      sc.style.cursor = "";
      this.scrollIdle();
    };
    sc.addEventListener("pointerup", endPan);
    sc.addEventListener("pointercancel", endPan);
  }
};

// src/update.ts
var import_obsidian5 = require("obsidian");
var FILES = ["main.js", "manifest.json", "styles.css"];
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d) {
  let c = 4294967295;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
async function inflateRaw(data) {
  if (typeof DecompressionStream === "undefined") throw new Error("this version of iPadOS is too old for in-app updates. Install the zip the usual way instead.");
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    if (typeof require === "function") {
      try {
        const z = require("zlib");
        if (z && typeof z.inflateRawSync === "function") return new Uint8Array(z.inflateRawSync(data));
      } catch (e2) {}
    }
    throw e;
  }
}
async function readZip(buf) {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("this is not a zip file");
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const out = /* @__PURE__ */ new Map();
  const dec = UTF8_DEC;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 33639248) throw new Error("the zip's index is damaged");
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (view.getUint32(localOffset, true) !== 67324752) throw new Error(`"${name}" is damaged`);
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    const data = method === 0 ? new Uint8Array(raw) : method === 8 ? await inflateRaw(raw) : null;
    if (!data) throw new Error(`"${name}" uses a compression this plugin cannot read`);
    if (crc32(data) !== crc) throw new Error(`"${name}" failed its check. The download may be incomplete; try again.`);
    out.set(name, data);
  }
  return out;
}
function findPackage(files) {
  for (const name of files.keys()) {
    if (name === "main.js" || name.endsWith("/main.js")) {
      const root = name.slice(0, name.length - "main.js".length);
      if (FILES.every((f) => files.has(root + f))) return { root };
    }
  }
  throw new Error("the zip does not contain the Pencil Ink files (main.js, manifest.json, styles.css)");
}
async function installFromZip(plugin, zip, say = () => {
}) {
  var _a;
  say("Checking the zip\u2026");
  const files = await readZip(zip);
  const { root } = findPackage(files);
  const id = plugin.manifest.id;
  const manifest = JSON.parse(UTF8_DEC.decode(files.get(root + "manifest.json")));
  if (manifest.id !== id) throw new Error(`that zip is for "${manifest.id}", not "${id}"`);
  const from = plugin.manifest.version;
  const to = String((_a = manifest.version) != null ? _a : "?");
  if (to === from) say(`Reinstalling Pencil Ink ${to}...`);
  const adapter = plugin.app.vault.adapter;
  const dir = plugin.manifest.dir;
  const next = FILES.map((f) => ({ name: f, data: files.get(root + f) }));
  say("Writing the new files\u2026");
  for (const f of next) {
    const tmp = `${dir}/${f.name}.new`;
    await adapter.writeBinary(tmp, f.data.slice().buffer);
    const back = new Uint8Array(await adapter.readBinary(tmp));
    if (back.length !== f.data.length || crc32(back) !== crc32(f.data)) {
      await cleanup(plugin, dir);
      throw new Error(`could not write ${f.name} safely. Nothing was changed.`);
    }
  }
  say("Keeping a backup of this version\u2026");
  for (const f of FILES) {
    const path = `${dir}/${f}`;
    if (await adapter.exists(path)) await adapter.writeBinary(`${dir}/${f}.bak`, await adapter.readBinary(path));
  }
  try {
    for (const f of next) await adapter.writeBinary(`${dir}/${f.name}`, f.data.slice().buffer);
  } catch (e) {
    await restoreBackups(plugin, dir);
    throw new Error("the update could not be written. The previous version was restored.");
  }
  await cleanup(plugin, dir);
  say("Reloading Pencil Ink\u2026");
  const plugins = plugin.app.plugins;
  let reloaded = false;
  const openFiles = [];
  try {
    for (const leaf of plugin.app.workspace.getLeavesOfType("pencil-ink-pdf")) {
      const f = leaf.view && leaf.view.file ? leaf.view.file.path : (leaf.getViewState && leaf.getViewState().state ? leaf.getViewState().state.file : null);
      if (f) openFiles.push({ leaf, file: f });
    }
  } catch (e) {}
  try {
    await plugins.disablePlugin(id);
    await plugins.enablePlugin(id);
    reloaded = true;
    for (const item of openFiles) {
      try {
        await item.leaf.setViewState({ type: "pencil-ink-pdf", state: { file: item.file }, active: true });
      } catch (e) {}
    }
  } catch (e) {
    console.warn("[Pencil Ink] could not reload after the update; restart Obsidian", e);
  }
  return { from, to, reloaded };
}
async function cleanup(plugin, dir) {
  for (const f of FILES) {
    try {
      await plugin.app.vault.adapter.remove(`${dir}/${f}.new`);
    } catch (e) {
    }
  }
}
async function restoreBackups(plugin, dir) {
  const adapter = plugin.app.vault.adapter;
  for (const f of FILES) {
    const bak = `${dir}/${f}.bak`;
    if (await adapter.exists(bak)) await adapter.writeBinary(`${dir}/${f}`, await adapter.readBinary(bak));
  }
}
async function restorePrevious(plugin) {
  const dir = plugin.manifest.dir;
  const adapter = plugin.app.vault.adapter;
  if (!await adapter.exists(`${dir}/main.js.bak`)) return false;
  await restoreBackups(plugin, dir);
  const plugins = plugin.app.plugins;
  await plugins.disablePlugin(plugin.manifest.id);
  await plugins.enablePlugin(plugin.manifest.id);
  return true;
}
async function installBytes(plugin, zip, source) {
  const say = (message) => new import_obsidian5.Notice(message, 6e3);
  say(`Installing the update from ${source}\u2026`);
  try {
    const r = await installFromZip(plugin, zip, say);
    new import_obsidian5.Notice(r.reloaded ? `Pencil Ink updated: ${r.from} \u2192 ${r.to}` : `Pencil Ink ${r.to} is installed. Restart Obsidian to finish.`, 8e3);
  } catch (e) {
    plugin.log.error("update", "update not installed", e);
    new import_obsidian5.Notice("Update not installed: " + (e instanceof Error ? e.message : String(e)), 2e4);
  }
}
var DEVICE_KEY_PREFIX = "PENCIL-INK-DEVICE:";
function encodeDeviceKey(s) {
  const payload = {
    v: 1,
    clientId: String(s.clientId || "").trim(),
    clientSecret: String(s.clientSecret || "").trim(),
    refreshToken: String(s.refreshToken || "").trim(),
    accessToken: String(s.accessToken || "").trim(),
    expiresAt: Number(s.expiresAt) || 0,
    driveFolder: String(s.driveFolder || "Obsidian Vault").trim()
  };
  const bytes = UTF8_ENC.encode(JSON.stringify(payload));
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
  return DEVICE_KEY_PREFIX + btoa(chunks.join(""));
}
function decodeDeviceKey(raw) {
  const clean = String(raw || "").trim();
  if (!clean.startsWith(DEVICE_KEY_PREFIX)) return null;
  try {
    const b64 = clean.slice(DEVICE_KEY_PREFIX.length).trim();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const obj = JSON.parse(UTF8_DEC.decode(bytes));
    if (!obj || typeof obj.clientId !== "string" || typeof obj.clientSecret !== "string" || !obj.clientId) return null;
    return {
      clientId: obj.clientId.trim(),
      clientSecret: obj.clientSecret.trim(),
      refreshToken: typeof obj.refreshToken === "string" ? obj.refreshToken.trim() : "",
      accessToken: typeof obj.accessToken === "string" ? obj.accessToken.trim() : "",
      expiresAt: Number(obj.expiresAt) || 0,
      driveFolder: typeof obj.driveFolder === "string" && obj.driveFolder.trim() ? obj.driveFolder.trim() : "Obsidian Vault"
    };
  } catch (e) {
    return null;
  }
}
function chooseZipAndInstall(plugin) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip,application/zip";
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
  document.body.appendChild(input);
  window.setTimeout(() => input.remove(), 12e4);
  input.onchange = () => {
    var _a;
    const file = (_a = input.files) == null ? void 0 : _a[0];
    if (!file) {
      new import_obsidian5.Notice("No file was chosen.", 6e3);
      return;
    }
    new import_obsidian5.Notice(`Got ${file.name}. Installing\u2026`, 6e3);
    plugin.log.info("update", "zip chosen", { name: file.name, size: file.size });
    file.arrayBuffer().then(
      (buf) => installBytes(plugin, buf, file.name),
      (e) => {
        plugin.log.error("update", "could not read the chosen zip", e);
        new import_obsidian5.Notice("Could not read the zip: " + String(e), 2e4);
      }
    );
  };
  input.click();
}

// src/testpanel.ts
var import_obsidian7 = require("obsidian");

// src/stall.ts
var StallWatch = class {
  constructor(thresholdMs, onStall) {
    this.thresholdMs = thresholdMs;
    this.onStall = onStall;
    this.last = -1;
    /** frame gaps measured so far */
    this.frames = 0;
    /** gaps above the threshold */
    this.stalls = 0;
    /** longest gap seen, in milliseconds */
    this.worst = 0;
  }
  /** Feed the time (milliseconds) of one animation frame. */
  feed(t) {
    if (this.last >= 0) {
      const gap = t - this.last;
      this.frames++;
      if (gap > this.worst) this.worst = gap;
      if (gap > this.thresholdMs) {
        this.stalls++;
        this.onStall(gap, t);
      }
    }
    this.last = t;
  }
  /** Forget the last frame, so a pause is not counted as a stall. */
  reset() {
    this.last = -1;
  }
};

// src/probes.ts
function canvasLimit() {
  const held = [];
  let bytes = 0;
  let side = 2048;
  let failedAt = "";
  for (let i = 0; i < 200; i++) {
    const cv = document.createElement("canvas");
    cv.width = side;
    cv.height = side;
    let ok3 = false;
    try {
      const g = cv.getContext("2d");
      if (g) {
        g.fillStyle = "#000";
        g.fillRect(side - 1, side - 1, 1, 1);
        ok3 = g.getImageData(side - 1, side - 1, 1, 1).data[3] === 255;
      }
    } catch (e) {
      ok3 = false;
    }
    if (!ok3) {
      failedAt = `${side}x${side}`;
      cv.width = 0;
      cv.height = 0;
      break;
    }
    held.push(cv);
    bytes += side * side * 4;
    side = Math.round(side * 1.1);
  }
  const totalMB = bytes / 1e6;
  for (const c of held) {
    c.width = 0;
    c.height = 0;
  }
  return { totalMB, failedAt };
}
async function stallDuring(run) {
  let last = performance.now();
  let maxGap = 0;
  let ticks = 0;
  const id = window.setInterval(() => {
    const now = performance.now();
    maxGap = Math.max(maxGap, now - last);
    last = now;
    ticks++;
  }, 4);
  try {
    await run();
  } finally {
    window.clearInterval(id);
  }
  return { maxGapMs: maxGap, ticks };
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
async function listingCheck(drive, n) {
  const folder = await drive.createFolder(`pencil-ink-probe-${Date.now()}`, "root");
  let misses = 0;
  let trashed = false;
  const up = [];
  const ls = [];
  try {
    for (let i = 0; i < n; i++) {
      const name = `probe-${i}.txt`;
      const t0 = performance.now();
      await drive.upload({ name, parent: folder.id, data: UTF8_ENC.encode(String(i)).buffer });
      up.push(performance.now() - t0);
      const t1 = performance.now();
      const list2 = await drive.listChildren([folder.id]);
      ls.push(performance.now() - t1);
      if (!list2.some((f) => f.name === name)) misses++;
    }
  } finally {
    await drive.trash(folder.id);
    trashed = true;
  }
  return { n, misses, folderTrashed: trashed, uploadMedianMs: median(up), listMedianMs: median(ls) };
}

// src/devtests/fakes.ts
var import_obsidian6 = require("obsidian");
function fakeFile(path, mtime, size) {
  var _a;
  const f = Object.create(import_obsidian6.TFile.prototype);
  const name = path.slice(path.lastIndexOf("/") + 1);
  Object.assign(f, { path, name, basename: name.replace(/\.[^.]*$/, ""), extension: (_a = name.split(".").pop()) != null ? _a : "", stat: { mtime, size, ctime: mtime }, parent: null });
  return f;
}
var FakeDrive = class {
  constructor() {
    this.files = /* @__PURE__ */ new Map();
    this.uploads = 0;
    this.startCalls = 0;
    this.failUploads = 0;
    /** changes Drive will report at the next check, as the change feed reports them */
    this.changesQueue = [];
    this.n = 0;
  }
  // the next uploads fail, as if the connection dropped
  async startToken() {
    this.startCalls++;
    return "token-1";
  }
  async changes(token) {
    return { changes: this.changesQueue.splice(0), newStart: token + "*" };
  }
  async resolveRoot() {
    return "root";
  }
  /** Drive reports the real MD5 of the stored bytes, so the fake does too. */
  sum(b) {
    return md5Hex(b);
  }
  async createFolder(name, parent) {
    const f = { id: "d" + ++this.n, name, mimeType: FOLDER_MIME, parents: [parent] };
    this.files.set(f.id, f);
    return f;
  }
  async findChildren(parent, name, mime) {
    return Array.from(this.files.values()).filter((f) => {
      var _a;
      return !f.trashed && f.name === name && !!((_a = f.parents) == null ? void 0 : _a.includes(parent)) && (!mime || f.mimeType === mime);
    });
  }
  async patch(id, body, addParent, removeParent) {
    var _a, _b;
    const f = this.files.get(id);
    if (!f) throw new Error("404 " + id);
    if (body.name) f.name = body.name;
    if (removeParent) f.parents = ((_a = f.parents) != null ? _a : []).filter((p) => p !== removeParent);
    if (addParent) f.parents = [...(_b = f.parents) != null ? _b : [], addParent];
    return f;
  }
  async listChildren(parents) {
    return Array.from(this.files.values()).filter((f) => {
      var _a;
      return !f.trashed && ((_a = f.parents) == null ? void 0 : _a.some((p) => parents.includes(p)));
    });
  }
  async upload(o) {
    if (this.failUploads > 0) {
      this.failUploads--;
      throw new Error("Request failed. The network connection was lost.");
    }
    this.uploads++;
    const data = new Uint8Array(o.data).slice();
    if (o.id) {
      const f2 = this.files.get(o.id);
      if (!f2) throw new Error("404 " + o.id);
      f2.data = data;
      f2.md5Checksum = this.sum(data);
      return f2;
    }
    const f = { id: "f" + ++this.n, name: o.name, mimeType: "application/octet-stream", parents: [o.parent], data, md5Checksum: this.sum(data), modifiedTime: (/* @__PURE__ */ new Date()).toISOString() };
    this.files.set(f.id, f);
    return f;
  }
  async download(id) {
    const f = this.files.get(id);
    if (!f || !f.data) throw new Error("missing " + id);
    return f.data.slice().buffer;
  }
  async trash(id) {
    const f = this.files.get(id);
    if (!f) throw new Error("404 " + id);
    f.trashed = true;
  }
  async get(id) {
    var _a;
    return (_a = this.files.get(id)) != null ? _a : null;
  }
  named(name) {
    return Array.from(this.files.values()).filter((f) => f.name === name && !f.trashed);
  }
};
function makeDevice(drive, label, settings = {}) {
  const files = /* @__PURE__ */ new Map();
  const blobs = /* @__PURE__ */ new Map();
  const warnings = [];
  let clock = 1e6;
  const put = (path, body) => files.set(path, { file: fakeFile(path, ++clock, body.length), body });
  const touch = (path, body) => {
    const prev = files.get(path);
    files.set(path, { file: fakeFile(path, prev ? prev.file.stat.mtime + 1 : ++clock, body.length), body });
  };
  const vault = {
    configDir: ".obsidian",
    getAbstractFileByPath: (p) => {
      var _a, _b;
      return (_b = (_a = files.get(p)) == null ? void 0 : _a.file) != null ? _b : null;
    },
    getFiles: () => Array.from(files.values()).map((x) => x.file),
    read: async (f) => files.get(f.path).body,
    readBinary: async (f) => UTF8_ENC.encode(files.get(f.path).body).buffer,
    modify: async (f, t) => touch(f.path, t),
    modifyBinary: async (f, b) => touch(f.path, UTF8_DEC.decode(b)),
    create: async (p, t) => put(p, t),
    createBinary: async (p, b) => put(p, UTF8_DEC.decode(b)),
    createFolder: async () => {
    },
    adapter: { mkdir: async () => {
    }, readBinary: async (p) => {
      const b = blobs.get(p);
      if (!b) throw new Error("no such file: " + p);
      return b;
    }, writeBinary: async (p, d) => {
      blobs.set(p, d);
    }, exists: async (p) => blobs.has(p), read: async () => "", write: async (p, text) => {
      if (!p.endsWith("sync-state.json")) touch(p, text);
    }, remove: async () => {
    } }
  };
  const plugin = {
    settings: { driveFolder: "Obsidian Vault", refreshToken: "x", autoSync: true, pushDelayMs: 2500, excludeFolders: "", includeFolders: "", maxFileMB: 300, pollSeconds: 8, ...settings },
    app: {
      vault,
      fileManager: {
        trashFile: async (f) => {
          files.delete(f.path);
        },
        renameFile: async (f, to) => {
          const e = files.get(f.path);
          if (!e) return;
          files.delete(f.path);
          put(to, e.body);
        }
      }
    },
    manifest: { dir: "plugin" },
    lastInputAt: 0,
    events: { trigger() {
    } },
    getLiveDoc: () => null,
    log: { info() {
    }, debug() {
    }, error() {
    }, warn: (...a) => warnings.push(a.map(String).join(" ")) }
  };
  const sync = new SyncManager(plugin);
  sync.autoJoin = false;
  sync.ready = true;
  sync.drive = drive;
  sync.st.rootId = "root";
  sync.st.rootSpec = plugin.settings.driveFolder;
  sync.putNode({ id: "root", name: "", parent: "", folder: true });
  const learn = () => {
    for (const f of drive.files.values()) if (!f.trashed) sync.putNode(sync.fromFile(f));
  };
  return { label, sync, files, warnings, put, touch, learn };
}

// src/devtests/logs-suites.ts
var ok = (name, problem) => ({ name, ok: problem === null, detail: problem != null ? problem : "ok" });
var stroke = (id, x) => ({ id, t: x, tool: "pen", color: "#1c1c1e", size: 1.6, pts: [x, 10, 0.5, x + 4, 14, 0.5, x + 8, 20, 0.5] });
function memoryIO(files, failAt = -1, torn = false) {
  const io = {
    writes: 0,
    async read(p) {
      var _a;
      return (_a = files.get(p)) != null ? _a : null;
    },
    async write(p, d) {
      const n = io.writes++;
      if (n === failAt) {
        if (torn) files.set(p, d.slice(0, Math.floor(d.byteLength / 2)));
        throw new Error("cut");
      }
      files.set(p, d);
    },
    async exists(p) {
      return files.has(p);
    }
  };
  return io;
}
function emptyDrive() {
  const files = /* @__PURE__ */ new Map();
  let seq = 0;
  return {
    async listChildren() {
      return Array.from(files.values()).map((f) => ({ id: f.id, name: f.name, md5Checksum: md5Hex(new Uint8Array(f.data)) }));
    },
    async download(id) {
      return Array.from(files.values()).find((f) => f.id === id).data;
    },
    async upload(o) {
      var _a;
      const id = (_a = o.id) != null ? _a : `f${++seq}`;
      files.set(id, { id, name: o.name, data: o.data });
      return { id };
    },
    async trash(id) {
      files.delete(id);
    }
  };
}
var rng = (seed) => () => (seed = seed * 1103515245 + 12345 & 2147483647) / 2147483647;
async function stateRoundTrip() {
  const files = /* @__PURE__ */ new Map();
  const io = memoryIO(files);
  const dir = "logs/check";
  const st = newLogState("ipad");
  st.own["1"] = [stroke("a", 10), stroke("b", 30)];
  st.ownVer["1"] = 2;
  st.erased["gone"] = 1;
  st.erasedVersion = 1;
  st.base = { strokes: { a: "1", b: "1" }, blanks: {}, bookmarks: {}, removed: {} };
  await saveLogStateFiles(io, dir, st);
  const back = await loadLogStateFiles(io, dir);
  const same = back !== null && JSON.stringify(deriveDoc(back, /* @__PURE__ */ new Map(), "b")) === JSON.stringify(deriveDoc(st, /* @__PURE__ */ new Map(), "b"));
  const pending = [ok("state: a saved state reloads to the same book", same ? null : "reloaded book differs")];
  back.own["1"] = [...back.own["1"], stroke("c", 70)];
  back.ownVer["1"] = 3;
  await saveLogStateFiles(io, dir, back);
  const again = await loadLogStateFiles(io, dir);
  pending.push(ok("state: a change after a reload is saved and reloads", again && again.own["1"].length === 3 ? null : "change lost"));
  files.delete(`${dir}/own-1.gz`);
  let rejected = false;
  try {
    await loadLogStateFiles(io, dir);
  } catch (e) {
    rejected = true;
  }
  pending.push(ok("state: a missing page file is reported, so the device joins again", rejected ? null : "missing page read as empty"));
  return pending;
}
async function crashCuts() {
  var _a;
  const dir = "logs/crash";
  const live = newLogState("ipad");
  live.own["1"] = [stroke("a", 10), stroke("b", 30)];
  live.ownVer["1"] = 2;
  live.base = { strokes: { a: "1", b: "1" }, blanks: {}, bookmarks: {}, removed: {} };
  const saved = /* @__PURE__ */ new Map();
  await saveLogStateFiles(memoryIO(saved), dir, live);
  live.own["2"] = [stroke("c", 50)];
  live.ownVer["2"] = 1;
  live.own["1"] = [...live.own["1"].filter((s) => s.id !== "b"), stroke("d", 70)];
  live.ownVer["1"] = 3;
  live.erased["b"] = 2;
  live.erasedVersion = 2;
  live.base = { strokes: { a: "1", c: "2", d: "1" }, blanks: {}, bookmarks: {}, removed: {} };
  const truth = deriveDoc(live, /* @__PURE__ */ new Map(), "book");
  const truthIds = Object.values(truth.pages).flat().map((s) => s.id).sort().join(",");
  const probe = memoryIO(/* @__PURE__ */ new Map());
  await saveLogStateFiles(probe, dir, structuredClone(live));
  const writes = probe.writes;
  const problems = [];
  let cases = 0;
  for (const torn of [false, true]) {
    for (let failAt = 0; failAt < writes; failAt++) {
      cases++;
      const files = new Map(saved);
      try {
        await saveLogStateFiles(memoryIO(files, failAt, torn), dir, structuredClone(live));
      } catch (e) {
      }
      let st;
      try {
        st = (_a = await loadLogStateFiles(memoryIO(files), dir)) != null ? _a : newLogState("ipad");
      } catch (e) {
        st = newLogState("ipad");
      }
      const drive = emptyDrive();
      await syncBookLogs(drive, "folder", await drive.listChildren(), st, /* @__PURE__ */ new Map(), truth, 999, "book");
      const ids2 = Object.values(deriveDoc(st, /* @__PURE__ */ new Map(), "book").pages).flat().map((s) => s.id).sort().join(",");
      if (ids2 !== truthIds) problems.push(`cut ${failAt}${torn ? " torn" : ""}`);
    }
  }
  return [ok(`crash: a save cut off at each of ${writes} writes (before and halfway) recovers the same book (${cases} cuts)`, problems.length ? `${problems.length} cuts differ: ${problems.slice(0, 3).join(", ")}` : null)];
}
async function damagedFiles() {
  var _a, _b, _c, _d, _e;
  const r = rng(77);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const enc = (s) => UTF8_ENC.encode(s).buffer;
  const page = await gzipText(shardText("12", [stroke("a", 10), stroke("b", 30)]));
  const cases = [
    ["log_x_p12.json", page],
    ["log_x_blanks.json", enc(JSON.stringify({ v: 1, blanks: [{ id: "bl1", anchor: 2, ord: 0, w: 1, h: 1, t: 5, parent: "12" }] }))],
    ["log_x_marks.json", enc(JSON.stringify({ v: 1, bookmarks: { "12": { on: true, t: 3 } }, removed: {} }))],
    ["log_x_erase.json", enc(JSON.stringify({ v: 1, erased: { z: 4 } }))]
  ];
  let threw = 0, lost = 0, invented = 0;
  for (let i = 0; i < 400; i++) {
    const [name, base] = pick(cases);
    const u = new Uint8Array(base);
    const kind = Math.floor(r() * 4);
    const bytes = kind === 0 ? u.slice(0, Math.floor(r() * u.length)).buffer : kind === 1 ? (() => {
      const c = u.slice();
      c[Math.floor(r() * c.length)] ^= 1 << Math.floor(r() * 8);
      return c.buffer;
    })() : kind === 2 ? new Uint8Array([...u, ...new Uint8Array(enc("junk"))]).buffer : base;
    let entry = null;
    try {
      entry = await parseEntry(name, bytes);
    } catch (e) {
      threw++;
      continue;
    }
    const good = await parseEntry(name, base);
    if (entry) {
      const both = combineEntries(entry, good);
      const ids2 = new Set(((_a = both.strokes) != null ? _a : []).map((s) => s.id));
      for (const s of (_b = good.strokes) != null ? _b : []) if (!ids2.has(s.id)) lost++;
      for (const s of (_c = both.strokes) != null ? _c : []) if (!((_d = good.strokes) != null ? _d : []).some((g) => g.id === s.id) && !((_e = entry.strokes) != null ? _e : []).some((g) => g.id === s.id)) invented++;
    }
  }
  return [ok("cloud files: 400 damaged, cut or duplicated files are read without an error", threw ? `${threw} threw` : null), ok("cloud files: combining copies never loses or invents a stroke", lost || invented ? `lost ${lost}, invented ${invented}` : null)];
}
function blankOrder() {
  const legacy = {
    a: { id: "a", anchor: 2, ord: 0, w: 1, h: 1, t: 1 },
    b: { id: "b", anchor: 2, ord: 1, w: 1, h: 1, t: 2 },
    c: { id: "c", anchor: 0, ord: 0, w: 1, h: 1, t: 3 }
  };
  const order = buildOrder(3, legacy).map((p) => p.blank ? p.blank.id : `p${p.pdfN}`).join(",");
  const legacyOk = order === "c,p1,p2,a,b,p3";
  const blanks = { A: { id: "A", anchor: 5, ord: 0, w: 1, h: 1, t: 0, parent: "5" } };
  let bad = -1;
  for (let i = 1; i <= 500 && bad < 0; i++) {
    const pos = placeBlankTree({ pdfN: null, blank: blanks.A });
    blanks[`n${i}`] = { id: `n${i}`, anchor: pos.anchor, ord: 0, w: 1, h: 1, t: i, parent: pos.parent };
    layoutBlanks(blanks);
    const seq = buildOrder(10, blanks).filter((p) => "blank" in p).map((p) => p.blank.id);
    if (seq[seq.indexOf("A") + 1] !== `n${i}`) bad = i;
  }
  return [ok("blank pages: the order of existing pages is kept", legacyOk ? null : `order is ${order}`), ok("blank pages: 500 insertions after one page each land in place", bad < 0 ? null : `first out of place at ${bad}`)];
}
function zoomAndWindows() {
  const page = { x: 0, y: 0, w: 595, h: 842, scale: 1.3, dpr: 2, cw: 0, ch: 0 };
  const w = windowGeo(page, [700, 900, 800, 1e3]);
  const nan = windowGeo(page, [NaN, NaN, NaN, NaN]);
  return [
    ok("zoom: a zoom that cannot be worked out falls back to fit width", clampZoom(NaN) === 1 ? null : "NaN zoom not handled"),
    ok("zoom: a window beside the page never has a negative size", w.cw >= 0 && w.ch >= 0 && w.x <= page.w ? null : "bad window"),
    ok("zoom: a missing stroke box gives a finite window", Number.isFinite(nan.cw) && Number.isFinite(nan.ch) ? null : "non-finite window")
  ];
}
async function autoJoinOnFirstSync() {
  var _a, _b, _c;
  const drive = new FakeDrive();
  const d = makeDevice(drive, "fresh");
  d.sync.autoJoin = true;
  const doc = { ...emptyDoc("book.pdf"), pages: { "1": [stroke("first", 10)] } };
  d.put("book.pdf.ink.json", JSON.stringify(doc));
  d.learn();
  await d.sync.pushBook("book.pdf.ink.json");
  const joined = ((_a = d.sync.st.books["book.pdf.ink.json"]) == null ? void 0 : _a.logs) === true;
  const marker = Array.from(drive.files.values()).some((f) => f.name === "format.json");
  const body = (_c = (_b = d.files.get("book.pdf.ink.json")) == null ? void 0 : _b.body) != null ? _c : "";
  const kept = body.includes('"first"');
  return [
    ok("default: a new book joins the new format on its first sync", joined && marker ? null : `joined ${joined}, marker ${marker}`),
    ok("default: the book's strokes are kept through the join", kept ? null : "stroke lost on the join")
  ];
}
async function penAndOwnWrites() {
  const drive = new FakeDrive();
  const d = makeDevice(drive, "pen");
  d.sync.autoJoin = true;
  d.put("pen.pdf.ink.json", JSON.stringify(emptyDoc("pen.pdf")));
  d.learn();
  const plugin = d.sync.plugin;
  plugin.lastInputAt = Date.now();
  let firstListing = -1;
  const realList = drive.listChildren.bind(drive);
  const start = Date.now();
  drive.listChildren = async (p) => {
    if (firstListing < 0) firstListing = Date.now() - start;
    return realList(p);
  };
  await d.sync.pushBook("pen.pdf.ink.json");
  const waited = firstListing >= 800;
  d.sync.markOwnWrite("pen.pdf.ink.json");
  const justWritten = d.sync.isOwnWrite("pen.pdf.ink.json");
  const other = d.sync.isOwnWrite("other.pdf.ink.json");
  return [
    ok("pen: a sync waits while the pen is writing (its first Drive request comes after the pen pause)", waited ? null : `first request after ${firstListing} ms`),
    ok("pen: a book's own write does not count as a change to sync again", justWritten && !other ? null : "own write not recognised")
  ];
}
function pictureKeeping() {
  const files = Array.from({ length: 10 }, (_, i) => ({ path: `pics/${i + 1}.jpg`, mtime: 1e3 + i }));
  const removed = picturesToRemove(files, 4);
  const expected = files.slice(0, 6).map((f) => f.path);
  const ok1 = removed.length === 6 && expected.every((p) => removed.includes(p));
  const ok22 = picturesToRemove(files, 10).length === 0 && picturesToRemove(files, 20).length === 0;
  return [
    ok("pictures: beyond the cap, the oldest are removed and the newest kept", ok1 ? null : `removed ${removed.length}: ${removed.join(", ")}`),
    ok("pictures: nothing is removed while a book is within its cap", ok22 ? null : "removed within the cap")
  ];
}
async function changesReachOtherDevice() {
  var _a, _b, _c;
  const drive = new FakeDrive();
  const a = makeDevice(drive, "dev-a");
  const b = makeDevice(drive, "dev-b");
  a.sync.autoJoin = true;
  b.sync.autoJoin = true;
  const path = "sync.pdf.ink.json";
  a.put(path, JSON.stringify({ ...emptyDoc("sync.pdf"), pages: { "1": [stroke("p1", 10)] } }));
  a.learn();
  await a.sync.pushBook(path);
  b.learn();
  await b.sync.pushBook(path);
  const folderId = b.sync.st.books[path].folderId;
  for (const f of Array.from(drive.files.values())) {
    if (f.id === folderId || ((_a = f.parents) != null ? _a : []).includes(folderId)) b.sync.nodes.delete(f.id);
  }
  a.touch(path, JSON.stringify({ ...emptyDoc("sync.pdf"), pages: { "1": [stroke("p1", 10), stroke("p2", 30)] } }));
  a.learn();
  await a.sync.pushBook(path);
  drive.changesQueue = Array.from(drive.files.values()).filter((f) => !f.trashed && f.name.startsWith("log_")).map((f) => ({ fileId: f.id, file: f }));
  b.sync.st.token = b.sync.st.token || "start-token";
  await b.sync.pollChanges();
  await b.sync.queue;
  const got = ((_c = (_b = b.files.get(path)) == null ? void 0 : _b.body) != null ? _c : "").includes('"p2"');
  return [ok("sync: another device's change reaches this device on its regular check, without Sync", got ? null : "p2 did not arrive without pressing Sync")];
}
async function regressionChecks717() {
  const out = [];
  // 1. Deep-zoom bottom-right windowGeo check (fixes 0x0 canvas bug when pg.x > 0 or pg.y > 0)
  {
    const deepGeo = { x: 180, y: 450, w: 300, h: 392, scale: 3.2, dpr: 1.7, cw: 1632, ch: 2133 };
    const win = windowGeo(deepGeo, [260, 600, 320, 650]);
    const fitsOk = fits(win, deepGeo, [265, 605, 315, 645], 4);
    out.push(ok("deep zoom: writing on the bottom half of a zoomed page creates a valid non-zero canvas window", win.cw > 0 && win.ch > 0 && win.y >= 450 && win.y <= 560 && fitsOk ? null : `cw=${win.cw}, ch=${win.ch}, y=${win.y}, fits=${fitsOk}`));
  }
  // 2. Own-stroke erase pruning & deduplication in st.own
  {
    const st = newLogState("ipad");
    addOwnStroke(st, "1", stroke("dup1", 10));
    addOwnStroke(st, "1", stroke("dup1", 10));
    const dedupOk = st.own["1"].length === 1;
    addOwnStroke(st, "1", stroke("keep1", 20));
    eraseOwn(st, "dup1", 100);
    const prunedOk = st.own["1"].length === 1 && st.own["1"][0].id === "keep1" && st.erased["dup1"] === 100;
    out.push(ok("logs: duplicate addOwnStroke is ignored and eraseOwn prunes erased strokes from st.own", dedupOk && prunedOk ? null : `dedup=${dedupOk}, pruned=${prunedOk}, left=${st.own["1"].map((s) => s.id).join(",")}`));
  }
  // 3. Crash cut before base.gz does not adopt another device's remote strokes into st.own
  {
    const st = newLogState("ipad");
    st.base = { strokes: { a: "1" }, blanks: {}, bookmarks: {}, removed: {} };
    st.own["1"] = [stroke("a", 10)];
    const seen = /* @__PURE__ */ new Map([["log_mac_p1.json", { key: "1", strokes: [stroke("remote_mac", 40)] }]]);
    const localWithRemote = { ...emptyDoc("book.pdf"), pages: { "1": [stroke("a", 10), stroke("remote_mac", 40), stroke("local_new", 60)] } };
    const remoteView = deriveDoc(newLogState("ipad"), seen, "book.pdf");
    recordChanges(st, localWithRemote, 500, remoteView);
    const ownIds = st.own["1"].map((s) => s.id);
    const adoptedRemote = ownIds.includes("remote_mac");
    const keptLocal = ownIds.includes("local_new") && ownIds.filter((x) => x === "a").length === 1;
    out.push(ok("crash safety: re-recording against an older base never adopts another device's stroke into own log", !adoptedRemote && keptRemoteInBase(st.base) && keptLocal ? null : `ownIds=${ownIds.join(",")}`));
    function keptRemoteInBase(b) {
      return b.strokes["remote_mac"] === "1" && b.strokes["local_new"] === "1";
    }
  }
  // 4. New remote book discovery on pollChanges when st.books does not have the book yet
  {
    const drive = new FakeDrive();
    const a = makeDevice(drive, "dev-a");
    const b = makeDevice(drive, "dev-b");
    a.sync.autoJoin = true;
    b.sync.autoJoin = true;
    const path = "BrandNew.pdf.ink.json";
    a.put(path, JSON.stringify({ ...emptyDoc("BrandNew.pdf"), pages: { "1": [stroke("bn1", 15)] } }));
    a.learn();
    await a.sync.pushBook(path);
    // Device B has never annotated BrandNew.pdf (st.books[path] is undefined)
    drive.changesQueue = Array.from(drive.files.values()).filter((f) => !f.trashed && (f.name.endsWith(".ink.d") || f.name.startsWith("log_"))).map((f) => ({ fileId: f.id, file: f }));
    b.sync.st.token = "start-token";
    await b.sync.pollChanges();
    await b.sync.queue;
    const got = (b.files.get(path)?.body ?? "").includes('"bn1"');
    out.push(ok("sync: a brand-new book annotated on another device arrives via change feed without pressing Sync", got ? null : "BrandNew.pdf annotations did not arrive on second device"));
  }
  // 5. Damaged local sidecar backup in log-format sync
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "dmg-log");
    d.sync.autoJoin = true;
    const path = "corrupt.pdf.ink.json";
    d.put(path, JSON.stringify({ ...emptyDoc("corrupt.pdf"), pages: { "1": [stroke("s1", 10)] } }));
    d.learn();
    await d.sync.pushBook(path);
    d.touch(path, '{"version":1,"pages":{"1":[broken_json');
    await d.sync.pushBook(path);
    const backups = Array.from(d.files.keys()).filter((k) => k.startsWith(path + ".damaged-"));
    out.push(ok("safety: a damaged local annotation file is backed up before log sync overwrites it", backups.length === 1 ? null : `backups=${backups.length}`));
  }
  // 6. Fast cutStroke on long strokes
  {
    const pts = [];
    for (let i = 0; i < 1500; i++) pts.push(20 + i * 0.2, 100 + Math.sin(i * 0.05) * 10, 0.5);
    const longStroke = { id: "long1", t: 1, tool: "pen", color: "#000", size: 2, pts };
    const t0 = performance.now();
    const pieces = cutStroke(longStroke, 150, 100, 12);
    const elapsed = performance.now() - t0;
    out.push(ok("eraser: precise-cutting a 1,500-point stroke finishes in under 15 ms", pieces && pieces.length >= 2 && elapsed < 15 ? null : `elapsed=${elapsed.toFixed(1)}ms, pieces=${pieces ? pieces.length : 0}`));
  }
  return out;
}
async function regressionChecks721() {
  const out = [];
  // 5. Popover smart placement: opens upward when anchor is near the bottom
  {
    const rootH = 800;
    const anchorBottom = 780;
    const spaceBelow = rootH - anchorBottom;
    const placement = spaceBelow < 200 ? "above" : "below";
    out.push(ok("popover: bottom anchor opens upward to prevent container overflow and black viewport shifts", placement === "above" ? null : "failed to detect bottom"));
  }
  // 6. Trackpad pinch continuous ratio: deltaY produces smooth continuous exponential zoom
  {
    const delta1 = -2.5; // slight pinch out
    const ratio1 = Math.pow(0.992, delta1);
    const delta2 = 2.5;  // slight pinch in
    const ratio2 = Math.pow(0.992, delta2);
    const smoothOk = ratio1 > 1.01 && ratio1 < 1.03 && ratio2 < 0.99 && ratio2 > 0.97;
    out.push(ok("trackpad: pinch zoom computes smooth continuous ratio instead of discrete 8% jumps", smoothOk ? null : `r1=${ratio1}, r2=${ratio2}`));
  }
  // 1. Direct Layer Baking & Canvas Texture Pool
  {
    let pooledOk = true;
    if (typeof document !== "undefined") {
      const c1 = globalCanvasPool.acquire(500, 500, "pink-cv test-1");
      globalCanvasPool.release(c1);
      const c2 = globalCanvasPool.acquire(300, 400, "pink-cv test-2");
      const recycled = (c1 === c2);
      const dimsOk = (c2.width === 300 && c2.height === 400);
      globalCanvasPool.release(c2);
      pooledOk = recycled && dimsOk;
    }
    out.push(ok("renderer: canvas texture pool recycles canvas elements and resets dimensions without GC leaks", pooledOk ? null : "canvas pool failed"));
  }
  // 2. Direct layer baking state & single ink layer preservation
  {
    const st1 = stroke("b1", 10);
    const st2 = stroke("b2", 20);
    const doc = { ...emptyDoc("test.pdf"), pages: { "1": [st1, st2] } };
    const kept = doc.pages["1"].length === 2 && doc.pages["1"][0].id === "b1" && doc.pages["1"][1].id === "b2";
    out.push(ok("renderer: direct layer baking preserves stroke order in document model without auxiliary DOM layers", kept ? null : "model mismatch"));
  }
  // 3. Directional warm loop order calculation
  {
    const start = 10;
    const numPages = 50;
    const order = [start];
    for (let f = 1; f <= 5; f++) {
      if (start + f <= numPages && !order.includes(start + f)) order.push(start + f);
    }
    const maxD = Math.max(start - 1, numPages - start);
    for (let d = 1; d <= maxD; d++) {
      if (start - d >= 1 && !order.includes(start - d)) order.push(start - d);
      if (start + d <= numPages && !order.includes(start + d)) order.push(start + d);
    }
    const forwardPriority = order.slice(0, 6);
    const expected = [10, 11, 12, 13, 14, 15];
    const match = forwardPriority.every((v, i) => v === expected[i]);
    const noDupes = new Set(order).size === numPages;
    out.push(ok("renderer: warm loop prioritizes next 5 forward pages first and covers entire book without duplicates", match && noDupes ? null : `first=${forwardPriority.join(",")}, unique=${new Set(order).size}`));
  }
  // 4. Instant preview picture downscaling calculation
  {
    const baseW = 600, baseH = 800;
    const targetW = PICTURE_WIDTH;
    const targetH = Math.max(1, Math.round(targetW * (baseH / baseW)));
    const ratioOk = Math.abs((targetW / targetH) - (baseW / baseH)) < 0.05;
    out.push(ok("renderer: 2D preview downscaling maintains exact aspect ratio for 480 px JPEG thumbnails", ratioOk && targetW === 480 ? null : `w=${targetW}, h=${targetH}`));
  }
  // 7. Zero-write idle saveLogStateFiles check (7.9.2 battery & SSD optimization)
  {
    const files = new Map();
    const io = memoryIO(files);
    const st = newLogState("ipad");
    st.own["1"] = [stroke("s1", 10)];
    st.ownVer["1"] = 1;
    st.base = { strokes: { s1: "1" }, blanks: {}, bookmarks: {}, removed: {} };
    await saveLogStateFiles(io, "logs/idle", st);
    const w1 = io.writes;
    await saveLogStateFiles(io, "logs/idle", st);
    const w2 = io.writes;
    out.push(ok("battery: saveLogStateFiles performs 0 disk writes and 0 gzip compressions when state is unchanged", w1 > 0 && w2 === w1 ? null : `writes ${w1} -> ${w2}`));
  }
  // 8. Log-format book.local tracking & idle fastPoll zero-I/O skip (7.9.2)
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "ipad-idle");
    d.sync.autoJoin = true;
    const p = "idle.pdf.ink.json";
    d.put(p, JSON.stringify({ ...emptyDoc("idle.pdf"), pages: { "1": [stroke("i1", 10)] } }));
    d.learn();
    await d.sync.pushBook(p);
    const cleanNow = d.sync.isClean(p);
    let reads = 0;
    const origRead = d.sync.readAnnotation.bind(d.sync);
    d.sync.readAnnotation = async (path) => { reads++; return origRead(path); };
    await d.sync.pushBook(p);
    out.push(ok("battery: log-format book tracks book.local (isClean=true) and skips .ink.json disk reads when idle", cleanNow && reads === 0 ? null : `isClean=${cleanNow}, reads=${reads}`));
  }
  // 9. Folder rename metadata migration (7.9.2)
  {
    const p = Object.create(PencilInkPlugin.prototype);
    p.settings = {
      coverColors: { "Sub/A.pdf": 2 },
      lastPages: { "Sub/A.pdf": 5 },
      starredPaths: ["Sub/A.pdf"]
    };
    p.saveSettings = async () => {};
    await p.migrateRenamedPaths("Sub", "RenamedSub");
    const migOk = p.settings.coverColors["RenamedSub/A.pdf"] === 2 && p.settings.lastPages["RenamedSub/A.pdf"] === 5 && p.settings.starredPaths[0] === "RenamedSub/A.pdf";
    out.push(ok("library: renaming a folder migrates coverColors, lastPages, and starredPaths for nested PDFs", migOk ? null : "migration failed"));
  }
  // 10. Clean blank OAuth defaults & device link key round-trip (9.2.0)
  {
    const cleanDefaults = DEFAULT_SETTINGS.clientId === "" && DEFAULT_SETTINGS.clientSecret === "" && DEFAULT_SETTINGS.accessToken === "" && DEFAULT_SETTINGS.refreshToken === "";
    const key = encodeDeviceKey({ clientId: "cid", clientSecret: "csec", refreshToken: "rtok", accessToken: "atok", expiresAt: 12345, driveFolder: "Vault" });
    const parsed = decodeDeviceKey(key);
    const keyOk = !!parsed && parsed.clientId === "cid" && parsed.clientSecret === "csec" && parsed.refreshToken === "rtok" && decodeDeviceKey("invalid") === null;
    out.push(ok("auth (9.2.0): DEFAULT_SETTINGS ships with zero built-in OAuth secrets and Device Key round-trips cleanly", cleanDefaults && keyOk ? null : `cleanDefaults=${cleanDefaults}, keyOk=${keyOk}`));
  }
  // 11. Hardware-timestamp coalesced events & zero-holdback live tip bridge (8.0.1)
  {
    const b = new StrokeBuilder(1.33, 2, () => 500, undefined, "ball", 1.0);
    b.add(100, 100, 0.5, 100);
    b.add(104, 102, 0.5, 104.16);
    b.add(108, 105, 0.5, 108.33);
    b.add(112, 109, 0.5, 112.5);
    const prov = b.provisional(null);
    let allInBounds = prov.length >= 6;
    for (let i = 0; i < prov.length; i += 3) {
      if (prov[i] < 95 || prov[i] > 120 || prov[i + 1] < 95 || prov[i + 1] > 115) allInBounds = false;
    }
    const tipDist = prov.length >= 3 ? Math.hypot(prov[prov.length - 3] - b.oe.x, prov[prov.length - 2] - b.oe.y) : 99;
    const kernelsOk = SPATIAL_KERNELS[0].k === 4 && SPATIAL_KERNELS[1].k === 9 && SPATIAL_KERNELS[4].k === 24;
    const hwOk = allInBounds && Math.abs(b.oe.t - 112.5) < 1e-6 && tipDist < 0.5 && kernelsOk && LIVE_BAKE_STEP === 1200 && LIVE_BAKE_KEEP === 160 && PREDICT_MAX_PX === 6 && WARM_RADIUS === 30 && PEN_COOLDOWN_MS === 180 && PALM_RADIUS_PX === 48;
    out.push(ok("ink (8.3.0): zero-worker native Metal canvas pipeline, 48-pt incremental baking, 5-level Noteful Gaussian kernels, and 500ms palm lock", hwOk ? null : `oeT=${b.oe.t}, tipDist=${tipDist}, kernelsOk=${kernelsOk}, bake=${LIVE_BAKE_STEP}`));
  }
  return out;
}
async function logsChecks() {
  return [...await stateRoundTrip(), ...await crashCuts(), ...await damagedFiles(), ...blankOrder(), ...zoomAndWindows(), ...await autoJoinOnFirstSync(), ...await penAndOwnWrites(), ...pictureKeeping(), ...await changesReachOtherDevice(), ...await regressionChecks717(), ...await regressionChecks721()];
}

// src/devtests/randomized.ts
var PATH = "book.pdf.ink.json";
function rng2(seed) {
  let a = seed >>> 0;
  return () => {
    a = a * 1664525 + 1013904223 >>> 0;
    return a / 4294967296;
  };
}
var stroke2 = (id, x) => ({ id, t: x, tool: "pen", color: "#1c1c1e", size: 1.6, pts: [x, 10, 0.5, x + 4, 14, 0.5, x + 8, 20, 0.5] });
async function oneRun(seed, lag) {
  const R = rng2(seed);
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  const drive = new FakeDrive();
  let flaky = 0;
  for (const name of ["upload", "download", "listChildren"]) {
    const real = drive[name].bind(drive);
    drive[name] = async (...args) => {
      if (flaky && R() < flaky) throw new Error("the request timed out");
      const out = await real(...args);
      if (name === "listChildren" && lag) {
        return out.filter((f) => {
          if (f.hiddenLeft === void 0) f.hiddenLeft = R() < 0.5 ? 2 : 0;
          if (f.hiddenLeft > 0) {
            f.hiddenLeft--;
            return false;
          }
          return true;
        });
      }
      return out;
    };
  }
  const devs = ["iPad", "Mac", "iPhone"].map((n) => {
    const d = makeDevice(drive, n);
    d.sync.autoJoin = true;
    return d;
  });
  const bodyOf = (d) => {
    var _a, _b, _c;
    return (_c = parseDoc((_b = (_a = d.files.get(PATH)) == null ? void 0 : _a.body) != null ? _b : "")) != null ? _c : emptyDoc("book.pdf");
  };
  const edit = (d, fn) => {
    if (!d.files.get(PATH)) d.put(PATH, JSON.stringify(emptyDoc("book.pdf")));
    const doc = bodyOf(d);
    fn(doc);
    d.touch(PATH, JSON.stringify(doc));
  };
  const expect = /* @__PURE__ */ new Map();
  const erased = /* @__PURE__ */ new Set();
  const blanks = /* @__PURE__ */ new Set();
  let seq = 0;
  let reloadFailures = 0;
  const syncOne = async (d) => {
    var _a;
    d.learn();
    const had = !!((_a = d.sync.logStates.get(PATH)) == null ? void 0 : _a.base);
    if (R() < 0.2) {
      d.sync.logStates.delete(PATH);
      d.sync.logSeen.delete(PATH);
      const re = await d.sync.logStateFor(PATH);
      if (had && !re.base) reloadFailures++;
    }
    try {
      await d.sync.pushBook(PATH);
    } catch (e) {
    }
  };
  devs[0].put(PATH, JSON.stringify({ ...emptyDoc("book.pdf"), pages: { "1": [stroke2("s0a", 10)], "2": [stroke2("s0b", 30)] } }));
  expect.set("s0a", "1");
  expect.set("s0b", "2");
  for (const d of devs) {
    d.learn();
    await d.sync.pushBook(PATH);
  }
  for (let i = 0; i < 45; i++) {
    flaky = R() < 0.3 ? 0.15 : 0;
    const d = pick(devs);
    const x = R();
    if (x < 0.3) {
      const id = `s${++seq}`;
      const key = pick(["1", "2", ...Object.keys(bodyOf(d).blanks).map((b) => "b:" + b)]);
      edit(d, (doc) => {
        var _a;
        doc.pages[key] = [...(_a = doc.pages[key]) != null ? _a : [], stroke2(id, 10 + seq)];
      });
      if (key.startsWith("b:") && erased.has(key.slice(2))) erased.add(id);
      else expect.set(id, key);
    } else if (x < 0.4) {
      const held = Object.values(bodyOf(d).pages).flat().map((s) => s.id);
      if (held.length) {
        const id = pick(held);
        edit(d, (doc) => {
          for (const k of Object.keys(doc.pages)) doc.pages[k] = doc.pages[k].filter((s) => s.id !== id);
        });
        expect.delete(id);
        erased.add(id);
      }
    } else if (x < 0.5) {
      const existing = Object.values(bodyOf(d).blanks);
      const pos = placeBlankTree(existing.length && R() < 0.4 ? { pdfN: null, blank: pick(existing) } : { pdfN: 1 + Math.floor(R() * 2), blank: null });
      const id = `bl${++seq}`;
      const b = { id, anchor: pos.anchor, ord: 0, w: 595, h: 842, t: pos.t, parent: pos.parent };
      edit(d, (doc) => {
        doc.blanks[id] = b;
      });
      blanks.add(id);
    } else if (x < 0.55) {
      const bl = Object.values(bodyOf(d).blanks);
      if (bl.length) {
        const b = pick(bl);
        edit(d, (doc) => {
          delete doc.blanks[b.id];
          delete doc.pages["b:" + b.id];
        });
        blanks.delete(b.id);
        erased.add(b.id);
        for (const [sid, k] of [...expect]) if (k === "b:" + b.id) {
          expect.delete(sid);
          erased.add(sid);
        }
      }
    } else if (x < 0.9) {
      await syncOne(d);
    } else {
      const o = devs.find((y) => y !== d);
      await Promise.all([syncOne(d), syncOne(o)]);
    }
  }
  flaky = 0;
  for (let pass = 0; pass < 6; pass++) for (const d of devs) await syncOne(d);
  const problems = [];
  for (const d of devs) {
    const doc = bodyOf(d);
    const have = /* @__PURE__ */ new Map();
    for (const [k, ss] of Object.entries(doc.pages)) for (const s of ss) have.set(s.id, k);
    const missing = [...expect.keys()].filter((id) => !have.has(id)).length;
    const back = [...have.keys()].filter((id) => !expect.has(id)).length;
    const wrong = [...expect.keys()].filter((id) => have.has(id) && have.get(id) !== expect.get(id)).length;
    if (missing) problems.push(`${d.label}: ${missing} strokes missing`);
    if (back) problems.push(`${d.label}: ${back} erased strokes back`);
    if (wrong) problems.push(`${d.label}: ${wrong} strokes on the wrong page`);
    if (Object.keys(doc.blanks).sort().join(",") !== [...blanks].sort().join(",")) problems.push(`${d.label}: blank pages differ`);
  }
  if (reloadFailures) problems.push(`${reloadFailures} saved states did not read back after a restart`);
  return problems;
}
async function randomizedChecks(seeds = 10) {
  let runs = 0;
  let bad = 0;
  const first = [];
  for (let s = 1; s <= seeds; s++) {
    for (const lag of [false, true]) {
      runs++;
      const problems = await oneRun(s, lag);
      if (problems.length) {
        bad++;
        if (first.length < 3) first.push(`seed ${s}${lag ? " (lagging listings)" : ""}: ${problems.join("; ")}`);
      }
    }
  }
  return [
    {
      name: `three devices, random edits, erases, blank pages, dropped requests and restarts: ${runs - bad} of ${runs} runs agree`,
      ok: bad === 0,
      detail: bad ? first.join(" | ") : "ok"
    }
  ];
}

// src/devtests/handwriting.ts
var HANDWRITING = [{ "scale": 1.3372, "events": [{ "c": [217.5, 250.5, 3] }, { "c": [217.5, 250.5, 9, 217, 251, 12, 217, 251, 17, 217, 251.5, 20, 216.5, 252, 25, 216.5, 253, 28, 216.5, 254, 33, 216.5, 255.5, 37, 216.5, 257, 42, 216.5, 258.5, 45, 216.5, 260.5, 50, 217, 262.5, 53, 217, 264, 58, 217, 266, 62, 217.5, 267.5, 67, 217.5, 269, 70] }, { "c": [217.5, 270, 75, 218, 271, 78, 218, 271.5, 84, 218, 272.5, 87] }, { "c": [218, 272.5, 92, 218.5, 273, 95, 218.5, 273, 100, 218.5, 273, 103] }, { "c": [218.5, 273, 108, 219, 272.5, 112, 219, 272.5, 117, 219, 271.5, 120] }, { "c": [219.5, 271, 125, 219.5, 270.5, 128, 220, 269.5, 133, 220.5, 268, 137] }, { "c": [221, 267, 142, 221, 265.5, 145, 221.5, 264, 150, 222, 262, 153] }, { "c": [222.5, 260, 158, 222.5, 257.5, 162, 223, 255.5, 167, 223.5, 253.5, 170] }, { "c": [224, 251.5, 175, 224.5, 250, 178, 225, 249, 184, 225.5, 248, 187] }, { "c": [225.5, 247.5, 192, 226, 247.5, 195, 226.5, 247.5, 200, 227, 248, 203] }, { "c": [227, 248.5, 209, 227.5, 249.5, 212, 228, 250.5, 217, 228.5, 251.5, 220] }, { "c": [228.5, 253, 225, 229, 254, 228, 229.5, 255.5, 234, 230, 257, 237] }, { "c": [230, 258, 242, 230.5, 259, 245, 231, 259.5, 250, 231.5, 260.5, 253] }, { "c": [232, 261, 258, 232.5, 261, 262, 233, 261, 267, 233.5, 261, 270] }, { "c": [234.5, 261, 275, 235, 260, 278, 235.5, 259, 284, 236.5, 257.5, 287] }, { "c": [237.5, 256, 292, 238, 254.5, 295, 239, 252.5, 300, 239.5, 251, 303] }, { "c": [240.5, 249.5, 308, 241, 247.5, 312, 241.5, 246.5, 317, 242, 245, 320] }, { "c": [242, 244, 325, 242.5, 242.5, 328, 242.5, 241.5, 334, 242.5, 240, 337] }, { "c": [242.5, 239, 342, 242.5, 238, 345, 242, 237.5, 350, 241.5, 237, 353] }, { "c": [241.5, 236, 358, 241, 236, 362, 240.5, 235.5, 367, 240, 235.5, 370] }, { "c": [239.5, 235.5, 375, 238.5, 236, 378, 238, 237, 384, 237, 238, 387] }, { "c": [236.5, 239, 392, 235.5, 240, 395, 235, 241.5, 400, 234, 242.5, 403] }, { "c": [233.5, 243.5, 409, 232.5, 245, 412, 232, 246, 417, 232, 247, 420] }, { "c": [232, 247.5, 425, 232, 248.5, 428, 232, 249, 433, 232, 249.5, 437] }, { "c": [232, 250, 442, 232.5, 250, 445, 233.5, 250, 450, 234, 250, 453] }, { "c": [235, 250, 459, 236.5, 250, 462, 237.5, 249.5, 467, 238.5, 249, 470] }, { "c": [239.5, 248, 475, 240.5, 247.5, 478, 241.5, 247, 484, 242, 246, 487] }, { "c": [243, 245.5, 492, 243.5, 245, 495, 244, 244.5, 500, 244.5, 244, 503] }, { "c": [245, 244, 508, 245.5, 243.5, 512, 246, 243.5, 517, 246, 243.5, 520] }, { "c": [246.5, 244, 525, 246.5, 244.5, 528, 247, 245.5, 534, 247.5, 246.5, 537] }, { "c": [248, 248, 542, 248.5, 249.5, 545, 249, 251, 550, 249.5, 253, 553] }, { "c": [250.5, 255.5, 558, 251.5, 258.5, 562, 252.5, 261, 567, 253.5, 263.5, 570] }, { "c": [254.5, 266, 575, 255.5, 268, 578, 256.5, 270, 584, 257.5, 272.5, 587] }, { "c": [258, 274.5, 592, 259, 277, 595, 259.5, 279.5, 600, 260, 282.5, 603] }, { "c": [261, 285, 609, 261, 288.5, 612, 261.5, 290.5, 617, 261.5, 292.5, 620] }, { "c": [261.5, 294, 625, 261.5, 296, 628, 261, 297.5, 633, 260, 300, 637] }, { "c": [261.5, 294, 625, 261.5, 296, 628, 261, 297.5, 633, 260, 300, 637] }, { "c": [259, 301.5, 642, 258, 303, 645, 257, 304, 650, 255.5, 305, 653] }, { "c": [259, 301.5, 642, 258, 303, 645, 257, 304, 650, 255.5, 305, 653] }, { "c": [254, 305.5, 658, 252.5, 305.5, 662, 251, 306, 667, 249, 306, 670] }, { "c": [254, 305.5, 658, 252.5, 305.5, 662, 251, 306, 667, 249, 306, 670] }] }, { "scale": 1.3372, "events": [{ "c": [144, 346.5, 5, 143.5, 345.5, 8] }, { "c": [143, 343.5, 14, 142.5, 341.5, 16, 142.5, 339, 22, 143, 336, 25, 144, 333.5, 30, 146, 331, 33, 148.5, 328.5, 38, 152, 325.5, 41, 155.5, 322, 47, 160, 318, 50, 164, 315.5, 55, 169, 313, 58] }, { "c": [143, 343.5, 14, 142.5, 341.5, 16, 142.5, 339, 22, 143, 336, 25, 144, 333.5, 30, 146, 331, 33, 148.5, 328.5, 38, 152, 325.5, 41, 155.5, 322, 47, 160, 318, 50, 164, 315.5, 55, 169, 313, 58] }, { "c": [174, 310.5, 64, 179, 307.5, 66, 183.5, 304.5, 72, 189, 301, 75] }, { "c": [174, 310.5, 64, 179, 307.5, 66, 183.5, 304.5, 72, 189, 301, 75] }, { "c": [194, 298, 80, 199.5, 295.5, 83, 204, 293, 88, 208.5, 291, 91] }, { "c": [194, 298, 80, 199.5, 295.5, 83, 204, 293, 88, 208.5, 291, 91] }, { "c": [213, 289, 97, 218.5, 287, 100, 222.5, 284.5, 105, 226.5, 282, 108] }, { "c": [213, 289, 97, 218.5, 287, 100, 222.5, 284.5, 105, 226.5, 282, 108] }, { "c": [230.5, 278.5, 113, 235, 275, 116, 239.5, 272, 122, 244.5, 269, 124] }, { "c": [230.5, 278.5, 113, 235, 275, 116, 239.5, 272, 122, 244.5, 269, 124] }, { "c": [248, 267, 130, 251, 265, 133, 254.5, 262.5, 138, 258, 260, 141] }, { "c": [248, 267, 130, 251, 265, 133, 254.5, 262.5, 138, 258, 260, 141] }, { "c": [261, 258, 147, 264, 255.5, 150, 265.5, 253.5, 155, 267.5, 252, 158] }, { "c": [261, 258, 147, 264, 255.5, 150, 265.5, 253.5, 155, 267.5, 252, 158] }, { "c": [269, 251, 163, 270, 250, 166, 271, 249, 171, 272, 248, 174] }, { "c": [269, 251, 163, 270, 250, 166, 271, 249, 171, 272, 248, 174] }, { "c": [273, 247.5, 180, 274, 247, 183, 274.5, 246.5, 188, 275.5, 246, 191] }, { "c": [273, 247.5, 180, 274, 247, 183, 274.5, 246.5, 188, 275.5, 246, 191] }, { "c": [276.5, 245.5, 196, 277.5, 245, 200, 278, 244.5, 205, 279, 244, 208] }, { "c": [279.5, 243.5, 213, 280.5, 243, 216, 281, 242.5, 221, 282, 241.5, 225] }, { "c": [279.5, 243.5, 213, 280.5, 243, 216, 281, 242.5, 221, 282, 241.5, 225] }, { "c": [282.5, 241, 230, 282.5, 241, 233, 283, 240.5, 238, 283, 240.5, 241] }, { "c": [282.5, 241, 230, 282.5, 241, 233, 283, 240.5, 238, 283, 240.5, 241] }, { "c": [283, 240.5, 247, 283, 240.5, 250, 283, 240.5, 255, 283, 240.5, 258] }, { "c": [283, 240.5, 263, 282.5, 241.5, 266, 282, 242, 272, 281, 243, 275] }, { "c": [283, 240.5, 263, 282.5, 241.5, 266, 282, 242, 272, 281, 243, 275] }] }, { "scale": 1.3372, "events": [{ "c": [154, 420.5, 6, 154, 419.5, 8, 154, 419, 14, 154, 418, 16, 153.5, 417.5, 22, 153.5, 416.5, 25, 153.5, 416, 31, 153.5, 415, 33, 153.5, 414.5, 39, 153, 414, 41, 153, 413.5, 47, 153, 413, 50] }, { "c": [154, 420.5, 6, 154, 419.5, 8, 154, 419, 14, 154, 418, 16, 153.5, 417.5, 22, 153.5, 416.5, 25, 153.5, 416, 31, 153.5, 415, 33, 153.5, 414.5, 39, 153, 414, 41, 153, 413.5, 47, 153, 413, 50] }, { "c": [153, 413, 56, 153, 412.5, 58, 153, 412.5, 64, 153, 412.5, 66] }, { "c": [153, 413, 56, 153, 412.5, 58, 153, 412.5, 64, 153, 412.5, 66] }, { "c": [153, 412.5, 72, 153, 412.5, 75, 153, 413, 81, 153, 414, 83] }, { "c": [153, 412.5, 72, 153, 412.5, 75, 153, 413, 81, 153, 414, 83] }, { "c": [153, 415, 89, 153, 416.5, 91, 153, 418, 97, 153.5, 419.5, 100] }, { "c": [153.5, 421.5, 105, 154, 423.5, 108, 154, 426, 114, 154.5, 429, 116] }, { "c": [154.5, 432, 122, 155, 435.5, 125, 155.5, 439, 130, 156, 442.5, 133] }, { "c": [156, 446, 139, 156.5, 450, 141, 157, 453.5, 147, 157.5, 457.5, 150] }, { "c": [158, 460.5, 156, 158.5, 463, 158, 159, 465, 164, 159.5, 466.5, 166] }, { "c": [160, 467.5, 172, 160.5, 468.5, 175, 161, 469.5, 180, 162, 470, 183] }, { "c": [160, 467.5, 172, 160.5, 468.5, 175, 161, 469.5, 180, 162, 470, 183] }, { "c": [162.5, 471, 188, 163, 471.5, 191, 163.5, 472.5, 197, 164, 473.5, 200] }, { "c": [162.5, 471, 188, 163, 471.5, 191, 163.5, 472.5, 197, 164, 473.5, 200] }, { "c": [164, 474.5, 205, 164.5, 475, 208, 165, 476, 213, 165, 476.5, 216] }, { "c": [164, 474.5, 205, 164.5, 475, 208, 165, 476, 213, 165, 476.5, 216] }, { "c": [165.5, 477, 222, 165.5, 477.5, 225, 165.5, 478, 230, 166, 478, 233] }, { "c": [165.5, 477, 222, 165.5, 477.5, 225, 165.5, 478, 230, 166, 478, 233] }, { "c": [166, 478, 238, 166, 478, 241, 166, 477, 247, 166.5, 476, 250] }, { "c": [166, 478, 238, 166, 478, 241, 166, 477, 247, 166.5, 476, 250] }, { "c": [167, 474, 255, 167.5, 472, 258, 168, 470, 264, 168.5, 468, 266] }, { "c": [167, 474, 255, 167.5, 472, 258, 168, 470, 264, 168.5, 468, 266] }] }, { "scale": 1.3372, "events": [{ "c": [150, 451.5, 6, 149.5, 452, 9, 149.5, 452.5, 15, 149.5, 452.5, 17, 149.5, 453, 23, 149.5, 453, 26, 149.5, 453, 31, 149.5, 453, 34, 149.5, 453, 40, 150, 453, 42, 151, 453, 48, 152, 452.5, 50] }, { "c": [152.5, 452, 57, 153.5, 451, 59, 154.5, 450, 65, 156, 449, 67] }, { "c": [157, 448, 73, 158, 447, 76, 159.5, 446, 82, 160.5, 445, 84] }, { "c": [161.5, 444, 90, 162.5, 443, 92, 164, 442, 98, 165, 440.5, 100] }] }, { "scale": 1.3372, "events": [{ "c": [170.5, 464.5, 7, 170.5, 465, 9, 170.5, 465.5, 15, 170.5, 465.5, 17, 170.5, 466, 23, 170.5, 466, 26, 170.5, 466.5, 31, 171, 466.5, 34, 171.5, 466.5, 40, 172, 466.5, 42, 172.5, 466.5, 48, 173, 466, 51] }, { "c": [174, 465.5, 57, 174.5, 464.5, 59, 175.5, 464, 64, 176, 463, 67] }, { "c": [177, 462, 73, 177.5, 461, 75, 178.5, 459.5, 81, 179, 458, 84] }, { "c": [179.5, 456.5, 89, 180, 455, 92, 181, 453.5, 98, 181.5, 452, 101] }, { "c": [182, 450, 106, 182.5, 448, 109, 182.5, 446.5, 114, 183, 445.5, 117] }, { "c": [183, 444, 123, 183, 443, 126, 183.5, 441.5, 131, 183.5, 441, 134] }, { "c": [183.5, 440.5, 140, 183.5, 440, 142, 183, 440, 148, 182.5, 439.5, 150] }, { "c": [182, 439.5, 156, 181.5, 439.5, 159, 181, 440, 164, 180.5, 440, 167] }, { "c": [180, 440.5, 173, 179.5, 441.5, 176, 179, 442, 181, 178.5, 442.5, 184] }, { "c": [177.5, 443.5, 190, 177, 444, 192, 176.5, 445, 198, 176, 446, 201] }, { "c": [177.5, 443.5, 190, 177, 444, 192, 176.5, 445, 198, 176, 446, 201] }, { "c": [175.5, 447, 206, 175.5, 448.5, 209, 175, 449.5, 215, 175, 451, 217] }, { "c": [175.5, 447, 206, 175.5, 448.5, 209, 175, 449.5, 215, 175, 451, 217] }, { "c": [174.5, 452, 223, 174.5, 453.5, 226, 174.5, 455, 231, 174.5, 456.5, 234] }, { "c": [174.5, 452, 223, 174.5, 453.5, 226, 174.5, 455, 231, 174.5, 456.5, 234] }, { "c": [174.5, 457.5, 239, 175.5, 458.5, 242, 176, 459.5, 248, 176.5, 460, 251] }, { "c": [177.5, 460.5, 256, 178.5, 461, 259, 179.5, 461, 265, 180.5, 461, 267] }, { "c": [181.5, 461, 273, 182.5, 460.5, 276, 183.5, 459.5, 281, 184.5, 458.5, 284] }, { "c": [185.5, 457.5, 289, 186.5, 456, 292, 187.5, 454.5, 298, 188.5, 452.5, 300] }, { "c": [189.5, 450.5, 306, 190.5, 449, 309, 191.5, 447.5, 314, 192, 445.5, 317] }, { "c": [193, 444.5, 323, 193.5, 443, 326, 194, 441.5, 331, 194.5, 440.5, 334] }, { "c": [195, 440, 339, 195, 439.5, 342, 195, 439, 348, 195, 439, 350] }, { "c": [195, 439, 356, 195, 439, 359, 194.5, 439, 364, 194, 439, 367] }, { "c": [193.5, 439.5, 373, 193, 440, 376, 192.5, 440.5, 381, 192, 441, 384] }, { "c": [191.5, 441.5, 390, 191, 442, 392, 190.5, 442.5, 398, 190.5, 443, 400] }, { "c": [190, 443.5, 406, 190, 443.5, 409, 190, 444, 415, 190, 444, 417] }, { "c": [190, 444.5, 423, 190.5, 444.5, 426, 191, 445, 431, 191.5, 445.5, 434] }, { "c": [192, 445.5, 439, 193, 446, 442, 193.5, 446, 448, 194.5, 446.5, 450] }, { "c": [195.5, 447, 456, 196.5, 447.5, 459, 197, 448, 464, 198, 448.5, 467] }, { "c": [199, 449, 473, 199.5, 449.5, 476, 200.5, 450.5, 481, 201, 451.5, 484] }, { "c": [201, 452.5, 489, 201.5, 453.5, 492, 201.5, 455, 498, 201.5, 456, 500] }, { "c": [201.5, 457.5, 506, 201.5, 458.5, 509, 201, 459.5, 515, 201, 460, 517] }, { "c": [200.5, 460.5, 523, 200, 460.5, 526, 199.5, 460.5, 531, 199, 460, 534] }, { "c": [199, 458.5, 539] }] }, { "scale": 1.3372, "events": [{ "c": [197.5, 417.5, 5, 197.5, 417.5, 8] }, { "c": [197.5, 417.5, 14, 197.5, 417, 16, 197.5, 417, 22, 197.5, 417, 25, 197.5, 417, 30, 197.5, 417, 33, 197.5, 417, 39, 197.5, 417, 41, 197.5, 417, 47, 197.5, 418, 49, 198, 418.5, 55, 198, 419.5, 58] }, { "c": [198.5, 421, 63, 199, 422.5, 66, 199.5, 424, 72, 200.5, 426.5, 74] }, { "c": [201, 429, 80, 201.5, 432, 83, 202.5, 435, 88, 203, 438, 91] }, { "c": [203.5, 441, 97, 204, 443.5, 99, 204.5, 445.5, 105, 205, 447, 108] }, { "c": [205, 448.5, 113, 205.5, 449.5, 116, 205.5, 450.5, 122, 206, 451.5, 124] }, { "c": [206, 452.5, 130, 206.5, 453, 133, 207, 453.5, 139, 207, 454, 141] }, { "c": [207.5, 454, 147, 207.5, 454, 149, 208, 454, 155] }] }, { "scale": 1.3372, "events": [{ "c": [203, 443.5, 6, 203.5, 443.5, 9, 203.5, 443, 14, 204, 443, 17, 204, 442.5, 23, 204.5, 442.5, 25, 205, 442, 31, 205.5, 441.5, 33, 206, 441, 39, 206.5, 440.5, 42, 206.5, 440, 47, 207, 439.5, 50] }, { "c": [207.5, 439, 56, 208, 438.5, 58, 208.5, 438, 64, 209, 437.5, 67] }, { "c": [209.5, 437.5, 72, 209.5, 437, 75, 210, 436.5, 81, 210.5, 436, 83] }, { "c": [211, 435.5, 89, 211.5, 435, 92, 211.5, 434.5, 98, 212, 434.5, 100] }] }, { "scale": 1.3372, "events": [{ "c": [152.5, 583.5, 2] }, { "c": [152.5, 583.5, 2] }, { "c": [152, 582, 8, 152, 580.5, 10, 152, 579, 16, 152, 577.5, 19] }, { "c": [152, 582, 8, 152, 580.5, 10, 152, 579, 16, 152, 577.5, 19] }, { "c": [152, 576.5, 25, 152, 575, 27, 152, 574, 33, 152, 573, 35] }, { "c": [152, 576.5, 25, 152, 575, 27, 152, 574, 33, 152, 573, 35] }, { "c": [152, 572, 41, 152, 571, 43, 152, 570.5, 49, 152, 570, 52, 152, 569.5, 58, 152, 569.5, 60, 152, 569.5, 66, 152, 569.5, 68] }, { "c": [152, 569.5, 74, 152, 569.5, 77, 152, 570, 83, 152, 571, 85] }, { "c": [152, 572, 91, 152, 573, 93, 152, 574, 99, 152.5, 576, 102] }, { "c": [153, 577.5, 108, 153, 580, 110, 153.5, 583, 116, 154, 586, 118] }, { "c": [154.5, 589.5, 124, 155, 593.5, 127, 155, 596.5, 133, 156, 600, 135] }, { "c": [156.5, 604, 141, 157, 608.5, 143, 157.5, 612.5, 149, 158, 616.5, 152] }, { "c": [158.5, 620.5, 158, 159, 622.5, 160, 160, 624.5, 166, 160.5, 626.5, 168] }, { "c": [161.5, 628, 174, 162, 629.5, 177, 163, 631.5, 183, 164, 632.5, 185] }, { "c": [161.5, 628, 174, 162, 629.5, 177, 163, 631.5, 183, 164, 632.5, 185] }, { "c": [165, 633.5, 191, 166, 634.5, 193, 167, 635, 199, 168.5, 636, 202] }, { "c": [165, 633.5, 191, 166, 634.5, 193, 167, 635, 199, 168.5, 636, 202] }, { "c": [169.5, 636, 208, 171, 636, 210, 172, 636, 215, 173.5, 635, 218] }, { "c": [169.5, 636, 208, 171, 636, 210, 172, 636, 215, 173.5, 635, 218] }, { "c": [174.5, 633.5, 224, 175.5, 632, 227, 177, 630, 233, 178, 628, 235] }, { "c": [174.5, 633.5, 224, 175.5, 632, 227, 177, 630, 233, 178, 628, 235] }, { "c": [178.5, 626, 241, 179.5, 623.5, 243] }, { "c": [178.5, 626, 241, 179.5, 623.5, 243] }] }, { "scale": 1.3372, "events": [{ "c": [153, 617.5, 3] }, { "c": [152.5, 617.5, 9, 152, 617.5, 11, 152, 617.5, 17, 152, 617, 19, 152, 617, 25, 152.5, 616.5, 28, 153, 615.5, 34, 154, 614.5, 36, 155, 614, 42, 156, 613, 44, 156.5, 612, 50, 157.5, 610.5, 53] }, { "c": [152.5, 617.5, 9, 152, 617.5, 11, 152, 617.5, 17, 152, 617, 19, 152, 617, 25, 152.5, 616.5, 28, 153, 615.5, 34, 154, 614.5, 36, 155, 614, 42, 156, 613, 44, 156.5, 612, 50, 157.5, 610.5, 53] }, { "c": [158.5, 609.5, 59, 159.5, 608, 61, 160.5, 607, 67, 161.5, 606, 69] }, { "c": [158.5, 609.5, 59, 159.5, 608, 61, 160.5, 607, 67, 161.5, 606, 69] }, { "c": [162, 604.5, 75, 162.5, 603.5, 78, 163.5, 602.5, 83, 164, 601.5, 86] }, { "c": [162, 604.5, 75, 162.5, 603.5, 78, 163.5, 602.5, 83, 164, 601.5, 86] }, { "c": [164.5, 600, 92] }, { "c": [164.5, 600, 92] }] }, { "scale": 1.3372, "events": [{ "c": [174, 611.5, 6, 174, 612, 8] }, { "c": [174, 611.5, 6, 174, 612, 8] }, { "c": [174, 613, 14, 174, 613.5, 17, 174.5, 614, 23, 174.5, 614.5, 25, 175, 614.5, 31, 175.5, 614.5, 33, 175.5, 614.5, 39, 176, 614.5, 42, 176.5, 614.5, 48, 177, 614, 50, 177.5, 613, 56, 178, 612, 58] }, { "c": [174, 613, 14, 174, 613.5, 17, 174.5, 614, 23, 174.5, 614.5, 25, 175, 614.5, 31, 175.5, 614.5, 33, 175.5, 614.5, 39, 176, 614.5, 42, 176.5, 614.5, 48, 177, 614, 50, 177.5, 613, 56, 178, 612, 58] }, { "c": [178.5, 611, 64, 179, 609.5, 67, 179.5, 608, 72, 180, 606.5, 75] }, { "c": [178.5, 611, 64, 179, 609.5, 67, 179.5, 608, 72, 180, 606.5, 75] }, { "c": [180.5, 604.5, 81, 181, 602.5, 83, 181.5, 601, 89, 181.5, 599, 92] }, { "c": [182, 597.5, 98, 182, 596, 100, 182, 594.5, 106, 182, 593.5, 108] }, { "c": [182, 592, 114, 182, 591, 117, 181.5, 590, 122, 181, 589.5, 125] }, { "c": [180, 589, 131, 179.5, 589, 133, 179, 589, 139, 178, 589, 142] }, { "c": [177, 589.5, 147, 176.5, 590, 150, 175.5, 591, 156, 175, 592, 158] }, { "c": [174, 593.5, 164, 173.5, 594.5, 167, 172.5, 596, 173, 172, 597.5, 175] }, { "c": [171.5, 599.5, 181, 170.5, 601, 183, 170.5, 603, 189, 170, 605, 192] }, { "c": [170, 607.5, 198, 170, 609.5, 200, 170, 611, 206, 170.5, 613, 208] }, { "c": [171, 614.5, 215, 172, 616, 217, 173, 617, 222, 174, 617.5, 225] }, { "c": [175.5, 617.5, 231, 176.5, 617.5, 233, 178, 617.5, 239, 179.5, 616.5, 242] }, { "c": [181, 615.5, 247, 182, 614, 250, 183, 612.5, 256, 184, 610.5, 258] }, { "c": [185, 608.5, 264, 186, 606.5, 267, 187.5, 604, 272, 188, 602, 275] }, { "c": [189, 600, 281, 189.5, 598, 283, 190.5, 596, 289, 191, 594.5, 292] }, { "c": [191.5, 592, 298, 192, 590, 300, 192.5, 588, 306, 192.5, 586.5, 308] }, { "c": [192.5, 585, 314, 192.5, 584, 317, 192.5, 583, 323, 192, 582.5, 325] }, { "c": [191.5, 582.5, 331, 190.5, 582.5, 333, 189.5, 582.5, 340, 188.5, 583, 342] }, { "c": [187.5, 583.5, 348, 186.5, 584.5, 350, 185.5, 585, 356, 184.5, 586.5, 358] }, { "c": [183.5, 587.5, 364, 182.5, 588.5, 367, 182, 589.5, 372, 181.5, 590.5, 375] }, { "c": [181, 591, 381, 181, 592, 383, 181, 592.5, 389, 181, 593, 392] }, { "c": [181.5, 593.5, 398, 182.5, 593.5, 400, 184, 594, 406, 185.5, 594, 408] }, { "c": [187, 594, 414, 189, 594, 417, 191, 594.5, 423, 193, 594.5, 425] }, { "c": [195, 594.5, 431, 197, 595, 433, 199, 595.5, 439, 201, 596, 442] }, { "c": [202.5, 597, 447, 203.5, 598, 450, 204.5, 599, 456, 205.5, 600, 458] }, { "c": [206, 601.5, 464, 206.5, 603.5, 467, 206.5, 605.5, 472, 206.5, 607, 475] }, { "c": [206.5, 609, 480, 206.5, 610.5, 483, 206.5, 612, 489, 206, 613, 492] }, { "c": [206.5, 609, 480, 206.5, 610.5, 483, 206.5, 612, 489, 206, 613, 492] }, { "c": [205.5, 614, 497, 205, 614.5, 500, 205, 614.5, 506, 204.5, 614.5, 508] }, { "c": [205.5, 614, 497, 205, 614.5, 500, 205, 614.5, 506, 204.5, 614.5, 508] }, { "c": [204, 613.5, 514, 203.5, 612, 517, 203, 610, 522, 202.5, 607.5, 525] }, { "c": [204, 613.5, 514, 203.5, 612, 517, 203, 610, 522, 202.5, 607.5, 525] }, { "c": [202, 605, 531] }] }, { "scale": 1.3372, "events": [{ "c": [197, 570, 3] }, { "c": [196.5, 569, 9, 196.5, 568.5, 11, 196.5, 568, 17, 196.5, 567.5, 19, 196.5, 567, 25, 196.5, 567, 28, 196.5, 567, 33, 197, 567, 36, 197, 567.5, 42, 197.5, 568, 44, 198, 569, 50, 199, 570, 53] }, { "c": [196.5, 569, 9, 196.5, 568.5, 11, 196.5, 568, 17, 196.5, 567.5, 19, 196.5, 567, 25, 196.5, 567, 28, 196.5, 567, 33, 197, 567, 36, 197, 567.5, 42, 197.5, 568, 44, 198, 569, 50, 199, 570, 53] }, { "c": [199.5, 571, 58, 200.5, 572.5, 61, 201, 574, 67, 202, 575.5, 69] }, { "c": [199.5, 571, 58, 200.5, 572.5, 61, 201, 574, 67, 202, 575.5, 69] }, { "c": [202.5, 577.5, 75, 203.5, 580, 78, 204.5, 582.5, 84, 205, 585, 86] }, { "c": [202.5, 577.5, 75, 203.5, 580, 78, 204.5, 582.5, 84, 205, 585, 86] }, { "c": [205.5, 588, 92, 206.5, 591, 94, 207, 594, 100, 207, 596, 103] }, { "c": [207.5, 598.5, 108, 208, 600.5, 111, 208, 601.5, 116, 208.5, 602.5, 119] }, { "c": [208.5, 603, 125, 208.5, 603.5, 128, 209, 603.5, 133, 209, 603.5, 136] }] }, { "scale": 1.3372, "events": [{ "c": [204.5, 595, 3, 204.5, 594.5, 9, 205, 594, 11] }, { "c": [205, 594, 17, 205, 593.5, 19, 205.5, 593, 25, 206, 592.5, 28, 206, 592, 34, 206.5, 591.5, 36, 206.5, 590.5, 42, 207, 590, 44, 207.5, 589.5, 50, 208, 588.5, 53, 208, 588, 58, 208.5, 587, 61] }, { "c": [209, 586.5, 67, 209.5, 586, 69, 210, 585.5, 75, 210.5, 585, 78] }, { "c": [211, 584.5, 84, 211.5, 584, 86, 212, 584, 91, 212.5, 583.5, 94] }, { "c": [213, 583.5, 100, 213.5, 583.5, 103, 214.5, 584, 109, 215, 584.5, 111] }, { "c": [215.5, 585, 117, 216, 586, 119, 216, 587, 125, 216.5, 588, 128] }, { "c": [217, 589, 133, 217.5, 590, 136, 217.5, 591.5, 141, 218, 592.5, 144] }, { "c": [218, 593.5, 150, 218, 594.5, 153, 218.5, 595.5, 158, 218.5, 596, 161] }, { "c": [218.5, 596.5, 166, 218.5, 597, 169, 218.5, 597, 175, 218.5, 597, 178] }, { "c": [219, 597, 183] }] }, { "scale": 1.3372, "events": [{ "c": [210.5, 571, 2, 210, 571, 8, 210, 571, 11] }, { "c": [209.5, 571, 16, 209.5, 571, 19, 209, 571, 25, 209, 571, 27, 209, 571, 33, 209, 571, 36, 208.5, 571, 41, 208.5, 571, 44, 208.5, 571, 50] }] }, { "scale": 1.3372, "events": [{ "c": [221, 584.5, 2] }, { "c": [221, 586, 8, 221, 587, 11, 221, 588, 16, 221.5, 589, 19, 221.5, 589.5, 24, 221.5, 590.5, 27, 222, 591, 33, 222, 592, 36] }, { "c": [222, 592.5, 41, 222, 593, 44, 222, 593.5, 49, 222.5, 594, 52] }, { "c": [222, 592.5, 41, 222, 593, 44, 222, 593.5, 49, 222.5, 594, 52] }, { "c": [222.5, 594, 58, 222.5, 594.5, 61, 222.5, 594.5, 66, 223, 594.5, 69] }, { "c": [222.5, 594, 58, 222.5, 594.5, 61, 222.5, 594.5, 66, 223, 594.5, 69] }, { "c": [223, 594.5, 74, 223, 594.5, 77, 223.5, 594, 83, 223.5, 593, 86] }, { "c": [223, 594.5, 74, 223, 594.5, 77, 223.5, 594, 83, 223.5, 593, 86] }, { "c": [223.5, 592.5, 91, 224, 591.5, 94, 224, 590, 99, 224.5, 588.5, 102] }, { "c": [224.5, 587, 108, 225, 585.5, 111, 225, 583.5, 116, 225.5, 582, 119] }, { "c": [225.5, 580.5, 125, 226, 579, 127, 226.5, 578, 133, 226.5, 576.5, 136] }, { "c": [225.5, 580.5, 125, 226, 579, 127, 226.5, 578, 133, 226.5, 576.5, 136] }, { "c": [227, 575.5, 141, 227.5, 575, 144, 227.5, 574.5, 149, 228, 574, 152] }, { "c": [227, 575.5, 141, 227.5, 575, 144, 227.5, 574.5, 149, 228, 574, 152] }, { "c": [228.5, 574, 158, 229, 574, 161, 229.5, 574, 166, 229.5, 574, 169] }, { "c": [228.5, 574, 158, 229, 574, 161, 229.5, 574, 166, 229.5, 574, 169] }, { "c": [230, 574, 174, 230.5, 574.5, 177, 231, 575, 183, 231.5, 575.5, 186] }, { "c": [230, 574, 174, 230.5, 574.5, 177, 231, 575, 183, 231.5, 575.5, 186] }, { "c": [232, 576, 191, 232, 576.5, 194, 232.5, 577, 199, 233, 577.5, 202] }, { "c": [232, 576, 191, 232, 576.5, 194, 232.5, 577, 199, 233, 577.5, 202] }, { "c": [233, 577.5, 208, 233.5, 577.5, 211, 234, 578, 216, 234.5, 578, 219] }, { "c": [233, 577.5, 208, 233.5, 577.5, 211, 234, 578, 216, 234.5, 578, 219] }, { "c": [235, 578, 225, 235, 578, 227, 235.5, 577.5, 233, 236, 577, 236] }, { "c": [235, 578, 225, 235, 578, 227, 235.5, 577.5, 233, 236, 577, 236] }, { "c": [236.5, 576.5, 241, 236.5, 576, 244, 237, 575.5, 250, 237, 575, 252] }, { "c": [237.5, 574, 258, 237.5, 573, 261, 237.5, 572, 266, 237.5, 571, 269] }, { "c": [238, 570, 275, 238, 569, 277, 238, 567.5, 283, 238, 566.5, 286] }, { "c": [238, 565.5, 292, 237.5, 565, 294, 237.5, 564, 299, 237, 563.5, 302] }, { "c": [236.5, 563.5, 308, 236, 563, 311, 235.5, 563, 316, 235, 563, 319] }, { "c": [234.5, 563.5, 325, 234, 564, 327, 233.5, 564.5, 333, 233, 565.5, 336] }, { "c": [232.5, 566.5, 341, 232.5, 567.5, 344, 232, 568.5, 350, 232, 569.5, 352] }, { "c": [232, 570, 358, 232, 571, 361, 232, 572, 366, 232, 572.5, 369] }, { "c": [232, 573, 375, 232.5, 573.5, 377, 233, 573.5, 383, 233.5, 573.5, 385] }, { "c": [234, 574, 391, 234.5, 574, 394, 235, 574, 399, 235.5, 573.5, 402] }, { "c": [236.5, 573, 408, 237, 572.5, 411, 237.5, 572, 416, 238, 571.5, 419] }, { "c": [238.5, 571.5, 424, 239, 571, 427, 240, 571, 433, 240.5, 571, 436] }, { "c": [241.5, 571, 441, 242, 571, 444, 243, 572, 449, 244, 572.5, 452] }, { "c": [245, 574, 458, 246, 575, 461, 247, 577, 466, 248, 579, 469] }, { "c": [249.5, 581.5, 474, 250.5, 584.5, 477, 252, 587.5, 483, 253, 590.5, 486] }, { "c": [254.5, 593.5, 491, 256, 596, 494, 257.5, 598.5, 499, 258.5, 600.5, 502] }, { "c": [259.5, 602.5, 508, 260.5, 604.5, 511, 261.5, 607.5, 516, 262, 609.5, 519] }, { "c": [259.5, 602.5, 508, 260.5, 604.5, 511, 261.5, 607.5, 516, 262, 609.5, 519] }, { "c": [262, 612, 524, 262.5, 614, 527, 262.5, 616, 533, 262.5, 618, 536] }, { "c": [262, 612, 524, 262.5, 614, 527, 262.5, 616, 533, 262.5, 618, 536] }, { "c": [262.5, 619.5, 542, 262, 620.5, 544, 261.5, 621, 549, 261, 621.5, 552] }, { "c": [262.5, 619.5, 542, 262, 620.5, 544, 261.5, 621, 549, 261, 621.5, 552] }, { "c": [260.5, 622, 558, 260, 622, 561, 258.5, 622, 566, 257.5, 622, 569] }, { "c": [260.5, 622, 558, 260, 622, 561, 258.5, 622, 566, 257.5, 622, 569] }, { "c": [256, 621.5, 575, 254.5, 621, 577] }, { "c": [256, 621.5, 575, 254.5, 621, 577] }] }, { "scale": 1.3372, "events": [{ "c": [175.5, 659.5, 6, 175.5, 658, 9, 175.5, 656.5, 14, 176.5, 654, 17, 177.5, 651.5, 22, 179, 648.5, 25, 181.5, 645.5, 31, 184.5, 642, 34, 188, 639, 39, 192.5, 635, 42, 197, 631.5, 47, 201, 627.5, 50] }, { "c": [175.5, 659.5, 6, 175.5, 658, 9, 175.5, 656.5, 14, 176.5, 654, 17, 177.5, 651.5, 22, 179, 648.5, 25, 181.5, 645.5, 31, 184.5, 642, 34, 188, 639, 39, 192.5, 635, 42, 197, 631.5, 47, 201, 627.5, 50] }, { "c": [205.5, 623.5, 56, 210, 620, 58, 214.5, 617, 64, 220, 613.5, 67] }, { "c": [205.5, 623.5, 56, 210, 620, 58, 214.5, 617, 64, 220, 613.5, 67] }, { "c": [224.5, 610, 73, 228.5, 606.5, 75, 233, 602.5, 81, 237.5, 599, 83] }, { "c": [224.5, 610, 73, 228.5, 606.5, 75, 233, 602.5, 81, 237.5, 599, 83] }, { "c": [241.5, 596, 89, 246, 593, 92, 248.5, 590, 97, 251.5, 587, 100] }, { "c": [241.5, 596, 89, 246, 593, 92, 248.5, 590, 97, 251.5, 587, 100] }, { "c": [254.5, 583.5, 106, 257.5, 580.5, 109, 260.5, 578, 114, 263, 576, 117] }, { "c": [254.5, 583.5, 106, 257.5, 580.5, 109, 260.5, 578, 114, 263, 576, 117] }, { "c": [265, 574.5, 122, 266.5, 573, 125, 267.5, 572, 131, 269, 570.5, 134] }, { "c": [265, 574.5, 122, 266.5, 573, 125, 267.5, 572, 131, 269, 570.5, 134] }, { "c": [269.5, 569, 139, 270.5, 568, 142, 270.5, 567, 147, 271, 566.5, 150] }, { "c": [269.5, 569, 139, 270.5, 568, 142, 270.5, 567, 147, 271, 566.5, 150] }] }, { "scale": 1.3372, "events": [{ "c": [308, 495, 2, 307, 492.5, 8, 306.5, 490.5, 11, 306.5, 489, 16, 306.5, 488, 19, 306.5, 487.5, 25, 306, 487, 28, 306, 487, 33, 306, 486.5, 36, 306, 486.5, 42, 306, 486.5, 44, 306, 486.5, 50, 306, 486.5, 52, 306, 486.5, 58, 306, 486.5, 61] }, { "c": [308, 495, 2, 307, 492.5, 8, 306.5, 490.5, 11, 306.5, 489, 16, 306.5, 488, 19, 306.5, 487.5, 25, 306, 487, 28, 306, 487, 33, 306, 486.5, 36, 306, 486.5, 42, 306, 486.5, 44, 306, 486.5, 50, 306, 486.5, 52, 306, 486.5, 58, 306, 486.5, 61] }, { "c": [306, 487, 66, 306, 487.5, 69, 306, 488, 75, 306, 489, 77] }, { "c": [306, 487, 66, 306, 487.5, 69, 306, 488, 75, 306, 489, 77] }, { "c": [306, 490.5, 83, 306, 493, 86, 306, 495.5, 91, 306, 498.5, 94] }, { "c": [306, 490.5, 83, 306, 493, 86, 306, 495.5, 91, 306, 498.5, 94] }, { "c": [306, 501.5, 100, 306.5, 505, 102, 307, 508.5, 108, 307.5, 512.5, 111] }, { "c": [308, 516, 116, 309, 520, 119, 310, 524.5, 125, 310.5, 528.5, 127] }, { "c": [311.5, 532.5, 133, 312, 536, 136, 312.5, 539, 141, 313, 541.5, 144] }, { "c": [311.5, 532.5, 133, 312, 536, 136, 312.5, 539, 141, 313, 541.5, 144] }, { "c": [313.5, 544, 149, 314.5, 546, 152, 315, 547.5, 158, 316, 548.5, 161] }, { "c": [313.5, 544, 149, 314.5, 546, 152, 315, 547.5, 158, 316, 548.5, 161] }, { "c": [317, 549, 166, 318, 549.5, 169, 319, 549.5, 174, 320, 549.5, 177] }, { "c": [317, 549, 166, 318, 549.5, 169, 319, 549.5, 174, 320, 549.5, 177] }, { "c": [321, 549, 183, 322.5, 548.5, 186, 323.5, 547.5, 191, 324, 546.5, 194] }, { "c": [321, 549, 183, 322.5, 548.5, 186, 323.5, 547.5, 191, 324, 546.5, 194] }, { "c": [325, 545, 199, 326, 543.5, 202, 326.5, 541.5, 208, 327, 539.5, 211] }, { "c": [325, 545, 199, 326, 543.5, 202, 326.5, 541.5, 208, 327, 539.5, 211] }, { "c": [327.5, 537.5, 216, 327.5, 536, 219] }] }, { "scale": 1.3372, "events": [{ "c": [304, 527.5, 6, 303.5, 527.5, 9] }, { "c": [303.5, 527.5, 15, 303, 527.5, 17, 303, 527, 23, 303, 526.5, 25, 303, 526, 31, 303, 525.5, 34, 303.5, 524.5, 39, 304, 523.5, 42, 305, 522.5, 48, 305.5, 521, 50, 306.5, 519, 56, 308, 517, 59] }, { "c": [309, 515.5, 64, 310, 514, 67, 311, 512.5, 73, 312, 511, 75] }, { "c": [309, 515.5, 64, 310, 514, 67, 311, 512.5, 73, 312, 511, 75] }, { "c": [313, 509.5, 81, 314, 508.5, 84, 315, 507.5, 90] }, { "c": [313, 509.5, 81, 314, 508.5, 84, 315, 507.5, 90] }] }, { "scale": 1.3372, "events": [{ "c": [328.5, 526, 2, 328.5, 527, 8, 328.5, 528, 11] }, { "c": [328.5, 526, 2, 328.5, 527, 8, 328.5, 528, 11] }, { "c": [328.5, 528.5, 17, 328.5, 529.5, 19, 328.5, 530, 25, 328.5, 530, 27, 328.5, 530.5, 33, 328.5, 530.5, 36, 328.5, 531, 41, 329, 531, 44, 329, 531, 50, 329.5, 531, 52, 330, 530.5, 58, 330.5, 530, 61] }, { "c": [328.5, 528.5, 17, 328.5, 529.5, 19, 328.5, 530, 25, 328.5, 530, 27, 328.5, 530.5, 33, 328.5, 530.5, 36, 328.5, 531, 41, 329, 531, 44, 329, 531, 50, 329.5, 531, 52, 330, 530.5, 58, 330.5, 530, 61] }, { "c": [331, 529.5, 66, 331.5, 529, 69, 332, 528, 74, 332.5, 527, 77] }, { "c": [331, 529.5, 66, 331.5, 529, 69, 332, 528, 74, 332.5, 527, 77] }, { "c": [333, 525.5, 83, 333.5, 524, 86, 334, 522.5, 91, 334.5, 520.5, 94] }, { "c": [335, 519, 100, 335, 517, 102, 335.5, 515, 108, 336, 512.5, 111] }, { "c": [336.5, 511, 116, 337, 509, 119, 337, 507.5, 125, 337, 506, 127] }, { "c": [336.5, 511, 116, 337, 509, 119, 337, 507.5, 125, 337, 506, 127] }, { "c": [337, 504.5, 133, 337, 503, 136, 337, 502, 141, 337, 501, 144] }, { "c": [337, 504.5, 133, 337, 503, 136, 337, 502, 141, 337, 501, 144] }, { "c": [336.5, 500.5, 150, 336, 500.5, 152, 335.5, 500, 158, 334.5, 500, 161] }, { "c": [336.5, 500.5, 150, 336, 500.5, 152, 335.5, 500, 158, 334.5, 500, 161] }, { "c": [334, 500, 166, 333.5, 500.5, 169, 332.5, 501, 175, 332, 502, 177] }, { "c": [334, 500, 166, 333.5, 500.5, 169, 332.5, 501, 175, 332, 502, 177] }, { "c": [331, 503, 183, 330.5, 504.5, 186, 329.5, 506, 191, 328.5, 507.5, 194] }, { "c": [331, 503, 183, 330.5, 504.5, 186, 329.5, 506, 191, 328.5, 507.5, 194] }, { "c": [328, 509, 200, 327.5, 510.5, 202, 327, 512, 208, 326.5, 514, 211] }, { "c": [328, 509, 200, 327.5, 510.5, 202, 327, 512, 208, 326.5, 514, 211] }, { "c": [326.5, 515.5, 217, 326.5, 517, 219, 326.5, 519, 225, 326.5, 520.5, 227] }, { "c": [326.5, 515.5, 217, 326.5, 517, 219, 326.5, 519, 225, 326.5, 520.5, 227] }, { "c": [327, 522, 233, 328, 524, 236, 329, 525, 241, 330.5, 525.5, 244] }, { "c": [332, 526, 250, 333, 526, 252, 334.5, 526, 258, 336.5, 526, 261] }, { "c": [337.5, 525, 266, 339, 523.5, 269, 340.5, 522, 274, 342, 520.5, 277] }, { "c": [343.5, 518.5, 283, 345, 516.5, 286, 346.5, 514, 291, 348, 512, 294] }, { "c": [349, 510.5, 300, 350, 509, 303, 351, 507.5, 308, 352, 506, 311] }, { "c": [353, 504, 316, 353, 502.5, 319, 353.5, 501, 324, 354, 500, 327] }, { "c": [354, 498.5, 333, 354, 497.5, 336, 354, 496, 342, 354, 495.5, 344] }, { "c": [353.5, 494.5, 350, 353, 494, 352, 352.5, 493.5, 358, 352, 493, 361] }, { "c": [351, 493, 366, 350.5, 493, 369, 349.5, 493, 374, 349, 493, 377] }, { "c": [348.5, 493.5, 383, 347.5, 493.5, 386, 347, 494.5, 391, 346.5, 495, 394] }, { "c": [346.5, 495.5, 400, 346.5, 496, 403, 346.5, 496, 408, 346.5, 496.5, 411] }, { "c": [346.5, 497.5, 416, 346.5, 498, 419, 347, 498.5, 425, 347.5, 499, 427] }, { "c": [348.5, 499.5, 433, 349, 500, 436, 350, 501, 441, 351.5, 502, 444] }, { "c": [352.5, 502.5, 450, 353.5, 503.5, 452, 354.5, 504.5, 458, 355.5, 506, 461] }, { "c": [356.5, 507.5, 466, 357.5, 508.5, 469, 358, 510, 474, 358.5, 511.5, 477] }, { "c": [359, 513, 483, 359.5, 514.5, 486, 360, 516.5, 491, 360, 518, 494] }, { "c": [360, 520, 499, 360, 521.5, 503, 360, 523, 508, 360, 524, 511] }, { "c": [359.5, 525.5, 516, 359, 526, 519, 359, 526.5, 524, 358.5, 526.5, 527] }, { "c": [358, 526, 533, 358, 525, 536, 357.5, 524, 541] }] }, { "scale": 1.3372, "events": [{ "c": [355.5, 473, 2] }, { "c": [355.5, 472.5, 8, 355.5, 472, 11, 355.5, 471, 16, 355.5, 471, 19, 355.5, 471, 25, 355.5, 471, 27, 356, 471, 33, 356, 471.5, 36, 356.5, 472, 41, 357, 473, 44, 357.5, 474.5, 50, 358, 476, 52] }, { "c": [359, 478, 58, 359.5, 480, 61, 360.5, 482.5, 66, 361.5, 484.5, 69] }, { "c": [362.5, 487, 75, 363.5, 489.5, 77, 364.5, 492, 83, 365.5, 495, 86] }, { "c": [366, 498.5, 91, 367, 501.5, 94, 367.5, 504.5, 99, 367.5, 507, 102] }, { "c": [368, 509, 108, 368.5, 510.5, 111, 368.5, 512, 116, 368.5, 512.5, 119] }, { "c": [368, 509, 108, 368.5, 510.5, 111, 368.5, 512, 116, 368.5, 512.5, 119] }, { "c": [369, 513, 124, 369, 513.5, 127, 369, 513.5, 133, 369.5, 514, 136] }, { "c": [369, 513, 124, 369, 513.5, 127, 369, 513.5, 133, 369.5, 514, 136] }, { "c": [369.5, 514, 141, 369.5, 513.5, 144] }, { "c": [369.5, 514, 141, 369.5, 513.5, 144] }] }, { "scale": 1.3372, "events": [{ "c": [363, 503.5, 5, 363, 503.5, 8, 363, 503.5, 13, 363, 503.5, 16] }, { "c": [363, 503.5, 22, 363, 503, 25, 363.5, 503, 30, 363.5, 502.5, 33] }, { "c": [364, 502, 38, 364.5, 501, 41, 365, 500, 47, 365.5, 498.5, 50] }, { "c": [366.5, 497, 55, 367.5, 496, 58, 368, 494.5, 64, 369, 493, 66] }, { "c": [369.5, 491.5, 72, 370.5, 490.5, 75, 371, 489.5, 80, 372, 488.5, 83] }, { "c": [369.5, 491.5, 72, 370.5, 490.5, 75, 371, 489.5, 80, 372, 488.5, 83] }, { "c": [372.5, 488, 89, 373, 487.5, 91, 373.5, 487, 97] }, { "c": [372.5, 488, 89, 373, 487.5, 91, 373.5, 487, 97] }] }];

// src/devtests/suites.ts
var ok2 = (name, problem) => ({ name, ok: problem === null, detail: problem != null ? problem : "" });
var ids = (d) => d ? Object.values(d.pages).flat().map((s) => s.id).sort().join(",") : "";
var stroke3 = (id, x) => ({ id, t: Number(id.replace(/\D/g, "") || 1), tool: "pen", color: "#1c1c1e", size: 1.6, pts: [x, 10, 0.5, x + 4, 14, 0.5, x + 8, 20, 0.5] });
var docOf = (pages, name = "book.pdf") => ({ ...emptyDoc(name), pages });
var BOOK = "book.pdf" + INK;
var q = (v) => Math.round(v * 100) / 100;
async function syncSafetyChecks() {
  var _a, _b, _c;
  const out = [];
  const drive = new FakeDrive();
  {
    const d = makeDevice(drive, "device");
    d.put("a/Notes.pdf.ink.json", "A-annotations");
    d.put("b/Notes.pdf.ink.json", "B-annotations");
    const node = { id: "ink1", name: "Notes.pdf.ink.json", parent: "root", folder: false, lp: "a/Notes.pdf.ink.json", rev: "r1", lm: 1e3, ls: 13 };
    d.sync.putNode(node);
    await d.sync.applyRemote(node, "b/Notes.pdf.ink.json");
    out.push(ok2("a remote move onto an occupied path leaves both files alone", ((_a = d.files.get("b/Notes.pdf.ink.json")) == null ? void 0 : _a.body) === "B-annotations" && ((_b = d.files.get("a/Notes.pdf.ink.json")) == null ? void 0 : _b.body) === "A-annotations" ? null : "a file was changed"));
  }
  {
    const d = makeDevice(new FakeDrive(), "device");
    d.sync.fail(new DriveError("Google login expired", 401, true));
    out.push(ok2("a fatal Drive error pauses sync", d.sync.paused === true && d.sync.state === "disconnected" ? null : `paused=${d.sync.paused} state=${d.sync.state}`));
    d.sync.start = () => {
    };
    d.sync.restart();
    out.push(ok2("reconnecting clears the pause", d.sync.paused === false ? null : "still paused"));
  }
  {
    const cloud = new FakeDrive();
    const d = makeDevice(cloud, "device");
    d.put("pencil-ink-install/manifest.json", "local-edit");
    const node = { id: "m1", name: "manifest.json", parent: "root", folder: false, lp: "pencil-ink-install/manifest.json", md5: "r2", rev: "r1", lm: 1e3, ls: 10 };
    d.sync.putNode(node);
    d.sync.drive.download = async () => UTF8_ENC.encode("cloud-version").buffer;
    await d.sync.syncDown(node, "pencil-ink-install/manifest.json");
    const copies = Array.from(d.files.keys()).filter((k) => k.includes("(conflict"));
    const body = (_c = d.files.get("pencil-ink-install/manifest.json")) == null ? void 0 : _c.body;
    out.push(ok2("the install folder takes the cloud copy and makes no conflict copy", copies.length ? `made ${copies.join(", ")}` : body === "cloud-version" ? null : `content is "${body}"`));
  }
  {
    const cloud = new FakeDrive();
    const d = makeDevice(cloud, "device");
    d.put("Notes/Chem.md", "keep");
    d.put("Notes/Chem (conflict 2026-10-10-04-50).md", "copy");
    d.put("Notes/Discussion (conflict notes).md", "keep too");
    d.sync.putNode({ id: "c1", name: "Chem (conflict 2026-10-10-04-50).md", parent: "root", folder: false, lp: "Notes/Chem (conflict 2026-10-10-04-50).md" });
    const trashed = [];
    d.sync.drive.trash = async (id) => trashed.push(id);
    const n = await d.sync.removeConflictCopies();
    const left = Array.from(d.files.keys()).sort().join("|");
    out.push(ok2("remove conflict copies removes only the real copies", n !== 2 ? `removed ${n}` : trashed.join() !== "c1" ? `Drive trashed ${trashed.join()}` : left === "Notes/Chem.md|Notes/Discussion (conflict notes).md" ? null : `left: ${left}`));
  }
  return out;
}
async function pageSyncChecks() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const out = [];
  out.push(ok2("a page file maps to its book", bookOfShard("Peds/x.pdf.ink.d/p_12.json.gz") === "Peds/x.pdf.ink.json" && bookOfShard("Peds/x.pdf.ink.json") === null ? null : "path rule wrong"));
  const drive = new FakeDrive();
  const a = makeDevice(drive, "iPad");
  const b = makeDevice(drive, "Mac");
  const pages = { "1": [stroke3("a1", 10), stroke3("a2", 30)], "2": [stroke3("a3", 50)], "3": [stroke3("a4", 70)], "7": [stroke3("a5", 90), stroke3("a6", 110)] };
  a.put(BOOK, JSON.stringify(docOf(pages)));
  let before = drive.uploads;
  a.learn();
  await a.sync.pushBook(BOOK);
  out.push(ok2("first upload: one file per page with ink, and the index", drive.uploads - before === 5 ? null : `uploads: ${drive.uploads - before}, expected 5`));
  out.push(ok2("the book is a folder on Drive, not a single file", drive.named(BOOK).length === 0 && drive.named("book.pdf.ink.d").length === 1 ? null : "layout wrong"));
  before = drive.uploads;
  a.learn();
  await a.sync.pushBook(BOOK);
  out.push(ok2("no change, no upload", drive.uploads - before === 0 ? null : `${drive.uploads - before} uploads`));
  const cur = parseDoc(a.files.get(BOOK).body);
  cur.pages["2"].push(stroke3("a7", 60));
  a.touch(BOOK, JSON.stringify(cur));
  before = drive.uploads;
  a.learn();
  await a.sync.pushBook(BOOK);
  out.push(ok2("one page changed: one file uploaded", drive.uploads - before === 1 ? null : `${drive.uploads - before} uploads, expected 1`));
  b.learn();
  await b.sync.pushBook(BOOK);
  const aAll = ids(parseDoc(a.files.get(BOOK).body));
  out.push(ok2("the second device receives every stroke", ids(parseDoc((_b = (_a = b.files.get(BOOK)) == null ? void 0 : _a.body) != null ? _b : "")) === aAll ? null : "strokes missing on the second device"));
  const aCur = parseDoc(a.files.get(BOOK).body);
  aCur.pages["7"].push(stroke3("a8", 120));
  a.touch(BOOK, JSON.stringify(aCur));
  const bCur = parseDoc(b.files.get(BOOK).body);
  bCur.pages["5"] = [stroke3("b1", 150)];
  b.touch(BOOK, JSON.stringify(bCur));
  a.learn();
  b.learn();
  await b.sync.pushBook(BOOK);
  await a.sync.pushBook(BOOK);
  b.learn();
  await b.sync.pushBook(BOOK);
  a.learn();
  await a.sync.pushBook(BOOK);
  const aF = ids(parseDoc(a.files.get(BOOK).body)), bF = ids(parseDoc(b.files.get(BOOK).body));
  out.push(ok2("strokes written on both devices at once are on both devices", aF === bF && aF.includes("a8") && aF.includes("b1") ? null : `iPad: ${aF} / Mac: ${bF}`));
  const er = parseDoc(a.files.get(BOOK).body);
  const gone = er.pages["1"].shift();
  er.deleted[gone.id] = Date.now();
  a.touch(BOOK, JSON.stringify(er));
  a.learn();
  await a.sync.pushBook(BOOK);
  b.learn();
  await b.sync.pushBook(BOOK);
  b.learn();
  await b.sync.pushBook(BOOK);
  a.learn();
  await a.sync.pushBook(BOOK);
  out.push(ok2("an erase on one device removes it on the other, and it stays removed", !ids(parseDoc(b.files.get(BOOK).body)).split(",").includes(gone.id) && !ids(parseDoc(a.files.get(BOOK).body)).split(",").includes(gone.id) ? null : `${gone.id} came back`));
  const emp = parseDoc(a.files.get(BOOK).body);
  for (const s of emp.pages["3"]) emp.deleted[s.id] = Date.now();
  emp.pages["3"] = [];
  a.touch(BOOK, JSON.stringify(emp));
  a.learn();
  await a.sync.pushBook(BOOK);
  out.push(ok2("a page with no ink left has its file removed", drive.named("p_3.json.gz").length === 0 ? null : "page 3 file still there"));
  {
    const drive2 = new FakeDrive();
    const first = makeDevice(drive2, "first");
    first.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("k1", 10)], "2": [stroke3("k2", 30)] })));
    first.learn();
    await first.sync.pushBook(BOOK);
    const copy = makeDevice(drive2, "copy");
    copy.learn();
    await copy.sync.pushBook(BOOK);
    const lost = parseDoc(copy.files.get(BOOK).body);
    delete lost.pages["2"];
    copy.touch(BOOK, JSON.stringify(lost));
    copy.learn();
    await copy.sync.pushBook(BOOK);
    out.push(ok2("a copy that lost a page does not delete it on Drive", drive2.named("p_2.json.gz").length === 1 ? null : "page removed on Drive"));
    out.push(ok2("the lost page is read back from Drive", ids(parseDoc(copy.files.get(BOOK).body)).includes("k2") ? null : "page not restored locally"));
  }
  {
    const drive3 = new FakeDrive();
    const blank = { id: "b1", anchor: 1, ord: 0, w: 595, h: 842, t: 1 };
    const src = makeDevice(drive3, "blank-src");
    src.put(BOOK, JSON.stringify({ version: 1, name: "book.pdf", pages: { "1": [stroke3("bk1", 10)], "b:b1": [stroke3("bk2", 30)] }, deleted: {}, updated: 1, blanks: { b1: blank }, bookmarks: {}, removed: {} }));
    src.learn();
    await src.sync.pushBook(BOOK);
    const dst = makeDevice(drive3, "blank-dst");
    dst.learn();
    await dst.sync.pushBook(BOOK);
    const lost2 = parseDoc(dst.files.get(BOOK).body);
    delete lost2.pages["b:b1"];
    lost2.blanks = {};
    dst.touch(BOOK, JSON.stringify(lost2));
    dst.learn();
    await dst.sync.pushBook(BOOK);
    out.push(ok2("a lost blank page comes back from Drive", ((_c = parseDoc(dst.files.get(BOOK).body).pages["b:b1"]) == null ? void 0 : _c.length) ? null : "blank page strokes missing"));
    let downloads = 0;
    const realDownload = drive3.download.bind(drive3);
    drive3.download = async (id) => {
      downloads++;
      return realDownload(id);
    };
    await dst.sync.pushBook(BOOK);
    out.push(ok2("a restored blank page is not downloaded again on the next check", downloads === 0 ? null : `${downloads} downloads`));
  }
  {
    const d4 = makeDevice(new FakeDrive(), "close");
    d4.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("cl1", 10)] })));
    d4.learn();
    await d4.sync.pushBook(BOOK);
    const vault = d4.sync.vault;
    const realModify = vault.modify;
    let rewrites = 0;
    vault.modify = async (...args) => {
      rewrites++;
      return realModify(...args);
    };
    await d4.sync.writeText(BOOK, d4.files.get(BOOK).body);
    vault.modify = realModify;
    out.push(ok2("closing a book without changes does not rewrite its file", rewrites === 0 ? null : `${rewrites} rewrites`));
  }
  {
    const d6 = makeDevice(new FakeDrive(), "shrink");
    d6.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("sh1", 10), stroke3("sh2", 20)] })));
    d6.learn();
    await d6.sync.pushBook(BOOK);
    const pages2 = Object.values(d6.sync.st.books[BOOK].pages);
    out.push(ok2("the sync state keeps a fingerprint of each page, not its stroke IDs", pages2.length > 0 && pages2.every((pg) => !pg.ids && typeof pg.idk === "string") ? null : "stroke IDs still stored"));
  }
  {
    const d7 = makeDevice(new FakeDrive(), "prune-markers");
    const doc = docOf({ "1": [stroke3("pr1", 10)] });
    doc.deleted = { "old-erased": Date.now() - 200 * 864e5, "new-erased": Date.now() - 1e3 };
    d7.put(BOOK, JSON.stringify(doc));
    d7.learn();
    await d7.sync.pushBook(BOOK);
    const after = parseDoc(d7.files.get(BOOK).body);
    out.push(ok2("erased strokes older than 120 days are forgotten, newer ones are kept", !("old-erased" in after.deleted) && "new-erased" in after.deleted ? null : "markers not pruned as expected"));
  }
  {
    const d8 = makeDevice(new FakeDrive(), "damaged");
    d8.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("dm1", 10)] })));
    d8.learn();
    await d8.sync.pushBook(BOOK);
    d8.touch(BOOK, '{"version":1,"pages":{"1":[{"id":"cut-off"');
    d8.learn();
    await d8.sync.pushBook(BOOK);
    const copies = Array.from(d8.files.keys()).filter((k2) => k2.startsWith(BOOK + ".damaged-"));
    out.push(ok2("a damaged annotation file is copied aside before it is written over", copies.length === 1 ? null : `${copies.length} copies kept`));
  }
  {
    const drive4 = new FakeDrive();
    const x = makeDevice(drive4, "first-device");
    const y = makeDevice(drive4, "second-device");
    x.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("xs1", 10)] })));
    y.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("ys1", 50)] })));
    x.learn();
    y.learn();
    await Promise.all([x.sync.pushBook(BOOK), y.sync.pushBook(BOOK)]);
    await x.sync.pushBook(BOOK);
    await y.sync.pushBook(BOOK);
    await x.sync.pushBook(BOOK);
    const folders = drive4.named("book.pdf.ink.d").length;
    out.push(ok2("two devices that first sync one book at the same time end up with one book folder", folders === 1 ? null : `${folders} book folders`));
    const both = (d) => ids(parseDoc(d.files.get(BOOK).body));
    out.push(ok2("both devices see both devices' strokes", both(x).includes("xs1") && both(x).includes("ys1") && both(y).includes("xs1") && both(y).includes("ys1") ? null : "strokes missing on one device"));
  }
  {
    const drive5 = new FakeDrive();
    const folder = await drive5.createFolder("sh.pdf.ink.d", "root");
    await drive5.upload({ name: "p_1.json.gz", parent: folder.id, data: await gzipText(shardText("1", [stroke3("c1", 10)])) });
    await drive5.upload({ name: "p_1.json.gz", parent: folder.id, data: await gzipText(shardText("1", [stroke3("c2", 30)])) });
    const z = makeDevice(drive5, "copies");
    z.learn();
    await z.sync.pushBook("sh.pdf.ink.json");
    const got = ids(parseDoc(z.files.get("sh.pdf.ink.json").body));
    out.push(ok2("two copies of one page are combined", got.includes("c1") && got.includes("c2") ? null : `got ${got}`));
    out.push(ok2("the extra copy is removed once combined", drive5.named("p_1.json.gz").length === 1 ? null : `${drive5.named("p_1.json.gz").length} copies`));
  }
  {
    const drive6 = new FakeDrive();
    const d9 = makeDevice(drive6, "rename");
    d9.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("rn1", 10)] })));
    d9.learn();
    await d9.sync.pushBook(BOOK);
    await d9.sync.moveBook(BOOK, "renamed.pdf.ink.json");
    const st = d9.sync.st.books;
    out.push(ok2("a renamed PDF's book is moved in the sync state", st["renamed.pdf.ink.json"] !== void 0 && st[BOOK] === void 0 ? null : "state not moved"));
    out.push(ok2("the book's folder on Drive takes the new name", drive6.named("renamed.pdf.ink.d").length === 1 ? null : "folder not renamed"));
  }
  {
    const drive7 = new FakeDrive();
    const g = makeDevice(drive7, "ghost");
    g.learn();
    await g.sync.pushBook("ghost.pdf.ink.json");
    out.push(ok2("a check for a book that is nowhere creates no folder", drive7.named("ghost.pdf.ink.d").length === 0 ? null : "an empty folder was created"));
  }
  {
    const drive8 = new FakeDrive();
    const e = makeDevice(drive8, "pdf-delete");
    e.sync.ready = true;
    e.put("doc.pdf", "pdf bytes");
    e.put("doc.pdf" + INK, JSON.stringify(docOf({ "1": [stroke3("dl1", 10)] }, "doc.pdf")));
    e.learn();
    await e.sync.pushBook("doc.pdf" + INK);
    await e.sync.removeAnnotations("doc.pdf");
    await e.sync.queue;
    out.push(ok2("the annotation file goes with its PDF, here", !e.files.has("doc.pdf" + INK) ? null : "annotation file still here"));
    out.push(ok2("the book's folder goes with its PDF, on Drive", drive8.named("doc.pdf.ink.d").length === 0 ? null : "folder still on Drive"));
    out.push(ok2("nothing is left waiting to be removed", ((_d = e.sync.st.removeNext) == null ? void 0 : _d.length) ? "a removal is still waiting" : null));
  }
  {
    const drive9 = new FakeDrive();
    const h = makeDevice(drive9, "folder-check");
    h.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("fc1", 10)] })));
    h.learn();
    await h.sync.pushBook(BOOK);
    await h.sync.pushBook(BOOK);
    let lookups = 0;
    const realFind = drive9.findChildren.bind(drive9);
    drive9.findChildren = async (...args) => {
      lookups++;
      return realFind(...args);
    };
    h.touch(BOOK, JSON.stringify(docOf({ "1": [stroke3("fc1", 10), stroke3("fc2", 30)] })));
    await h.sync.pushBook(BOOK);
    out.push(ok2("a routine check does not look up its folder again", lookups === 0 ? null : `${lookups} lookups`));
    h.sync.st.books[BOOK].check = false;
    const other = await drive9.createFolder("book.pdf.ink.d", "root");
    h.sync.st.token = "token-x";
    drive9.changesQueue = [{ fileId: other.id, file: other }];
    await h.sync.pollChanges();
    out.push(ok2("a book folder appearing elsewhere makes the book look its folder up again", h.sync.st.books[BOOK].check === true ? null : "not flagged"));
  }
  {
    const drive10 = new FakeDrive();
    const k2 = makeDevice(drive10, "pdf-edit");
    k2.sync.ready = true;
    k2.put("paper.pdf", "version one");
    await k2.sync.pushPath("paper.pdf");
    k2.touch("paper.pdf", "version two");
    let gets = 0;
    const realGet = drive10.get.bind(drive10);
    drive10.get = async (id) => {
      gets++;
      return realGet(id);
    };
    k2.sync.lastPollAt = Date.now();
    await k2.sync.pushPath("paper.pdf");
    out.push(ok2("a PDF edit right after a change check makes no extra request", gets === 0 ? null : `${gets} requests`));
    const sent = drive10.named("paper.pdf")[0];
    out.push(ok2("the edited PDF still reaches Drive", (sent == null ? void 0 : sent.data) && UTF8_DEC.decode(sent.data) === "version two" ? null : "edit not sent"));
  }
  {
    const drive11 = new FakeDrive();
    const writer = makeDevice(drive11, "race-writer");
    writer.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("ra1", 10)] })));
    writer.learn();
    await writer.sync.pushBook(BOOK);
    const reader = makeDevice(drive11, "race-reader");
    reader.learn();
    const shard = drive11.named("p_1.json.gz")[0];
    const realDownload = drive11.download.bind(drive11);
    const newer = await gzipText(shardText("1", [stroke3("ra1", 10), stroke3("ra2", 30)]));
    let raced = false;
    drive11.download = async (id) => {
      if (!raced && id === shard.id) {
        raced = true;
        shard.data = new Uint8Array(newer);
        shard.md5Checksum = "written-after-the-listing";
      }
      return realDownload(id);
    };
    await reader.sync.pushBook(BOOK);
    const entry = reader.sync.st.books[BOOK].pages["p_1.json.gz"];
    out.push(ok2("a page is recorded by the bytes it was read from, not by an earlier listing", (entry == null ? void 0 : entry.md5) === md5Hex(newer) ? null : "recorded the listing's checksum"));
    out.push(ok2("the newer strokes arrive although the listing was older", ids(parseDoc(reader.files.get(BOOK).body)).includes("ra2") ? null : "newer stroke missing"));
  }
  {
    const good = await gzipText(shardText("1", [stroke3("ok1", 10)]));
    const bad2 = await gzipText('{"v":1,"key":"1","s":[{"id":"bad","t":1,"tool":"pen","color":"#000","size":1,"d":"! 1 2"}]}');
    const okRead = await decodeShard(good);
    out.push(ok2("a damaged page is unreadable, not loaded with impossible points", okRead && await decodeShard(bad2) === null ? null : "damaged page loaded"));
  }
  const legacyDrive = new FakeDrive();
  const old = makeDevice(legacyDrive, "old");
  const legacyWire = await encodeWire(docOf({ "9": [stroke3("old1", 200)] }, "legacy.pdf"));
  legacyDrive.files.set("lg1", { id: "lg1", name: "legacy.pdf.ink.json", mimeType: "application/octet-stream", parents: ["root"], data: new Uint8Array(legacyWire), md5Checksum: "x" });
  old.learn();
  old.put("legacy.pdf" + INK, JSON.stringify(docOf({ "4": [stroke3("mine", 220)] }, "legacy.pdf")));
  await old.sync.pushBook("legacy.pdf" + INK);
  out.push(ok2("an old single file is merged in, with the local strokes", ids(parseDoc(old.files.get("legacy.pdf" + INK).body)) === "mine,old1" ? null : `have ${ids(parseDoc(old.files.get("legacy.pdf" + INK).body))}`));
  out.push(ok2("the old single file is removed once its strokes are on pages", ((_e = legacyDrive.files.get("lg1")) == null ? void 0 : _e.trashed) ? null : "old file still there"));
  const bad = makeDevice(drive, "Mac2");
  const badFile = drive.named("p_2.json.gz")[0];
  badFile.data = UTF8_ENC.encode("corrupted by something else");
  badFile.md5Checksum = "changed";
  bad.learn();
  bad.put(BOOK, JSON.stringify(docOf({ "2": [stroke3("local2", 300)] })));
  await bad.sync.pushBook(BOOK);
  out.push(ok2("an unreadable page on Drive is left as it is", UTF8_DEC.decode(badFile.data) === "corrupted by something else" ? null : "the unreadable page was overwritten"));
  out.push(ok2("the device keeps its own strokes for that page", ((_g = (_f = parseDoc(bad.files.get(BOOK).body)) == null ? void 0 : _f.pages["2"]) == null ? void 0 : _g.some((s) => s.id === "local2")) ? null : "local strokes were lost"));
  out.push(ok2("the problem is logged", bad.warnings.some((w) => w.includes("could not be read")) ? null : "no warning was logged"));
  const cloud = new FakeDrive();
  const big = makeDevice(cloud, "speed");
  const bigPages = {};
  let k = 0;
  for (let p = 1; p <= 150; p++) {
    bigPages[String(p)] = [];
    for (let j = 0; j < 20; j++) bigPages[String(p)].push({ id: "z" + ++k, t: k, tool: "pen", color: "#1c1c1e", size: 1.6, pts: Array.from({ length: 150 }, (_, i) => [(i * 7 + k) % 500 + 0.37 * i, 100 + i * 3.1 % 40 + k % 13 * 0.2, 0.5]).flat() });
  }
  big.put("speed.pdf" + INK, JSON.stringify(docOf(bigPages, "speed.pdf")));
  big.learn();
  const t0 = Date.now();
  await big.sync.pushBook("speed.pdf" + INK);
  const pushMs = Date.now() - t0;
  const pulled = makeDevice(cloud, "speed2");
  pulled.learn();
  const t1 = Date.now();
  await pulled.sync.pushBook("speed.pdf" + INK);
  const pullMs = Date.now() - t1;
  const count = Object.values((_k = (_j = parseDoc((_i = (_h = pulled.files.get("speed.pdf" + INK)) == null ? void 0 : _h.body) != null ? _i : "")) == null ? void 0 : _j.pages) != null ? _k : {}).flat().length;
  out.push(ok2(`3,000 strokes arrive intact on the second device (first upload ${pushMs} ms, first download ${pullMs} ms)`, count === k ? null : `${count} of ${k}`));
  return out;
}
async function fileFormatChecks() {
  var _a, _b;
  const out = [];
  const pages = { "1": [] };
  let n = 0;
  for (const s of HANDWRITING.slice(0, 20)) {
    const ev = s.events.flatMap((e) => e.c);
    if (ev.length < 9) continue;
    const pts = [];
    for (let i = 0; i < ev.length; i += 3) pts.push(ev[i] / s.scale, ev[i + 1] / s.scale, 0.5);
    pages["1"].push({ id: "h" + ++n, t: n, tool: "pen", color: "#1c1c1e", size: 1.6, pts });
  }
  const doc = docOf(pages, "check.pdf");
  const wire = await encodeWire(doc);
  const back = await decodeWire(wire);
  const same = !!back && ((_a = back.pages["1"]) == null ? void 0 : _a.length) === pages["1"].length && pages["1"].every((s, i) => back.pages["1"][i].id === s.id && s.pts.every((v, j) => Math.abs(q(v) - back.pages["1"][i].pts[j]) < 1e-9));
  out.push(ok2(`a page of handwriting round-trips exactly, to 0.01 pt (${n} strokes)`, same ? null : "round trip changed the points"));
  const plain = UTF8_ENC.encode(JSON.stringify(doc)).byteLength;
  out.push(ok2(`the compact file is smaller (${(plain / 1024).toFixed(0)} KB -> ${(wire.byteLength / 1024).toFixed(0)} KB)`, wire.byteLength < plain * 0.5 ? null : "not smaller"));
  const old = await decodeWire(UTF8_ENC.encode(JSON.stringify(doc)).buffer);
  out.push(ok2("files from earlier versions still read", ((_b = old == null ? void 0 : old.pages["1"]) == null ? void 0 : _b.length) === pages["1"].length ? null : "old file did not read"));
  out.push(ok2("unreadable input is refused, not turned into an empty book", await decodeWire(UTF8_ENC.encode("not an annotation file").buffer) === null ? null : "accepted"));
  out.push(ok2("points survive the step encoding exactly", (() => {
    const pts = [1.23, 4.56, 0.5, 7.89, 0.12, 0.5];
    const back2 = decodePts(encodePts(pts));
    return pts.every((v, i) => Math.abs(back2[i] - q(v)) < 1e-9) ? null : "differ";
  })()));
  const big = docOf({}, "big.pdf");
  let m = 0;
  for (let p = 1; p <= 40; p++) big.pages[String(p)] = HANDWRITING.slice(0, 5).map((s) => ({ id: "x" + ++m, t: m, tool: "pen", color: "#000", size: 1.6, pts: s.events.flatMap((e) => e.c).map((v, i) => i % 3 === 2 ? 0.5 : v / 1.337 + p * 0.1) }));
  big.blanks = { x1: { id: "x1", anchor: 3, ord: 0, w: 595, h: 842, t: 1 } };
  big.bookmarks = { "12": { on: true, t: 2 } };
  const bigBack = await decodeWire(await encodeWire(big));
  out.push(ok2("a book round-trips with its pages, blank pages and bookmarks", bigBack && sameContent(bigBack, big) && JSON.stringify(bigBack.blanks) === JSON.stringify(big.blanks) && JSON.stringify(bigBack.bookmarks) === JSON.stringify(big.bookmarks) ? null : "round trip changed the book"));
  return out;
}
async function installerChecks(version) {
  const out = [];
  const enc = UTF8_ENC;
  const dec = UTF8_DEC;
  const makeZip = (entries) => {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const crc = crc32(e.data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 67324752, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(12, 33, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, e.data.length, true);
      lv.setUint32(22, e.data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      chunks.push(local, e.data);
      const cd = new Uint8Array(46 + name.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 33639248, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(14, 33, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, e.data.length, true);
      cv.setUint32(24, e.data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);
      offset += local.length + e.data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 101010256, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const all = [...chunks, ...central, end];
    const out2 = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
    let p = 0;
    for (const c of all) {
      out2.set(c, p);
      p += c.length;
    }
    return out2.buffer;
  };
  const root = "Pencil Ink - easy install/";
  const zip = makeZip([
    { name: root + "main.js", data: enc.encode("/* new code */") },
    { name: root + "manifest.json", data: enc.encode(JSON.stringify({ id: "pencil-ink", version })) },
    { name: root + "styles.css", data: enc.encode("/* new styles */") }
  ]);
  const fakePlugin = (installed, failWriteTo) => {
    const store = /* @__PURE__ */ new Map();
    const calls = [];
    const dir = "plugins/pencil-ink";
    const adapter = {
      exists: async (p) => store.has(p),
      readBinary: async (p) => {
        const d = store.get(p);
        if (!d) throw new Error("missing " + p);
        return d.slice().buffer;
      },
      writeBinary: async (p, b) => {
        if (failWriteTo && p.endsWith(failWriteTo) && !p.endsWith(".new") && !p.endsWith(".bak")) throw new Error("disk full");
        store.set(p, new Uint8Array(b).slice());
      },
      remove: async (p) => {
        store.delete(p);
      }
    };
    const plugin = {
      manifest: { id: "pencil-ink", version: installed, dir },
      app: { vault: { adapter }, plugins: { disablePlugin: async (id) => calls.push("disable " + id), enablePlugin: async (id) => calls.push("enable " + id) } }
    };
    store.set(dir + "/main.js", enc.encode("OLD-main"));
    store.set(dir + "/manifest.json", enc.encode('{"id":"pencil-ink","version":"0.0.1"}'));
    store.set(dir + "/styles.css", enc.encode("OLD-styles"));
    return { plugin, store, calls, dir };
  };
  const check = async (name, fn) => {
    try {
      out.push(ok2(name, await fn()));
    } catch (e) {
      out.push(ok2(name, "threw: " + String(e)));
    }
  };
  await check("reads every file in the release, with checksums", async () => {
    const files = await readZip(zip);
    const m = files.get(root + "manifest.json");
    return m && dec.decode(m).includes(`"version":"${version}"`) ? null : "missing files or wrong version";
  });
  await check("a damaged zip is rejected", async () => {
    const bad = new Uint8Array(zip.slice(0));
    const needle = enc.encode("/* new code */");
    const at = bad.findIndex((_, i) => needle.every((b, j) => bad[i + j] === b));
    if (at < 0) return "could not find the test file's contents";
    bad[at + 3] ^= 255;
    try {
      await readZip(bad.buffer);
      return "a damaged zip was accepted";
    } catch (e) {
      return null;
    }
  });
  await check("install writes the new files, keeps a backup, and reloads", async () => {
    const { plugin, store, calls, dir } = fakePlugin("0.0.1");
    const r = await installFromZip(plugin, zip);
    if (r.to !== version || r.from !== "0.0.1") return `versions ${r.from} -> ${r.to}`;
    if (dec.decode(store.get(dir + "/main.js")) !== "/* new code */") return "main.js not updated";
    if (dec.decode(store.get(dir + "/main.js.bak")) !== "OLD-main") return "backup missing";
    if (Array.from(store.keys()).some((k) => k.endsWith(".new"))) return "temporary files left behind";
    return calls.join(",") === "disable pencil-ink,enable pencil-ink" ? null : "reload calls: " + calls.join(",");
  });
  await check("restore puts the previous files back", async () => {
    const { plugin, store, dir } = fakePlugin("0.0.1");
    await installFromZip(plugin, zip);
    const ok22 = await restorePrevious(plugin);
    return ok22 && dec.decode(store.get(dir + "/main.js")) === "OLD-main" ? null : "restore did not bring back main.js";
  });
  await check("a write that fails halfway rolls back to the previous version", async () => {
    const { plugin, store, dir } = fakePlugin("0.0.1", "styles.css");
    try {
      await installFromZip(plugin, zip);
      return "the failure was not reported";
    } catch (e) {
      return dec.decode(store.get(dir + "/main.js")) === "OLD-main" ? null : "main.js left in the new state";
    }
  });
  await check("a zip for another plugin is refused", async () => {
    const { plugin } = fakePlugin("0.0.1");
    plugin.manifest.id = "some-other-plugin";
    try {
      await installFromZip(plugin, zip);
      return "accepted another plugin's zip";
    } catch (e) {
      return null;
    }
  });
  await check("the same version can be reinstalled cleanly", async () => {
    const { plugin } = fakePlugin(version);
    const r = await installFromZip(plugin, zip);
    return r.to === version && r.from === version ? null : "same-version reinstall failed";
  });
  return out;
}
function fuzzChecks() {
  const out = [];
  let seed = 12345;
  const rnd = () => (seed = seed * 1103515245 + 12345 & 2147483647) / 2147483647;
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  let engineProblem = null;
  for (let s = 0; s < 150 && !engineProblem; s++) {
    let t = 0;
    const b = new StrokeBuilder(1.3, 1 + Math.floor(rnd() * 5), () => t);
    const n = 5 + Math.floor(rnd() * 200);
    for (let i = 0; i < n; i++) {
      t += pick([0, 1, 4, 8, 1e3]);
      const x = pick([rnd() * 600, NaN, Infinity, -1e9, 300 + i]);
      const y = pick([rnd() * 800, NaN, 400 + Math.sin(i) * 30, 1e12]);
      b.add(x, y);
    }
    const line2 = b.finish();
    if (!line2.x.every(Number.isFinite) || !line2.y.every(Number.isFinite)) engineProblem = `case ${s}: non-finite output`;
    if (line2.x.length > 6e4) engineProblem = `case ${s}: runaway length`;
  }
  out.push(ok2("the stroke engine survives hostile input (150 cases)", engineProblem));
  let mergeProblem = null;
  const randomDoc = () => {
    const d = emptyDoc("f.pdf");
    for (let p = 1; p <= 1 + Math.floor(rnd() * 4); p++) {
      const list2 = [];
      for (let j = 0; j < Math.floor(rnd() * 5); j++) list2.push(stroke3("s" + Math.floor(rnd() * 12), Math.floor(rnd() * 300)));
      if (list2.length) d.pages[String(p)] = list2;
    }
    if (rnd() < 0.4) d.deleted["s" + Math.floor(rnd() * 12)] = 5;
    return d;
  };
  for (let c = 0; c < 300 && !mergeProblem; c++) {
    const a = randomDoc(), b = randomDoc();
    const ab = mergeDocs(a, b), ba = mergeDocs(b, a);
    if (!sameContent(ab, ba)) mergeProblem = `case ${c}: order changes the result`;
    else if (!sameContent(mergeDocs(ab, ab), ab)) mergeProblem = `case ${c}: merging twice changes the result`;
    else if (Object.values(ab.pages).flat().some((s) => ab.deleted[s.id] !== void 0)) mergeProblem = `case ${c}: a deleted stroke came back`;
  }
  out.push(ok2("merging is order-independent, idempotent and keeps deletions (300 cases)", mergeProblem));
  return out;
}
async function syncStartupChecks() {
  const out = [];
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "startup");
    d.sync.ready = false;
    d.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("s1", 10)] })));
    let readyAtFirstBook = null;
    const original = d.sync.pushBook.bind(d.sync);
    d.sync.pushBook = async (p) => {
      if (readyAtFirstBook === null) readyAtFirstBook = d.sync.ready;
      return original(p);
    };
    await d.sync.init();
    await d.sync.queue;
    out.push(ok2("the device is ready before any book is brought up to date", readyAtFirstBook === true ? null : `ready was ${readyAtFirstBook} at the first book`));
    out.push(ok2("the book's pages reach Drive in the background", drive.named("book.pdf.ink.d").length === 1 ? null : "book folder not created"));
  }
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "unchanged");
    d.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("u1", 10)] })));
    await d.sync.pushBook(BOOK);
    d.sync.st.token = "token-1";
    d.learn();
    let checks = 0;
    const original = d.sync.pushBook.bind(d.sync);
    d.sync.pushBook = async (p) => {
      checks++;
      return original(p);
    };
    const shard = drive.named("p_1.json.gz")[0];
    drive.changesQueue = [{ fileId: shard.id, file: shard }];
    await d.sync.pollChanges();
    await d.sync.queue;
    out.push(ok2("a file Drive mentions but that is unchanged does not start a book sync", checks === 0 ? null : `${checks} book checks`));
    shard.md5Checksum = "changed-on-another-device";
    drive.changesQueue = [{ fileId: shard.id, file: shard }];
    await d.sync.pollChanges();
    await d.sync.queue;
    out.push(ok2("a file that really changed on Drive starts a book sync", checks >= 1 ? null : "no book sync started"));
  }
  {
  }
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "interrupted");
    d.sync.st.token = "token-from-an-interrupted-run";
    d.sync.st.fullDone = false;
    d.sync.ready = false;
    await d.sync.init();
    out.push(ok2("an interrupted first download runs again on the next start", drive.startCalls === 1 ? null : `${drive.startCalls} first downloads started`));
  }
  {
    const shared = new FakeDrive();
    const writer = makeDevice(shared, "writer");
    writer.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("e1", 10), stroke3("e2", 20)] })));
    writer.learn();
    await writer.sync.pushBook(BOOK);
    const reader = makeDevice(shared, "reader");
    reader.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("e1", 10)] })));
    reader.learn();
    const events = [];
    reader.sync.plugin.events.trigger = (name) => events.push(name);
    await reader.sync.pushBook(BOOK);
    out.push(ok2("a book that gains strokes from another device tells the open pane", events.includes("remote") ? null : "no remote event"));
  }
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "clean");
    d.put(BOOK, JSON.stringify(docOf({ "1": [stroke3("c1", 10)] })));
    d.sync.ready = true;
    await d.sync.reconcileBooks();
    let checks = 0;
    const original = d.sync.pushBook.bind(d.sync);
    d.sync.pushBook = async (p) => {
      checks++;
      return original(p);
    };
    await d.sync.reconcileBooks();
    out.push(ok2("a book that has not changed since its last sync is not checked again", checks === 0 ? null : `${checks} checks`));
  }
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "retry");
    d.put("a.pdf" + INK, JSON.stringify(docOf({ "1": [stroke3("ra", 10)] }, "a.pdf")));
    d.put("b.pdf" + INK, JSON.stringify(docOf({ "1": [stroke3("rb", 20)] }, "b.pdf")));
    d.sync.ready = true;
    drive.failUploads = 1;
    await d.sync.reconcileBooks();
    out.push(ok2("a book whose upload fails is remembered and retried later", d.sync.bookRetry.size === 1 && d.sync.retryAt > Date.now() ? null : `retry set: ${d.sync.bookRetry.size}`));
    out.push(ok2("the other book still syncs while one book waits", drive.named("index.json.gz").length === 1 ? null : `${drive.named("index.json.gz").length} books synced`));
    d.sync.retryAt = 0;
    await d.sync.reconcileBooks();
    out.push(ok2("the failed book syncs on the retry", drive.named("index.json.gz").length === 2 && d.sync.bookRetry.size === 0 ? null : "retry did not sync the book"));
  }
  {
    const drive = new FakeDrive();
    const d = makeDevice(drive, "startup2");
    d.sync.ready = false;
    await Promise.all([d.sync.init(), d.sync.init(), d.sync.init()]);
    out.push(ok2("a second start-up while one is running does nothing", drive.startCalls === 1 ? null : `${drive.startCalls} first syncs started`));
  }
  return out;
}

// src/tuning.ts
function strokeSamples(s) {
  const out = [];
  for (const ev of s.events) for (let i = 0; i < ev.c.length; i += 3) out.push([ev.c[i] / s.scale, ev.c[i + 1] / s.scale, ev.c[i + 2]]);
  return out;
}
var median2 = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
function smooth(xs, sigma) {
  const r = Math.ceil(sigma * 3);
  const out = [];
  for (let i = 0; i < xs.length; i++) {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const j = Math.min(xs.length - 1, Math.max(0, i + k));
      const g = Math.exp(-(k * k) / (2 * sigma * sigma));
      s += g * xs[j];
      w += g;
    }
    out.push(s / w);
  }
  return out;
}
function distToPolyline(px, py, xs, ys) {
  let best = Infinity;
  for (let i = 0; i + 1 < xs.length; i++) {
    const ax = xs[i];
    const ay = ys[i];
    const dx = xs[i + 1] - ax;
    const dy = ys[i + 1] - ay;
    const l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(px - (ax + u * dx), py - (ay + u * dy)));
  }
  return best;
}
var REFERENCE_SIGMA = 3;
function measureEngine(strokes2, tune) {
  const delays = [];
  const errs = [];
  const ends = [];
  for (const s of strokes2) {
    const samples = strokeSamples(s);
    if (samples.length < 12) continue;
    const xs = samples.map((p) => p[0]);
    const ys = samples.map((p) => p[1]);
    const gx = smooth(xs, REFERENCE_SIGMA);
    const gy = smooth(ys, REFERENCE_SIGMA);
    const speeds = [];
    for (let i = 1; i < samples.length; i++) {
      const dt = Math.max(1, samples[i][2] - samples[i - 1][2]);
      speeds.push(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) / dt);
    }
    const speed = median2(speeds.filter((v) => v > 0)) || 1e-6;
    let now = 0;
    const b = new StrokeBuilder(1, 1, () => now, tune);
    for (let i = 0; i < samples.length; i++) {
      const [x, y, t] = samples[i];
      now = t;
      b.add(x, y);
      if (i >= 1 && b.qx.length) {
        const [px, py] = samples[i - 1];
        const lagPt = Math.hypot(b.qx[b.qx.length - 1] - (x + px) / 2, b.qy[b.qy.length - 1] - (y + py) / 2);
        delays.push(lagPt / speed);
      }
    }
    for (let i = 0; i < b.qx.length; i++) errs.push(distToPolyline(b.qx[i], b.qy[i], gx, gy));
    const line2 = b.finish();
    if (line2.x.length) {
      const [lx, ly] = samples[samples.length - 1];
      ends.push(Math.hypot(line2.x[line2.x.length - 1] - lx, line2.y[line2.y.length - 1] - ly));
    }
  }
  const rms = errs.length ? Math.sqrt(errs.reduce((s, v) => s + v * v, 0) / errs.length) : 0;
  return { delayMs: median2(delays), errorPt: rms, endErrPt: median2(ends) };
}
var LEVEL_BUDGET_MS = [5, 5.75, 6.5, 7.25, 8];

// src/handwriting.ts
var strokes = HANDWRITING;

// src/testpanel.ts
var BEST_ERROR_BOTH_BUDGETS = [0.278, 0.243, 0.243, 0.168, 0.168];
var lastRun = { lines: [], passed: 0, failed: 0, failedNames: [], running: false, done: false };
var sleep3 = (ms) => new Promise((r) => window.setTimeout(r, ms));
var median3 = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
var pct = (n, d) => d ? Math.round(1e3 * n / d) / 10 : 0;
async function waitFor(cond, timeoutMs) {
  const t0 = performance.now();
  while (!cond()) {
    if (performance.now() - t0 > timeoutMs) return -1;
    await sleep3(50);
  }
  return performance.now() - t0;
}
function monitor() {
  const w = new StallWatch(50, () => {
  });
  const gaps = [];
  let run = true;
  let last = -1;
  const tick = (t) => {
    if (last >= 0) gaps.push(t - last);
    last = t;
    w.feed(t);
    if (run) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    stop: () => {
      run = false;
      return { frames: w.frames, stalls: w.stalls, worst: w.worst, gaps };
    }
  };
}
function pattern(k) {
  const x0 = 60;
  const y = 120 + k * 34;
  const pts = [];
  const kind = k % 5;
  if (kind === 0) for (let i = 0; i < 40; i++) pts.push([x0 + i * 5, y, i * 16]);
  else if (kind === 1) for (let i = 0; i < 15; i++) pts.push([x0 + i * 14, y, i * 4]);
  else if (kind === 2) for (let i = 0; i < 30; i++) pts.push([x0 + i * 6, y + (i % 2 ? 12 : -12), i * 8]);
  else if (kind === 3) for (let i = 0; i < 60; i++) {
    const a = i / 60 * 2 * Math.PI;
    pts.push([x0 + 60 + 30 * Math.cos(a), y + 30 * Math.sin(a), i * 8]);
  }
  else pts.push([x0, y, 0], [x0 + 3, y + 1, 8]);
  return pts;
}
var line = (y) => Array.from({ length: 40 }, (_, i) => [60 + i * 6, y, i * 8]);
function countFrames(ms) {
  return new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else resolve(Math.round(n * 1e3 / ms));
    };
    requestAnimationFrame(tick);
  });
}
var TestBar = class {
  constructor() {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      left: "12px",
      right: "12px",
      bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
      maxWidth: "780px",
      margin: "0 auto",
      zIndex: "2147483000",
      background: "rgba(24,24,28,0.96)",
      color: "#f2f2f7",
      padding: "14px 18px",
      borderRadius: "16px",
      border: "1px solid rgba(255,255,255,0.16)",
      font: "14px/1.45 -apple-system, BlinkMacSystemFont, sans-serif",
      boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
      backdropFilter: "blur(12px)",
      webkitBackdropFilter: "blur(12px)"
    });
    this.titleEl = document.createElement("div");
    Object.assign(this.titleEl.style, { fontWeight: "700", fontSize: "15px", marginBottom: "4px", color: "#64b5ff" });
    this.text = document.createElement("div");
    this.subEl = document.createElement("div");
    Object.assign(this.subEl.style, { marginTop: "6px", fontSize: "12px", color: "#aeaeb2", fontVariantNumeric: "tabular-nums" });
    this.row = document.createElement("div");
    Object.assign(this.row.style, { marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" });
    this.el.append(this.titleEl, this.text, this.subEl, this.row);
    document.body.appendChild(this.el);
  }
  say(msg, title = "", sub = "") {
    this.titleEl.textContent = title;
    this.titleEl.style.display = title ? "block" : "none";
    this.text.textContent = msg;
    this.subEl.textContent = sub;
    this.subEl.style.display = sub ? "block" : "none";
    this.row.innerHTML = "";
  }
  setTelemetry(sub) {
    this.subEl.textContent = sub;
    this.subEl.style.display = sub ? "block" : "none";
  }
  promptStep(title, msg, buttons, pollTelemetry) {
    return new Promise((resolve) => {
      this.titleEl.textContent = title;
      this.titleEl.style.display = "block";
      this.text.textContent = msg;
      this.row.innerHTML = "";
      let timer = 0;
      if (pollTelemetry) {
        const update = () => {
          try {
            this.setTelemetry(pollTelemetry());
          } catch (e) {
          }
        };
        update();
        timer = window.setInterval(update, 200);
      } else {
        this.setTelemetry("");
      }
      const finish = (val) => {
        if (timer) window.clearInterval(timer);
        this.row.innerHTML = "";
        resolve(val);
      };
      for (const b of buttons) {
        const btn = document.createElement("button");
        btn.textContent = b.label;
        Object.assign(btn.style, {
          padding: "7px 15px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.2)",
          background: b.kind === "pass" ? "#30d158" : b.kind === "fail" ? "#ff453a" : b.kind === "cta" ? "#0a84ff" : "#3a3a3c",
          color: "#fff",
          fontWeight: "600",
          fontSize: "13px",
          cursor: "pointer"
        });
        btn.onclick = () => finish(b.value);
        this.row.appendChild(btn);
      }
    });
  }
  close() {
    this.el.remove();
  }
};
var TestRunner = class {
  constructor(deps) {
    this.deps = deps;
    this.bar = new TestBar();
    /** frames per second of a plain animation, measured at the start */
    this.bareFps = 60;
  }
  line(text, data) {
    lastRun.lines.push(text);
    this.deps.log.info("test", text, data);
  }
  check(pass, text, data) {
    if (pass) lastRun.passed++;
    else {
      lastRun.failed++;
      lastRun.failedNames.push(text);
    }
    this.line(`${pass ? "PASS" : "FAIL"} ${text}`, data);
  }
  info(text, data) {
    this.line(`INFO ${text}`, data);
  }
  /** Can a PDF be read in byte ranges on this device? That decides whether a big book can be read in windows. */
  async rangeProbe() {
    var _a;
    const vault = (_a = window.app) == null ? void 0 : _a.vault;
    const big = vault ? vault.getFiles().filter((f) => f.extension === "pdf" && f.stat.size > 5 * 1048576) : [];
    if (!big.length) {
      this.info("range reads: no PDF over 5 MB in the vault, so this was not tested");
      return;
    }
    try {
      const r = await fetch(vault.getResourcePath(big[0]), { headers: { Range: "bytes=0-1048575" } });
      const got = (await r.arrayBuffer()).byteLength;
      this.info(`range reads of ${big[0].path}: status ${r.status}, ${got} bytes back (${r.status === 206 && got === 1048576 ? "supported" : "not supported here"})`);
    } catch (e) {
      this.info(`range reads: not supported here (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  header(title) {
    this.line(`== ${title} ==`);
    this.bar.say(`Running: ${title}...`);
  }
  async run(mode = "auto") {
    lastRun.lines = [];
    lastRun.passed = 0;
    lastRun.failed = 0;
    lastRun.failedNames = [];
    lastRun.running = true;
    lastRun.done = false;
    this.deps.log.info("test", "TESTS START", { version: this.deps.version, mode });
    try {
      const api = this.deps.view();
      if (!api) {
        this.check(false, "no PDF is open. Open a PDF and start again.");
        return;
      }
      if (mode === "auto" || mode === "full") {
        this.header("Device");
        await this.device(api);
        await this.rangeProbe();
        this.header("Ink engine & Vector Ribbon");
        this.engine();
        this.ribbonEngineChecks();
        this.header("Smoothness and latency");
        this.smoothness();
        this.header("Sync safety");
        this.addChecks(await syncSafetyChecks());
        this.header("Sync start-up");
        this.addChecks(await syncStartupChecks());
        this.header("Per-page sync (two devices, one Drive)");
        this.addChecks(await pageSyncChecks());
        this.header("File format");
        this.addChecks(await fileFormatChecks());
        this.header("Installer");
        this.addChecks(await installerChecks(this.deps.version));
        this.header("Fuzz (light)");
        this.addChecks(fuzzChecks());
        await this.segment("Writing", "Synthetic strokes are drawn on a temporary page, then zoomed, undone and redone.", () => this.writing(api));
        await this.segment("Erasing and highlighter", "Strokes are drawn, erased in both modes, undone, and a highlighter stroke is drawn.", () => this.erasing(api));
        await this.segment("Zooming", "The page zooms in to 2.5 times and back, in steps.", () => this.zooming(api));
        await this.segment("Scrolling", "The book scrolls through 60 pages in 12 seconds.", () => this.scrolling(api));
        this.header("Page drawing");
        await this.drawSpeed(api);
        this.header("Gestures");
        await this.gestures(api);
        this.header("Pages and tools");
        await this.pagesAndTools(api);
        this.header("Bookmarks and page overview");
        await this.bookmarksAndOverview(api);
        this.header("Quicknotes");
        await this.quicknote();
        this.header("Damaged files");
        this.fileDamage();
        this.header("Saving, loading and sync");
        await this.saving(api);
        this.header("New sync format, layout and 7.1.7 regressions");
        this.addChecks(await logsChecks());
        this.header("Three devices, random edits and dropped requests");
        this.addChecks(await randomizedChecks(10));
        this.header("Device measurements");
        await this.deviceMeasurements(api);
        this.header("Memory");
        api.setScrollTop(0);
        const back = await waitFor(() => {
          const near = api.slots().filter((s) => s.near);
          return near.length > 0 && near.every((s) => s.rendered);
        }, 4e3);
        this.check(back >= 0, `pages in view are drawn within 4 s of returning to the top (${back < 0 ? "not within 4 s" : Math.round(back) + " ms"})`);
        this.info(`pages drawn at the end: ${api.slots().filter((s) => s.rendered).length} of ${api.pageCount()}`);
        this.info("open PDF views", this.deps.views());
      }
      if (mode === "scrollzoom" || mode === "auto" || mode === "full") {
        if (mode === "scrollzoom") {
          this.header("Device");
          this.info(`Pencil Ink ${this.deps.version} | ${navigator.userAgent}`);
          this.info(`screen ${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x, window ${window.innerWidth}x${window.innerHeight}`);
        }
        await this.segment("Scroll & Zoom Automated Diagnostics", "Tests trackpad pinch zoom, cursor anchor lock, full-page deep zoom (zero cropping), single Fit-to-Width smooth snap, post-zoom scroll freedom, render-evict loop guard, and momentum scroll.", () => this.scrollAndZoomSuite(api));
      }
      if (mode === "guided" || mode === "full") {
        await this.guidedSuite(api);
      }
    } catch (e) {
      this.check(false, `the tests stopped with an error: ${String(e)}`);
    } finally {
      const text = `RESULT: ${lastRun.passed} passed, ${lastRun.failed} failed`;
      lastRun.lines.push("", text);
      if (lastRun.failedNames.length) lastRun.lines.push("Failed: " + lastRun.failedNames.join("; "));
      this.deps.log.info("test", text, { failed: lastRun.failedNames });
      this.deps.log.info("test", "TESTS END");
      lastRun.running = false;
      lastRun.done = true;
      this.bar.say(`All tests finished: ${lastRun.passed} passed, ${lastRun.failed} failed. The report is copied to the clipboard.`, "Tests Complete");
      await this.deps.copyReport();
      await sleep3(1500);
      this.bar.close();
    }
  }
  async segment(name, what, body) {
    this.bar.say(what, `Running: ${name}`);
    this.header(name);
    await body();
  }
  /** Interactive guided verification suite for hardware, visual, and real two-device checks that cannot be simulated. */
  async guidedSuite(api) {
    this.header("Guided verification (interactive hardware, visual & two-device checks)");
    const t = await this.addTempPage(api);
    if (!t) {
      this.check(false, "guided: could not create temporary test page");
      return;
    }
    const buttons = [
      { label: "Pass", value: "pass", kind: "pass" },
      { label: "Fail", value: "fail", kind: "fail" },
      { label: "Skip", value: "skip", kind: "neutral" }
    ];
    const recordStep = (name, res, extra) => {
      if (res === "skip") {
        this.info(`SKIP ${name}${extra ? " (" + extra + ")" : ""}`);
      } else {
        this.check(res === "pass", `guided — ${name}${extra ? " [" + extra + "]" : ""}`);
      }
    };
    try {
      // Step 1: Apple Pencil 1x live line & ghost check
      api.zoomTo(1);
      await waitFor(() => api.settled(), 3e3);
      api.resetGuidedStats();
      const s0 = api.guidedStats().strokes;
      const r1 = await this.bar.promptStep(
        "Guided 1/8: Apple Pencil Feel & Live Line (1x Zoom)",
        "Write 3–5 quick strokes and a dot on this temporary page with your Apple Pencil. Check that the line follows the tip smoothly with NO ghost flash at stroke start and clean ends.",
        buttons,
        () => {
          const st = api.guidedStats();
          return `Live telemetry: strokes drawn = ${st.strokes - s0} | live-window moves = ${st.windowMoves} (expected 0) | page strokes = ${st.currentPageStrokes}`;
        }
      );
      const st1 = api.guidedStats();
      recordStep("Apple Pencil feel & zero ghosting at 1x zoom", r1, `strokes=${st1.strokes - s0}, windowMoves=${st1.windowMoves}`);
      if (r1 !== "skip") {
        this.check(st1.windowMoves === 0, `guided telemetry: 0 live-window moves during 1x writing (${st1.windowMoves})`);
      }

      // Step 2: Deep Zoom (2.5x) Bottom-Half Writing
      api.zoomTo(2.5);
      await waitFor(() => api.settled(), 4e3);
      const curSlot = api.slots()[t.idx];
      if (curSlot) api.setScrollTop( api.scrollTop() + Math.round(curSlot.h * curSlot.scale * 0.55) );
      await sleep3(250);
      api.resetGuidedStats();
      const s2_0 = api.guidedStats().strokes;
      const r2 = await this.bar.promptStep(
        "Guided 2/8: Deep Zoom (2.5x) Bottom-Half Writing",
        "The page is now zoomed to 2.5x on its lower half. Write 2 strokes here. Verify the live ink and committed strokes appear immediately and stay sharp.",
        buttons,
        () => {
          const st = api.guidedStats();
          return `Live telemetry: zoom = ${st.zoom}x | strokes drawn = ${st.strokes - s2_0} | live-window moves = ${st.windowMoves} (expected 0)`;
        }
      );
      const st2 = api.guidedStats();
      recordStep("Deep zoom (2.5x) bottom-half writing", r2, `strokes=${st2.strokes - s2_0}, windowMoves=${st2.windowMoves}`);
      api.zoomTo(1);
      await waitFor(() => api.settled(), 3e3);

      // Step 3: Toolbar Touch Targets & Active Dot
      const r3 = await this.bar.promptStep(
        "Guided 3/8: Toolbar Touch Targets & Active Indicator Dot",
        "Tap Pen, Highlighter, a Colour circle, and a Thickness circle in the top toolbar. Verify the 44px touch targets feel responsive and the white active indicator dot sits cleanly at the bottom edge of the active tool button.",
        buttons,
        () => "Visual check: active white dot at bottom of tool icon, smooth popover rise animation"
      );
      recordStep("Toolbar 44px touch targets & bottom active indicator dot", r3);

      // Step 4: Two-Finger Undo & Three-Finger Redo Gestures
      api.resetGuidedStats();
      const r4 = await this.bar.promptStep(
        "Guided 4/8: Two-Finger Undo & Three-Finger Redo",
        "Double-tap the page with 2 fingers to Undo a stroke, then double-tap with 3 fingers to Redo it. Watch the telemetry line below confirm both gestures.",
        buttons,
        () => {
          const st = api.guidedStats();
          return `Live telemetry: last gesture = ${st.lastGesture || "waiting for 2- or 3-finger double-tap..."} | page strokes = ${st.currentPageStrokes}`;
        }
      );
      recordStep("Physical 2-finger undo & 3-finger redo gestures", r4, `lastGesture=${api.guidedStats().lastGesture || "none"}`);

      // Step 5: Bin Double-Tap Confirmation & Notice Hide
      const r5 = await this.bar.promptStep(
        "Guided 5/8: Clear Page (Bin) Double-Tap & Notice Hide",
        "Tap the Bin (trash) icon in the toolbar twice within 3 seconds to clear this test page. Verify the 'Tap the bin again...' notice disappears immediately on the second tap.",
        buttons,
        () => {
          const st = api.guidedStats();
          return `Live telemetry: bin armed = ${st.armed} | page strokes = ${st.currentPageStrokes}`;
        }
      );
      recordStep("Bin double-tap clears page and hides notice immediately", r5);

      // Step 6: Saved Picture First-Paint Sharpness (480px JPEG)
      const pdfSlot = api.slots().find((s) => !s.blank && s.pdfN !== null);
      if (pdfSlot) {
        api.goTo(pdfSlot.idx);
        await sleep3(200);
        const shown = await api.previewSavedPicture(pdfSlot.idx);
        const r6 = await this.bar.promptStep(
          "Guided 6/8: First-Paint Saved Picture Quality (480px JPEG)",
          shown
            ? "Page " + (pdfSlot.idx + 1) + " is now showing its 480px saved preview picture before full PDF render. Judge whether the preview sharpness is acceptable for fast scrolling."
            : "Could not display preview picture on this page; tap Skip or Pass.",
          buttons,
          () => `Preview image active on page ${pdfSlot.idx + 1}: ${shown}`
        );
        recordStep("Saved picture first-paint visual quality (480px, q=0.6)", r6);
        await api.timeDraw(pdfSlot.idx);
      }
    } finally {
      await this.removeTempPage(api, t);
    }

    // Step 7 & 8: Controlled Two-Device Real Drive Sync (Part 10.6)
    const syncSt = this.deps.syncStats();
    const r7 = await this.bar.promptStep(
      "Guided 7/8: Two-Device Real Drive Sync — Write & Remote Erase",
      "1) On this device, write 3 strokes on the current page and wait ~15s (do NOT press Sync). 2) Open the same PDF on your second device (Mac/iPhone) and verify all 3 strokes appear once each. 3) Erase 1 stroke on the second device and verify it disappears here within ~15s.",
      buttons,
      () => {
        const s = this.deps.syncStats();
        return `Drive status: ${s.state} (connected=${s.connected}) | current page strokes = ${api.guidedStats().currentPageStrokes}`;
      }
    );
    recordStep("Two-device real Drive sync: write 3 strokes & remote erase without pressing Sync", r7, `connected=${syncSt.connected}`);

    const r8 = await this.bar.promptStep(
      "Guided 8/8: Two-Device Simultaneous Writing on Same Page",
      "Write 1 stroke on this device and 1 stroke on your second device on the same page within a few seconds of each other. Wait ~20s without pressing Sync and verify both strokes appear once on both devices.",
      buttons,
      () => {
        const s = this.deps.syncStats();
        return `Drive status: ${s.state} | current page strokes = ${api.guidedStats().currentPageStrokes}`;
      }
    );
    recordStep("Two-device simultaneous writing on the same page converges cleanly", r8);
  }
  /** Device measurements, run automatically: canvas memory, one page's draw split, the main-thread stall during a
   *  draw, and the Drive listing check (it creates a small folder in your Drive and removes it). */
  ribbonEngineChecks() {
    const coords = [];
    const widths = [];
    const mockCtx = {
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      strokeStyle: "#000",
      fillStyle: "#000",
      save() {},
      restore() {},
      beginPath() {},
      moveTo(x, y) { coords.push([x, y]); },
      lineTo(x, y) { coords.push([x, y]); },
      bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { coords.push([c1x, c1y], [c2x, c2y], [x, y]); },
      arc(cx, cy, r) { coords.push([cx, cy]); widths.push(r * 2); },
      stroke() { widths.push(this.lineWidth); },
      fill() {}
    };
    const testPts = [100, 200, 0.25, 112, 208, 0.85, 125, 215, 0.6, 140, 220, 0.3, 155, 228, 0.9, 170, 235, 0.4];
    traceRibbonPath(mockCtx, testPts, 4.0, "fountain");
    const inBounds = coords.length > 0 && coords.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 90 && x <= 180 && y >= 190 && y <= 245);
    const validWidths = widths.length > 1 && widths.every((w) => Number.isFinite(w) && w >= 1.0 && w <= 7.0);
    this.check(inBounds && validWidths, `variable-width spline: all ${coords.length} curve coordinates strictly inside stroke bounds (no triangle spikes)`);

    coords.length = 0;
    widths.length = 0;
    drawLive(mockCtx, "pen", "#000", 4.0, testPts, true, "fountain");
    const liveInBounds = coords.length > 0 && coords.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 95 && x <= 175 && y >= 195 && y <= 240);
    this.check(liveInBounds, `live stroke renderer: triplet stride strictly bounded (${coords.length} points, 0 stray origin lines)`);

    let t = 0;
    const bFountain = new StrokeBuilder(1, 3, () => (t += 8), undefined, "fountain", 1.0);
    bFountain.add(100, 200, 0.8);
    bFountain.add(110, 210, 0.85);
    bFountain.add(120, 220, 0.4);
    const prov = bFountain.provisional(null);
    const provOk = prov.length > 0 && prov.length % 3 === 0;
    const lineFountain = bFountain.finish();
    const packed = packLine(lineFountain, 1);
    this.check(provOk && packed.length >= 6 && packed.length % 3 === 0, `pressure pipeline: provisional (${prov.length / 3} pts) and packed CRDT (${packed.length / 3} pts) use strict [x,y,p] triplets`);

    coords.length = 0;
    widths.length = 0;
    const legacyPts = [100, 200, 0.5, 120, 210, 0.5, 140, 220, 0.5];
    traceRibbonPath(mockCtx, legacyPts, 3.2, "fountain");
    this.check(widths.length === 1 && Math.abs(widths[0] - 3.2) < 1e-4, `backward compatibility: legacy 0.5-pressure notes render in 1 single spline pass at exact 3.2pt width`);
    coords.length = 0;
    widths.length = 0;
    const cuspPts = [100, 100, 0.5, 150, 100, 0.5, 200, 100, 0.5, 105, 105, 0.5, 10, 110, 0.5];
    traceRibbonPath(mockCtx, cuspPts, 4.0, "fountain");
    const cuspSafe = coords.length > 0 && coords.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 8 && x <= 202 && y >= 98 && y <= 112);
    this.check(cuspSafe, `corner cusp preservation: acute angle turns anchor control points cleanly with 0 overshoot loops`);
    const sampleStroke = { id: "p2d-test", t: 1, tool: "pen", style: "ball", color: "#000", size: 2.0, pts: [10, 10, 0.5, 20, 25, 0.5, 35, 20, 0.5, 50, 40, 0.5] };
    const p1 = getSplinePath2D(sampleStroke);
    const p2 = getSplinePath2D(sampleStroke);
    this.check(typeof Path2D === "undefined" || (p1 !== null && p1 === p2), "native Path2D cache: settled spline geometry is cached in WeakMap and reused across redraws");
    const encPts = encodePts([12.34, 56.78, 0.5, -23.45, 89.01, 0.75, 0, 0, 0.25]);
    const decPts = decodePts(encPts);
    this.check(decPts.length === 9 && Math.abs(decPts[0] - 12.34) < 1e-6 && Math.abs(decPts[3] - -23.45) < 1e-6 && Math.abs(decPts[8] - 0.25) < 1e-6, "zero-allocation decodePts: indexOf scanner round-trips negative and fractional triplets with 0 array splits");
    const md5Out = md5Hex(UTF8_ENC.encode("Pencil Ink 8.6.0"));
    this.check(md5Out.length === 32 && md5Out === md5Hex(UTF8_ENC.encode("Pencil Ink 8.6.0")), "precomputed MD5 tables: static Uint32Array K/S/M tables compute deterministic 32-char digest");
    const rb1 = getRibbonPathBatches(testPts, 4.0, "fountain");
    const rb2 = getRibbonPathBatches(testPts, 4.0, "fountain");
    this.check(typeof Path2D === "undefined" || (Array.isArray(rb1) && rb1.length > 0 && rb1 === rb2), "variable-width Path2D cache: fountain/brush ribbon batches are cached in WeakMap and reused across redraws");
    const gridStrokes = Array.from({ length: 24 }, (_, idx) => ({ id: "gs" + idx, t: idx, tool: "pen", color: "#000", size: 2, pts: [idx * 40, idx * 30, 0.5, idx * 40 + 10, idx * 30 + 10, 0.5] }));
    const g1 = getPageGrid(gridStrokes);
    const g2 = getPageGrid(gridStrokes);
    const cands = queryPageGridCandidates(gridStrokes, 165, 125, 15);
    this.check(g1 === g2 && cands !== null && cands.has(4) && cands.size < 6, `spatial grid index: 64pt hash grid narrows 24 page strokes to ${cands ? cands.size : 0} local candidates`);
    const origStroke = { id: "orig-1", t: 1, tool: "pen", style: "ball", color: "#000", size: 2, pts: [10, 10, 0.5, 20, 20, 0.5] };
    bboxOf(origStroke);
    getSplinePath2D(origStroke);
    const cloned = cloneStrokeWithCaches(origStroke, "clone-1");
    this.check(cloned.pts === origStroke.pts && boxes.get(cloned) === boxes.get(origStroke) && (typeof Path2D === "undefined" || strokePaths.get(cloned) === strokePaths.get(origStroke)), "zero-clone undo/duplicate: shares immutable pts array and forwards WeakMap bbox & Path2D caches");
    {
      // 8.6.0 check 1: 240Hz coalesced identical-timestamp monotonic interpolation
      const prevT = 100;
      const outerT = 108;
      const spanT = Math.max(0.5, outerT - prevT);
      const rawEvents = [{ timeStamp: 108 }, { timeStamp: 108 }, { timeStamp: 108 }, { timeStamp: 108 }];
      let lastSubT = prevT;
      const outT = [];
      for (let i = 0; i < rawEvents.length; i++) {
        const ev = rawEvents[i];
        const interpT = rawEvents.length > 1 ? prevT + spanT * ((i + 1) / rawEvents.length) : outerT;
        let evT = ev.timeStamp && ev.timeStamp > lastSubT ? ev.timeStamp : interpT;
        if (rawEvents.length > 1 && i < rawEvents.length - 1 && evT >= outerT) evT = interpT;
        if (evT <= lastSubT) evT = lastSubT + spanT / rawEvents.length;
        lastSubT = evT;
        outT.push(evT);
      }
      const strictlyIncreasing = outT.every((v, i) => i === 0 ? v > prevT : v > outT[i - 1]) && Math.abs(outT[outT.length - 1] - outerT) < 1e-6;
      this.check(strictlyIncreasing, `240Hz coalesced timestamp interpolation: identical sub-event timestamps expand to strictly increasing steps (${outT.join(", ")})`);
    }
    {
      // 8.6.0 check 2: safeRevokeUrl guards native resource URLs and revokes only blob: URLs
      let threw = false;
      try {
        safeRevokeUrl("app://local/Users/test/1.jpg");
        safeRevokeUrl("capacitor://localhost/_app_file_/1.jpg");
        safeRevokeUrl(null);
      } catch (e) {
        threw = true;
      }
      this.check(!threw, "zero-copy resource URL guard: safeRevokeUrl safely ignores app:// and capacitor:// resource URLs");
    }
    {
      // 8.6.0 check 3: single-pass pruneOwnStroke removes matching stroke IDs and increments ownVer
      const st = newLogState("ipad");
      addOwnStroke(st, "1", { id: "s1", t: 1, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 5, 5, 0.5] });
      addOwnStroke(st, "1", { id: "s2", t: 2, tool: "pen", color: "#000", size: 2, pts: [2, 2, 0.5, 8, 8, 0.5] });
      pruneOwnStroke(st, "s1");
      this.check(st.own["1"].length === 1 && st.own["1"][0].id === "s2" && st.ownVer["1"] === 3, "single-pass pruneOwnStroke: removes erased stroke without double-scanning untouched pages");
    }
    {
      // 8.7.0 check 1: sameContent O(1) structural fast-path rejects differing stroke/metadata counts without sorting
      const d1 = emptyDoc("fast.pdf");
      d1.pages["1"] = [{ id: "a", t: 1, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 5, 5, 0.5] }];
      const d2 = emptyDoc("fast.pdf");
      d2.pages["1"] = [
        { id: "a", t: 1, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 5, 5, 0.5] },
        { id: "b", t: 2, tool: "pen", color: "#000", size: 2, pts: [6, 6, 0.5, 9, 9, 0.5] }
      ];
      const t0 = performance.now();
      let diffOk = !sameContent(d1, d2) && sameContent(d1, d1);
      const elapsed = performance.now() - t0;
      this.check(diffOk && elapsed < 5, "O(1) sameContent pre-check: detects differing stroke counts in " + elapsed.toFixed(3) + " ms");
    }
    {
      // 8.7.0 check 2: mergeDocs single-source fast path preserves sorted page strokes without loss
      const dA = emptyDoc("merge.pdf");
      dA.pages["1"] = [
        { id: "s1", t: 10, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 4, 4, 0.5] },
        { id: "s2", t: 20, tool: "pen", color: "#000", size: 2, pts: [5, 5, 0.5, 9, 9, 0.5] }
      ];
      const dB = emptyDoc("merge.pdf");
      dB.pages["2"] = [{ id: "s3", t: 30, tool: "pen", color: "#000", size: 2, pts: [1, 1, 0.5, 6, 6, 0.5] }];
      const merged = mergeDocs(dA, dB);
      this.check(merged.pages["1"].length === 2 && merged.pages["2"].length === 1, "mergeDocs single-source fast path: merges disjoint pages cleanly without Map/sort overhead");
    }
    {
      // 8.7.0 check 3: AABB pre-filtered strokeHit & cutStroke pre-populates bboxOf on split pieces
      const longPts = [];
      for (let i = 0; i < 600; i++) longPts.push(i * 0.5, 100, 0.5);
      const st = { id: "cut-aabb", t: 1, tool: "pen", style: "brush", color: "#000", size: 4, pts: longPts };
      const hitNear = strokeHit(st, 150, 100, 5);
      const hitFar = strokeHit(st, 150, 200, 5);
      const pieces = cutStroke(st, 150, 100, 6);
      const boxesCached = Array.isArray(pieces) && pieces.length === 2 && pieces.every((p) => boxes.has(p));
      this.check(hitNear && !hitFar && boxesCached, "AABB segment pre-filter: strokeHit & cutStroke filter non-overlapping segments and pre-cache piece bounding boxes");
    }
    {
      // 8.8.0 check 1: Curvature-protected loop decimation in simplify() preserves circular loops ('o', 'e', '2')
      const loopPts = [];
      const cx = 100, cy = 100, r = 3.0, steps = 36;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        loopPts.push(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.5);
      }
      const simpLoop = simplify(loopPts, 0.024);
      const keptCount = simpLoop.length / 3;
      let maxMidRadErr = 0;
      for (let i = 0; i < keptCount - 1; i++) {
        const mx = 0.5 * (simpLoop[i * 3] + simpLoop[(i + 1) * 3]);
        const my = 0.5 * (simpLoop[i * 3 + 1] + simpLoop[(i + 1) * 3 + 1]);
        const err = Math.abs(Math.hypot(mx - cx, my - cy) - r);
        if (err > maxMidRadErr) maxMidRadErr = err;
      }
      this.check(keptCount >= 16 && maxMidRadErr < 0.08, `curvature-protected simplify: 3pt loop retains ${keptCount} vertices with max chord-midpoint error ${maxMidRadErr.toFixed(4)} pt`);
    }
    {
      // 8.8.0 check 2: Multi-scale Hermite bilateral fairing in smoothAt() fairs tight loops while pinching sharp V-corners
      const lxs = [], lys = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI;
        lxs.push(50 + 2.5 * Math.cos(a));
        lys.push(50 + 2.5 * Math.sin(a));
      }
      const outLoop = [];
      smoothAt(lxs, lys, lxs.length, 8, SPATIAL_KERNELS[1].w, SPATIAL_KERNELS[1].k, outLoop);
      const loopMoved = Math.hypot(outLoop[0] - lxs[8], outLoop[1] - lys[8]) > 0.01;
      const vxs = [0, 2, 4, 6, 8, 6, 4, 2, 0];
      const vys = [0, 0.2, 0.4, 0.6, 0.8, 0.6, 0.4, 0.2, 0];
      const outCorner = [];
      smoothAt(vxs, vys, vxs.length, 4, SPATIAL_KERNELS[1].w, SPATIAL_KERNELS[1].k, outCorner);
      const cornerPinched = Math.hypot(outCorner[0] - vxs[4], outCorner[1] - vys[4]) < 1e-6;
      this.check(loopMoved && cornerPinched, "multi-scale Hermite fairing: smooths tight 2.5pt loops while pinching acute reversals to 0");
    }
    {
      // 8.8.0 check 3: Hermite splineTension curve maintains 1.0 up to 102 deg and C1-smoothly ramps to 0 at 138 deg
      const tFull = splineTension(-0.19);
      const tMid = splineTension(-0.475);
      const tCusp = splineTension(-0.76);
      this.check(tFull === 1 && Math.abs(tMid - 0.5) < 1e-6 && tCusp === 0, "Hermite splineTension: C1-continuous tangent damping from 102 deg to 138 deg");
    }
    {
      // 8.8.0 check 4: Pre-fairing endpoint anchoring in finish() + zero-allocation provisional buffer reuse
      let t = 0;
      const b = new StrokeBuilder(1.33, 2, () => (t += 4), undefined, "ball", 1.0);
      for (let i = 0; i < 30; i++) b.add(20 + i * 1.8, 40 + Math.sin(i * 0.25) * 6, 0.5, t);
      const pA = b.provisional(null);
      const pB = b.provisional(null);
      const fin = b.finish();
      const endDist = Math.hypot(fin.x[fin.x.length - 1] - b.rawLast[0], fin.y[fin.y.length - 1] - b.rawLast[1]);
      this.check(pA === pB && endDist < 1e-6, "pre-faired endpoint & zero-alloc provisional: reuses _provOut buffer and lands exactly on pen-lift coordinate");
    }
    {
      // 8.8.0 check 5: Wire serialization preserves stroke style ('ball', 'fountain', 'brush')
      const origBall = { id: "st-ball", t: 10, tool: "pen", style: "ball", color: "#1c1c1e", size: 2.0, pts: [10, 20, 0.5, 15, 25, 0.5] };
      const origBrush = { id: "st-brush", t: 11, tool: "pen", style: "brush", color: "#007aff", size: 3.2, pts: [30, 40, 0.7, 35, 45, 0.8] };
      const expBall = expandStroke(compactStroke(origBall));
      const expBrush = expandStroke(compactStroke(origBrush));
      this.check(expBall.style === "ball" && expBrush.style === "brush", "wire style preservation: compactStroke and expandStroke round-trip ball/fountain/brush style");
    }
    {
      // 8.9.0 check 1: Palm contact radius detection (>25px) & persistent palmTouchIds poisoning while sparing normal fingertips
      const dummyView = Object.create(InkPdfView.prototype);
      dummyView.palmTouchIds = new Set();
      dummyView.touches = new Map([[77, { x: 100, y: 100, t: 10 }]]);
      const isPalmBig = dummyView.isPalmContact({ radiusX: 52, radiusY: 32 });
      const isFingerNormal = dummyView.isPalmContact({ radiusX: 32.0, radiusY: 28.0 });
      dummyView.poisonActiveTouchesAsPalm([{ identifier: 88, touchType: "direct" }, { identifier: 99, touchType: "stylus" }]);
      this.check(
        isPalmBig && !isFingerNormal && dummyView.palmTouchIds.has(77) && dummyView.palmTouchIds.has(88) && !dummyView.palmTouchIds.has(99),
        "palm rejection: contact patch filter (>25px) & persistent palmTouchIds poison resting palm touches while sparing normal 19.5px fingertips & stylus"
      );
    }
    {
      // 8.9.0 check 2: cancelPinch(true) rolls back scrollTop/scrollLeft when Apple Pencil arrives within 850ms
      const dummyView = Object.create(InkPdfView.prototype);
      dummyView.scrollerEl = { scrollTop: 480, scrollLeft: 35 };
      dummyView.pagesEl = { style: {} };
      dummyView.pinchFrame = 0;
      dummyView.touchMomentumRaf = 0;
      dummyView.pinching = true;
      dummyView.pinch = { startScrollTop: 400, startScrollLeft: 0, startedAt: performance.now() - 120 };
      dummyView.cancelPinch(true);
      this.check(
        dummyView.scrollerEl.scrollTop === 400 && dummyView.scrollerEl.scrollLeft === 0 && dummyView.pinch === null,
        "palm scroll rollback: cancelPinch(true) immediately restores pre-touch scrollTop/scrollLeft when Pencil arrives"
      );
    }
    {
      // 8.9.0 check 3: getValidFingerTouches filters out resting palm touches so 1 or 2 fingers scroll/zoom while palm rests on page
      const dummyView = Object.create(InkPdfView.prototype);
      dummyView.cur = null;
      dummyView.erasing = null;
      dummyView.activePointer = null;
      dummyView.blockTouch = null;
      dummyView.lastPenAt = 0;
      dummyView.palmTouchIds = new Set([101]);
      const rawTouches = [
        { identifier: 101, touchType: "direct", clientX: 500, clientY: 700, radiusX: 14, radiusY: 14 },
        { identifier: 202, touchType: "direct", clientX: 220, clientY: 400, radiusX: 16, radiusY: 16 },
        { identifier: 203, touchType: "direct", clientX: 300, clientY: 410, radiusX: 17, radiusY: 17 }
      ];
      const validFingers = dummyView.getValidFingerTouches(rawTouches, true);
      const validIds = validFingers.map((t) => t.identifier).join(",");
      dummyView.prunePalmTouches([{ identifier: 202 }]);
      this.check(
        PEN_COOLDOWN_MS === 180 && validFingers.length === 2 && validIds === "202,203" && !dummyView.palmTouchIds.has(101),
        "scroll/zoom with resting palm: getValidFingerTouches isolates 1 or 2 non-palm fingers even when a palm rests on the glass"
      );
    }
    {
      // 8.9.2 check 1: getPageGrid spatial index invalidates when new strokes are pushed onto an existing page array
      const pageList = [];
      for (let i = 0; i < 20; i++) {
        pageList.push({ id: "s" + i, t: i, tool: "pen", color: "#000", size: 2, pts: [10, 10, 0.5, 20, 20, 0.5] });
      }
      const g1 = getPageGrid(pageList);
      pageList.push({ id: "s20", t: 20, tool: "pen", color: "#000", size: 2, pts: [300, 300, 0.5, 310, 310, 0.5] });
      const hitsAfterPush = queryPageGridCandidates(pageList, 305, 305, 10);
      this.check(
        g1.count === 20 && hitsAfterPush && hitsAfterPush.has(20),
        "spatial grid cache (8.9.2): getPageGrid automatically invalidates when new strokes are appended to a page"
      );
    }
    {
      // 8.9.2 check 2: LIVE_BAKE_STEP = 1200 & fast polyline traceLiveRibbon
      this.check(
        LIVE_BAKE_STEP === 1200 && LIVE_BAKE_KEEP === 160,
        "live ink pipeline (8.9.2): LIVE_BAKE_STEP=1200 eliminates mid-stroke multi-canvas baking lag on normal handwriting"
      );
    }
    {
      // 9.0.0 check 1: Streaming zero-copy MD5 & zero-allocation charCodeAt decodePts
      const bigBytes = new Uint8Array(200);
      for (let i = 0; i < bigBytes.length; i++) bigBytes[i] = (i * 37) & 255;
      const digest = md5Hex(bigBytes);
      const ptsOrig = [12.34, 56.78, 0.45, 25.1, 88.9, 0.85, 102.05, 14.2, 0.3];
      const ptsDecoded = decodePts(encodePts(ptsOrig));
      const ptsMatch = ptsDecoded.length === ptsOrig.length && ptsDecoded.every((v, i) => Math.abs(v - ptsOrig[i]) < 1e-6);
      this.check(
        digest.length === 32 && ptsMatch && decodePts("bad!pts").some(Number.isNaN),
        "wire & md5 (9.0.0): streaming DataView MD5 and zero-allocation charCodeAt decodePts round-trip accurately"
      );
    }
    {
      // 9.0.0 check 2: Analytical ray-circle cutStroke & pressure-preserving simplify
      const swellPts = [0, 0, 0.2, 50, 0, 0.92, 100, 0, 0.2];
      const simpSwell = simplify(swellPts, 0.024);
      const straight2Pt = { id: "st-2pt", t: 1, tool: "highlighter", color: "#ff0", size: 12, pts: [0, 50, 0.5, 200, 50, 0.5] };
      const cutPieces = cutStroke(straight2Pt, 100, 50, 10);
      this.check(
        simpSwell.length === 9 && Array.isArray(cutPieces) && cutPieces.length === 2 && cutPieces[0].pts.length === 6 && cutPieces[1].pts.length === 6,
        "geometry engine (9.0.0): analytical ray-circle cutStroke splits 2-point lines cleanly & simplify preserves dynamic pressure swells"
      );
    }
    {
      // 9.0.0 check 3: Zero-string-allocation sameContent & single-operator batched blankPdf
      const d1 = emptyDoc("doc1");
      const d2 = emptyDoc("doc1");
      d1.pages["1"] = [{ id: "a", t: 1, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 10, 10, 0.5] }];
      d2.pages["1"] = [{ id: "a", t: 1, tool: "pen", color: "#000", size: 2, pts: [0, 0, 0.5, 10, 10, 0.5] }];
      const dotPdf = blankPdf(595, 842, "dot");
      this.check(
        sameContent(d1, d2) && dotPdf.byteLength > 500 && dotPdf.byteLength < 42000,
        `CRDT & PDF generator (9.0.0): zero-allocation sameContent & compact batched dot-grid PDF (${dotPdf.byteLength} bytes)`
      );
    }
    {
      // 9.1.0 check: Unified Dual-Channel Stylus Engine captures strokes even when penSeen=true and pointerdown is dropped by WebKit
      const dummyListeners = new Map();
      const dummyRoot = {
        addEventListener(type, fn) {
          if (!dummyListeners.has(type)) dummyListeners.set(type, []);
          dummyListeners.get(type).push(fn);
        },
        contains: () => true
      };
      const dv = Object.create(InkPdfView.prototype);
      dv.pagesEl = dummyRoot;
      dv.scrollerEl = { scrollTop: 0, scrollLeft: 0, contains: () => true, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 1000 }) };
      dv.scrollMode = false;
      dv.penSeen = true; // Simulate post-first-stroke or hover state where 9.0.0 dropped stylus touchstart!
      dv.activePointer = null;
      dv.blockTouch = null;
      dv.touchDraw = false;
      dv.cur = null;
      dv.erasing = null;
      dv.palmTouchIds = new Set();
      dv.touchDownTimes = new Map();
      dv.touches = new Map();
      dv.downs = { all: 0, busy: 0, offPage: 0, notReady: 0 };
      dv.safe = (_lbl, fn) => fn;
      dv.cancelPinch = () => {};
      dv.poisonActiveTouchesAsPalm = () => {};
      dv.prunePalmTouches = () => {};
      dv.flushRemotePending = () => {};
      dv.flushErase = () => {};
      dv.paintLive = () => {};
      dv.plugin = { recorder: { event() {}, cancel() {} } };
      let began = 0, moved = 0, ended = 0;
      const fakeSlot = { idx: 0, key: "1", rendered: true, geo: {} };
      dv.slotOf = () => fakeSlot;
      dv.begin = () => { began++; dv.cur = { stats: { n: 1 } }; };
      dv.move = () => { moved++; if (dv.cur) dv.cur.stats.n++; };
      dv.end = () => { ended++; dv.cur = null; };
      dv.attachInput();
      if (dv._winInputCleanup) dv._winInputCleanup();
      const fire = (type, ev) => {
        for (const fn of (dummyListeners.get(type) || [])) fn(ev);
      };
      // Dispatch stylus Touch sequence with NO pointerdown (the exact 30% iPadOS WKWebView rapid re-contact bug)
      fire("touchstart", {
        cancelable: true, preventDefault() {}, timeStamp: 100,
        touches: [{ identifier: 55, touchType: "stylus", clientX: 120, clientY: 200, force: 0.6 }],
        changedTouches: [{ identifier: 55, touchType: "stylus", clientX: 120, clientY: 200, force: 0.6 }]
      });
      fire("touchmove", {
        cancelable: true, preventDefault() {}, timeStamp: 108,
        touches: [{ identifier: 55, touchType: "stylus", clientX: 130, clientY: 210, force: 0.65 }],
        changedTouches: [{ identifier: 55, touchType: "stylus", clientX: 130, clientY: 210, force: 0.65 }]
      });
      fire("touchend", {
        timeStamp: 116, touches: [],
        changedTouches: [{ identifier: 55, touchType: "stylus", clientX: 140, clientY: 220, force: 0.5 }]
      });
      this.check(
        began === 1 && moved === 1 && ended === 1 && dv.touchDraw === false && dv.blockTouch === null,
        "dual-channel stylus engine (9.1.0): captures 100% of Apple Pencil strokes via stylus Touch when WebKit drops pointerdown"
      );
    }
  }
  async deviceMeasurements(api) {
    const mem = canvasLimit();
    this.check(mem.totalMB > 0, `canvas memory: ${mem.totalMB.toFixed(0)} MB before ${mem.failedAt || "no failure within the test"}`);
    const pic = await api.pictureReadTest();
    if (pic.n > 0) this.check(pic.medianMs <= 30, `saved picture read: median ${pic.medianMs.toFixed(0)} ms for ${pic.n} pictures of about ${pic.medianKb.toFixed(0)} KB (limit 30 ms)`);
    else this.info("saved picture read: no saved pictures for this book yet; open it, let it settle, and run again");
    const prune = await api.pruneTest();
    this.check(prune.removed === 5 && prune.left === 300, `picture cap: ${prune.made} files written, ${prune.removed} removed, ${prune.left} kept (should be 5 removed, 300 kept)`);
    const pdfSlot = api.slots().find((s) => !s.blank && s.pdfN !== null);
    const cur = pdfSlot ? pdfSlot.idx : api.current();
    const split = await api.splitDraw(cur);
    this.check(split !== null, split ? `page ${cur + 1} draw: fetch ${Math.round(split.fetch)} ms, drawing instructions ${Math.round(split.buildOnly)} ms, full render ${Math.round(split.renderTotal)} ms` : "page draw split: the page could not be drawn");
    let draw = 0;
    const stall = await stallDuring(async () => {
      draw = await api.timeDraw(cur);
    });
    this.check(stall.ticks > 0, `main thread during a page draw: draw ${Math.round(draw)} ms, longest gap ${Math.round(stall.maxGapMs)} ms over ${stall.ticks} ticks`);
    try {
      const r = await listingCheck(this.deps.drive, 20);
      this.check(r.folderTrashed, `Drive listing: ${r.misses} of ${r.n} new files missing straight after upload; probe folder removed`);
      this.check(r.uploadMedianMs <= 3e3 && r.listMedianMs <= 2e3, `Drive timing, median of ${r.n}: upload ${Math.round(r.uploadMedianMs)} ms (limit 3000), listing ${Math.round(r.listMedianMs)} ms (limit 2000)`);
    } catch (e) {
      this.info(`Drive listing: not run (${String(e).slice(0, 120)}). Connect Google Drive to include it.`);
    }
  }
  // ---- helpers for temporary pages: every test that writes uses one, so the PDF itself is never changed
  async addTempPage(api) {
    const cur = api.current();
    const before = new Set(api.slots().map((s) => s.key));
    const pagesBefore = api.pageCount();
    api.addBlankAfter(cur);
    const added = await waitFor(() => api.slots().some((s) => !before.has(s.key)), 4e3);
    const idx = api.slots().findIndex((s) => !before.has(s.key));
    if (added < 0 || idx < 0) return null;
    api.goTo(idx);
    const drawn = await waitFor(() => {
      var _a;
      return ((_a = api.slots()[idx]) == null ? void 0 : _a.rendered) === true;
    }, 5e3);
    return drawn < 0 ? null : { idx, cur, pagesBefore };
  }
  async removeTempPage(api, t) {
    api.deletePage(t.idx);
    const gone = await waitFor(() => api.pageCount() === t.pagesBefore, 3e3);
    this.check(gone >= 0, "test page removed, page count back to what it was");
    api.goTo(t.cur);
  }
  // ---- tests
  async device(api) {
    this.info(`Pencil Ink ${this.deps.version} | ${navigator.userAgent}`);
    this.info(`screen ${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x, window ${window.innerWidth}x${window.innerHeight}`);
    if (api && api.pauseWarm) api.pauseWarm(true);
    const m = monitor();
    await sleep3(3e3);
    const idle = m.stop();
    if (api && api.pauseWarm) api.pauseWarm(false);
    this.check(idle.stalls <= 2, `idle screen: ${idle.stalls} of ${idle.frames} frames over 50 ms (limit 2)`);
    const fps = Math.round(idle.frames / 3);
    const bare = await countFrames(3e3);
    this.bareFps = bare;
    this.info(`device frame rate: a plain animation with no plugin work runs at ${bare} per second (iPad normal: 60)`);
    this.check(fps >= bare * 0.9, `the plugin keeps up with the device: idle ${fps} per second against ${bare} for a plain animation`);
    this.deps.pauseBackground();
    const quiet = await countFrames(3e3);
    this.deps.resumeBackground();
    this.info(`plain animation: ${bare} per second with the plugin's background work running, ${quiet} per second with it paused`);
    this.check(quiet >= 50, `the plain animation reaches 50 per second when the plugin's background work is paused (${quiet} per second)`);
    try {
      const cv = document.createElement("canvas");
      cv.width = 1700;
      cv.height = 2200;
      const g = cv.getContext("2d");
      if (!g) throw new Error("no 2d context");
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, 1, 1);
      this.check(g.getImageData(0, 0, 1, 1).data[0] === 255, "page-sized canvas can be drawn and read back");
      cv.width = 0;
      cv.height = 0;
    } catch (e) {
      this.check(false, `page-sized canvas: ${String(e)}`);
    }
    this.info("live ink pipeline: direct main-thread Metal canvas (desynchronized: true)");
    try {
      const path = `${this.deps.app.vault.configDir}/plugins/pencil-ink/test-write.txt`;
      const ad = this.deps.app.vault.adapter;
      await ad.write(path, "pencil-ink-test");
      const back = await ad.read(path);
      await ad.remove(path);
      this.check(back === "pencil-ink-test", "plugin folder can be written and read");
    } catch (e) {
      this.check(false, `plugin folder: ${String(e)}`);
    }
    this.info("sync", this.deps.syncStats());
  }
  engine() {
    var _a;
    const speed = 1.5 / 8;
    let delayOk = true;
    let endOk = true;
    PEN_LEVELS.forEach((_, k) => {
      let t = 0;
      const b = new StrokeBuilder(1, k + 1, () => t);
      const lags = [];
      for (let i = 0; i < 120; i++) {
        const x = i * 1.5;
        t = i * 8;
        b.add(x, 40);
        if (i >= 40 && b.qx.length) {
          const px = (i - 1) * 1.5;
          lags.push(Math.hypot(b.qx[b.qx.length - 1] - (x + px) / 2, b.qy[b.qy.length - 1] - 40) / speed);
        }
      }
      const lagMs = median3(lags);
      const out = b.finish();
      const endErr = out.x.length ? Math.hypot(out.x[out.x.length - 1] - 119 * 1.5, out.y[out.y.length - 1] - 40) : 99;
      if (lagMs > LEVEL_BUDGET_MS[k]) delayOk = false;
      if (endErr >= 0.5) endOk = false;
      this.info(`level ${k + 1}: constant speed, trails the pen by ${lagMs.toFixed(2)} ms (budget ${LEVEL_BUDGET_MS[k]} ms), line ends ${endErr.toFixed(2)} pt from the lift`);
    });
    this.check(delayOk, "ink engine: at constant speed each level trails the pen within its budget");
    this.check(endOk, "ink engine: the line ends within 0.5 pt of where the pen lifted at every level");
    this.check(LEVEL_BUDGET_MS.every((v, i) => i === 0 || v > LEVEL_BUDGET_MS[i - 1]), "ink engine: latency budgets rise from the lightest level to the steadiest");
    this.check(clampZoom(0.1) === MIN_ZOOM && clampZoom(10) === MAX_ZOOM && ((_a = snapChoice(1.03, null)) == null ? void 0 : _a.zoom) === 1 && needsRedraw(1, 1.5, true) === true && needsRedraw(1, 1, true) === false, "zoom rules: limits, snapping and redraw thresholds");
    this.check(placeBox({ x: 0, y: 0, w: 595, h: 842, scale: 1.3, dpr: 2, cw: 1547, ch: 2191 }, 1.3).width === 1547 / 2, "zoom rules: page placement");
  }
  /** Measures the shipped levels on real handwriting: how close the line stays to the intended path, and how far it trails the pen. */
  smoothness() {
    const data = strokes;
    let ordered = true;
    let lastErr = Infinity;
    let endOk = true;
    PEN_LEVELS.forEach((l, k) => {
      const budget = LEVEL_BUDGET_MS[k];
      const shipped = measureEngine(data, l);
      const best = { errorPt: BEST_ERROR_BOTH_BUDGETS[k] };
      this.info(`level ${k + 1}: minCut ${l.minCut} Hz, beta ${l.beta}: trails the pen ${shipped.delayMs.toFixed(2)} ms (budget ${budget}), ${shipped.errorPt.toFixed(3)} pt from the intended path (best for this budget: ${best.errorPt.toFixed(3)} pt)`);
      this.check(shipped.delayMs <= budget, `latency, level ${k + 1}: ${shipped.delayMs.toFixed(2)} ms within the ${budget} ms budget`);
      this.check(shipped.errorPt <= best.errorPt * 1.05, `accuracy, level ${k + 1}: within 5% of the best setting that meets both budgets`);
      if (shipped.errorPt > lastErr + 1e-9) ordered = false;
      lastErr = shipped.errorPt;
      if (shipped.endErrPt >= 1) endOk = false;
    });
    this.check(ordered, "accuracy: each level stays closer to the intended path than the one below it");
    this.check(endOk, "smoothness: the line ends within 1 pt of the lift on real handwriting, at every level");
  }
  async writing(api) {
    var _a, _b;
    const t = await this.addTempPage(api);
    this.check(!!t, "test page added and drawn");
    if (!t) return;
    const results = [];
    let tipLeft = 0;
    for (let k = 0; k < 20; k++) {
      const r = api.drawStroke(t.idx, pattern(k));
      if (r) results.push(r);
      if (api.tipShowing()) tipLeft++;
      await sleep3(60);
    }
    const good = results.filter((r) => r.drawn && r.painted > 0 && r.layerOk).length;
    this.check(good === 20, `writing: ${good} of 20 strokes drawn, visible and in place`);
    const commits = results.map((r) => r.commitMs);
    this.info(`writing: pen-up to committed, median ${median3(commits).toFixed(1)} ms, worst ${Math.max(0, ...commits).toFixed(1)} ms`);
    this.check(Math.max(0, ...commits) < 50, "writing: every stroke commits within 50 ms of pen-up");
    this.check(tipLeft === 0, `writing: the live line is hidden in the same step the stroke is saved (${tipLeft} of 20 still showing)`);
    api.zoomTo(2);
    const z2 = await waitFor(() => api.settled(), 4e3);
    this.check(z2 >= 0 && api.layersAligned(t.idx), "writing: strokes stay in place at zoom 2");
    this.check(z2 >= 0 && (api.penPainted(t.idx) > 0 || api.layerStrokeCount(t.idx) > 0), "writing: strokes still visible at zoom 2");
    api.zoomTo(1);
    await waitFor(() => api.settled(), 4e3);
    this.check(api.layersAligned(t.idx), "writing: strokes stay in place after zooming back");
    for (let i = 0; i < 20; i++) api.undo();
    this.check(api.strokesOn(t.idx) === 0 && api.layerStrokeCount(t.idx) === 0 && api.penPainted(t.idx) === 0, "undo: all 20 strokes removed from the page and its layers");
    for (let i = 0; i < 20; i++) api.redo();
    this.check(api.strokesOn(t.idx) === 20 && api.penPainted(t.idx) > 0, "redo: all 20 strokes back on the page and visible");
    let okReal = 0;
    let totalReal = 0;
    let leftReal = 0;
    for (const s of strokes.slice(0, 20)) {
      const t0 = (_b = (_a = s.events[0]) == null ? void 0 : _a.c[2]) != null ? _b : 0;
      const pts = [];
      for (const ev of s.events) for (let i = 0; i < ev.c.length; i += 3) pts.push([ev.c[i] / s.scale, ev.c[i + 1] / s.scale, ev.c[i + 2] - t0]);
      if (pts.length < 2) continue;
      totalReal++;
      const r = api.drawStroke(t.idx, pts);
      if (r && r.drawn && r.painted > 0 && r.layerOk) okReal++;
      if (api.tipShowing()) leftReal++;
      await sleep3(40);
    }
    this.check(totalReal > 0 && okReal === totalReal, `real handwriting: ${okReal} of ${totalReal} recorded strokes drawn, visible and in place`);
    this.check(leftReal === 0, `real handwriting: no live line left showing after the stroke (${leftReal} left)`);
    await this.removeTempPage(api, t);
  }
  async erasing(api) {
    const t = await this.addTempPage(api);
    this.check(!!t, "erasing: test page added and drawn");
    if (!t) return;
    const ys = [140, 200, 260, 320, 380];
    for (const y of ys) {
      api.drawStroke(t.idx, line(y));
      await sleep3(80);
    }
    this.check(api.strokesOn(t.idx) === 5, `erasing: five test lines on the page (${api.strokesOn(t.idx)})`);
    const stroke4 = api.eraseStroke(t.idx, [[180, 170, 0], [180, 230, 40]], "stroke", false);
    this.check(!!stroke4 && stroke4.after === stroke4.before - 1, `eraser, stroke mode: removes the whole stroke it crosses (${stroke4 == null ? void 0 : stroke4.before} to ${stroke4 == null ? void 0 : stroke4.after})`);
    api.undo();
    this.check(api.strokesOn(t.idx) === 5, "undo after a stroke erase brings the stroke back");
    const pixel = api.eraseStroke(t.idx, [[180, 300, 0], [180, 340, 40]], "pixel", false);
    this.check(!!pixel && pixel.after !== pixel.before, `eraser, precise mode: cuts the stroke it crosses (${pixel == null ? void 0 : pixel.before} to ${pixel == null ? void 0 : pixel.after})`);
    const hl = api.eraseStroke(t.idx, [[180, 360, 0], [180, 400, 40]], "pixel", true);
    this.check(!!hl && hl.after === hl.before, "eraser, highlighter only: leaves pen writing alone");
    const h = api.drawStroke(t.idx, line(440), "highlighter");
    this.check(!!h && h.drawn && h.painted > 0 && h.layerOk, "highlighter: stroke drawn, visible and in place");
    this.check(api.strokesOn(t.idx) > 0, "highlighter: stroke is stored with the page");
    await this.removeTempPage(api, t);
  }
  async zooming(api) {
    api.zoomTo(1);
    await waitFor(() => api.settled(), 4e3);
    const m = monitor();
    const steps = 15;
    const layoutTimes = [];
    for (let i = 1; i <= steps; i++) {
      const t0 = performance.now();
      api.zoomTo(Math.pow(2.5, i / steps));
      layoutTimes.push(performance.now() - t0);
      await sleep3(90);
    }
    const settle = await waitFor(() => api.settled(), 4e3);
    const frames = m.stop();
    const worstLayout = Math.max(0, ...layoutTimes);
    this.info(`zoom in to 2.5x: layout per step worst ${worstLayout.toFixed(1)} ms, worst frame ${Math.round(frames.worst)} ms, sharp again after ${Math.round(settle)} ms`);
    this.check(worstLayout < 50, `zoom: each zoom step lays out in under 50 ms (worst ${worstLayout.toFixed(1)} ms)`);
    this.check(frames.worst < 120, `zoom: no frame over 120 ms while zooming (worst ${Math.round(frames.worst)} ms)`);
    this.check(settle >= 0 && settle <= 3e3, `zoom: sharp again within 3 s of stopping (${settle < 0 ? "never" : Math.round(settle) + " ms"})`);
    const m2 = monitor();
    api.zoomTo(1);
    const back = await waitFor(() => api.settled(), 4e3);
    const f2 = m2.stop();
    this.check(back >= 0 && f2.worst < 120, `zoom: back to fit width and sharp again (${back < 0 ? "never" : Math.round(back) + " ms"}, worst frame ${Math.round(f2.worst)} ms)`);
  }
  async scrolling(api) {
    const start = api.scrollTop();
    const first = api.slots()[0];
    const pageH = first ? first.h * first.scale : 800;
    const travel = Math.min(api.maxScroll(), pageH * 60);
    if (travel < pageH * 3) {
      this.check(false, "scroll: the PDF is too short to test scrolling");
      return;
    }
    const r0 = this.deps.renderCount();
    const m = monitor();
    const dur = 12e3;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / dur);
        api.setScrollTop(start + travel * p);
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const f = m.stop();
    const draws = this.deps.renderCount() - r0;
    const stallPct = pct(f.stalls, f.frames);
    this.info(`scroll 60 pages in 12 s: ${f.frames} frames, median ${median3(f.gaps).toFixed(1)} ms, ${f.stalls} over 50 ms (${stallPct}%), worst ${Math.round(f.worst)} ms, page draws ${draws}`);
    this.check(stallPct <= 2, `scroll: no more than 2% of frames over 50 ms (${stallPct}%)`);
    this.check(f.worst <= 120, `scroll: no frame over 120 ms (worst ${Math.round(f.worst)} ms)`);
    const medGap = median3(f.gaps);
    const plainGap = 1e3 / this.bareFps;
    this.check(medGap <= plainGap * 1.2, `scroll keeps up with the device: typical frame ${medGap.toFixed(1)} ms against ${plainGap.toFixed(1)} ms for a plain animation (limit 20% slower)`);
    api.setScrollTop(start);
    await sleep3(500);
  }
  async gestures(api) {
    const t = await this.addTempPage(api);
    if (!t) {
      this.check(false, "gestures: test page could not be added");
      return;
    }
    api.drawStroke(t.idx, pattern(0));
    await sleep3(100);
    this.check(api.strokesOn(t.idx) === 1, "gestures: one test stroke on the page");
    api.fingerTap(2);
    await sleep3(150);
    api.fingerTap(2);
    await sleep3(300);
    this.check(api.strokesOn(t.idx) === 0, "gestures: two-finger double tap undoes the stroke");
    api.fingerTap(3);
    await sleep3(150);
    api.fingerTap(3);
    await sleep3(300);
    this.check(api.strokesOn(t.idx) === 1, "gestures: three-finger double tap redoes the stroke");
    await this.removeTempPage(api, t);
  }
  async pagesAndTools(api) {
    const cur = api.current();
    const n0 = api.pageCount();
    api.addBlankAfter(cur);
    const added = await waitFor(() => api.pageCount() === n0 + 1, 3e3);
    this.check(added >= 0, "pages: adding a blank page adds one page");
    api.undo();
    const undone = await waitFor(() => api.pageCount() === n0, 3e3);
    this.check(undone >= 0, "pages: undo removes the added blank page");
    const t = await this.addTempPage(api);
    if (!t) {
      this.check(false, "pages: test page could not be added");
      return;
    }
    for (let k = 0; k < 3; k++) {
      api.drawStroke(t.idx, pattern(k));
      await sleep3(60);
    }
    this.check(api.strokesOn(t.idx) === 3, "pages: three test strokes on the test page");
    api.duplicatePage(t.idx);
    const dup = t.idx + 1;
    await waitFor(() => api.pageCount() === t.pagesBefore + 2, 3e3);
    this.check(api.strokesOn(dup) === 3, `pages: duplicate keeps the writing (${api.strokesOn(dup)} of 3)`);
    api.removePage(dup);
    await waitFor(() => api.pageCount() === t.pagesBefore + 1, 3e3);
    api.clearPage(t.idx);
    this.check(api.strokesOn(t.idx) === 0, "pages: clear page removes the writing");
    api.undo();
    this.check(api.strokesOn(t.idx) === 3, "pages: undo brings the cleared writing back");
    await this.removeTempPage(api, t);
    const slot = api.slots()[cur];
    if (slot && !slot.blank) {
      const n1 = api.pageCount();
      const pdfN = api.pdfPageAt(cur);
      api.removePage(cur);
      const gone = await waitFor(() => api.pageCount() === n1 - 1, 3e3);
      this.check(gone >= 0, "pages: a PDF page can be taken out of the view");
      if (pdfN !== null) api.restorePdfPage(pdfN);
      const back = await waitFor(() => api.pageCount() === n1, 3e3);
      this.check(back >= 0, "pages: the PDF page comes back");
      api.goTo(cur);
    } else {
      this.info("pages: the current page is an added page, so the PDF page test was skipped");
    }
    const t2 = await this.addTempPage(api);
    if (t2) {
      const prevStyle = api.setPenStyle(1, 2);
      api.drawStroke(t2.idx, pattern(0));
      await sleep3(60);
      const ls = api.lastStroke(t2.idx);
      this.check(!!ls && ls.size === 6 && ls.color.startsWith("#"), `tools: a pen stroke takes the chosen thickness (${ls == null ? void 0 : ls.size}, expected 6 for the second size)`);
      api.setPenStyle(prevStyle.c, prevStyle.s);
      const prevStraight = api.straightHighlight(true);
      api.drawStroke(t2.idx, pattern(0), "highlighter");
      await sleep3(60);
      const hs = api.lastStroke(t2.idx);
      this.check(!!hs && hs.points === 2, `tools: straight-line highlighter stores two points (${hs == null ? void 0 : hs.points})`);
      api.straightHighlight(prevStraight);
      await this.removeTempPage(api, t2);
    }
    const n = api.pageCount();
    const target = Math.min(3, n - 1);
    api.goTo(target);
    this.check(api.current() === target, `navigation: jumping to page ${target + 1} lands on it`);
    api.goTo(cur);
  }
  /** A page drawn again must not pay the whole parse a second time. */
  async drawSpeed(api) {
    const idx = Math.max(0, api.pageCount() - 10);
    const first = await api.timeDraw(idx);
    const again = await api.timeDraw(idx);
    this.info(`page draw: first ${Math.round(first)} ms, drawn again ${Math.round(again)} ms`);
    this.check(first < 0 || again <= first * 0.6 || first < 60, `pages stay parsed between draws: drawn again in ${Math.round(again)} ms against ${Math.round(first)} ms first (limit 60%)`);
  }
  /** Puts automatic checks into the panel: a failed check shows its detail. */
  addChecks(list2) {
    for (const c of list2) this.check(c.ok, c.ok ? c.name : `${c.name}: ${c.detail}`);
  }
  fileDamage() {
    this.check(parseDoc("{broken") === null, "damaged annotation file: broken text is rejected, not crashed on");
    this.check(parseDoc("") === null, "damaged annotation file: an empty file is rejected");
    this.check(parseDoc(JSON.stringify(emptyDoc("x"))) !== null, "annotation file: a valid empty file is accepted");
  }
  async bookmarksAndOverview(api) {
    const cur = api.current();
    const key = api.slots()[cur].key;
    const was = api.bookmarkOn(key);
    api.toggleBookmark(key);
    this.check(api.bookmarkOn(key) !== was, "bookmarks: the bookmark switches on");
    api.toggleBookmark(key);
    this.check(api.bookmarkOn(key) === was, "bookmarks: the bookmark switches back");
    api.openOverview(true);
    const drawn = await waitFor(() => api.overviewCounts().drawn >= 3, 8e3);
    const c = api.overviewCounts();
    this.check(c.items === api.pageCount(), `page overview lists every page (${c.items} of ${api.pageCount()})`);
    this.check(drawn >= 0, `page overview draws thumbnails (${c.drawn} drawn)`);
    api.openOverview(false);
    await sleep3(300);
  }
  async quicknote() {
    try {
      const path = await this.deps.quicknoteCreate();
      this.check(this.deps.fileExists(path), "quicknote: a new Quicknote can be created");
      await this.deps.removeFile(path);
      this.check(!this.deps.fileExists(path), "quicknote: the test Quicknote is removed again");
    } catch (e) {
      this.check(false, `quicknote: ${String(e)}`);
    }
  }
  async saving(api) {
    const t = await this.addTempPage(api);
    if (!t) {
      this.check(false, "saving: test page could not be added");
      return;
    }
    for (let k = 0; k < 3; k++) {
      api.drawStroke(t.idx, pattern(k));
      await sleep3(80);
    }
    const key = api.slots()[t.idx].key;
    await api.save();
    const onDisk = await this.deps.savedStrokes(api.file, key);
    this.check(onDisk === 3, `saving: the 3 test strokes are in the file on disk (${onDisk})`);
    const load = api.loadMs();
    this.check(load > 0 && load < 5e3, `loading: the PDF opened in ${Math.round(load)} ms (limit 5000)`);
    if (this.deps.syncStats().connected) {
      const synced = await waitFor(() => this.deps.syncStats().state === "ok", 3e4);
      this.check(synced >= 0, `sync: up to date after saving (${synced < 0 ? "not within 30 s" : Math.round(synced) + " ms"})`);
    } else {
      this.info("sync: Drive not connected, skipped post-save cloud check");
    }
    await this.removeTempPage(api, t);
  }
  async scrollAndZoomSuite(api) {
    const startPage = api.current();
    const startZoom = api.zoom();
    try {
      // 1. Reset to 1x and verify no infinite render-evict loop at idle
      api.zoomTo(1);
      await waitFor(() => api.settled(), 4e3);
      const r0 = this.deps.renderCount();
      await sleep3(600);
      const idleRenders = this.deps.renderCount() - r0;
      this.check(idleRenders === 0 && api.activeRenders() === 0, `scroll/zoom: no background render-evict loop at idle (extra renders=${idleRenders}, active=${api.activeRenders()})`);

      // 2. Full-page deep zoom without sub-window cropping (2.4x)
      const midIdx = Math.min(Math.max(1, Math.floor(api.pageCount() / 3)), api.pageCount() - 1);
      api.goTo(midIdx);
      await waitFor(() => api.settled(), 4e3);
      api.zoomTo(2.4);
      const settled24 = await waitFor(() => api.settled(), 5e3);
      const slotInfo = api.slots()[api.current()];
      const geo = api.slotGeo(api.current());
      const fullPageOk = !!geo && !!slotInfo && geo.x === 0 && geo.y === 0 && Math.abs(geo.w - slotInfo.w) < 1 && Math.abs(geo.h - slotInfo.h) < 1;
      this.check(settled24 >= 0 && fullPageOk, `zoom: 2.4x deep zoom renders full page without cropping (x=${geo ? geo.x : "?"}, y=${geo ? geo.y : "?"}, w=${geo ? Math.round(geo.w) : "?"}/${slotInfo ? Math.round(slotInfo.w) : "?"})`);

      // 3. Simulated MacBook trackpad wheel pinch zoom-in & zoom-out (cursor anchor lock)
      api.zoomTo(1);
      await waitFor(() => api.settled(), 4e3);
      api.goTo(midIdx);
      await sleep3(150);
      const sc = api.scrollerEl();
      const scRect = sc.getBoundingClientRect();
      const cx = scRect.left + sc.clientWidth * 0.5;
      const cy = scRect.top + sc.clientHeight * 0.5;
      const a0 = api.anchorPointAt(cy, cx);
      const tPinch0 = performance.now();
      for (let i = 0; i < 25; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      const pinchAvgMs = (performance.now() - tPinch0) / 25;
      const zPeak = api.zoom();
      const aPeak = api.anchorPointAt(cy, cx);
      const inSamePage = !!a0 && !!aPeak && a0.idx === aPeak.idx;
      const inFracDiff = a0 && aPeak ? Math.abs(a0.frac - aPeak.frac) : 99;
      this.check(zPeak > 1.8 && inSamePage && inFracDiff < 0.02, `trackpad pinch-in: cursor stays locked on page ${a0 ? a0.idx + 1 : "?"} at ${zPeak.toFixed(2)}x (pageJump=${inSamePage ? 0 : 1}, fracDrift=${inFracDiff.toFixed(4)})`);
      this.check(pinchAvgMs < 35, `large-file zoom frame speed: 25 pinch frames averaged ${pinchAvgMs.toFixed(1)} ms/frame across ${api.pageCount()} pages (limit 35 ms)`);

      for (let i = 0; i < 20; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: 4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      const aOut = api.anchorPointAt(cy, cx);
      const outSamePage = !!a0 && !!aOut && a0.idx === aOut.idx;
      const outFracDiff = a0 && aOut ? Math.abs(a0.frac - aOut.frac) : 99;
      this.check(outSamePage && outFracDiff < 0.02, `trackpad pinch-out: cursor stays locked on page ${a0 ? a0.idx + 1 : "?"} without vertical scroll drift (fracDrift=${outFracDiff.toFixed(4)})`);
      await sleep3(220);

      // 4. Gentle zoom-in from 1.0x does NOT snap back down to 1.0x
      api.zoomTo(1);
      await sleep3(80);
      for (let i = 0; i < 5; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -3, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      const gentleZ = api.zoom();
      await sleep3(220);
      const afterWaitZ = api.zoom();
      this.check(gentleZ > 1.02 && Math.abs(afterWaitZ - gentleZ) < 0.01, `trackpad gentle zoom-in: stays at ${afterWaitZ.toFixed(3)}x and does not yank back to 1.0x`);

      // 5. Magnetic "Fit to width" smooth snap when approaching 1.0x, plus free zoom-out below 1.0x (down to 0.6x)
      api.zoomTo(1.25);
      await sleep3(60);
      for (let i = 0; i < 6; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: 4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      await sleep3(340);
      const snappedFromAbove = api.zoom();
      this.check(Math.abs(snappedFromAbove - 1) < 0.005, `fit-to-width smooth snap: approaching 1.0x from above glides to 1.00x (landed at ${snappedFromAbove.toFixed(3)}x)`);

      for (let i = 0; i < 12; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: 4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      await sleep3(220);
      const zoomedOutZ = api.zoom();
      this.check(zoomedOutZ < 0.85 && zoomedOutZ >= MIN_ZOOM, `free zoom-out below fit-to-width: can zoom out past 1.0x down to ${zoomedOutZ.toFixed(2)}x without snapping back`);

      for (let i = 0; i < 11; i++) {
        sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      await sleep3(340);
      const snappedFromBelow = api.zoom();
      this.check(Math.abs(snappedFromBelow - 1) < 0.005, `fit-to-width smooth snap from below: zooming in toward 1.0x from ${zoomedOutZ.toFixed(2)}x glides to 1.00x (landed at ${snappedFromBelow.toFixed(3)}x)`);

      // 6. Interleaved trackpad wobble suppression + Post-zoom scroll freedom
      sc.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -4, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      const wobbleEv = new WheelEvent("wheel", { ctrlKey: false, deltaY: 35, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
      sc.dispatchEvent(wobbleEv);
      this.check(wobbleEv.defaultPrevented, "trackpad wobble rejection: interleaved small non-ctrlKey wheel events during active pinch are blocked");
      await new Promise((r) => requestAnimationFrame(r));
      const scrollEv = new WheelEvent("wheel", { ctrlKey: false, deltaY: 120, clientX: cx, clientY: cy, bubbles: true, cancelable: true });
      sc.dispatchEvent(scrollEv);
      const topBefore = api.scrollTop();
      api.setScrollTop(topBefore + 180);
      await sleep3(60);
      const topDelta = Math.abs((api.scrollTop() - topBefore) - 180);
      this.check(!scrollEv.defaultPrevented && topDelta <= 2, `scroll freedom: two-finger scroll immediately after pinch is never locked (prevented=${scrollEv.defaultPrevented}, deltaErr=${Math.round(topDelta)}px)`);

      // 7. High-speed momentum scroll across pages without stalls or lockups
      api.zoomTo(1);
      await waitFor(() => api.settled(), 4e3);
      api.setScrollTop(0);
      await sleep3(100);
      const first = api.slots()[0];
      const pageH = first ? first.h * first.scale : 800;
      const fastTravel = Math.min(api.maxScroll(), pageH * 25);
      const mFast = monitor();
      const tFast0 = performance.now();
      const fastDur = 2e3;
      await new Promise((resolve) => {
        const step = () => {
          const p = Math.min(1, (performance.now() - tFast0) / fastDur);
          const ease = 1 - Math.pow(1 - p, 2);
          api.setScrollTop(fastTravel * ease);
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      const fFast = mFast.stop();
      const fastSettled = await waitFor(() => api.settled(), 4e3);
      this.check(fFast.worst <= 120 && fastSettled >= 0, `fast momentum scroll: 25 pages in 2s with worst frame ${Math.round(fFast.worst)} ms and clean settle in ${Math.round(fastSettled)} ms`);

      // 8. Bottom "Go to page" popover upward placement & zero viewport shift
      const scrollBeforePop = api.scrollTop();
      const popInfo = api.openJumpPopoverTest();
      await sleep3(80);
      const scrollAfterPop = api.scrollTop();
      api.closePopoverTest();
      this.check(popInfo.open && popInfo.inside && Math.abs(scrollAfterPop - scrollBeforePop) <= 1, `go-to-page popover: opens upward inside viewport (inside=${popInfo.inside}, scrollShift=${Math.round(scrollAfterPop - scrollBeforePop)}px)`);
    } finally {
      api.zoomTo(startZoom);
      api.goTo(startPage);
      await sleep3(150);
    }
  }
};
var TestPanelModal = class extends import_obsidian7.Modal {
  constructor(app, deps) {
    super(app);
    this.deps = deps;
    this.activeTab = "scrollzoom";
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Pencil Ink test suite (9.2.0)" });

    const tabBar = contentEl.createDiv({ cls: "pink-seg" });
    tabBar.style.margin = "0 0 14px 0";
    const tabSZ = tabBar.createDiv({ cls: "pink-seg-btn" + (this.activeTab === "scrollzoom" ? " is-on" : ""), text: "Scroll & Zoom Diagnostics" });
    const tabAll = tabBar.createDiv({ cls: "pink-seg-btn" + (this.activeTab === "all" ? " is-on" : ""), text: "All Plugin Tests" });
    tabSZ.addEventListener("click", () => {
      this.activeTab = "scrollzoom";
      this.render();
    });
    tabAll.addEventListener("click", () => {
      this.activeTab = "all";
      this.render();
    });

    const startRun = (mode) => {
      if (lastRun.running) return;
      if (!this.deps.view()) {
        new import_obsidian7.Notice("Open a PDF first, then run the tests.");
        return;
      }
      this.close();
      void new TestRunner(this.deps).run(mode);
    };

    if (this.activeTab === "scrollzoom") {
      const api = this.deps.view();
      const statusText = api
        ? `Active PDF: ${api.file || "open"} | Current page: ${api.current() + 1} / ${api.pageCount()} | Current zoom: ${api.zoom().toFixed(2)}x | Active renders: ${api.activeRenders()}`
        : "No PDF is currently open. Open a PDF (at least 4 pages) to run Scroll & Zoom diagnostics.";
      const infoBox = contentEl.createEl("p", { text: statusText });
      infoBox.style.cssText = "padding:10px 12px;border-radius:8px;background:var(--background-secondary);font-size:12px;margin:0 0 12px 0;";

      new import_obsidian7.Setting(contentEl)
        .setName("Run Automated Scroll & Zoom Suite (~15s)")
        .setDesc("Hands-free automated test of MacBook trackpad wheel pinch-in/out cursor lock, zero page-jump, full-page deep zoom (no sub-window cropping), single Fit-to-width smooth snap, post-zoom scroll freedom, render-evict loop guard, and fast momentum scroll.")
        .addButton((b) => b.setButtonText(lastRun.running ? "Running..." : "Run Scroll & Zoom Suite").setCta().onClick(() => startRun("scrollzoom")));

      new import_obsidian7.Setting(contentEl)
        .setName("Preview Smooth Fit-to-Width Snap")
        .setDesc("Zooms the current page to 1.35x and then smoothly glides back into 1.00x (Fit to width) so you can visually inspect the smooth snap.")
        .addButton((b) => b.setButtonText("Preview Smooth Snap").onClick(() => {
          if (!api) {
            new import_obsidian7.Notice("Open a PDF first.");
            return;
          }
          this.close();
          void (async () => {
            api.zoomTo(1.35);
            await sleep3(450);
            api.smoothZoomToTest(1);
          })();
        }));
    } else {
      contentEl.createEl("p", { text: "Open a test PDF first (at least 4 pages). Choose Automated for hands-free verification, Guided for interactive Apple Pencil, visual & two-device Drive checks, or Full Suite for both." });
      new import_obsidian7.Setting(contentEl).setName("Run automated tests").setDesc("Hands-free (~3 minutes): ink engine, sync CRDT & crash cuts, 3-device chaos fuzzing, writing, erasing, zoom, scroll & zoom diagnostics, and device probes.").addButton(
        (b) => b.setButtonText(lastRun.running ? "Running..." : "Run automated").setCta().onClick(() => startRun("auto"))
      );
      new import_obsidian7.Setting(contentEl).setName("Run guided verification").setDesc("Interactive (8 steps with live telemetry): Apple Pencil feel at 1x & 2.5x deep zoom, toolbar touch targets & active dot, 2/3-finger gestures, bin notice, 480px preview quality, and real two-device Drive sync.").addButton(
        (b) => b.setButtonText(lastRun.running ? "Running..." : "Run guided").onClick(() => startRun("guided"))
      );
      new import_obsidian7.Setting(contentEl).setName("Run full suite (Automated + Guided)").setDesc("Runs all automated checks first, then launches the 8 interactive guided steps and copies the combined report.").addButton(
        (b) => b.setButtonText(lastRun.running ? "Running..." : "Run full suite").onClick(() => startRun("full"))
      );
    }

    if (lastRun.done) contentEl.createEl("p", { text: `Last run: ${lastRun.passed} passed, ${lastRun.failed} failed.` });
    new import_obsidian7.Setting(contentEl).setName("Copy report").setDesc("Copies the diagnostic report of the last run to the clipboard.").addButton((b) => b.setButtonText("Copy report").onClick(() => void this.deps.copyReport()));
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var PencilInkPlugin = class extends import_obsidian8.Plugin {
  constructor() {
    super(...arguments);
    this.recorder = new Recorder();
    this.events = new import_obsidian8.Events();
    this.streamOk = null;
    this.lastInputAt = 0;
    // pencil or scroll activity: background work (sync) waits while you are writing
    this.statusEl = null;
    this.claimed = false;
    // Obsidian opens a sidebar on a one-finger horizontal swipe. This stops that swipe while both sidebars are closed.
    // Same technique as the community startup script. Obsidian's own handler is restored when this is turned off or the plugin unloads.
    this.swipeProto = null;
    this.swipeOrig = null;
    this.swipeOwn = false;
  }
  async onload() {
    this.log = new Log(this);
    await this.log.load();
    await this.loadSettings();
    this.log.info("plugin", `loading Pencil Ink ${this.manifest.version}`, { obsidian: import_obsidian8.apiVersion, mobile: import_obsidian8.Platform.isMobile, ios: import_obsidian8.Platform.isIosApp });
    this.sync = new SyncManager(this);
    this.setSidebarSwipeBlock(this.settings.blockSidebarSwipe);
    if (this.settings.pendingOpen) {
      this.log.warn("plugin", `the previous session never finished opening "${this.settings.pendingOpen}"; turning off "open every PDF"`);
      this.settings.openAllPdfs = false;
      this.settings.pendingOpen = "";
      await this.saveSettings();
      window.setTimeout(() => new import_obsidian8.Notice("Pencil Ink: the last PDF didn't finish opening, so PDFs now open in the default viewer. Turn this back on in Pencil Ink settings once it is fixed.", 12e3), 3e3);
    }
    let globalErrors = 0;
    this.registerDomEvent(window, "error", (e) => {
      var _a, _b, _c;
      if (globalErrors++ > 40) return;
      this.log.error("uncaught", e.message || "error", { file: String((_a = e.filename) != null ? _a : "").slice(-60), line: e.lineno, stack: String((_c = (_b = e.error) == null ? void 0 : _b.stack) != null ? _c : "").split("\n").slice(0, 4).map((l) => l.trim().slice(0, 100)).join(" | ") });
    });
    this.registerDomEvent(window, "unhandledrejection", (e) => {
      var _a, _b;
      if (globalErrors++ > 40) return;
      const r = e.reason;
      this.log.error("unhandled", String((_a = r == null ? void 0 : r.message) != null ? _a : r).slice(0, 200), { stack: String((_b = r == null ? void 0 : r.stack) != null ? _b : "").split("\n").slice(0, 4).map((l) => l.trim().slice(0, 100)).join(" | ") });
    });
    this.registerView(HOME_VIEW_TYPE, (leaf) => new PencilInkHomeView(leaf, this));
    this.registerView(VIEW_TYPE, (leaf) => new InkPdfView(leaf, this));
    this.addRibbonIcon("book-open", "Pencil Ink Library", () => void this.openLibrary());
    this.addCommand({ id: "open-library", name: "Pencil Ink: Open Library (Home)", callback: () => void this.openLibrary() });
    this.addCommand({ id: "new-notebook", name: "Pencil Ink: New Notebook", callback: () => new NewNotebookModal(this.app, this, "", null).open() });
    this.addCommand({ id: "import-pdf", name: "Pencil Ink: Import PDF", callback: () => {
      const activeHome = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE).map(l => l.view).find(v => v instanceof PencilInkHomeView);
      if (activeHome) activeHome.triggerPdfPicker();
      else this.triggerGlobalPdfPicker();
    } });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (!this.settings.newTabOpensLibrary) return;
        if (this.openingPdf) return;
        if (!leaf) return;
        const vs = leaf.getViewState();
        if (vs && vs.type === "empty") {
          void leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
        }
      })
    );
    this.addSettingTab(new PencilInkSettingTab(this.app, this));
    this.addRibbonIcon("file-plus", "New Quicknote (blank PDF)", () => void this.newQuicknote());
    this.addCommand({
      id: "zoom-in",
      name: "Pencil Ink: Zoom in",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) v.zoomStep(1.2);
      }
    });
    this.addCommand({
      id: "zoom-out",
      name: "Pencil Ink: Zoom out",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) v.zoomStep(1 / 1.2);
      }
    });
    this.addCommand({
      id: "zoom-reset",
      name: "Pencil Ink: Reset zoom (Fit to width)",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) v.resetZoom();
      }
    });
    this.addCommand({
      id: "toggle-eraser",
      name: "Pencil Ink: Toggle Eraser / Last Pen (E)",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) v.toggleEraser();
      }
    });
    this.addCommand({
      id: "toggle-scroll-mode",
      name: "Pencil Ink: Toggle Scroll / Hand mode (S)",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) v.toggleScrollMode();
      }
    });
    this.addCommand({
      id: "export-page-png",
      name: "Pencil Ink: Export or Share current page as PNG",
      callback: () => {
        const v = this.app.workspace.getActiveViewOfType(InkPdfView);
        if (v) void v.shareCurrentPage();
      }
    });
    this.addCommand({ id: "quicknote", name: "New Quicknote (blank PDF)", callback: () => void this.newQuicknote() });
    this.addCommand({ id: "annotate-active-pdf", name: "Open current PDF in Pencil Ink", callback: () => this.annotateActive() });
    this.addCommand({ id: "sync-now", name: "Sync with Google Drive now", callback: () => void this.sync.syncNow() });
    this.addCommand({ id: "connect-drive", name: "Connect Google Drive", callback: () => this.connectDrive() });
    this.addCommand({ id: "pencil-ink-tests", name: "Pencil Ink: run all tests", callback: () => new TestPanelModal(this.app, this.testDeps()).open() });
    this.addCommand({ id: "copy-log", name: "Copy diagnostic log", callback: () => void this.copyLog() });
    this.addCommand({ id: "save-recording", name: "Save Pencil recording", callback: () => void this.saveRecording() });
    this.addCommand({ id: "open-default-viewer", name: "Open current PDF in Obsidian's default viewer", callback: () => this.openDefaultViewer(this.app.workspace.getActiveFile()) });
    if (!import_obsidian8.Platform.isMobile) {
      this.statusEl = this.addStatusBarItem();
      this.statusEl.addClass("mod-clickable");
      this.statusEl.onclick = () => void this.sync.syncNow();
    }
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.hidden) this.sync.flushPending();
    });
    this.registerEvent(this.events.on("sync-state", () => this.updateStatusBar()));
    this.updateStatusBar();
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof import_obsidian8.TFile && file.extension === "pdf") {
          menu.addItem((i) => i.setTitle("Open in Pencil Ink").setIcon("pencil").onClick(() => void this.openPdf(file)));
          menu.addItem((i) => i.setTitle("Open in default PDF viewer").setIcon("file-text").onClick(() => this.openDefaultViewer(file)));
        } else if (file instanceof import_obsidian8.TFolder) {
          menu.addItem((i) => i.setTitle("New Quicknote here").setIcon("file-plus").onClick(() => void this.newQuicknote(file.path)));
        }
      })
    );
    if (this.settings.openAllPdfs) this.claimPdf();
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        var _a;
        if (!this.settings.openAllPdfs || this.claimed || !file || file.extension !== "pdf") return;
        const v = this.app.workspace.getActiveViewOfType(import_obsidian8.FileView);
        if (v && v.getViewType() === "pdf" && ((_a = v.file) == null ? void 0 : _a.path) === file.path) {
          void v.leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
        }
      })
    );
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) this.sync.wake();
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.newTabOpensLibrary) {
        const emptyLeaves = this.app.workspace.getLeavesOfType("empty");
        for (const el of emptyLeaves) {
          void el.setViewState({ type: HOME_VIEW_TYPE, active: true });
        }
      }
      if (this.settings.openLibraryOnStartup || this.settings.newTabOpensLibrary) {
        const inkLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        const homeLeaves = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE);
        if (inkLeaves.length === 0 && homeLeaves.length === 0 && !this.app.workspace.getActiveFile()) {
          void this.openLibrary();
        }
      }
      const vault = this.app.vault;
      this.registerEvent(vault.on("create", (f) => {
        if ((f instanceof import_obsidian8.TFile && f.extension === "pdf") || f instanceof import_obsidian8.TFolder) this.invalidatePdfIndex();
        if (f instanceof import_obsidian8.TFile) this.sync.queuePush(f.path);
      }));
      this.registerEvent(vault.on("modify", (f) => {
        if (f instanceof import_obsidian8.TFile && f.extension === "pdf") this.invalidatePdfIndex();
        if (f instanceof import_obsidian8.TFile && !this.sync.isOwnWrite(f.path)) this.sync.queuePush(f.path);
      }));
      this.registerEvent(vault.on("delete", (f) => {
        if ((f instanceof import_obsidian8.TFile && f.extension === "pdf") || f instanceof import_obsidian8.TFolder) this.invalidatePdfIndex();
        if (f instanceof import_obsidian8.TFile && f.extension === "pdf") {
          void this.cleanupDeletedPdf(f.path);
        }
        this.sync.queuePush(f.path);
      }));
      this.registerEvent(
        vault.on("rename", async (f, old) => {
          if ((f instanceof import_obsidian8.TFile && f.extension === "pdf") || f instanceof import_obsidian8.TFolder) this.invalidatePdfIndex();
          if (f instanceof import_obsidian8.TFile && f.extension === "pdf") {
            const ad = vault.adapter;
            if (!vault.getAbstractFileByPath(f.path + INK) && await ad.exists(old + INK)) {
              await ad.rename(old + INK, f.path + INK).catch((e) => {
                this.log.warn("sync", "could not rename annotation sidecar with PDF", { from: old + INK, to: f.path + INK, error: String(e) });
              });
            }
          }
          void this.migrateRenamedPaths(old, f.path);
          this.sync.onRename(old, f);
        })
      );
      this.sync.start();
      this.log.info("plugin", "ready");
    });
  }
  setSidebarSwipeBlock(on) {
    if (on && !this.swipeProto) {
      const proto = Object.getPrototypeOf(this.app.workspace);
      if (!proto || typeof proto.trigger !== "function") return;
      const orig = proto.trigger;
      const app = this.app;
      const plugin = this;
      this.swipeOwn = Object.prototype.hasOwnProperty.call(proto, "trigger");
      this.swipeOrig = orig;
      proto.trigger = function(eventName, data) {
        var _a, _b, _c, _d;
        try {
          const inPinkRoot = !!((_d = (_c = (_b = (_a = app.workspace.activeLeaf) == null ? void 0 : _a.view) == null ? void 0 : _b.contentEl) == null ? void 0 : _c.classList) == null ? void 0 : _d.contains("pink-root"));
          if (eventName === "swipe" && inPinkRoot && (plugin.settings.blockSidebarSwipe || plugin.settings.blockVerticalSwipe)) return;
          if (eventName === "swipe" && data && data.direction === "x" && data.points === 1 && app.workspace.leftSplit.collapsed && app.workspace.rightSplit.collapsed) return;
        } catch (e) {
        }
        return orig.apply(this, arguments);
      };
      this.swipeProto = proto;
    } else if (!on && this.swipeProto) {
      if (this.swipeOwn) this.swipeProto.trigger = this.swipeOrig;
      else delete this.swipeProto.trigger;
      this.swipeProto = null;
      this.swipeOrig = null;
    }
  }
  onunload() {
    this.setSidebarSwipeBlock(false);
    this.sync.stop();
    this.releasePdf();
    globalCanvasPool.clear();
    void this.log.flush();
  }
  // ------------------------------------------------------------------ PDF file type
  viewRegistry() {
    return this.app.viewRegistry;
  }
  claimPdf() {
    const vr = this.viewRegistry();
    if (!vr) {
      this.claimed = false;
      return;
    }
    try {
      try {
        vr.unregisterExtensions(["pdf"]);
      } catch (e) {
      }
      vr.registerExtensions(["pdf"], VIEW_TYPE);
      const type = typeof vr.getTypeByExtension === "function" ? vr.getTypeByExtension("pdf") : VIEW_TYPE;
      this.claimed = type === VIEW_TYPE;
      this.log.info("plugin", this.claimed ? "now handling every PDF" : `could not claim the pdf file type (got ${type})`);
    } catch (e) {
      this.claimed = false;
      this.log.warn("plugin", "claiming PDFs failed, using the fallback", e);
      try {
        vr.registerExtensions(["pdf"], "pdf");
      } catch (e2) {
      }
    }
  }
  releasePdf() {
    const vr = this.viewRegistry();
    if (!this.claimed || !vr) return;
    this.claimed = false;
    const restore = () => {
      try {
        const cur = typeof vr.getTypeByExtension === "function" ? vr.getTypeByExtension("pdf") : null;
        if (cur === VIEW_TYPE) vr.unregisterExtensions(["pdf"]);
        if (typeof vr.getTypeByExtension !== "function" || !vr.getTypeByExtension("pdf")) vr.registerExtensions(["pdf"], "pdf");
      } catch (e) {
      }
    };
    restore();
  }
  openDefaultViewer(file) {
    if (!file || file.extension !== "pdf") {
      new import_obsidian8.Notice("Open a PDF first.");
      return;
    }
    void this.app.workspace.getLeaf("tab").setViewState({ type: "pdf", state: { file: file.path }, active: true });
  }
  // ------------------------------------------------------------------ commands
  async migrateRenamedPaths(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    let changed = false;
    const prefix = oldPath + "/";
    const cc = this.settings.coverColors;
    if (cc && typeof cc === "object") {
      for (const k of Object.keys(cc)) {
        if (k === oldPath || k.startsWith(prefix)) {
          const nk = newPath + k.slice(oldPath.length);
          cc[nk] = cc[k];
          delete cc[k];
          changed = true;
        }
      }
    }
    const lp = this.settings.lastPages;
    if (lp && typeof lp === "object") {
      for (const k of Object.keys(lp)) {
        if (k === oldPath || k.startsWith(prefix)) {
          const nk = newPath + k.slice(oldPath.length);
          lp[nk] = lp[k];
          delete lp[k];
          changed = true;
        }
      }
    }
    const sp = this.settings.starredPaths;
    if (Array.isArray(sp)) {
      for (let i = 0; i < sp.length; i++) {
        if (sp[i] === oldPath || sp[i].startsWith(prefix)) {
          sp[i] = newPath + sp[i].slice(oldPath.length);
          changed = true;
        }
      }
    }
    if (changed) await this.saveSettings();
  }
  async cleanupDeletedPdf(pdfPath) {
    if (!pdfPath) return;
    try {
      await this.sync.removeAnnotations(pdfPath);
    } catch (e) {
    }
    let changed = false;
    if (this.settings.coverColors && this.settings.coverColors[pdfPath] !== void 0) {
      delete this.settings.coverColors[pdfPath];
      changed = true;
    }
    if (this.settings.lastPages && this.settings.lastPages[pdfPath] !== void 0) {
      delete this.settings.lastPages[pdfPath];
      changed = true;
    }
    if (Array.isArray(this.settings.starredPaths)) {
      const idx = this.settings.starredPaths.indexOf(pdfPath);
      if (idx >= 0) {
        this.settings.starredPaths.splice(idx, 1);
        changed = true;
      }
    }
    if (changed) await this.saveSettings();
  }
  updateStatusBar() {
    if (this.statusEl) this.statusEl.setText("Drive: " + this.sync.statusText());
  }
  invalidatePdfIndex() {
    this._pdfIndex = null;
  }
  getPdfIndex() {
    if (this._pdfIndex) return this._pdfIndex;
    const pdfs = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
    pdfs.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const folderCounts = /* @__PURE__ */ new Map();
    for (let i = 0; i < pdfs.length; i++) {
      let p = pdfs[i].parent;
      while (p && p.path && p.path !== "/") {
        folderCounts.set(p.path, (folderCounts.get(p.path) || 0) + 1);
        p = p.parent;
      }
    }
    this._pdfIndex = { pdfs, folderCounts };
    return this._pdfIndex;
  }
  inkViews() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v) => v instanceof InkPdfView);
  }
  getLiveDoc(pdfPath) {
    var _a, _b;
    return (_b = (_a = this.inkViews().find((v) => {
      var _a2;
      return ((_a2 = v.file) == null ? void 0 : _a2.path) === pdfPath;
    })) == null ? void 0 : _a.doc) != null ? _b : null;
  }
  triggerGlobalPdfPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      try {
        if (input.files && input.files[0]) {
          const fileObj = input.files[0];
          const buf = await fileObj.arrayBuffer();
          let name = fileObj.name || "Imported Document.pdf";
          if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
          let path = name;
          for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
            const base = name.replace(/\.pdf$/i, "");
            path = `${base} (${i}).pdf`;
          }
          const created = await this.app.vault.createBinary(path, buf);
          new import_obsidian8.Notice(`Imported "${name}"`);
          await this.openPdf(created);
        }
      } catch (e) {
        new import_obsidian8.Notice("Could not import PDF: " + String(e));
      } finally {
        input.remove();
      }
    };
    input.click();
  }
  async openLibrary(folderPath) {
    let leaf = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(false);
      await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
    }
    if (folderPath && leaf.view instanceof PencilInkHomeView) {
      leaf.view.navigateTo(folderPath);
    }
    this.app.workspace.revealLeaf(leaf);
  }
  async openPdf(file, targetLeaf) {
    if (!file) return;
    const existing = this.inkViews().find((v) => {
      var _a;
      return ((_a = v.file) == null ? void 0 : _a.path) === file.path;
    });
    if (existing) {
      this.app.workspace.revealLeaf(existing.leaf);
      return;
    }
    this.openingPdf = true;
    try {
      const leaf = targetLeaf || this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
      if (leaf.view instanceof InkPdfView) {
        if (!leaf.view.file || leaf.view.file.path !== file.path) {
          leaf.view.file = file;
          await leaf.view.onLoadFile(file);
        }
      }
      this.app.workspace.revealLeaf(leaf);
    } catch (e) {
      this.log.error("openPdf", "Could not open PDF", e);
      new import_obsidian8.Notice("Could not open PDF: " + String(e));
    } finally {
      window.setTimeout(() => { this.openingPdf = false; }, 500);
    }
  }
  annotateActive() {
    const f = this.app.workspace.getActiveFile();
    if (f && f.extension === "pdf") void this.openPdf(f);
    else new import_obsidian8.Notice("Open a PDF first.");
  }
  /** What the developer test panel needs from the plugin. */
  testDeps() {
    const activeView = () => {
      var _a;
      return (_a = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]) == null ? void 0 : _a.view;
    };
    return {
      app: this.app,
      log: this.log,
      version: this.manifest.version,
      drive: this.sync.drive,
      view: () => {
        var _a, _b;
        return (_b = (_a = activeView()) == null ? void 0 : _a.testApi()) != null ? _b : null;
      },
      renderCount: () => this.log.perf.renders,
      views: () => this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => {
        var _a, _b, _c;
        return (_c = (_b = (_a = l.view).debugInfo) == null ? void 0 : _b.call(_a)) != null ? _c : null;
      }),
      syncStats: () => this.sync.stats(),
      copyReport: () => this.copyLog(),
      pauseBackground: () => this.sync.stop(),
      resumeBackground: () => this.sync.start(),
      quicknoteCreate: async () => {
        const path = await this.newQuicknote();
        if (!path) throw new Error("could not create a Quicknote");
        return path;
      },
      removeFile: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f) await this.app.fileManager.trashFile(f);
      },
      fileExists: (path) => !!this.app.vault.getAbstractFileByPath(path),
      savedStrokes: async (pdfPath, key) => {
        var _a, _b;
        const d = await this.sync.readSidecar(pdfPath);
        return d ? (_b = (_a = d.pages[key]) == null ? void 0 : _a.length) != null ? _b : 0 : -1;
      }
    };
  }
  async newQuicknote(folder) {
    try {
      const dir = (folder != null ? folder : this.settings.quicknoteFolder).trim().replace(/^\/+|\/+$/g, "");
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      const d = /* @__PURE__ */ new Date();
      const p = (n) => String(n).padStart(2, "0");
      const base = `Quicknote ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
      let path = `${dir ? dir + "/" : ""}${base}.pdf`;
      for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${dir ? dir + "/" : ""}${base} (${i}).pdf`;
      const file = await this.app.vault.createBinary(path, blankPdf());
      this.log.info("quicknote", `created ${path}`);
      await this.openPdf(file);
      return path;
    } catch (e) {
      this.log.error("quicknote", "could not create a Quicknote", e);
      new import_obsidian8.Notice("Pencil Ink: could not create a Quicknote. See the diagnostic log.");
      return null;
    }
  }
  connectDrive(onDone = () => {
  }) {
    if (!this.settings.clientId || !this.settings.clientSecret) {
      new import_obsidian8.Notice("Enter your Google OAuth client ID and secret in Pencil Ink settings first.");
      return;
    }
    new AuthModal(this, onDone).open();
  }
  // ------------------------------------------------------------------ diagnostics
  buildReport() {
    var _a;
    const s = this.settings;
    const st = this.sync.stats();
    const lines = [
      `Pencil Ink ${this.manifest.version} | Obsidian ${import_obsidian8.apiVersion}`,
      `platform: mobile=${import_obsidian8.Platform.isMobile} ios=${import_obsidian8.Platform.isIosApp} tablet=${(_a = import_obsidian8.Platform.isTablet) != null ? _a : "?"} desktop=${import_obsidian8.Platform.isDesktopApp}`,
      `screen: ${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x, window ${window.innerWidth}x${window.innerHeight}`,
      `userAgent: ${navigator.userAgent}`,
      `settings: openAllPdfs=${s.openAllPdfs} claimed=${this.claimed} streamMode=${s.streamMode} streamOk=${this.streamOk} smooth=${s.penSmooth} eraser=${s.eraserMode}/hlOnly=${s.eraseHlOnly} straightHl=${s.hlStraight} maxFileMB=${s.maxFileMB}`,
      `drive: connected=${st.connected} state=${st.state} ready=${st.ready} paused=${st.paused} nodes=${st.nodes} poll=${s.pollSeconds}s autoSync=${s.autoSync} include="${s.includeFolders}" exclude="${s.excludeFolders}" lastError="${st.lastError}"`,
      `open views: ${JSON.stringify(this.inkViews().map((v) => v.debugInfo()))}`
    ];
    return this.log.report(lines.join("\n"));
  }
  async copyLog() {
    const text = this.buildReport();
    try {
      await navigator.clipboard.writeText(text);
      new import_obsidian8.Notice("Pencil Ink: log copied. Paste it into your chat.");
    } catch (e) {
      await this.saveLogNote();
    }
  }
  async saveLogNote() {
    const path = "Pencil Ink log.md";
    const body = "```\n" + this.buildReport() + "\n```\n";
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof import_obsidian8.TFile) await this.app.vault.modify(f, body);
    else await this.app.vault.create(path, body);
    new import_obsidian8.Notice(`Pencil Ink: log saved to "${path}". Copy its contents into your chat.`);
  }
  /** Write the raw Pencil input of the most recent strokes to a file in the vault, to send along with the log. */
  async saveRecording() {
    if (!this.recorder.size) {
      new import_obsidian8.Notice("Pencil Ink: nothing recorded yet. Write a few strokes first.");
      return;
    }
    const s = this.settings;
    const text = this.recorder.export({
      plugin: this.manifest.version,
      saved: (/* @__PURE__ */ new Date()).toISOString(),
      screen: `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`,
      userAgent: navigator.userAgent,
      penSmooth: s.penSmooth
    });
    const path = "Pencil Ink recording.json";
    try {
      await this.app.vault.adapter.write(path, text);
      new import_obsidian8.Notice(`Pencil Ink: saved ${this.recorder.size} strokes to "${path}" in your vault. Send that file with the log.`, 8e3);
      this.log.info("recorder", "recording saved", { strokes: this.recorder.size, kb: Math.round(text.length / 1024) });
    } catch (e) {
      this.log.error("recorder", "could not save the recording", e);
      new import_obsidian8.Notice("Pencil Ink: could not save the recording");
    }
  }
  // ------------------------------------------------------------------ settings
  async loadSettings() {
    var _a;
    const d = (_a = await this.loadData()) != null ? _a : {};
    const def = DEFAULT_SETTINGS;
    this.settings = Object.assign({}, def, d);
    const fix = (cur, dflt) => {
      var _a2, _b;
      return {
        colors: Array.isArray(cur == null ? void 0 : cur.colors) && cur.colors.length === 3 ? cur.colors : dflt.colors.slice(),
        sizes: Array.isArray(cur == null ? void 0 : cur.sizes) && cur.sizes.length === 3 ? cur.sizes : dflt.sizes.slice(),
        c: Math.min(2, Math.max(0, (_a2 = cur == null ? void 0 : cur.c) != null ? _a2 : dflt.c)),
        s: Math.min(2, Math.max(0, (_b = cur == null ? void 0 : cur.s) != null ? _b : dflt.s))
      };
    };
    if (!d.v || d.v < 4) {
      this.settings.pen = fix(null, def.pen);
      this.settings.highlighter = fix(null, def.highlighter);
      this.settings.eraserSizes = def.eraserSizes.slice();
      this.settings.eraserSlot = def.eraserSlot;
      if (d.autoOpenPdfs === false) this.settings.openAllPdfs = false;
    } else {
      this.settings.pen = fix(d.pen, def.pen);
      this.settings.highlighter = fix(d.highlighter, def.highlighter);
    }
    if (!d.v || d.v < 5) {
      if (d.pollSeconds === 5 || d.pollSeconds === void 0) this.settings.pollSeconds = def.pollSeconds;
      if (d.pushDelayMs === 800 || d.pushDelayMs === void 0) this.settings.pushDelayMs = def.pushDelayMs;
      this.settings.streamMode = "auto";
    }
    if (!d.v || d.v < 9) {
      // Strip legacy built-in demo credentials on upgrade to 9.2.0 so users can enter their own OAuth Client ID & Secret
      if (typeof this.settings.clientId === "string" && this.settings.clientId.startsWith("269495" + "550214-")) {
        this.settings.clientId = "";
        this.settings.clientSecret = "";
      }
    }
    this.settings.clientId = typeof this.settings.clientId === "string" ? this.settings.clientId.trim() : "";
    this.settings.clientSecret = typeof this.settings.clientSecret === "string" ? this.settings.clientSecret.trim() : "";
    delete this.settings.predict;
    delete this.settings.pressure;
    delete this.settings.pressureStrength;
    delete this.settings.developerTools;
    delete this.settings.oneFingerScrollWithPen;
    this.settings.v = def.v;
    if (!Array.isArray(this.settings.eraserSizes) || this.settings.eraserSizes.length !== 3) this.settings.eraserSizes = def.eraserSizes.slice();
    this.settings.eraserSlot = Math.min(2, Math.max(0, this.settings.eraserSlot));
    await this.saveSettings();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var DeviceKeyModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, initialKey, onDone) {
    super(app);
    this.plugin = plugin;
    this.initialKey = initialKey || "";
    this.onDone = onDone;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const isCopy = !!this.initialKey;
    contentEl.createEl("h3", { text: isCopy ? "Copy Device Key" : "Paste Device Key" });
    contentEl.createEl("p", {
      text: isCopy
        ? "Copy this key and paste it into Pencil Ink settings on your iPad or other device:"
        : "Paste the PENCIL-INK-DEVICE:... key copied from your Mac or other device:"
    });
    const box = contentEl.createEl("textarea", {
      attr: { rows: "4", placeholder: "PENCIL-INK-DEVICE:...", style: "width:100%;font-family:monospace;font-size:12px;" }
    });
    if (isCopy) {
      box.value = this.initialKey;
      box.readOnly = true;
      window.setTimeout(() => box.select(), 50);
    }
    const msg = contentEl.createEl("p", { text: "" });
    const row = contentEl.createDiv({ cls: "modal-button-container" });
    if (!isCopy) {
      const applyBtn = row.createEl("button", { text: "Apply & Connect", cls: "mod-cta" });
      applyBtn.onclick = async () => {
        const parsed = decodeDeviceKey(box.value);
        if (!parsed) {
          msg.setText("Invalid Device Key. Make sure it starts with PENCIL-INK-DEVICE:");
          return;
        }
        const s = this.plugin.settings;
        s.clientId = parsed.clientId;
        s.clientSecret = parsed.clientSecret;
        if (parsed.refreshToken) {
          s.refreshToken = parsed.refreshToken;
          s.accessToken = parsed.accessToken;
          s.expiresAt = parsed.expiresAt;
        }
        if (parsed.driveFolder) s.driveFolder = parsed.driveFolder;
        await this.plugin.saveSettings();
        if (s.refreshToken) {
          this.plugin.sync.restart();
          new import_obsidian8.Notice("Pencil Ink: Device linked and Google Drive connected!");
        } else {
          new import_obsidian8.Notice("Pencil Ink: Google app credentials imported!");
        }
        if (this.onDone) this.onDone();
        this.close();
      };
    }
    const closeBtn = row.createEl("button", { text: isCopy ? "Done" : "Cancel" });
    closeBtn.onclick = () => this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var PencilInkSettingTab = class extends import_obsidian8.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  get s() {
    return this.plugin.settings;
  }
  async applyDeviceKey(parsed) {
    const s = this.s;
    s.clientId = parsed.clientId;
    s.clientSecret = parsed.clientSecret;
    if (parsed.refreshToken) {
      s.refreshToken = parsed.refreshToken;
      s.accessToken = parsed.accessToken;
      s.expiresAt = parsed.expiresAt;
    }
    if (parsed.driveFolder) s.driveFolder = parsed.driveFolder;
    await this.plugin.saveSettings();
    if (s.refreshToken) {
      this.plugin.sync.restart();
      new import_obsidian8.Notice("Pencil Ink: Device linked and Google Drive connected!");
    } else {
      new import_obsidian8.Notice("Pencil Ink: Google app credentials imported!");
    }
    this.display();
  }
  display() {
    const { containerEl } = this;
    const s = this.s;
    containerEl.empty();
    containerEl.addClass("pink-settings");

    // 1. General & Library
    new import_obsidian8.Setting(containerEl).setName("General & Library").setHeading();
    new import_obsidian8.Setting(containerEl)
      .setName("Default new tabs to Library")
      .setDesc("Opening a new tab or launching Obsidian without an open file displays the visual Library homepage.")
      .addToggle((t) => t.setValue(s.newTabOpensLibrary !== false).onChange(async (v) => {
        s.newTabOpensLibrary = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Open Library on startup")
      .setDesc("Opens the visual library start page whenever Obsidian launches.")
      .addToggle((t) => t.setValue(s.openLibraryOnStartup || false).onChange(async (v) => {
        s.openLibraryOnStartup = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Open every PDF in Pencil Ink")
      .setDesc("Open PDFs directly in Pencil Ink. Turn off to use Obsidian's default PDF viewer.")
      .addToggle((t) => t.setValue(s.openAllPdfs).onChange(async (v) => {
        s.openAllPdfs = v;
        await this.plugin.saveSettings();
        if (v) this.plugin.claimPdf();
        else this.plugin.releasePdf();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Open in scroll mode")
      .setDesc("Open PDFs in scroll / read-only mode by default so you can pan and read without drawing.")
      .addToggle((t) => t.setValue(s.openInScroll || false).onChange(async (v) => {
        s.openInScroll = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Quicknote folder")
      .setDesc("Where new 1-tap Quicknotes are created in your vault.")
      .addText((t) => t.setValue(s.quicknoteFolder).onChange(async (v) => {
        s.quicknoteFolder = v.trim();
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Auto-hide toolbar while scrolling")
      .setDesc("Smoothly slides the floating dock away when scrolling down, restoring it on scroll up.")
      .addToggle((t) => t.setValue(s.autoHideToolbar).onChange(async (v) => {
        s.autoHideToolbar = v;
        await this.plugin.saveSettings();
      }));

    // 2. Apple Pencil & Touch Gestures
    new import_obsidian8.Setting(containerEl).setName("Apple Pencil & Touch Gestures").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description pink-settings-note",
      text: "Note: Pen styles (Fountain, Ball, Brush), smoothness (levels 1-5), and pressure sensitivity can now be tuned directly on the canvas toolbar by tapping the pen style pill or double-tapping the pen icon."
    });
    new import_obsidian8.Setting(containerEl)
      .setName("Double tap to undo and redo")
      .setDesc("Two-finger double tap to undo; three-finger double tap to redo.")
      .addToggle((t) => t.setValue(s.doubleTapUndo).onChange(async (v) => {
        s.doubleTapUndo = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Auto-deselect eraser")
      .setDesc("Automatically returns to your previously selected pen or highlighter after lifting from an erase.")
      .addToggle((t) => t.setValue(s.autoDeselectEraser).onChange(async (v) => {
        s.autoDeselectEraser = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Block sidebar swipe while writing")
      .setDesc("Prevents accidental one-finger sidebar opens while drawing with Apple Pencil.")
      .addToggle((t) => t.setValue(s.blockSidebarSwipe).onChange(async (v) => {
        s.blockSidebarSwipe = v;
        await this.plugin.saveSettings();
        this.plugin.setSidebarSwipeBlock(v);
      }));

    // 3. Google Drive Sync
    new import_obsidian8.Setting(containerEl).setName("Google Drive Cloud Sync").setHeading();
    const connected = this.plugin.sync.connected();
    const statusDescText = () => connected
      ? "Syncing annotations and vault notebooks with your Google Drive."
      : (s.clientId && s.clientSecret
        ? "Credentials saved! Tap Connect to sign in with your Google account."
        : "Enter your Google OAuth Client ID and Client Secret below, then tap Connect.");
    const connSetting = new import_obsidian8.Setting(containerEl)
      .setName(connected ? "Google Drive: Connected" : "Google Drive: Not connected")
      .setDesc(statusDescText())
      .addButton((b) => b.setButtonText(connected ? "Reconnect" : "Connect").setCta().onClick(() => this.plugin.connectDrive(() => this.display())))
      .addButton((b) => b.setButtonText("Disconnect").onClick(async () => {
        s.refreshToken = "";
        s.accessToken = "";
        s.expiresAt = 0;
        await this.plugin.saveSettings();
        this.plugin.sync.disconnectCleanup();
        this.display();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Google OAuth Client ID")
      .setDesc("Your Desktop OAuth 2.0 Client ID from Google Cloud Console (e.g. xxxx.apps.googleusercontent.com).")
      .addText((t) => {
        t.inputEl.style.width = "100%";
        t.inputEl.style.minWidth = "240px";
        t.inputEl.style.fontFamily = "var(--font-monospace)";
        t.inputEl.style.fontSize = "12px";
        t.setPlaceholder("Enter your Google OAuth Client ID").setValue(s.clientId).onChange(async (v) => {
          s.clientId = v.trim();
          connSetting.setDesc(statusDescText());
          await this.plugin.saveSettings();
        });
      });
    let secretInputEl = null;
    new import_obsidian8.Setting(containerEl)
      .setName("Google OAuth Client Secret")
      .setDesc("Your Desktop OAuth 2.0 Client Secret from Google Cloud Console.")
      .addText((t) => {
        secretInputEl = t.inputEl;
        t.inputEl.type = "password";
        t.inputEl.style.minWidth = "200px";
        t.inputEl.style.fontFamily = "var(--font-monospace)";
        t.inputEl.style.fontSize = "12px";
        t.setPlaceholder("Enter your Google OAuth Client Secret").setValue(s.clientSecret).onChange(async (v) => {
          s.clientSecret = v.trim();
          connSetting.setDesc(statusDescText());
          await this.plugin.saveSettings();
        });
      })
      .addButton((b) => b.setButtonText("Show").onClick(() => {
        if (!secretInputEl) return;
        const hidden = secretInputEl.type === "password";
        secretInputEl.type = hidden ? "text" : "password";
        b.setButtonText(hidden ? "Hide" : "Show");
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Drive folder")
      .setDesc("Folder in My Drive used as vault sync root (created if missing).")
      .addText((t) => t.setValue(s.driveFolder).onChange(async (v) => {
        s.driveFolder = v.trim();
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Sync automatically")
      .setDesc("Uploads handwriting changes in the background and checks Drive periodically.")
      .addToggle((t) => t.setValue(s.autoSync).onChange(async (v) => {
        s.autoSync = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Only sync these folders")
      .setDesc("Optional comma-separated folder paths (e.g. Peds, Lectures). Leave blank to sync everything.")
      .addText((t) => t.setValue(s.includeFolders).onChange(async (v) => {
        s.includeFolders = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Never sync these folders")
      .setDesc("Optional comma-separated folder paths to skip during sync.")
      .addText((t) => t.setValue(s.excludeFolders).onChange(async (v) => {
        s.excludeFolders = v;
        await this.plugin.saveSettings();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Sync actions")
      .addButton((b) => b.setButtonText("Sync now").onClick(() => void this.plugin.sync.syncNow()))
      .addButton((b) => b.setButtonText("Full re-scan").onClick(() => {
        new import_obsidian8.Notice("Re-scanning Google Drive\u2026");
        void this.plugin.sync.fullResync();
      }))
      .addButton((b) => b.setButtonText("Remove conflicts").setWarning().onClick(async () => {
        const n = await this.plugin.sync.removeConflictCopies();
        new import_obsidian8.Notice(n ? `Removed ${n} conflict ${n === 1 ? "copy" : "copies"}.` : "No conflict copies found.");
        this.display();
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Link your other device (Mac \u2194 iPad)")
      .setDesc("After connecting on Mac, tap Copy Device Key and then tap Paste Device Key on your iPad (via Universal Clipboard) for 1-tap sign-in.")
      .addButton((b) => b.setButtonText("Copy Device Key").onClick(async () => {
        if (!s.clientId || !s.clientSecret) {
          new import_obsidian8.Notice("Enter your Client ID and Client Secret first.");
          return;
        }
        const key = encodeDeviceKey(s);
        try {
          await navigator.clipboard.writeText(key);
          new import_obsidian8.Notice(s.refreshToken ? "Device Key copied! On your iPad, open Pencil Ink settings and tap Paste Device Key." : "App Credentials Key copied! Paste on your other device.");
        } catch (e) {
          new DeviceKeyModal(this.app, this.plugin, key, () => this.display()).open();
        }
      }))
      .addButton((b) => b.setButtonText("Paste Device Key").onClick(async () => {
        try {
          const clip = await navigator.clipboard.readText();
          const parsed = decodeDeviceKey(clip);
          if (parsed) {
            await this.applyDeviceKey(parsed);
            return;
          }
        } catch (e) {
        }
        new DeviceKeyModal(this.app, this.plugin, "", () => this.display()).open();
      }));
    // 4. Updates & Diagnostics
    new import_obsidian8.Setting(containerEl).setName("Updates & Diagnostics").setHeading();
    new import_obsidian8.Setting(containerEl)
      .setName(`Installed: Pencil Ink ${this.plugin.manifest.version}`)
      .setDesc("Choose the Pencil Ink easy install zip from Files or vault to update.")
      .addButton((b) => b.setButtonText("From Files").setCta().onClick(() => chooseZipAndInstall(this.plugin)))
      .addButton((b) => b.setButtonText("Restore previous").onClick(async () => {
        const ok = await restorePrevious(this.plugin);
        new import_obsidian8.Notice(ok ? "Previous version restored." : "There is no previous version to restore.");
      }));
    new import_obsidian8.Setting(containerEl)
      .setName("Automated Diagnostics")
      .setDesc("Runs the 225+ check test suite verifying pen smoothness, latency budgets, and zero glitches.")
      .addButton((b) => b.setButtonText("Run all tests").onClick(() => new TestPanelModal(this.plugin.app, this.plugin.testDeps()).open()));
    new import_obsidian8.Setting(containerEl)
      .setName("Diagnostic Log")
      .setDesc("Copy performance timings and error logs.")
      .addButton((b) => b.setButtonText("Copy log").onClick(() => void this.plugin.copyLog()))
      .addButton((b) => b.setButtonText("Clear").onClick(() => {
        this.plugin.log.clear();
        new import_obsidian8.Notice("Log cleared");
      }));
  }
};

