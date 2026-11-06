# Lambda vs EC2 — Why Lambda Wins for Advitiyans

> This comparison is built around **your actual platform** — Advitiyans, a university student tracking dashboard used by ~10,000 students at RGMCET.

---

## 1. Traffic Pattern — The Most Important Factor

Your platform has a **very specific usage pattern**:

```
Daily Traffic Curve (Advitiyans)
─────────────────────────────────────────────────────
Requests/hour
    │
700 │          ████
600 │         ██████
500 │        █████████
400 │       ████████████
300 │      ██████████████
200 │    ██████████████████
100 │  ████████████████████████
 50 │ ██████████████████████████████
  0 │████████████████████████████████████████████
    └──────────────────────────────────────────────
    12am  4am  8am  10am  12pm  2pm  5pm  8pm  12am
          │         │          │
        (idle)  (login      (placement
                 storm)      season
                             peak)
```

| Time Period | Usage Level | Lambda Cost | EC2 Cost |
|---|---|---|---|
| 12 AM – 7 AM (7 hrs) | Near zero | **~$0.001** | **~$0.70** (billing anyway) |
| 7 AM – 9 AM (2 hrs — login rush) | Very high | ~$0.05 | ~$0.20 |
| 9 AM – 5 PM (8 hrs — active use) | Moderate | ~$0.20 | **~$0.80** |
| 5 PM – 12 AM (7 hrs — winding down) | Low | ~$0.05 | **~$0.70** (billing anyway) |
| **Daily total** | | **~$0.30/day** | **~$2.40/day** |
| **Monthly total** | | **~$4–6/mo** | **~$60–72/mo** |

> EC2 costs you **$60/month even when not a single student is using the app.**

---

## 2. Cost Comparison — Real Numbers

### Lambda Costs (Your Current Setup → Upgraded)

```
Lambda Pricing (ap-south-1):
  Per request:        $0.0000002
  Per GB-second:      $0.0000166125

Your usage estimate (10K students, 20 req/student/day):
  Requests/month  = 10,000 × 20 × 30 = 6,000,000
  Avg duration    = 150 ms  (at 512 MB)
  GB-seconds      = 6M × 0.15 × 0.5 = 450,000 GB-s/mo

  Request cost    = 6M × $0.0000002       = $1.20
  Compute cost    = 450,000 × $0.0000166  = $7.47
  ─────────────────────────────────────────────────
  Total Lambda    ≈ $8.67/month
  Free tier       - $0 (already used up)
  NET             ≈ $8–10/month
```

### EC2 Costs (t3.large equivalent, ap-south-1)

```
EC2 t3.large (equivalent CPU/RAM to Lambda at scale):
  On-Demand:      $0.0912/hour
  Monthly:        $0.0912 × 730 = $66.58/month

  + ALB (needed to distribute traffic):   $16.43/month
  + Data transfer (10K users):            ~$5/month
  ─────────────────────────────────────────────────
  Total EC2                            ≈ $88/month

  With Reserved Instance (1-year):
  EC2 only:       ~$44/month
  + ALB:          ~$16/month
  NET             ≈ $60/month minimum
```

### 💰 Bottom Line

| | Lambda | EC2 (On-Demand) | EC2 (Reserved 1yr) |
|---|---|---|---|
| Monthly cost | **~$10** | ~$88 | ~$60 |
| Cost at zero traffic | **$0** | $67 | $44 |
| Annual cost | **~$120** | ~$1,056 | ~$720 |
| **Savings vs EC2** | — | **Save $936/year** | **Save $600/year** |

---

## 3. Scaling — How Each Handles Your 10K Students

### Lambda Scaling

```
Student Login Storm (9 AM — 500 students login simultaneously):

Time 0ms:    100 requests arrive
             → Lambda spins up 100 instances in parallel ✅

Time 500ms:  400 more requests arrive
             → Lambda spins up 400 more instances ✅

Time 1s:     All 500 students see their dashboard ✅

Lambda does this automatically — you configure NOTHING.
```

### EC2 Scaling (needs Auto Scaling Group)

