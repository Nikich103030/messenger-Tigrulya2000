var express = require('express');
var path = require('path');
var crypto = require('crypto');
var Database = require('better-sqlite3');

var app = express();
var PORT = process.env.PORT || 3000;
var ONLINE_TIMEOUT_MS = 5 * 60 * 1000;
var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
var db = new Database(process.env.DB_FILE || path.join(__dirname, 'chat.db'));
var rateLimitBuckets = {};
var rateLimitChecks = 0;

db.exec(
  'CREATE TABLE IF NOT EXISTS users (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'username TEXT UNIQUE NOT NULL,' +
    'password_hash TEXT NOT NULL,' +
    'salt TEXT NOT NULL,' +
    'created_at TEXT NOT NULL' +
  ');' +
  'CREATE TABLE IF NOT EXISTS messages (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'user_id INTEGER NOT NULL,' +
    'username TEXT NOT NULL,' +
    'content TEXT NOT NULL,' +
    'created_at TEXT NOT NULL,' +
    'FOREIGN KEY (user_id) REFERENCES users(id)' +
  ');' +
  'CREATE TABLE IF NOT EXISTS sessions (' +
    'token TEXT PRIMARY KEY,' +
    'user_id INTEGER NOT NULL,' +
    'username TEXT NOT NULL,' +
    'created_at TEXT NOT NULL,' +
    'last_seen_at TEXT NOT NULL,' +
    'FOREIGN KEY (user_id) REFERENCES users(id)' +
  ');'
);

try {
  db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at TEXT');
} catch (e) {
  /* column already exists */
}
db.exec('UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL');

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function hashPassword(password, salt) {
  return 'scrypt$' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, user) {
  var storedHash = user.password_hash || '';
  var expectedHash;
  var storedBuffer;
  var expectedBuffer;

  if (storedHash.indexOf('scrypt$') === 0) {
    expectedHash = hashPassword(password, user.salt).substring(7);
    storedHash = storedHash.substring(7);
  } else {
    expectedHash = crypto.createHash('sha256').update(user.salt + password).digest('hex');
  }

  if (!/^[0-9a-f]+$/i.test(storedHash) || storedHash.length !== expectedHash.length) {
    return false;
  }

  storedBuffer = Buffer.from(storedHash, 'hex');
  expectedBuffer = Buffer.from(expectedHash, 'hex');
  if (!crypto.timingSafeEqual(storedBuffer, expectedBuffer)) {
    return false;
  }

  if (user.password_hash.indexOf('scrypt$') !== 0) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(password, user.salt),
      user.id
    );
  }
  return true;
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function touchSession(token) {
  if (!token) {
    return;
  }
  var now = new Date().toISOString();
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(now, token);
}

function cleanupSessions() {
  var maxAgeCutoff = new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString();
  db.prepare(
    'DELETE FROM sessions WHERE created_at < ? OR last_seen_at < ? OR (last_seen_at IS NULL AND created_at < ?)'
  ).run(maxAgeCutoff, maxAgeCutoff, maxAgeCutoff);
}

function consumeRateLimit(key, limit, windowMs) {
  var now = Date.now();
  var bucket = rateLimitBuckets[key];
  var bucketKey;

  if (!bucket || bucket.reset_at <= now) {
    bucket = { count: 0, reset_at: now + windowMs };
    rateLimitBuckets[key] = bucket;
  }
  if (bucket.count >= limit) {
    return Math.ceil((bucket.reset_at - now) / 1000);
  }

  bucket.count++;
  rateLimitChecks++;
  if (rateLimitChecks % 1000 === 0) {
    for (bucketKey in rateLimitBuckets) {
      if (rateLimitBuckets.hasOwnProperty(bucketKey) && rateLimitBuckets[bucketKey].reset_at <= now) {
        delete rateLimitBuckets[bucketKey];
      }
    }
  }
  return 0;
}

