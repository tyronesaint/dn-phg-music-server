import { Application } from "./app.ts";
import { ScriptEngine } from "./engine/script_engine.ts";
import { ScriptStorage } from "./storage/storage.ts";
import { APIRoutes } from "./routes/api.ts";
import { RequestHandler } from "./handler/request_handler.ts";

const app = new Application();
const storage = new ScriptStorage();
const engine = new ScriptEngine(storage);
const handler = new RequestHandler(engine, storage);

new APIRoutes(app, handler, storage, engine);

await storage.ready();

const port = Deno.env.get("PORT") || 8080;

console.log(`服务器运行在 http://localhost:${port}`);

const scripts = await storage.getAllScripts();
console.log(`找到 ${scripts.length} 个脚本，开始异步加载...`);

Promise.all(scripts.map(async (script) => {
    try {
        await engine.loadScript(script);
        console.log(`✓ 脚本加载成功: ${script.name}`);
    } catch (error) {
        console.error(`✗ 脚本加载失败: ${script.name}`, error);
    }
})).then(() => {
    console.log('所有脚本加载完成');
}).catch((error) => {
    console.error('脚本加载过程中发生错误:', error);
});

try {
    await app.listen({ port: Number(port) });
} catch (error) {
    console.error(`服务器启动失败:`, error);
}