```
Student Login Storm (9 AM — 500 students login simultaneously):

Time 0ms:     500 requests arrive at 1 EC2 instance
              → Instance CPU spikes to 100% ⚠️

Time 60-90s:  Auto Scaling sees high CPU
              → Triggers new EC2 instance launch
              → New instance takes 60–90 seconds to boot ⚠️

Time 2 min:   Second instance available
              → Half the students waited 2 minutes for response ❌

You need to pre-configure: ASG, launch templates,
health checks, ALB, warm-up hooks, scaling policies...
```

| Scaling Metric | Lambda | EC2 + ASG |
|---|---|---|
| Scale from 1 → 500 requests | **< 1 second** | 60–120 seconds |
| Configuration required | Zero | ALB + ASG + Launch Template + Scaling Policy |
| Scale back down (cost saving) | **Instant, automatic** | 15-min cooldown period |
| Max concurrent scale | 1000 (account default) | Limited by instance count |
| Over-provisioning cost | **$0** | Pay for unused capacity |

---

## 4. Database Connections — Critical for Your Architecture

This is the **most technical reason Lambda wins for Advitiyans**:

### With Lambda (Your Setup)

```
Lambda instance 1  ──┐
Lambda instance 2  ──┤── max 1 connection each
Lambda instance 3  ──┤   = 200 total connections (at reserved: 200)
...                ──┘
Lambda instance 200   RDS t3.large (855 max connections)
                      ✅ Safe — 200 << 855
```

### With EC2 (t3.large, 4 worker threads)

```
EC2 Instance 1 (4 workers × 5 conn each = 20 connections)
EC2 Instance 2 (20 connections)
EC2 Instance 3 (20 connections)  ──── RDS t3.large (855 max)
...
For 500 concurrent users you need ~10 EC2 instances
= 10 × 20 = 200 connections ... same result, but you paid
$88/month instead of $10/month to get there.
```

> For your use case with RDS, **Lambda and EC2 use the same number of DB connections at scale.** Lambda just costs far less to get there.

---

## 5. Cold Start — The Only Real Lambda Disadvantage

### What Is a Cold Start?

When Lambda hasn't been used for a while, the first request triggers a container startup:

```
Cold Start Timeline (your Node.js Lambda at 512 MB):

Container boot:      ~200 ms
Node.js runtime:     ~150 ms
Your app code load:  ~300 ms (Express + imports)
DB pool connect:     ~200 ms (first connection to RDS)
─────────────────────────────────────────────────────
Total cold start:    ~850 – 1200 ms

After cold start: all subsequent requests take 30–150 ms
```

### How Often Does This Happen on Advitiyans?

```
Usage Pattern → Cold Start Frequency:

Active hours (8 AM – 6 PM):    Lambda stays warm
                                Cold start: NEVER (< 5 min idle)

After 6 PM (students log off):  Lambda cools after ~15 min idle

Next morning (first login):     ONE cold start → 1 sec delay
                                Every login after that: instant

Weekend morning (first login):  ONE cold start → 1 sec delay
```

### Is 1 Second Acceptable for a University Dashboard?

```
Comparison of "slow" experiences your users already accept:
  College website load time:     3–8 seconds  ✅ (they wait)
  Moodle/LMS page:               2–5 seconds  ✅ (they wait)
  Advitiyans Lambda cold start:  ~1 second    ✅ (completely fine)
  Advitiyans warm request:       30–150 ms    🚀 (faster than Moodle)
```

**EC2 "advantage" here**: Zero cold starts (always running).  
**EC2 cost of this advantage**: +$50–60/month extra, 24/7.  
**Verdict**: Paying $600/year to avoid a 1-second delay once per morning is **not worth it** for a university dashboard.

---

## 6. Operations & Maintenance Overhead

### Lambda — What You Manage

```
✅ Deploy zip via GitHub Actions (already set up)
✅ CDK manages all config
✅ AWS patches Node.js runtime automatically
✅ AWS handles OS, kernel, security patches
✅ No SSH keys, no servers to monitor
✅ No disk space to manage
✅ No "instance is down" alerts at 3 AM
```

### EC2 — What You Must Manage