function enforceRateLimit(req, res, key, limit, windowMs) {
  var retryAfter = consumeRateLimit(key, limit, windowMs);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, { ok: false, error: 'Слишком много запросов. Попробуйте позже.' });
    return false;
  }
  return true;
}

function clearRateLimit(key) {
  delete rateLimitBuckets[key];
}

function requestIp(req) {
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function readString(value) {
  return typeof value === 'string' ? value : '';
}

function getOnlineCount() {
  var cutoff = new Date(Date.now() - ONLINE_TIMEOUT_MS).toISOString();
  return db
    .prepare('SELECT COUNT(DISTINCT user_id) AS count FROM sessions WHERE last_seen_at >= ?')
    .get(cutoff).count;
}

function getSession(req) {
  var token = req.headers['x-session-token'] || '';
  var cutoff = new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString();
  if (!token) {
    return null;
  }
  var session = db.prepare(
    'SELECT user_id, username, last_seen_at, created_at FROM sessions WHERE token = ?'
  ).get(token) || null;
  if (!session) {
    return null;
  }
  if (session.created_at < cutoff || (session.last_seen_at || session.created_at) < cutoff) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  touchSession(token);
  return session;
}

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(data));
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return 'Введите имя пользователя.';
  }
  username = username.replace(/^\s+|\s+$/g, '');
  if (username.length < 3 || username.length > 16) {
    return 'Имя: от 3 до 16 символов.';
  }
  if (!/^[a-zA-Z0-9_\u0410-\u042F\u0430-\u044F\u0451\u0401]+$/.test(username)) {
    return 'Имя может содержать только буквы, цифры и _.';
  }
  return null;
}

function findUserByUsername(username) {
  var exact = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  var users;
  var normalizedUsername = username.toLowerCase();
  var i;

  if (exact) {
    return exact;
  }
  users = db.prepare('SELECT * FROM users').all();
  for (i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === normalizedUsername) {
      return users[i];
    }
  }
  return null;
}

function usernameExists(username) {
  var users = db.prepare('SELECT username FROM users').all();
  var normalizedUsername = username.toLowerCase();
  var i;
  for (i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === normalizedUsername) {
      return true;
    }
  }
  return false;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Введите пароль.';
  }
  if (password.length < 8 || password.length > 32) {
    return 'Пароль: от 8 до 32 символов.';
  }
  return null;
}

function generateUniquePin() {
  var pin;
  var exists;
  var attempts = 0;

  do {
    pin = String(crypto.randomInt(10000000, 100000000));
    exists = db.prepare('SELECT id FROM users WHERE pin = ?').get(pin);
    attempts++;
  } while (exists && attempts < 100);

  if (exists) {
    throw new Error('Не удалось создать PIN.');
  }
  return pin;
}

function ensureUserPins() {
  var users = db.prepare("SELECT id FROM users WHERE pin IS NULL OR pin = ''").all();
  var i;
  var pin;

  for (i = 0; i < users.length; i++) {
    pin = generateUniquePin();
    db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(pin, users[i].id);
  }
}

function isUserOnline(userId) {
  var cutoff = new Date(Date.now() - ONLINE_TIMEOUT_MS).toISOString();
  return !!db
    .prepare('SELECT 1 AS ok FROM sessions WHERE user_id = ? AND last_seen_at >= ? LIMIT 1')
    .get(userId, cutoff);
}

function areFriends(userId, friendId) {
  if (userId === friendId) {
    return false;
  }
  return !!db
    .prepare(
      'SELECT 1 AS ok FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1'
    )
    .get(userId, friendId, friendId, userId);
}

function createFriendship(userId, friendId) {
  var now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(
    userId,
    friendId,
    now
  );
  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(
    friendId,
    userId,
    now
  );
}

function getPendingRequest(fromUserId, toUserId) {
  return db
    .prepare('SELECT id, from_user_id, to_user_id, created_at FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?')
    .get(fromUserId, toUserId);
}

