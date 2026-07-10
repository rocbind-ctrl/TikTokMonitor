/** TikTok 监控 - 前端交互 */
(function () {
  var toastEl = null;

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('monitor-theme', next);
    var label = document.querySelector('.theme-toggle-label');
    if (label) label.textContent = next === 'dark' ? '深色模式' : '浅色模式';
  }

  setTheme(getTheme());

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  function toast(msg, type) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'toast toast-' + (type || 'info');
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.style.display = 'none'; }, 3200);
  }

  window.Monitor = { toast: toast };

  function showPageLoading() {
    if (document.body.classList.contains('is-navigating')) return;
    document.body.classList.add('is-navigating');
    var bar = document.getElementById('page-loading-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'page-loading-bar';
      bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bar);
    }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    if (href.indexOf('http') === 0 || href.indexOf('//') === 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    showPageLoading();
  }, true);

  window.addEventListener('pageshow', function () {
    document.body.classList.remove('is-navigating');
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (form.id === 'addForm') return;
    showPageLoading();
  }, true);

  var wasSyncing = false;

  function updateSyncBar(data) {
    var bar = document.getElementById('sync-live-bar');
    var text = document.getElementById('sync-live-text');
    if (!bar || !text) return;

    var busy = !!(data.running || (data.queue_size && data.queue_size > 0));
    if (busy) {
      wasSyncing = true;
      bar.style.display = 'flex';
      if (data.running) {
        var cur = data.current_username ? ' · @' + data.current_username : '';
        text.textContent = '同步中 ' + (data.completed || 0) + '/' + (data.total || 0) + cur;
      } else {
        text.textContent = '同步队列等待中…（' + data.queue_size + '）';
      }
      return;
    }

    bar.style.display = 'none';
    if (wasSyncing) {
      wasSyncing = false;
      setTimeout(function () { location.reload(); }, 600);
    }
  }

  if (typeof EventSource !== 'undefined') {
    try {
      var es = new EventSource('/api/events/stream');
      es.onmessage = function (ev) {
        try {
          updateSyncBar(JSON.parse(ev.data));
        } catch (e) { /* ignore */ }
      };
      es.onerror = function () { /* auto-reconnect */ };
    } catch (e) { /* ignore */ }
  }

  var addForm = document.getElementById('addForm');
  if (addForm) {
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('addBtn');
      if (btn) { btn.disabled = true; btn.textContent = '添加中…'; }
      var body = new FormData();
      body.append('username', addForm.querySelector('[name=username]').value);
      var group = addForm.querySelector('[name=group_name]');
      var phone = addForm.querySelector('[name=phone]');
      var employee = addForm.querySelector('[name=employee]');
      var note = addForm.querySelector('[name=note]');
      if (group) body.append('group_name', group.value);
      if (phone) body.append('phone', phone.value);
      if (employee) body.append('employee', employee.value);
      if (note) body.append('note', note.value);
      fetch('/api/accounts/add', { method: 'POST', body: body })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.status === 'success') {
            toast(d.message, 'success');
            setTimeout(function () { location.reload(); }, 600);
          } else {
            toast(d.message || '添加失败', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '添加'; }
          }
        })
        .catch(function () {
          toast('添加失败', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '添加'; }
        });
    });
  }

  document.addEventListener('click', function (e) {
    var delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      e.preventDefault();
      var id = delBtn.getAttribute('data-delete-id');
      var name = delBtn.getAttribute('data-username') || id;
      if (!confirm('确定删除 @' + name + '？\n将同时删除该账号的所有视频和历史数据，不可恢复。')) return;
      delBtn.disabled = true;
      fetch('/accounts/' + id + '/delete', { method: 'POST' })
        .then(function () {
          toast('已删除 @' + name, 'success');
          setTimeout(function () { location.reload(); }, 400);
        })
        .catch(function () {
          toast('删除失败', 'error');
          delBtn.disabled = false;
        });
      return;
    }

    var syncAllBtn = e.target.closest('[data-sync-all]');
    if (syncAllBtn) {
      e.preventDefault();
      if (syncAllBtn.disabled) return;
      syncAllBtn.disabled = true;
      fetch('/api/sync/all', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          toast(d.message || '已加入队列', d.status === 'error' ? 'error' : 'success');
          syncAllBtn.disabled = false;
        })
        .catch(function () {
          toast('同步失败', 'error');
          syncAllBtn.disabled = false;
        });
      return;
    }

    var btn = e.target.closest('[data-sync-id]');
    if (!btn || btn.disabled) return;
    var id = btn.getAttribute('data-sync-id');
    btn.disabled = true;
    fetch('/api/accounts/' + id + '/sync', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        toast(d.message || '已加入队列', d.status === 'error' ? 'error' : 'success');
        btn.disabled = false;
      })
      .catch(function () {
        toast('同步失败', 'error');
        btn.disabled = false;
      });
  });

  function saveTags(container) {
    var id = container.getAttribute('data-account-id');
    if (!id) return;
    var inputs = container.querySelectorAll('.tag-input');
    var body = new FormData();
    inputs.forEach(function (inp) { body.append(inp.name, inp.value); });
    inputs.forEach(function (inp) { inp.classList.add('is-saving'); });
    fetch('/api/accounts/' + id + '/tags', { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        inputs.forEach(function (inp) {
          inp.classList.remove('is-saving');
          if (data.status === 'success') {
            inp.classList.add('is-saved');
            inp.dataset.original = inp.value;
            setTimeout(function () { inp.classList.remove('is-saved'); }, 1200);
          } else {
            inp.classList.add('is-error');
            toast(data.message || '保存失败', 'error');
          }
        });
      })
      .catch(function () {
        inputs.forEach(function (inp) {
          inp.classList.remove('is-saving');
          inp.classList.add('is-error');
        });
        toast('保存失败', 'error');
      });
  }

  document.querySelectorAll('.tag-fields').forEach(function (container) {
    container.querySelectorAll('.tag-input').forEach(function (inp) {
      inp.dataset.original = inp.value;
      inp.addEventListener('blur', function () {
        var changed = false;
        container.querySelectorAll('.tag-input').forEach(function (i) {
          if (i.value !== i.dataset.original) changed = true;
        });
        if (changed) saveTags(container);
      });
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
      });
    });
  });
})();
