var foundProfile = null;
var foundPin = '';

function initFriendsPage() {
  requireAuth(function(profile) {
    var userLabel = $('current-user');
    if (userLabel) {
      userLabel.innerHTML = wrapLongText(escapeHtml(profile.username), 20);
    }
    if ($('my-pin')) {
      $('my-pin').innerHTML = escapeHtml(profile.pin || '');
    }
    bindSearchForm();
    bindLogoutBtn('logout-btn');
    startNotificationPolling();
    loadFriendRequests();
    loadFriends();
  });
}

function bindSearchForm() {
  bindSubmit($('search-form'), function() {
    var pinInput = $('pin-input');
    var pin = pinInput ? String(pinInput.value || '').replace(/\D/g, '') : '';
    var errorBox = $('search-error');

    showError(errorBox, '');

    if (pin.length !== 8) {
      showError(errorBox, 'Введите PIN из 8 цифр.');
      return false;
    }

    foundPin = pin;

    apiRequest('GET', '/api/profile/pin/' + pin, null, function(res) {
      if (res && res.ok && res.profile) {
        foundProfile = res.profile;
        renderFoundProfile(res.profile);
      } else {
        foundProfile = null;
        renderFoundProfile(null);
        showError(errorBox, (res && res.error) ? res.error : 'Не найдено.');
      }
    });

    return false;
  });
}