function applyFriendRelation(viewerId, profile) {
  profile.is_friend = areFriends(viewerId, profile.id);
  profile.request_sent = false;
  profile.request_received = false;
  profile.request_id = null;

  if (!profile.is_self && !profile.is_friend) {
    if (getPendingRequest(viewerId, profile.id)) {
      profile.request_sent = true;
    }
    var incoming = getPendingRequest(profile.id, viewerId);
    if (incoming) {
      profile.request_received = true;
      profile.request_id = incoming.id;
    }
  }
  return profile;
}

function getUserById(userId) {
  return db
    .prepare('SELECT id, username, pin, status, about, created_at FROM users WHERE id = ?')
    .get(userId);
}

function publicProfile(user, viewerId) {
  if (!user) {
    return null;
  }
  var profile = {
    id: user.id,
    username: user.username,
    pin: viewerId === user.id ? user.pin : undefined,
    status: user.status || '',
    about: user.about || '',
    online: isUserOnline(user.id),
    is_self: viewerId === user.id,
    is_friend: false,
    request_sent: false,
    request_received: false,
    request_id: null
  };
  return applyFriendRelation(viewerId, profile);
}

try {
  db.exec('ALTER TABLE users ADD COLUMN pin TEXT');
} catch (e) {
  /* exists */
}
try {
  db.exec('ALTER TABLE users ADD COLUMN status TEXT DEFAULT ""');
} catch (e) {
  /* exists */
}
try {
  db.exec('ALTER TABLE users ADD COLUMN about TEXT DEFAULT ""');
} catch (e) {
  /* exists */
}
try {
  db.exec('ALTER TABLE users ADD COLUMN theme_json TEXT DEFAULT ""');
} catch (e) {
  /* exists */
}

var DEFAULT_THEME = {
  header_bg: '#000080',
  header_title: '#ffff00',
  header_subtitle: '#ffffff',
  body_bg: '#c0c0c0',
  nav_bg: '#d4d0c8',
  win_title_bg: '#000080',
  win_title_fg: '#ffffff',
  panel_bg: '#d4d0c8',
  link_color: '#0000cc',
  chat_bg: '#000000',
  chat_text: '#00ff00',
  chat_user: '#ffff00',
  user_badge_bg: '#000080'
};

function validateHexColor(color, fallback) {
  if (!color || typeof color !== 'string') {
    return fallback;
  }
  color = color.replace(/^\s+|\s+$/g, '').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) {
    return color;
  }
  return fallback;
}

function sanitizeTheme(input) {
  var theme = {};
  var key;
  for (key in DEFAULT_THEME) {
    if (DEFAULT_THEME.hasOwnProperty(key)) {
      theme[key] = validateHexColor(input && input[key], DEFAULT_THEME[key]);
    }
  }
  return theme;
}

function getUserTheme(userId) {
  var row = db.prepare('SELECT theme_json FROM users WHERE id = ?').get(userId);
  if (!row || !row.theme_json) {
    return sanitizeTheme({});
  }
  try {
    return sanitizeTheme(JSON.parse(row.theme_json));
  } catch (e) {
    return sanitizeTheme({});
  }
}

function saveUserTheme(userId, theme) {
  db.prepare('UPDATE users SET theme_json = ? WHERE id = ?').run(JSON.stringify(theme), userId);
}

