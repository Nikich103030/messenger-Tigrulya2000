var lastMessageId = 0;
var pollTimer = null;
var statsTimer = null;
var pollInFlight = false;
var initialMessagesLoaded = false;
var replyingTo = null;
var messageCache = {};
var chatMessages = [];
var chatMessageIds = {};

function initChatPage() {
  requireAuth(function(profile) {
    var userLabel = $('current-user');
    if (userLabel) {
      userLabel.innerHTML = wrapLongText(escapeHtml(profile.username), 20);
    }
    loadInitialMessages();
    startPolling();
    startStatsPolling();
    bindChatForm();
    bindLogout();
    bindReplyCancel();
    startNotificationPolling();
  });
}

function bindChatForm() {
  var form = $('chat-form');
  if (form) {
    form.onsubmit = sendMessage;
  }
}

function bindLogout() {
  var btn = $('logout-btn');
  if (!btn) {
    return;
  }
  btn.onclick = doLogout;
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
    initialMessagesLoaded = true;
  });
}

function startPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(pollMessages, 1000);
}

function startStatsPolling() {
  if (statsTimer) {
    window.clearInterval(statsTimer);
  }
  loadStats();
  statsTimer = window.setInterval(loadStats, 30000);
}

function pollMessages() {
  if (!initialMessagesLoaded || pollInFlight) {
    return;
  }

  var url = '/api/messages?since=' + lastMessageId;
  pollInFlight = true;
  apiRequest('GET', url, null, function(res) {
    if (res && res.ok && res.messages && res.messages.length > 0) {
      renderMessages(res.messages, false);
    }
    pollInFlight = false;
  });
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

  var html = '';
  var i;
  var idKey;

  if (replace) {
    messageCache = {};
    chatMessages = [];
    chatMessageIds = {};
    lastMessageId = 0;
  }

  for (i = 0; i < messages.length; i++) {
    var msg = messages[i];
    idKey = String(msg.id);
    if (chatMessageIds.hasOwnProperty(idKey)) {
      continue;
    }
    chatMessageIds[idKey] = true;
    chatMessages.push(msg);
    if (msg.id > lastMessageId) {
      lastMessageId = msg.id;
    }
  }

  chatMessages.sort(function(left, right) {
    return left.id - right.id;
  });
  for (i = 0; i < chatMessages.length; i++) {
    html += renderMessageLine(chatMessages[i]);
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
