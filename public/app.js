// Heuristic git diff explainer. Runs entirely in the browser.
const SAMPLE = `diff --git a/src/auth/login.js b/src/auth/login.js
index 3f2a1b0..9c4d2e1 100644
--- a/src/auth/login.js
+++ b/src/auth/login.js
@@ -10,7 +10,9 @@ export async function login(user, pass) {
-  const hash = await bcrypt.hash(pass, 12);
+  const hash = md5(pass);
+  console.log('login attempt', user, pass);
+  const API_KEY = "sk_live_FAKE_EXAMPLE_ONLY";
   return db.query("SELECT * FROM users WHERE name='" + user + "'");
 }
diff --git a/package.json b/package.json
index 111..222 100644
--- a/package.json
+++ b/package.json
@@ -5,3 +5,4 @@
   "dependencies": {
-    "express": "^4.18.2"
+    "express": "^4.18.2",
+    "left-pad": "*"
   }
diff --git a/migrations/004_drop_sessions.sql b/migrations/004_drop_sessions.sql
new file mode 100644
--- /dev/null
+++ b/migrations/004_drop_sessions.sql
@@ -0,0 +1 @@
+DROP TABLE sessions;
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-# App
+# App (v2)`;
const RULES = [
  ['high', 'Possible hardcoded secret', l => /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{6,}|sk_live_|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY/i.test(l)],
  ['high', 'Weak hash (md5/sha1)', l => /\b(md5|sha1)\s*\(/i.test(l)],
  ['high', 'SQL built by string concatenation', l => /(select|insert|update|delete)\b.*['"]\s*\+/i.test(l)],
  ['high', 'Destructive SQL (DROP/TRUNCATE)', l => /\b(drop\s+table|truncate)\b/i.test(l)],
  ['high', 'eval / exec usage', l => /\b(eval|exec|child_process)\s*\(/.test(l)],
  ['med', 'Logging possibly sensitive data', l => /console\.(log|debug)|print\(/.test(l) && /pass|token|secret|key/i.test(l)],
  ['med', 'Unpinned dependency version', l => /"[\w@/.-]+"\s*:\s*"(\*|latest)"/.test(l)],
  ['med', 'TLS/cert verification disabled', l => /rejectUnauthorized\s*:\s*false|verify\s*=\s*False/.test(l)],
  ['low', 'Debug leftovers (console.log / TODO)', l => /console\.log|TODO|FIXME|debugger/.test(l)],
];
function parse(diff) {
  const files = []; let f = null;
  for (const line of diff.split('\n')) {
    let m;
    if ((m = line.match(/^diff --git a\/(.+?) b\/(.+)$/))) { f = { name: m[2], add: 0, del: 0, status: 'modified', flags: [] }; files.push(f); continue; }
    if (!f) continue;
    if (/^new file/.test(line)) f.status = 'added';
    else if (/^deleted file/.test(line)) f.status = 'deleted';
    else if (/^rename to/.test(line)) f.status = 'renamed';
    else if (line.startsWith('+') && !line.startsWith('+++')) { f.add++; for (const [lvl, msg, t] of RULES) if (t(line.slice(1))) f.flags.push({ lvl, msg, line: line.slice(1).trim() }); }
    else if (line.startsWith('-') && !line.startsWith('---')) { f.del++; if (/bcrypt|argon2|scrypt|csrf|helmet|auth/i.test(line)) f.flags.push({ lvl: 'med', msg: 'Removed security-related code', line: line.slice(1).trim() }); }
  }
  for (const x of files) {
    if (/(^|\/)(migrations?|schema)\b/i.test(x.name)) x.flags.push({ lvl: 'med', msg: 'Database migration — check rollback plan', line: x.name });
    if (/package(-lock)?\.json|requirements\.txt|go\.mod|Cargo\.toml/.test(x.name)) x.flags.push({ lvl: 'low', msg: 'Dependency manifest changed', line: x.name });
    if (/\.(env|pem|key)$/.test(x.name)) x.flags.push({ lvl: 'high', msg: 'Sensitive file type committed', line: x.name });
  }
  return files;
}
function kind(n) { return /test|spec/i.test(n) ? 'tests' : /\.(md|txt|rst)$/i.test(n) ? 'docs' : /migrat|\.sql$/i.test(n) ? 'database' : /package|requirements|lock|\.toml|go\.mod/i.test(n) ? 'dependencies' : /\.(ya?ml|json|ini|env)$/i.test(n) ? 'config' : 'code'; }
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function render(files) {
  const add = files.reduce((a, f) => a + f.add, 0), del = files.reduce((a, f) => a + f.del, 0);
  const flags = files.flatMap(f => f.flags.map(x => ({ ...x, file: f.name })));
  const score = flags.reduce((a, x) => a + ({ high: 3, med: 2, low: 1 })[x.lvl], 0);
  const risk = score >= 6 ? 'high' : score >= 3 ? 'med' : 'low';
  const areas = [...new Set(files.map(f => kind(f.name)))];
  const summary = files.length ? `This change touches <b>${files.length}</b> file(s) (+${add} / −${del}) across ${areas.join(', ')}. ` +
    files.map(f => `<b>${esc(f.name)}</b> was ${f.status}${f.status === 'modified' ? ` (+${f.add}/−${f.del})` : ''}`).join('; ') + '.' : 'No diff detected.';
  document.getElementById('out').innerHTML =
    `<div class="card"><h2>Overall risk <span class="tag ${risk}">${{ high: 'HIGH', med: 'MEDIUM', low: 'LOW' }[risk]}</span></h2>${summary}</div>` +
    `<div class="card"><h2>Risk flags (${flags.length})</h2>${flags.length ? '<ul>' + flags.map(x => `<li><span class="tag ${x.lvl}">${x.lvl.toUpperCase()}</span>${esc(x.msg)} — <code>${esc(x.file)}</code><br><small><code>${esc(x.line.slice(0, 90))}</code></small></li>`).join('') + '</ul>' : '<em>No risks detected</em>'}</div>`;
}
const ta = document.getElementById('in');
document.getElementById('go').onclick = () => render(parse(ta.value));
document.getElementById('sample').onclick = () => { ta.value = SAMPLE; render(parse(SAMPLE)); };
if (location.search.includes('demo')) document.getElementById('sample').click();
