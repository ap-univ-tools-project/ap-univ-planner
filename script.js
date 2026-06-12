// --- 1. ロジックの分離：設定コード ---
const SYSTEM_CONFIG = {
    CAT_LABELS: {
        core: '共通', adv: '専攻', rel: '関連', 
        'other-adv': '他専攻', 'other-rel': '他関連', 
        prac: '演習', res: '研究', manual: '手動'
    },
    REQ_LIMITS: {
        TOTAL_ADV_REQ: 16,
        CORE_MIN: 4,
        MAJOR_MIN: 8,
        REL_MIN: 4,
        PRAC_MIN: 6,
        RES_MIN: 8,
        OTHER_ADV_LIMIT: 4,
        OTHER_REL_LIMIT: 2
    }
};

let appState = { activeTab: 'm1z', m1z: {}, m1k: {}, m2z: {}, m2k: {} };
let activeId = null;
let pendingCourse = null;
let editingIndex = -1;

const termLabels = {m1z:"M1前期", m1k:"M1後期", m2z:"M2前期", m2k:"M2後期"};
const majorLabels = {"1":"情報システム専攻", "2":"メディア情報専攻", "3":"システム科学専攻"};


function isCourseSelected() {
    return Boolean(document.getElementById('my-course-select')?.value);
}

