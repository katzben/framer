(function () {
  'use strict';

  // --- Platform detection ---

  function detectPlatform() {
    const host = location.hostname;
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('chat.openai.com') || host.includes('chatgpt.com')) return 'chatgpt';
    if (host.includes('gemini.google.com')) return 'gemini';
    return null;
  }

  const platform = detectPlatform();
  if (!platform) return;

  // Platform-specific selectors
  const PLATFORM_CONFIG = {
    claude: {
      getEditor() {
        const editors = document.querySelectorAll('div[contenteditable="true"]');
        for (const el of editors) {
          if (el.offsetParent !== null) return el;
        }
        return editors[0] || null;
      },
      isSendButton(button, editor) {
        if (!button || !editor) return false;
        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('send')) return true;
        const container =
          editor.closest('form') ||
          editor.closest('fieldset') ||
          editor.closest('[class*="composer"]') ||
          editor.closest('[class*="input"]') ||
          nthParent(editor, 5);
        if (!container || !container.contains(button)) return false;
        const skip = ['attach', 'upload', 'microphone', 'mic', 'image', 'file', 'model', 'plus'];
        if (skip.some((w) => label.includes(w))) return false;
        if (button.querySelector('svg')) return true;
        return false;
      },
    },
    chatgpt: {
      getEditor() {
        return document.querySelector('div#prompt-textarea[contenteditable="true"]') || null;
      },
      isSendButton(button) {
        if (!button) return false;
        return button.dataset.testid === 'send-button' ||
          button.closest('[data-testid="send-button"]') !== null;
      },
    },
    gemini: {
      getEditor() {
        const editors = document.querySelectorAll('div[contenteditable="true"]');
        for (const el of editors) {
          if (el.classList && Array.from(el.classList).some(c => c.includes('ql-editor'))) return el;
        }
        return null;
      },
      isSendButton(button) {
        if (!button) return false;
        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        return label === 'send message';
      },
    },
  };

  const config = PLATFORM_CONFIG[platform];

  console.log(`Conversation Framer content script loaded (${platform})`);

  // --- State ---
  let injected = false;
  let currentUrl = location.href;
  let constitution = null;
  let autoInject = true;

  // --- Load settings eagerly so injection is synchronous at send time ---

  const constitutionKey = platform + '_constitution';
  const settingsKey = platform + '_settings';

  chrome.storage.sync.get([constitutionKey, settingsKey], (data) => {
    constitution = data[constitutionKey] || null;
    autoInject = data[settingsKey]?.autoInject !== false;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[constitutionKey]) {
      constitution = changes[constitutionKey].newValue || null;
    }
    if (changes[settingsKey]) {
      autoInject = changes[settingsKey].newValue?.autoInject !== false;
    }
  });

  // --- SPA navigation detection ---
  // All three platforms are SPAs — URL changes without full page reloads.
  // Intercept pushState/replaceState and popstate to detect navigation.

  function onNavigate() {
    const newUrl = location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      injected = false;
      removeIndicator();
    }
  }

  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    onNavigate();
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    onNavigate();
  };

  window.addEventListener('popstate', onNavigate);

  // Fallback: poll for URL changes that bypass history API
  setInterval(onNavigate, 1000);

  // Listen for background script messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'framer-tab-ready') {
      onNavigate();
    }
    if (msg.type === 'framer-reset-injection') {
      injected = false;
      removeIndicator();
    }
  });

  // --- DOM helpers ---

  function getEditor() {
    return config.getEditor();
  }

  function getEditorText(editor) {
    return (editor.innerText || '').trim();
  }

  function isSendButton(button, editor) {
    return config.isSendButton(button, editor);
  }

  function nthParent(el, n) {
    let node = el;
    for (let i = 0; i < n && node; i++) node = node.parentElement;
    return node;
  }

  // --- Indicator UI ---

  const INDICATOR_ID = 'framer-indicator';

  function removeIndicator() {
    const el = document.getElementById(INDICATOR_ID);
    if (el) el.remove();
  }

  function showIndicator(editor) {
    removeIndicator();

    const el = document.createElement('div');
    el.id = INDICATOR_ID;
    el.textContent = '\u2713 Conversation Framer active';
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '12px',
      right: '16px',
      fontSize: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      color: '#22c55e',
      background: 'rgba(255,255,255,0.92)',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '4px 10px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 300ms ease',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    });

    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });

    // Fade out after 4 seconds
    setTimeout(() => {
      if (el.parentElement) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }
    }, 4000);
  }

  function showWarning() {
    removeIndicator();

    const el = document.createElement('div');
    el.id = INDICATOR_ID;
    el.textContent = 'No constitution set \u2014 open Conversation Framer to generate one';
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '12px',
      right: '16px',
      fontSize: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      color: '#92400e',
      background: '#fffbeb',
      border: '1px solid #f59e0b',
      borderRadius: '6px',
      padding: '4px 10px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 300ms ease',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    });

    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });

    setTimeout(() => {
      if (el.parentElement) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }
    }, 4000);
  }

  // --- Constitution injection ---

  function prependConstitution(editor) {
    const currentText = getEditorText(editor);
    if (!currentText) return false;

    const combined = constitution + '\n\n' + currentText;

    editor.focus();

    // Select all existing content
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);

    // Replace via execCommand — this goes through the browser's editing
    // pipeline, which ProseMirror / React hooks into.  The framework sees
    // a real "input" event and updates its internal model accordingly.
    document.execCommand('insertText', false, combined);

    return true;
  }

  /**
   * Attempt to inject the constitution into the editor.
   * Called synchronously in the capture phase of keydown / click,
   * so the modified content is in place before the platform's own handlers fire.
   */
  function tryInject(editor) {
    if (injected) return;
    if (!autoInject) return;

    if (!constitution) {
      showWarning();
      return; // don't block the message
    }

    if (!getEditorText(editor)) return; // nothing typed yet

    if (prependConstitution(editor)) {
      injected = true;
      showIndicator(editor);
    }
  }

  // --- Event listeners (capture phase — runs before platform handlers) ---

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;

      const editor = getEditor();
      if (!editor) return;

      // Only act when focus is inside the editor
      if (editor !== document.activeElement && !editor.contains(document.activeElement)) return;

      tryInject(editor);
    },
    true // capture phase
  );

  document.addEventListener(
    'click',
    (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      const editor = getEditor();
      if (!editor) return;

      if (isSendButton(button, editor)) {
        tryInject(editor);
      }
    },
    true // capture phase
  );
})();
