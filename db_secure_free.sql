-- ====================================================================================
-- Tarnished Interstice Database Schema v3 (Secure Free Tier Edition)
-- 专为 Supabase Free Tier 优化：
-- 1. 即使不使用 auth.users 也能实现安全鉴权
-- 2. 避免 MAU 限制
-- 3. 极低的空间占用
-- ====================================================================================

-- 1. 创建轻量级用户表
CREATE TABLE IF NOT EXISTS app_users (
    id uuid PRIMARY KEY,
    -- 存储密钥的哈希值，即使数据库泄露也无法伪造请求
    secret_hash text NOT NULL, 
    last_seen timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- 启用 RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
-- 任何人都不允许直接读写此表，必须通过 RPC
DROP POLICY IF EXISTS "No Direct Access" ON app_users;
CREATE POLICY "No Direct Access" ON app_users FOR ALL USING (false);

-- 2. 核心鉴权函数：从请求 Header 中提取并验证用户身份
-- 这个函数将替代 auth.uid()
CREATE OR REPLACE FUNCTION get_auth_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    req_id uuid;
    req_secret text;
    stored_hash text;
BEGIN
    -- 从 HTTP Header 中读取客户端注入的凭证
    -- 注意：Header 键名通常会被转为小写
    req_id := (current_setting('request.headers', true)::json->>'x-client-id')::uuid;
    req_secret := current_setting('request.headers', true)::json->>'x-client-secret';

    IF req_id IS NULL OR req_secret IS NULL THEN
        RETURN NULL;
    END IF;

    -- 验证密钥
    SELECT secret_hash INTO stored_hash FROM app_users WHERE id = req_id;
    
    IF stored_hash IS NOT NULL AND stored_hash = crypt(req_secret, stored_hash) THEN
        RETURN req_id;
    END IF;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 3. 注册设备 RPC
-- 客户端启动时调用，通过 crypt 存储密码
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- 确保加密插件已开启

CREATE OR REPLACE FUNCTION register_device(p_id uuid, p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 尝试插入新用户
    INSERT INTO app_users (id, secret_hash)
    VALUES (p_id, crypt(p_secret, gen_salt('bf')))
    ON CONFLICT (id) DO UPDATE
    SET last_seen = now()
    -- 只有当提供的密钥匹配时才更新 last_seen，防止恶意覆盖
    WHERE app_users.id = p_id AND app_users.secret_hash = crypt(p_secret, app_users.secret_hash);
    
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION register_device(uuid, text) TO anon, authenticated;

-- ====================================================================================
-- 更新业务表结构与策略
-- ====================================================================================

-- 确保 messages 表存在
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  app_name text NOT NULL,
  exact_hash text DEFAULT '',
  pos_x real NOT NULL,
  pos_y real NOT NULL,
  upvotes int DEFAULT 0,
  downvotes int DEFAULT 0,
  user_id uuid NOT NULL, -- 这里不再强关联 auth.users
  created_at timestamptz DEFAULT now(),
  hot_score float8 -- 之前定义的计算字段
);

-- 重建热度计算列 (防止丢失)
DO $$ 
BEGIN
  ALTER TABLE messages DROP COLUMN IF EXISTS hot_score;
  ALTER TABLE messages ADD COLUMN hot_score float8 
  GENERATED ALWAYS AS (LOG(GREATEST(upvotes + downvotes + 1, 1)) + (EXTRACT(EPOCH FROM created_at) / 200000)) STORED;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_app_lookup ON messages(app_name, exact_hash);
CREATE INDEX IF NOT EXISTS idx_messages_hot_score ON messages(app_name, exact_hash, hot_score DESC);

-- RLS 策略更新
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- (1) 读取：公开
DROP POLICY IF EXISTS "Public Read" ON messages;
CREATE POLICY "Public Read" ON messages FOR SELECT USING (true);

-- (2) 插入：必须是注册用户，且 user_id 必须匹配
DROP POLICY IF EXISTS "Public Insert" ON messages;
DROP POLICY IF EXISTS "Secure Insert" ON messages;
CREATE POLICY "Secure Insert" ON messages FOR INSERT 
WITH CHECK (
    -- 调用自定义鉴权函数
    get_auth_id() IS NOT NULL AND
    user_id = get_auth_id()
);

-- (3) 删除：仅限本人
DROP POLICY IF EXISTS "Public Delete" ON messages;
DROP POLICY IF EXISTS "Secure Delete" ON messages;
CREATE POLICY "Secure Delete" ON messages FOR DELETE 
USING (
    get_auth_id() IS NOT NULL AND
    user_id = get_auth_id()
);

-- (4) 更新：仅限本人 (目前业务其实不需要 Update content，主要是 Vote)
-- Vote 通过 RPC 处理，所以这里可以暂时禁止 Update，或者仅允许本人
DROP POLICY IF EXISTS "Public Update" ON messages;
DROP POLICY IF EXISTS "Secure Update" ON messages;
CREATE POLICY "Secure Update" ON messages FOR UPDATE
USING (user_id = get_auth_id())
WITH CHECK (user_id = get_auth_id());

CREATE OR REPLACE FUNCTION get_mixed_messages(
  p_app_name text,
  p_exact_hash text,
  p_limit_hot int,
  p_limit_rand int
)
RETURNS TABLE (
  id uuid,
  content text,
  app_name text,
  exact_hash text,
  pos_x real,
  pos_y real,
  upvotes int,
  downvotes int,
  user_id uuid,
  created_at timestamptz,
  hot_score float8
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT *
    FROM messages
    WHERE app_name = p_app_name
      AND (p_exact_hash = '' OR exact_hash = p_exact_hash)
  ),
  hot AS (
    SELECT *
    FROM base
    ORDER BY hot_score DESC NULLS LAST
    LIMIT p_limit_hot
  ),
  rand AS (
    SELECT *
    FROM base
    ORDER BY random()
    LIMIT p_limit_rand
  )
  SELECT DISTINCT ON (id) *
  FROM (
    SELECT * FROM hot
    UNION ALL
    SELECT * FROM rand
  ) s;
$$;

GRANT EXECUTE ON FUNCTION get_mixed_messages(text, text, int, int) TO anon, authenticated;

-- ====================================================================================
-- 更新 RPC 函数 (使用 get_auth_id)
-- ====================================================================================

-- 1. 投票函数 (Vote)
-- 只有注册用户才能投票，且我们会记录投票人 ID
CREATE TABLE IF NOT EXISTS user_reputation (
  user_id uuid PRIMARY KEY,
  total_upvotes int DEFAULT 0
);
ALTER TABLE user_reputation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Reputation" ON user_reputation;
CREATE POLICY "Public Read Reputation" ON user_reputation FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION vote_message(
  row_id uuid, 
  val int,
  v_user_id uuid -- 参数仅作为参考，实际以 Header 为准
) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    target_user_id uuid;
    voter_id uuid;
BEGIN
    -- 获取真实投票人 ID
    voter_id := get_auth_id();
    IF voter_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized vote';
    END IF;

    -- TODO: Consider adding a 'votes' table to prevent duplicate voting (voter_id, row_id)
    -- For now, simplified to save space on free tier

    IF val > 0 THEN 
        UPDATE messages 
        SET upvotes = COALESCE(upvotes, 0) + 1 
        WHERE id = row_id 
        RETURNING user_id INTO target_user_id;
        
        -- 增加声望
        IF target_user_id IS NOT NULL THEN
            INSERT INTO user_reputation (user_id, total_upvotes) VALUES (target_user_id, 1)
            ON CONFLICT (user_id) DO UPDATE SET total_upvotes = COALESCE(user_reputation.total_upvotes, 0) + 1;
        END IF;
    ELSE 
        UPDATE messages 
        SET downvotes = COALESCE(downvotes, 0) + 1 
        WHERE id = row_id;
    END IF;
END;
$$;

-- 2. 删除函数 (Delete)
CREATE OR REPLACE FUNCTION delete_message(
  target_id uuid,
  verify_user_id uuid -- 兼容旧签名，但实际忽略
) 
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    requester_id uuid;
BEGIN
    requester_id := get_auth_id();
    IF requester_id IS NULL THEN
        RETURN false;
    END IF;

    DELETE FROM messages WHERE id = target_id AND user_id = requester_id;
    RETURN FOUND;
END;
$$;

-- 3. 发帖限制检查
CREATE OR REPLACE FUNCTION check_post_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    requester_id uuid;
    v_count int;
    v_upvotes int;
    v_limit int;
BEGIN
    requester_id := get_auth_id();
    -- 必须是本人查询
    IF requester_id IS NULL OR requester_id != p_user_id THEN
        RETURN false;
    END IF;

    SELECT count(*) INTO v_count FROM messages WHERE user_id = requester_id;
    SELECT total_upvotes INTO v_upvotes FROM user_reputation WHERE user_id = requester_id;
    
    v_limit := 20 + FLOOR(COALESCE(v_upvotes, 0) / 10);
    IF v_limit > 40 THEN v_limit := 40; END IF;
    
    IF v_count >= v_limit THEN RETURN false; END IF;
    return true;
END;
$$;

-- 4. 获取限制详情
CREATE OR REPLACE FUNCTION get_post_limit(p_user_id uuid)
RETURNS TABLE(post_limit int, post_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int;
    v_upvotes int;
    v_limit int;
BEGIN  

    SELECT count(*) INTO v_count FROM messages WHERE user_id = p_user_id;
    SELECT total_upvotes INTO v_upvotes FROM user_reputation WHERE user_id = p_user_id;
    v_limit := 20 + FLOOR(COALESCE(v_upvotes, 0) / 10);
    IF v_limit > 40 THEN v_limit := 40; END IF;
    RETURN QUERY SELECT v_limit, v_count;
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION vote_message(uuid, int, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_message(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_post_limit(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_post_limit(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_auth_id() TO anon, authenticated;

-- 通知
NOTIFY pgrst, 'reload schema';