function ensureCourseSelected(actionName = "この操作") {
    if (isCourseSelected()) return true;
    alert(`${actionName}を行うには、先に「所属コース設定」で専攻を選択してください。\n\n※ データの読込・保存・カタログ閲覧は未設定のまま利用できます。`);
    document.getElementById('my-course-select')?.focus();
    return false;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isCourseRegistered(courseName) {
    return ['m1z','m1k','m2z','m2k'].some(t =>
        Object.values(appState[t] || {}).some(arr =>
            Array.isArray(arr) && arr.some(v => v.name === courseName)
        )
    );
}


function getSelectedMajorId() {
    return document.getElementById('my-course-select')?.value || "";
}

function getBaseCategory(catKey, fallbackType = 'manual') {
    if (catKey === 'other-adv') return 'adv';
    if (catKey === 'other-rel') return 'rel';
    if (catKey && catKey !== 'manual') return catKey;
    if (fallbackType === 'other-adv') return 'adv';
    if (fallbackType === 'other-rel') return 'rel';
    return fallbackType || 'manual';
}

function isExternalCategory(catKey) {
    return catKey === 'other-adv' || catKey === 'other-rel';
}

function getCourseResolvedCategory(courseName, fallbackType = 'manual', myMajorId = getSelectedMajorId()) {
    const dynamicCat = getDynamicCategory(courseName, myMajorId);
    if (dynamicCat && dynamicCat !== 'manual') return dynamicCat;
    return fallbackType || 'manual';
}

function buildSuggestion(course, fallbackType = course?.type || 'manual') {
    const catKey = getCourseResolvedCategory(course.name, fallbackType);
    const type = getBaseCategory(catKey, fallbackType);
    return {
        ...course,
        type,
        catKey,
        isInternal: !isExternalCategory(catKey)
    };
}

function shouldReplaceSuggestion(existing, candidate) {
    if (!existing) return true;
    // 同名科目が複数専攻に存在する場合は、必ず自専攻扱いを優先する。
    if (isExternalCategory(existing.catKey) && !isExternalCategory(candidate.catKey)) return true;
    if (existing.catKey === 'manual' && candidate.catKey !== 'manual') return true;
    return false;
}

function addResolvedSuggestion(list, course, fallbackType = course?.type || 'manual') {
    const candidate = buildSuggestion(course, fallbackType);
    const idx = list.findIndex(s => s.name === candidate.name);
    if (idx === -1) {
        list.push(candidate);
    } else if (shouldReplaceSuggestion(list[idx], candidate)) {
        list[idx] = { ...list[idx], ...candidate };
    }
}

function getLectureTileHtml(v, myMajorId) {
    const dynamicCat = getDynamicCategory(v.name, myMajorId);
    const tagClass = dynamicCat === 'other-adv' ? 'tag-other-adv' :
                     dynamicCat === 'other-rel' ? 'tag-other-rel' : `tag-${dynamicCat}`;
    const label = SYSTEM_CONFIG.CAT_LABELS[dynamicCat] || dynamicCat;
    const unit = Number.isFinite(Number(v.unit)) ? `${Number(v.unit)}単位` : '';
    return `<div class="lecture-tile tile-${escapeHtml(dynamicCat)}" title="${escapeHtml(v.name)}">
        <div class="lecture-name">${escapeHtml(v.name)}</div>
        <div class="lecture-meta">
            <span class="cat-tag ${escapeHtml(tagClass)}">${escapeHtml(label)}</span>
            ${unit ? `<span class="unit-chip">${escapeHtml(unit)}</span>` : ''}
        </div>
    </div>`;
}

const HIGHLIGHT_PATTERNS = {
    core: { key: 'core', background: 'var(--major-core)' },
    myAdv: { key: 'my-adv', background: 'var(--major-adv)' },
    extAdv: { key: 'ext-adv', background: 'repeating-linear-gradient(45deg, var(--major-adv), var(--major-adv) 5px, #fcf3cf 5px, #fcf3cf 10px)' },
    myRel: { key: 'my-rel', background: 'var(--related)' },
    extRel: { key: 'ext-rel', background: 'repeating-linear-gradient(45deg, var(--related), var(--related) 5px, #ebdef0 5px, #ebdef0 10px)' },
    research: { key: 'research', background: 'var(--research-bg)' }
};

function cloneHighlightPart(part) {
    return { key: part.key, background: part.background };
}

function getHighlightTargetMatcher(slotId) {
    const normalMatch = String(slotId).match(/^c-(\d)-(\d)$/);
    if (normalMatch) {
        const targetDay = parseInt(normalMatch[1], 10);
        const targetPeriod = parseInt(normalMatch[2], 10);
        return (course, currentTerm) => course.day === targetDay && course.period === targetPeriod && course.sem === currentTerm;
    }

    if (slotId === 'c-intensive') {
        return (course, currentTerm) => Boolean(course.isIntensive) && course.sem === currentTerm;
    }

    if (slotId === 'c-other') {
        return (course, currentTerm) => Boolean(course.isOther) && course.sem === currentTerm;
    }

    return null;
}

function collectSlotHighlightParts(slotId, currentTerm, highlightMode, myMajorId) {
    if (highlightMode === 'off') return [];

    // 特別研究は曜日時限を持たない専用科目として扱う。
    // 描画は通常枠と同じ applySlotHighlight() に通す。
    if (slotId === 'c-research') {
        return [cloneHighlightPart(HIGHLIGHT_PATTERNS.research)];
    }

    const matchesTarget = getHighlightTargetMatcher(slotId);
    if (!matchesTarget) return [];

    const categories = new Set();
    const addCategory = (course, fallbackType) => {
        const catKey = getCourseResolvedCategory(course.name, fallbackType, myMajorId);
        if (highlightMode === 'my-major' && isExternalCategory(catKey)) return;
        if (catKey && catKey !== 'manual') categories.add(catKey);
    };

    if (typeof coreCourses !== 'undefined') {
        coreCourses.forEach(c => {
            if (matchesTarget(c, currentTerm)) addCategory(c, 'core');
        });
    }

    if (typeof majorMasters !== 'undefined') {
        Object.keys(majorMasters).forEach(majorId => {
            ['adv', 'rel'].forEach(type => {
                (majorMasters[majorId][type] || []).forEach(c => {
                    if (matchesTarget(c, currentTerm)) {
                        const fallbackType = majorId === myMajorId ? type : `other-${type}`;
                        addCategory(c, fallbackType);
                    }
                });
            });
        });
    }

    const parts = [];
    if (categories.has('core')) parts.push(cloneHighlightPart(HIGHLIGHT_PATTERNS.core));
    if (categories.has('adv')) parts.push(cloneHighlightPart(HIGHLIGHT_PATTERNS.myAdv));
    if (categories.has('other-adv')) parts.push(cloneHighlightPart(HIGHLIGHT_PATTERNS.extAdv));

    // v12: 関連科目も専門科目と同じく、自専攻(単色)と他専攻(ストライプ)を共存表示する。
    // 以前は「自専攻関連がある場合は他専攻関連を隠す」仕様だったため、
    // 集中講義枠で「情報システム特論(自関連) + 高信頼情報システム特論(他関連)」が
    // 単色だけに見えていた。
    if (categories.has('rel')) parts.push(cloneHighlightPart(HIGHLIGHT_PATTERNS.myRel));
    if (categories.has('other-rel')) parts.push(cloneHighlightPart(HIGHLIGHT_PATTERNS.extRel));

    return normalizeHighlightParts(parts);
}

function normalizeHighlightParts(parts) {
    const seen = new Set();
    return (parts || []).filter(part => {
        if (!part || !part.background) return false;
        const key = part.key || part.background;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function clearSlotHighlight(element) {
    if (!element) return;
    element.classList.remove('slot-highlighted', 'slot-highlight-single', 'slot-highlight-split');
    element.style.background = '';
    element.style.backgroundColor = '';
    Array.from(element.children || []).forEach(child => {
        if (
            child.classList?.contains('slot-bg') ||
            child.classList?.contains('slot-highlight-layer') ||
            child.classList?.contains('special-highlight-bg')
        ) {
            child.remove();
        }
    });
}

function applySlotHighlight(element, parts) {
    if (!element) return;
    const normalized = normalizeHighlightParts(parts);
    clearSlotHighlight(element);
    if (normalized.length === 0) return;

    // v10: 単色でも複数色でも、通常枠・特殊枠とも必ず同じ背景レイヤーを使う。
    // 親要素の background に直接入れないことで、td と div のCSS差分を排除する。
    element.classList.add('slot-highlighted');
    element.classList.toggle('slot-highlight-single', normalized.length === 1);
    element.classList.toggle('slot-highlight-split', normalized.length > 1);

    const layer = document.createElement('div');
    layer.className = `slot-bg slot-bg-count-${normalized.length}`;
    layer.style.gridTemplateColumns = `repeat(${normalized.length}, minmax(0, 1fr))`;

    normalized.forEach(part => {
        const segment = document.createElement('span');
        segment.className = `slot-bg-part slot-bg-${part.key || 'part'}`;
        segment.style.background = part.background;
        layer.appendChild(segment);
    });

    element.insertBefore(layer, element.firstChild);
}

function renderSpecialBoxes(currentData, myMajorId, currentTerm, highlightMode) {
    const targets = [
        { id: 'c-intensive', contentId: 'intensive-content' },
        { id: 'c-research', contentId: 'research-content' },
        { id: 'c-other', contentId: 'other-content' }
    ];

    targets.forEach(({ id, contentId }) => {
        const box = document.getElementById(id);
        const content = document.getElementById(contentId);
        if (!box || !content) return;

        clearSlotHighlight(box);
        const arr = currentData[id] || [];
        box.classList.toggle('has-lecture', arr.length > 0);

        content.innerHTML = arr.length > 0
            ? arr.map(v => getLectureTileHtml(v, myMajorId)).join('')
            : '<span class="empty-special">追加</span>';

        if (arr.length === 0) {
            applySlotHighlight(box, collectSlotHighlightParts(id, currentTerm, highlightMode, myMajorId));
        }
    });
}

function renderCourseGateStatus() {
    const statsContainer = document.getElementById('stats-container');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="course-gate-message">
                <b>所属コース未設定</b><br>
                修了要件の進捗計算は、左側の「所属コース設定」を選択すると表示されます。
            </div>`;
    }

    const msgSpace = document.getElementById('msg-space');
    if (msgSpace) {
        msgSpace.innerHTML = '<div class="msg-item">講義登録・時間割編集には所属コース設定が必要です。</div>';
    }

    updateHeaderStatus(1);
}

function updateHeaderStatus(alertCount = null) {
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    const courseStatus = document.getElementById('header-course-status');
    if (courseStatus) {
        courseStatus.textContent = myMajorId ? `所属: ${majorLabels[myMajorId] || myMajorId}` : '所属: 未設定';
    }

    const alertStatus = document.getElementById('header-alert-status');
    if (alertStatus && alertCount !== null) {
        alertStatus.classList.toggle('has-alerts', alertCount > 0);
        alertStatus.classList.toggle('no-alerts', alertCount === 0);
        alertStatus.textContent = alertCount > 0 ? `通知: ${alertCount}件` : '通知: 0件';
    }
}

// --- 2. 離脱防止ロジック (LocalStorage廃止に伴う対応) ---
window.addEventListener('beforeunload', (event) => {
    event.preventDefault();
    event.returnValue = ''; 
});

// --- 3. 外部データ読み込み ---
function loadDataScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const now = new Date();
        const cacheKey = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${now.getHours()}`;
        script.src = `data.js?v=${cacheKey}`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("data.js not found"));
        document.head.appendChild(script);
    });
}

window.onload = async () => {
    try {
        await loadDataScript();
        
        document.getElementById('my-course-select')?.addEventListener('change', (e) => {
            const myCourseSelect = e.target;
            const myCourseId = myCourseSelect.value;
            const catalogSelect = document.getElementById('catalog-course-select');

            // --- 追加箇所：空の選択肢を削除するロジック ---
            // 1番目の選択肢(index 0)が値を持っていない場合、それを削除する
            if (myCourseSelect.options[0].value === "") {
                myCourseSelect.remove(0);
            }
            // ------------------------------------------

            if (catalogSelect) {
                catalogSelect.value = myCourseId;
            }
            refresh();
        });

        document.getElementById('catalog-course-select')?.addEventListener('change', loadCatalog);
        document.getElementById('sel-term')?.addEventListener('change', updateSelectorButtons);
        document.getElementById('sel-day')?.addEventListener('change', updateSelectorButtons);
        document.getElementById('sel-period')?.addEventListener('change', updateSelectorButtons);
        
        init();
    } catch (error) {
        console.error("AP-Univ-Planner initialization failed:", error);
        alert("システムの初期化に失敗しました。data.jsの配置、または初期化処理を確認してください。詳細はブラウザのコンソールに出力されています。");
    }
};

function init() {
    const dateDisplay = document.getElementById('update-date-display');
    if (dateDisplay && typeof lastUpdated !== 'undefined') {
        dateDisplay.innerText = `Data: ${lastUpdated}`;
    }
    updateHeaderStatus();

    const grid = document.getElementById('grid');
    if (grid) {
        grid.innerHTML = "";
        for(let p=1; p<=6; p++) {
            let row = `<tr><td style="font-weight:bold; background:#f8f9fa;">${p}</td>`;
            for(let d=1; d<=5; d++) {
                const id = `c-${d}-${p}`;
                row += `<td id="${id}" class="cell" onclick="openEditor('${id}', '${['','月','火','水','木','金'][d]}曜 ${p}限')"></td>`;
            } grid.innerHTML += row + `</tr>`;
        }
    }
    refresh(); 
}

function getDynamicCategory(courseName, myMajorId) {
    if (courseName.includes("演習")) return 'prac';
    if (courseName === "情報科学特別研究") return 'res';
    if (typeof coreCourses !== 'undefined' && coreCourses.some(c => c.name === courseName)) return 'core';
    
    if (typeof majorMasters !== 'undefined') {
        const myMaster = majorMasters[myMajorId];
        if (myMaster) {
            if (myMaster.adv.some(c => c.name === courseName)) return 'adv';
            if (myMaster.rel.some(c => c.name === courseName)) return 'rel';
        }
        for (const mId in majorMasters) {
            if (mId === myMajorId) continue;
            if (majorMasters[mId].adv.some(c => c.name === courseName)) return 'other-adv';
            if (majorMasters[mId].rel.some(c => c.name === courseName)) return 'other-rel';
        }
    }
    return 'manual';
}

function getScheduleScore(c) {
    if (c.isIntensive) return 900;
    if (c.isOther) return 950;
    if (!c.day || !c.period) return 1000;
    const semScore = (c.sem === 'k') ? 100 : 0;
    return semScore + (c.day * 10) + c.period;
}

function loadCatalog() {
    const catalogSelect = document.getElementById('catalog-course-select');
    const searchInput = document.getElementById('catalog-search')?.value.toLowerCase() || "";
    const filterCat = document.getElementById('catalog-filter-cat')?.value || "all";
    const filterTime = document.getElementById('catalog-filter-time')?.value || "all";
    const sortType = document.getElementById('catalog-sort')?.value || "default";

    const listAll = document.getElementById('list-all');
    if (!catalogSelect || !listAll) return;
    
    listAll.innerHTML = '';
    const catCourseId = catalogSelect.value;

    let allData = [];

    // 共通科目の取得
    if (typeof coreCourses !== 'undefined') {
        allData = allData.concat(coreCourses.map(c => ({...c, type: 'core'})));
    }

    // 専攻科目の取得
    if (typeof majorMasters !== 'undefined') {
        if (catCourseId === 'all') {
            // 全専攻表示：重複を避けるためにSetで管理しながらすべての専攻を回る
            const addedNames = new Set();
            for (const mId in majorMasters) {
                ['adv', 'rel'].forEach(type => {
                    majorMasters[mId][type].forEach(c => {
                        if (!addedNames.has(c.name)) {
                            allData.push({...c, type: type});
                            addedNames.add(c.name);
                        }
                    });
                });
            }
        } else if (majorMasters[catCourseId]) {
            // 単一専攻表示
            allData = allData.concat(majorMasters[catCourseId].adv.map(c => ({...c, type: 'adv'})));
            allData = allData.concat(majorMasters[catCourseId].rel.map(c => ({...c, type: 'rel'})));
        }
    }
    
    const pracResData = [
        { name: `情報科学演習1`, schedule: "M1前期のみ", sem: 'z', type: 'prac' },
        { name: `情報科学演習2`, schedule: "M1後期のみ", sem: 'k', type: 'prac' },
        { name: `情報科学演習3`, schedule: "M2前期のみ", sem: 'z', type: 'prac' },
        { name: `情報科学特別研究`, schedule: "全学期共通", isOther: true, type: 'res' }
    ];
    allData = allData.concat(pracResData);

    const registeredNames = new Set();
    ['m1z','m1k','m2z','m2k'].forEach(t => {
        Object.values(appState[t]).forEach(arr => arr.forEach(v => registeredNames.add(v.name)));
    });

    let result = allData.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchInput);
        let matchesCat = true;
        if (filterCat !== 'all') {
            if (filterCat === 'prac') matchesCat = (c.type === 'prac' || c.type === 'res');
            else matchesCat = (c.type === filterCat);
        }
        let matchesTime = true;
        if (filterTime === 'z') matchesTime = (c.sem === 'z');
        else if (filterTime === 'k') matchesTime = (c.sem === 'k');
        else if (filterTime === 'intensive') matchesTime = c.isIntensive;
        return matchesSearch && matchesCat && matchesTime;
    });

    if (sortType === 'name') {
        result.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    } else if (sortType === 'time') {
        result.sort((a, b) => getScheduleScore(a) - getScheduleScore(b));
    } else {
        const order = { core: 1, adv: 2, rel: 3, prac: 4, res: 5 };
        result.sort((a, b) => order[a.type] - order[b.type]);
    }

    const countLabel = document.getElementById('catalog-count-label');
    if (countLabel) countLabel.textContent = `${result.length}件`;

    result.forEach(c => createDefinedItem(c, c.type, listAll, registeredNames));
}

