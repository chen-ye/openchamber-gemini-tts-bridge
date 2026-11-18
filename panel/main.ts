import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { EXTENDED_VOICES, FEATURED_VOICES, formatLanguageLabel, type VoiceItem } from '../shared/voices';

const PRESETS = [
  'Hello! This is a preview of the Gemini text to speech voice.',
  'Welcome to OpenChamber. Your workspace is ready.',
  'Remotely operated aircraft system cleared for takeoff on runway two eight right.',
  'Autonomous build completed with zero test failures.',
];

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root element');

// UI State
let activeView: 'featured' | 'library' = 'featured';
let currentText = PRESETS[0];
let currentSpeed = 1.0;

// Filters for Featured View
let featuredGender: 'all' | 'female' | 'male' = 'all';

// Filters for Extended Library View
const LIBRARY_PAGE_SIZE = 60;
let libraryLocale = 'all';
let libraryContext = 'all';
let libraryRole = 'all';
let libraryGender: 'all' | 'female' | 'male' | 'neutral' = 'all';
let libraryPitch: 'all' | 'low' | 'medium' | 'high' = 'all';
let libraryVisibleLimit = LIBRARY_PAGE_SIZE;
let searchQuery = '';

function getVoiceIdRole(id: string): string {
  const match = id.match(/^[a-z]{2,3}-(?:[a-z]{2}|\d{3})-([a-z]+)-\d+$/);
  return match?.[1] ?? 'named';
}

