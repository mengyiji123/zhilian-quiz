# 无 Docker 生产部署

本文以 Linux、systemd、Nginx、MySQL 8 和域名 HTTPS 为基准。示例安装目录为 `/opt/shuati`，服务账号为 `shuati`，执行前请把域名和密码替换为真实值。

## 1. 运行环境

- Node.js 24 LTS
- pnpm 11（可通过 Corepack 启用）
- MySQL 8.0 或兼容版本
- Nginx
- systemd
- Certbot（用于签发和续期 HTTPS 证书）

```bash
node --version
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm --version
nginx -v
mysql --version
```

## 2. 创建服务账号和安装目录

```bash
sudo useradd --system --home /opt/shuati --shell /usr/sbin/nologin shuati
sudo mkdir -p /opt/shuati
sudo chown -R shuati:shuati /opt/shuati
```

把项目上传到 `/opt/shuati`，不要上传 `node_modules`、`.pnpm-store`、`tmp` 和本地 `.env`。上传完成后：

```bash
cd /opt/shuati
sudo -u shuati pnpm install --frozen-lockfile
sudo -u shuati pnpm build
```

## 3. 创建 MySQL 数据库

先生成一个强密码，再以 MySQL 管理员执行：

```sql
CREATE DATABASE shuati CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'quiz_user'@'127.0.0.1' IDENTIFIED BY '替换为强密码';
GRANT ALL PRIVILEGES ON shuati.* TO 'quiz_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

如果 MySQL 不支持 `utf8mb4_0900_ai_ci`，可改为 `utf8mb4_unicode_ci`。

## 4. 写入生产环境变量

```bash
cd /opt/shuati
sudo -u shuati cp deploy/env.production.example .env
openssl rand -hex 32
sudo -u shuati nano .env
sudo chmod 600 .env
```

把随机值填入 `APP_ENCRYPTION_KEY`，并填写 MySQL 密码和管理员密码。MySQL 密码如果包含 `@`、`:`、`/`、`#` 等字符，需要先进行 URL 编码。

## 5. 建表并导入自备题库

```bash
cd /opt/shuati
sudo -u shuati pnpm db:schema
sudo -u shuati pnpm db:seed
```

将符合 `data/questions.example.json` 结构的数据保存到 `.env` 的 `QUESTION_DATA_PATH`。重复执行 `db:seed` 会按稳定题目键更新题干、选项、答案和解析，不会删除用户、收藏、错题或答题历史。

## 6. 安装 systemd 服务

复制模板前，将 `__APP_DIR__` 替换为 `/opt/shuati`，将 `__SERVICE_USER__` 和 `__SERVICE_GROUP__` 替换为 `shuati`。

```bash
sudo cp deploy/systemd/shuati.service /etc/systemd/system/shuati.service
sudo sed -i 's|__APP_DIR__|/opt/shuati|g; s|__SERVICE_USER__|shuati|g; s|__SERVICE_GROUP__|shuati|g' /etc/systemd/system/shuati.service
sudo systemctl daemon-reload
sudo systemctl enable --now shuati
sudo systemctl status shuati --no-pager
curl http://127.0.0.1:3001/api/health
```

## 7. 配置 Nginx 和 HTTPS

将 `__DOMAIN__` 替换为真实域名，将 `__APP_DIR__` 替换为 `/opt/shuati`。

```bash
sudo cp deploy/nginx/shuati.conf /etc/nginx/conf.d/shuati.conf
sudo sed -i 's|__DOMAIN__|quiz.example.com|g; s|__APP_DIR__|/opt/shuati|g' /etc/nginx/conf.d/shuati.conf
sudo nginx -t
sudo systemctl reload nginx
```

Ubuntu/Debian 如果使用 `sites-available`，可把配置复制到 `/etc/nginx/sites-available/shuati`，再链接到 `sites-enabled`。

确认域名 A/AAAA 记录已经指向服务器后签发证书：

```bash
sudo certbot --nginx -d quiz.example.com
sudo certbot renew --dry-run
```

## 8. 上线验证

```bash
curl -fsS https://quiz.example.com/api/health
sudo journalctl -u shuati -n 100 --no-pager
sudo nginx -t
```

浏览器还需要验证：管理员登录、科目与章节题量、单选/多选/判断提交、错题和收藏、统计、草稿关闭后清空、AI 快问配置，以及 iPad 添加到主屏幕。

## 更新题库或应用

更新前建议先备份：

```bash
mysqldump --single-transaction -u root -p shuati > "shuati-$(date +%F-%H%M%S).sql"
```

上传新代码和你自己的题库 JSON 后：

```bash
cd /opt/shuati
sudo -u shuati pnpm install --frozen-lockfile
sudo -u shuati pnpm build
sudo -u shuati pnpm db:schema
sudo -u shuati pnpm db:seed
sudo systemctl restart shuati
sudo systemctl reload nginx
```
