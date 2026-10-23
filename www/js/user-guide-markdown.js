import { escHtml } from './utils.js';

function inline(text) {
    const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
        html += escHtml(text.slice(cursor, match.index));
        html += match[1] !== undefined ? `<code>${escHtml(match[1])}</code>` : `<strong>${escHtml(match[2])}</strong>`;
        cursor = match.index + match[0].length;
    }
    return html + escHtml(text.slice(cursor));
}

/** 内置说明只使用标题、段落、列表、表格及行内强调，不执行原始 HTML。 */
export function renderUserGuideMarkdown(markdown) {
    const lines = String(markdown).replace(/\r/g, '').split('\n');
    const body = [];
    const chapters = [];
    let headingIndex = 0;
    let index = 0;
    const isTable = line => /^\s*\|/.test(line || '');
    const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    while (index < lines.length) {
        const line = lines[index].trim();
        if (!line) { index += 1; continue; }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            index += 1;
            if (heading[1] === '#') continue; // 弹窗标题已显示文档名称。
            const id = `user-guide-section-${++headingIndex}`;
            const level = heading[1].length;
            body.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
            if (level === 2) chapters.push({ id, title: heading[2] });
            continue;
        }
        if (isTable(line) && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[index + 1] || '')) {
            const head = cells(line).map(cell => `<th scope="col">${inline(cell)}</th>`).join('');
            index += 2;
            const rows = [];
            while (isTable(lines[index])) {
                rows.push(`<tr>${cells(lines[index]).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`);
                index += 1;
            }
            body.push(`<div class="user-guide-table"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
            continue;
        }
        const list = line.match(/^(?:([-*])|\d+\.)\s+(.+)$/);
        if (list) {
            const tag = list[1] ? 'ul' : 'ol';
            const pattern = list[1] ? /^[-*]\s+(.+)$/ : /^\d+\.\s+(.+)$/;
            const items = [];
            while (index < lines.length) {
                const item = lines[index].trim().match(pattern);
                if (!item) break;
                items.push(`<li>${inline(item[1])}</li>`);
                index += 1;
            }
            body.push(`<${tag}>${items.join('')}</${tag}>`);
            continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim()) {
            if (paragraph.length && /^(?:#{1,3}\s|[-*]\s|\d+\.\s|\|)/.test(lines[index].trim())) break;
            paragraph.push(lines[index].trim());
            index += 1;
        }
        body.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
    const directory = `<details class="user-guide-toc"><summary>目录（点击展开）</summary><nav aria-label="使用说明目录"><ol>${chapters.map(chapter => `<li><button type="button" data-guide-target="${chapter.id}">${escHtml(chapter.title)}</button></li>`).join('')}</ol></nav></details>`;
    return { body: body.join('\n'), directory };
}