function matchesSearchQuery(v: VoiceItem, rawQuery: string): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const haystack = [
    v.id,
    v.name,
    v.style,
    v.language,
    v.languageCode,
    v.accent,
    v.persona,
    v.context ?? '',
    v.pitch,
    v.description,
  ]
    .join(' ')
    .toLowerCase();

  const clauses = trimmed
    .split(',')
    .map((c) => c.trim().replace(/^["']|["']$/g, '').replace(/^google:/i, '').toLowerCase())
    .filter(Boolean);

  if (clauses.length === 0) return true;

  return clauses.some((clause) => {
    const tokens = clause.split(/\s+/).filter(Boolean);
    return tokens.every((tok) => haystack.includes(tok));
  });
}

// Playback & Queue State
let isPlayingAll = false;
let playAllQueue: VoiceItem[] = [];
let playAllIndex = 0;
let announceVoiceName = true;
let playingVoice: string | null = null;
let loadingVoice: string | null = null;
let activeAudio: HTMLAudioElement | null = null;
let statusText = 'Ready. Audition voices or browse the extended library.';
const GAP_BETWEEN_VOICES_MS = 350;

function stopCurrentAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  playingVoice = null;
  loadingVoice = null;
}

function stopAllPlayback() {
  isPlayingAll = false;
  playAllQueue = [];
  playAllIndex = 0;
  stopCurrentAudio();
  statusText = 'Playback stopped.';
  render();
}

function getVisibleVoices(): VoiceItem[] {
  if (activeView === 'featured') {
    return FEATURED_VOICES.filter((v) => {
      if (featuredGender !== 'all' && v.gender !== featuredGender) return false;
      return matchesSearchQuery(v, searchQuery);
    });
  }

  // Library View
  return EXTENDED_VOICES.filter((v) => {
    if (libraryLocale !== 'all' && v.languageCode !== libraryLocale) return false;
    if (libraryContext !== 'all' && v.context !== libraryContext) return false;
    if (libraryRole !== 'all' && getVoiceIdRole(v.id) !== libraryRole) return false;
    if (libraryGender !== 'all' && v.gender !== libraryGender) return false;
    if (libraryPitch !== 'all' && v.pitch !== libraryPitch) return false;
    return matchesSearchQuery(v, searchQuery);
  });
}

async function startPlayAll() {
  const visible = getVisibleVoices();
  if (visible.length === 0) {
    statusText = 'No voices match the current filter.';
    render();
    return;
  }

  stopCurrentAudio();
  isPlayingAll = true;
  playAllQueue = visible;
  playAllIndex = 0;
  render();

  await playNextInQueue();
}

async function playNextInQueue() {
  if (!isPlayingAll) return;

  if (playAllIndex >= playAllQueue.length) {
    isPlayingAll = false;
    statusText = `Finished auditioning all ${playAllQueue.length} voices in sequence.`;
    render();
    return;
  }

  const voice = playAllQueue[playAllIndex];
  if (activeView === 'library' && playAllIndex >= libraryVisibleLimit) {
    libraryVisibleLimit = playAllIndex + LIBRARY_PAGE_SIZE;
  }
  loadingVoice = voice.id;
  statusText = `[${playAllIndex + 1}/${playAllQueue.length}] Synthesizing ${voice.name} (${voice.accent || voice.style})...`;
  render();

  const cardElem = document.getElementById(`voice-card-${voice.id}`);
  if (cardElem) cardElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const phraseText = currentText.trim() || PRESETS[0];
  const inputToSpeak = announceVoiceName ? `${voice.name}. ${phraseText}` : phraseText;

  try {
    const res = await host.serviceRequest({
      method: 'POST',
      path: '/preview',
      body: JSON.stringify({
        voice: voice.id,
        input: inputToSpeak,
        speed: currentSpeed,
      }),
    });

    if (!isPlayingAll) return;

    if (res.status >= 400) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(res.body);
        errMsg = parsed.error || errMsg;
      } catch {}
      statusText = `Skipped ${voice.name} (Error: ${errMsg})`;
      loadingVoice = null;
      render();

      playAllIndex++;
      setTimeout(() => {
        if (isPlayingAll) void playNextInQueue();
      }, 500);
      return;
    }

    const data = JSON.parse(res.body);
    if (!data.audioBase64) {
      playAllIndex++;
      setTimeout(() => {
        if (isPlayingAll) void playNextInQueue();
      }, 500);
      return;
    }

    const audioUrl = `data:${data.contentType || 'audio/wav'};base64,${data.audioBase64}`;
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    playingVoice = voice.id;
    loadingVoice = null;
    statusText = `[${playAllIndex + 1}/${playAllQueue.length}] Playing ${voice.name} (${voice.accent || voice.style}) · ${data.durationMs}ms`;
    render();

    audio.onended = () => {
      if (!isPlayingAll) return;
      playingVoice = null;
      activeAudio = null;
      playAllIndex++;
      render();

      setTimeout(() => {
        if (isPlayingAll) void playNextInQueue();
      }, GAP_BETWEEN_VOICES_MS);
    };

    audio.onerror = () => {
      playingVoice = null;
      activeAudio = null;
      playAllIndex++;
      render();

      setTimeout(() => {
        if (isPlayingAll) void playNextInQueue();
      }, GAP_BETWEEN_VOICES_MS);
    };

    await audio.play();
  } catch (err: any) {
    if (!isPlayingAll) return;
    statusText = `Error: ${err?.message || err}`;
    playingVoice = null;
    loadingVoice = null;
    playAllIndex++;
    render();

    setTimeout(() => {
      if (isPlayingAll) void playNextInQueue();
    }, 500);
  }
}

