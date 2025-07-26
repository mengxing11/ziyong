//by萌欣
//需要配置QINGLONG_URL和DELETE_VARS这2个变量
//QINGLONG_URL填写你青龙面板的ip+端口
//DELETE_VARS配置需要删除的变量名称，如JD_COOKIE,elmck,mtck等等，多个变量名称用英文逗号隔开
//不配置DELETE_VARS默认只删除只删除名称完全等于JD_COOKIE的变量
//无论是否自定义变量名未禁用的变量不会被删除。
//新增功能：支持通过JD_COOKIE_WHITELIST配置白名单，白名单中的JD_COOKIE即使禁用也不会被删除
//JD_COOKIE_WHITELIST支持填写pt_pin或完整的Cookie值，多个值用英文逗号分隔
//新增功能：保护DELETE_VARS和JD_COOKIE_WHITELIST等重要配置变量不被误删

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const QINGLONG_URL = process.env.QINGLONG_URL || 'http://127.0.0.1:5700';

// 获取青龙面板的Token
function getToken() {
    const authFilePath = path.join(__dirname, '..', '..', 'config', 'auth.json');
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
        console.log('获取到的所有环境变量：', JSON.stringify(response.data, null, 2));
        return response.data.data || [];
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

// 检查JD_COOKIE是否在白名单中
function isInJdCookieWhitelist(envValue) {
    if (!envValue || !process.env.JD_COOKIE_WHITELIST) {
        return false;
    }
    
    const whitelist = process.env.JD_COOKIE_WHITELIST.split(',').map(item => item.trim());
    if (whitelist.length === 0) {
        return false;
    }
    
    // 从Cookie值中提取pt_pin
    const ptPinMatch = envValue.match(/pt_pin=([^;]+)/);
    const ptPin = ptPinMatch ? ptPinMatch[1] : null;
    
    // 检查pt_pin或完整Cookie是否在白名单中
    return ptPin ? whitelist.includes(ptPin) : whitelist.includes(envValue);
}

// 检查变量是否在全局白名单中（保护重要配置变量）
function isInGlobalWhitelist(envName) {
    // 保护的变量列表，可根据需要添加更多
    const protectedVars = ['DELETE_VARS', 'JD_COOKIE_WHITELIST', 'QINGLONG_URL'];
    return protectedVars.includes(envName);
}

// 检查变量是否应该被保护（综合检查）
function shouldProtect(envName, envValue) {
    // 先检查是否是全局保护的变量名
    if (isInGlobalWhitelist(envName)) {
        console.log(`变量 ${envName} 受全局白名单保护，不会被删除`);
        return true;
    }
    
    // 再检查是否是JD_COOKIE且在JD_COOKIE白名单中
    if (envName === 'JD_COOKIE') {
        const isWhitelisted = isInJdCookieWhitelist(envValue);
        if (isWhitelisted) {
            console.log(`JD_COOKIE (pt_pin=${extractPtPin(envValue)}) 受白名单保护，不会被删除`);
        }
        return isWhitelisted;
    }
    
    return false;
}

// 辅助函数：提取pt_pin用于日志输出
function extractPtPin(cookieValue) {
    const ptPinMatch = cookieValue.match(/pt_pin=([^;]+)/);
    return ptPinMatch ? ptPinMatch[1] : 'unknown';
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

        // 筛选需要删除的环境变量
        let envsToDelete = [];
        
        if (process.env.DELETE_VARS) {
            // 若设置了DELETE_VARS，则按列表删除
            const deleteNames = process.env.DELETE_VARS.split(',').map(name => name.trim());
            envsToDelete = envs.filter(env => 
                deleteNames.includes(env.name) && 
                env.status === 1 &&
                !shouldProtect(env.name, env.value)
            );
            console.log(`根据DELETE_VARS，找到${envsToDelete.length}个符合条件的环境变量`);
        } else {
            // 若未设置DELETE_VARS，默认只删除名称为JD_COOKIE且禁用的变量
            envsToDelete = envs.filter(env => 
                env.name === 'JD_COOKIE' && 
                env.status === 1 &&
                !shouldProtect(env.name, env.value)
            );
            console.log(`未设置DELETE_VARS，默认找到${envsToDelete.length}个名称为JD_COOKIE且禁用的环境变量`);
        }

        // 输出待删除的变量信息
        if (envsToDelete.length > 0) {
            console.log('\n待删除的环境变量列表：');
            envsToDelete.forEach(env => {
                const ptPin = env.name === 'JD_COOKIE' ? extractPtPin(env.value) : 'N/A';
                console.log(`- ${env.name} (ID: ${env.id}, pt_pin: ${ptPin})`);
            });
            console.log('');
        } else {
            console.log('没有需要删除的环境变量');
            return;
        }

        // 执行删除操作
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
