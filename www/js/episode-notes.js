import { getAnimeById, updateAnime } from './store.js';

/** 将保存的 UTC 时间转为 datetime-local 使用的本地时间。 */
export function watchedAtToLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToWatchedAt(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || watchedAtToLocalInput(date.toISOString()) !== value) return '';
    return date.toISOString();
}

function resizeNote(input) {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
}

/** 原地保存单集记录，不重绘详情，保留输入焦点和页面位置。 */
export function attachEpisodeNotes(container, animeId, { jumpButton } = {}) {
    if (!container) return;
    const resizeAll = () => container.querySelectorAll('.ep-note-input').forEach(resizeNote);
    const section = container.closest('details');
    section?.addEventListener('toggle', () => {
        if (section.open) resizeAll();
    });
    jumpButton?.addEventListener('click', () => {
        const currentEpisode = getAnimeById(animeId)?.currentEpisode || 0;
        const target = container.querySelector(`[data-ep="${currentEpisode}"]`);
        if (!target) return;
        if (section) section.open = true;
        const jump = () => {
            resizeAll();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(jump);
        else jump();
    });
    container.querySelectorAll('[data-ep]').forEach(item => {
        const episode = Number(item.dataset.ep);
        const input = item.querySelector('.ep-note-input');
        const timeInput = item.querySelector('[data-episode-watched-at]');
        const timeHint = item.querySelector('.ep-watched-at-hint');
        const save = (changes = {}) => {
            const current = getAnimeById(animeId);
            if (!current) return false;
            const episodeNotes = { ...current.episodeNotes };
            const previous = episodeNotes[episode] || {};
            const record = { ...previous, note: input.value.trim(), rating: previous.rating || 0, ...changes };
            if (record.note || record.rating || record.watchedAt) episodeNotes[episode] = record;
            else delete episodeNotes[episode];
            if (!updateAnime(animeId, { episodeNotes }, { render: false })) return false;
            item.classList.toggle('episode-done', Boolean(record.note || record.rating || record.watchedAt));
            return true;
        };
        input.addEventListener('input', () => {
            resizeNote(input);
            save();
        });
        timeInput?.addEventListener('change', () => {
            const watchedAt = localInputToWatchedAt(timeInput.value);
            if (timeInput.value && !watchedAt) {
                timeInput.setCustomValidity('请输入有效的观看日期和时间');
                timeInput.reportValidity();
                return;
            }
            timeInput.setCustomValidity('');
            if (save({ watchedAt }) && timeHint) timeHint.textContent = watchedAt ? '' : '待补充';
        });
        item.querySelectorAll('[data-episode-rating]').forEach(star => {
            star.addEventListener('click', () => {
                const selected = Number(star.dataset.episodeRating);
                const previous = getAnimeById(animeId)?.episodeNotes?.[episode]?.rating || 0;
                const rating = selected === previous ? 0 : selected;
                if (!save({ rating })) return;
                item.querySelectorAll('[data-episode-rating]').forEach(button => {
                    const value = Number(button.dataset.episodeRating);
                    button.classList.toggle('filled', value <= rating);
                    button.classList.toggle('empty', value > rating);
                    button.setAttribute('aria-pressed', String(value === rating));
                });
            });
        });
    });
    resizeAll();
    // 屏幕旋转或窗口变宽后，按新的换行宽度重新计算。
    if (typeof ResizeObserver !== 'undefined') {
        let width = container.clientWidth;
        const observer = new ResizeObserver(() => {
            if (!container.isConnected) {
                observer.disconnect();
                return;
            }
            if (container.clientWidth !== width) {
                width = container.clientWidth;
                resizeAll();
            }
        });
        observer.observe(container);
    }
}