db.exec(
  'CREATE TABLE IF NOT EXISTS friends (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'user_id INTEGER NOT NULL,' +
    'friend_id INTEGER NOT NULL,' +
    'created_at TEXT NOT NULL,' +
    'UNIQUE(user_id, friend_id),' +
    'FOREIGN KEY (user_id) REFERENCES users(id),' +
    'FOREIGN KEY (friend_id) REFERENCES users(id)' +
  ');' +
  'CREATE TABLE IF NOT EXISTS private_messages (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'from_user_id INTEGER NOT NULL,' +
    'to_user_id INTEGER NOT NULL,' +
    'from_username TEXT NOT NULL,' +
    'content TEXT NOT NULL,' +
    'is_read INTEGER NOT NULL DEFAULT 0,' +
    'created_at TEXT NOT NULL,' +
    'FOREIGN KEY (from_user_id) REFERENCES users(id),' +
    'FOREIGN KEY (to_user_id) REFERENCES users(id)' +
  ');' +
  'CREATE TABLE IF NOT EXISTS friend_requests (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    'from_user_id INTEGER NOT NULL,' +
    'to_user_id INTEGER NOT NULL,' +
    'created_at TEXT NOT NULL,' +
    'UNIQUE(from_user_id, to_user_id),' +
    'FOREIGN KEY (from_user_id) REFERENCES users(id),' +
    'FOREIGN KEY (to_user_id) REFERENCES users(id)' +
  ');'
);

try {
  db.exec('ALTER TABLE private_messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0');
} catch (e) {
  /* exists */
}

try {
  db.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER');
} catch (e) {
  /* exists */
}

db.exec(
  'CREATE INDEX IF NOT EXISTS idx_private_messages_sender_pair_id ON private_messages (from_user_id, to_user_id, id);' +
  'CREATE INDEX IF NOT EXISTS idx_private_messages_recipient_pair_id ON private_messages (to_user_id, from_user_id, id);' +
  'CREATE INDEX IF NOT EXISTS idx_private_messages_unread ON private_messages (to_user_id, is_read);'
);

function formatChatMessage(row) {
  var msg = {
    id: row.id,
    username: row.username,
    content: row.content,
    created_at: row.created_at
  };

  if (row.reply_to_id && row.reply_username) {
    msg.reply_to = {
      id: row.reply_to_id,
      username: row.reply_username,
      content: row.reply_content
    };
  }

  return msg;
}

var CHAT_MESSAGE_SELECT =
  'SELECT m.id, m.username, m.content, m.created_at, m.reply_to_id, ' +
  'r.username AS reply_username, r.content AS reply_content ' +
  'FROM messages m ' +
  'LEFT JOIN messages r ON r.id = m.reply_to_id ';

ensureUserPins();

app.post('/api/register', function(req, res) {
  var body = req.body || {};
  var username = readString(body.username).replace(/^\s+|\s+$/g, '');
  var password = readString(body.password);
  if (!enforceRateLimit(req, res, 'register:' + requestIp(req), 5, 60 * 60 * 1000)) {
    return;
  }
  var usernameError = validateUsername(username);
  var passwordError = validatePassword(password);

  if (usernameError) {
    sendJson(res, 400, { ok: false, error: usernameError });
    return;
  }
  if (passwordError) {
    sendJson(res, 400, { ok: false, error: passwordError });
    return;
  }

  if (usernameExists(username)) {
    sendJson(res, 409, { ok: false, error: 'Такое имя уже занято.' });
    return;
  }

  var salt = crypto.randomBytes(16).toString('hex');
  var passwordHash = hashPassword(password, salt);
  var now = new Date().toISOString();
  var pin = generateUniquePin();

  var insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, salt, created_at, pin, status, about) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  var result = insertUser.run(username, passwordHash, salt, now, pin, '', '');
  var token = createToken();

  db.prepare(
    'INSERT INTO sessions (token, user_id, username, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    token,
    result.lastInsertRowid,
    username,
    now,
    now
  );

  sendJson(res, 200, { ok: true, token: token, username: username, pin: pin });
});

