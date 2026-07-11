var pmLastId = 0;
var pmPollTimer = null;
var pmFriendId = 0;
var pmMyId = 0;

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
  var url = '/api/pm/' + pmFriendId;
  if (!replace && pmLastId > 0) {
    url += '?since=' + pmLastId;
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

    if (res.messages && res.messages.length > 0) {
      renderPmMessages(res.messages, replace);
    } else if (replace) {
      var log = $('pm-log');
      if (log) {
        log.innerHTML = '<div class="chat-line"><span class="chat-text">*** Начните переписку...</span></div>';
      }
    }
  });
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

  var html = replace ? '' : log.innerHTML;
  var i;
  var msg;
  var isMine;

  if (replace && messages.length === 0) {
    html = '<div class="chat-line"><span class="chat-text">*** Начните переписку...</span></div>';
  }

  for (i = 0; i < messages.length; i++) {
    msg = messages[i];
    if (msg.id > pmLastId) {
      pmLastId = msg.id;
    }
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
        renderPmMessages([res.message], false);
      }
    } else {
      showError(errorBox, (res && res.error) ? res.error : 'Не удалось отправить.');
    }
  });

  return false;
}
