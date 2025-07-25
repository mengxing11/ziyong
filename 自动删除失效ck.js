//by萌欣
//需要配置QINGLONG_URL和DELETE_VARS这2个变量
//QINGLONG_URL填写你青龙面板的ip+端口
//DELETE_VARS配置需要删除的变量名称，如JD_COOKIE,elmck,mtck等等，多个变量名称用英文逗号隔开
//不配置DELETE_VARS默认只删除只删除名称完全等于JD_COOKIE的变量
//新增：支持在JD_COOKIE的备注中通过"白名单"标记保留账号
//无论是否自定义变量名，备注中带有"白名单"的JD_COOKIE账号不会被删除

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const QINGLONG_URL = process.env.QINGLONG_URL || 'http://127.0.0.1:5700';

// 获取青龙面板的Token
function getToken() {
    // 保持原有逻辑不变...
}

// 获取所有环境变量
async function getEnvs(token) {
    // 保持原有逻辑不变...
}

// 删除指定环境变量
async function deleteEnv(envId, token) {
    // 保持原有逻辑不变...
}

// === 新增：从备注中提取白名单账号 ===
function extractWhitelistPinsFromRemarks(remarks) {
    if (!remarks) return [];
    
    // 按行分割备注，每行格式可能为："pin1: 白名单" 或 "pin1（白名单）"
    const lines = remarks.split(/[\n\r]+/);
    
    // 提取所有包含"白名单"的行中的pt_pin
    return lines
        .filter(line => line.includes('白名单'))
        .map(line => {
            // 尝试匹配格式："pin1: 白名单" 或 "pin1（白名单）"
            const pinMatch = line.match(/([^:：\s（(]+)/);
            return pinMatch ? pinMatch[1].trim() : null;
        })
        .filter(Boolean); // 过滤无效值
}
// =====================================

(async () => {
    try {
        const token = getToken();
        console.log('成功获取Token');

        const envs = await getEnvs(token);
        if (envs.length === 0) {
            console.log('未获取到任何环境变量');
            return;
        }

        // === 修改：处理JD_COOKIE备注中的白名单 ===
        let envsToDelete = [];
        let jdCookieWhitelist = [];
        
        // 查找JD_COOKIE变量并解析白名单
        const jdCookieEnv = envs.find(env => env.name === 'JD_COOKIE');
        if (jdCookieEnv && jdCookieEnv.remarks) {
            jdCookieWhitelist = extractWhitelistPinsFromRemarks(jdCookieEnv.remarks);
            if (jdCookieWhitelist.length > 0) {
                console.log(`从JD_COOKIE备注中解析出${jdCookieWhitelist.length}个白名单账号：`, jdCookieWhitelist);
            }
        }

        if (process.env.DELETE_VARS) {
            const deleteNames = process.env.DELETE_VARS.split(',').map(name => name.trim());
            envsToDelete = envs.filter(env => {
                // 特殊处理JD_COOKIE：如果备注中有白名单账号，则跳过删除
                if (env.name === 'JD_COOKIE' && jdCookieWhitelist.length > 0) {
                    // 检查JD_COOKIE的值是否包含白名单账号
                    const containsWhitelist = jdCookieWhitelist.some(pin => 
                        env.value.includes(`pt_pin=${pin};`)
                    );
                    return !containsWhitelist && env.status === 1;
                }
                
                // 其他变量按原逻辑处理
                return deleteNames.includes(env.name) && env.status === 1;
            });
            console.log(`根据DELETE_VARS，找到${envsToDelete.length}个符合条件的环境变量`);
        } else {
            envsToDelete = envs.filter(env => {
                // 特殊处理JD_COOKIE：如果备注中有白名单账号，则跳过删除
                if (env.name === 'JD_COOKIE' && jdCookieWhitelist.length > 0) {
                    const containsWhitelist = jdCookieWhitelist.some(pin => 
                        env.value.includes(`pt_pin=${pin};`)
                    );
                    return !containsWhitelist && env.status === 1;
                }
                
                // 默认只删除JD_COOKIE且禁用的变量
                return env.name === 'JD_COOKIE' && env.status === 1;
            });
            console.log(`未设置DELETE_VARS，默认找到${envsToDelete.length}个名称为JD_COOKIE且禁用的环境变量`);
        }
        // ======================================

        if (envsToDelete.length === 0) {
            console.log('没有需要删除的环境变量');
            return;
        }

        for (const env of envsToDelete) {
            const envId = env.id;
            if (!envId) {
                console.warn(`环境变量${env.name}缺少标识ID，跳过删除`);
                continue;
            }
            console.log(`正在删除环境变量：${env.name}（ID: ${envId}）`);
            await deleteEnv(envId, token);
            console.log(`成功删除：${env.name}`);
        }

        console.log('所有指定的环境变量已删除完成');
    } catch (error) {
        console.error('执行失败：', error.message);
    }
})();
