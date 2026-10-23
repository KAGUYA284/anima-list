const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');

/** 便携版的数据随程序目录保存，正式版重新部署时由发布脚本清空。 */
function configureDataProfile(app, executablePath = process.execPath) {
    const programDirectory = path.dirname(executablePath);
    const cacheTest = existsSync(path.join(programDirectory, '.anima-list-cache-test'));
    const portable = existsSync(path.join(programDirectory, '.anima-list-portable'));
    if (!cacheTest && !portable) return 'installed';

    const directory = cacheTest
        ? path.join(programDirectory, 'test-user-data')
        : path.join(programDirectory, 'portable-user-data');
    mkdirSync(directory, { recursive: true });
    app.setPath('userData', directory);
    app.setPath('sessionData', directory);
    return cacheTest ? 'cache-test' : 'portable';
}

module.exports = { configureDataProfile };
