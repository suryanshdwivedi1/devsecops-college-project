# Implementation Guide: Air-Gapped DevSecOps Pipeline on AWS

> **Quick-Start deployment manual** for the accompanying blog post.
> Estimated time: 30-45 minutes. Estimated monthly cost: $60-80.

---

## Prerequisites & Assumptions

### Required tools

| Tool | Minimum version | Install |
|---|---|---|
| Terraform | >= 1.11.0 | https://developer.hashicorp.com/terraform/install |
| AWS CLI | >= 2.x | https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html |
| Docker Desktop | >= 24.x | https://docs.docker.com/desktop/ |
| Java / Maven | JDK 17 + Maven 3.9 | https://adoptium.net |
| Git | any | https://git-scm.com |
| PowerShell | >= 7.x (Windows) | pre-installed on Windows 10/11 |

### AWS permissions required

Your AWS user or role needs at minimum:

- `AdministratorAccess` (for initial provisioning)
- Or a scoped policy covering: EC2, ECS, ECR, RDS, VPC, IAM, Secrets Manager, S3, KMS, CloudWatch, SSM, Auto Scaling

### Estimated AWS cost

| Resource | Spec | Est. monthly |
|---|---|---|
| EC2 (x2) | t3.medium | ~$30 |
| RDS | db.t3.micro, 20 GiB | ~$15 |
| ALB | 1 instance | ~$18 |
| ECR | < 1 GB storage | ~$0.10 |
| VPC Endpoints (x9) | Interface, 2 AZs | ~$14 |
| CloudWatch Logs | 30-day retention | ~$1 |
| **Total** | | **~$60-80/month** |

> ⚠️ **Always run `terraform destroy` when done.** The teardown script in Step 5
> handles ECS draining before destroy to avoid stuck deployments.

---

## Step 1 — Environment Setup & Authentication

### Clone the repository

```powershell
git clone https://github.com/EddieByte/devsecops-ecs-pipeline.git
cd devsecops-ecs-pipeline
```

### Authenticate with AWS

```powershell
# Option A — IAM user with access keys
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output (json)

# Option B — AWS SSO (recommended)
aws sso login --profile your-profile
$env:AWS_PROFILE = "your-profile"

# Verify authentication
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDA...",
    "Account": "997450571655",
    "Arn": "arn:aws:iam::997450571655:user/your-user"
}
```

---

## Step 2 — Customisation

All configuration lives in two files. Do not commit `terraform.tfvars` — it is
already in `.gitignore`.

### 2a. Create `terraform/terraform.tfvars`

```powershell
Copy-Item terraform\terraform.tfvars.example terraform\terraform.tfvars
```

> ⚠️ If no `.tfvars.example` exists, create the file manually:

```hcl
# terraform/terraform.tfvars

# Required — your GitHub org/user name and repository for OIDC scoping
github_org      = "YourGitHubOrgOrUsername"
github_repo     = "devsecops-ecs-pipeline"

# Required — numeric IDs from your GitHub OIDC token sub claim
# Find these by running the debug step in the workflow (see Step 3b)
github_org_id   = "178105501"
github_repo_id  = "1400452962"

# Required — RDS master password (min 8 chars, store safely)
db_password     = "YourStrongPassword123!"

# Optional overrides (defaults shown)
# aws_region      = "us-east-1"
# ec2_instance_type = "t3.medium"   # Do not use t3.small — task needs 2048 MiB
```

> ⚠️ **Finding your numeric GitHub IDs:**
> Add this temporary debug step to your workflow's `DEPLOY` job, push once,
> read the `sub` field from the log output, then remove the step:
> ```yaml
> - name: Debug OIDC sub claim
>   run: |
>     curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
>       "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | \
>       jq -r '.value' | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '{sub,actor}'
> ```
> The `sub` field format is:
> `repo:OrgName@<org_id>/repo-name@<repo_id>:ref:refs/tags/dev/v1.0.0`

### 2b. Configure GitHub Secrets

Go to your repository → **Settings → Secrets and variables → Actions** and add:

