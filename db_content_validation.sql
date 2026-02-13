-- ==============================================================================
-- Tarnished Interstice Content Validation Migration
-- ==============================================================================
-- 目的：在数据库层面强制执行“建言”格式，防止任意文本注入。
-- 机制：
-- 1. 创建 valid_words (词库表) 和 valid_templates (模板表)。
-- 2. 使用 Trigger 在 INSERT 前校验 content 是否符合格式。
-- ==============================================================================

-- 1. 创建词库表 (存储所有合法的填充词)
CREATE TABLE IF NOT EXISTS valid_words (
    word text PRIMARY KEY
);

-- 2. 创建模板表 (存储所有合法的句式，用 % 或 **** 占位)
CREATE TABLE IF NOT EXISTS valid_templates (
    id serial PRIMARY KEY,
    template_text text NOT NULL -- 例如: "前有%" 或 "前有****"
);

-- 3. 启用 RLS (虽然是公开读取，但防止用户篡改词库)
ALTER TABLE valid_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE valid_templates ENABLE ROW LEVEL SECURITY;

-- 仅允许 Service Role (管理员) 修改词库，普通用户只读
DROP POLICY IF EXISTS "Allow public read words" ON valid_words;
CREATE POLICY "Allow public read words" ON valid_words FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public read templates" ON valid_templates;
CREATE POLICY "Allow public read templates" ON valid_templates FOR SELECT USING (true);

-- 4. 填充数据 (包含所有词汇和连接词)
-- 清空旧数据以避免重复（如果是迁移脚本的话）
TRUNCATE valid_words, valid_templates RESTART IDENTITY CASCADE;

