# Deploy Purchasing+ on Hostinger with Dokploy

The VPS runs one Purchasing+ container and a separate PostgreSQL 17 service. Traefik serves the application over HTTPS. The application uses a private R2 bucket by default, with one-hour presigned image URLs. Backups go to a second, private bucket.

## 1. Create the project and database

1. Sign in to the Dokploy dashboard on the Hostinger VPS. Make sure the VPS firewall allows inbound TCP 80 and 443 for Traefik and restricts access to the dashboard and SSH to your administration path.
2. From **Projects**, create **Purchasing+** and open its production environment. Choose **Create Service → Database → PostgreSQL**.
3. Use the image `postgres:17`, database `purchasing`, and a generated database password. Deploy the database and retain its persistent volume when updating the service.
4. Copy the database's **Internal Connection URL** to your password manager. Use the internal hostname provided by Dokploy. Leave the external port unset. The migration user must own the database objects and be able to install `pg_trgm` and `unaccent`. [Dokploy database connection](https://docs.dokploy.com/docs/core/databases/connection)

## 2. Create the Cloudflare R2 image bucket

1. In Cloudflare, go to **Storage & databases → R2 → Overview → Create bucket**. Create a standard bucket such as `purchasing-images`. Use the default jurisdiction with the endpoint `https://<account-id>.r2.cloudflarestorage.com`.
2. Under **API Tokens → Manage → Create Account API Token**, choose **Object Read & Write**, select **Apply to specific buckets only**, and select `purchasing-images`. Store the account ID, access key ID, and secret access key. [Cloudflare R2 credentials](https://developers.cloudflare.com/r2/get-started/s3/)
3. For private mode, leave **Custom Domains** and the **Public Development URL** disabled and omit `STORAGE_PUBLIC_BASE_URL`. For public mode, open the bucket's **Settings → Custom Domains**, add a hostname in a Cloudflare-managed zone such as `images.example.com`, and wait for it to become active. Set `STORAGE_PUBLIC_BASE_URL=https://images.example.com`. Anyone with a public object URL can read that image. [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

## 3. Create the application and set its environment

1. In the same environment, choose **Create Service → Application** and name it `purchasing-web`. Under **Provider**, connect GitHub, select the Purchasing+ repository and production branch, and use the repository root as **Build Path**.
2. Select the **Dockerfile** build type. Enter `Dockerfile` for **Dockerfile Path**, `.` for **Docker Context Path**, and leave **Docker Build Stage** blank so it builds the final stage. [Dokploy Dockerfile settings](https://docs.dokploy.com/docs/core/applications/build-type#dockerfile)
3. Open **Environment** and save the values below as runtime variables. Generate each signing secret independently with `openssl rand -hex 32`. Store the real secrets in your password manager and Dokploy.

| Variable                  | Production value or example                                                                                        | Purpose                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `production` (image default)                                                                                       | Enables production serving and secure session cookies.                                                                  |
| `DATABASE_URL`            | `postgresql://purchasing:<encoded-password>@purchasing-db:5432/purchasing`                                         | Internal PostgreSQL connection URL. Use the hostname from Dokploy and percent-encode special characters in credentials. |
| `DATABASE_URL_TEST`       | Omit in production. Example for development and CI `postgresql://postgres:postgres@localhost:5432/purchasing_test` | Separate test database used by the test suite.                                                                          |
| `SESSION_SECRET`          | Generated 64-character hex string                                                                                  | Signs session credentials. Keep it across redeploys to preserve sessions.                                               |
| `AUDIT_HMAC_SECRET`       | A different generated 64-character hex string                                                                      | Signs audit records. Keep the original secret for audit verification, including after a restore.                        |
| `SUPERADMIN_USERNAME`     | `purchasing-support`                                                                                               | Initial support account username.                                                                                       |
| `SUPERADMIN_PASSWORD`     | A unique generated password, at least 8 characters                                                                 | Initial support password. Rotate it in Purchasing+ after bootstrap.                                                     |
| `PUBLIC_ORIGIN`           | `https://purchasing.example.com`                                                                                   | HTTPS browser origin accepted on mutations. Use the exact host and any nonstandard port, with no path.                  |
| `STORAGE_DRIVER`          | `r2`                                                                                                               | R2 image storage. `local` is for development and isolated smoke tests.                                                  |
| `R2_ACCOUNT_ID`           | `123456789abcdef0123456789abcdef0`                                                                                 | Cloudflare account ID from the R2 endpoint.                                                                             |
| `R2_ACCESS_KEY_ID`        | `<image-bucket-access-key-id>`                                                                                     | Access key scoped to the image bucket.                                                                                  |
| `R2_SECRET_ACCESS_KEY`    | `<image-bucket-secret-access-key>`                                                                                 | Secret key for uploads, deletion, and presigned reads.                                                                  |
| `R2_BUCKET`               | `purchasing-images`                                                                                                | Name of the image bucket.                                                                                               |
| `STORAGE_PUBLIC_BASE_URL` | Omit for private, or `https://images.example.com` for public                                                       | Public HTTPS base for image URLs.                                                                                       |
| `PORT`                    | `3000` (image default)                                                                                             | Internal application port. Match it in the Dokploy domain.                                                              |

## 4. Attach the domain, configure health, and deploy

1. Point an `A` record for `purchasing.example.com` at the VPS's public IPv4 address. If using Cloudflare DNS, select **DNS only** for the app host. Traefik should be the single proxy in front of the app and should manage forwarded headers from clients.
2. In the application's **Domains**, add `purchasing.example.com`, path `/`, container port `3000`, HTTPS enabled, and the **Let's Encrypt** certificate. Route all paths to the same service. Leave the application's published port unset. [Dokploy domains](https://docs.dokploy.com/docs/core/domains)
3. Under **Advanced → Cluster Settings → Swarm Settings**, set one replica and use `stop-first` update order so that only one process holds the live event bus. Deployments can briefly interrupt service. The image defines a health check. To set the equivalent explicitly in Dokploy's **Health Check** field, use the following. [Dokploy health checks](https://docs.dokploy.com/docs/core/applications/going-production#healthcheck--rollbacks)

   ```json
   {
     "Test": ["CMD", "node", "/app/healthcheck.mjs"],
     "Interval": 30000000000,
     "Timeout": 5000000000,
     "StartPeriod": 60000000000,
     "Retries": 3
   }
   ```

4. Click **Deploy**. The application logs should show Prisma completing its migration check before the server starts. The first start after the direct-receipt change also logs one `Direct-receipt migration:` line. It names how many requests that were waiting for the removed pricing approval moved to receipt, and any request it skipped. Later starts find nothing and log nothing. To run the same idempotent step by hand, use `pnpm --filter api migrate:direct-receipt` in the container terminal. Check the public health route.

   ```sh
   curl -fsS https://purchasing.example.com/api/health
   ```

   Expect `{"status":"ok","db":"ok","storage":"ok"}`. Health checks the database and validates storage configuration without sending an R2 request.

5. In the application's container terminal, run `pnpm --filter api storage:check`. Expect `R2 upload, read and delete OK.` This checks the image URL as the browser would use it, including the public hostname if configured. If cleanup fails, the command prints the disposable key so you can remove it in R2.
6. Sign in and refresh a deep link such as `/master-data`. Open an image and verify it loads. In browser DevTools under **Network**, select the authenticated `/api/v1/events/stream` request. Check for `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-store, no-transform`, `X-Accel-Buffering: no`, and no `Content-Encoding`. In the browser console, a fresh stream ticket verifies that the heartbeat reaches the browser without waiting for a business event.

   ```js
   const { ticket } = await fetch('/api/v1/events/ticket', {
     method: 'POST',
   }).then((response) => response.json());
   const response = await fetch(
     '/api/v1/events/stream?ticket=' + encodeURIComponent(ticket),
     { signal: AbortSignal.timeout(35_000) },
   );
   const reader = response.body
     .pipeThrough(new TextDecoderStream())
     .getReader();
   try {
     let frames = '';
     while (!frames.includes(': heartbeat\n\n')) {
       const { value, done } = await reader.read();
       if (done) throw new Error('Stream closed before the heartbeat');
       frames += value;
     }
     console.log(frames); // ready and a heartbeat around 25 s later
   } finally {
     await reader.cancel();
   }
   ```

   The application negotiates gzip and Brotli. If you also enable Traefik compression, exclude `text/event-stream` and leave buffering disabled on the stream route. [Traefik compression](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/compress/)

## 5. Schedule PostgreSQL backups

1. Create a separate private R2 bucket such as `purchasing-db-backups` and a separate **Object Read & Write** token scoped to that bucket.
2. In Dokploy **Settings → S3 Destinations** (`/dashboard/settings/destinations`), add the bucket name, the R2 endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, and the backup token's key and secret. Test the connection and save. [Dokploy R2 destinations](https://docs.dokploy.com/docs/core/cloudflare-r2)
3. In the **PostgreSQL** service's **Backups** tab, add a backup. Choose the destination, database `purchasing`, prefix `postgres/production`, and schedule `0 2 * * *` for 02:00 daily in Dokploy's scheduler timezone. Set **Keep the latest** to `14` and enable the job.
4. Use **Run Manual Backup**. Confirm a successful job and a nonempty object under the prefix. Check again after the first scheduled run. Database dumps contain image keys. Keep the image bucket available independently of the database backups. [Dokploy database backups](https://docs.dokploy.com/docs/core/databases/backups)

## 6. Restore into a fresh database and verify

1. Pick a successful backup and record its timestamp and the app revision deployed at that time. Create a second PostgreSQL service from the same major version with its own persistent volume and empty database `purchasing_restore`. Keep the existing production database online while preparing the replacement.
2. Open **Backups → Restore** on the fresh PostgreSQL service. Select the backup destination, select the object under `postgres/production/`, and enter `purchasing_restore` as the target. Wait for a successful restore before starting the app against it. [Dokploy database restore](https://docs.dokploy.com/docs/core/databases/restore)
3. Open a terminal on the fresh PostgreSQL service to verify the restored tables and migrations. Use the restored service's configured database username.

   ```sh
   psql -U purchasing -d purchasing_restore -v ON_ERROR_STOP=1
   ```

   ```sql
   SELECT migration_name, finished_at FROM "_prisma_migrations"
     ORDER BY started_at DESC LIMIT 5;
   SELECT count(*) FROM "Request";
   SELECT count(*) FROM "CatalogItemImage";
   ```

   Compare the latest successful migration, table counts, and a few known records to the expected state at the backup time.

4. For a restore drill, run the backup-compatible application revision on a restricted verification origin with the restored database URL and the original audit signing secret. Use read-only checks on image data if sharing the production image bucket. Confirm health, sign-in, a few restored requests and images, and audit signature verification from the support console.
5. For a live recovery, stop the production application to prevent further writes to the old database. Set `DATABASE_URL` to the restored service's internal connection URL, deploy the compatible revision, and repeat the HTTPS checks on the primary domain. Repoint scheduled backups to the new service and run a manual backup. Retain the original database until recovery is confirmed.

## 7. Roll back an application deployment

1. Open **Deployments** and identify the last known-good revision. Check its compatibility with the current PostgreSQL schema before restarting it. When a schema change prevents the older app from running, restore a compatible backup to a fresh database using the steps above. Recovery uses the data captured at that backup's timestamp.
2. If you configured **Deployments → Rollback Settings** with a registry before the known-good deployment, click **Rollback** on that deployment and confirm. Otherwise, create a GitHub branch from the known-good commit, select that branch as the Dokploy source, and click **Deploy**. Keep the environment values and production domain in place. [Dokploy application rollbacks](https://docs.dokploy.com/docs/core/applications/rollbacks)
3. Check deployment logs, `/api/health`, sign-in, a deep link, and the live stream before resuming normal traffic.