function createDefinedItem(c, type, container, registeredNames) {
    if (!container) return;
    const div = document.createElement('div');
    const isSelected = registeredNames.has(c.name);
    const isLocked = !isCourseSelected();
    div.className = `item ${type} ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`;

    const nameNode = document.createElement('span');
    nameNode.textContent = c.name;
    const br = document.createElement('br');
    const scheduleNode = document.createElement('span');
    scheduleNode.style.fontSize = '0.65rem';
    scheduleNode.style.color = '#95a5a6';
    scheduleNode.textContent = `[${c.schedule}]`;
    div.appendChild(nameNode);
    div.appendChild(br);
    div.appendChild(scheduleNode);

    div.onclick = () => {
        if (!ensureCourseSelected("講義登録・変更")) return;
        if (isSelected) {
            let locations = [];
            ['m1z','m1k','m2z','m2k'].forEach(t => {
                Object.keys(appState[t]).forEach(id => {
                    if (appState[t][id].some(v => v.name === c.name)) {
                        let locStr = termLabels[t];
                        if (id.match(/c-\d-\d/)) {
                            const parts = id.split('-');
                            locStr += ` ${['','月','火','水','木','金'][parts[1]]}曜${parts[2]}限`;
                        } else {
                            const specialLabel = id.replace('c-','');
                            const labelMap = {intensive: "集中", research: "特別研究", other: "その他"};
                            locStr += ` (${labelMap[specialLabel] || specialLabel})`;
                        }
                        locations.push(locStr);
                    }
                });
            });

            const action = prompt(`「${c.name}」は以下に登録されています：\n${locations.join('\n')}\n\n操作を選択してください：\n1: そのままにする\n2: 別の場所に移動する\n3: 削除する`, "1");
            
            if (action === "2") {
                openCourseSelector(c, true);
            } else if (action === "3") {
                if (confirm(`「${c.name}」を削除しますか？`)) {
                    deleteFromAll(c.name);
                    refresh();
                }
            }
            return;
        }
        openCourseSelector(c, false);
    };
    container.appendChild(div);
}

