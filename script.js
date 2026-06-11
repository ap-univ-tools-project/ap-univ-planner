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


function isCourseSelected() {
    return !!document.getElementById('my-course-select')?.value;
}

function ensureCourseSelected(actionLabel = "この操作") {
    if (isCourseSelected()) return true;
    alert(`${actionLabel}を行うには、先に「所属コース設定」で専攻を選択してください。\n\n※データの読込・カタログ拡張・カタログの閲覧は、未選択のままでも利用できます。`);
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

function getLectureTileHtml(v, myMajorId) {
    const dynamicCat = getDynamicCategory(v.name, myMajorId);
    const tagClass = dynamicCat === 'other-adv' ? 'tag-other-adv' :
                     dynamicCat === 'other-rel' ? 'tag-other-rel' : `tag-${dynamicCat}`;
    return `<div class="lecture-tile">
        <div style="font-weight:bold;">${escapeHtml(v.name)}</div>
        <span class="cat-tag ${tagClass}">${escapeHtml(SYSTEM_CONFIG.CAT_LABELS[dynamicCat] || dynamicCat)}</span>
    </div>`;
}

function renderSpecialBoxes(currentData, myMajorId) {
    const targets = [
        { id: 'c-intensive', contentId: 'intensive-content', emptyText: '追加' },
        { id: 'c-research', contentId: 'research-content', emptyText: '追加' },
        { id: 'c-other', contentId: 'other-content', emptyText: '追加' }
    ];

    targets.forEach(({ id, contentId, emptyText }) => {
        const box = document.getElementById(id);
        const content = document.getElementById(contentId);
        if (!box || !content) return;

        const arr = currentData[id] || [];
        box.classList.toggle('has-lectures', arr.length > 0);
        if (arr.length === 0) {
            content.textContent = emptyText;
        } else {
            content.innerHTML = arr.map(v => getLectureTileHtml(v, myMajorId)).join('');
        }
    });
}

function renderCourseGateStatus() {
    const statsContainer = document.getElementById('stats-container');
    const msgSpace = document.getElementById('msg-space');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-row">
                <span style="font-weight:bold; color:var(--accent);">所属コース未設定</span>
                <span style="font-size:0.72rem; color:#7f8c8d; margin-top:4px;">
                    修了要件の計算と時間割編集は、左上の「所属コース設定」後に利用できます。
                </span>
            </div>`;
    }
    if (msgSpace) {
        msgSpace.innerHTML = '<div class="msg-item">講義登録・時間割編集の前に、所属コースを選択してください。</div>';
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
        alert("システムの初期化に失敗しました。data.jsが配置されているか確認してください。");
    }
};

function init() {
    const dateDisplay = document.getElementById('update-date-display');
    if (dateDisplay && typeof lastUpdated !== 'undefined') {
        dateDisplay.innerText = `Data: ${lastUpdated}`;
    }

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

    result.forEach(c => createDefinedItem(c, c.type, listAll, registeredNames));
}

function createDefinedItem(c, type, container, registeredNames) {
    if (!container) return;
    const div = document.createElement('div');
    const isSelected = registeredNames.has(c.name);
    const isLocked = !isCourseSelected();
    div.className = `item ${type} ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`;
    div.innerHTML = `${escapeHtml(c.name)} <br><span style="font-size:0.65rem; color:#95a5a6;">[${escapeHtml(c.schedule)}]</span>`;
    div.onclick = () => {
        if (!ensureCourseSelected('講義の登録・移動・削除')) return;

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
    if (!ensureCourseSelected(isMoveMode ? '講義の移動' : '講義の登録')) return;
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
    if (!ensureCourseSelected('講義の登録')) return;
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
    if (!ensureCourseSelected('時間割の編集')) return;
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
function getPracticeCourseForActiveTab() {
    const practiceCoursesByTab = {
        m1z: { name: "情報科学演習1", schedule: "M1前期のみ", sem: 'z', type: 'prac', isInternal: true },
        m1k: { name: "情報科学演習2", schedule: "M1後期のみ", sem: 'k', type: 'prac', isInternal: true },
        m2z: { name: "情報科学演習3", schedule: "M2前期のみ", sem: 'z', type: 'prac', isInternal: true }
    };
    return practiceCoursesByTab[appState.activeTab] || null;
}

function addSuggestionOnce(suggestions, course) {
    if (!course || suggestions.some(s => s.name === course.name)) return;
    suggestions.push(course);
}

function renderSuggestedCourses(cellId) {
    document.getElementById('suggest-label')?.remove();
    document.getElementById('suggested-courses-area')?.remove();
    document.getElementById('suggest-divider')?.remove();
    
    const match = cellId.match(/c-(\d)-(\d)/);
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    const currentTerm = appState.activeTab.slice(-1); 

    let suggestions = [];
    
    // 通常枠の判定
    if (match) {
        const targetDay = parseInt(match[1]);
        const targetPeriod = parseInt(match[2]);
        
        if(typeof coreCourses !== 'undefined') {
            coreCourses.forEach(c => {
                if (c.day === targetDay && c.period === targetPeriod && c.sem === currentTerm) {
                    suggestions.push({...c, type: 'core', isInternal: true});
                }
            });
        }
        if(typeof majorMasters !== 'undefined') {
            for (const majorId in majorMasters) {
                const isInternal = (majorId === myMajorId);
                ['adv', 'rel'].forEach(type => {
                    majorMasters[majorId][type].forEach(c => {
                        if (c.day === targetDay && c.period === targetPeriod && c.sem === currentTerm) {
                            addSuggestionOnce(suggestions, {...c, type, isInternal});
                        }
                    });
                });
            }
        }

        // 情報科学演習1〜3は固定の曜日・時限を持たないため、
        // 開講対象学期の通常セルであれば任意の枠にクイック登録できるようにする。
        addSuggestionOnce(suggestions, getPracticeCourseForActiveTab());
    } 
    // 特殊枠（集中・特別研究・その他）の判定
    else {
        const isIntensiveSlot = cellId.includes('intensive');
        const isResearchSlot = cellId.includes('research');
        const isOtherSlot = cellId.includes('other');

        if (isResearchSlot) {
            suggestions.push({ name: "情報科学特別研究", type: "res", isInternal: true });
        } else if (isIntensiveSlot || isOtherSlot) {
            // カタログから集中講義またはその他属性を持つものを抽出
            if(typeof coreCourses !== 'undefined') {
                coreCourses.forEach(c => {
                    if ((isIntensiveSlot && c.isIntensive) || (isOtherSlot && c.isOther)) {
                        if (c.sem === currentTerm) suggestions.push({...c, type: 'core', isInternal: true});
                    }
                });
            }
            if(typeof majorMasters !== 'undefined') {
                for (const majorId in majorMasters) {
                    const isInternal = (majorId === myMajorId);
                    ['adv', 'rel'].forEach(type => {
                        majorMasters[majorId][type].forEach(c => {
                            if ((isIntensiveSlot && c.isIntensive) || (isOtherSlot && c.isOther)) {
                                if (c.sem === currentTerm && !suggestions.some(s => s.name === c.name)) {
                                    suggestions.push({...c, type, isInternal});
                                }
                            }
                        });
                    });
                }
            }
        }
    }

    if (suggestions.length > 0) {
        let labelText = "開講講義 (クイック登録)";
        if (match) {
            const dayName = ['','月','火','水','木','金'][match[1]];
            labelText = `${dayName}曜${match[2]}限の${labelText}`;
        }

        const label = document.createElement('label');
        label.id = 'suggest-label';
        label.className = 'label-sm';
        label.style.color = 'var(--accent)';
        label.style.marginTop = '10px';
        label.textContent = labelText;

        const area = document.createElement('div');
        area.id = 'suggested-courses-area';
        area.className = 'suggested-list';

        suggestions.forEach(s => {
            const item = document.createElement('div');
            item.className = `suggest-item ${s.type} ${!s.isInternal ? 'external-course' : ''}`;
            item.addEventListener('click', () => quickRegister(s.name, s.type));

            const nameWrap = document.createElement('span');
            if (!s.isInternal) {
                const extTag = document.createElement('i');
                extTag.className = 'ext-tag';
                extTag.textContent = '他専攻';
                nameWrap.appendChild(extTag);
            }
            nameWrap.appendChild(document.createTextNode(s.name));

            const catLabel = document.createElement('span');
            catLabel.className = 'cat-label';
            catLabel.textContent = SYSTEM_CONFIG.CAT_LABELS[s.type] || s.type;

            item.appendChild(nameWrap);
            item.appendChild(catLabel);
            area.appendChild(item);
        });

        const divider = document.createElement('hr');
        divider.id = 'suggest-divider';
        divider.style.border = '0';
        divider.style.borderTop = '1px solid #eee';
        divider.style.margin = '10px 0';
        
        const hrBeforeEdit = document.querySelector('#editor hr');
        if (hrBeforeEdit) {
            hrBeforeEdit.before(label, area, divider);
        }
    }
}

// 修正点: 「情報科学特別研究」などの研究科目(res)がクイック登録された場合、全学期に反映する
function quickRegister(name, type) {
    if (!ensureCourseSelected('クイック登録')) return;
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
    list.innerHTML = "";
    const dataArr = appState[appState.activeTab][activeId] || [];
    
    dataArr.forEach((v, idx) => {
        const div = document.createElement('div');
        div.className = "lecture-tile";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.padding = "8px";
        
        let catalogItem = null;
        if (typeof coreCourses !== 'undefined') catalogItem = coreCourses.find(c => c.name === v.name);
        if (!catalogItem && typeof majorMasters !== 'undefined') {
            for (let m in majorMasters) {
                catalogItem = majorMasters[m].adv.find(c => c.name === v.name) || majorMasters[m].rel.find(c => c.name === v.name);
                if (catalogItem) break;
            }
        }
        if (!catalogItem && v.name.includes("演習")) {
            const practiceMeta = {
                "情報科学演習1": { schedule: "M1前期のみ", sem: 'z' },
                "情報科学演習2": { schedule: "M1後期のみ", sem: 'k' },
                "情報科学演習3": { schedule: "M2前期のみ", sem: 'z' }
            };
            catalogItem = { name: v.name, ...(practiceMeta[v.name] || { schedule: "演習科目", sem: undefined }) };
        }

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.fontSize = '0.8rem';
        nameSpan.textContent = v.name;

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const primaryBtn = document.createElement('button');
        primaryBtn.textContent = catalogItem ? '移動' : '編集';
        primaryBtn.addEventListener('click', () => {
            if (catalogItem) handleMoveRequest(v.name, idx);
            else editLecture(idx);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => deleteLecture(idx));

        actions.append(primaryBtn, deleteBtn);
        div.append(nameSpan, actions);
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
    if (!ensureCourseSelected('手動での時間割編集')) return;
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
    const currentData = appState[appState.activeTab];
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    const currentTerm = appState.activeTab.slice(-1);
    const highlightMode = document.getElementById('highlight-mode')?.value || "off";
    document.body.classList.toggle('course-not-selected', !myMajorId);

    // 他専攻ストライプをグラデーション内で再現するためのCSS定義
    const STRIPE_ADV = `repeating-linear-gradient(45deg, var(--major-adv), var(--major-adv) 5px, #fcf3cf 5px, #fcf3cf 10px)`;
    const STRIPE_REL = `repeating-linear-gradient(45deg, var(--related), var(--related) 5px, #ebdef0 5px, #ebdef0 10px)`;

    document.querySelectorAll('.cell').forEach(td => {
        const arr = currentData[td.id] || [];
        const match = td.id.match(/c-(\d)-(\d)/);
        
        td.style.background = "";
        td.style.backgroundColor = "";
        td.className = "cell";

        if (highlightMode !== "off" && match && arr.length === 0) {
            const d = parseInt(match[1]);
            const p = parseInt(match[2]);
            
            let hasCore = false, hasMyAdv = false, hasExtAdv = false, hasMyRel = false, hasExtRel = false;

            if (typeof coreCourses !== 'undefined') {
                hasCore = coreCourses.some(c => c.day === d && c.period === p && c.sem === currentTerm);
            }
            if (typeof majorMasters !== 'undefined') {
                for (const mId in majorMasters) {
                    const isMy = (mId === myMajorId);
                    if (highlightMode === "my-major" && !isMy) continue;

                    majorMasters[mId].adv.forEach(c => {
                        if (c.day === d && c.period === p && c.sem === currentTerm) { if (isMy) hasMyAdv = true; else hasExtAdv = true; }
                    });
                    majorMasters[mId].rel.forEach(c => {
                        if (c.day === d && c.period === p && c.sem === currentTerm) { if (isMy) hasMyRel = true; else hasExtRel = true; }
                    });
                }
            }

            // --- 色・模様のリスト作成 ---
            let bgParts = [];
            
            if (hasCore) bgParts.push('var(--major-core)'); // 共通：ベタ
            if (hasMyAdv) bgParts.push('var(--major-adv)');  // 自専門：ベタ
            
            // 【専門は共存】他専攻の専門があればストライプを追加
            if (hasExtAdv) bgParts.push(STRIPE_ADV);

            // 【関連は自専攻優先】
            if (hasMyRel) {
                bgParts.push('var(--related)'); // 自関連：ベタ
            } else if (hasExtRel && bgParts.length === 0) {
                // 自専攻が他に何もない場合のみ、他専攻の関連をストライプで表示
                bgParts.push(STRIPE_REL);
            }

            // --- レンダリング ---
            if (bgParts.length === 1) {
                td.style.background = bgParts[0];
            } else if (bgParts.length > 1) {
                // 複数の要素（ベタとストライプなど）を分割表示
                const step = 100 / bgParts.length;
                let gradient = `linear-gradient(135deg`;
                bgParts.forEach((part, i) => {
                    // ストライプ(repeating-linear...)を直接linear-gradientの引数には入れられないため
                    // ここでは単一背景として重ねるか、CSSの仕組み上、色のみを分割します。
                    // 確実に分割するために「色」と「模様」を使い分けます。
                });
                
                // 簡潔かつ確実に分割表示するための実装
                td.style.display = "grid";
                td.style.gridTemplateColumns = `repeat(${bgParts.length}, 1fr)`;
                td.innerHTML = bgParts.map(bg => `<div style="background:${bg}; height:100%; width:100%;"></div>`).join('');
                return; // 下の innerHTML 上書きをスキップ
            }
        }

        // 通常の講義タイル表示（中身がある場合）
        td.style.display = ""; // grid解除
        td.innerHTML = arr.map(v => getLectureTileHtml(v, myMajorId)).join('');
    });

    renderSpecialBoxes(currentData, myMajorId);
    calculateAndNotify();
    loadCatalog(); 
}

function calculateAndNotify() {
    const myMajorId = document.getElementById('my-course-select')?.value || "";
    if (!myMajorId) {
        renderCourseGateStatus();
        return;
    }
    let s = { core: 0, adv: 0, rel: 0, otheradv: 0, otherrel: 0, prac: 0, res: 0, manual: 0 };
    const msgs = [];
    const allCourseNames = [];
    
    ['m1z','m1k','m2z','m2k'].forEach(t => {
        Object.keys(appState[t]).forEach(id => {
            const arr = appState[t][id];
            if (arr.length > 1 && !id.includes('intensive') && !id.includes('other') && !id.includes('research')) {
                const info = id.replace('c-','').split('-');
                msgs.push(`<div class="msg-item">${termLabels[t]}の${['','月','火','水','木','金'][info[0]]}曜${info[1]}限に重複があります。</div>`);
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
        { n: `専門科目 合計 (${L.TOTAL_ADV_REQ})`, v: s.core + s.adv + tAdv, r: L.TOTAL_ADV_REQ },
        { n: ` └ 共通 (${L.CORE_MIN})`, v: s.core, r: L.CORE_MIN },
        { n: ` └ 専攻 (${L.MAJOR_MIN})`, v: s.adv + tAdv, r: L.MAJOR_MIN, extra: `(内、他専攻振替: ${tAdv}/${L.OTHER_ADV_LIMIT})` },
        { n: `関連科目 (${L.REL_MIN})`, v: s.rel + tRel, r: L.REL_MIN, extra: `(内、他専攻振替: ${tRel}/${L.OTHER_REL_LIMIT})` },
        { n: `情報科学演習 (${L.PRAC_MIN})`, v: s.prac, r: L.PRAC_MIN },
        { n: `情報科学特別研究 (${L.RES_MIN})`, v: s.res, r: L.RES_MIN }
    ];

    const statsContainer = document.getElementById('stats-container');
    if(statsContainer) {
        statsContainer.innerHTML = items.map(i => `
            <div class="stat-row">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="${i.n.includes('└') ? 'color:#7f8c8d;' : 'font-weight:bold;'}">${i.n}</span>
                    <span><b>${i.v}</b> <span class="badge ${i.v >= i.r ? 'bg-ok' : 'bg-no'}">${i.v >= i.r ? 'OK' : i.v - i.r}</span></span>
                </div>
                ${i.extra ? `<div style="font-size:0.6rem; color:#e67e22; margin-top:2px;">${i.extra}</div>` : ''}
            </div>
        `).join('');
    }

    const nameCounts = {};
    allCourseNames.forEach(x => { nameCounts[x.name] = (nameCounts[x.name] || 0) + 1; });
    for(let name in nameCounts) {
        if(nameCounts[name] > 1 && name !== "情報科学特別研究" && !name.includes("演習")) {
            msgs.push(`<div class="msg-item">「${escapeHtml(name)}」が重複登録されています。</div>`);
        }
    }
    const msgSpace = document.getElementById('msg-space');
    if(msgSpace) msgSpace.innerHTML = msgs.length > 0 ? msgs.join('') : '<span style="color:#bdc3c7;">通知はありません</span>';
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
                const myCourseSelect = document.getElementById('my-course-select');
                myCourseSelect.value = data.myCourse;
                if (myCourseSelect.options[0]?.value === "") {
                    myCourseSelect.remove(0);
                }
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