| Secret | Value | Where to get it |
|---|---|---|
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT_ID:role/petclinic-github-actions-role` | `terraform output github_actions_role_arn` after apply |
| `AWS_REGION` | `us-east-1` | your chosen region |
| `REGISTRY` | `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com` | `terraform output ecr_repository_url` (hostname only, no `/petclinic`) |
| `SONAR_TOKEN` | your token | sonarcloud.io → My Account → Security |
| `SONAR_PROJECT_KEY` | your key | sonarcloud.io → Project → Project Information |
| `SONAR_ORGANIZATION` | your org | sonarcloud.io → Organisation |

> ⚠️ `AWS_ROLE_TO_ASSUME` cannot be set until after `terraform apply` completes
> in Step 3. Come back and set it after apply.

---

## Step 3 — Provisioning

### 3a. Bootstrap the S3 state bucket (one-time, per AWS account)

Terraform cannot manage its own state backend. Run this script once before
`terraform init`:

```powershell
.\scripts\bootstrap_s3.ps1
```

Expected output:
```
Account : 997450571655
Bucket  : petclinic-tfstate-997450571655
Creating S3 bucket...
Enabling versioning...
Enabling encryption...
Blocking public access...
Adding lifecycle rule for old version expiry...
Bucket created successfully.
backend.tf is aligned with bucket name.
```

> ⚠️ The bucket name is derived from your AWS account ID automatically.
> `backend.tf` must reference the same bucket name. The script validates this.

### 3b. Initialise and apply Terraform

```powershell
cd terraform
terraform init
terraform plan    # review — expect ~57 resources to create
terraform apply   # type 'yes' when prompted
```

Apply takes approximately **8-12 minutes** — RDS provisioning dominates (~7 min).
All other resources complete in under 2 minutes.

Expected final output (key values):
```
alb_dns_name            = "petclinic-alb-XXXXXXXXXX.us-east-1.elb.amazonaws.com"
ecr_repository_url      = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/petclinic"
ecs_cluster_name        = "petclinic-cluster"
github_actions_role_arn = "arn:aws:iam::ACCOUNT_ID:role/petclinic-github-actions-role"
rds_address             = "petclinic-db.XXXXXXXX.us-east-1.rds.amazonaws.com"
```

### 3c. Create the RDS credentials secret

> ⚠️ This step is manual and required. The pipeline cannot run without it.
> Use the same password set in `terraform.tfvars`.

```powershell
aws secretsmanager create-secret `
  --name "dev/app/rds" `
  --region "us-east-1" `
  --secret-string "{""RDS_USER"":""admin"",""RDS_PASS"":""YourStrongPassword123!""}"
```

### 3d. Update GitHub Secrets

Now that Terraform has run, go back to Step 2b and set:
- `AWS_ROLE_TO_ASSUME` → value from `terraform output github_actions_role_arn`
- `REGISTRY` → ECR registry hostname from `terraform output ecr_repository_url`
  (strip the `/petclinic` suffix — just the `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com` part)

### 3e. Trigger the pipeline

```powershell
cd ..   # back to project root
git tag dev/v1.0.0
git push origin dev
git push origin dev/v1.0.0
```

The pipeline runs 3 sequential jobs:

```
TEST (mvn clean test + SonarCloud)
  └── BUILD_AND_PUBLISH (docker build + Trivy scan + ECR push)
        └── DEPLOY (ECS task def update + rolling deploy)
```

Total pipeline duration: approximately **8-12 minutes** on a clean run.

---

## Step 4 — Verification

### 4a. Check the pipeline

Go to your repository → **Actions** → find the `dev/v1.0.0` run.
All 3 jobs should show green checkmarks.

### 4b. Check ECS service health

