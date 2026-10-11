import { describe, expect, it } from 'vitest';
import { markdownToPlain, renderMarkdown, toggleTask } from './markdown';

const IMAGE = '/api/v1/images/0b0e6c5e-8a3e-4c1b-9f50-1d2b3c4d5e6f';

describe('renderMarkdown', () => {
  it('renders GFM tables, task lists and code', () => {
    const html = renderMarkdown('| Позиция | Цена |\n|---|---|\n| Мат | 2450 |\n\n- [x] КП\n- [ ] скидка\n\n```\nconst a = 1;\n```');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>2450</td>');
    expect(html).toMatch(/<input[^>]*checked[^>]*data-task-index="0"|<input[^>]*data-task-index="0"[^>]*checked/);
    expect(html).toContain('data-task-index="1"');
    expect(html.match(/disabled/g)).toHaveLength(2);
    expect(html).toContain('<pre><code>const a = 1;');
  });

  it('formats bold, italic, strikethrough, headings, quotes and links', () => {
    const html = renderMarkdown('# Итог\n\n**жирный** *курсив* ~~зачёркнут~~\n\n> цитата\n\n[сайт](https://rdim.ua)');
    expect(html).toContain('<h1>Итог</h1>');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).toContain('<em>курсив</em>');
    expect(html).toContain('<del>зачёркнут</del>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<a href="https://rdim.ua" target="_blank" rel="noopener noreferrer">сайт</a>');
  });

  it('escapes raw HTML and drops javascript: links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [клик](javascript:alert(1)) <script>alert(2)</script>');
    const box = document.createElement('div');
    box.innerHTML = html;
    expect(box.querySelector('img, script, [onerror]')).toBeNull();
    expect(box.querySelector('a')).toBeNull();
    expect(box.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('клик');
  });

  it('keeps only Atlas image URLs', () => {
    expect(renderMarkdown(`![прайс](${IMAGE})`)).toContain(`<img src="${IMAGE}" alt="прайс">`);
    const external = renderMarkdown('![чужое](https://evil.example/x.png)');
    expect(external).not.toContain('<img');
    expect(external).toContain('чужое');
  });

  it('keeps line breaks and auto-links URLs', () => {
    const html = renderMarkdown('строка 1\nстрока 2 https://rdim.ua');
    expect(html).toContain('<br>');
    expect(html).toContain('href="https://rdim.ua"');
  });
});

describe('markdownToPlain', () => {
  it('strips formatting marks, checkboxes and images', () => {
    expect(markdownToPlain('**Итог:**\n- [x] КП')).toBe('Итог: КП');
    expect(markdownToPlain(`см. ![скрин](${IMAGE})`)).toBe('см. [изображение]');
    expect(markdownToPlain('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a b 1 2');
  });
});

describe('toggleTask', () => {
  it('flips only the Nth item outside code fences', () => {
    const source = '- [ ] один\n```\n- [ ] в коде\n```\n> - [x] в цитате\n1. [ ] три';
    expect(toggleTask(source, 0)).toBe(source.replace('- [ ] один', '- [x] один'));
    expect(toggleTask(source, 1)).toBe(source.replace('> - [x] в цитате', '> - [ ] в цитате'));
    expect(toggleTask(source, 2)).toBe(source.replace('1. [ ] три', '1. [x] три'));
    expect(toggleTask(source, 3)).toBe(source);
  });

  it('counts items in the same order as the rendered checkboxes', () => {
    const source = '- [ ] a\n```\n- [ ] code\n```\n- [x] b';
    const html = renderMarkdown(source);
    expect(html.match(/data-task-index/g)).toHaveLength(2);
    expect(toggleTask(source, 1)).toContain('- [ ] b');
  });
});
