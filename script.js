// DOM要素
const inputTable = document.getElementById('input-table');
const outputKatex = document.getElementById('output-katex');
const formatSelect = document.getElementById('format-select');
const noteMode = document.getElementById('note-mode');
const btnCopy = document.getElementById('btn-copy');
const previewContent = document.getElementById('preview-content');
const boldHeader = document.getElementById('bold-header');
const boldFirstCol = document.getElementById('bold-first-col');
const tableSize = document.getElementById('table-size');
const textStyle = document.getElementById('text-style');
const lineSpacing = document.getElementById('line-spacing');
const spacingValue = document.getElementById('spacing-value');
const alignAll = document.getElementById('align-all');
const columnAlignments = document.getElementById('column-alignments');

// 状態
let parsedTable = [];
let columnCount = 0;
let columnAligns = [];

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// イベントリスナーの設定
function setupEventListeners() {
    btnCopy.addEventListener('click', copyToClipboard);

    lineSpacing.addEventListener('input', () => {
        spacingValue.textContent = parseFloat(lineSpacing.value).toFixed(2);
        if (parsedTable.length > 0) {
            generateKatex();
        }
    });

    // 設定変更時に再生成
    [boldHeader, boldFirstCol, tableSize, textStyle, noteMode].forEach(el => {
        el.addEventListener('change', () => {
            if (parsedTable.length > 0) {
                generateKatex();
            }
        });
    });

    // すべての列の配置を変更
    alignAll.addEventListener('change', () => {
        if (alignAll.value) {
            columnAligns = columnAligns.map(() => alignAll.value);
            updateColumnAlignmentUI();
            if (parsedTable.length > 0) {
                generateKatex();
            }
        }
    });

    // 入力時に自動変換
    inputTable.addEventListener('input', debounce(() => {
        if (inputTable.value.trim()) {
            convertTable();
        } else {
            // 入力が空の場合、出力とプレビューをクリア
            outputKatex.value = '';
            previewContent.innerHTML = '';
            parsedTable = [];
            columnAligns = [];
            columnAlignments.innerHTML = '';
        }
    }, 300));
}

// クリップボードから貼り付け
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        inputTable.value = text;
        convertTable();
    } catch (err) {
        showToast('クリップボードからの読み取りに失敗しました');
    }
}

// テーブル変換
function convertTable() {
    const input = inputTable.value.trim();
    if (!input) {
        outputKatex.value = '';
        previewContent.innerHTML = '';
        return;
    }

    const format = formatSelect.value === 'auto' ? detectFormat(input) : formatSelect.value;
    parsedTable = parseTable(input, format);

    if (parsedTable.length === 0) {
        showToast('テーブルを解析できませんでした');
        return;
    }

    columnCount = Math.max(...parsedTable.map(row => row.length));

    // 列配置の初期化
    if (columnAligns.length !== columnCount) {
        columnAligns = Array(columnCount).fill('l');
        createColumnAlignmentUI();
    }

    generateKatex();
}

// 形式を自動検出
function detectFormat(input) {
    const lines = input.split('\n').filter(line => line.trim());

    // Markdown形式の検出（|で区切られている）
    if (lines.some(line => line.includes('|'))) {
        return 'markdown';
    }

    // TSV形式の検出（タブ文字を含む）
    if (lines.some(line => line.includes('\t'))) {
        return 'tsv';
    }

    // CSV形式の検出（カンマを含む）
    if (lines.some(line => line.includes(','))) {
        return 'csv';
    }

    // デフォルトはスペース区切り
    return 'space';
}

// テーブルをパース
function parseTable(input, format) {
    const lines = input.split('\n').filter(line => line.trim());

    switch (format) {
        case 'markdown':
            return parseMarkdown(lines);
        case 'csv':
            return parseCSV(lines);
        case 'tsv':
            return parseTSV(lines);
        case 'space':
            return parseSpace(lines);
        default:
            return parseMarkdown(lines);
    }
}