```powershell
# Both targets should show "healthy"
aws elbv2 describe-target-health `
  --target-group-arn $(aws elbv2 describe-target-groups `
    --names petclinic-tg `
    --query "TargetGroups[0].TargetGroupArn" `
    --output text) `
  --query "TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State}" `
  --output table
```

Expected:
```
+----------------------+---------+
|  i-0abc123def456789  | healthy |
|  i-0xyz987fed654321  | healthy |
+----------------------+---------+
```

### 4c. Verify the application is running

```powershell
# Get the ALB DNS name
$alb = terraform -chdir=terraform output -raw alb_dns_name

# Hit the health endpoint
Invoke-WebRequest -Uri "http://$alb/actuator/health" | Select-Object -ExpandProperty Content
```

Expected: `{"status":"UP"}`

Then open in your browser:
```
http://<alb_dns_name>/
```

You should see the Spring PetClinic UI — owners, pets, and vets listed.

### 4d. Verify Flyway ran migrations

```powershell
# Check CloudWatch for Flyway startup log lines
$stream = aws logs describe-log-streams `
  --log-group-name "/ecs/petclinic-cluster" `
  --order-by LastEventTime --descending `
  --query "logStreams[0].logStreamName" --output text

aws logs get-log-events `
  --log-group-name "/ecs/petclinic-cluster" `
  --log-stream-name $stream `
  --query "events[*].message" --output text | `
  Select-String -Pattern "flyway|Flyway|migration"
```

Expected lines:
```
Successfully validated 2 migrations
Migrating schema `petclinic` to version "1 - create schema"
Migrating schema `petclinic` to version "2 - seed data"
Successfully applied 2 migrations to schema `petclinic`
```

### 4e. Verify air-gap (no internet egress from private subnet)

Connect to an ECS instance via SSM (no SSH needed):

```powershell
$instance = aws ec2 describe-instances `
  --filters "Name=tag:aws:autoscaling:groupName,Values=petclinic-ecs-asg" `
            "Name=instance-state-name,Values=running" `
  --query "Reservations[0].Instances[0].InstanceId" --output text

aws ssm start-session --target $instance
```

Inside the session:
```bash
# This should time out — no internet route from private subnet
curl --max-time 5 https://google.com
# Expected: curl: (28) Connection timed out

# This should succeed — ECR reachable via PrivateLink
curl -s https://997450571655.dkr.ecr.us-east-1.amazonaws.com/v2/ -o /dev/null -w "%{http_code}"
# Expected: 401 (auth required — reachable but not authenticated)
```

---

## Step 5 — Teardown & Cleanup

> ⚠️ Always run teardown before destroy. Skipping this causes 20-minute
> timeouts due to ECS managed termination protection.

### 5a. Drain ECS and scale down

```powershell
cd D:\path\to\devsecops-ecs-pipeline
.\scripts\teardown.ps1
```

The script:
1. Scales the ECS service to 0 tasks
2. Removes scale-in protection from all ASG instances
3. Scales the ASG to 0 instances
4. Waits for EC2 instances to terminate

### 5b. Destroy all infrastructure

```powershell
cd terraform
terraform destroy
# type 'yes' when prompted
```

Expected duration: 8-12 minutes (RDS deletion dominates).

### 5c. Delete the RDS credentials secret

```powershell
aws secretsmanager delete-secret `
  --secret-id "dev/app/rds" `
  --force-delete-without-recovery `
  --region "us-east-1"
```

### 5d. Delete the S3 state bucket (optional)

Only if you are done with the project entirely:

```powershell
$bucket = "petclinic-tfstate-$(aws sts get-caller-identity --query Account --output text)"

# Delete all versions (versioning is enabled)
aws s3api list-object-versions --bucket $bucket `
  --query "Versions[*].{Key:Key,VersionId:VersionId}" --output json | `
  ConvertFrom-Json | ForEach-Object {
    aws s3api delete-object --bucket $bucket --key $_.Key --version-id $_.VersionId | Out-Null
  }

aws s3api list-object-versions --bucket $bucket `
  --query "DeleteMarkers[*].{Key:Key,VersionId:VersionId}" --output json | `
  ConvertFrom-Json | ForEach-Object {
    aws s3api delete-object --bucket $bucket --key $_.Key --version-id $_.VersionId | Out-Null
  }

aws s3api delete-bucket --bucket $bucket --region us-east-1
Write-Host "Bucket deleted."
```

---

## Troubleshooting

For detailed troubleshooting of every issue encountered during this build,
see [docs/troubleshooting.md](./troubleshooting.md).

Quick reference for the most common issues:

| Symptom | Likely cause | Quick fix |
|---|---|---|
| `RESOURCE:MEMORY` in ECS | t3.small used — task needs 2048 MiB | Use t3.medium minimum |
| `i/o timeout` on ECR pull | S3 prefix list missing from ECS SG egress | Add prefix list egress rule to ECS SG |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Wrong org/repo IDs in OIDC trust policy | Set `github_org_id` and `github_repo_id` in `terraform.tfvars` |
| `Unknown database 'petclinic'` | RDS created with `db_name = "accounts"` | Add `createDatabaseIfNotExist=true` to JDBC URL |
| Pipeline hangs > 5 minutes | Circuit breaker not enabled | Ensure `deployment_circuit_breaker { enable = true }` in Terraform |
| `ResourceNotFoundException` on secrets | `dev/app/rds` secret not created | Run Step 3c manually |
