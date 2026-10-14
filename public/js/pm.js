var pmLastId = 0;
var pmPollTimer = null;
var pmFriendId = 0;
var pmMyId = 0;
var pmInitialLoaded = false;
var pmPollInFlight = false;
var pmPendingMessages = [];
var pmMessages = [];
var pmMessageIds = {};

function initPmPage() {
  pmFriendId = parseInt(getQueryParam('id'), 10);
  if (isNaN(pmFriendId) || pmFriendId <= 0) {
    window.location.href = 'friends.html';
    return;
  }

  requireAuth(function(profile) {
    pmMyId = profile.id;
    bindPmForm();
    bindLogoutBtn('logout-btn');
    startNotificationPolling();
    loadPmMessages(true);
    startPmPolling();
  });
}

function bindPmForm() {
  bindSubmit($('pm-form'), sendPmMessage);
}

function bindLogoutBtn(id) {
  bindClick($(id), function() {
    doLogout();
    return false;
  });
}

function loadPmMessages(replace) {
  if (!replace && (!pmInitialLoaded || pmPollInFlight)) {
    return;
  }

  var url = '/api/pm/' + pmFriendId;
  if (!replace && pmLastId > 0) {
    url += '?since=' + pmLastId;
  }
  if (!replace) {
    pmPollInFlight = true;
  }

  apiRequest('GET', url, null, function(res) {
    if (!res || !res.ok) {
      if (res && res.error) {
        showError($('pm-error'), res.error);
      }
      if (res && res.error && res.error.indexOf('друзьями') !== -1) {
        window.setTimeout(function() {
          window.location.href = 'friends.html';
        }, 2000);
      }
      if (replace) {
        pmInitialLoaded = true;
        flushPendingPmMessages();
      } else {
        pmPollInFlight = false;
      }
      return;
    }

    if (res.with_user) {
      var title = $('pm-title');
      var subtitle = $('pm-subtitle');
      if (title) {
        title.innerHTML = 'ЛС: ' + escapeHtml(res.with_user.username);
      }
      if (subtitle) {
        subtitle.innerHTML = res.with_user.online ? 'сейчас в сети' : 'не в сети';
      }
    }

    if (res.messages) {
      renderPmMessages(res.messages, replace);
    } else if (replace) {
      renderPmMessages([], true);
    }

    if (replace) {
      pmInitialLoaded = true;
      flushPendingPmMessages();
    } else {
      pmPollInFlight = false;
    }
  });
}

function flushPendingPmMessages() {
  if (pmPendingMessages.length > 0) {
    renderPmMessages(pmPendingMessages, false);
    pmPendingMessages = [];
  }
}

function startPmPolling() {
  if (pmPollTimer) {
    window.clearInterval(pmPollTimer);
  }
  pmPollTimer = window.setInterval(function() {
    loadPmMessages(false);
  }, 3000);
}

function renderPmMessages(messages, replace) {
  var log = $('pm-log');
  if (!log) {
    return;
  }

  var html = '';
  var i;
  var msg;
  var isMine;
  var idKey;

  if (replace) {
    pmLastId = 0;
    pmMessages = [];
    pmMessageIds = {};
  }

  for (i = 0; i < messages.length; i++) {
    msg = messages[i];
    idKey = String(msg.id);
    if (pmMessageIds.hasOwnProperty(idKey)) {
      continue;
    }
    pmMessageIds[idKey] = true;
    pmMessages.push(msg);
    if (msg.id > pmLastId) {
      pmLastId = msg.id;
    }
  }

  pmMessages.sort(function(left, right) {
    return left.id - right.id;
  });

  if (pmMessages.length === 0) {
    html = '<div class="chat-line"><span class="chat-text">*** Начните переписку...</span></div>';
  }

  for (i = 0; i < pmMessages.length; i++) {
    msg = pmMessages[i];
    isMine = msg.from_user_id === pmMyId;
    html += '<div class="chat-line">';
    html += '<span class="chat-time">[' + formatTime(msg.created_at) + ']</span> ';
    if (isMine) {
      html += '<span class="chat-user pm-out">&lt;Я&gt;</span> ';
    } else {
      html += '<span class="chat-user">&lt;' + wrapLongText(escapeHtml(msg.from_username), 20) + '&gt;</span> ';
    }
    html += '<span class="chat-text">' + wrapLongText(escapeHtml(msg.content)) + '</span>';
    html += '</div>';
  }

  log.innerHTML = html;
  log.scrollTop = log.scrollHeight;
}

function sendPmMessage() {
  var input = $('pm-input');
  var errorBox = $('pm-error');
  var content = input ? trim(input.value) : '';

  showError(errorBox, '');

  if (!content) {
    showError(errorBox, 'Введите сообщение.');
    return false;
  }

  apiRequest('POST', '/api/pm', { to_user_id: pmFriendId, content: content }, function(res) {
    if (res && res.ok) {
      if (input) {
        input.value = '';
      }
      if (res.message) {
        if (pmInitialLoaded) {
          renderPmMessages([res.message], false);
        } else {
          pmPendingMessages.push(res.message);
        }
      }
    } else {
      showError(errorBox, (res && res.error) ? res.error : 'Не удалось отправить.');
    }
  });

  return false;
}