// Markdown形式のパース
function parseMarkdown(lines) {
    const result = [];

    for (const line of lines) {
        // セパレータ行（---）をスキップ
        if (/^\|?\s*[-:]+\s*\|/.test(line) || /^\s*[-:|\s]+\s*$/.test(line)) {
            // 配置情報を抽出
            const alignMatch = line.match(/[-:]+/g);
            if (alignMatch) {
                alignMatch.forEach((align, i) => {
                    if (i < columnAligns.length) {
                        if (align.startsWith(':') && align.endsWith(':')) {
                            columnAligns[i] = 'c';
                        } else if (align.endsWith(':')) {
                            columnAligns[i] = 'r';
                        } else {
                            columnAligns[i] = 'l';
                        }
                    }
                });
            }
            continue;
        }

        // 行をパース
        let cells = line.split('|')
            .map(cell => cell.trim())
            .filter((cell, index, arr) => {
                // 先頭と末尾の空文字を除去
                if (index === 0 && cell === '') return false;
                if (index === arr.length - 1 && cell === '') return false;
                return true;
            });

        if (cells.length > 0) {
            result.push(cells);
        }
    }

    return result;
}

// CSV形式のパース
function parseCSV(lines) {
    return lines.map(line => {
        const cells = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                cells.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        cells.push(current.trim());

        return cells;
    });
}

// TSV形式のパース
function parseTSV(lines) {
    return lines.map(line => line.split('\t').map(cell => cell.trim()));
}

// スペース区切りのパース
function parseSpace(lines) {
    return lines.map(line => line.split(/\s{2,}/).map(cell => cell.trim()));
}

// KaTeXコードを生成
function generateKatex() {
    const isBoldHeader = boldHeader.checked;
    const isBoldFirstCol = boldFirstCol.checked;
    const size = tableSize.value;
    const style = textStyle.value;
    const spacing = lineSpacing.value;
    const useNoteMode = noteMode.checked;

    // サイズコマンド
    let sizeCmd = '';
    switch (size) {
        case 'small':
            sizeCmd = '\\small';
            break;
        case 'large':
            sizeCmd = '\\large';
            break;
        default:
            sizeCmd = '';
    }

    // 列配置文字列
    const alignStr = columnAligns.map(a => `|${a}`).join('') + '|';

    // テーブル本体を生成
    let tableBody = '';

    parsedTable.forEach((row, rowIndex) => {
        const isHeader = rowIndex === 0 && isBoldHeader;

        const cells = row.map((cell, colIndex) => {
            let content = escapeLatex(cell);
            const isFirstCol = colIndex === 0 && isBoldFirstCol;

            // テキストスタイルを適用
            if (style === 'sans') {
                if (isHeader || isFirstCol) {
                    content = `\\textsf{\\textbf{${content}}}`;
                } else {
                    content = `\\textsf{${content}}`;
                }
            } else {
                if (isHeader || isFirstCol) {
                    content = `\\textbf{${content}}`;
                }
            }

            return content;
        });

        // 列数を揃える
        while (cells.length < columnCount) {
            cells.push('');
        }

        tableBody += '  ' + cells.join(' & ');
        tableBody += ' \\\\\\\\ \\hline\n';
    });

    // KaTeXコードを組み立て
    let katex = '';

    if (useNoteMode) {
        katex = '$$\n';
    }

    if (sizeCmd) {
        katex += `${sizeCmd} `;
    }

    katex += `\\def\\arraystretch{${spacing}}\n`;
    katex += `\\begin{array}{${alignStr}} \\hline\n`;
    katex += tableBody;
    katex += '\\end{array}';

    if (useNoteMode) {
        katex += '\n$$';
    }

    outputKatex.value = katex;
    renderPreview(katex);
}

