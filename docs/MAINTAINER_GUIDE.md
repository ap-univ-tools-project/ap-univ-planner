# AP-Univ-Planner 管理者向けガイド

この文書は、AP-Univ-Plannerを保守・更新する人向けの案内です。一般利用者向けの説明は [`README.md`](../README.md) を参照してください。

## まず読むところ

後任者が日常的に触るファイルは、基本的に次の範囲だけです。

| 作業 | 主に触るファイル |
|---|---|
| 講義カタログの更新 | `data.js` |
| アプリ機能・UIの修正 | `index.html`, `style.css`, `script.js` |
| 利用者向け説明の修正 | `README.md`, 必要に応じて `index.html` |
| 公開前確認 | `docs/RELEASE_CHECKLIST.md` |

`.github/ISSUE_TEMPLATE/`、`templates/`、`tests/` は、必要が生じない限り普段は変更しません。

## 最短運用手順

### 講義カタログだけ更新する場合

1. 公式情報を確認する。
2. `data.js` の講義データを修正する。
3. `data.js` 冒頭の `lastUpdated` を更新する。
4. ローカルでカタログ表示と対象講義を確認する。
5. `docs/RELEASE_CHECKLIST.md` の「A. 講義データ更新」を確認する。
6. コミットしてpushする。

軽微な講義データ修正では、ツール本体バージョンの変更やGitHub Release作成は必須ではありません。

### 機能・UI・重要ロジックを更新する場合

1. 対象ファイルを修正する。
2. 構文チェックと回帰テストを行う。
3. 公開版にする場合は `script.js` の `APP_VERSION` を更新する。
4. `docs/RELEASE_CHECKLIST.md` の「B. 機能リリース」を確認する。
5. コミット・push後、GitHub Pagesで確認する。
6. 画面のバージョンと同じタグでGitHub Releaseを作成する。

### ドキュメントだけ更新する場合

1. 該当Markdownまたは画面内説明を修正する。
2. 相対リンクと記載内容を確認する。
3. コミットしてpushする。

通常はツール本体バージョン変更やGitHub Release作成は不要です。

## バージョンと更新日の管理

AP-Univ-Plannerでは、次の3種類を分けて扱います。

| 種類 | 管理場所 | 例 |
|---|---|---|
| ツール本体バージョン | `script.js` の `APP_VERSION` | `1.1.0` |
| 講義カタログ更新日 | `data.js` の `lastUpdated` | `2026-04-20` |
| 保存JSON形式 | `script.js` の `APP_SAVE_VERSION` | `2` |

### ツール本体バージョン

画面上の `vX.Y.Z` は `script.js` の `APP_VERSION` から表示されます。バージョンを変更する場合は、この定数だけを更新してください。

- **MAJOR**: 保存互換性や利用方法が大きく変わる変更
- **MINOR**: 新機能、大きなUI改善、重要ロジック改善
- **PATCH**: 不具合修正、軽微なUI・文言調整

画面上のバージョンを更新した場合は、原則として同じ `vX.Y.Z` のGitHub Releaseを作成します。

### 講義カタログ更新日

講義データを変更した場合は、`lastUpdated` を必ず更新します。

- 誤字などの軽微な修正: `lastUpdated` 更新のみでも可
- 曜日時限や開講状況など履修判断に影響する修正: PATCH Releaseを検討
- 年度全体の更新: GitHub Release作成を推奨

### 保存JSON形式

`APP_SAVE_VERSION` は保存ファイル構造の内部バージョンであり、ツール本体のバージョンとは別物です。保存JSONの構造や読み込み互換性を変更した場合だけ更新します。

## ローカル確認とテスト

リポジトリ直下で次を実行し、ブラウザから確認します。

```bash
python3 -m http.server 8000
```

```text
http://localhost:8000/
```

`script.js` を変更した場合:

```bash
node --check script.js
```

カテゴリ判定・ハイライト・保存読込周辺を変更した場合:

```bash
node tests/highlight_logic_test.js
```

## 標準講義データの更新

標準講義データは `data.js` の `coreCourses` と `majorMasters` で管理します。

更新時の注意:

- 公式シラバス、学生便覧、大学公開資料などを根拠にする。
- 確認した出典をIssueまたはコミットメッセージに残す。
- 曜日時限がある科目は `sem`, `day`, `period` を整合させる。
- 集中講義は `isIntensive: true` を指定する。
- 通常時限に入らない科目は `isOther: true` を指定する。
- 同名科目を変更した場合はカテゴリ判定とハイライトを確認する。

## サンプル履修データ

公開サンプルは `examples/sample_plan.json` の1件のみで、情報システム専攻の履修例です。利用者向け説明は [`docs/SAMPLE_PLAN.md`](SAMPLE_PLAN.md) にまとめています。

更新時は次を確認します。

- アプリの **保存(.json)** から出力した形式である。
- `myCourse` が `"1"` である。
- 氏名、学籍番号、メールアドレス、研究室名、個人的なメモなどが含まれていない。
- アプリの **読込(.json)** から正常に読み込める。
- README、アプリ内リンク、`docs/SAMPLE_PLAN.md` のパスが一致している。

## カタログ拡張テンプレート

配布用テンプレートは `templates/diff_template.json` に置きます。配置を変える場合は、READMEとアプリ内のリンクも同時に修正してください。

## Issueテンプレート

Issue Formsは `.github/ISSUE_TEMPLATE/` に配置します。一度正常に動作すれば、項目を変更したいとき以外は普段の保守対象ではありません。

```text
.github/ISSUE_TEMPLATE/
├── bug_report.yml
├── data_error_report.yml
├── feature_request.yml
└── config.yml
```

## 公開とGitHub Release

- ドキュメントだけの軽微な変更: Release不要
- 小規模な講義データ修正: Releaseは任意
- 履修判断に影響するデータ修正: PATCH Releaseを検討
- 新機能・重要ロジック変更: MINORまたはPATCH Releaseを作成

GitHub Release本文は `docs/RELEASE_CHECKLIST.md` 末尾のテンプレートを使用できます。変更履歴専用ファイルは設けず、公開版の履歴はGitHub Releasesで管理します。

## GitHub Pages反映後の確認

push後は公開URLをハードリロードし、最低限次を確認します。

- 初期化エラーがない。
- ツールバージョンと `Data: YYYY-MM-DD` が正しい。
- 所属選択、講義登録、保存・読込が動作する。
- サンプルJSON、カタログ拡張テンプレート、Issuesのリンクが有効である。

## 管理者引き継ぎ

後任者には、次の3点を最初に伝えれば基本運用できます。

1. 普段の年度・講義更新は `data.js` と `lastUpdated` を変更する。
2. 大きな機能変更時だけ `APP_VERSION` とGitHub Releaseを更新する。
3. 公開前は変更規模に応じて `docs/RELEASE_CHECKLIST.md` のAまたはBを使う。

併せて、GitHubリポジトリ権限、GitHub Pages設定、未対応Issue、最新の公式情報の確認元を引き継いでください。