function deleteFromAll(courseName) {
    ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => {
        Object.keys(appState[t]).forEach(id => {
            appState[t][id] = appState[t][id].filter(v => v.name !== courseName);
        });
    });
}

function openCourseSelector(c, isMoveMode = false) {
    if (!ensureCourseSelected(isMoveMode ? "講義の移動" : "講義登録")) return;
    const myCourseId = document.getElementById('my-course-select').value;
    const detectedCat = getDynamicCategory(c.name, myCourseId);
    
    let fullCourseData = { ...c };
    if (!c.day && !c.isIntensive && !c.isOther) {
        const findIn = (arr) => arr.find(item => item.name === c.name);
        let found = findIn(coreCourses);
        if (!found && majorMasters[myCourseId]) {
            found = findIn(majorMasters[myCourseId].adv) || findIn(majorMasters[myCourseId].rel);
        }
        if (found) fullCourseData = { ...found };
    }

    pendingCourse = { ...fullCourseData, cat: detectedCat, isMoveMode: isMoveMode };
    document.getElementById('selected-course-name').innerText = (isMoveMode ? "【移動中】" : "") + c.name;
    
    // ダイアログが開く前にアラートエリアをリセット
    const alertArea = document.getElementById('selector-overlap-alert');
    if (alertArea) alertArea.style.display = 'none';

    const termSelect = document.getElementById('sel-term');
    termSelect.innerHTML = "";
    const options = [
        { val: 'm1z', text: 'M1前期', sem: 'z' }, { val: 'm1k', text: 'M1後期', sem: 'k' },
        { val: 'm2z', text: 'M2前期', sem: 'z' }, { val: 'm2k', text: 'M2後期', sem: 'k' }
    ];
    
    options.forEach(opt => {
        let disabled = false;
        if (c.name === "情報科学演習1" && opt.val !== "m1z") disabled = true;
        if (c.name === "情報科学演習2" && opt.val !== "m1k") disabled = true;
        if (c.name === "情報科学演習3" && opt.val !== "m2z") disabled = true;
        if (fullCourseData.sem && fullCourseData.sem !== opt.sem) disabled = true;
        if (!disabled) {
            const el = document.createElement('option');
            el.value = opt.val; el.text = opt.text;
            termSelect.appendChild(el);
        }
    });

    const selectors = document.getElementById('day-period-selectors');
    if (fullCourseData.name === "情報科学特別研究" || fullCourseData.name.includes("特別研究") || fullCourseData.isIntensive || fullCourseData.isOther) {
        selectors.style.display = 'none';
    } else {
        selectors.style.display = 'block';
        const daySel = document.getElementById('sel-day');
        const perSel = document.getElementById('sel-period');
        if (fullCourseData.day && fullCourseData.period) {
            daySel.value = fullCourseData.day;
            perSel.value = fullCourseData.period;
            daySel.disabled = true; perSel.disabled = true;
        } else {
            daySel.disabled = false; perSel.disabled = false;
        }
    }
    
    updateSelectorButtons();
    document.getElementById('selector-dialog').showModal();
}