// LaTeX特殊文字をエスケープ
function escapeLatex(text) {
    // LaTeX特殊文字をエスケープ（Markdown処理の前に行う）
    text = text.replace(/\\/g, '\\textbackslash{}');
    text = text.replace(/&/g, '\\&');
    text = text.replace(/%/g, '\\%');
    text = text.replace(/\$/g, '\\$');
    text = text.replace(/#/g, '\\#');
    text = text.replace(/\{/g, '\\{');
    text = text.replace(/\}/g, '\\}');
    text = text.replace(/~/g, '\\textasciitilde{}');
    text = text.replace(/\^/g, '\\textasciicircum{}');

    // Markdownの強調記号を変換（**text** → \textbf{text}）
    text = text.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
    text = text.replace(/__([^_]+)__/g, '\\textbf{$1}');

    // 残った単独の*や_を処理
    text = text.replace(/\*/g, '');
    text = text.replace(/_/g, '\\_');

    return text;
}

// プレビューをレンダリング
function renderPreview(katexCode) {
    try {
        // $$を除去
        let code = katexCode.replace(/^\$\$\n?/, '').replace(/\n?\$\$$/, '');

        // KaTeXでサポートされていないコマンドを除去/変換
        // \def\arraystretch{...} を除去
        code = code.replace(/\\def\\arraystretch\{[^}]*\}\n?/g, '');

        // \small, \large などのサイズコマンドを除去（KaTeXでは動作しない場合がある）
        code = code.replace(/\\small\s*/g, '');
        code = code.replace(/\\large\s*/g, '');

        katex.render(code, previewContent, {
            throwOnError: false,
            displayMode: true,
            trust: true,
            strict: false
        });

        // CSSでサイズと行間を適用
        applyPreviewStyles();
    } catch (err) {
        previewContent.innerHTML = `<span style="color: red;">プレビューエラー: ${err.message}</span>`;
    }
}

// プレビューにスタイルを適用
function applyPreviewStyles() {
    const size = tableSize.value;

    // サイズ設定のみ適用（行間はKaTeXでサポートされないため省略）
    let scale = 1;
    switch (size) {
        case 'small':
            scale = 0.85;
            break;
        case 'large':
            scale = 1.2;
            break;
        default:
            scale = 1;
    }

    const katexElement = previewContent.querySelector('.katex');
    if (katexElement) {
        katexElement.style.transform = `scale(${scale})`;
        katexElement.style.transformOrigin = 'top left';
    }
}

// クリップボードにコピー
async function copyToClipboard() {
    let text = outputKatex.value;

    if (!text) {
        showToast('コピーするテキストがありません');
        return;
    }

    // noteで使用する場合、特殊処理を行う
    if (noteMode.checked) {
        text = convertForNote(text);
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast('コピーしました！');
    } catch (err) {
        // フォールバック
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('コピーしました！');
    }
}

// note.com用にテキストを変換
function convertForNote(text) {
    // 改行を削除して1行にする（$$の間の改行のみ保持）
    let lines = text.split('\n');
    let result = '';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === '$$') {
            result += line + '\n';
        } else if (line) {
            result += line + ' ';
        }
    }

    // 末尾の$$の前のスペースを削除
    result = result.replace(/ \$\$$/, '\n$$');

    return result.trim();
}

// 列配置UIを作成
function createColumnAlignmentUI() {
    columnAlignments.innerHTML = '';

    for (let i = 0; i < columnCount; i++) {
        const div = document.createElement('div');
        div.className = 'align-control';

        const label = document.createElement('label');
        label.textContent = `列${i + 1}`;

        const select = document.createElement('select');
        select.id = `align-col-${i}`;
        select.innerHTML = `
            <option value="l" ${columnAligns[i] === 'l' ? 'selected' : ''}>左揃え</option>
            <option value="c" ${columnAligns[i] === 'c' ? 'selected' : ''}>中央揃え</option>
            <option value="r" ${columnAligns[i] === 'r' ? 'selected' : ''}>右揃え</option>
        `;

        select.addEventListener('change', () => {
            columnAligns[i] = select.value;
            generateKatex();
        });

        div.appendChild(label);
        div.appendChild(select);
        columnAlignments.appendChild(div);
    }
}

// 列配置UIを更新
function updateColumnAlignmentUI() {
    for (let i = 0; i < columnCount; i++) {
        const select = document.getElementById(`align-col-${i}`);
        if (select) {
            select.value = columnAligns[i];
        }
    }
}

// トースト通知を表示
function showToast(message) {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2000);
}

// デバウンス関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