-- 插入所有词汇 (来自 wordBank.js)
INSERT INTO valid_words (word) VALUES 
-- Enemies
('敌人'), ('小兵'), ('强敌'), ('怪物'), ('龙'), ('头目'), ('守卫'), ('集团'), ('群聚'), ('陷阱'), 
('长生者'), ('士兵'), ('骑士'), ('骑兵'), ('射击手'), ('狙击手'), ('魔法师'), ('兵器'), ('君王'), 
('王者'), ('亚人'), ('外来者'), ('巨人'), ('马'), ('狗'), ('狼'), ('老鼠'), ('野兽'), ('鸟'), 
('猛禽'), ('蛇'), ('螃蟹'), ('虾子'), ('章鱼'), ('虫'), ('粪金龟'), ('蛞蝓'), ('灵魂'), ('骸骨'), 
('异形'), ('需忌讳的事物'),
-- People
('褪色者'), ('战士'), ('剑士'), ('武士'), ('圣职人员'), ('贤者'), ('商人'), 
('老师'), ('师父'), ('朋友'), ('情人'), ('老婆婆'), ('老爷爷'), ('天使'), ('有钱人'), ('穷人'), 
('好人'), ('坏人'), ('丰满的家伙'), ('细瘦的家伙'), ('可爱的家伙'), ('可怜的家伙'), 
('奇怪的家伙'), ('敏捷的家伙'), ('迟钝的家伙'), ('看不到的家伙'), ('不知来历的家伙'), 
('巨大的家伙'), ('罪犯'), ('小偷'), ('骗子'), ('卑鄙的家伙'), ('叛徒'), ('双人组'), ('三人行'), 
('权贵'), ('贵族'), ('勇者'), ('英雄'), ('神祇'),
-- Things
('道具'), ('有用的道具'), ('重要的道具'), ('某种东西'), ('某种不得了的东西'), ('宝箱'), 
('尸体'), ('棺木'), ('武器'), ('盾牌'), ('弓'), ('远攻道具'), ('防具'), ('护符'), 
('战技'), ('魔法'), ('祷告'), ('地图'), ('材料'), ('花'), ('草'), ('树木'), ('果实'), ('种子'), 
('菇'), ('露滴'), ('结晶'), ('蝴蝶'), ('排泄物'), ('赐福'), ('门'), ('钥匙'), ('梯子'), 
('拉杆'), ('升降机'), ('灵魂气流'), ('传送门'), ('观星台'), ('鸟瞰镜'), ('讯息'), ('血迹'), 
('黄金树'), ('艾尔登法环'),
-- Tactics
('近身战'), ('远距离战'), ('骑马作战'), ('引敌'), ('个别击破'), ('一网打尽'), ('突击'), 
('隐密行动'), ('拟态'), ('扰乱'), ('跟踪'), ('逃跑'), ('召唤'), ('包抄'), ('跳下去'), ('冲过去'), 
('暂歇'),
-- Actions
('攻击'), ('跳跃攻击'), ('冲刺攻击'), ('致命一击'), ('双手共持'), ('防御'), ('格挡'), 
('防御反击'), ('投掷'), ('恢复'), ('冲刺'), ('翻滚'), 
('后跃'), ('跳跃'), ('蹲下'), ('锁定目标'), ('制作道具'), ('肢体动作'),
-- Situations
('早上'), ('白天'), ('傍晚'), ('晚上'), ('晴天'), ('阴天'), ('雨天'), ('暴风雨'), ('起雾'), 
('下雪'), ('巡逻'), ('队伍'), ('奇袭'), ('伏击'), ('夹击'), ('包围攻击'), ('交战'), 
('援军'), ('仪式'), ('爆炸'), ('顶点'), ('防守地点'), ('攀爬处'), ('通过处'), ('光亮处'), 
('昏暗处'), ('宽广处'), ('狭窄处'), ('隐身处'), ('狙击点'), ('观察点'), ('安全'), ('危险'), 
('绝景'), ('远路'), ('隐藏道路'), ('小路'), ('近路'), ('死胡同'), ('左顾右盼'), ('粗心'), 
('耗尽精力'),
-- Locations
('大道'), ('关卡'), ('桥'), ('城'), ('要塞'), ('城市'), ('遗迹'), ('教堂'), ('塔'), ('露营处'), 
('家'), ('墓地'), ('地下墓地'), ('坑道'), ('洞窟'), ('封印监牢'), ('大树'), ('地下室'), ('地面上'), 
('地面下'), ('森林'), ('河川'), ('湖泊'), ('泥沼'), ('山'), ('山谷'), ('山崖'), ('取水处'), ('巢穴'), 
('洞穴'),
-- Directions
('东'), ('西'), ('南'), ('北'), ('前'), ('后'), ('左'), ('右'), ('中央'), ('上'), ('下'), ('边界'),
-- Body Parts
('头部'), ('腹部'), ('背部'), ('臂部'), ('腿部'), ('臀部'), ('尾巴'), ('核心'), ('指头'),
-- Attributes
('物理'), ('普通'), ('打击'), ('斩击'), ('突刺'), ('火'), ('雷'), ('魔力'), ('圣'), ('毒'), ('剧毒'), 
('猩红腐败'), ('出血'), ('冻伤'), ('催眠'), ('发狂'), ('死亡'),
-- Concepts
('生'), ('死'), ('光明'), ('黑暗'), ('星星'), ('错误'), ('律法'), ('浑沌'), ('高兴'), ('愤怒'), 
('痛苦'), ('悲伤'), ('治愈'), ('幸福'), ('不幸'), ('幸运'), ('倒霉'), ('希望'), ('绝望'), ('胜利'), 
('败战'), ('探索'), ('信仰'), ('丰饶'), ('腐败'), ('义气'), ('负义'), ('秘密'), ('机会'), ('危机'), 
('提示'), ('友情'), ('爱情'), ('勇气'), ('活泼'), ('意志'), ('轻松'), ('迷糊'), ('大意'), ('反省'), 
('后悔'), ('放弃'), ('无意义'), ('极限'), ('背叛'), ('复仇'), ('破坏'), ('鲁莽'), ('冷静'), ('谨慎'), 
('静谧'), ('声音'), ('眼泪'), ('酣眠'), ('深度'), ('沉积'), ('恐怖'), ('牺牲'), ('毁灭'),
-- Musings
('加油'), ('仔细看'), ('仔细听'), ('想清楚'), ('做得好'), ('我成功了！'), ('看我干的好事……'), 
('在这里！'), ('不是这里！'), ('你不是对手！'), ('干掉他！'), ('我想放弃了……'), ('别想太多'), 
('好孤单……'), ('又是这里……'), ('好戏就要登场'), ('别慌张'), ('别停下来'), ('折返吧'), 
('放弃吧'), ('别放弃'), ('救救我……'), ('怎么可能……'), ('太高了……'), ('好想离开……'), 
('好像在做梦……'), ('好怀念……'), ('真美……'), ('你没资格'), ('做好心理准备了吗？')

ON CONFLICT DO NOTHING;