async function playSingleVoice(voiceItem: VoiceItem) {
  if (isPlayingAll) {
    isPlayingAll = false;
    playAllQueue = [];
    playAllIndex = 0;
  }

  if (playingVoice === voiceItem.id) {
    stopCurrentAudio();
    render();
    return;
  }

  stopCurrentAudio();
  loadingVoice = voiceItem.id;
  statusText = `Synthesizing ${voiceItem.name} via bridge...`;
  render();

  try {
    const res = await host.serviceRequest({
      method: 'POST',
      path: '/preview',
      body: JSON.stringify({
        voice: voiceItem.id,
        input: currentText.trim() || PRESETS[0],
        speed: currentSpeed,
      }),
    });

    if (res.status >= 400) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(res.body);
        errMsg = parsed.error || errMsg;
      } catch {}
      statusText = `Error previewing ${voiceItem.name}: ${errMsg}`;
      loadingVoice = null;
      render();
      return;
    }

    const data = JSON.parse(res.body);
    if (!data.audioBase64) {
      statusText = `Error: No audio returned for ${voiceItem.name}`;
      loadingVoice = null;
      render();
      return;
    }

    const audioUrl = `data:${data.contentType || 'audio/wav'};base64,${data.audioBase64}`;
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    playingVoice = voiceItem.id;
    loadingVoice = null;
    statusText = `Playing ${voiceItem.name} (${currentSpeed}x) · ${data.durationMs}ms roundtrip`;

    audio.onended = () => {
      if (playingVoice === voiceItem.id) {
        playingVoice = null;
        activeAudio = null;
        render();
      }
    };

    audio.onerror = () => {
      statusText = `Playback failed for ${voiceItem.name}`;
      playingVoice = null;
      activeAudio = null;
      render();
    };

    await audio.play();
    render();
  } catch (err: any) {
    statusText = `Failed to contact bridge: ${err?.message || err}`;
    stopCurrentAudio();
    render();
  }
}

async function copyVoiceId(voiceId: string) {
  try {
    await navigator.clipboard.writeText(voiceId);
    statusText = `Copied "${voiceId}" to clipboard! Paste it into OpenChamber Voice settings.`;
  } catch {
    statusText = `Selected Voice: ${voiceId}`;
  }
  render();
}

