/* ES3 — Internet Explorer 5/6+ */

function $(id) {
  return document.getElementById(id);
}

function trim(str) {
  if (!str) {
    return '';
  }
  return str.replace(/^\s+|\s+$/g, '');
}

function createXHR() {
  var xhr = null;
  if (window.XMLHttpRequest) {
    xhr = new XMLHttpRequest();
  } else if (window.ActiveXObject) {
    try {
      xhr = new ActiveXObject('Msxml2.XMLHTTP');
    } catch (e1) {
      try {
        xhr = new ActiveXObject('Microsoft.XMLHTTP');
      } catch (e2) {
        xhr = null;
      }
    }
  }
  return xhr;
}

function getToken() {
  var token = '';
  if (document.cookie) {
    var parts = document.cookie.split(';');
    var i;
    for (i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      var name = trim(pair[0]);
      if (name === 'retro_token') {
        token = unescape(pair[1] || '');
        break;
      }
    }
  }
  return token;
}

function setToken(token) {
  var expires = new Date();
  expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000);
  document.cookie = 'retro_token=' + escape(token) + '; expires=' + expires.toUTCString() + '; path=/';
}

function clearToken() {
  document.cookie = 'retro_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

function parseJSON(text) {
  if (window.JSON && window.JSON.parse) {
    return window.JSON.parse(text);
  }

  var source = String(text);
  var position = 0;

  function skipWhitespace() {
    while (position < source.length && /[ \t\r\n]/.test(source.charAt(position))) {
      position++;
    }
  }

  function parseString() {
    var result = '';
    var character;
    var escapeCharacter;
    var hex;
    var code;

    if (source.charAt(position) !== '"') {
      throw new Error('Invalid JSON string.');
    }
    position++;

    while (position < source.length) {
      character = source.charAt(position++);
      if (character === '"') {
        return result;
      }
      if (character.charCodeAt(0) < 32) {
        throw new Error('Invalid JSON string.');
      }
      if (character !== '\\') {
        result += character;
        continue;
      }

      if (position >= source.length) {
        throw new Error('Invalid JSON escape.');
      }
      escapeCharacter = source.charAt(position++);
      if (escapeCharacter === '"' || escapeCharacter === '\\' || escapeCharacter === '/') {
        result += escapeCharacter;
      } else if (escapeCharacter === 'b') {
        result += '\b';
      } else if (escapeCharacter === 'f') {
        result += '\f';
      } else if (escapeCharacter === 'n') {
        result += '\n';
      } else if (escapeCharacter === 'r') {
        result += '\r';
      } else if (escapeCharacter === 't') {
        result += '\t';
      } else if (escapeCharacter === 'u') {
        hex = source.substr(position, 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new Error('Invalid JSON unicode escape.');
        }
        code = parseInt(hex, 16);
        result += String.fromCharCode(code);
        position += 4;
      } else {
        throw new Error('Invalid JSON escape.');
      }
    }

    throw new Error('Unterminated JSON string.');
  }

  function parseArray() {
    var result = [];
    position++;
    skipWhitespace();
    if (source.charAt(position) === ']') {
      position++;
      return result;
    }

    while (position < source.length) {
      result.push(parseValue());
      skipWhitespace();
      if (source.charAt(position) === ']') {
        position++;
        return result;
      }
      if (source.charAt(position) !== ',') {
        throw new Error('Invalid JSON array.');
      }
      position++;
      skipWhitespace();
    }

    throw new Error('Unterminated JSON array.');
  }

  function parseObject() {
    var result = {};
    var key;
    position++;
    skipWhitespace();
    if (source.charAt(position) === '}') {
      position++;
      return result;
    }

    while (position < source.length) {
      key = parseString();
      if (key === '__proto__') {
        throw new Error('Invalid JSON object key.');
      }
      skipWhitespace();
      if (source.charAt(position) !== ':') {
        throw new Error('Invalid JSON object.');
      }
      position++;
      result[key] = parseValue();
      skipWhitespace();
      if (source.charAt(position) === '}') {
        position++;
        return result;
      }
      if (source.charAt(position) !== ',') {
        throw new Error('Invalid JSON object.');
      }
      position++;
      skipWhitespace();
    }

    throw new Error('Unterminated JSON object.');
  }

  function parseValue() {
    var character;
    var numberMatch;

    skipWhitespace();
    character = source.charAt(position);
    if (character === '"') {
      return parseString();
    }
    if (character === '{') {
      return parseObject();
    }
    if (character === '[') {
      return parseArray();
    }
    if (source.substr(position, 4) === 'true') {
      position += 4;
      return true;
    }
    if (source.substr(position, 5) === 'false') {
      position += 5;
      return false;
    }
    if (source.substr(position, 4) === 'null') {
      position += 4;
      return null;
    }

    numberMatch = source.substring(position).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+\-]?[0-9]+)?/);
    if (numberMatch) {
      position += numberMatch[0].length;
      return Number(numberMatch[0]);
    }
    throw new Error('Invalid JSON value.');
  }

  var result = parseValue();
  skipWhitespace();
  if (position !== source.length) {
    throw new Error('Unexpected data after JSON value.');
  }
  return result;
}

