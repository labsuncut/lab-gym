# Launch steps: gym.fellowflow.ai

About 15 minutes. Do them in order. Cloudflare sometimes renames buttons; if a name differs a little, pick the closest one.

## 1. Make the database
1. Open dash.cloudflare.com and log in.
2. In the left menu click **Storage & databases**, then **D1 SQL database**.
3. Click **Create database**. Name it `lab-gym-db`. Click **Create**.
   (A database is where bookings, trial requests and messages are saved. The site builds its tables by itself the first time it runs.)

## 2. Put the site on Cloudflare
1. Left menu: **Workers & Pages**, then **Create** (or **Create application**).
2. Choose the **Pages** tab. If you only see Workers, look for the small link "Looking to deploy Pages? Get started".
3. Click **Import an existing Git repository** (or **Connect to Git**), choose **GitHub**, and allow Cloudflare to see the `lab-gym` repo (choose "Only select repositories", pick `lab-gym`).
4. Select `lab-gym`, click **Begin setup**, and fill in:
   - Project name: `lab-gym`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: leave empty
   - Build output directory: `public`
5. Click **Save and Deploy**. Wait until it says Success. Your site now has a free address like `lab-gym.pages.dev` (Cloudflare shows the exact one).

## 3. Connect the database to the site
1. Open the `lab-gym` project, then **Settings**, then **Bindings**.
2. Click **Add**, choose **D1 database**.
3. Variable name: `DB` (capital letters, exactly). Database: `lab-gym-db`. Click **Save**.

## 4. Set the staff password
1. Still in **Settings**, open **Variables and Secrets**, click **Add**.
2. Type: **Secret**. Variable name: `STAFF_PASSWORD`. Value: a strong password of 12+ characters. Save it in your password manager; it is how staff log in.
3. Click **Save**.

## 5. Redeploy so the changes apply
1. Open the **Deployments** tab.
2. On the newest deployment click the **⋯** menu, then **Retry deployment**.

## 6. Test on the free address
1. Open the `.pages.dev` address on your phone.
2. Book a class, send a free trial request and a message.
3. Open the same address with `/staff/` at the end, log in with the password, and check they all appear.

## 7. Connect gym.fellowflow.ai
In Cloudflare:
1. In the project, open **Custom domains**, click **Set up a custom domain**.
2. Type `gym.fellowflow.ai`, click **Continue**.
3. Cloudflare shows a record to add: type **CNAME**, name `gym`, target like `lab-gym.pages.dev`. Keep this page open.

In GoDaddy:
1. Log in at godaddy.com, open **My Products**, find `fellowflow.ai`, click **DNS** (or **Manage DNS**).
2. Click **Add New Record**.
3. Type: **CNAME**. Name: `gym`. Value: the target Cloudflare showed (e.g. `lab-gym.pages.dev`). TTL: 1 hour.
4. Click **Save**. Don't touch any other records; fellowflow.ai itself stays as it is.

Back in Cloudflare click **Check DNS records** (or **Activate domain**). It turns Active and adds the padlock (HTTPS) by itself. Usually minutes, sometimes up to a few hours.

Done: the site is at https://gym.fellowflow.ai and the staff dashboard at https://gym.fellowflow.ai/staff/

## 8. Optional: visitor numbers without cookies
Project, then **Metrics**, then turn on **Web Analytics**. It counts visits and pages without cookies and without a banner.

## How updates go live
Every change pushed to `main` on GitHub goes live by itself in about a minute. Changes on other branches get their own preview address (shown under Deployments), which is how you test before going live.
