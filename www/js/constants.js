// ============================================================
// 常量定义 - Anime Tracker
// ============================================================

/** 观看状态配置 */
export const STATUS_CONFIG = {
    want: { label: '想看', class: 'status-want' },
    watching: { label: '在看', class: 'status-watching' },
    paused: { label: '搁置', class: 'status-paused' },
    completed: { label: '已看完', class: 'status-completed' },
    dropped: { label: '放弃', class: 'status-dropped' }
};

/** localStorage 键名 */
export const STORAGE_KEY = 'anime-tracker-data';
export const COLLAPSE_KEY = 'anime-tracker-collapse';
export const SETTINGS_KEY = 'anime-tracker-settings';
export const LEGACY_SYNC_DATA_KEY = 'ANIMA_LIST_DATA';
export const LAST_UPDATED_KEY = 'ANIMA_LAST_UPDATED';
export const AUTH_TOKEN_KEY = 'AUTH_TOKEN';
export const LAST_REVISION_KEY = 'ANIMA_LAST_REVISION';
export const LOCAL_DIRTY_KEY = 'ANIMA_LOCAL_DIRTY';
export const DATA_VERSION_KEY = 'ANIMA_DATA_VERSION';
export const LAST_SYNCED_HASH_KEY = 'ANIMA_LAST_SYNCED_HASH';
export const SCHEMA_VERSION = 2;
export const APP_VERSION = '1.3.0';

/** 日本动画季度边界定义（用于番剧按季归类） */
export const QUARTER_BOUNDARIES = {
    '冬': { months: [1, 2, 3], lastWeekDay: 25, next: '春', nextYearOffset: 0 },
    '春': { months: [4, 5, 6], lastWeekDay: 24, next: '夏', nextYearOffset: 0 },
    '夏': { months: [7, 8, 9], lastWeekDay: 24, next: '秋', nextYearOffset: 0 },
    '秋': { months: [10, 11, 12], lastWeekDay: 25, next: '冬', nextYearOffset: 1 }
};

/** 星期映射 */
export const WEEK_DAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 追番/补番类型配置 */
export const TYPE_CONFIG = {
    chasing: { label: '追番', class: 'type-chasing' },
    binge: { label: '补', class: 'type-binge' }
};

/** 季度排序顺序 */
export const QUARTER_ORDER = ['秋', '夏', '春', '冬', ''];
