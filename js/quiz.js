/* ============================================================
   Логика квиза «Работа в Кот и Пёс»
   Ванильный JS, без зависимостей.
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('quizForm');
  if (!form) return;

  var card = document.getElementById('quizCard');
  var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
  var total = steps.length;
  var current = 0;

  var progressBar = document.getElementById('progressBar');
  var progressTrack = document.getElementById('progressTrack');
  var stepLabel = document.getElementById('stepLabel');
  var percentLabel = document.getElementById('percentLabel');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');
  var btnSubmit = document.getElementById('btnSubmit');
  var thanks = document.getElementById('thanks');
  var formAlert = document.getElementById('formAlert');
  var startedAt = document.getElementById('startedAt');

  var STORAGE_KEY = 'kotipes_quiz_draft';
  var ENDPOINT = 'php/send.php';

  /* ---------- Черновик в localStorage ---------- */

  function storageAvailable() {
    try {
      window.localStorage.setItem('__t', '1');
      window.localStorage.removeItem('__t');
      return true;
    } catch (e) {
      return false;
    }
  }

  var canStore = storageAvailable();

  function saveDraft() {
    if (!canStore) return;
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (key === 'nickname' || key === 'started_at') return;
      data[key] = value;
    });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      /* переполнение хранилища не должно ломать форму */
    }
  }

  function restoreDraft() {
    if (!canStore) return;
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }
    Object.keys(data).forEach(function (key) {
      var nodes = form.elements[key];
      if (!nodes) return;
      if (nodes instanceof RadioNodeList || (nodes.length && !nodes.tagName)) {
        Array.prototype.forEach.call(nodes, function (node) {
          if (node.type === 'radio') {
            node.checked = node.value === data[key];
          } else if (node.type === 'checkbox') {
            node.checked = Boolean(data[key]);
          } else {
            node.value = data[key];
          }
        });
      } else if (nodes.type === 'checkbox') {
        nodes.checked = Boolean(data[key]);
      } else {
        nodes.value = data[key];
      }
    });
    syncConditionals();
  }

  function clearDraft() {
    if (!canStore) return;
    window.localStorage.removeItem(STORAGE_KEY);
  }

  /* ---------- Условные блоки ---------- */

  function syncConditionals() {
    var toggles = form.querySelectorAll('[data-toggle]');
    var wanted = {};
    Array.prototype.forEach.call(toggles, function (input) {
      var id = input.getAttribute('data-toggle');
      if (!wanted[id]) wanted[id] = false;
      if (input.checked && input.value === input.getAttribute('data-toggle-when')) {
        wanted[id] = true;
      }
    });
    Object.keys(wanted).forEach(function (id) {
      var block = document.getElementById(id);
      if (block) block.hidden = !wanted[id];
    });
  }

  /* ---------- Валидация ---------- */

  function setError(name, message) {
    var holder = form.querySelector('[data-error-for="' + name + '"]');
    if (holder) {
      holder.textContent = message || '';
      holder.classList.toggle('is-visible', Boolean(message));
    }
    var field = form.elements[name];
    if (field && field.setAttribute) {
      if (message) {
        field.setAttribute('aria-invalid', 'true');
      } else {
        field.removeAttribute('aria-invalid');
      }
    }
  }

  function digitsOf(value) {
    return (value || '').replace(/\D/g, '');
  }

  function validateStep(index) {
    var step = steps[index];
    var ok = true;
    var firstBad = null;

    // Обычные обязательные поля
    Array.prototype.forEach.call(step.querySelectorAll('[data-required]'), function (field) {
      var name = field.name;
      var label = field.getAttribute('data-label') || 'Поле';
      var message = '';

      if (field.type === 'checkbox') {
        if (!field.checked) message = 'Без согласия мы не можем принять анкету';
      } else if (!field.value.trim()) {
        message = label + ' — обязательное поле';
      } else if (field.hasAttribute('data-phone')) {
        var digits = digitsOf(field.value);
        if (digits.length < 11) message = 'Введите телефон полностью — 11 цифр';
      } else if (field.type === 'number') {
        var num = Number(field.value);
        if (isNaN(num) || num < 0) {
          message = 'Введите число';
        } else if (field.min !== '' && num < Number(field.min)) {
          message = 'Значение не меньше ' + field.min;
        } else if (field.max !== '' && num > Number(field.max)) {
          message = 'Значение не больше ' + field.max;
        }
      } else if (field.hasAttribute('data-min')) {
        if (field.value.trim().length < Number(field.getAttribute('data-min'))) {
          message = 'Напишите чуть подробнее — хотя бы пару предложений';
        }
      }

      setError(name, message);
      if (message) {
        ok = false;
        if (!firstBad) firstBad = field;
      }
    });

    // Группы радиокнопок
    Array.prototype.forEach.call(step.querySelectorAll('[data-required-group]'), function (group) {
      var input = group.querySelector('input[type="radio"]');
      if (!input) return;
      var name = input.name;
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      var message = checked ? '' : 'Выберите один из вариантов';
      var holder = form.querySelector('[data-error-for="' + name + '"]');
      if (holder) {
        holder.textContent = message;
        holder.classList.toggle('is-visible', Boolean(message));
      }
      if (message) {
        ok = false;
        if (!firstBad) firstBad = input;
      }
    });

    // E-mail проверяем, только если он заполнен
    var email = step.querySelector('#email');
    if (email && email.value.trim()) {
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
      setError('email', valid ? '' : 'Проверьте адрес — похоже, есть опечатка');
      if (!valid) {
        ok = false;
        if (!firstBad) firstBad = email;
      }
    }

    // Зарплата: максимум не может быть меньше минимума
    var sMin = step.querySelector('#salary_min');
    var sMax = step.querySelector('#salary_max');
    if (sMin && sMax && sMin.value && sMax.value) {
      if (Number(sMax.value) < Number(sMin.value)) {
        setError('salary_max', 'Максимальная не может быть меньше минимальной');
        ok = false;
        if (!firstBad) firstBad = sMax;
      }
    }

    if (firstBad && firstBad.focus) firstBad.focus();
    return ok;
  }

  /* ---------- Переключение шагов ---------- */

  function updateProgress() {
    var percent = Math.round((current / total) * 100);
    progressBar.style.width = percent + '%';
    progressTrack.setAttribute('aria-valuenow', String(percent));
    stepLabel.textContent = 'Шаг ' + (current + 1) + ' из ' + total;
    percentLabel.textContent = percent + '%';
  }

  function showStep(index, scroll) {
    current = Math.max(0, Math.min(index, total - 1));
    steps.forEach(function (step, i) {
      step.hidden = i !== current;
    });

    btnPrev.hidden = current === 0;
    var isLast = current === total - 1;
    btnNext.hidden = isLast;
    btnSubmit.hidden = !isLast;

    updateProgress();

    if (scroll) {
      window.scrollTo({ top: cardOffsetTop(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }

    var focusable = steps[current].querySelector(
      'input:not([type="hidden"]), textarea, select'
    );
    if (focusable && scroll) {
      window.setTimeout(function () {
        focusable.focus({ preventScroll: true });
      }, 260);
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Верх карточки с поправкой на липкую шапку. */
  function cardOffsetTop() {
    var header = document.querySelector('.site-header');
    var offset = header ? header.getBoundingClientRect().height + 12 : 16;
    return card.getBoundingClientRect().top + window.pageYOffset - offset;
  }

  btnNext.addEventListener('click', function () {
    if (!validateStep(current)) return;
    saveDraft();
    showStep(current + 1, true);
  });

  btnPrev.addEventListener('click', function () {
    saveDraft();
    showStep(current - 1, true);
  });

  // Enter внутри однострочного поля = «Далее», а не отправка формы
  form.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var tag = event.target.tagName;
    if (tag === 'TEXTAREA') return;
    event.preventDefault();
    if (current === total - 1) {
      form.requestSubmit ? form.requestSubmit() : btnSubmit.click();
    } else {
      btnNext.click();
    }
  });

  /* ---------- Маска телефона ---------- */

  var phone = form.querySelector('[data-phone]');
  if (phone) {
    phone.addEventListener('input', function () {
      var digits = digitsOf(phone.value);
      if (digits.length && (digits[0] === '8' || digits[0] === '7')) {
        digits = digits.slice(1);
      }
      digits = digits.slice(0, 10);

      var out = '+7';
      if (digits.length) out += ' (' + digits.slice(0, 3);
      if (digits.length >= 4) out += ') ' + digits.slice(3, 6);
      if (digits.length >= 7) out += '-' + digits.slice(6, 8);
      if (digits.length >= 9) out += '-' + digits.slice(8, 10);
      phone.value = out;
    });

    phone.addEventListener('focus', function () {
      if (!phone.value) phone.value = '+7 (';
    });

    phone.addEventListener('blur', function () {
      if (digitsOf(phone.value).length <= 1) phone.value = '';
    });
  }

  /* ---------- Реакция на ввод ---------- */

  form.addEventListener('change', function (event) {
    if (event.target.hasAttribute && event.target.hasAttribute('data-toggle')) {
      syncConditionals();
    }
    saveDraft();
  });

  form.addEventListener('input', function (event) {
    var name = event.target.name;
    if (name) {
      var holder = form.querySelector('[data-error-for="' + name + '"]');
      if (holder && holder.classList.contains('is-visible')) {
        setError(name, '');
      }
    }
  });

  var saveTimer = null;
  form.addEventListener('input', function () {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 600);
  });

  /* ---------- Отправка ---------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!validateStep(current)) return;

    formAlert.hidden = true;
    card.classList.add('is-sending');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Отправляем…';

    var payload = new FormData(form);
    payload.append('page', window.location.href);

    window
      .fetch(ENDPOINT, {
        method: 'POST',
        body: payload,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            throw new Error('Сервер ответил неожиданным образом');
          })
          .then(function (data) {
            if (!response.ok || !data.ok) {
              throw new Error(data && data.error ? data.error : 'Не удалось отправить анкету');
            }
            return data;
          });
      })
      .then(function () {
        clearDraft();
        form.hidden = true;
        document.querySelector('.quiz__progress').hidden = true;
        thanks.hidden = false;
        window.scrollTo({ top: cardOffsetTop(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      })
      .catch(function (error) {
        formAlert.textContent =
          error.message +
          '. Попробуйте ещё раз или позвоните нам: 8 906 387 0807.';
        formAlert.hidden = false;
      })
      .finally(function () {
        card.classList.remove('is-sending');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Отправить анкету';
      });
  });

  /* ---------- Старт ---------- */

  startedAt.value = String(Math.floor(Date.now() / 1000));
  restoreDraft();
  showStep(0, false);

  /* ---------- Модальные окна с юридическими текстами ---------- */

  // Хеш нужен, чтобы на документ можно было дать прямую ссылку.
  var MODAL_HASH = { policyModal: '#policy', consentModal: '#consent-text' };
  var lastFocused = null;

  function openModal(id) {
    var dialog = document.getElementById(id);
    if (!dialog) return;
    lastFocused = document.activeElement;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', ''); // очень старые браузеры: без затемнения
    }

    var body = dialog.querySelector('.modal__body');
    if (body) body.scrollTop = 0;

    if (MODAL_HASH[id] && window.location.hash !== MODAL_HASH[id]) {
      window.history.replaceState(null, '', MODAL_HASH[id]);
    }
  }

  function closeModal(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    if (window.location.hash) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
    }
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
  }

  document.addEventListener('click', function (event) {
    var opener = event.target.closest('[data-modal]');
    if (opener) {
      event.preventDefault();
      openModal(opener.getAttribute('data-modal'));
      return;
    }

    var closer = event.target.closest('[data-modal-close]');
    if (closer) {
      event.preventDefault();
      closeModal(closer.closest('dialog'));
      return;
    }

    // клик по затемнённому фону: цель — сам dialog, а не его содержимое
    if (event.target.tagName === 'DIALOG') {
      closeModal(event.target);
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll('dialog.modal'), function (dialog) {
    // Esc закрываем сами: событие close у dialog приходит не во всех движках,
    // а хеш и фокус нужно вернуть в любом случае.
    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(dialog);
      }
    });

    // Штатное событие остаётся страховкой на случай закрытия иным путём.
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeModal(dialog);
    });
  });

  // Прямая ссылка вида /#policy открывает нужный документ — и при загрузке
  // страницы, и когда по ссылке переходят с уже открытой страницы.
  function openFromHash() {
    var hash = window.location.hash;
    if (!hash) return;
    Object.keys(MODAL_HASH).forEach(function (id) {
      var dialog = document.getElementById(id);
      if (MODAL_HASH[id] === hash && dialog && !dialog.open) openModal(id);
    });
  }

  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  /* ---------- Появление блоков при скролле ---------- */

  var revealables = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealables.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          entry.target.style.transitionDelay = i * 70 + 'ms';
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );
    Array.prototype.forEach.call(revealables, function (node) {
      observer.observe(node);
    });
  } else {
    Array.prototype.forEach.call(revealables, function (node) {
      node.classList.add('is-visible');
    });
  }
})();
