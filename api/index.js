const fs = require("fs");
const os = require("os");
const path = require("path");

const sourceDataDirectory = path.join(__dirname, "..", "data");
const runtimeDataDirectory = path.join(os.tmpdir(), "personal-dashboard-data");

function prepareRuntimeData() {
    fs.mkdirSync(runtimeDataDirectory, { recursive: true });

    for (const entry of fs.readdirSync(sourceDataDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name) !== ".json") continue;

        const sourceFile = path.join(sourceDataDirectory, entry.name);
        const runtimeFile = path.join(runtimeDataDirectory, entry.name);
        if (!fs.existsSync(runtimeFile)) fs.copyFileSync(sourceFile, runtimeFile);
    }
}

prepareRuntimeData();
process.env.DASHBOARD_DATA_DIR = runtimeDataDirectory;

module.exports = require("../app");
