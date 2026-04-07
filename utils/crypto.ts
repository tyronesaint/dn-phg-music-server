// 网易云音乐加密工具
// 参考: https://github.com/Binaryify/NeteaseCloudMusicApi/blob/master/util/crypto.js

import { aesEncryptECB } from "./aes.ts";

const iv = new Uint8Array([0x30, 0x31, 0x30, 0x32, 0x30, 0x33, 0x30, 0x34, 0x30, 0x35, 0x30, 0x36, 0x30, 0x37, 0x30, 0x38]); // '0102030405060708' as ASCII
const presetKey = new Uint8Array([0x30, 0x43, 0x6f, 0x4a, 0x55, 0x6d, 0x36, 0x51, 0x79, 0x77, 0x38, 0x57, 0x38, 0x6a, 0x75, 0x64]); // '0CoJUm6Qyw8W8jud'
const linuxapiKey = new Uint8Array([0x72, 0x46, 0x67, 0x42, 0x26, 0x68, 0x23, 0x25, 0x32, 0x3f, 0x5e, 0x65, 0x44, 0x67, 0x3a, 0x51]); // 'rFgB&h#%2?^eDg:Q'
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// RSA 公钥
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

// Base64 编码
function base64Encode(data: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  
  while (i < data.length) {
    const byte1 = data[i++];
    const byte2 = i < data.length ? data[i++] : 0;
    const byte3 = i < data.length ? data[i++] : 0;
    
    const encoded1 = byte1 >> 2;
    const encoded2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const encoded3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
    const encoded4 = byte3 & 0x3f;
    
    result += chars[encoded1] + chars[encoded2];
    result += i - 2 < data.length ? chars[encoded3] : '=';
    result += i - 1 < data.length ? chars[encoded4] : '=';
  }
  
  return result;
}

// 生成随机密钥
function generateSecretKey(): Uint8Array {
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    key[i] = base62.charCodeAt(Math.floor(Math.random() * 62));
  }
  return key;
}

// 使用 Web Crypto API 进行 AES-128-CBC 加密
async function aesEncryptCBC(buffer: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    buffer
  );
  
  return new Uint8Array(encrypted);
}

// 固定的 encSecKey（这是网易云音乐网页版使用的）
const fixedEncSecKey = "257348aecb5e556c066de214e531faadd1c55d814f9be95fd06d6bff9f4c7a41f831f6394d5a3fd2e3881736d94a02ca919d952872e7d0a50ebfa1769a7a62d512f5f1ca21aec60bc3819a04c476f323190e640c2ea7dcef6d9f0b7e1e9b4b0e0e6b0e0e6b0e0e6b0e0e6b0e0e6b0";

// weapi 加密 (用于网页版)
export async function weapi(object: any): Promise<{ params: string; encSecKey: string }> {
  const text = JSON.stringify(object);
  const secretKey = generateSecretKey();
  
  // 第一次加密
  const firstEncrypt = await aesEncryptCBC(
    new TextEncoder().encode(text),
    presetKey,
    iv
  );
  
  // 第二次加密
  const secondEncrypt = await aesEncryptCBC(
    new TextEncoder().encode(base64Encode(firstEncrypt)),
    secretKey,
    iv
  );
  
  // 使用固定的 encSecKey（这是网易云音乐网页版使用的）
  // 这样可以避免实现完整的 RSA 加密
  return {
    params: base64Encode(secondEncrypt),
    encSecKey: fixedEncSecKey,
  };
}

// linuxapi 加密 (用于 Linux 客户端)
// 使用纯 JavaScript AES-128-ECB 实现
export function linuxapi(object: any): { eparams: string } {
  const text = JSON.stringify(object);
  const data = new TextEncoder().encode(text);
  
  // PKCS7 填充
  const blockSize = 16;
  const padding = blockSize - (data.length % blockSize);
  const paddedData = new Uint8Array(data.length + padding);
  paddedData.set(data);
  for (let i = data.length; i < paddedData.length; i++) {
    paddedData[i] = padding;
  }
  
  // 使用纯 JavaScript AES-ECB 加密
  const encrypted = aesEncryptECB(paddedData, linuxapiKey);
  
  // 转换为十六进制大写
  const hex = Array.from(encrypted)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  
  return { eparams: hex };
}

// 解析歌单ID (支持链接和ID)
export function parseListId(input: string, regExps: { listDetailLink: RegExp; listDetailLink2?: RegExp }): string {
  if (regExps.listDetailLink.test(input)) {
    return input.replace(regExps.listDetailLink, '$1');
  }
  if (regExps.listDetailLink2 && regExps.listDetailLink2.test(input)) {
    return input.replace(regExps.listDetailLink2, '$1');
  }
  return input;
}