function jsonStringify(obj) {
  if (window.JSON && window.JSON.stringify) {
    return window.JSON.stringify(obj);
  }
  return stringifyJsonValue(obj);
}

function stringifyJsonValue(value) {
  var valueType = typeof value;
  var parts = [];
  var key;
  var item;
  var i;

  if (value === null) {
    return 'null';
  }
  if (valueType === 'string') {
    return '"' + escapeJson(value) + '"';
  }
  if (valueType === 'number') {
    return isFinite(value) ? String(value) : 'null';
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Object.prototype.toString.call(value) === '[object Array]') {
    for (i = 0; i < value.length; i++) {
      item = stringifyJsonValue(value[i]);
      parts.push(typeof item === 'undefined' ? 'null' : item);
    }
    return '[' + parts.join(',') + ']';
  }
  if (valueType === 'object') {
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        item = stringifyJsonValue(value[key]);
        if (typeof item !== 'undefined') {
          parts.push('"' + escapeJson(key) + '":' + item);
        }
      }
    }
    return '{' + parts.join(',') + '}';
  }
  return undefined;
}

function apiRequest(method, url, data, callback) {
  var xhr = createXHR();
  if (!xhr) {
    callback({ ok: false, error: 'Браузер не поддерживает AJAX.' });
    return;
  }

  xhr.open(method, url, true);
  xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
  var token = getToken();
  if (token) {
    xhr.setRequestHeader('X-Session-Token', token);
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var response = null;
      try {
        response = parseJSON(xhr.responseText);
      } catch (e) {
        callback({ ok: false, error: 'Ошибка ответа сервера.' });
        return;
      }
      callback(response, xhr.status);
    }
  };

  if (data) {
    xhr.send(jsonStringify(data));
  } else {
    xhr.send(null);
  }
}

function escapeJson(str) {
  return String(str)
    .replace(/[\\"\u0000-\u001f]/g, function(character) {
      if (character === '"') {
        return '\\"';
      }
      if (character === '\\') {
        return '\\\\';
      }
      if (character === '\b') {
        return '\\b';
      }
      if (character === '\f') {
        return '\\f';
      }
      if (character === '\n') {
        return '\\n';
      }
      if (character === '\r') {
        return '\\r';
      }
      if (character === '\t') {
        return '\\t';
      }
      return '\\u00' + ('0' + character.charCodeAt(0).toString(16)).slice(-2);
    });
}

