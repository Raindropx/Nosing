'use strict';
/*
 * 桌面 EXE 专用桥接层。
 * 用 file:// 直接打开网页时 window.NSG_HOST 不存在，本文件立即返回，
 * 因此浏览器版行为完全不变；只有 EXE 内嵌服务注入配置后才生效：
 *   1. 把 localStorage 同步镜像到 NSGDAT/state.json（换端口/换机器都不丢设置）
 *   2. 把导出统一走系统「另存为」对话框，位置由用户选（不再自动落到下载目录或 NSGDAT）
 *   3. 状态栏提供「打开数据文件夹」入口
 */
(function () {
  var H = window.NSG_HOST;
  if (!H || !H.token || !H.desktop) return;

  H.errors = [];
  window.addEventListener('error', function (e) {
    H.errors.push(String((e && e.message) || e));
  });
  window.addEventListener('unhandledrejection', function (e) {
    H.errors.push('unhandledrejection: ' + String(e && e.reason));
  });

  var Q = encodeURIComponent(H.token);
  function syncJson(method, url, body) {
    var x = new XMLHttpRequest();
    x.open(method, url, false); // 同步：保证设置写入前页面不会关闭
    if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
    try { x.send(body === undefined ? null : body); } catch (e) { return null; }
    if (x.status !== 200) return null;
    try { return JSON.parse(x.responseText); } catch (e) { return null; }
  }

  // ---- 1. 启动前把 NSGDAT/state.json 里的键值灌回 localStorage ----
  var store = null;
  try { store = window.localStorage; } catch (e) { }
  if (store) {
    var kv = syncJson('GET', '/__nsg__/kv?t=' + Q);
    H.stateKeys = kv && typeof kv === 'object' ? Object.keys(kv).length : -1;
    if (kv && typeof kv === 'object') {
      Object.keys(kv).forEach(function (k) {
        try { store.setItem(k, String(kv[k])); } catch (e) { }
      });
    }
    if (typeof Storage !== 'undefined' && Storage.prototype) {
      var rawSet = Storage.prototype.setItem;
      var rawRemove = Storage.prototype.removeItem;
      var rawClear = Storage.prototype.clear;
      function post(k, v) {
        syncJson('POST', '/__nsg__/kv?t=' + Q, JSON.stringify({ key: k, value: v }));
      }
      Storage.prototype.setItem = function (k, v) {
        var r = rawSet.call(this, k, v);
        if (this === store) post(k, String(v));
        return r;
      };
      Storage.prototype.removeItem = function (k) {
        var r = rawRemove.call(this, k);
        if (this === store) post(k, null);
        return r;
      };
      Storage.prototype.clear = function () {
        var keys = [], i;
        if (this === store) {
          for (i = 0; i < this.length; i++) keys.push(this.key(i));
        }
        var r = rawClear.call(this);
        if (this === store) keys.forEach(function (k) { post(k, null); });
        return r;
      };
    }
  }

  // ---- 2/3. 等全部脚本执行完再改道导出、加状态栏按钮 ----
  document.addEventListener('DOMContentLoaded', function () {
    var NSG = window.NSG;
    if (NSG && NSG.IO && NSG.IO.download) {
      NSG.IO.download = function (data, name) {
        // 先弹「另存为」让用户选位置（与浏览器版 showSaveFilePicker 的顺序一致：
        // 在耗时的渲染/编码之前取得目标路径），取消就直接返回 null。
        return fetch('/__nsg__/pick?t=' + Q + '&name=' + encodeURIComponent(name))
          .then(function (r) {
            if (!r.ok) throw new Error((NSG && NSG.I18N) ? NSG.I18N.t('desktop.savePickError', null, '无法打开另存为对话框') : '无法打开另存为对话框');
            return r.json();
          })
          .then(function (picked) {
            if (picked.canceled || !picked.path) return null;
            return Promise.resolve()
              .then(function () { return typeof data === 'function' ? data() : data; })
              .then(function (blobOrBuf) {
                return (typeof Blob !== 'undefined' && blobOrBuf instanceof Blob)
                  ? blobOrBuf : new Blob([blobOrBuf]);
              })
              .then(function (blob) {
                return fetch('/__nsg__/save?t=' + Q + '&path=' + encodeURIComponent(picked.path), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/octet-stream' },
                  body: blob
                });
              })
              .then(function (r) {
                if (!r.ok) {
                  return r.json().then(function (j) { throw new Error(j.error || ('HTTP ' + r.status)); });
                }
                return r.json();
              })
              .then(function (j) {
                return { method: 'save', name: j.name, path: j.path };
              });
          });
      };
      H.bridged = true;
    }

    var right = document.querySelector('.sb-right');
    if (right) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nsg-data-btn';
      var syncBtnLabel = function () {
        b.textContent = (NSG && NSG.I18N) ? NSG.I18N.t('desktop.openDataDir') : '打开数据文件夹（NSGDAT）';
      };
      syncBtnLabel();
      if (NSG && NSG.I18N && NSG.I18N.onChange) NSG.I18N.onChange(syncBtnLabel);
      b.title = H.dataDir || 'NSGDAT';
      b.onclick = function () {
        fetch('/__nsg__/open?t=' + Q).catch(function () { });
      };
      right.insertBefore(b, right.firstChild);
    }
  });
})();