INSERT INTO valid_templates (template_text) VALUES 
('前有****'), 
('前无****'), 
('前面需要****'), 
('前面要小心****'), 
('接下来，****很有用'), 
('很可能是****'), 
('首先，****吧'), 
('以****为目标吧'), 
('还没有****喔……'), 
('果然是****……'), 
('如果有****的话……'), 
('居然是****……'), 
('有****的预感……'), 
('你以为是****吧？'), 
('是****的时候了'), 
('****，敬请见证'), 
('献上****吧'), 
('****万岁！'), 
('赐予****吧！'), 
('啊，****啊……'), 
('****'), 
('****！'), 
('****？'), 
('****……')
ON CONFLICT DO NOTHING;

-- 5. 创建校验函数
CREATE OR REPLACE FUNCTION validate_message_content()
RETURNS TRIGGER AS $$
DECLARE
    clean_content text;
    template_rec record;
    word_rec record;
    is_valid boolean := false;
    extracted_word text;
    part_before text;
    part_after text;
    
    -- 连接词列表 (也可存储在表中，此处硬编码以演示逻辑分离)
    -- 注意：前端可能会发送半角逗号 ','，这里统一纳入处理
    -- 移除了空格 ' '，防止误将句子内部的空格识别为分段符导致 segments > 2
    conjunctions text[] := ARRAY['另外', '或是', '但是', '所以', '反正', '不过', '对了', '也就是说', '正因为如此', '，', ','];
    conj text;
    has_conjunction boolean := false;
    content_body text;
