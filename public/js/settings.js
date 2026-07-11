var THEME_FIELDS = [
  { key: 'header_bg', label: 'Шапка (фон)', hint: 'Фон блока с Tigrulya2000' },
  { key: 'header_title', label: 'Заголовок (цвет)', hint: 'Цвет текста «★ Tigrulya2000 ★»' },
  { key: 'header_subtitle', label: 'Подзаголовок', hint: 'Цвет подписи под заголовком' },
  { key: 'body_bg', label: 'Фон страницы', hint: 'Общий фон сайта' },
  { key: 'nav_bg', label: 'Меню', hint: 'Фон панели навигации' },
  { key: 'win_title_bg', label: 'Заголовки окон', hint: 'Фон полосок «Вход», «Чат» и т.д.' },
  { key: 'win_title_fg', label: 'Текст заголовков', hint: 'Цвет текста в заголовках окон' },
  { key: 'panel_bg', label: 'Панели', hint: 'Фон серых окон' },
  { key: 'link_color', label: 'Ссылки', hint: 'Цвет ссылок' },
  { key: 'chat_bg', label: 'Чат (фон)', hint: 'Фон окна сообщений' },
  { key: 'chat_text', label: 'Чат (текст)', hint: 'Цвет текста сообщений' },
  { key: 'chat_user', label: 'Чат (ник)', hint: 'Цвет имён в чате' },
  { key: 'user_badge_bg', label: 'Бейдж профиля', hint: 'Фон вашего имени в боковой панели' }
];

function initSettingsPage() {
  requireAuth(function() {
    renderThemeForm();
    bindThemeForm();
    bindPresets();
    bindLogoutBtn('logout-btn');
    startNotificationPolling();
    apiRequest('GET', '/api/theme', null, function(res) {
      fillThemeForm(res && res.ok ? mergeTheme(res.theme) : DEFAULT_THEME);
    });
  });
}

function renderThemeForm() {
  var box = $('theme-fields');
  if (!box) {
    return;
  }

  var html = '';
  var i;
  var field;

  html += '<table class="form-table theme-form-table" cellpadding="0" cellspacing="0">';

  for (i = 0; i < THEME_FIELDS.length; i++) {
    field = THEME_FIELDS[i];
    html += '<tr>';
    html += '<td class="label">' + escapeHtml(field.label) + ':</td>';
    html += '<td>';
    html += '<input type="text" id="theme-' + field.key + '" class="text-field color-field" maxlength="7" autocomplete="off">';
    html += ' <span id="swatch-' + field.key + '" class="color-swatch">&nbsp;</span>';
    html += '<br><small>' + escapeHtml(field.hint) + '</small>';
    html += '</td>';
    html += '</tr>';
  }

  html += '<tr>';
  html += '<td>&nbsp;</td>';
  html += '<td>';
  html += '<input type="submit" value=" Сохранить " class="btn"> ';
  html += '<input type="button" id="theme-generate-btn" value=" Сгенерировать " class="btn"> ';
  html += '<input type="button" id="theme-preview-btn" value=" Предпросмотр " class="btn">';
  html += '</td>';
  html += '</tr>';
  html += '</table>';

  box.innerHTML = html;
}

function fillThemeForm(theme) {
  var i;
  var field;
  var input;
  var swatch;

  for (i = 0; i < THEME_FIELDS.length; i++) {
    field = THEME_FIELDS[i];
    input = $('theme-' + field.key);
    swatch = $('swatch-' + field.key);
    if (input) {
      input.value = theme[field.key] || DEFAULT_THEME[field.key];
    }
    if (swatch) {
      swatch.style.backgroundColor = theme[field.key] || DEFAULT_THEME[field.key];
    }
  }
}

function readThemeForm() {
  var theme = {};
  var i;
  var field;
  var input;
  var value;

  for (i = 0; i < THEME_FIELDS.length; i++) {
    field = THEME_FIELDS[i];
    input = $('theme-' + field.key);
    value = input ? normalizeHexInput(input.value) : '';
    if (!value) {
      value = DEFAULT_THEME[field.key];
      if (input) {
        input.value = value;
      }
    }
    theme[field.key] = value;
  }

  return theme;
}

function updateSwatches(theme) {
  var i;
  var field;
  var swatch;

  for (i = 0; i < THEME_FIELDS.length; i++) {
    field = THEME_FIELDS[i];
    swatch = $('swatch-' + field.key);
    if (swatch) {
      swatch.style.backgroundColor = theme[field.key];
    }
  }
}

function bindThemeForm() {
  bindSubmit($('theme-form'), function() {
    var errorBox = $('error-box');
    var okBox = $('ok-box');
    var theme = readThemeForm();

    showError(errorBox, '');
    showError(okBox, '');

    apiRequest('PUT', '/api/theme', theme, function(res) {
      if (res && res.ok) {
        applyTheme(res.theme);
        fillThemeForm(res.theme);
        if (okBox) {
          okBox.style.display = 'block';
          okBox.innerHTML = 'Оформление сохранено!';
        }
      } else {
        showError(errorBox, (res && res.error) ? res.error : 'Ошибка сохранения.');
      }
    });

    return false;
  });

  bindClick($('theme-generate-btn'), function() {
    var errorBox = $('error-box');
    var okBox = $('ok-box');
    var theme = generateRandomTheme();

    showError(errorBox, '');
    showError(okBox, '');

    fillThemeForm(theme);
    applyTheme(theme);

    if (okBox) {
      okBox.style.display = 'block';
      okBox.innerHTML = 'Случайная тема сгенерирована! Нажмите «Сохранить», если нравится.';
    }

    return false;
  });

  bindClick($('theme-preview-btn'), function() {
    var theme = readThemeForm();
    applyTheme(theme);
    updateSwatches(theme);
    return false;
  });
}

function bindPresets() {
  var buttons = document.getElementsByTagName('input');
  var i;
  var btn;
  var preset;

  for (i = 0; i < buttons.length; i++) {
    btn = buttons[i];
    if (btn.className && btn.className.indexOf('preset-btn') !== -1) {
      preset = btn.getAttribute('data-preset');
      if (preset && THEME_PRESETS[preset]) {
        bindClick(btn, (function(p) {
          return function() {
            fillThemeForm(THEME_PRESETS[p]);
            applyTheme(THEME_PRESETS[p]);
            return false;
          };
        })(preset));
      }
    }
  }
}

function bindLogoutBtn(id) {
  bindClick($(id), function() {
    doLogout();
    return false;
  });
}
