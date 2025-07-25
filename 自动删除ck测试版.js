//by萌欣
//需要配置QINGLONG_URL和DELETE_VARS这2个变量
//QINGLONG_URL填写你青龙面板的ip+端口

//DELETE_VARS配置需要删除的变量名称，如JD_COOKIE,elmck,mtck等等，多个变量名称用英文逗号隔开

//不配置DELETE_VARS默认只删除只删除名称完全等于JD_COOKIE的变量//无论是否自定义变量名未禁用的变量不会被删除。

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

// 新增辅助函数：判断JD_COOKIE是否包含白名单备注
function isJDCookieWithWhitelist(env) {
    return (
        env.name === 'JD_COOKIE' && 
        env.remarks && 
        env.remarks.includes('白名单')
    );
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

        // === 修改：未设置DELETE_VARS时，默认只删除名称为JD_COOKIE且禁用的变量，且备注中不含"白名单" ===
        let envsToDelete = [];
        
        if (process.env.DELETE_VARS) {
            // 若设置了DELETE_VARS，则按列表删除（排除JD_COOKIE中备注含"白名单"的变量）
            const deleteNames = process.env.DELETE_VARS.split(',').map(name => name.trim());
            envsToDelete = envs.filter(env => {
                // 排除JD_COOKIE中备注含"白名单"的变量
                if (isJDCookieWithWhitelist(env)) {
                    console.log(`保留JD_COOKIE（ID: ${env.id}）：备注中包含"白名单"`);
                    return false;
                }
                return deleteNames.includes(env.name) && env.status === 1;
            });
            console.log(`根据DELETE_VARS，找到${envsToDelete.length}个符合条件的环境变量`);
        } else {
            // 若未设置DELETE_VARS，默认只删除名称为JD_COOKIE且禁用的变量，且备注中不含"白名单"
            envsToDelete = envs.filter(env => 
                env.name === 'JD_COOKIE' && 
                env.status === 1 && 
                !isJDCookieWithWhitelist(env)
            );
            console.log(`未设置DELETE_VARS，默认找到${envsToDelete.length}个名称为JD_COOKIE且禁用的环境变量`);
        }
        // ==============================================

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
