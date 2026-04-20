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

// --- 2. 離脱防止ロジック (LocalStorage廃止に伴う対応) ---
window.addEventListener('beforeunload', (event) => {
    // データが入力されている可能性があるため、リロード・離脱時に確認を出す
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
        
        document.getElementById('my-course-select')?.addEventListener('change', refresh);
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

// 動的カテゴリ判定
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

function loadCatalog() {
    const catalogSelect = document.getElementById('catalog-course-select');
    if (!catalogSelect) return;
    
    const catCourseId = catalogSelect.value;
    const lists = { core: document.getElementById('list-core'), adv: document.getElementById('list-adv'), rel: document.getElementById('list-rel'), prac: document.getElementById('list-prac'), res: document.getElementById('list-res') };
    
    Object.values(lists).forEach(el => { if(el) el.innerHTML = ''; });
    
    const registeredNames = new Set();
    ['m1z','m1k','m2z','m2k'].forEach(t => {
        Object.values(appState[t]).forEach(arr => arr.forEach(v => registeredNames.add(v.name)));
    });

    if (typeof coreCourses !== 'undefined') {
        coreCourses.forEach(c => createDefinedItem(c, 'core', lists.core, registeredNames));
    }
    if (typeof majorMasters !== 'undefined' && majorMasters[catCourseId]) {
        const master = majorMasters[catCourseId];
        master.adv.forEach(c => createDefinedItem(c, 'adv', lists.adv, registeredNames));
        master.rel.forEach(c => createDefinedItem(c, 'rel', lists.rel, registeredNames));
    }
    
    createDefinedItem({ name: `情報科学演習1`, schedule: "M1前期のみ", sem: 'z' }, 'prac', lists.prac, registeredNames);
    createDefinedItem({ name: `情報科学演習2`, schedule: "M1後期のみ", sem: 'k' }, 'prac', lists.prac, registeredNames);
    createDefinedItem({ name: `情報科学演習3`, schedule: "M2前期のみ", sem: 'z' }, 'prac', lists.prac, registeredNames);
    createDefinedItem({ name: `情報科学特別研究`, schedule: "全学期共通" }, 'res', lists.res, registeredNames);
}

function createDefinedItem(c, type, container, registeredNames) {
    if (!container) return;
    const div = document.createElement('div');
    const isSelected = registeredNames.has(c.name);
    div.className = `item ${type} ${isSelected ? 'selected' : ''}`;
    div.innerHTML = `${c.name} <br><span style="font-size:0.65rem; color:#95a5a6;">[${c.schedule}]</span>`;
    div.onclick = () => {
        const myCourseId = document.getElementById('my-course-select').value;
        const detectedCat = getDynamicCategory(c.name, myCourseId);
        pendingCourse = { ...c, cat: detectedCat };
        document.getElementById('selected-course-name').innerText = c.name;
        
        const termSelect = document.getElementById('sel-term');
        termSelect.innerHTML = "";
        const options = [{ val: 'm1z', text: 'M1前期', sem: 'z' },{ val: 'm1k', text: 'M1後期', sem: 'k' },{ val: 'm2z', text: 'M2前期', sem: 'z' },{ val: 'm2k', text: 'M2後期', sem: 'k' }];
        
        options.forEach(opt => {
            let disabled = false;
            if (c.name === "情報科学演習1" && opt.val !== "m1z") disabled = true;
            if (c.name === "情報科学演習2" && opt.val !== "m1k") disabled = true;
            if (c.name === "情報科学演習3" && opt.val !== "m2z") disabled = true;
            if (c.sem && c.sem !== opt.sem) disabled = true;
            if (!disabled) {
                const el = document.createElement('option');
                el.value = opt.val; el.text = opt.text;
                termSelect.appendChild(el);
            }
        });

        const selectors = document.getElementById('day-period-selectors');
        if (c.name === "情報科学特別研究" || c.isIntensive || c.isOther) {
            selectors.style.display = 'none';
        } else {
            selectors.style.display = 'block';
            const daySel = document.getElementById('sel-day');
            const perSel = document.getElementById('sel-period');
            daySel.disabled = false; perSel.disabled = false;
            if (c.day) {
                daySel.value = c.day; perSel.value = c.period;
                daySel.disabled = true; perSel.disabled = true;
            }
        }
        updateSelectorButtons();
        document.getElementById('selector-dialog').showModal();
    };
    container.appendChild(div);
}

function updateSelectorButtons() {
    const term = document.getElementById('sel-term').value;
    const day = document.getElementById('sel-day').value;
    const per = document.getElementById('sel-period').value;
    const id = `c-${day}-${per}`;
    const exists = (appState[term][id] && appState[term][id].length > 0);
    document.getElementById('btn-confirm-overwrite').style.display = exists ? 'block' : 'none';
    document.getElementById('btn-confirm-add').innerText = exists ? '共存させる' : '登録';
}

function confirmSelector(overwrite) {
    const term = document.getElementById('sel-term').value;
    let id = (pendingCourse.name === "情報科学特別研究") ? 'c-research' :
             (pendingCourse.isIntensive) ? 'c-intensive' :
             (pendingCourse.isOther) ? 'c-other' :
             `c-${document.getElementById('sel-day').value}-${document.getElementById('sel-period').value}`;
    
    const data = { name: pendingCourse.name, cat: pendingCourse.cat, unit: 2 };
    if (overwrite) appState[term][id] = [data];
    else {
        if (!appState[term][id]) appState[term][id] = [];
        appState[term][id].push(data);
    }
    if (id === 'c-research') ['m1z', 'm1k', 'm2z', 'm2k'].forEach(t => appState[t][id] = [data]);
    
    switchTab(term);
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
    if(activeId) document.getElementById(activeId)?.classList.remove('active-target');
    activeId = id;
    document.getElementById(id)?.classList.add('active-target');
    document.getElementById('edit-pos').innerText = label;
    editingIndex = -1;
    document.getElementById('in-name').value = "";
    renderEditList();
    document.getElementById('editor').style.display = 'block';
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
        div.innerHTML = `<span>${v.name}</span>
            <span>
                <button onclick="editLecture(${idx})" style="font-size:0.6rem;">編</button>
                <button onclick="deleteLecture(${idx})" style="font-size:0.6rem;">削</button>
            </span>`;
        list.appendChild(div);
    });
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
    const myMajorId = document.getElementById('my-course-select').value;
    
    document.querySelectorAll('.cell').forEach(td => {
        const arr = currentData[td.id] || [];
        td.innerHTML = arr.map(v => {
            const dynamicCat = getDynamicCategory(v.name, myMajorId);
            const tagClass = dynamicCat.includes('other') ? 'tag-other' : `tag-${dynamicCat}`;
            return `
                <div class="lecture-tile">
                    <div style="font-weight:bold;">${v.name}</div>
                    <span class="cat-tag ${tagClass}">${SYSTEM_CONFIG.CAT_LABELS[dynamicCat]}</span>
                </div>
            `;
        }).join('');
    });
    
    ['intensive', 'research', 'other'].forEach(key => {
        const arr = currentData[`c-${key}`] || [];
        const target = document.getElementById(`${key}-content`);
        if(target) {
            target.innerHTML = arr.length > 0 ? arr.map(v => {
                const dynamicCat = getDynamicCategory(v.name, myMajorId);
                const tagClass = dynamicCat.includes('other') ? 'tag-other' : `tag-${dynamicCat}`;
                return `
                    <div style="margin-bottom:4px;">
                        <b>${v.name}</b> 
                        <span class="cat-tag ${tagClass}" style="font-size:0.55rem; padding:1px 3px;">${SYSTEM_CONFIG.CAT_LABELS[dynamicCat]}</span>
                    </div>
                `;
            }).join('') : "追加";
        }
    });

    calculateAndNotify();
    loadCatalog(); 
}

