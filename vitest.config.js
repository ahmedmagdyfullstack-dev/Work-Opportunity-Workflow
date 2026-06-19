"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const unplugin_swc_1 = __importDefault(require("unplugin-swc"));
exports.default = (0, config_1.defineConfig)({
    plugins: [unplugin_swc_1.default.vite()],
    test: {
        testTimeout: 15_000,
        hookTimeout: 15_000,
        fileParallelism: false
    }
});
//# sourceMappingURL=vitest.config.js.map