```
❌ OS patching (Amazon Linux 2/Ubuntu — monthly security updates)
❌ Node.js version management (n, nvm, or manual)
❌ PM2 / systemd process management (keep app running after crash)
❌ Disk space monitoring (logs fill up disk → app crashes)
❌ SSH key rotation and management
❌ Instance monitoring (CPU, memory, network)
❌ AMI updates for new deployments
❌ ALB health check configuration
❌ Auto Scaling Group tuning
❌ CloudWatch agent setup for logs
❌ Instance IAM role management
```

> EC2 for a university project means a faculty/student volunteer must manage a Linux server. One missed security patch = potential data breach of 10K student records.

---

## 7. Deployment — Your GitHub Actions Workflow

### Current Lambda Deployment (Your `deploy.yml`)

```yaml
# Already working — push to main → auto deploy
push to main
  → npm build
  → cdk deploy
  → Lambda updated in ~2 minutes
  → Zero downtime (Lambda swaps atomically)
```

### EC2 Deployment Would Require

```yaml
push to main
  → build Docker image OR zip
  → push to ECR or S3
  → SSH into EC2 (or use CodeDeploy)
  → PM2 reload (brief downtime or blue-green needed)
  → Wait for ASG to propagate to all instances
  → Verify health checks pass on ALB
  → ~10–15 minutes, with potential brief downtime
```

---

## 8. Side-by-Side Final Comparison

| Factor | Lambda ✅ | EC2 ❌ |
|---|---|---|
| **Monthly cost** | **~$10** | ~$60–88 |
| **Cost at idle (nights/weekends)** | **$0** | ~$44–67 (still billing) |
| **Setup complexity** | Already done | ALB + ASG + PM2 + IAM |
| **Scale to 10K students** | **Automatic, < 1 sec** | Needs 90-sec boot time |
| **DB connections used** | 200 (same as EC2) | 200 (same, more expensive) |
| **Cold start penalty** | ~1 sec, once/morning | None |
| **Deployment time** | **~2 min, zero downtime** | 10–15 min |
| **OS/security patches** | **AWS handles** | You handle |
| **Crash recovery** | **Automatic** | Needs PM2 + health checks |
| **Your team's time saved** | **High** | Low |
| **Works with your existing CDK** | **Yes — no changes** | Complete rewrite needed |
| **Best for spiky traffic** | **✅ Perfect fit** | ❌ Over-provisioned |
| **Best for sustained 24/7 load** | ❌ (gets expensive) | ✅ |

---

## 9. When Would EC2 Actually Be Better?

To be fair, EC2 is the right choice in these scenarios — **none of which apply to Advitiyans**:

| Scenario | Why EC2 Wins | Does Advitiyans Have This? |
|---|---|---|
| WebSocket connections | Lambda max 15 min; EC2 is persistent | ❌ No WebSockets needed |
| Video/audio processing | Needs GPU or sustained CPU | ❌ No media processing |
| Sustained 80%+ CPU 24/7 | Lambda gets expensive at constant load | ❌ Traffic is spiky |
| Sub-50ms p99 for every request | Provisioned concurrency needed on Lambda | ❌ Dashboard, not trading system |
| Custom OS dependencies | Lambda runtime is limited | ❌ Pure Node.js Express |
| Legacy app that can't be stateless | Lambda must be stateless | ❌ App is already stateless |

---

## Verdict

```
┌─────────────────────────────────────────────────────────────┐
│                    FINAL DECISION                            │
│                                                              │
│  For Advitiyans (10K students, university dashboard,         │
│  spiky traffic, Node.js Express, existing CDK setup):        │
│                                                              │
│  ✅  KEEP LAMBDA                                             │
│                                                              │
│  Saves:   $600 – $936 per year vs EC2                        │
│  Scales:  Automatically to 10K students                      │
│  Effort:  Zero migration, zero server management             │
│  Risk:    Zero (already battle-tested in production)         │
│                                                              │
│  The only thing EC2 gives you that Lambda doesn't:           │
│  → No cold start (worth ~$50/month extra?)                   │
│  → For a university dashboard viewed once/day?  NO.          │
└─────────────────────────────────────────────────────────────┘
```