// 修正点: 集中講義(c-intensive)や特別研究(c-research)などの特殊枠では重複警告を非表示にする
function updateSelectorButtons() {
    const term = document.getElementById('sel-term').value;
    const day = document.getElementById('sel-day').value;
    const period = document.getElementById('sel-period').value;
    const id = `c-${day}-${period}`;
    
    const confirmBtn = document.getElementById('btn-confirm-add');
    const overwriteBtn = document.getElementById('btn-confirm-overwrite');
    
    let alertArea = document.getElementById('selector-overlap-alert');
    if (!alertArea) {
        alertArea = document.createElement('div');
        alertArea.id = 'selector-overlap-alert';
        alertArea.style.fontSize = '0.7rem';
        alertArea.style.marginTop = '10px';
        alertArea.style.padding = '8px';
        alertArea.style.borderRadius = '4px';
        alertArea.style.background = '#fff3cd';
        alertArea.style.color = '#856404';
        alertArea.style.border = '1px solid #ffeeba';
        const nameDisplay = document.getElementById('selected-course-name');
        nameDisplay.parentNode.insertBefore(alertArea, nameDisplay.nextSibling);
    }

    // 特殊枠（集中、研究、その他）の場合は重複判定を行わない
    const isSpecialId = pendingCourse && (pendingCourse.isIntensive || pendingCourse.isOther || pendingCourse.name.includes("特別研究"));
    const occupiedLectures = isSpecialId ? [] : (appState[term][id] || []);
    const isOccupied = occupiedLectures.length > 0;

    if (isOccupied) {
        const names = occupiedLectures.map(l => `「${escapeHtml(l.name)}」`).join(', ');
        alertArea.innerHTML = `⚠️ <b>重複注意:</b> 同時刻に ${names} が既に登録されています。そのまま追加しますか？`;
        alertArea.style.display = 'block';
    } else {
        alertArea.style.display = 'none';
    }

    if (pendingCourse && pendingCourse.isMoveMode) {
        confirmBtn.style.display = 'block';
        confirmBtn.innerText = isOccupied ? "重複を承知で移動を確定" : "ここへ移動を確定する";
        confirmBtn.style.background = isOccupied ? "var(--accent)" : "var(--success)";
        if(overwriteBtn) overwriteBtn.style.display = 'none';
        return;
    }

    confirmBtn.style.display = 'block';
    confirmBtn.innerText = isOccupied ? "重複を承知で追加登録" : "登録する";
    confirmBtn.style.background = "var(--accent)";
    if(overwriteBtn) overwriteBtn.style.display = 'none';
}

function confirmSelector() {
    if (!pendingCourse) return;
    const term = document.getElementById('sel-term').value;
    let id = (pendingCourse.name === "情報科学特別研究" || pendingCourse.name.includes("特別研究")) ? 'c-research' :
             (pendingCourse.isIntensive) ? 'c-intensive' :
             (pendingCourse.isOther) ? 'c-other' :
             `c-${document.getElementById('sel-day').value}-${document.getElementById('sel-period').value}`;
    
    const data = { name: pendingCourse.name, cat: pendingCourse.cat, unit: 2 };

    if (pendingCourse.isMoveMode) {
        deleteFromAll(pendingCourse.name);
    }

    if (!appState[term][id]) appState[term][id] = [];
    appState[term][id].push(data);
    
    if (id === 'c-research') {
        ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => appState[t][id] = [data]);
    }
    
    document.getElementById('selector-dialog').close();
    refresh();
}

function switchTab(tabId) {
    appState.activeTab = tabId;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById('table-title').innerText = termLabels[tabId] + " 時間割";
    closeEditor(); 
    refresh();
}

function openEditor(id, label) {
    if (!ensureCourseSelected("時間割編集")) return;
    if(activeId) document.getElementById(activeId)?.classList.remove('active-target');
    activeId = id;
    document.getElementById(id)?.classList.add('active-target');
    document.getElementById('edit-pos').innerText = label;
    editingIndex = -1;
    document.getElementById('in-name').value = "";
    
    renderEditList();
    renderSuggestedCourses(id);
    document.getElementById('editor').style.display = 'block';
}