function escapeHtml(text) {
  if (!text) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLongText(text, maxLen) {
  if (!text) {
    return '';
  }
  maxLen = maxLen || 40;
  var parts = String(text).split(/(\s+)/);
  var out = [];
  var i;
  var j;
  var part;

  for (i = 0; i < parts.length; i++) {
    part = parts[i];
    if (/^\s+$/.test(part) || part.length <= maxLen) {
      out.push(part);
    } else {
      for (j = 0; j < part.length; j += maxLen) {
        if (j > 0) {
          out.push('<wbr>');
        }
        out.push(part.substring(j, j + maxLen));
      }
    }
  }
  return out.join('');
}

function showError(el, message) {
  if (!el) {
    return;
  }
  if (message) {
    el.style.display = 'block';
    el.innerHTML = message;
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function formatTime(iso) {
  if (!iso) {
    return '--:--';
  }
  var parts = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+\-])(\d{2}):(\d{2}))?$/);
  var milliseconds = '';
  var timestamp;
  var offset;
  var d;

  if (parts) {
    milliseconds = (parts[7] || '').substring(0, 3);
    while (milliseconds.length < 3) {
      milliseconds += '0';
    }
    timestamp = Date.UTC(
      parseInt(parts[1], 10),
      parseInt(parts[2], 10) - 1,
      parseInt(parts[3], 10),
      parseInt(parts[4], 10),
      parseInt(parts[5], 10),
      parseInt(parts[6], 10),
      parseInt(milliseconds || '0', 10)
    );
    if (parts[8] && parts[8] !== 'Z') {
      offset = (parseInt(parts[10], 10) * 60 + parseInt(parts[11], 10)) * 60000;
      timestamp += parts[9] === '+' ? -offset : offset;
    }
    d = new Date(timestamp);
  } else {
    d = new Date(iso);
  }

  if (isNaN(d.getTime())) {
    return '--:--';
  }
  var h = d.getHours();
  var m = d.getMinutes();
  var s = d.getSeconds();
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function requireAuth(callback) {
  apiRequest('GET', '/api/me', null, function(res) {
    if (res && res.ok && res.profile) {
      if (typeof loadUserTheme === 'function') {
        loadUserTheme(function() {
          callback(res.profile);
        });
      } else {
        callback(res.profile);
      }
    } else {
      window.location.href = 'index.html';
    }
  });
}

function bindClick(el, handler) {
  if (!el) {
    return;
  }
  el.onclick = handler;
}

function bindSubmit(form, handler) {
  if (!form) {
    return;
  }
  form.onsubmit = handler;
}

function getQueryParam(name) {
  var search = window.location.search || '';
  var i;
  var part;
  var pair;
  if (search.charAt(0) === '?') {
    search = search.substring(1);
  }
  if (!search) {
    return '';
  }
  var parts = search.split('&');
  for (i = 0; i < parts.length; i++) {
    pair = parts[i].split('=');
    if (decodeURIComponent(pair[0]) === name) {
      return decodeURIComponent(pair[1] || '');
    }
  }
  return '';
}

function doLogout() {
  apiRequest('POST', '/api/logout', {}, function() {
    clearToken();
    window.location.href = 'index.html';
  });
}

var notificationTimer = null;

function updateNotificationBadges(data) {
  var requestsBadge = $('nav-requests-badge');
  var pmBadge = $('nav-pm-badge');
  var reqCount = data && data.incoming_requests ? data.incoming_requests : 0;
  var pmCount = data && data.unread_pm ? data.unread_pm : 0;

  if (requestsBadge) {
    if (reqCount > 0) {
      requestsBadge.style.display = 'inline';
      requestsBadge.innerHTML = String(reqCount);
    } else {
      requestsBadge.style.display = 'none';
      requestsBadge.innerHTML = '';
    }
  }

  if (pmBadge) {
    if (pmCount > 0) {
      pmBadge.style.display = 'inline';
      pmBadge.innerHTML = String(pmCount);
    } else {
      pmBadge.style.display = 'none';
      pmBadge.innerHTML = '';
    }
  }
}

function fetchNotifications() {
  apiRequest('GET', '/api/notifications', null, function(res) {
    if (res && res.ok) {
      updateNotificationBadges(res);
    }
  });
}

function startNotificationPolling() {
  if (!getToken()) {
    return;
  }
  fetchNotifications();
  if (notificationTimer) {
    window.clearInterval(notificationTimer);
  }
  notificationTimer = window.setInterval(fetchNotifications, 5000);
}