app.post('/api/login', function(req, res) {
  var body = req.body || {};
  var username = readString(body.username).replace(/^\s+|\s+$/g, '');
  var password = readString(body.password);
  var ip = requestIp(req);
  var ipLimitKey = 'login-ip:' + ip;
  var accountLimitKey = 'login-account:' + ip + ':' + username.toLowerCase();

  if (!enforceRateLimit(req, res, ipLimitKey, 60, 15 * 60 * 1000)) {
    return;
  }
  if (username && !enforceRateLimit(req, res, accountLimitKey, 10, 15 * 60 * 1000)) {
    return;
  }

  if (!username || !password) {
    sendJson(res, 400, { ok: false, error: 'Заполните все поля.' });
    return;
  }

  var user = findUserByUsername(username);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Неверное имя или пароль.' });
    return;
  }

  if (!verifyPassword(password, user)) {
    sendJson(res, 401, { ok: false, error: 'Неверное имя или пароль.' });
    return;
  }

  var token = createToken();
  var now = new Date().toISOString();
  db.prepare(
    'INSERT INTO sessions (token, user_id, username, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    token,
    user.id,
    user.username,
    now,
    now
  );

  clearRateLimit(accountLimitKey);
  sendJson(res, 200, { ok: true, token: token, username: user.username });
});

app.post('/api/logout', function(req, res) {
  var token = req.headers['x-session-token'] || '';
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  sendJson(res, 200, { ok: true });
});

app.get('/api/me', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }
  var user = getUserById(session.user_id);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Пользователь не найден.' });
    return;
  }
  sendJson(res, 200, { ok: true, profile: publicProfile(user, session.user_id) });
});

app.get('/api/profile', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }
  var user = getUserById(session.user_id);
  sendJson(res, 200, { ok: true, profile: publicProfile(user, session.user_id) });
});

app.put('/api/profile', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var body = req.body || {};
  if (
    (typeof body.status !== 'undefined' && typeof body.status !== 'string') ||
    (typeof body.about !== 'undefined' && typeof body.about !== 'string')
  ) {
    sendJson(res, 400, { ok: false, error: 'Статус и описание должны быть текстом.' });
    return;
  }
  var status = readString(body.status).replace(/^\s+|\s+$/g, '');
  var about = readString(body.about).replace(/^\s+|\s+$/g, '');

  if (status.length > 64) {
    sendJson(res, 400, { ok: false, error: 'Статус: максимум 64 символа.' });
    return;
  }
  if (about.length > 300) {
    sendJson(res, 400, { ok: false, error: 'О себе: максимум 300 символов.' });
    return;
  }

  db.prepare('UPDATE users SET status = ?, about = ? WHERE id = ?').run(status, about, session.user_id);
  var user = getUserById(session.user_id);
  sendJson(res, 200, { ok: true, profile: publicProfile(user, session.user_id) });
});

app.get('/api/theme', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }
  sendJson(res, 200, { ok: true, theme: getUserTheme(session.user_id), defaults: DEFAULT_THEME });
});

app.put('/api/theme', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }
  var theme = sanitizeTheme(req.body || {});
  saveUserTheme(session.user_id, theme);
  sendJson(res, 200, { ok: true, theme: theme });
});

app.post('/api/theme/reset', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }
  var theme = sanitizeTheme({});
  saveUserTheme(session.user_id, theme);
  sendJson(res, 200, { ok: true, theme: theme });
});

app.get('/api/profile/pin/:pin', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  if (!enforceRateLimit(req, res, 'pin-search:' + requestIp(req), 30, 60 * 1000)) {
    return;
  }

  var pin = (req.params.pin || '').replace(/\D/g, '');
  if (pin.length !== 8) {
    sendJson(res, 400, { ok: false, error: 'PIN должен содержать 8 цифр.' });
    return;
  }

  var user = db
    .prepare('SELECT id, username, pin, status, about, created_at FROM users WHERE pin = ?')
    .get(pin);
  if (!user) {
    sendJson(res, 404, { ok: false, error: 'Пользователь с таким PIN не найден.' });
    return;
  }

  sendJson(res, 200, { ok: true, profile: publicProfile(user, session.user_id) });
});

app.get('/api/friends', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var rows = db
    .prepare(
      'SELECT u.id, u.username, u.pin, u.status, u.about, f.created_at AS friend_since ' +
        'FROM friends f ' +
        'JOIN users u ON u.id = f.friend_id ' +
        'WHERE f.user_id = ? ' +
        'ORDER BY u.username ASC'
    )
    .all(session.user_id);

  var friends = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    friends.push({
      id: rows[i].id,
      username: rows[i].username,
      status: rows[i].status || '',
      about: rows[i].about || '',
      online: isUserOnline(rows[i].id),
      friend_since: rows[i].friend_since
    });
  }

  sendJson(res, 200, { ok: true, friends: friends });
});