// 修正点: 特殊枠（集中・研究・その他）でも関連する講義をクイック登録に表示する
function renderSuggestedCourses(cellId) {
    const quickSlot = document.getElementById('quick-register-slot');
    document.getElementById('suggest-label')?.remove();
    document.getElementById('suggested-courses-area')?.remove();
    document.getElementById('suggest-divider')?.remove();
    if (quickSlot) quickSlot.innerHTML = "";
    
    const match = cellId.match(/c-(\d)-(\d)/);
    const myMajorId = getSelectedMajorId();
    const currentTab = appState.activeTab;
    const currentTerm = appState.activeTab.slice(-1); 

    let suggestions = [];
    const addSuggestion = (course, fallbackType = course?.type || 'manual') => {
        addResolvedSuggestion(suggestions, course, fallbackType);
    };
    
    // 通常枠の判定
    if (match) {
        const targetDay = parseInt(match[1]);
        const targetPeriod = parseInt(match[2]);
        
        if(typeof coreCourses !== 'undefined') {
            coreCourses.forEach(c => {
                if (c.day === targetDay && c.period === targetPeriod && c.sem === currentTerm) {
                    addSuggestion(c, 'core');
                }
            });
        }
        if(typeof majorMasters !== 'undefined') {
            Object.keys(majorMasters).forEach(majorId => {
                ['adv', 'rel'].forEach(type => {
                    (majorMasters[majorId][type] || []).forEach(c => {
                        if (c.day === targetDay && c.period === targetPeriod && c.sem === currentTerm) {
                            addSuggestion(c, majorId === myMajorId ? type : `other-${type}`);
                        }
                    });
                });
            });
        }

        const practiceByTab = {
            m1z: { name: "情報科学演習1", schedule: "M1前期のみ", sem: 'z', type: 'prac' },
            m1k: { name: "情報科学演習2", schedule: "M1後期のみ", sem: 'k', type: 'prac' },
            m2z: { name: "情報科学演習3", schedule: "M2前期のみ", sem: 'z', type: 'prac' }
        };
        if (practiceByTab[currentTab]) addSuggestion(practiceByTab[currentTab], 'prac');
    } 
    // 特殊枠（集中・特別研究・その他）の判定
    else {
        const isIntensiveSlot = cellId.includes('intensive');
        const isResearchSlot = cellId.includes('research');
        const isOtherSlot = cellId.includes('other');

        if (isResearchSlot) {
            addSuggestion({ name: "情報科学特別研究", type: "res" }, 'res');
        } else if (isIntensiveSlot || isOtherSlot) {
            if(typeof coreCourses !== 'undefined') {
                coreCourses.forEach(c => {
                    if ((isIntensiveSlot && c.isIntensive) || (isOtherSlot && c.isOther)) {
                        if (c.sem === currentTerm) addSuggestion(c, 'core');
                    }
                });
            }
            if(typeof majorMasters !== 'undefined') {
                Object.keys(majorMasters).forEach(majorId => {
                    ['adv', 'rel'].forEach(type => {
                        (majorMasters[majorId][type] || []).forEach(c => {
                            if ((isIntensiveSlot && c.isIntensive) || (isOtherSlot && c.isOther)) {
                                if (c.sem === currentTerm) addSuggestion(c, majorId === myMajorId ? type : `other-${type}`);
                            }
                        });
                    });
                });
            }
        }
    }

    let labelText = "開講講義（クイック登録）";
    if (match) {
        const dayName = ['','月','火','水','木','金'][match[1]];
        labelText = `${dayName}曜${match[2]}限の開講講義`;
    }

    const headerHtml = `
        <div class="editor-section-heading">
            <span class="editor-section-title">${escapeHtml(labelText)}</span>
            <span class="editor-section-note">候補をクリックして登録</span>
        </div>
    `;

    const listHtml = suggestions.length > 0 ? `
        <div id="suggested-courses-area" class="suggested-list editor-suggested-list">
            ${suggestions.map(s => {
                const encodedName = encodeURIComponent(s.name);
                const encodedType = encodeURIComponent(s.catKey || s.type);
                const registered = isCourseRegistered(s.name);
                const isPractice = /^情報科学演習[123]$/.test(s.name);
                const classes = [
                    'suggest-item',
                    escapeHtml(s.type),
                    !s.isInternal ? 'external-course' : '',
                    registered ? 'already-registered' : '',
                    registered && isPractice ? 'practice-registered' : ''
                ].filter(Boolean).join(' ');
                const categoryLabel = registered ? '登録済み' : (SYSTEM_CONFIG.CAT_LABELS[s.catKey] || SYSTEM_CONFIG.CAT_LABELS[s.type] || s.type);
                return `
                <div class="${classes}" title="${registered ? 'すでに登録済みです' : 'クリックして登録'}" onclick="quickRegister(decodeURIComponent('${encodedName}'), decodeURIComponent('${encodedType}'))">
                    <span class="suggest-name">${!s.isInternal ? '<i class="ext-tag">他専攻</i>' : ''}${escapeHtml(s.name)}</span>
                    <span class="cat-label ${registered ? 'registered-label' : ''}">${escapeHtml(categoryLabel)}</span>
                </div>
            `;}).join('')}
        </div>
    ` : `<div class="editor-empty">この枠に対応するクイック登録候補はありません。</div>`;

    if (quickSlot) {
        quickSlot.innerHTML = headerHtml + listHtml;
        return;
    }

    // 旧HTML構造へのフォールバック
    const fallbackHtml = `<label id="suggest-label" class="label-sm" style="color:var(--accent); margin-top:10px;">${escapeHtml(labelText)}</label>${listHtml}<hr id="suggest-divider" style="border:0; border-top:1px solid #eee; margin:10px 0;">`;
    const hrBeforeEdit = document.querySelector('#editor hr');
    if (hrBeforeEdit) hrBeforeEdit.insertAdjacentHTML('beforebegin', fallbackHtml);
}

// 修正点: 「情報科学特別研究」などの研究科目(res)がクイック登録された場合、全学期に反映する
function quickRegister(name, type) {
    if (!ensureCourseSelected("クイック登録")) return;
    const myMajorId = document.getElementById('my-course-select').value;
    const detectedCat = getDynamicCategory(name, myMajorId);
    const data = { name: name, cat: detectedCat, unit: 2 };
    
    // 重複チェック
    const isAlreadyRegistered = ['m1z','m1k','m2z','m2k'].some(t => 
        Object.values(appState[t]).some(arr => arr.some(v => v.name === name))
    );
    
    if (isAlreadyRegistered) {
        alert(`「${name}」はすでに登録されています。`);
        return;
    }

    // 特別研究(res)または名前に特別研究を含む場合の処理
    if (type === 'res' || name.includes("特別研究")) {
        ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => {
            if (!appState[t]['c-research']) appState[t]['c-research'] = [];
            appState[t]['c-research'] = [data]; // 研究枠は常に1枠のため上書き
        });
    } else {
        // 通常の講義
        if (!appState[appState.activeTab][activeId]) appState[appState.activeTab][activeId] = [];
        appState[appState.activeTab][activeId].push(data);
    }

    refresh();
    closeEditor();
}

