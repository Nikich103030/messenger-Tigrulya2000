function initProfilePage() {
  requireAuth(function(profile) {
    fillProfileForm(profile);
    bindProfileForm();
    bindLogoutBtn('logout-btn');
    startNotificationPolling();
  });
}

function fillProfileForm(profile) {
  var usernameEl = $('profile-username');
  var pinEl = $('profile-pin');
  var statusEl = $('profile-status');
  var aboutEl = $('profile-about');

  if (usernameEl) {
    usernameEl.innerHTML = escapeHtml(profile.username);
  }
  if (pinEl) {
    pinEl.innerHTML = escapeHtml(profile.pin || '--------');
  }
  if (statusEl) {
    statusEl.value = profile.status || '';
  }
  if (aboutEl) {
    aboutEl.value = profile.about || '';
  }
}

function bindProfileForm() {
  bindSubmit($('profile-form'), function() {
    var statusEl = $('profile-status');
    var aboutEl = $('profile-about');
    var errorBox = $('error-box');
    var okBox = $('ok-box');

    showError(errorBox, '');
    showError(okBox, '');

    apiRequest(
      'PUT',
      '/api/profile',
      {
        status: statusEl ? statusEl.value : '',
        about: aboutEl ? aboutEl.value : ''
      },
      function(res) {
        if (res && res.ok) {
          if (okBox) {
            okBox.style.display = 'block';
            okBox.innerHTML = 'Профиль сохранён!';
          }
          if (res.profile) {
            fillProfileForm(res.profile);
          }
        } else {
          showError(errorBox, (res && res.error) ? res.error : 'Ошибка сохранения.');
        }
      }
    );

    return false;
  });
}

function bindLogoutBtn(id) {
  bindClick($(id), function() {
    doLogout();
    return false;
  });
}
