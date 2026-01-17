import { ScriptStorage } from "./storage/storage.ts";
import { ScriptEngine } from "./engine/script_engine.ts";

async function testStorage() {
  const storage = new ScriptStorage();
  await storage.ready();

  const scripts = await storage.getAllScripts();
  console.log(`📦 存储中的脚本数量: ${scripts.length}`);

  for (const script of scripts) {
    console.log(`📜 脚本: ${script.name} (${script.id})`);
    console.log(`   supportedSources: [${script.supportedSources.join(', ')}]`);
  }

  const loadedScripts = storage.getLoadedScripts();
  console.log(`🎯 getLoadedScripts 返回: ${loadedScripts.length} 个脚本`);

  for (const script of loadedScripts) {
    console.log(`📜 脚本: ${script.name} (${script.id})`);
    console.log(`   supportedSources: [${script.supportedSources.join(', ')}]`);
  }

  const kwScript = loadedScripts.find(script =>
    script.supportedSources.includes("kw")
  );
  console.log(`🔍 查找支持 "kw" 的脚本: ${kwScript ? kwScript.name : '未找到'}`);
}

testStorage().catch(console.error);