function renderEditList() {
    const list = document.getElementById('lecture-edit-list');
    if (!list) return;
    list.innerHTML = "";
    const dataArr = appState[appState.activeTab][activeId] || [];

    if (dataArr.length === 0) {
        list.innerHTML = `<div class="editor-empty">この枠には登録済み講義がありません。</div>`;
        return;
    }
    
    dataArr.forEach((v, idx) => {
        const div = document.createElement('div');
        div.className = "editor-lecture-row";
        
        let catalogItem = null;
        if (typeof coreCourses !== 'undefined') catalogItem = coreCourses.find(c => c.name === v.name);
        if (!catalogItem && typeof majorMasters !== 'undefined') {
            for (let m in majorMasters) {
                catalogItem = majorMasters[m].adv.find(c => c.name === v.name) || majorMasters[m].rel.find(c => c.name === v.name);
                if (catalogItem) break;
            }
        }
        if (!catalogItem && v.name.includes("演習")) {
            const n = v.name.slice(-1);
            catalogItem = { name: v.name, schedule: `M${n === '3' ? '2' : '1'}前期`, sem: n === '2' ? 'k' : 'z' };
        }

        const main = document.createElement('div');
        main.className = 'editor-lecture-main';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'editor-lecture-name';
        nameSpan.textContent = v.name;
        main.appendChild(nameSpan);

        const meta = document.createElement('span');
        meta.className = 'editor-lecture-meta';
        const dynamicCat = getDynamicCategory(v.name, getSelectedMajorId());
        meta.textContent = `${SYSTEM_CONFIG.CAT_LABELS[dynamicCat] || dynamicCat} / ${v.unit || 2}単位`;
        main.appendChild(meta);

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'editor-row-actions';

        const firstButton = document.createElement('button');
        firstButton.className = 'btn btn-sm btn-secondary';
        firstButton.type = 'button';
        firstButton.textContent = catalogItem ? '移動' : '編集';
        firstButton.onclick = () => catalogItem ? handleMoveRequest(v.name, idx) : editLecture(idx);
        buttonGroup.appendChild(firstButton);

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-sm btn-danger';
        deleteButton.type = 'button';
        deleteButton.textContent = '削除';
        deleteButton.onclick = () => deleteLecture(idx);
        buttonGroup.appendChild(deleteButton);

        div.appendChild(main);
        div.appendChild(buttonGroup);
        list.appendChild(div);
    });
}

function handleMoveRequest(courseName, idx) {
    const lecture = appState[appState.activeTab][activeId][idx];
    const dummyCatalogItem = { name: lecture.name };
    closeEditor();
    openCourseSelector(dummyCatalogItem, true);
}

function editLecture(idx) {
    const data = appState[appState.activeTab][activeId][idx];
    document.getElementById('in-name').value = data.name;
    document.getElementById('in-cat').value = data.cat;
    document.getElementById('in-unit').value = data.unit;
    editingIndex = idx;
}

function deleteLecture(idx) {
    appState[appState.activeTab][activeId].splice(idx, 1);
    if (activeId === 'c-research') ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => appState[t][activeId] = []);
    renderEditList(); 
    refresh();
}

function closeEditor() {
    if(activeId) document.getElementById(activeId)?.classList.remove('active-target');
    document.getElementById('editor').style.display = 'none';
    activeId = null;
}

function updateCell() {
    if (!ensureCourseSelected("手動追加・編集")) return;
    const name = document.getElementById('in-name').value;
    if(!name) return;
    const data = { name, cat: document.getElementById('in-cat').value, unit: parseInt(document.getElementById('in-unit').value) };
    if (!appState[appState.activeTab][activeId]) appState[appState.activeTab][activeId] = [];
    if (editingIndex > -1) appState[appState.activeTab][activeId][editingIndex] = data;
    else appState[appState.activeTab][activeId].push(data);
    if (activeId === 'c-research') ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => appState[t][activeId] = [data]);
    refresh(); closeEditor();
}

function refresh() {
    document.body.classList.toggle('course-not-selected', !isCourseSelected());
    updateHeaderStatus();
    const currentData = appState[appState.activeTab];
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    const currentTerm = appState.activeTab.slice(-1);
    const highlightMode = document.getElementById('highlight-mode')?.value || "off";

    document.querySelectorAll('.cell').forEach(td => {
        const arr = currentData[td.id] || [];
        const isConflict = arr.length > 1;

        td.className = "cell";
        td.style.display = "";
        td.style.background = "";
        td.style.backgroundColor = "";
        td.innerHTML = "";
        clearSlotHighlight(td);
        td.classList.toggle('conflict-cell', isConflict);

        if (arr.length === 0) {
            applySlotHighlight(td, collectSlotHighlightParts(td.id, currentTerm, highlightMode, myMajorId));
        } else {
            td.innerHTML = arr.map(v => getLectureTileHtml(v, myMajorId)).join('');
        }
    });

    renderSpecialBoxes(currentData, myMajorId, currentTerm, highlightMode);
    if (!isCourseSelected()) {
        renderCourseGateStatus();
    } else {
        calculateAndNotify();
    }
    loadCatalog(); 
}

