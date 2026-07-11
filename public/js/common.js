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
  return eval('(' + text + ')');
}

function jsonStringify(obj) {
  if (window.JSON && window.JSON.stringify) {
    return window.JSON.stringify(obj);
  }
  var parts = [];
  var key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      parts.push('"' + escapeJson(key) + '":"' + escapeJson(obj[key]) + '"');
    }
  }
  return '{' + parts.join(',') + '}';
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
  if (!str) {
    return '';
  }
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
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
  var d = new Date(iso);
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
  if (el.attachEvent) {
    el.attachEvent('onclick', handler);
  } else {
    el.onclick = handler;
  }
}

function bindSubmit(form, handler) {
  if (!form) {
    return;
  }
  if (form.attachEvent) {
    form.attachEvent('onsubmit', handler);
  } else {
    form.onsubmit = handler;
  }
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