function render() {
  if (!root) return;
  root.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'panel-root';

  // 1. Top Navigation Tabs (Featured vs. Extended Library)
  const navTabs = document.createElement('div');
  navTabs.className = 'nav-tabs';

  const featuredTab = document.createElement('button');
  featuredTab.type = 'button';
  featuredTab.className = `nav-tab ${activeView === 'featured' ? 'active' : ''}`;
  featuredTab.innerHTML = `Featured Studio Voices <span class="nav-badge">30</span>`;
  featuredTab.onclick = () => {
    activeView = 'featured';
    render();
  };

  const libraryTab = document.createElement('button');
  libraryTab.type = 'button';
  libraryTab.className = `nav-tab ${activeView === 'library' ? 'active' : ''}`;
  libraryTab.innerHTML = `Extended Voice Library <span class="nav-badge">${EXTENDED_VOICES.length.toLocaleString()}</span>`;
  libraryTab.onclick = () => {
    activeView = 'library';
    libraryVisibleLimit = LIBRARY_PAGE_SIZE;
    render();
  };

  navTabs.append(featuredTab, libraryTab);
  container.append(navTabs);

  // If in Extended Library view: show official documentation reference banner
  if (activeView === 'library') {
    const docBanner = document.createElement('div');
    docBanner.className = 'doc-link-banner';
    docBanner.innerHTML = `
      <span>Browsing ${EXTENDED_VOICES.length.toLocaleString()} Gemini Extended Voice Library voices across ${new Set(EXTENDED_VOICES.map((v) => v.languageCode)).size} locales.</span>
      <a href="https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview#voice-library" target="_blank" rel="noopener">Official Documentation ↗</a>
    `;
    container.append(docBanner);
  }

  // 2. Phrase & Presets Card
  const promptCard = document.createElement('div');
  promptCard.className = 'card';

  const promptTitle = document.createElement('div');
  promptTitle.className = 'card-title';
  promptTitle.textContent = 'Preview Phrase';
  promptCard.append(promptTitle);

  const textarea = document.createElement('textarea');
  textarea.className = 'text-area';
  textarea.value = currentText;
  textarea.placeholder = 'Type text to audition any voice...';
  textarea.oninput = (e) => {
    currentText = (e.target as HTMLTextAreaElement).value;
  };
  promptCard.append(textarea);

  const presetsRow = document.createElement('div');
  presetsRow.className = 'presets';
  PRESETS.forEach((preset, idx) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip';
    chip.textContent = `Sample ${idx + 1}`;
    chip.title = preset;
    chip.onclick = () => {
      currentText = preset;
      textarea.value = preset;
    };
    presetsRow.append(chip);
  });
  promptCard.append(presetsRow);
  container.append(promptCard);

  // 3. Play All & Sequential Controls Bar
  const queueBar = document.createElement('div');
  queueBar.className = 'queue-bar';

  const playAllBtn = document.createElement('button');
  playAllBtn.type = 'button';
  playAllBtn.className = `play-all-btn ${isPlayingAll ? 'active-all' : ''}`;
  playAllBtn.innerHTML = isPlayingAll
    ? '■ Stop Sequential Audition'
    : `▶ Play All (${getVisibleVoices().length} voices in sequence)`;
  playAllBtn.onclick = () => {
    if (isPlayingAll) stopAllPlayback();
    else void startPlayAll();
  };
  queueBar.append(playAllBtn);

  const announceLabel = document.createElement('label');
  announceLabel.className = 'announce-toggle';
  const announceCheckbox = document.createElement('input');
  announceCheckbox.type = 'checkbox';
  announceCheckbox.checked = announceVoiceName;
  announceCheckbox.onchange = (e) => {
    announceVoiceName = (e.target as HTMLInputElement).checked;
  };
  const announceText = document.createElement('span');
  announceText.textContent = 'Announce voice name';
  announceLabel.append(announceCheckbox, announceText);
  queueBar.append(announceLabel);

  // Speed Selector inside the toolbar
  const speedGroup = document.createElement('div');
  speedGroup.className = 'speed-group';
  const speedLabel = document.createElement('span');
  speedLabel.textContent = 'Speed:';
  const speedSelect = document.createElement('select');
  speedSelect.className = 'speed-select';
  [0.75, 1.0, 1.25, 1.5, 2.0].forEach((rate) => {
    const option = document.createElement('option');
    option.value = String(rate);
    option.textContent = `${rate}x`;
    if (rate === currentSpeed) option.selected = true;
    speedSelect.append(option);
  });
  speedSelect.onchange = (e) => {
    currentSpeed = parseFloat((e.target as HTMLSelectElement).value);
  };
  speedGroup.append(speedLabel, speedSelect);
  queueBar.append(speedGroup);

  container.append(queueBar);

  // 4. Facet Filters Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar-row';

  if (activeView === 'featured') {
    // Gender tabs for 30 featured
    const tabs = document.createElement('div');
    tabs.className = 'filter-tabs';
    const filterOptions: Array<{ id: 'all' | 'female' | 'male'; label: string }> = [
      { id: 'all', label: `All (${FEATURED_VOICES.length})` },
      { id: 'female', label: `Female (${FEATURED_VOICES.filter((v) => v.gender === 'female').length})` },
      { id: 'male', label: `Male (${FEATURED_VOICES.filter((v) => v.gender === 'male').length})` },
    ];
    filterOptions.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-btn ${featuredGender === opt.id ? 'active' : ''}`;
      btn.textContent = opt.label;
      btn.onclick = () => {
        featuredGender = opt.id;
        render();
      };
      tabs.append(btn);
    });
    toolbar.append(tabs);
  } else {
    // Facet selectors for Extended Voice Library
    const facetBar = document.createElement('div');
    facetBar.className = 'facet-bar';

    // Locale Filter
    const locales = Array.from(new Set(EXTENDED_VOICES.map((v) => v.languageCode))).sort();
    const localeSelect = document.createElement('select');
    localeSelect.className = 'facet-select';
    const allLocOpt = document.createElement('option');
    allLocOpt.value = 'all';
    allLocOpt.textContent = `All Locales (${locales.length})`;
    localeSelect.append(allLocOpt);
    locales.forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${formatLanguageLabel(code)} (${code})`;
      if (code === libraryLocale) opt.selected = true;
      localeSelect.append(opt);
    });
    localeSelect.onchange = (e) => {
      libraryLocale = (e.target as HTMLSelectElement).value;
      libraryVisibleLimit = LIBRARY_PAGE_SIZE;
      render();
    };
    facetBar.append(localeSelect);

    // Context / Domain Filter
    const contexts = Array.from(new Set(EXTENDED_VOICES.map((v) => v.context).filter((c): c is string => Boolean(c)))).sort();
    const contextSelect = document.createElement('select');
    contextSelect.className = 'facet-select';
    const allCtxOpt = document.createElement('option');
    allCtxOpt.value = 'all';
    allCtxOpt.textContent = 'All Contexts';
    contextSelect.append(allCtxOpt);
    contexts.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === libraryContext) opt.selected = true;
      contextSelect.append(opt);
    });
    contextSelect.onchange = (e) => {
      libraryContext = (e.target as HTMLSelectElement).value;
      libraryVisibleLimit = LIBRARY_PAGE_SIZE;
      render();
    };
    facetBar.append(contextSelect);

    // Raw ID Role Filter
    const roles = Array.from(new Set(EXTENDED_VOICES.map((v) => getVoiceIdRole(v.id)))).sort((a, b) => {
      if (a === 'named') return -1;
      if (b === 'named') return 1;
      return a.localeCompare(b);
    });
    const roleSelect = document.createElement('select');
    roleSelect.className = 'facet-select';
    const allRoleOpt = document.createElement('option');
    allRoleOpt.value = 'all';
    allRoleOpt.textContent = 'All ID Roles';
    roleSelect.append(allRoleOpt);
    roles.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r === 'named' ? 'Named IDs (en-us-<name>)' : `ID role: ${r}`;
      if (r === libraryRole) opt.selected = true;
      roleSelect.append(opt);
    });
    roleSelect.onchange = (e) => {
      libraryRole = (e.target as HTMLSelectElement).value;
      libraryVisibleLimit = LIBRARY_PAGE_SIZE;
      render();
    };
    facetBar.append(roleSelect);

    // Gender Filter
    const genderSelect = document.createElement('select');
    genderSelect.className = 'facet-select';
    [
      { id: 'all', label: 'All Genders' },
      { id: 'female', label: 'Female' },
      { id: 'male', label: 'Male' },
      { id: 'neutral', label: 'Neutral' },
    ].forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.label;
      if (g.id === libraryGender) opt.selected = true;
      genderSelect.append(opt);
    });
    genderSelect.onchange = (e) => {
      libraryGender = (e.target as HTMLSelectElement).value as any;
      libraryVisibleLimit = LIBRARY_PAGE_SIZE;
      render();
    };
    facetBar.append(genderSelect);

    // Pitch Filter
    const pitchSelect = document.createElement('select');
    pitchSelect.className = 'facet-select';
    [
      { id: 'all', label: 'All Pitches' },
      { id: 'low', label: 'Low pitch' },
      { id: 'medium', label: 'Medium pitch' },
      { id: 'high', label: 'High pitch' },
    ].forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      if (p.id === libraryPitch) opt.selected = true;
      pitchSelect.append(opt);
    });
    pitchSelect.onchange = (e) => {
      libraryPitch = (e.target as HTMLSelectElement).value as any;
      libraryVisibleLimit = LIBRARY_PAGE_SIZE;
      render();
    };
    facetBar.append(pitchSelect);

    toolbar.append(facetBar);
  }

  // Search box (live keyword & raw ID filtering)
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'search-box';
  search.value = searchQuery;
  search.placeholder = activeView === 'featured'
    ? 'Filter by name, raw ID, or style (comma-separate IDs)...'
    : 'Filter by raw ID (e.g. en-ca-podcaster-7), accent, persona, or comma-separated IDs...';
  search.oninput = (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    libraryVisibleLimit = LIBRARY_PAGE_SIZE;
    renderGridOnly();
    playAllBtn.innerHTML = isPlayingAll
      ? '■ Stop Sequential Audition'
      : `▶ Play All (${getVisibleVoices().length} voices in sequence)`;
  };
  toolbar.append(search);

  container.append(toolbar);

  // Status message bar
  const statusRow = document.createElement('div');
  statusRow.className = 'status-bar';
  const statusMsg = document.createElement('span');
  statusMsg.textContent = statusText;
  const countMsg = document.createElement('span');
  countMsg.id = 'voice-count-summary';
  statusRow.append(statusMsg, countMsg);
  container.append(statusRow);

  // 5. Grid Container
  const grid = document.createElement('div');
  grid.className = activeView === 'featured' ? 'voice-grid' : 'ext-grid';
  grid.id = 'voice-grid-container';

  const loadMoreRow = document.createElement('div');
  loadMoreRow.className = 'load-more-row';
  loadMoreRow.id = 'voice-load-more-row';

  function populateGrid(targetGrid: HTMLElement, targetLoadMore: HTMLElement | null, targetCount: HTMLElement | null) {
    targetGrid.innerHTML = '';
    if (targetLoadMore) targetLoadMore.innerHTML = '';

    const visible = getVisibleVoices();
    const displayed = activeView === 'library' ? visible.slice(0, libraryVisibleLimit) : visible;

    if (targetCount) {
      targetCount.textContent =
        activeView === 'library' && visible.length > displayed.length
          ? `Showing ${displayed.length} of ${visible.length.toLocaleString()} voices`
          : `${visible.length.toLocaleString()} ${visible.length === 1 ? 'voice' : 'voices'}`;
    }

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.style.gridColumn = '1 / -1';
      empty.style.padding = '28px 20px';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--oc-muted, GrayText)';
      empty.style.display = 'flex';
      empty.style.flexDirection = 'column';
      empty.style.alignItems = 'center';
      empty.style.gap = '10px';

      const msg = document.createElement('div');
      msg.textContent = 'No matching voices found for the selected filters.';
      empty.append(msg);

      if (activeView === 'featured' && searchQuery.trim()) {
        const extMatches = EXTENDED_VOICES.filter((v) => matchesSearchQuery(v, searchQuery)).length;
        if (extMatches > 0) {
          const jumpBtn = document.createElement('button');
          jumpBtn.type = 'button';
          jumpBtn.className = 'load-more-btn';
          jumpBtn.textContent = `Search Extended Voice Library (${extMatches.toLocaleString()} ${extMatches === 1 ? 'match' : 'matches'})`;
          jumpBtn.onclick = () => {
            activeView = 'library';
            libraryVisibleLimit = LIBRARY_PAGE_SIZE;
            render();
          };
          empty.append(jumpBtn);
        }
      } else if (activeView === 'library' && searchQuery.trim()) {
        const featMatches = FEATURED_VOICES.filter((v) => matchesSearchQuery(v, searchQuery)).length;
        if (featMatches > 0) {
          const jumpBtn = document.createElement('button');
          jumpBtn.type = 'button';
          jumpBtn.className = 'load-more-btn';
          jumpBtn.textContent = `Show in Featured Studio Voices (${featMatches} ${featMatches === 1 ? 'match' : 'matches'})`;
          jumpBtn.onclick = () => {
            activeView = 'featured';
            render();
          };
          empty.append(jumpBtn);
        }
      }

      targetGrid.append(empty);
      return;
    }

    if (activeView === 'featured') {
      // Featured 30 Card layout
      displayed.forEach((v) => {
        const card = document.createElement('div');
        const isPlaying = playingVoice === v.id;
        const isLoading = loadingVoice === v.id;
        card.id = `voice-card-${v.id}`;
        card.className = `voice-card ${isPlaying ? 'active-playing' : ''}`;

        const info = document.createElement('div');
        info.className = 'voice-info';

        const nameRow = document.createElement('div');
        nameRow.className = 'voice-name-row';

        const name = document.createElement('span');
        name.className = 'voice-name';
        name.textContent = v.name;

        const badge = document.createElement('span');
        badge.className = `badge badge-${v.gender}`;
        badge.textContent = v.gender === 'female' ? 'F' : v.gender === 'male' ? 'M' : 'N';

        nameRow.append(name, badge);

        const style = document.createElement('span');
        style.className = 'voice-style';
        style.textContent = v.style;

        info.append(nameRow, style);

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = `play-btn ${isPlaying ? 'playing' : ''}`;
        playBtn.disabled = isLoading;
        playBtn.textContent = isLoading ? 'Loading…' : isPlaying ? 'Stop' : 'Play';
        playBtn.onclick = () => void playSingleVoice(v);

        card.append(info, playBtn);
        targetGrid.append(card);
      });
    } else {
      // Extended Voice Library Rich Card layout
      displayed.forEach((v) => {
        const card = document.createElement('div');
        const isPlaying = playingVoice === v.id;
        const isLoading = loadingVoice === v.id;
        card.id = `voice-card-${v.id}`;
        card.className = `ext-card ${isPlaying ? 'active-playing' : ''}`;

        const header = document.createElement('div');
        header.className = 'ext-header';

        const titleCol = document.createElement('div');
        titleCol.className = 'ext-title-col';

        const nameRow = document.createElement('div');
        nameRow.className = 'voice-name-row';

        const name = document.createElement('span');
        name.className = 'ext-name';
        name.textContent = v.name;

        const badge = document.createElement('span');
        badge.className = `badge badge-${v.gender}`;
        badge.textContent = v.gender;

        nameRow.append(name, badge);

        const idSpan = document.createElement('span');
        idSpan.className = 'ext-id';
        idSpan.textContent = `ID: ${v.id}`;

        titleCol.append(nameRow, idSpan);
        header.append(titleCol);

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = `play-btn ${isPlaying ? 'playing' : ''}`;
        playBtn.disabled = isLoading;
        playBtn.textContent = isLoading ? 'Loading…' : isPlaying ? 'Stop' : 'Play';
        playBtn.onclick = () => void playSingleVoice(v);
        header.append(playBtn);

        card.append(header);

        // Tags row
        const tags = document.createElement('div');
        tags.className = 'ext-tags';

        const langTag = document.createElement('span');
        langTag.className = 'tag-pill';
        langTag.textContent = `${v.language} (${v.languageCode})`;
        tags.append(langTag);

        if (v.accent) {
          const accentTag = document.createElement('span');
          accentTag.className = 'tag-pill tag-accent';
          accentTag.textContent = v.accent;
          tags.append(accentTag);
        }

        if (v.persona) {
          const personaTag = document.createElement('span');
          personaTag.className = 'tag-pill tag-persona';
          personaTag.textContent = v.persona;
          tags.append(personaTag);
        }

        const pitchTag = document.createElement('span');
        pitchTag.className = 'tag-pill';
        pitchTag.textContent = `${v.pitch} pitch`;
        tags.append(pitchTag);

        card.append(tags);

        // Description
        const desc = document.createElement('p');
        desc.className = 'ext-desc';
        desc.textContent = v.description;
        card.append(desc);

        // Footer with Copy ID action
        const footer = document.createElement('div');
        footer.className = 'ext-footer';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = `Copy ID (${v.id})`;
        copyBtn.onclick = () => void copyVoiceId(v.id);

        footer.append(copyBtn);
        card.append(footer);

        targetGrid.append(card);
      });

      if (targetLoadMore && visible.length > displayed.length) {
        const remaining = visible.length - displayed.length;
        const nextBatch = Math.min(LIBRARY_PAGE_SIZE, remaining);
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'load-more-btn';
        moreBtn.textContent = `Show ${nextBatch} more (${remaining.toLocaleString()} remaining)`;
        moreBtn.onclick = () => {
          libraryVisibleLimit += LIBRARY_PAGE_SIZE;
          renderGridOnly();
        };
        targetLoadMore.append(moreBtn);
      }
    }
  }

  populateGrid(grid, loadMoreRow, countMsg);
  container.append(grid, loadMoreRow);

  root.append(container);

  function renderGridOnly() {
    const existingGrid = document.querySelector<HTMLElement>('#voice-grid-container');
    const existingLoadMore = document.querySelector<HTMLElement>('#voice-load-more-row');
    const existingCount = document.querySelector<HTMLElement>('#voice-count-summary');
    if (existingGrid) populateGrid(existingGrid, existingLoadMore, existingCount);
  }
}

// OpenChamber Extension Host Connection
let hasRendered = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (!hasRendered) {
    hasRendered = true;
    render();
  }
});
