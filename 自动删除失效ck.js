const axios = require('axios');
const fs = require('fs');
const path = require('path');

const QINGLONG_URL = process.env.QINGLONG_URL || 'http://127.0.0.1:5700';
//by萌欣
//需要配置QINGLONG_URL和DELETE_VARS这2个变量
//QINGLONG_URL填写你青龙面板的ip+端口
//DELETE_VARS配置需要删除的变量名称，如JD_COOKIE,elmck,mtck等等，多个变量名称用英文逗号隔开
//不配置DELETE_VARS默认只删除只删除名称完全等于JD_COOKIE的变量
//新增：支持在JD_COOKIE的备注中通过"白名单"标记保留账号
//无论是否自定义变量名，备注中带有"白名单"的JD_COOKIE账号不会被删除

// 获取青龙面板的Token
function getToken() {
    const authFilePath = path.join(__dirname, '..', 'config', 'auth.json');
    if (!fs.existsSync(authFilePath)) {
        throw new Error(`未找到auth.json文件，路径：${authFilePath}`);
    }
    const authFile = fs.readFileSync(authFilePath, 'utf-8');
    const authData = JSON.parse(authFile);
    if (!authData.token) {
        throw new Error('auth.json中未找到有效的token');
    }
    return authData.token;
}

// 获取所有环境变量
async function getEnvs(token) {
    try {
        const response = await axios.get(`${QINGLONG_URL}/open/envs`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // 增加对返回数据结构的检查
        if (!response.data || !Array.isArray(response.data.data)) {
            console.error('获取的环境变量格式不符合预期：', response.data);
            return [];
        }
        
        console.log('获取到的所有环境变量：', JSON.stringify(response.data, null, 2));
        return response.data.data;
    } catch (error) {
        throw new Error(`获取环境变量失败：${error.message}。当前青龙地址：${QINGLONG_URL}，请检查地址是否正确或服务是否启动`);
    }
}

// 删除指定环境变量
async function deleteEnv(envId, token) {
    try {
        const response = await axios.delete(`${QINGLONG_URL}/open/envs`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: [envId]
        });
        return response.data;
    } catch (error) {
        throw new Error(`删除环境变量（ID: ${envId}）失败：${error.message}`);
    }
}

// 从备注中提取白名单账号
function extractWhitelistPinsFromRemarks(remarks) {
    if (!remarks) return [];
    
    const lines = remarks.split(/[\n\r]+/);
    return lines
        .filter(line => line.includes('白名单'))
        .map(line => {
            const pinMatch = line.match(/([^:：\s（(]+)/);
            return pinMatch ? pinMatch[1].trim() : null;
        })
        .filter(Boolean);
}

(async () => {
    try {
        const token = getToken();
        console.log('成功获取Token');

        const envs = await getEnvs(token);
        if (envs.length === 0) {
            console.log('未获取到任何环境变量');
            return;
        }

        // === 修复：增加对jdCookieEnv和remarks的检查 ===
        let envsToDelete = [];
        let jdCookieWhitelist = [];
        
        const jdCookieEnv = envs.find(env => env.name === 'JD_COOKIE');
        if (jdCookieEnv && jdCookieEnv.remarks) {
            jdCookieWhitelist = extractWhitelistPinsFromRemarks(jdCookieEnv.remarks);
            if (jdCookieWhitelist.length > 0) {
                console.log(`从JD_COOKIE备注中解析出${jdCookieWhitelist.length}个白名单账号：`, jdCookieWhitelist);
            }
        } else {
            console.log('未找到JD_COOKIE环境变量或其备注为空，不启用白名单过滤');
        }
        // ==============================================

        if (process.env.DELETE_VARS) {
            const deleteNames = process.env.DELETE_VARS.split(',').map(name => name.trim());
            envsToDelete = envs.filter(env => {
                if (env.name === 'JD_COOKIE' && jdCookieWhitelist.length > 0) {
                    const containsWhitelist = jdCookieWhitelist.some(pin => 
                        env.value.includes(`pt_pin=${pin};`)
                    );
                    return !containsWhitelist && env.status === 1;
                }
                return deleteNames.includes(env.name) && env.status === 1;
            });
            console.log(`根据DELETE_VARS，找到${envsToDelete.length}个符合条件的环境变量`);
        } else {
            envsToDelete = envs.filter(env => {
                if (env.name === 'JD_COOKIE' && jdCookieWhitelist.length > 0) {
                    const containsWhitelist = jdCookieWhitelist.some(pin => 
                        env.value.includes(`pt_pin=${pin};`)
                    );
                    return !containsWhitelist && env.status === 1;
                }
                return env.name === 'JD_COOKIE' && env.status === 1;
            });
            console.log(`未设置DELETE_VARS，默认找到${envsToDelete.length}个名称为JD_COOKIE且禁用的环境变量`);
        }

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