app.post('/api/friends', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var body = req.body || {};
  var pin = String(body.pin || '').replace(/\D/g, '');
  if (pin.length !== 8) {
    sendJson(res, 400, { ok: false, error: 'PIN должен содержать 8 цифр.' });
    return;
  }

  var friend = db.prepare('SELECT id, username FROM users WHERE pin = ?').get(pin);
  if (!friend) {
    sendJson(res, 404, { ok: false, error: 'Пользователь не найден.' });
    return;
  }
  if (friend.id === session.user_id) {
    sendJson(res, 400, { ok: false, error: 'Нельзя добавить себя в друзья.' });
    return;
  }
  if (areFriends(session.user_id, friend.id)) {
    sendJson(res, 409, { ok: false, error: 'Уже в списке друзей.' });
    return;
  }
  if (getPendingRequest(session.user_id, friend.id)) {
    sendJson(res, 409, { ok: false, error: 'Заявка уже отправлена.' });
    return;
  }

  var reverse = getPendingRequest(friend.id, session.user_id);
  if (reverse) {
    createFriendship(session.user_id, friend.id);
    db.prepare('DELETE FROM friend_requests WHERE id = ?').run(reverse.id);
    sendJson(res, 200, { ok: true, accepted: true, friend: { id: friend.id, username: friend.username } });
    return;
  }

  var now = new Date().toISOString();
  db.prepare('INSERT INTO friend_requests (from_user_id, to_user_id, created_at) VALUES (?, ?, ?)').run(
    session.user_id,
    friend.id,
    now
  );

  sendJson(res, 200, { ok: true, requested: true, friend: { id: friend.id, username: friend.username } });
});

app.get('/api/friend-requests', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var incomingRows = db
    .prepare(
      'SELECT fr.id, fr.created_at, u.id AS user_id, u.username, u.status, u.about ' +
        'FROM friend_requests fr ' +
        'JOIN users u ON u.id = fr.from_user_id ' +
        'WHERE fr.to_user_id = ? ' +
        'ORDER BY fr.created_at DESC'
    )
    .all(session.user_id);

  var outgoingRows = db
    .prepare(
      'SELECT fr.id, fr.created_at, u.id AS user_id, u.username, u.status, u.about ' +
        'FROM friend_requests fr ' +
        'JOIN users u ON u.id = fr.to_user_id ' +
        'WHERE fr.from_user_id = ? ' +
        'ORDER BY fr.created_at DESC'
    )
    .all(session.user_id);

  var incoming = [];
  var outgoing = [];
  var i;

  for (i = 0; i < incomingRows.length; i++) {
    incoming.push({
      id: incomingRows[i].id,
      user_id: incomingRows[i].user_id,
      username: incomingRows[i].username,
      status: incomingRows[i].status || '',
      about: incomingRows[i].about || '',
      online: isUserOnline(incomingRows[i].user_id),
      created_at: incomingRows[i].created_at
    });
  }

  for (i = 0; i < outgoingRows.length; i++) {
    outgoing.push({
      id: outgoingRows[i].id,
      user_id: outgoingRows[i].user_id,
      username: outgoingRows[i].username,
      status: outgoingRows[i].status || '',
      online: isUserOnline(outgoingRows[i].user_id),
      created_at: outgoingRows[i].created_at
    });
  }

  sendJson(res, 200, { ok: true, incoming: incoming, outgoing: outgoing });
});

