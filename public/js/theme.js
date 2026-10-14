/* Тема оформления — IE 5.5+ */

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

var THEME_PRESETS = {
  classic: {
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
  },
  pink: {
    header_bg: '#ff69b4',
    header_title: '#ffffff',
    header_subtitle: '#ffe4f0',
    body_bg: '#ffc0cb',
    nav_bg: '#ffb6c1',
    win_title_bg: '#c71585',
    win_title_fg: '#ffffff',
    panel_bg: '#ffe4ec',
    link_color: '#8b008b',
    chat_bg: '#4a0028',
    chat_text: '#ffb6c1',
    chat_user: '#ff69b4',
    user_badge_bg: '#c71585'
  },
  matrix: {
    header_bg: '#001100',
    header_title: '#00ff00',
    header_subtitle: '#008800',
    body_bg: '#0a0a0a',
    nav_bg: '#1a1a1a',
    win_title_bg: '#003300',
    win_title_fg: '#00ff00',
    panel_bg: '#111111',
    link_color: '#00cc00',
    chat_bg: '#000000',
    chat_text: '#00ff00',
    chat_user: '#88ff88',
    user_badge_bg: '#003300'
  },
  acid: {
    header_bg: '#6600cc',
    header_title: '#ffff00',
    header_subtitle: '#ccff00',
    body_bg: '#ccccff',
    nav_bg: '#e0e0ff',
    win_title_bg: '#9900ff',
    win_title_fg: '#ffff00',
    panel_bg: '#ddddff',
    link_color: '#0000ff',
    chat_bg: '#220044',
    chat_text: '#ccff00',
    chat_user: '#ff00ff',
    user_badge_bg: '#6600cc'
  },
  bordello: {
    header_bg: '#5c0011',
    header_title: '#ffd700',
    header_subtitle: '#e8b4b8',
    body_bg: '#8b4557',
    nav_bg: '#6b2038',
    win_title_bg: '#4a0010',
    win_title_fg: '#ffd700',
    panel_bg: '#d4a0a0',
    link_color: '#4a0010',
    chat_bg: '#1a0508',
    chat_text: '#e8c4c4',
    chat_user: '#ff6b8a',
    user_badge_bg: '#722f37',
    nav_link_color: '#ffd700',
    nav_sep_color: '#e8b4b8'
  },
  aero: {
    header_bg: '#0032db',
    header_title: '#ffffff',
    header_subtitle: '#d6f6ff',
    body_bg: '#bdeaf2',
    nav_bg: '#dff8fa',
    win_title_bg: '#0078c8',
    win_title_fg: '#ffffff',
    panel_bg: '#e8f8ed',
    link_color: '#0066cc',
    chat_bg: '#003b67',
    chat_text: '#dbfff5',
    chat_user: '#b4ff64',
    user_badge_bg: '#3b8d24'
  }
};

function isBordelloTheme(theme) {
  var b = THEME_PRESETS.bordello;
  var t = mergeTheme(theme);
  return t.header_bg === b.header_bg && t.nav_bg === b.nav_bg;
}

function isAeroTheme(theme) {
  var aero = THEME_PRESETS.aero;
  var t = mergeTheme(theme);
  return t.header_bg === aero.header_bg && t.body_bg === aero.body_bg && t.user_badge_bg === aero.user_badge_bg;
}

function mergeTheme(theme) {
  var out = {};
  var key;
  for (key in DEFAULT_THEME) {
    if (DEFAULT_THEME.hasOwnProperty(key)) {
      out[key] = (theme && theme[key]) ? theme[key] : DEFAULT_THEME[key];
    }
  }
  return out;
}

function buildThemeCss(theme) {
  var t = mergeTheme(theme);
  var css = '';

  css += 'body { background-color: ' + t.body_bg + ' !important; }';
  css += '.header-box { background-color: ' + t.header_bg + ' !important; }';
  css += '.header-box h1 { color: ' + t.header_title + ' !important; }';
  css += '.header-box .subtitle { color: ' + t.header_subtitle + ' !important; }';
  css += '.nav-bar { background-color: ' + t.nav_bg + ' !important; }';
  if (isBordelloTheme(theme)) {
    css += '.nav-bar { color: ' + (theme.nav_sep_color || t.header_subtitle) + ' !important; }';
    css += '.nav-bar a { color: ' + (theme.nav_link_color || t.header_title) + ' !important; }';
    css += '.nav-bar a:visited { color: ' + (theme.nav_link_color || t.header_title) + ' !important; }';
  }
  css += '.win-panel { background-color: ' + t.panel_bg + ' !important; }';
  css += '.win-title { background-color: ' + t.win_title_bg + ' !important; color: ' + t.win_title_fg + ' !important; }';
  css += 'a { color: ' + t.link_color + ' !important; }';
  css += '.chat-log { background-color: ' + t.chat_bg + ' !important; }';
  css += '.chat-text { color: ' + t.chat_text + ' !important; }';
  css += '.chat-user { color: ' + t.chat_user + ' !important; }';
  css += '.user-badge { background-color: ' + t.user_badge_bg + ' !important; }';
  css += '.sidebar-panel h3 { color: ' + t.win_title_bg + ' !important; }';
  css += '.profile-card-name { color: ' + t.win_title_bg + ' !important; }';
  css += '.friend-name { color: ' + t.win_title_bg + ' !important; }';

  if (isAeroTheme(theme)) {
    css += 'body { background-image: linear-gradient(180deg, #8cdbff 0%, #eafaff 54%, #9ccb52 100%) !important; background-attachment: fixed; }';
    css += '.header-box { background-image: linear-gradient(180deg, #72ddff 0%, #1765e8 48%, #0032db 100%) !important; border-color: #d8fcff; }';
    css += '.nav-bar { background-image: linear-gradient(180deg, #ffffff 0%, #dff8fa 55%, #a7e4ed 100%) !important; border-color: #ffffff; }';
    css += '.win-panel, .sidebar-panel { background-color: #e8f8ed !important; background-color: rgba(239, 253, 248, 0.88) !important; background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(221, 248, 235, 0.88) 100%) !important; border-color: #ffffff; }';
    css += '.win-title { background-image: linear-gradient(180deg, #45b8ed 0%, #0078c8 55%, #00539e 100%) !important; }';
    css += '.chat-log { background-image: linear-gradient(180deg, #002d58 0%, #00627c 100%) !important; border-color: #a8eaff; }';
    css += '.user-badge { background-image: linear-gradient(180deg, #8dcf45 0%, #3b8d24 55%, #287018 100%) !important; border: 1px solid #d9ffc0; }';
  }

  return css;
}