BEGIN
    -- 简单预处理：去除首尾空格
    clean_content := trim(NEW.content);
    content_body := clean_content;

    -- 1. 复句检查 (Complex Sentence Check)
    -- 前端格式： [Segment1] + [换行符/空格] + [连接词] + [Segment2]
    -- 您的截图显示："接下来，关卡很有用 也就是说 以圣职人员为目标吧"
    -- 注意：前端 WriteMenu.vue 第 354 行逻辑是：final += `\n${combinedTextS2.value}`
    -- 但在数据库中可能被存储为空格或换行符，我们需要健壮地分割。

    -- 尝试以连接词分割
    FOREACH conj IN ARRAY conjunctions LOOP
        -- 检查内容中是否包含该连接词（且不在开头）
        -- 注意：这里假设连接词前后可能有标点或换行
        IF clean_content LIKE '%' || conj || '%' THEN
             -- 简单起见，我们假设只有一段复句。
             -- 我们需要验证连接词前后的两部分是否都合法。
             -- 这是一个递归验证的问题，但在 SQL 函数里递归比较麻烦。
             -- 我们可以简单地将前后两部分分别作为单句校验。
             
             -- 这里的逻辑比较复杂，为了简化且高效，我们采用“双段独立校验”策略
             -- 但由于 SQL split 的局限性，我们很难精确知道从哪里切分（如果有多个相同的连接词）。
             -- 鉴于“魂系”建言的格式相对固定，连接词通常出现在第二句的开头。
             
             -- 让我们可以尝试一种通用的“包含验证”策略：
             -- 只要整段文本能被解析为 (ValidSentence) + (Optional Conjunction + ValidSentence) 即可。
             
             NULL; -- 占位，具体逻辑在下方重写
        END IF;
    END LOOP;

    -- === 重构后的通用校验逻辑 ===
    -- 核心思想：无论单句还是复句，本质上都是由 1 或 2 个“原子句”组成的。
    -- 原子句 = 模板(词汇)
    -- 复句 = 原子句1 + [换行符] + [连接词] + 原子句2
    
    DECLARE
        sub_sentences text[];
        sentence text;
        atom_valid boolean;
        has_newline boolean;
        part1 text;
        part2 text;
        part2_clean text;
        
    BEGIN
        -- 1. 严格按照前端 WriteMenu.vue 的构造逻辑进行切分
        -- 前端构造： final = s1; if (complex) final += `\n${conj}${s2}`;
        -- 所以分隔符是固定的换行符 E'\n'
        
        -- 检查是否有换行符
        has_newline := position(E'\n' in clean_content) > 0;
        
        IF has_newline THEN
            -- 复句模式
            part1 := split_part(clean_content, E'\n', 1);
            part2 := split_part(clean_content, E'\n', 2);
            
            -- 处理第二句：去除开头的连接词
            -- 我们需要遍历所有合法的连接词，看 part2 是否以它开头
            part2_clean := part2; -- 默认值，如果没找到连接词则保持原样（虽然前端逻辑应该总是有连接词，但我们要健壮）
            
            FOREACH conj IN ARRAY conjunctions LOOP
                -- 检查 part2 是否以该连接词开头
                IF position(conj in part2) = 1 THEN
                    -- 去除开头的连接词
                    -- substring(string from start_index)
                    -- start_index = length(conj) + 1
                    part2_clean := substring(part2 from length(conj) + 1);
                    EXIT; -- 找到匹配的连接词后立即停止，避免误伤
                END IF;
            END LOOP;
            
            sub_sentences := ARRAY[part1, part2_clean];
        ELSE
            -- 单句模式
            sub_sentences := ARRAY[clean_content];
        END IF;

        -- 遍历每个分句进行校验
        FOREACH sentence IN ARRAY sub_sentences LOOP
            sentence := trim(sentence);
            IF length(sentence) > 0 THEN
                atom_valid := false;
                
                -- 校验原子句 (使用正则匹配，解决 split_part 在处理中间占位符时的脆弱性)
                FOR template_rec IN SELECT template_text FROM valid_templates LOOP
                    DECLARE
                        regex_pattern text;
                        extracted_word text;
                    BEGIN
                        -- 1. 转义模板中的特殊正则字符 (除了我们自己的占位符 ****)
                        -- 注意：SQL replace 是按顺序执行的
                        regex_pattern := template_rec.template_text;
                        regex_pattern := replace(regex_pattern, '\', '\\');  -- Backslash first
                        regex_pattern := replace(regex_pattern, '.', '\.');  -- Dot
                        regex_pattern := replace(regex_pattern, '?', '\?');  -- Question mark
                        regex_pattern := replace(regex_pattern, '+', '\+');
                        regex_pattern := replace(regex_pattern, '*', '\*');
                        regex_pattern := replace(regex_pattern, '(', '\(');
                        regex_pattern := replace(regex_pattern, ')', '\)');
                        regex_pattern := replace(regex_pattern, '[', '\[');
                        regex_pattern := replace(regex_pattern, ']', '\]');
                        regex_pattern := replace(regex_pattern, '{', '\{');
                        regex_pattern := replace(regex_pattern, '}', '\}');
                        
                        -- 2. 将被转义的占位符 \*\*\*\* 替换回正则捕获组 (.+)
                        -- 注意上面的转义把 **** 变成了 \*\*\*\*
                        -- 增强：允许模板各部分之间存在空格 (\s*)
                        regex_pattern := replace(regex_pattern, '\*\*\*\*', '\s*(.+)\s*');
                        
                        -- 3. 构建完整正则：全匹配
                        -- 增强：允许句首句尾有空白
                        regex_pattern := '^\s*' || regex_pattern || '\s*$';
                        
                        -- 4. 尝试提取
                        extracted_word := substring(sentence FROM regex_pattern);
                        
                        IF extracted_word IS NOT NULL THEN
                             extracted_word := trim(extracted_word);
                             -- 5. 验证提取出的词是否在词库中
                             IF EXISTS (SELECT 1 FROM valid_words WHERE word = extracted_word) THEN
                                atom_valid := true;
                                EXIT; -- Template matched and word is valid
                             END IF;
                        END IF;
                    END;
                END LOOP;
                
                IF NOT atom_valid THEN
                    RAISE EXCEPTION 'Invalid message segment: "%" is not a valid phrase.', sentence;
                END IF;
            END IF;
        END LOOP;
        
        -- 如果所有非空分句都通过了校验，则整体通过
        RETURN NEW;
    END;

END;
$$ LANGUAGE plpgsql;

-- 6. 绑定触发器
DROP TRIGGER IF EXISTS check_message_content ON messages;
CREATE TRIGGER check_message_content
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION validate_message_content();

-- ==============================================================================
-- 附加：防刷限制 (Rate Limiting) 增强
-- ==============================================================================
-- 防止用户通过脚本在短时间内大量 POST
-- 结合原有的 check_post_limit (基于总数)，这里增加基于时间的限制
-- 例如：每分钟最多 5 条

CREATE OR REPLACE FUNCTION check_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    recent_count int;
BEGIN
    SELECT count(*) INTO recent_count
    FROM messages
    WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 minute';
    
    IF recent_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You are posting too fast.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_rate_limit_trigger ON messages;
CREATE TRIGGER check_rate_limit_trigger
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION check_rate_limit();