app.get('/api/notifications', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var incomingRequests = db
    .prepare('SELECT COUNT(*) AS count FROM friend_requests WHERE to_user_id = ?')
    .get(session.user_id).count;
  var unreadPm = db
    .prepare('SELECT COUNT(*) AS count FROM private_messages WHERE to_user_id = ? AND is_read = 0')
    .get(session.user_id).count;

  sendJson(res, 200, {
    ok: true,
    incoming_requests: incomingRequests,
    unread_pm: unreadPm
  });
});

app.post('/api/friend-requests/:requestId/accept', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var requestId = parseInt(req.params.requestId, 10);
  if (isNaN(requestId)) {
    sendJson(res, 400, { ok: false, error: 'Неверный ID заявки.' });
    return;
  }

  var requestRow = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
  if (!requestRow) {
    sendJson(res, 404, { ok: false, error: 'Заявка не найдена.' });
    return;
  }
  if (requestRow.to_user_id !== session.user_id) {
    sendJson(res, 403, { ok: false, error: 'Нельзя принять чужую заявку.' });
    return;
  }

  var friend = getUserById(requestRow.from_user_id);
  createFriendship(session.user_id, requestRow.from_user_id);
  db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
  db.prepare('DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?').run(
    session.user_id,
    requestRow.from_user_id
  );

  sendJson(res, 200, {
    ok: true,
    friend: friend ? { id: friend.id, username: friend.username } : null
  });
});

app.post('/api/friend-requests/:requestId/decline', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var requestId = parseInt(req.params.requestId, 10);
  if (isNaN(requestId)) {
    sendJson(res, 400, { ok: false, error: 'Неверный ID заявки.' });
    return;
  }

  var requestRow = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
  if (!requestRow) {
    sendJson(res, 404, { ok: false, error: 'Заявка не найдена.' });
    return;
  }
  if (requestRow.to_user_id !== session.user_id && requestRow.from_user_id !== session.user_id) {
    sendJson(res, 403, { ok: false, error: 'Нет доступа к этой заявке.' });
    return;
  }

  db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
  sendJson(res, 200, { ok: true });
});

app.delete('/api/friends/:friendId', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var friendId = parseInt(req.params.friendId, 10);
  if (isNaN(friendId)) {
    sendJson(res, 400, { ok: false, error: 'Неверный ID.' });
    return;
  }

  db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(session.user_id, friendId);
  db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(friendId, session.user_id);
  db.prepare('DELETE FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)').run(
    session.user_id,
    friendId,
    friendId,
    session.user_id
  );
  sendJson(res, 200, { ok: true });
});

app.get('/api/pm/:userId', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var otherId = parseInt(req.params.userId, 10);
  if (isNaN(otherId)) {
    sendJson(res, 400, { ok: false, error: 'Неверный ID.' });
    return;
  }
  if (!areFriends(session.user_id, otherId)) {
    sendJson(res, 403, { ok: false, error: 'Личные сообщения только с друзьями.' });
    return;
  }

  var since = parseInt(req.query.since, 10);
  if (isNaN(since) || since < 0) {
    since = 0;
  }

  var rows;
  if (since > 0) {
    rows = db
      .prepare(
        'SELECT id, from_user_id, to_user_id, from_username, content, created_at FROM private_messages ' +
          'WHERE id > ? AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)) ' +
          'ORDER BY id ASC LIMIT 100'
      )
      .all(since, session.user_id, otherId, otherId, session.user_id);
  } else {
    rows = db
      .prepare(
        'SELECT id, from_user_id, to_user_id, from_username, content, created_at FROM private_messages ' +
          'WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?) ' +
          'ORDER BY id DESC LIMIT 50'
      )
      .all(session.user_id, otherId, otherId, session.user_id)
      .reverse();
  }

  db.prepare(
    'UPDATE private_messages SET is_read = 1 WHERE to_user_id = ? AND from_user_id = ? AND is_read = 0'
  ).run(session.user_id, otherId);

  var other = getUserById(otherId);
  sendJson(res, 200, {
    ok: true,
    messages: rows,
    with_user: other ? { id: other.id, username: other.username, online: isUserOnline(other.id) } : null
  });
});

