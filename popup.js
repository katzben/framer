(function() {

  // State
  const state = {
    length: 'balanced',
    sycophancy: 'balanced',
    scaffolding: 'guide-me',
    questionDensity: 'focused',
    pushback: 'reasoning',
    steelmanning: false,
    certainty: false,
    autoInject: true,
    activePreset: null,
    dismissedWarnings: new Set()
  };

  // Preset definitions
  const presets = {
    'thinking': {
      length: 'concise', sycophancy: 'challenge', scaffolding: 'socratic',
      questionDensity: 'single', pushback: 'reasoning', steelmanning: false, certainty: true
    },
    'efficient': {
      length: 'detailed', sycophancy: 'validate', scaffolding: 'just-answer',
      questionDensity: 'focused', pushback: 'factual', steelmanning: false, certainty: false
    },
    'critical': {
      length: 'balanced', sycophancy: 'challenge', scaffolding: 'guide-me',
      questionDensity: 'focused', pushback: 'challenge-even-agreeing', steelmanning: true, certainty: true
    },
    'custom': {
      length: 'balanced', sycophancy: 'balanced', scaffolding: 'guide-me',
      questionDensity: 'focused', pushback: 'reasoning', steelmanning: false, certainty: false
    }
  };

  const SAVED_KEYS = ['length', 'sycophancy', 'scaffolding', 'questionDensity', 'pushback', 'steelmanning', 'certainty', 'autoInject', 'activePreset'];

  // Platform detection from active tab
  const PLATFORM_DOMAINS = {
    'claude.ai': 'claude',
    'chat.openai.com': 'chatgpt',
    'chatgpt.com': 'chatgpt',
    'gemini.google.com': 'gemini'
  };

  const PLATFORM_NAMES = {
    'claude': 'Claude',
    'chatgpt': 'ChatGPT',
    'gemini': 'Gemini'
  };

  let currentPlatform = null; // 'claude', 'chatgpt', 'gemini', or null
  let onSupportedSite = false; // true only when the active tab is a supported platform
  let hasConstitution = false; // whether storage has a constitution for the current platform

  function settingsKeyForPlatform(platform) {
    return platform + '_settings';
  }

  function constitutionKeyForPlatform(platform) {
    return platform + '_constitution';
  }

  // DOM refs
  const els = {
    pushback: document.getElementById('pushback'),
    steelmanning: document.getElementById('steelmanning'),
    certainty: document.getElementById('certainty'),
    autoInject: document.getElementById('auto-inject'),
    output: document.getElementById('output'),
    warnings: document.getElementById('warnings'),
    generate: document.getElementById('generate'),
    copy: document.getElementById('copy'),
    socraticHint: document.getElementById('socratic-hint'),
    goalNote: document.getElementById('goal-anchoring-note'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    clearBtn: document.getElementById('clear-btn'),
    platformLabel: document.getElementById('platform-label')
  };

  function isGoalProfile() {
    return state.activePreset !== 'efficient';
  }

  // --- Persistence (per-platform) ---

  function saveState() {
    const data = {};
    SAVED_KEYS.forEach(k => { data[k] = state[k]; });

    const platform = currentPlatform || 'claude';
    const storageObj = {};
    storageObj[settingsKeyForPlatform(platform)] = data;
    storageObj.lastPlatform = platform;
    chrome.storage.sync.set(storageObj);
  }

  function generateAndSave() {
    const text = buildConstitution();
    els.output.textContent = text;
    els.output.classList.add('visible');

    const platform = currentPlatform || 'claude';
    const storageObj = {};
    storageObj[constitutionKeyForPlatform(platform)] = text;
    chrome.storage.sync.set(storageObj);
    hasConstitution = true;
    updateStatus();
  }

  function loadState() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        // Detect platform from active tab
        if (tabs[0] && tabs[0].url) {
          for (const [domain, plat] of Object.entries(PLATFORM_DOMAINS)) {
            if (tabs[0].url.includes(domain)) {
              currentPlatform = plat;
              onSupportedSite = true;
              break;
            }
          }
        }

        // Determine which settings key to load
        const keysToLoad = ['lastPlatform'];
        ['claude', 'chatgpt', 'gemini'].forEach(p => {
          keysToLoad.push(settingsKeyForPlatform(p));
          keysToLoad.push(constitutionKeyForPlatform(p));
        });

        chrome.storage.sync.get(keysToLoad, result => {
          // If not on a supported platform, use last used platform or default to claude
          if (!currentPlatform) {
            currentPlatform = result.lastPlatform || 'claude';
          }

          const saved = result[settingsKeyForPlatform(currentPlatform)];
          if (saved) {
            SAVED_KEYS.forEach(k => {
              if (saved[k] !== undefined) state[k] = saved[k];
            });
          }

          // Check if a constitution exists for this platform
          hasConstitution = !!result[constitutionKeyForPlatform(currentPlatform)];

          resolve();
        });
      });
    });
  }

  // --- Status bar ---

  function updateStatus() {
    const name = PLATFORM_NAMES[currentPlatform] || 'Unknown';

    if (onSupportedSite) {
      els.clearBtn.style.display = '';
      els.platformLabel.style.display = '';
      els.platformLabel.textContent = `Settings for: ${name}`;

      if (hasConstitution) {
        els.statusDot.className = 'status-dot active';
        els.statusText.textContent = `${name} detected \u2014 constitution ready`;
      } else {
        els.statusDot.className = 'status-dot amber';
        els.statusText.textContent = `${name} detected \u2014 no constitution set`;
      }
    } else {
      els.statusDot.className = 'status-dot';
      els.statusText.textContent = 'No active AI platform';
      els.clearBtn.style.display = 'none';
      els.platformLabel.style.display = '';
      els.platformLabel.textContent = `Settings for: ${name}`;
    }
  }

  // --- Clear constitution ---

  els.clearBtn.addEventListener('click', () => {
    const platform = currentPlatform || 'claude';
    const constKey = constitutionKeyForPlatform(platform);

    // Remove constitution from storage
    chrome.storage.sync.remove(constKey);
    hasConstitution = false;

    // Clear displayed output
    els.output.textContent = '';
    els.output.classList.remove('visible');

    // Reset injection in content script
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'framer-reset-injection' }, () => {
        if (chrome.runtime.lastError) { /* no-op */ }
      });
    });

    // Update status to reflect no constitution
    updateStatus();
  });

  // --- UI wiring ---

  // Slider stops
  document.querySelectorAll('.slider-stops').forEach(group => {
    const param = group.dataset.param;
    group.querySelectorAll('.slider-stop').forEach(btn => {
      btn.addEventListener('click', () => {
        state[param] = btn.dataset.val;
        group.querySelectorAll('.slider-stop').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${param}-value`).textContent = btn.textContent.toLowerCase();
        clearPresetIfChanged();
        updateHints();
        checkWarnings();
        saveState();
      });
    });
  });

  // Dropdown
  els.pushback.addEventListener('change', () => {
    state.pushback = els.pushback.value;
    clearPresetIfChanged();
    checkWarnings();
    saveState();
  });

  // Toggles
  els.steelmanning.addEventListener('change', () => {
    state.steelmanning = els.steelmanning.checked;
    clearPresetIfChanged();
    checkWarnings();
    saveState();
  });

  els.certainty.addEventListener('change', () => {
    state.certainty = els.certainty.checked;
    clearPresetIfChanged();
    checkWarnings();
    saveState();
  });

  els.autoInject.addEventListener('change', () => {
    state.autoInject = els.autoInject.checked;
    saveState();
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      saveState();
    });
  });

  function applyPreset(key) {
    const p = presets[key];
    state.length = p.length;
    state.sycophancy = p.sycophancy;
    state.scaffolding = p.scaffolding;
    state.questionDensity = p.questionDensity;
    state.pushback = p.pushback;
    state.steelmanning = p.steelmanning;
    state.certainty = p.certainty;
    state.activePreset = key;
    state.dismissedWarnings.clear();
    syncUI();
    updateHints();
    checkWarnings();
  }

  function syncUI() {
    // Sliders
    ['length', 'sycophancy', 'scaffolding', 'questionDensity'].forEach(param => {
      const group = document.querySelector(`.slider-stops[data-param="${param}"]`);
      group.querySelectorAll('.slider-stop').forEach(btn => {
        const isActive = btn.dataset.val === state[param];
        btn.classList.toggle('active', isActive);
        if (isActive) {
          document.getElementById(`${param}-value`).textContent = btn.textContent.toLowerCase();
        }
      });
    });

    // Dropdown
    els.pushback.value = state.pushback;

    // Toggles
    els.steelmanning.checked = state.steelmanning;
    els.certainty.checked = state.certainty;
    els.autoInject.checked = state.autoInject;

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === state.activePreset);
    });
  }

  function updateHints() {
    els.socraticHint.style.display = state.scaffolding === 'socratic' ? 'block' : 'none';
    els.goalNote.style.display = isGoalProfile() ? 'block' : 'none';
  }

  function clearPresetIfChanged() {
    if (!state.activePreset) return;
    const p = presets[state.activePreset];
    const match = ['length','sycophancy','scaffolding','questionDensity','pushback','steelmanning','certainty']
      .every(k => state[k] === p[k]);
    if (!match) {
      state.activePreset = null;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }
  }

  // Warnings
  function checkWarnings() {
    const rules = [];

    if (state.scaffolding === 'socratic' && state.length === 'detailed') {
      rules.push({ id: 'socratic-detailed', text: 'Socratic scaffolding works best with concise responses \u2014 detailed output may undermine the guided-discovery approach.' });
    }
    if (state.pushback === 'challenge-even-agreeing' && state.sycophancy === 'validate') {
      rules.push({ id: 'challenge-validate', text: '\u201CChallenge even when agreeing\u201D conflicts with a validating stance \u2014 the model will receive contradictory instructions.' });
    }
    if (state.scaffolding === 'socratic' && !state.certainty) {
      rules.push({ id: 'socratic-no-certainty', text: 'Socratic mode pairs well with certainty calibration \u2014 without it, guiding questions may lack epistemic transparency.' });
    }

    const active = rules.filter(r => !state.dismissedWarnings.has(r.id));

    els.warnings.textContent = '';
    active.forEach(r => {
      const warning = document.createElement('div');
      warning.className = 'warning';
      warning.dataset.id = r.id;

      const icon = document.createElement('span');
      icon.className = 'warning-icon';
      icon.textContent = '\u26A0';

      const text = document.createElement('span');
      text.className = 'warning-text';
      text.textContent = r.text;

      const dismiss = document.createElement('button');
      dismiss.className = 'warning-dismiss';
      dismiss.dataset.dismiss = r.id;
      dismiss.textContent = '\u00D7';
      dismiss.addEventListener('click', () => {
        state.dismissedWarnings.add(r.id);
        checkWarnings();
      });

      warning.appendChild(icon);
      warning.appendChild(text);
      warning.appendChild(dismiss);
      els.warnings.appendChild(warning);
    });
  }

  // Generate
  els.generate.addEventListener('click', () => {
    state.dismissedWarnings.clear();
    checkWarnings();
    generateAndSave();
  });

  // Copy
  els.copy.addEventListener('click', () => {
    const text = els.output.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      els.copy.textContent = 'Copied';
      els.copy.classList.add('copied');
      setTimeout(() => {
        els.copy.textContent = 'Copy';
        els.copy.classList.remove('copied');
      }, 1500);
    });
  });

  // Constitution builder
  function buildConstitution() {
    const parts = [];
    const goalProfile = isGoalProfile();

    if (state.scaffolding === 'just-answer') {
      parts.push('Give me direct, complete answers. Do not walk me through your reasoning step by step or ask me leading questions \u2014 I want the solution, not the journey. If I ask a question, answer it.');
    } else if (state.scaffolding === 'guide-me') {
      parts.push('Balance between giving me answers and helping me think through problems. When a concept is straightforward, explain it directly. When I would benefit from working through the reasoning, guide me with targeted hints or partial explanations before revealing the full answer.');
    } else {
      parts.push('Help me arrive at answers myself through productive confusion. Do not simply rephrase my question back at me or ask leading questions with obvious answers \u2014 instead, surface tensions in my thinking, offer counterexamples that complicate my assumptions, and create the conditions for genuine insight. Resist giving me the answer outright. Only provide direct answers if I explicitly ask you to stop and just tell me.');
    }

    if (state.length === 'concise') {
      parts.push('Keep responses concise. Say what needs to be said and stop. Avoid preamble, filler, and unnecessary elaboration.');
    } else if (state.length === 'detailed') {
      parts.push('Provide thorough, detailed responses. Explain context, cover edge cases, and include relevant background. It is better to be comprehensive than to risk leaving out something useful.');
    } else {
      parts.push('Aim for a balanced response length \u2014 enough detail to be clear and useful, but not so much that the signal gets buried.');
    }

    if (state.length === 'concise' && state.scaffolding === 'socratic' && state.sycophancy === 'challenge') {
      parts.push('When conciseness and depth conflict, prioritize the single most important question over elaboration.');
    }

    if (state.questionDensity === 'single') {
      parts.push('Limit yourself to one probing question per response. Make it count.');
    } else if (state.questionDensity === 'multiple') {
      parts.push('Feel free to ask multiple probing questions per response when different angles of inquiry would be productive.');
    } else {
      parts.push('Ask one or two focused questions per response when they would advance the conversation \u2014 no more.');
    }

    parts.push('');
    if (state.sycophancy === 'validate') {
      parts.push('Be supportive and affirming in your responses. When I share an idea or approach, start from the assumption that it has merit and help me develop it further.');
    } else if (state.sycophancy === 'challenge') {
      parts.push('Do not simply agree with me. If you see a flaw in my reasoning, a questionable assumption, or a better alternative, say so directly. I value honest feedback over comfortable agreement.');
    } else {
      parts.push('Be honest in your assessments. Agree when I am right, but do not hesitate to point out issues when you see them.');
    }

    if (state.pushback === 'factual') {
      parts.push('Correct me when I state something factually wrong, but do not nitpick my reasoning approach or challenge my assumptions unless they lead to clear errors.');
    } else if (state.pushback === 'reasoning') {
      parts.push('Push back not just on factual errors but also on weak reasoning, hidden assumptions, and logical gaps. If my argument has a structural problem, flag it even if the conclusion might be right.');
    } else {
      parts.push('Challenge my thinking even when you agree with my conclusion. Explore the strongest counterarguments and alternative perspectives. Stress-test my reasoning by arguing the other side, so that agreement is earned rather than assumed.');
    }

    if (state.steelmanning) {
      parts.push('When you disagree with a position or are about to critique an idea, first present the strongest possible version of that view. Steelman it before you dismantle it, so I can see you have genuinely engaged with the alternative.');
    }

    if (state.certainty) {
      parts.push('');
      parts.push('Be transparent about your confidence level. When you are uncertain, say so. When you are speculating or reasoning from incomplete information, distinguish that clearly from things you know well. Do not present guesses with the same authority as established facts.');
    }

    parts.push('');
    if (!goalProfile) {
      parts.push('Do not ask clarifying questions or add preamble \u2014 get straight to work with whatever I give you.');
    } else {
      parts.push('Begin by asking me what I am trying to figure out or accomplish in this conversation. Use my answer as the goal for our session. If the conversation drifts from that goal, flag it briefly \u2014 a short note like \u201Cthis seems tangential to what we set out to do\u201D is enough \u2014 then let me decide whether to continue the tangent or refocus.');
    }

    return parts.join('\n');
  }

  // --- Init ---
  loadState().then(() => {
    syncUI();
    updateHints();
    checkWarnings();
    updateStatus();

    // Auto-generate on first load if no constitution exists for this platform
    if (!hasConstitution) {
      generateAndSave();
    }
  });

})();