function calculateAndNotify() {
    const myMajorId = document.getElementById('my-course-select').value;
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
        { n: `関連科目 (${L.REL_MIN})`, v: s.rel + tRel, r: L.REL_MIN, extra: `(内、他コース振替: ${tRel}/${L.OTHER_REL_LIMIT})` },
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
            msgs.push(`<div class="msg-item">「${name}」が重複登録されています。</div>`);
        }
    }
    const msgSpace = document.getElementById('msg-space');
    if(msgSpace) msgSpace.innerHTML = msgs.length > 0 ? msgs.join('') : '<span style="color:#bdc3c7;">通知はありません</span>';
}

function exportData() {
    const dataStr = JSON.stringify({ state: appState, myCourse: document.getElementById('my-course-select').value });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([dataStr])); a.download = `plan.json`; a.click();
}

function importData(event) {
    const reader = new FileReader();
    const file = event.target.files[0];
    if (!file) return;

    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // 1. 構造の基本バリデーション
            if (!data.state || !data.state.m1z || !data.state.m2k) {
                throw new Error("Invalid structure");
            }

            // --- 2. カタログ整合性チェックの追加 ---
            const myMajorId = data.myCourse || document.getElementById('my-course-select').value;
            const missingCourses = [];
            
            // 全学期を走査して、現在のカタログで「manual(未定義)」になる講義を探す
            ['m1z','m1k','m2z','m2k'].forEach(t => {
                Object.values(data.state[t]).forEach(lectureArray => {
                    lectureArray.forEach(v => {
                        // getDynamicCategoryで判定し、手動入力(manual)扱いのものはカタログに存在しないとみなす
                        const cat = getDynamicCategory(v.name, myMajorId);
                        if (cat === 'manual') {
                            missingCourses.push(v.name);
                        }
                    });
                });
            });

            // 3. データの適用
            appState = data.state; 
            if (document.getElementById('my-course-select') && data.myCourse) {
                document.getElementById('my-course-select').value = data.myCourse;
            }
            
            refresh();

            // 4. 未知の講義があった場合の通知
            if (missingCourses.length > 0) {
                // 重複を除去して表示
                const uniqueMissing = [...new Set(missingCourses)];
                alert(`【注意】読み込んだデータのうち、以下の講義は現在のカタログに見つかりませんでした。\n\n・${uniqueMissing.join('\n・')}\n\n先に「カタログ拡張」を行うか、手動でカテゴリを修正してください。`);
            } else {
                alert("データを正常にインポートしました。");
            }

        } catch (err) {
            console.error("Import Error:", err);
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
            
            // --- 修正：カタログ拡張データかどうかのバリデーション ---
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
            // エラー時（構造が違う、またはJSONとして不正）
            console.error("Catalog Import Error:", err);
            alert("エラー: 選択されたファイルは有効なカタログ拡張データではありません。");
        }
        event.target.value = "";
    };
    reader.readAsText(file);
}