function initLoginPage() {
  var form = $('login-form');
  var errorBox = $('error-box');

  if (getToken()) {
    apiRequest('GET', '/api/me', null, function(res) {
      if (res && res.ok) {
        window.location.href = 'chat.html';
      }
    });
  }

  if (form) {
    form.onsubmit = handleLogin;
  }

  function handleLogin() {
    var username = $('username') ? $('username').value : '';
    var password = $('password') ? $('password').value : '';

    showError(errorBox, '');

    apiRequest('POST', '/api/login', { username: username, password: password }, function(res) {
      if (res && res.ok) {
        setToken(res.token);
        window.location.href = 'chat.html';
      } else {
        showError(errorBox, (res && res.error) ? res.error : 'Ошибка входа.');
      }
    });

    return false;
  }
}

function initRegisterPage() {
  var form = $('register-form');
  var errorBox = $('error-box');
  var okBox = $('ok-box');

  if (form) {
    form.onsubmit = handleRegister;
  }

  function handleRegister() {
    var username = $('username') ? $('username').value : '';
    var password = $('password') ? $('password').value : '';
    var password2 = $('password2') ? $('password2').value : '';

    showError(errorBox, '');
    showError(okBox, '');

    if (password !== password2) {
      showError(errorBox, 'Пароли не совпадают.');
      return false;
    }

    apiRequest('POST', '/api/register', { username: username, password: password }, function(res) {
      if (res && res.ok) {
        setToken(res.token);
        if (okBox) {
          okBox.style.display = 'block';
          okBox.innerHTML = 'Регистрация успешна! Переход в чат...';
        }
        window.setTimeout(function() {
          window.location.href = 'chat.html';
        }, 1200);
      } else {
        showError(errorBox, (res && res.error) ? res.error : 'Ошибка регистрации.');
      }
    });

    return false;
  }
}
