var lastMessageId = 0;
var pollTimer = null;
var replyingTo = null;
var messageCache = {};

function initChatPage() {
  requireAuth(function(profile) {
    var userLabel = $('current-user');
    if (userLabel) {
      userLabel.innerHTML = wrapLongText(escapeHtml(profile.username), 20);
    }
    loadInitialMessages();
    startPolling();
    loadStats();
    bindChatForm();
    bindLogout();
    bindReplyCancel();
    startNotificationPolling();
  });
}

function bindChatForm() {
  var form = $('chat-form');
  if (form && form.attachEvent) {
    form.attachEvent('onsubmit', sendMessage);
  } else if (form) {
    form.onsubmit = sendMessage;
  }
}

function bindLogout() {
  var btn = $('logout-btn');
  if (!btn) {
    return;
  }
  if (btn.attachEvent) {
    btn.attachEvent('onclick', doLogout);
  } else {
    btn.onclick = doLogout;
  }
}

function bindReplyCancel() {
  bindClick($('reply-cancel-btn'), function() {
    clearReply();
    return false;
  });
}

function doLogout() {
  apiRequest('POST', '/api/logout', {}, function() {
    clearToken();
    window.location.href = 'index.html';
  });
}

function cacheMessage(msg) {
  messageCache[msg.id] = {
    id: msg.id,
    username: msg.username,
    content: msg.content
  };
}

function truncateText(text, maxLen) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen - 3) + '...';
}

function startReply(msgId) {
  var msg = messageCache[msgId];
  if (!msg) {
    return false;
  }
  replyingTo = msg;
  updateReplyPreview();
  var input = $('message-input');
  if (input) {
    input.focus();
  }
  return false;
}

function clearReply() {
  replyingTo = null;
  updateReplyPreview();
}

function updateReplyPreview() {
  var box = $('reply-preview');
  var textEl = $('reply-preview-text');
  if (!box || !textEl) {
    return;
  }

  if (replyingTo) {
    box.style.display = 'block';
    textEl.innerHTML =
      'Ответ для &lt;' +
      wrapLongText(escapeHtml(replyingTo.username), 20) +
      '&gt;: ' +
      wrapLongText(escapeHtml(truncateText(replyingTo.content, 100)));
  } else {
    box.style.display = 'none';
    textEl.innerHTML = '';
  }
}

function loadInitialMessages() {
  apiRequest('GET', '/api/messages', null, function(res) {
    if (res && res.ok && res.messages) {
      renderMessages(res.messages, true);
    }
  });
}

function startPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(pollMessages, 1000);
}

function pollMessages() {
  var url = '/api/messages?since=' + lastMessageId;
  apiRequest('GET', url, null, function(res) {
    if (res && res.ok && res.messages && res.messages.length > 0) {
      renderMessages(res.messages, false);
    }
  });
  loadStats();
}

function loadStats() {
  apiRequest('GET', '/api/stats', null, function(res) {
    if (res && res.ok) {
      var usersEl = $('stat-users');
      var msgsEl = $('stat-messages');
      var onlineEl = $('stat-online');
      if (usersEl) {
        usersEl.innerHTML = String(res.users);
      }
      if (msgsEl) {
        msgsEl.innerHTML = String(res.messages);
      }
      if (onlineEl) {
        onlineEl.innerHTML = String(res.online);
      }
    }
  });
}

function renderReplyQuote(replyTo) {
  var html = '';
  if (!replyTo || !replyTo.username) {
    return html;
  }
  html += '<div class="chat-reply">';
  html += '&gt; &lt;' + wrapLongText(escapeHtml(replyTo.username), 20) + '&gt;: ';
  html += wrapLongText(escapeHtml(truncateText(replyTo.content, 80)));
  html += '</div>';
  return html;
}

function renderMessageLine(msg) {
  var html = '';

  cacheMessage(msg);

  html += '<div class="chat-line" id="msg-' + msg.id + '">';
  html += '<span class="chat-time">[' + formatTime(msg.created_at) + ']</span> ';
  html += '<span class="chat-user">&lt;' + wrapLongText(escapeHtml(msg.username), 20) + '&gt;</span> ';
  html += '<a href="#" class="chat-reply-btn" onclick="startReply(' + msg.id + '); return false;" title="Ответить">[↩]</a> ';
  html += renderReplyQuote(msg.reply_to);
  html += '<span class="chat-text">' + wrapLongText(escapeHtml(msg.content)) + '</span>';
  html += '</div>';

  return html;
}

function renderMessages(messages, replace) {
  var log = $('chat-log');
  if (!log) {
    return;
  }

  var html = replace ? '' : log.innerHTML;
  var i;

  if (replace) {
    messageCache = {};
  }

  for (i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (msg.id > lastMessageId) {
      lastMessageId = msg.id;
    }
    html += renderMessageLine(msg);
  }

  log.innerHTML = html;
  log.scrollTop = log.scrollHeight;
}

function sendMessage() {
  var input = $('message-input');
  var errorBox = $('chat-error');
  var content = input ? trim(input.value) : '';
  var payload;

  showError(errorBox, '');

  if (!content) {
    showError(errorBox, 'Введите сообщение.');
    return false;
  }

  payload = { content: content };
  if (replyingTo && replyingTo.id) {
    payload.reply_to_id = replyingTo.id;
  }

  apiRequest('POST', '/api/messages', payload, function(res) {
    if (res && res.ok) {
      if (input) {
        input.value = '';
      }
      clearReply();
      if (res.message) {
        renderMessages([res.message], false);
      }
    } else {
      showError(errorBox, (res && res.error) ? res.error : 'Не удалось отправить.');
    }
  });

  return false;
}