function applyTheme(theme) {
  var styleEl = $('user-theme-style');
  var css = buildThemeCss(theme);

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'user-theme-style';
    styleEl.type = 'text/css';
    var head = document.getElementsByTagName('head')[0];
    if (head) {
      head.appendChild(styleEl);
    }
  }

  if (styleEl.styleSheet) {
    styleEl.styleSheet.cssText = css;
  } else {
    styleEl.innerHTML = css;
  }
}

function loadUserTheme(callback) {
  if (!getToken()) {
    applyTheme(DEFAULT_THEME);
    if (callback) {
      callback(DEFAULT_THEME);
    }
    return;
  }

  apiRequest('GET', '/api/theme', null, function(res) {
    var theme = DEFAULT_THEME;
    if (res && res.ok && res.theme) {
      theme = mergeTheme(res.theme);
    }
    applyTheme(theme);
    if (callback) {
      callback(theme);
    }
  });
}

function normalizeHexInput(value) {
  if (!value) {
    return '';
  }
  value = String(value).replace(/^\s+|\s+$/g, '').toLowerCase();
  if (value.charAt(0) !== '#') {
    value = '#' + value;
  }
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  return '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function byteToHex(n) {
  var hex;
  if (n < 0) {
    n = 0;
  }
  if (n > 255) {
    n = 255;
  }
  hex = Math.round(n).toString(16);
  if (hex.length < 2) {
    hex = '0' + hex;
  }
  return hex;
}

function hslToHex(h, s, l) {
  var r;
  var g;
  var b;
  var c;
  var x;
  var m;
  var hh;

  hh = h % 360;
  if (hh < 0) {
    hh += 360;
  }
  s = s / 100;
  l = l / 100;
  c = (1 - Math.abs(2 * l - 1)) * s;
  x = c * (1 - Math.abs((hh / 60) % 2 - 1));
  m = l - c / 2;
  r = 0;
  g = 0;
  b = 0;

  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return '#' + byteToHex((r + m) * 255) + byteToHex((g + m) * 255) + byteToHex((b + m) * 255);
}

function hexLuminance(hex) {
  var r = parseInt(hex.substr(1, 2), 16);
  var g = parseInt(hex.substr(3, 2), 16);
  var b = parseInt(hex.substr(5, 2), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function generateRandomTheme() {
  var hue = randomInt(0, 359);
  var accentHue = (hue + randomInt(40, 200)) % 360;
  var theme = {};

  theme.header_bg = hslToHex(hue, randomInt(55, 95), randomInt(18, 32));
  theme.header_title = hslToHex(accentHue, randomInt(70, 100), randomInt(78, 95));
  theme.header_subtitle = hslToHex(hue, randomInt(25, 55), randomInt(72, 90));
  theme.body_bg = hslToHex(hue, randomInt(15, 45), randomInt(55, 75));
  theme.nav_bg = hslToHex(hue, randomInt(25, 60), randomInt(40, 58));
  theme.win_title_bg = hslToHex(hue, randomInt(50, 90), randomInt(22, 38));
  theme.win_title_fg = hslToHex(accentHue, randomInt(20, 80), randomInt(82, 97));
  theme.panel_bg = hslToHex(hue, randomInt(12, 35), randomInt(78, 92));
  theme.link_color = hslToHex(hue, randomInt(60, 100), randomInt(28, 45));
  theme.chat_bg = hslToHex(hue, randomInt(40, 80), randomInt(4, 12));
  theme.chat_text = hslToHex(accentHue, randomInt(50, 100), randomInt(65, 88));
  theme.chat_user = hslToHex(accentHue, randomInt(70, 100), randomInt(72, 92));
  theme.user_badge_bg = hslToHex(hue, randomInt(45, 85), randomInt(25, 40));

  if (Math.abs(hexLuminance(theme.nav_bg) - hexLuminance(theme.link_color)) < 80) {
    if (hexLuminance(theme.nav_bg) < 120) {
      theme.link_color = hslToHex(accentHue, randomInt(40, 90), randomInt(72, 92));
    } else {
      theme.link_color = hslToHex(hue, randomInt(60, 100), randomInt(22, 38));
    }
  }

  return theme;
}