function calculateAndNotify() {
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    let s = { core: 0, adv: 0, rel: 0, otheradv: 0, otherrel: 0, prac: 0, res: 0, manual: 0 };
    const msgs = [];
    const allCourseNames = [];
    
    ['m1z','m1k','m2z','m2k'].forEach(t => {
        Object.keys(appState[t]).forEach(id => {
            const arr = appState[t][id];
            if (arr.length > 1 && !id.includes('intensive') && !id.includes('other') && !id.includes('research')) {
                const info = id.replace('c-','').split('-');
                msgs.push(`${termLabels[t]}の${['','月','火','水','木','金'][info[0]]}曜${info[1]}限に重複があります。`);
            }
            arr.forEach(v => {
                const dynamicCat = getDynamicCategory(v.name, myMajorId);
                const k = dynamicCat.replace('-',''); 
                if(s.hasOwnProperty(k)) s[k] += v.unit;
                allCourseNames.push({name: v.name, term: t});
            });
        });
    });

    const L = SYSTEM_CONFIG.REQ_LIMITS;
    const tAdv = Math.min(s.otheradv, L.OTHER_ADV_LIMIT), tRel = Math.min(s.otherrel, L.OTHER_REL_LIMIT);
    const items = [
        { n: `専門科目 合計 (${L.TOTAL_ADV_REQ})`, v: s.core + s.adv + tAdv, r: L.TOTAL_ADV_REQ, cat: 'total' },
        { n: `└ 共通 (${L.CORE_MIN})`, v: s.core, r: L.CORE_MIN, sub: true, cat: 'core' },
        { n: `└ 専攻 (${L.MAJOR_MIN})`, v: s.adv + tAdv, r: L.MAJOR_MIN, sub: true, cat: 'adv', extra: `(内、他専攻振替: ${tAdv}/${L.OTHER_ADV_LIMIT})` },
        { n: `関連科目 (${L.REL_MIN})`, v: s.rel + tRel, r: L.REL_MIN, cat: 'rel', extra: `(内、他専攻振替: ${tRel}/${L.OTHER_REL_LIMIT})` },
        { n: `情報科学演習 (${L.PRAC_MIN})`, v: s.prac, r: L.PRAC_MIN, cat: 'prac' },
        { n: `情報科学特別研究 (${L.RES_MIN})`, v: s.res, r: L.RES_MIN, cat: 'res' }
    ];

    const statsContainer = document.getElementById('stats-container');
    if(statsContainer) {
        statsContainer.innerHTML = items.map(i => {
            const progress = Math.max(0, Math.min(100, Math.round((i.v / i.r) * 100)));
            const isOk = i.v >= i.r;
            return `
            <div class="stat-row stat-${escapeHtml(i.cat || 'manual')}">
                <div class="stat-main">
                    <span class="stat-name ${i.sub ? 'sub' : ''}" style="${!i.sub ? 'font-weight:bold;' : ''}">${escapeHtml(i.n)}</span>
                    <span class="stat-value"><b>${i.v}</b> / ${i.r} <span class="badge ${isOk ? 'bg-ok' : 'bg-no'}">${isOk ? 'OK' : i.v - i.r}</span></span>
                </div>
                <div class="stat-progress" aria-hidden="true"><div class="stat-progress-bar ${isOk ? '' : 'incomplete'}" style="--progress:${progress}%"></div></div>
                ${i.extra ? `<div class="stat-extra">${escapeHtml(i.extra)}</div>` : ''}
            </div>`;
        }).join('');
    }

    const nameCounts = {};
    allCourseNames.forEach(x => { nameCounts[x.name] = (nameCounts[x.name] || 0) + 1; });
    for(let name in nameCounts) {
        if(nameCounts[name] > 1 && name !== "情報科学特別研究" && !name.includes("演習")) {
            msgs.push(`「${name}」が重複登録されています。`);
        }
    }
    const msgSpace = document.getElementById('msg-space');
    if(msgSpace) {
        msgSpace.innerHTML = msgs.length > 0
            ? msgs.map(msg => `<div class="msg-item">${escapeHtml(msg)}</div>`).join('')
            : '<span style="color:#bdc3c7;">通知はありません</span>';
    }
    updateHeaderStatus(msgs.length);
}

// 修正点: 保存ファイル名をユーザーが指定できるようにし、デフォルト名に日時を含める
function exportData() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const defaultFileName = `timetable_plan_${dateStr}.json`;

    // ユーザーにファイル名を確認
    const fileName = prompt("保存するファイル名を入力してください:", defaultFileName);
    if (fileName === null) return; // キャンセル時

    const dataStr = JSON.stringify({ state: appState, myCourse: document.getElementById('my-course-select').value }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.json') ? fileName : fileName + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const reader = new FileReader();
    const file = event.target.files[0];
    if (!file) return;

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.state || !data.state.m1z || !data.state.m2k) {
                throw new Error("Invalid structure");
            }
            const myMajorId = data.myCourse || document.getElementById('my-course-select').value;
            const missingCourses = [];
            ['m1z','m1k','m2z','m2k'].forEach(t => {
                Object.values(data.state[t]).forEach(lectureArray => {
                    lectureArray.forEach(v => {
                        const cat = getDynamicCategory(v.name, myMajorId);
                        if (cat === 'manual') missingCourses.push(v.name);
                    });
                });
            });
            appState = data.state; 
            if (document.getElementById('my-course-select') && data.myCourse) {
                const mySelect = document.getElementById('my-course-select');
                mySelect.value = data.myCourse;
                if (mySelect.options[0]?.value === "") mySelect.remove(0);
                const catalogSelect = document.getElementById('catalog-course-select');
                if (catalogSelect) catalogSelect.value = data.myCourse;
            }
            refresh();
            if (missingCourses.length > 0) {
                const uniqueMissing = [...new Set(missingCourses)];
                alert(`【注意】読み込んだデータのうち、以下の講義は現在のカタログに見つかりませんでした。\n\n・${uniqueMissing.join('\n・')}\n\n先に「カタログ拡張」を行うか、手動でカテゴリを修正してください。`);
            } else {
                alert("データを正常にインポートしました。");
            }
        } catch (err) {
            alert("エラー: 選択されたファイルは有効なプランデータではありません。");
        } finally {
            event.target.value = ""; 
        }
    };
    reader.readAsText(file);
}

function importCatalogDiff(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const diffData = JSON.parse(e.target.result);
            if (!diffData.coreCourses && !diffData.majorMasters) {
                throw new Error("Invalid catalog structure");
            }
            if (diffData.coreCourses) {
                diffData.coreCourses.forEach(newCourse => {
                    const idx = coreCourses.findIndex(c => c.name === newCourse.name);
                    if (idx !== -1) coreCourses[idx] = newCourse;
                    else coreCourses.push(newCourse);
                });
            }
            if (diffData.majorMasters) {
                for (const majorId in diffData.majorMasters) {
                    if (!majorMasters[majorId]) majorMasters[majorId] = { adv: [], rel: [] };
                    ['adv', 'rel'].forEach(cat => {
                        if (diffData.majorMasters[majorId][cat]) {
                            diffData.majorMasters[majorId][cat].forEach(newCourse => {
                                const idx = majorMasters[majorId][cat].findIndex(c => c.name === newCourse.name);
                                if (idx !== -1) majorMasters[majorId][cat][idx] = newCourse;
                                else majorMasters[majorId][cat].push(newCourse);
                            });
                        }
                    });
                }
            }
            alert("カタログ情報を更新しました。");
            refresh();
        } catch (err) {
            alert("エラー: 選択されたファイルは有効なカタログ拡張データではありません。");
        }
        event.target.value = "";
    };
    reader.readAsText(file);
}