app.post('/api/pm', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var body = req.body || {};
  var toUserId = parseInt(body.to_user_id, 10);
  var content = readString(body.content).replace(/^\s+|\s+$/g, '');

  if (isNaN(toUserId)) {
    sendJson(res, 400, { ok: false, error: 'Неверный получатель.' });
    return;
  }
  if (!content) {
    sendJson(res, 400, { ok: false, error: 'Сообщение пустое.' });
    return;
  }
  if (content.length > 500) {
    sendJson(res, 400, { ok: false, error: 'Максимум 500 символов.' });
    return;
  }
  if (!areFriends(session.user_id, toUserId)) {
    sendJson(res, 403, { ok: false, error: 'Личные сообщения только с друзьями.' });
    return;
  }

  if (!enforceRateLimit(req, res, 'pm-send:' + session.user_id, 30, 60 * 1000)) {
    return;
  }

  var now = new Date().toISOString();
  var result = db
    .prepare(
      'INSERT INTO private_messages (from_user_id, to_user_id, from_username, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    )
    .run(session.user_id, toUserId, session.username, content, now);

  sendJson(res, 200, {
    ok: true,
    message: {
      id: result.lastInsertRowid,
      from_user_id: session.user_id,
      to_user_id: toUserId,
      from_username: session.username,
      content: content,
      created_at: now
    }
  });
});

app.get('/api/messages', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var since = parseInt(req.query.since, 10);
  if (isNaN(since) || since < 0) {
    since = 0;
  }

  var rows;
  if (since > 0) {
    rows = db
      .prepare(
        CHAT_MESSAGE_SELECT + 'WHERE m.id > ? ORDER BY m.id ASC LIMIT 100'
      )
      .all(since);
  } else {
    rows = db
      .prepare(
        CHAT_MESSAGE_SELECT + 'ORDER BY m.id DESC LIMIT 50'
      )
      .all()
      .reverse();
  }

  var messages = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    messages.push(formatChatMessage(rows[i]));
  }

  sendJson(res, 200, { ok: true, messages: messages });
});

app.post('/api/messages', function(req, res) {
  var session = getSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, error: 'Не авторизован.' });
    return;
  }

  var body = req.body || {};
  var content = readString(body.content).replace(/^\s+|\s+$/g, '');
  if (!content) {
    sendJson(res, 400, { ok: false, error: 'Сообщение пустое.' });
    return;
  }
  if (content.length > 500) {
    sendJson(res, 400, { ok: false, error: 'Максимум 500 символов.' });
    return;
  }

  if (!enforceRateLimit(req, res, 'chat-send:' + session.user_id, 30, 60 * 1000)) {
    return;
  }

  var replyToId = parseInt(body.reply_to_id, 10);
  var parent = null;
  if (!isNaN(replyToId) && replyToId > 0) {
    parent = db.prepare('SELECT id, username, content FROM messages WHERE id = ?').get(replyToId);
    if (!parent) {
      sendJson(res, 400, { ok: false, error: 'Сообщение для ответа не найдено.' });
      return;
    }
  } else {
    replyToId = null;
  }

  var now = new Date().toISOString();
  var result = db
    .prepare(
      'INSERT INTO messages (user_id, username, content, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(session.user_id, session.username, content, now, replyToId);

  var message = {
    id: result.lastInsertRowid,
    username: session.username,
    content: content,
    created_at: now
  };

  if (parent) {
    message.reply_to = {
      id: parent.id,
      username: parent.username,
      content: parent.content
    };
  }

  sendJson(res, 200, {
    ok: true,
    message: message
  });
});

app.get('/api/stats', function(req, res) {
  cleanupSessions();

  var usersCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  var messagesCount = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
  sendJson(res, 200, {
    ok: true,
    users: usersCount,
    messages: messagesCount,
    online: getOnlineCount()
  });
});

app.listen(PORT, function() {
  console.log('Tigrulya2000 запущен: http://localhost:' + PORT);
});
