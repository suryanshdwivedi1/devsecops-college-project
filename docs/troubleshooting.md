# Troubleshooting Guide

Real issues encountered building and operating this DevSecOps ECS pipeline,
with root causes and verified fixes.

---

## Table of Contents

1. [Terraform State](#1-terraform-state)
2. [AWS Credentials and OIDC](#2-aws-credentials-and-oidc)
3. [Terraform Apply Failures](#3-terraform-apply-failures)
4. [ECS Deployment Failures](#4-ecs-deployment-failures)
5. [Container Image Pull Failures](#5-container-image-pull-failures)
6. [Application Startup Failures](#6-application-startup-failures)
7. [Maven Build and Test Failures](#7-maven-build-and-test-failures)
8. [Trivy Vulnerability Scan](#8-trivy-vulnerability-scan)
9. [Teardown and Destroy](#9-teardown-and-destroy)

---

## 1. Terraform State

### S3 backend bucket does not exist

**Error:**
```
Error: error loading state: S3 bucket "..." does not exist.
```

**Cause:** The S3 state bucket must exist before `terraform init` can run.
Terraform cannot manage its own backend bucket.

**Fix:** Run the bootstrap script before the first `terraform init`:
```powershell
.\scripts\bootstrap_s3.ps1
terraform init
```

---

### Backend configuration changed — migration required

**Error:**
```
Error: Backend configuration changed
```

**Cause:** The S3 bucket name in `backend.tf` changed (e.g. after switching
AWS accounts or renaming the project).

**Fix:**
```powershell
terraform init -reconfigure   # fresh start, discards old state reference
# OR
terraform init -migrate-state # copies state from old bucket to new
```

Use `-migrate-state` when renaming the bucket in the same account.
Use `-reconfigure` when starting fresh in a new account with no prior state.

---

### S3 bucket not empty when deleting a versioned bucket

**Error:**
```
An error occurred (BucketNotEmpty) when calling the DeleteBucket operation
```

**Cause:** Versioning is enabled. `aws s3 rm --recursive` only deletes current
versions — it leaves all previous versions and delete markers behind.

**Fix:** Delete all versions and markers before deleting the bucket:
```powershell
$bucket = "your-bucket-name"

aws s3api list-object-versions --bucket $bucket `
  --query "Versions[*].{Key:Key,VersionId:VersionId}" --output json |
  ConvertFrom-Json | ForEach-Object {
    aws s3api delete-object --bucket $bucket --key $_.Key --version-id $_.VersionId | Out-Null
  }

aws s3api list-object-versions --bucket $bucket `
  --query "DeleteMarkers[*].{Key:Key,VersionId:VersionId}" --output json |
  ConvertFrom-Json | ForEach-Object {
    aws s3api delete-object --bucket $bucket --key $_.Key --version-id $_.VersionId | Out-Null
  }

aws s3api delete-bucket --bucket $bucket --region us-east-1
```

---

## 2. AWS Credentials and OIDC

### Pipeline cannot assume role — Not authorized to perform sts:AssumeRoleWithWebIdentity

**Error (GitHub Actions log):**
```
Error: Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

**Possible causes and fixes:**

**a) `github_org` placeholder not replaced in `terraform.tfvars`**

The OIDC trust policy was deployed with the literal string `YOUR_GITHUB_ORG`
instead of the real organisation name.

Fix: Set the correct org in `terraform.tfvars` and re-apply:
```hcl
github_org  = "YourActualOrg"
github_repo = "devsecops-ecs-pipeline"
```
```powershell
terraform apply -target="module.github_oidc.aws_iam_role.github_actions"
```

**b) GitHub sends numeric IDs in the `sub` claim**

GitHub appends numeric account/repo IDs to the `sub` claim in its OIDC token:
```
repo:OrgName@178105501/repo-name@1400452962:ref:refs/tags/dev/v1.0.0
```
If the trust policy only checks `repo:OrgName/repo-name:*` it will never match.

Fix: Update the trust policy condition to include the numeric IDs. The
`github_org_id` and `github_repo_id` variables in `terraform.tfvars` must
be set. Find your IDs by decoding the OIDC token in the pipeline — add a
debug step temporarily:
```yaml
- name: Debug OIDC token claims
  run: |
    ENCODED=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com")
    echo $ENCODED | jq -r '.value' | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .sub
```

**c) Stale OIDC provider thumbprint**

The OIDC provider in the AWS account has an old thumbprint that no longer
matches GitHub's certificate.

Fix:
```powershell
aws iam update-open-id-connect-provider-thumbprint `
  --open-id-connect-provider-arn "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" `
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

**d) OIDC provider already exists in a shared account**

The module tries to create the OIDC provider but another user already created
one for the same URL.

Fix: The module uses a `data` source lookup rather than a `resource` create.
If you see `EntityAlreadyExists`, ensure `modules/github-oidc/main.tf` uses
`data "aws_iam_openid_connect_provider"` not `resource "aws_iam_openid_connect_provider"`.

**e) Role ARN in GitHub Secrets is stale after renaming**

If the project was renamed (e.g. `github-actions` to `petclinic`), the IAM
role ARN changes. Update the `AWS_ROLE_TO_ASSUME` secret in GitHub to the
new ARN from `terraform output github_actions_role_arn`.

---

## 3. Terraform Apply Failures

### RDS — Cannot find MySQL engine version

**Error:**
```
Cannot find version 8.0.35 for mysql
```

**Cause:** Not all MySQL minor versions are available as selectable engine
versions in RDS. Minor upgrades are managed automatically by AWS.

**Fix:** Pin to an available version:
```powershell
aws rds describe-db-engine-versions --engine mysql --query "DBEngineVersions[*].EngineVersion"
```
Use the latest listed 8.0.x value in `variables.tf`.

---

### RDS — State disconnect during long provisioning

**Error:** Terraform loses its polling connection after ~10 minutes during
RDS creation, leaving a real resource untracked in state.

**Fix:** Re-sync state:
```powershell
terraform state rm aws_db_instance.main
terraform import aws_db_instance.main petclinic-db
terraform apply
```

---

### SSM Parameter lookup fails at plan time

**Error:**
```
error reading SSM Parameter: dial tcp: lookup ssm.us-east-1.amazonaws.com: no such host
```

**Cause:** DNS resolution failure on your local machine. Common causes:
VPN is active, DNS cache is stale, or corporate proxy is blocking AWS endpoints.

**Fix:**
```powershell
ipconfig /flushdns
# Disconnect VPN if active, then retry
terraform plan
```

---

### Non-ASCII characters in Terraform descriptions cause HTTP 400

**Cause:** Em dashes and box-drawing characters in `description` fields are
rejected by AWS APIs which only accept ASCII.

**Fix:** Replace non-ASCII characters with plain hyphens. Run the ASCII
cleanup script if needed, or check files with:
```powershell
Get-ChildItem -Recurse -Include "*.tf" | ForEach-Object {
  Select-String -Path $_.FullName -Pattern "[^\x00-\x7F]"
} | Select-Object Filename, LineNumber
```

---

## 4. ECS Deployment Failures

### Tasks fail with RESOURCE:MEMORY

**Error (ECS console):**
```
TaskFailedToStart: RESOURCE:MEMORY
```

**Cause:** The task definition requests more memory than is available on the
EC2 instances. A t3.small has 2 GiB total RAM but only ~1913 MiB registers
with the ECS agent (OS and agent overhead consume the rest). A 2048 MiB
task cannot fit.

**Fix:** Use t3.medium or larger instances (4 GiB RAM):
```hcl
# terraform/variables.tf
variable "ec2_instance_type" {
  default = "t3.medium"
}
```

A validation block on this variable prevents accidentally using undersized
instances. Do not set `ec2_instance_type = "t3.small"`.

---

### Pipeline deploy step hangs for 20+ minutes

**Cause:** ECS keeps retrying failed task placements indefinitely.
The `wait-for-service-stability: true` step in the pipeline waits forever.

**Fix:** The deployment circuit breaker is enabled in Terraform:
```hcl
deployment_circuit_breaker {
  enable   = true
  rollback = false
}
```
And `wait-for-minutes: 5` is set in the workflow deploy step. Together these
ensure the pipeline fails within 5 minutes rather than hanging. If you see
this on an existing service without the circuit breaker, update and re-apply.

---

### ECS service stuck draining before terraform destroy

**Cause:** `managed_termination_protection = "ENABLED"` on the capacity
provider prevents ASG instances from terminating, so tasks have nowhere to
drain to.

**Fix:** Always run the teardown script before `terraform destroy`:
```powershell
.\scripts\teardown.ps1
terraform destroy
```
The script scales the service to 0, removes instance protection, and scales
the ASG to 0 in the correct order.

---

### IGW fails to detach — DependencyViolation

**Error:**
```
detaching EC2 Internet Gateway: DependencyViolation: Network has some mapped public address(es)
```

**Cause:** ASG EC2 instances hold Elastic IPs. The IGW cannot detach until
those instances terminate. This is a cascading failure from not running
teardown before destroy.

**Fix:** Run `.\scripts\teardown.ps1` first to scale down the ASG and release
all EIPs before running `terraform destroy`.

---

## 5. Container Image Pull Failures

### CannotPullContainerError — i/o timeout on ECR layer download

**Error (ECS agent log at `/var/log/ecs/ecs-agent.log`):**
```
error pulling image configuration: download failed after attempts=6: dial tcp 16.15.x.x:443: i/o timeout
```

**Cause:** Two separate issues were found:

1. **S3 Gateway Endpoint not attached to all private route tables.** The
   endpoint was only associated with one of the two private route tables.
   Instances in the other subnet had no S3 route.

2. **ECS instance security group missing S3 prefix list egress rule.** The
   SG egress rule allowed port 443 only to `10.0.0.0/16` (VPC CIDR). S3
   gateway endpoint traffic goes to public S3 IPs (e.g. `16.15.x.x`) which
   are not in the VPC CIDR, so packets were silently dropped.

**Fix (Terraform):**
```hcl
# vpc.tf — attach S3 endpoint to ALL private route tables
resource "aws_vpc_endpoint" "s3" {
  route_table_ids = aws_route_table.private[*].id  # not just [0]
}

# vpc.tf — add S3 prefix list egress rule to ECS SG
resource "aws_security_group" "ecs_ec2" {
  egress {
    description     = "HTTPS to S3 via gateway endpoint prefix list"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [aws_vpc_endpoint.s3.prefix_list_id]
  }
}
```

**Diagnostic commands:**
```powershell
# Check which route tables the S3 endpoint is attached to
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids <s3-endpoint-id> `
  --query "VpcEndpoints[0].RouteTableIds"

# Check ECS SG egress rules
aws ec2 describe-security-groups --group-ids <ecs-sg-id> `
  --query "SecurityGroups[0].IpPermissionsEgress"

# Check ECS agent logs from the instance (requires SSM plugin)
aws ssm start-session --target <instance-id>
# Then inside the session:
sudo tail -100 /var/log/ecs/ecs-agent.log | grep -i "error\|pull\|ecr"
```

---

### CannotPullContainerError — manifest unknown

**Error:**
```
manifest unknown: Requested image not found
```

**Cause:** The task definition references an image tag that does not exist in
ECR. This happens on fresh deployments where the pipeline has not yet pushed
an image, or after switching AWS accounts where the ECR repository is empty.

**Fix:** Push a tag to trigger the pipeline, which will build and push the
image before deploying.

---

## 6. Application Startup Failures

### Unknown database 'petclinic'

**Error (CloudWatch Logs):**
```
Unknown database 'petclinic'
```

**Cause:** The RDS instance was created with `db_name = "accounts"` but the
JDBC URL in the task definition points to `/petclinic`. MySQL returns this
error after successful authentication when the named database does not exist.

**Fix:** Add `createDatabaseIfNotExist=true` to the JDBC URL so MySQL creates
the database automatically on first connection:
```
jdbc:mysql://host:3306/petclinic?createDatabaseIfNotExist=true&useSSL=true&...
```
This is set in `terraform/main.tf` in the `MYSQL_URL` environment variable.

---

### Secrets Manager secret not found

**Error:**
```
ResourceNotFoundException: Secrets Manager can't find the specified secret
```

**Cause:** The `dev/app/rds` secret was not created. This secret must be
created manually before the pipeline runs — it contains the DB credentials
that get injected into the container at runtime.

**Fix:**
```powershell
aws secretsmanager create-secret `
  --name "dev/app/rds" `
  --region "us-east-1" `
  --secret-string '{"RDS_USER":"admin","RDS_PASS":"your-password"}'
```
Use the same password set in `terraform.tfvars` as `db_password`.

---

### ALB returns 503 — no healthy targets

**Cause:** The container has not yet started or failed its health check.
The ALB health check polls `/actuator/health` every 30 seconds and requires
2 consecutive passing checks before marking a target healthy.

The JVM + Flyway migrations can take 60-90 seconds on first start. If the
health check grace period is too short, ECS kills the container before it
finishes starting.

**Fix:** Health check grace period is set to 90 seconds:
```hcl
health_check_grace_period_seconds = 90
```
And the container health check start period:
```hcl
startPeriod = 90
```
If you see 503 on first deploy, wait 2 minutes before concluding there is a
problem.

---

## 7. Maven Build and Test Failures

### Flyway runs against H2 and fails with MySQL DDL errors

**Error:**
```
Syntax error — "engine=InnoDB" not supported
```

**Cause:** `spring-boot-starter-flyway` on the classpath triggers Flyway
auto-configuration for all Spring contexts including H2 tests. The migration
files in `db/migration/` contain MySQL-specific DDL that H2 rejects.

**Fix:** Disable Flyway in the default (H2) profile:
```properties
# application.properties
spring.flyway.enabled=false
```
Flyway is only enabled in `application-mysql.properties` which activates
when `SPRING_PROFILES_ACTIVE=mysql` is set (production ECS containers only).

---

### MySqlIntegrationTests — Table does not exist

**Error:**
```
Table 'test.vets' doesn't exist
```

**Cause:** Testcontainers creates a MySQL container with database name `test`
by default, but Flyway is configured with `default-schema=petclinic`. The
test app connects to the wrong database.

**Fix:** Specify the database name when declaring the container:
```java
static MySQLContainer container = new MySQLContainer(DockerImageName.parse("mysql:9.7"))
    .withDatabaseName("petclinic")
    .withUsername("petclinic")
    .withPassword("petclinic");
```

---

### Spring Boot parent version not found in Maven Central

**Error:**
```
Non-resolvable parent POM: Could not find artifact org.springframework.boot:spring-boot-starter-parent:pom:4.1.2
```

**Cause:** Version `4.1.2` does not exist in Maven Central — it was an
unreleased milestone at the time.

**Fix:** Always verify the version exists before bumping:
```powershell
# Check Maven Central for available versions
Invoke-WebRequest "https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/" -UseBasicParsing |
  Select-Object -ExpandProperty Content | Select-String "4\.\d+\.\d+/"
```
Use the latest listed version (e.g. `4.1.1`). If patched dependencies are
needed but the Boot version doesn't include them yet, override via properties:
```xml
<tomcat.version>11.0.25</tomcat.version>
```

---

## 8. Trivy Vulnerability Scan

### Trivy action tag does not exist

**Error:**
```
Unable to resolve action aquasecurity/trivy-action@0.28.0
```

**Cause:** Trivy action tag naming changed over time — older releases used no
`v` prefix, newer ones use `v` prefix. Always verify tags exist at
https://github.com/aquasecurity/trivy-action/releases before pinning.

---

### Trivy action supply chain compromise (March 2026)

In March 2026, a threat actor used stolen credentials to force-push malicious
code to 76 of 77 version tags in `aquasecurity/trivy-action`, including the
`master` tag. Any workflow using `@master` should be treated as potentially
having run compromised code.

**Fix:** Pin to a verified post-incident release tag:
```yaml
uses: aquasecurity/trivy-action@v0.36.0
```
Never use `@master` for security tooling.

---

### Critical CVEs blocking the pipeline

**Cause:** Trivy found unpatched critical CVEs in the container image.
The scan is configured with `exit-code: 1` and `severity: CRITICAL` so any
unfixed critical CVE blocks the image push.

**Fix:** Bump the Spring Boot parent version — this pulls in updated Tomcat
and Spring Framework versions that patch the CVEs. Check which packages are
affected with the JSON report artifact uploaded by the pipeline.

---

## 9. Teardown and Destroy

### General teardown sequence

Always run teardown before destroy to avoid hung deployments:

```powershell
# Step 1 — drain ECS (scale to 0, remove instance protection, scale ASG to 0)
.\scripts\teardown.ps1

# Step 2 — destroy infrastructure
cd terraform
terraform destroy
```

If `terraform destroy` still times out on the ECS service, the service may
have tasks that need to be manually stopped first:
```powershell
.\scripts\drain_tasks.ps1
```

---

### ECR repository not empty during destroy

**Error:**
```
RepositoryNotEmptyException: The repository with name 'petclinic' is not empty
```

**Fix:** The ECR repository is configured with `force_delete = true` in
Terraform which allows destroy even when images exist. If you see this error,
verify `force_delete = true` is set in `terraform/ecr.tf`.