function renderFoundProfile(profile) {
  var box = $('found-profile');
  if (!box) {
    return;
  }

  if (!profile) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  var html = '';
  html += '<div class="profile-card">';
  html += '<div class="profile-card-name">' + escapeHtml(profile.username) + '</div>';
  html += '<div class="profile-card-row"><b>PIN:</b> ' + escapeHtml(profile.is_self ? profile.pin : '********') + '</div>';
  html += '<div class="profile-card-row"><b>Статус:</b> ' + (profile.status ? escapeHtml(profile.status) : '<i>не указан</i>') + '</div>';
  html += '<div class="profile-card-row"><b>Онлайн:</b> ' + (profile.online ? '<span class="status-online">да</span>' : '<span class="status-offline">нет</span>') + '</div>';
  html += '<div class="profile-card-about">' + (profile.about ? wrapLongText(escapeHtml(profile.about)) : '<i>ничего не написано</i>') + '</div>';

  if (profile.is_self) {
    html += '<p><i>Это ваш профиль.</i> <a href="profile.html">Настроить</a></p>';
  } else if (profile.is_friend) {
    html += '<p>';
    html += '<a href="pm.html?id=' + profile.id + '" class="btn-link">Написать в ЛС</a> ';
    html += '<input type="button" value=" Удалить из друзей " class="btn" onclick="removeFriend(' + profile.id + '); return false;">';
    html += '</p>';
  } else if (profile.request_received) {
    html += '<p><i>Этот пользователь хочет добавить вас в друзья.</i></p>';
    html += '<p>';
    html += '<input type="button" value=" Принять " class="btn" onclick="acceptRequest(' + profile.request_id + '); return false;"> ';
    html += '<input type="button" value=" Отклонить " class="btn" onclick="declineRequest(' + profile.request_id + '); return false;">';
    html += '</p>';
  } else if (profile.request_sent) {
    html += '<p><i>Заявка отправлена. Ожидайте подтверждения.</i></p>';
    html += '<p><input type="button" value=" Отменить заявку " class="btn" onclick="cancelOutgoingRequest(' + profile.id + '); return false;"></p>';
  } else {
    html += '<p><input type="button" value=" Отправить заявку " class="btn" onclick="sendFriendRequest(); return false;"></p>';
  }

  html += '</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}

function sendFriendRequest() {
  if (!foundProfile || foundProfile.is_self) {
    return;
  }

  var errorBox = $('search-error');
  showError(errorBox, '');

  apiRequest('POST', '/api/friends', { pin: foundPin }, function(res) {
    if (res && res.ok) {
      if (res.accepted) {
        foundProfile.is_friend = true;
        foundProfile.request_sent = false;
        foundProfile.request_received = false;
      } else {
        foundProfile.request_sent = true;
      }
      renderFoundProfile(foundProfile);
      loadFriendRequests();
      loadFriends();
    } else {
      showError(errorBox, (res && res.error) ? res.error : 'Не удалось отправить заявку.');
    }
  });
}

function acceptRequest(requestId) {
  var errorBox = $('search-error');
  showError(errorBox, '');

  apiRequest('POST', '/api/friend-requests/' + requestId + '/accept', {}, function(res) {
    if (res && res.ok) {
      if (foundProfile && foundProfile.request_id === requestId) {
        foundProfile.is_friend = true;
        foundProfile.request_received = false;
        foundProfile.request_sent = false;
        renderFoundProfile(foundProfile);
      }
      loadFriendRequests();
      loadFriends();
    } else {
      showError(errorBox, (res && res.error) ? res.error : 'Не удалось принять заявку.');
    }
  });
}

function declineRequest(requestId) {
  apiRequest('POST', '/api/friend-requests/' + requestId + '/decline', {}, function(res) {
    if (res && res.ok) {
      if (foundProfile && foundProfile.request_id === requestId) {
        foundProfile.request_received = false;
        foundProfile.request_id = null;
        renderFoundProfile(foundProfile);
      }
      loadFriendRequests();
    }
  });
}

function cancelOutgoingRequest(userId) {
  apiRequest('GET', '/api/friend-requests', null, function(res) {
    if (!res || !res.ok || !res.outgoing) {
      return;
    }
    var i;
    var reqId = null;
    for (i = 0; i < res.outgoing.length; i++) {
      if (res.outgoing[i].user_id === userId) {
        reqId = res.outgoing[i].id;
        break;
      }
    }
    if (!reqId) {
      return;
    }
    apiRequest('POST', '/api/friend-requests/' + reqId + '/decline', {}, function(declineRes) {
      if (declineRes && declineRes.ok) {
        if (foundProfile && foundProfile.id === userId) {
          foundProfile.request_sent = false;
          renderFoundProfile(foundProfile);
        }
        loadFriendRequests();
      }
    });
  });
}

function removeFriend(friendId) {
  apiRequest('DELETE', '/api/friends/' + friendId, null, function(res) {
    if (res && res.ok) {
      if (foundProfile && foundProfile.id === friendId) {
        foundProfile.is_friend = false;
        renderFoundProfile(foundProfile);
      }
      loadFriends();
    }
  });
}

function loadFriendRequests() {
  apiRequest('GET', '/api/friend-requests', null, function(res) {
    renderIncomingRequests(res && res.ok ? res.incoming : []);
    renderOutgoingRequests(res && res.ok ? res.outgoing : []);
  });
}

function renderIncomingRequests(requests) {
  var box = $('incoming-requests');
  if (!box) {
    return;
  }

  if (!requests || requests.length === 0) {
    box.innerHTML = '<p class="empty-note">Нет входящих заявок.</p>';
    return;
  }

  var html = '';
  var i;
  var r;

  for (i = 0; i < requests.length; i++) {
    r = requests[i];
    html += '<div class="friend-item request-item">';
    html += '<div class="friend-name">' + escapeHtml(r.username) + '</div>';
    if (r.status) {
      html += '<div class="friend-status">' + escapeHtml(r.status) + '</div>';
    }
    html += '<div class="friend-actions">';
    html += '<input type="button" value=" Принять " class="btn" onclick="acceptRequest(' + r.id + '); return false;"> ';
    html += '<input type="button" value=" Отклонить " class="btn" onclick="declineRequest(' + r.id + '); return false;">';
    html += '</div>';
    html += '</div>';
  }

  box.innerHTML = html;
}

function renderOutgoingRequests(requests) {
  var box = $('outgoing-requests');
  if (!box) {
    return;
  }

  if (!requests || requests.length === 0) {
    box.innerHTML = '<p class="empty-note">Нет исходящих заявок.</p>';
    return;
  }

  var html = '';
  var i;
  var r;

  for (i = 0; i < requests.length; i++) {
    r = requests[i];
    html += '<div class="friend-item request-item">';
    html += '<div class="friend-name">' + escapeHtml(r.username) + '</div>';
    html += '<div class="friend-status"><i>ожидает ответа</i></div>';
    html += '<div class="friend-actions">';
    html += '<input type="button" value=" Отменить " class="btn" onclick="declineRequest(' + r.id + '); return false;">';
    html += '</div>';
    html += '</div>';
  }

  box.innerHTML = html;
}

function loadFriends() {
  apiRequest('GET', '/api/friends', null, function(res) {
    var list = $('friends-list');
    if (!list) {
      return;
    }

    if (!res || !res.ok || !res.friends || res.friends.length === 0) {
      list.innerHTML = '<p class="empty-note">Список друзей пуст. Найдите пользователя по PIN.</p>';
      return;
    }

    var html = '';
    var i;
    var f;

    for (i = 0; i < res.friends.length; i++) {
      f = res.friends[i];
      html += '<div class="friend-item">';
      html += '<div class="friend-name">';
      if (f.online) {
        html += '<span class="status-dot online"></span> ';
      } else {
        html += '<span class="status-dot offline"></span> ';
      }
      html += escapeHtml(f.username);
      html += '</div>';
      if (f.status) {
        html += '<div class="friend-status">' + escapeHtml(f.status) + '</div>';
      }
      html += '<div class="friend-actions">';
      html += '<a href="pm.html?id=' + f.id + '">ЛС</a> | ';
      html += '<a href="#" onclick="removeFriend(' + f.id + '); return false;">Удалить</a>';
      html += '</div>';
      html += '</div>';
    }

    list.innerHTML = html;
  });
}

function bindLogoutBtn(id) {
  bindClick($(id), function() {
    doLogout();
    return false;
  });
}
